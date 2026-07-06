import type { PracticeSession } from '../../db/db';

/** Auto-detection policy: runs shorter than MIN_SESSION_SEC are noise (a quick
 *  tempo check), and a stop/restart within MERGE_GAP_SEC is the same practice
 *  session, not two. */
export const MIN_SESSION_SEC = 60;
export const MERGE_GAP_SEC = 180;

export interface RunSpan {
  start: number; // epoch ms
  end: number;
}

/** Collapse raw metronome run spans into loggable sessions. */
export function spansToSessions(spans: RunSpan[]): RunSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: RunSpan[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end <= MERGE_GAP_SEC * 1000) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged.filter((s) => s.end - s.start >= MIN_SESSION_SEC * 1000);
}

/** Local calendar day key, e.g. "2026-07-06". */
export function dayKey(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Consecutive-day streak ending today or yesterday (a streak isn't broken until
 *  a full day is missed). */
export function currentStreak(sessions: PracticeSession[], now: number): number {
  const days = new Set(sessions.map((s) => dayKey(s.startedAt)));
  if (days.size === 0) return 0;
  const DAY = 86400000;
  let cursor = now;
  if (!days.has(dayKey(cursor))) {
    cursor -= DAY; // today has no practice yet — streak may still be alive from yesterday
    if (!days.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

export function longestStreak(sessions: PracticeSession[]): number {
  const days = [...new Set(sessions.map((s) => dayKey(s.startedAt)))].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    if (prev !== null && new Date(d).getTime() - new Date(prev).getTime() === 86400000) {
      run++;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export interface Highscores {
  longestSessionSec: number;
  longestStreakDays: number;
  totalPracticeSec: number;
  sessionCount: number;
}

export function highscores(sessions: PracticeSession[]): Highscores {
  return {
    longestSessionSec: sessions.reduce((m, s) => Math.max(m, s.durationSec), 0),
    longestStreakDays: longestStreak(sessions),
    totalPracticeSec: sessions.reduce((t, s) => t + s.durationSec, 0),
    sessionCount: sessions.length,
  };
}
