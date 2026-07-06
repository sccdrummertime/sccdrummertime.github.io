export type AccentState = 'normal' | 'accent1' | 'accent2' | 'accent3' | 'off';

export interface TimeSignature {
  beats: number; // beats per bar (numerator)
  unit: 4 | 8 | 2 | 16; // note value that gets one beat (denominator)
}

/** Clicks per beat: 1 = beat only, 2 = eighths, 3 = triplets, 4 = sixteenths. */
export type Subdivision = 1 | 2 | 3 | 4;

export type ClickSound = 'classic' | 'woodblock' | 'beep' | 'rimshot' | 'cowbell';

export interface IncrementalTempo {
  enabled: boolean;
  startBpm: number;
  targetBpm: number;
  incrementBpm: number;
  everyBars: number;
}

export interface MutedTrainer {
  enabled: boolean;
  mode: 'random' | 'pattern';
  /** random mode: probability [0..1] that any beat is silenced */
  randomChance: number;
  /** pattern mode: play N bars ... */
  playBars: number;
  /** ...then mute M bars */
  muteBars: number;
}

export interface AutoStop {
  enabled: boolean;
  mode: 'bars' | 'seconds';
  bars: number;
  seconds: number;
}

export interface MetronomeConfig {
  bpm: number;
  signature: TimeSignature;
  subdivision: Subdivision;
  /** one entry per beat in the bar */
  accents: AccentState[];
  sound: ClickSound;
  incremental: IncrementalTempo;
  trainer: MutedTrainer;
  autoStop: AutoStop;
  volume: number; // 0..1
}

/** Position of a single scheduled click within the piece. */
export interface Position {
  bar: number; // 0-based
  beat: number; // 0-based within bar
  sub: number; // 0-based within beat
}

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function defaultConfig(): MetronomeConfig {
  return {
    bpm: 120,
    signature: { beats: 4, unit: 4 },
    subdivision: 1,
    accents: ['accent1', 'normal', 'normal', 'normal'],
    sound: 'classic',
    incremental: { enabled: false, startBpm: 80, targetBpm: 120, incrementBpm: 4, everyBars: 4 },
    trainer: { enabled: false, mode: 'random', randomChance: 0.25, playBars: 2, muteBars: 1 },
    autoStop: { enabled: false, mode: 'bars', bars: 16, seconds: 300 },
    volume: 1,
  };
}
