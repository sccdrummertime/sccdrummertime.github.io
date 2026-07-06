import { clampBpm } from './types';

const MAX_TAPS = 8;
const RESET_GAP_MS = 2500;

/** Averages the intervals between recent taps into a BPM. A pause longer than
 *  RESET_GAP_MS starts a fresh measurement. */
export class TapTempo {
  private taps: number[] = [];

  /** Register a tap at `now` (ms). Returns the detected BPM, or null until two taps exist. */
  tap(now: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && now - last > RESET_GAP_MS) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > MAX_TAPS) this.taps.shift();
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1] - this.taps[0];
    const avgInterval = span / (this.taps.length - 1);
    if (avgInterval <= 0) return null;
    return clampBpm(60000 / avgInterval);
  }

  reset(): void {
    this.taps = [];
  }
}
