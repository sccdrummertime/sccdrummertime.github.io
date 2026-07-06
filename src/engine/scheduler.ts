import type { AccentState, MetronomeConfig, Position } from './types';
import { defaultConfig } from './types';
import { advancePosition, clickInterval, incrementalBpm, isMuted } from './patterns';
import { scheduleClick } from './sounds';

export interface BeatEvent {
  time: number; // AudioContext time the click sounds
  pos: Position;
  accent: AccentState;
  isSub: boolean;
  muted: boolean;
  bpm: number; // effective bpm at this click (incremental mode may differ from base)
}

const LOOKAHEAD_S = 0.12; // how far ahead clicks are scheduled on the audio clock
const TICK_MS = 25; // how often the worker asks us to top up the schedule

/** iOS mutes Web Audio when the ring/silent switch is on silent — unless the
 *  page is also playing an HTML media element, which reclassifies it as music
 *  playback (like Spotify) that the switch doesn't mute. We loop this tiny
 *  silent WAV while the metronome runs so clicks stay audible on silent,
 *  matching how native metronome apps behave. Harmless on other platforms. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/** The timer lives in a Web Worker because main-thread timers are throttled in
 *  background tabs; actual click timing always comes from the AudioContext clock,
 *  the worker only wakes us to top up the schedule (lookahead pattern). */
const WORKER_SRC = `
let id = null;
onmessage = (e) => {
  if (e.data.cmd === 'start') { clearInterval(id); id = setInterval(() => postMessage('tick'), e.data.interval); }
  else if (e.data.cmd === 'stop') { clearInterval(id); id = null; }
};
`;

export class Metronome {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private worker: Worker | null = null;
  private silentMedia: HTMLAudioElement | null = null;
  private config: MetronomeConfig = defaultConfig();
  private pos: Position = { bar: 0, beat: 0, sub: 0 };
  private nextNoteTime = 0;
  private startTime = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: BeatEvent[] = [];
  private raf = 0;
  running = false;

  /** Fires on the animation frame closest to each audible click (for visual cues). */
  onBeat: ((e: BeatEvent) => void) | null = null;
  onStateChange: ((running: boolean) => void) | null = null;

  getConfig(): MetronomeConfig {
    return this.config;
  }

  /** Live-updatable: takes effect from the next scheduled click. */
  setConfig(patch: Partial<MetronomeConfig>): void {
    this.config = { ...this.config, ...patch };
    if (this.master && patch.volume !== undefined) {
      this.master.gain.setTargetAtTime(patch.volume, this.ctx!.currentTime, 0.02);
    }
    // a pending auto-stop is stale the moment auto-stop settings change — cancel it
    // and let the next scheduleAhead() re-evaluate against the new config
    if (patch.autoStop !== undefined && this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }

  private ensureAudio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.config.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async start(): Promise<void> {
    if (this.running) return;
    const ctx = this.ensureAudio();
    if (ctx.state === 'suspended') await ctx.resume();
    // keep iOS from muting clicks when the ring/silent switch is on silent
    if (typeof Audio !== 'undefined') {
      if (!this.silentMedia) {
        this.silentMedia = new Audio(SILENT_WAV);
        this.silentMedia.loop = true;
        this.silentMedia.setAttribute('playsinline', '');
      }
      this.silentMedia.play().catch(() => {
        // autoplay refusal just means no silent-switch override — clicks still work
      });
    }
    this.pos = { bar: 0, beat: 0, sub: 0 };
    this.nextNoteTime = ctx.currentTime + 0.06;
    this.startTime = this.nextNoteTime;
    this.queue = [];
    this.running = true;
    if (!this.worker) {
      this.worker = new Worker(
        URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })),
      );
      this.worker.onmessage = () => this.scheduleAhead();
    }
    this.worker.postMessage({ cmd: 'start', interval: TICK_MS });
    this.scheduleAhead();
    this.startVisualLoop();
    this.onStateChange?.(true);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.silentMedia?.pause();
    this.worker?.postMessage({ cmd: 'stop' });
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    cancelAnimationFrame(this.raf);
    this.queue = [];
    this.onStateChange?.(false);
  }

  toggle(): void {
    this.running ? this.stop() : void this.start();
  }

  /** Elapsed seconds since start (0 when stopped). */
  elapsed(): number {
    return this.running && this.ctx ? Math.max(0, this.ctx.currentTime - this.startTime) : 0;
  }

  private scheduleAhead(): void {
    if (!this.running || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const cfg = this.config;
    // the rAF visual loop is paused while the tab is hidden — prune stale visual
    // events here (this runs off the worker) so the queue can't grow unbounded
    while (this.queue.length && this.queue[0].time < ctx.currentTime - 0.1) {
      this.queue.shift();
    }
    while (this.nextNoteTime < ctx.currentTime + LOOKAHEAD_S) {
      // auto-stop checks happen at the click that would cross the limit
      if (cfg.autoStop.enabled) {
        const barsDone = cfg.autoStop.mode === 'bars' && this.pos.bar >= cfg.autoStop.bars;
        const timeDone =
          cfg.autoStop.mode === 'seconds' &&
          this.nextNoteTime - this.startTime >= cfg.autoStop.seconds;
        if (barsDone || timeDone) {
          this.scheduleStopAt(this.nextNoteTime);
          return;
        }
      }
      const bpm = incrementalBpm(cfg.incremental, cfg.bpm, this.pos.bar);
      const accent: AccentState = cfg.accents[this.pos.beat] ?? 'normal';
      const isSub = this.pos.sub > 0;
      const muted = isMuted(cfg.trainer, this.pos);
      if (!muted) {
        scheduleClick(ctx, this.master, cfg.sound, accent, isSub, this.nextNoteTime);
      }
      this.queue.push({ time: this.nextNoteTime, pos: this.pos, accent, isSub, muted, bpm });
      this.nextNoteTime += clickInterval(bpm, cfg.subdivision);
      this.pos = advancePosition(this.pos, cfg.signature, cfg.subdivision);
    }
  }

  private scheduleStopAt(time: number): void {
    if (this.stopTimer || !this.ctx) return;
    const ms = Math.max(0, (time - this.ctx.currentTime) * 1000);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.stop();
    }, ms);
  }

  private startVisualLoop(): void {
    const loop = () => {
      if (!this.running || !this.ctx) return;
      const now = this.ctx.currentTime;
      while (this.queue.length && this.queue[0].time <= now) {
        const e = this.queue.shift()!;
        // Skip visual events that are stale by more than one frame (tab was hidden)
        if (now - e.time < 0.05) this.onBeat?.(e);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
