import { describe, expect, it } from 'vitest';
import {
  advancePosition,
  clickInterval,
  cycleAccent,
  defaultAccents,
  incrementalBpm,
  isMuted,
  tempoMarking,
} from './patterns';
import { TapTempo } from './tapTempo';
import type { IncrementalTempo, MutedTrainer, Position } from './types';

describe('clickInterval', () => {
  it('gives 0.5s per beat at 120 bpm', () => {
    expect(clickInterval(120, 1)).toBeCloseTo(0.5);
  });
  it('halves for eighth-note subdivision', () => {
    expect(clickInterval(120, 2)).toBeCloseTo(0.25);
  });
  it('does not drift across many clicks (sum of intervals is exact)', () => {
    // 300 bpm * 16ths for 100 bars of 4/4 = 6400 clicks
    const interval = clickInterval(300, 4);
    let t = 0;
    for (let i = 0; i < 6400; i++) t += interval;
    expect(t).toBeCloseTo(6400 * (60 / 300 / 4), 6);
  });
});

describe('advancePosition', () => {
  it('walks subs, beats, bars in 4/4 with triplets', () => {
    let pos: Position = { bar: 0, beat: 0, sub: 0 };
    const sig = { beats: 4, unit: 4 as const };
    // 4 beats * 3 subs = 12 clicks to reach the next bar
    for (let i = 0; i < 12; i++) pos = advancePosition(pos, sig, 3);
    expect(pos).toEqual({ bar: 1, beat: 0, sub: 0 });
  });
  it('handles 7/8', () => {
    let pos: Position = { bar: 0, beat: 6, sub: 0 };
    pos = advancePosition(pos, { beats: 7, unit: 8 }, 1);
    expect(pos).toEqual({ bar: 1, beat: 0, sub: 0 });
  });
});

describe('accents', () => {
  it('cycles through all five states and wraps', () => {
    expect(cycleAccent('normal')).toBe('accent1');
    expect(cycleAccent('accent1')).toBe('accent2');
    expect(cycleAccent('accent2')).toBe('accent3');
    expect(cycleAccent('accent3')).toBe('off');
    expect(cycleAccent('off')).toBe('normal');
  });
  it('defaults 4/4 to a downbeat accent', () => {
    expect(defaultAccents({ beats: 4, unit: 4 })).toEqual([
      'accent1',
      'normal',
      'normal',
      'normal',
    ]);
  });
  it('defaults 6/8 to compound pulses on 1 and 4', () => {
    expect(defaultAccents({ beats: 6, unit: 8 })).toEqual([
      'accent1',
      'normal',
      'normal',
      'accent2',
      'normal',
      'normal',
    ]);
  });
});

describe('incrementalBpm', () => {
  const inc: IncrementalTempo = {
    enabled: true,
    startBpm: 80,
    targetBpm: 100,
    incrementBpm: 5,
    everyBars: 4,
  };
  it('starts at startBpm and steps every N bars', () => {
    expect(incrementalBpm(inc, 120, 0)).toBe(80);
    expect(incrementalBpm(inc, 120, 3)).toBe(80);
    expect(incrementalBpm(inc, 120, 4)).toBe(85);
    expect(incrementalBpm(inc, 120, 8)).toBe(90);
  });
  it('caps at targetBpm', () => {
    expect(incrementalBpm(inc, 120, 400)).toBe(100);
  });
  it('supports slowing down when target < start', () => {
    const down = { ...inc, startBpm: 120, targetBpm: 100 };
    expect(incrementalBpm(down, 90, 4)).toBe(115);
    expect(incrementalBpm(down, 90, 100)).toBe(100);
  });
  it('returns base bpm when disabled', () => {
    expect(incrementalBpm({ ...inc, enabled: false }, 120, 10)).toBe(120);
  });
});

describe('isMuted', () => {
  const base: MutedTrainer = {
    enabled: true,
    mode: 'pattern',
    randomChance: 0.5,
    playBars: 2,
    muteBars: 1,
  };
  it('pattern mode: plays 2 bars then mutes 1, repeating', () => {
    const at = (bar: number) => isMuted(base, { bar, beat: 1, sub: 0 });
    expect([at(0), at(1), at(2), at(3), at(4), at(5)]).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
  it('random mode: never mutes the downbeat, respects rng', () => {
    const rand: MutedTrainer = { ...base, mode: 'random', randomChance: 0.5 };
    expect(isMuted(rand, { bar: 0, beat: 0, sub: 0 }, () => 0.01)).toBe(false);
    expect(isMuted(rand, { bar: 0, beat: 1, sub: 0 }, () => 0.01)).toBe(true);
    expect(isMuted(rand, { bar: 0, beat: 1, sub: 0 }, () => 0.99)).toBe(false);
  });
  it('disabled: never mutes', () => {
    expect(isMuted({ ...base, enabled: false }, { bar: 2, beat: 1, sub: 0 })).toBe(false);
  });
});

describe('tempoMarking', () => {
  it('maps bpm ranges to classical names', () => {
    expect(tempoMarking(30)).toBe('Grave');
    expect(tempoMarking(50)).toBe('Largo');
    expect(tempoMarking(90)).toBe('Andante');
    expect(tempoMarking(120)).toBe('Allegretto');
    expect(tempoMarking(140)).toBe('Allegro');
    expect(tempoMarking(240)).toBe('Prestissimo');
  });
});

describe('TapTempo', () => {
  it('averages tap intervals into bpm', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBe(120); // 500ms interval = 120 bpm
    expect(t.tap(1000)).toBe(120);
  });
  it('resets after a long pause', () => {
    const t = new TapTempo();
    t.tap(0);
    t.tap(500);
    expect(t.tap(10000)).toBeNull(); // gap > reset threshold starts over
    expect(t.tap(10600)).toBe(100);
  });
  it('clamps to the supported bpm range', () => {
    const t = new TapTempo();
    t.tap(0);
    expect(t.tap(10)).toBe(400);
    const s = new TapTempo();
    s.tap(0);
    expect(s.tap(2400)).toBe(25);
  });
});
