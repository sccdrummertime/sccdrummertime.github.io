import { describe, expect, it } from 'vitest';
import { currentStreak, dayKey, highscores, longestStreak, spansToSessions } from './logic';
import type { PracticeSession } from '../../db/db';

const MIN = 60000;

describe('spansToSessions', () => {
  it('drops runs shorter than the minimum', () => {
    expect(spansToSessions([{ start: 0, end: 30_000 }])).toEqual([]);
  });
  it('merges runs separated by a short break into one session', () => {
    const out = spansToSessions([
      { start: 0, end: 2 * MIN },
      { start: 2 * MIN + 60_000, end: 5 * MIN }, // 1-minute gap: same session
    ]);
    expect(out).toEqual([{ start: 0, end: 5 * MIN }]);
  });
  it('keeps runs separated by a long break as separate sessions', () => {
    const out = spansToSessions([
      { start: 0, end: 2 * MIN },
      { start: 20 * MIN, end: 23 * MIN },
    ]);
    expect(out).toHaveLength(2);
  });
  it('a merged pair of short runs can clear the minimum together', () => {
    const out = spansToSessions([
      { start: 0, end: 40_000 },
      { start: 60_000, end: 100_000 }, // 40s + 40s with 20s gap = 100s span
    ]);
    expect(out).toEqual([{ start: 0, end: 100_000 }]);
  });
});

function sess(dateIso: string, durationSec = 600): PracticeSession {
  const t = new Date(dateIso).getTime();
  return { startedAt: t, endedAt: t + durationSec * 1000, durationSec, auto: true };
}

describe('streaks', () => {
  const now = new Date('2026-07-06T18:00:00').getTime();
  it('counts consecutive days ending today', () => {
    const s = [sess('2026-07-04T10:00:00'), sess('2026-07-05T10:00:00'), sess('2026-07-06T10:00:00')];
    expect(currentStreak(s, now)).toBe(3);
  });
  it('keeps the streak alive if today has no practice yet', () => {
    const s = [sess('2026-07-04T10:00:00'), sess('2026-07-05T10:00:00')];
    expect(currentStreak(s, now)).toBe(2);
  });
  it('breaks after a full missed day', () => {
    const s = [sess('2026-07-03T10:00:00')];
    expect(currentStreak(s, now)).toBe(0);
  });
  it('longestStreak finds the best historical run', () => {
    const s = [
      sess('2026-06-01T10:00:00'),
      sess('2026-06-02T10:00:00'),
      sess('2026-06-03T10:00:00'),
      sess('2026-06-10T10:00:00'),
    ];
    expect(longestStreak(s)).toBe(3);
  });
});

describe('highscores', () => {
  it('aggregates bests and totals', () => {
    const s = [sess('2026-07-01T10:00:00', 600), sess('2026-07-02T10:00:00', 1800)];
    const h = highscores(s);
    expect(h.longestSessionSec).toBe(1800);
    expect(h.totalPracticeSec).toBe(2400);
    expect(h.sessionCount).toBe(2);
    expect(h.longestStreakDays).toBe(2);
  });
});

describe('dayKey', () => {
  it('formats local dates', () => {
    expect(dayKey(new Date('2026-07-06T01:00:00').getTime())).toBe('2026-07-06');
  });
});
