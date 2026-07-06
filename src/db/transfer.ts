import type { Song } from './db';
import { db } from './db';
import type { AccentState, Subdivision } from '../engine/types';
import { MAX_BPM, MIN_BPM } from '../engine/types';

/** Versioned JSON share format. Import never trusts input: every song is
 *  validated field-by-field and clamped/rejected before touching the database. */

export const SCHEMA_VERSION = 1;

export interface LibraryExport {
  app: 'open-metronome';
  schemaVersion: number;
  exportedAt: string;
  songs: Song[];
  /** setlists reference songs by index into the songs array — names may collide */
  setlists: { name: string; songIndexes: number[] }[];
}

export async function exportLibrary(): Promise<string> {
  const songs = await db.songs.toArray();
  const setlists = await db.setlists.toArray();
  const indexById = new Map(songs.map((s, i) => [s.id!, i]));
  const data: LibraryExport = {
    app: 'open-metronome',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    songs: songs.map(({ id: _id, ...rest }) => rest),
    setlists: setlists.map((sl) => ({
      name: sl.name,
      songIndexes: sl.songIds
        .map((id) => indexById.get(id))
        .filter((i): i is number => i !== undefined),
    })),
  };
  return JSON.stringify(data, null, 2);
}

const ACCENTS: AccentState[] = ['normal', 'accent1', 'accent2', 'accent3', 'off'];
const SOUNDS = ['classic', 'woodblock', 'beep', 'rimshot', 'cowbell'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Returns a clean Song or null if the entry is unusable. */
export function sanitizeSong(raw: unknown): Omit<Song, 'id'> | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  const bpm = Number(raw.bpm);
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) return null;
  const sig = isRecord(raw.signature) ? raw.signature : {};
  const beats = Number(sig.beats);
  const unit = Number(sig.unit);
  if (!Number.isInteger(beats) || beats < 1 || beats > 32) return null;
  if (![2, 4, 8, 16].includes(unit)) return null;
  const subdivision = [1, 2, 3, 4].includes(Number(raw.subdivision))
    ? (Number(raw.subdivision) as Subdivision)
    : 1;
  let accents: AccentState[] = Array.isArray(raw.accents)
    ? raw.accents.map((a) => (ACCENTS.includes(a as AccentState) ? (a as AccentState) : 'normal'))
    : [];
  accents = accents.slice(0, beats);
  while (accents.length < beats) accents.push('normal');
  return {
    name: raw.name.trim().slice(0, 200),
    bpm: Math.round(bpm),
    signature: { beats, unit: unit as 2 | 4 | 8 | 16 },
    subdivision,
    accents,
    sound: SOUNDS.includes(raw.sound as string) ? (raw.sound as Song['sound']) : 'classic',
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : undefined,
    createdAt: Date.now(),
  };
}

export interface ImportResult {
  songs: number;
  setlists: number;
  skipped: number;
}

export async function importLibrary(json: string): Promise<ImportResult> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  if (!isRecord(data) || data.app !== 'open-metronome') {
    throw new Error('Not an Open Metronome export file.');
  }
  if (typeof data.schemaVersion !== 'number' || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This file was made by a newer app version. Update the app and retry.');
  }
  const rawSongs = Array.isArray(data.songs) ? data.songs : [];
  let skipped = 0;
  const cleanByIndex = rawSongs.map((s) => {
    const ok = sanitizeSong(s);
    if (!ok) skipped++;
    return ok;
  });

  // index in the export's songs array → new db id (only for songs that passed validation)
  const idByIndex = new Map<number, number>();
  await db.transaction('rw', db.songs, db.setlists, async () => {
    for (let i = 0; i < rawSongs.length; i++) {
      const song = cleanByIndex[i];
      if (!song) continue;
      idByIndex.set(i, await db.songs.add(song as Song));
    }
    const rawSetlists = Array.isArray(data.setlists) ? data.setlists : [];
    for (const sl of rawSetlists) {
      if (!isRecord(sl) || typeof sl.name !== 'string' || !Array.isArray(sl.songIndexes)) continue;
      const songIds = sl.songIndexes
        .map((i) => (Number.isInteger(i) ? idByIndex.get(i as number) : undefined))
        .filter((id): id is number => id !== undefined);
      await db.setlists.add({
        name: sl.name.trim().slice(0, 200),
        songIds,
        createdAt: Date.now(),
      });
    }
  });
  const setlistCount = Array.isArray(data.setlists) ? data.setlists.length : 0;
  return { songs: idByIndex.size, setlists: setlistCount, skipped };
}
