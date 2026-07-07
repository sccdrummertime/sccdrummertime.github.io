import type { AccentState, MetronomeConfig, Position } from './types';
import { defaultConfig } from './types';
import { advancePosition, clickInterval, incrementalBpm, isMuted, isPastDue } from './patterns';
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
/** Lead-in before beat 1. Longer than the lookahead on purpose: at Start the
 *  hardware is still spinning up and (on iOS) the silent loop is flipping the
 *  audio session to "playback" — a click rendered inside that window gets
 *  mangled. 150ms is imperceptible to the user but clears the transition. */
const START_DELAY_S = 0.15;

/** iOS puts Web Audio in the "ambient" session, which the ring/silent switch
 *  mutes; HTML media playback ("playback" session) is never muted. Streaming
 *  the clicks *through* a media element beats the switch but glitches audibly
 *  (start-up buffer warm-up, intermittent underrun bursts, and pitch bend from
 *  the element's clock-drift correction). So instead: clicks always go straight
 *  to the context destination, and on iOS a genuinely silent AAC file loops in
 *  an <audio> element alongside — that alone flips the session to "playback"
 *  and unmutes Web Audio (a data-URI WAV does NOT work here; iOS refuses to
 *  play it, which is why the earlier attempt failed). If the loop can't play,
 *  we fall back to the streaming route: glitchy beats muted. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS ≥13 reports itself as Macintosh but has a touchscreen
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

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
  private silentLoop: HTMLAudioElement | null = null; // iOS silent-switch override
  private mediaOut: HTMLAudioElement | null = null; // fallback streaming route
  private config: MetronomeConfig = defaultConfig();
  private pos: Position = { bar: 0, beat: 0, sub: 0 };
  private nextNoteTime = 0;
  private startTime = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: BeatEvent[] = [];
  private raf = 0;
  private reviveInstalled = false;
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

  /** iOS suspends the audio session on screen lock and leaves the context
   *  "interrupted" on unlock — nothing un-mutes automatically. Whenever the page
   *  comes back (or the user touches anywhere) while we're supposed to be
   *  running, resume the context, restart the media route, and continue on the
   *  next beat. */
  private installReviveHandlers(): void {
    if (this.reviveInstalled || typeof document === 'undefined') return;
    this.reviveInstalled = true;
    const revive = () => {
      if (this.running) void this.reviveAudio();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') revive();
    });
    window.addEventListener('focus', revive);
    window.addEventListener('pageshow', revive);
    // resume() outside a gesture can be refused — any tap is also a chance to revive
    document.addEventListener('pointerdown', () => {
      if (this.running && this.ctx && this.ctx.state !== 'running') revive();
    });
  }

  /** resume() on a wedged iOS context can stay pending FOREVER (the audio
   *  session was taken by another app and never handed back to this page's
   *  context). Never await it unbounded — race a deadline and report whether
   *  the context actually came back. */
  private async tryResume(ctx: AudioContext, timeoutMs = 400): Promise<boolean> {
    if (ctx.state === 'running') return true;
    await Promise.race([
      ctx.resume().catch(() => {}),
      new Promise<void>((res) => setTimeout(res, timeoutMs)),
    ]);
    return (ctx.state as string) === 'running';
  }

  /** Discard a wedged context entirely; ensureAudio() will build a fresh one
   *  (a context created inside a user gesture always starts). */
  private teardownAudio(): void {
    try {
      this.master?.disconnect();
    } catch {
      // already disconnected
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.mediaOut = null; // was bound to the dead context
    this.silentLoop?.pause();
    this.silentLoop = null;
  }

  /** Get a context that is genuinely running, rebuilding from scratch if the
   *  current one is wedged. Returns null only when even a fresh context can't
   *  start (no user gesture available — the pointerdown revive will retry). */
  private async ensureRunningContext(): Promise<AudioContext | null> {
    let ctx = this.ensureAudio();
    if (await this.tryResume(ctx)) return ctx;
    this.teardownAudio();
    ctx = this.ensureAudio();
    this.silentLoop?.play().catch(() => this.useStreamingFallback());
    if (await this.tryResume(ctx)) return ctx;
    return null;
  }

  private async reviveAudio(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state !== 'running') {
      if (!(await this.tryResume(ctx))) {
        // wedged — rebuild everything and restart the beat if we were playing
        const wasRunning = this.running;
        if (wasRunning) this.stop();
        this.teardownAudio();
        if (wasRunning) await this.start();
        return;
      }
    }
    if (this.silentLoop && this.silentLoop.paused) {
      this.silentLoop.play().catch(() => {});
    }
    if (this.mediaOut && this.mediaOut.paused) {
      this.mediaOut.play().catch(() => {});
    }
    // drop the stale backlog and pick up cleanly just ahead of the clock
    this.queue = [];
    if (this.nextNoteTime < ctx.currentTime) {
      this.nextNoteTime = ctx.currentTime + START_DELAY_S;
    }
    this.scheduleAhead();
  }

  private ensureAudio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.installReviveHandlers();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.config.volume;
      // clicks always play direct — glitch-free, sample-accurate
      this.master.connect(this.ctx.destination);
      if (isIOS() && typeof Audio !== 'undefined') {
        this.silentLoop = new Audio('/silence.m4a');
        this.silentLoop.loop = true;
        this.silentLoop.setAttribute('playsinline', '');
        this.silentLoop.addEventListener('error', () => this.useStreamingFallback());
      }
    }
    return this.ctx;
  }

  /** Last resort when the silent loop can't play: stream the clicks through a
   *  media element after all — glitchy on iOS, but audible on silent. */
  private useStreamingFallback(): void {
    if (this.mediaOut || !this.ctx || !this.master || !this.ctx.createMediaStreamDestination) {
      return;
    }
    const dest = this.ctx.createMediaStreamDestination();
    this.master.disconnect();
    this.master.connect(dest);
    this.mediaOut = new Audio();
    this.mediaOut.srcObject = dest.stream;
    this.mediaOut.setAttribute('playsinline', '');
    if (this.running) this.mediaOut.play().catch(() => {});
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.ensureAudio();
    // kick off media playback synchronously, while the user's tap still counts
    // as a gesture — an await first can void the autoplay permission
    this.silentLoop?.play().catch(() => this.useStreamingFallback());
    this.mediaOut?.play().catch(() => {});
    // never hangs: a wedged context (iOS took the audio session while we were
    // backgrounded) is torn down and rebuilt instead of awaited forever
    const ctx = await this.ensureRunningContext();
    if (!ctx) return; // even a fresh context refused — next tap retries
    // pre-warm the output path with an inaudible one-shot so the first real
    // click isn't the sample that wakes the hardware
    if (this.master) {
      const warm = ctx.createBufferSource();
      warm.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      warm.connect(this.master);
      warm.start(ctx.currentTime);
    }
    this.pos = { bar: 0, beat: 0, sub: 0 };
    this.nextNoteTime = ctx.currentTime + START_DELAY_S;
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
    this.silentLoop?.pause();
    this.mediaOut?.pause();
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
    // A large backlog (long stall/background) would make the skip-loop below spin
    // over thousands of past beats — hard-resync just ahead of the clock instead.
    if (this.nextNoteTime < ctx.currentTime - 0.5) {
      this.nextNoteTime = ctx.currentTime + 0.06;
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
      // If we woke late, this click's time is already past. Firing it now (Web
      // Audio plays past-dated sources immediately) would dump the whole backlog
      // as one burst — the "drill"/pitch-drop artifact. Silently skip it and let
      // the pulse resume on the next in-time click; position still advances so
      // the accent pattern stays phase-aligned.
      if (!isPastDue(this.nextNoteTime, ctx.currentTime)) {
        if (!muted) {
          scheduleClick(ctx, this.master, cfg.sound, accent, isSub, this.nextNoteTime);
        }
        this.queue.push({ time: this.nextNoteTime, pos: this.pos, accent, isSub, muted, bpm });
      }
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
