import type { AccentState, ClickSound } from './types';

/** Synthesized click library. Clicks are generated with oscillators/noise instead
 *  of shipped audio files: sample-accurate scheduling, zero asset licensing, and
 *  no decode latency at high BPM. Accent level maps to pitch/level; subdivision
 *  clicks (sub > 0) are rendered quieter and lower. */

interface Voice {
  freq: number;
  gain: number;
}

function voiceFor(accent: AccentState, isSub: boolean): Voice | null {
  if (accent === 'off') return null;
  if (isSub) return { freq: 0.6, gain: 0.35 };
  switch (accent) {
    case 'accent1':
      return { freq: 1.5, gain: 1.0 };
    case 'accent2':
      return { freq: 1.25, gain: 0.85 };
    case 'accent3':
      return { freq: 1.1, gain: 0.7 };
    default:
      return { freq: 1.0, gain: 0.55 };
  }
}

let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function envGain(ctx: AudioContext, time: number, peak: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, time);
  g.gain.linearRampToValueAtTime(peak, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  return g;
}

function osc(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  type: OscillatorType,
  freq: number,
  peak: number,
  decay: number,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  const g = envGain(ctx, time, peak, decay);
  o.connect(g).connect(out);
  o.start(time);
  o.stop(time + decay + 0.01);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  time: number,
  filterFreq: number,
  peak: number,
  decay: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(filterFreq, time);
  f.Q.setValueAtTime(1.5, time);
  const g = envGain(ctx, time, peak, decay);
  src.connect(f).connect(g).connect(out);
  src.start(time);
  src.stop(time + decay + 0.01);
}

/** Schedule one click at AudioContext time `time`. Returns false if the click is
 *  silent (accent off). */
export function scheduleClick(
  ctx: AudioContext,
  destination: AudioNode,
  sound: ClickSound,
  accent: AccentState,
  isSub: boolean,
  time: number,
): boolean {
  const v = voiceFor(accent, isSub);
  if (!v) return false;
  switch (sound) {
    case 'classic':
      osc(ctx, destination, time, 'square', 1800 * v.freq, v.gain * 0.5, 0.03);
      break;
    case 'woodblock':
      osc(ctx, destination, time, 'sine', 850 * v.freq, v.gain, 0.06);
      noise(ctx, destination, time, 2200 * v.freq, v.gain * 0.3, 0.02);
      break;
    case 'beep':
      osc(ctx, destination, time, 'sine', 990 * v.freq, v.gain * 0.8, 0.08);
      break;
    case 'rimshot':
      noise(ctx, destination, time, 3300 * v.freq, v.gain, 0.035);
      osc(ctx, destination, time, 'triangle', 440 * v.freq, v.gain * 0.5, 0.025);
      break;
    case 'cowbell':
      osc(ctx, destination, time, 'square', 540 * v.freq, v.gain * 0.5, 0.09);
      osc(ctx, destination, time, 'square', 800 * v.freq, v.gain * 0.35, 0.06);
      break;
  }
  return true;
}

export const CLICK_SOUNDS: { id: ClickSound; label: string }[] = [
  { id: 'classic', label: 'Classic click' },
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'beep', label: 'Digital beep' },
  { id: 'rimshot', label: 'Rimshot' },
  { id: 'cowbell', label: 'Cowbell' },
];
