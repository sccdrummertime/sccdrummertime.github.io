import { db } from '../../db/db';
import { MERGE_GAP_SEC, spansToSessions, type RunSpan } from './logic';

/** Automatic practice detection. Raw metronome run spans buffer in localStorage
 *  (surviving reloads) and are finalized into logged sessions once the user has
 *  clearly stopped practicing (gap > MERGE_GAP_SEC). */

const PENDING_KEY = 'open-metronome-pending-spans';

interface Pending {
  spans: RunSpan[];
  songName?: string;
}

function loadPending(): Pending {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pending;
      if (Array.isArray(p.spans)) return p;
    }
  } catch {
    // corrupt buffer — start fresh rather than crash
  }
  return { spans: [] };
}

function savePending(p: Pending): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(p));
}

async function finalize(p: Pending): Promise<void> {
  const sessions = spansToSessions(p.spans);
  for (const s of sessions) {
    await db.sessions.add({
      startedAt: s.start,
      endedAt: s.end,
      durationSec: Math.round((s.end - s.start) / 1000),
      songName: p.songName,
      auto: true,
    });
  }
  savePending({ spans: [] });
}

/** Flush the pending buffer if the last activity is old enough to be over. */
export async function flushStalePending(now = Date.now()): Promise<void> {
  const p = loadPending();
  if (p.spans.length === 0) return;
  const lastEnd = Math.max(...p.spans.map((s) => s.end));
  if (now - lastEnd > MERGE_GAP_SEC * 1000) await finalize(p);
}

let runStart: number | null = null;

export function trackerOnStart(songName?: string): void {
  void flushStalePending();
  runStart = Date.now();
  if (songName) {
    const p = loadPending();
    p.songName = songName;
    savePending(p);
  }
}

export function trackerOnStop(): void {
  if (runStart === null) return;
  const p = loadPending();
  p.spans.push({ start: runStart, end: Date.now() });
  savePending(p);
  runStart = null;
}

/** Call once at app startup: sweeps leftovers from previous visits, then keeps sweeping. */
export function initTracker(): void {
  void flushStalePending();
  setInterval(() => void flushStalePending(), 60_000);
}
