import type {
  AccentState,
  IncrementalTempo,
  MutedTrainer,
  Position,
  Subdivision,
  TimeSignature,
} from './types';
import { clampBpm } from './types';

/** Seconds between consecutive clicks. BPM always refers to the denominator note
 *  (in 6/8 the eighth note gets the beat), which matches how the accent grid is edited. */
export function clickInterval(bpm: number, subdivision: Subdivision): number {
  return 60 / bpm / subdivision;
}

/** [upper bound (inclusive), name] — standard classical tempo ranges. */
const TEMPO_MARKINGS: [number, string][] = [
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [112, 'Moderato'],
  [120, 'Allegretto'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
];

/** Classical tempo marking for a BPM (Largo, Andante, Allegro…). */
export function tempoMarking(bpm: number): string {
  for (const [max, name] of TEMPO_MARKINGS) {
    if (bpm <= max) return name;
  }
  return 'Prestissimo';
}

export function advancePosition(
  pos: Position,
  signature: TimeSignature,
  subdivision: Subdivision,
): Position {
  let { bar, beat, sub } = pos;
  sub += 1;
  if (sub >= subdivision) {
    sub = 0;
    beat += 1;
    if (beat >= signature.beats) {
      beat = 0;
      bar += 1;
    }
  }
  return { bar, beat, sub };
}

const ACCENT_CYCLE: AccentState[] = ['normal', 'accent1', 'accent2', 'accent3', 'off'];

export function cycleAccent(state: AccentState): AccentState {
  const i = ACCENT_CYCLE.indexOf(state);
  return ACCENT_CYCLE[(i + 1) % ACCENT_CYCLE.length];
}

/** Default accent layout for a signature: downbeat strongest, plus the midpoint
 *  pulse in compound meters like 6/8 (beats 1 and 4). */
export function defaultAccents(signature: TimeSignature): AccentState[] {
  const accents: AccentState[] = new Array(signature.beats).fill('normal');
  accents[0] = 'accent1';
  if (signature.unit === 8 && signature.beats % 3 === 0 && signature.beats > 3) {
    for (let b = 3; b < signature.beats; b += 3) accents[b] = 'accent2';
  }
  return accents;
}

/** BPM in effect for a given 0-based bar index under incremental-tempo practice. */
export function incrementalBpm(inc: IncrementalTempo, baseBpm: number, bar: number): number {
  if (!inc.enabled) return baseBpm;
  const steps = Math.floor(bar / Math.max(1, inc.everyBars));
  const up = inc.targetBpm >= inc.startBpm;
  const raw = inc.startBpm + (up ? 1 : -1) * steps * Math.abs(inc.incrementBpm);
  const bounded = up ? Math.min(raw, inc.targetBpm) : Math.max(raw, inc.targetBpm);
  return clampBpm(bounded);
}

/** Whether the muted-beats trainer silences this click. The downbeat of a "play"
 *  bar is never muted in random mode so the user keeps an anchor.
 *  `rng` is injected for testability. */
export function isMuted(
  trainer: MutedTrainer,
  pos: Position,
  rng: () => number = Math.random,
): boolean {
  if (!trainer.enabled) return false;
  if (trainer.mode === 'pattern') {
    const cycle = Math.max(1, trainer.playBars) + Math.max(0, trainer.muteBars);
    return pos.bar % cycle >= Math.max(1, trainer.playBars);
  }
  if (pos.beat === 0 && pos.sub === 0) return false;
  return rng() < trainer.randomChance;
}
