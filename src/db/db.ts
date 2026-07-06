import Dexie, { type Table } from 'dexie';
import type { AccentState, ClickSound, Subdivision, TimeSignature } from '../engine/types';

export interface Song {
  id?: number;
  name: string;
  bpm: number;
  signature: TimeSignature;
  subdivision: Subdivision;
  accents: AccentState[];
  sound: ClickSound;
  notes?: string;
  createdAt: number;
}

export interface Setlist {
  id?: number;
  name: string;
  songIds: number[];
  createdAt: number;
}

export interface PracticeSession {
  id?: number;
  startedAt: number; // epoch ms
  endedAt: number;
  durationSec: number;
  songName?: string;
  auto: boolean; // logged by auto-detection vs. manual stopwatch
}

class MetronomeDB extends Dexie {
  songs!: Table<Song, number>;
  setlists!: Table<Setlist, number>;
  sessions!: Table<PracticeSession, number>;

  constructor() {
    super('open-metronome');
    this.version(1).stores({
      songs: '++id, name, createdAt',
      setlists: '++id, name, createdAt',
      sessions: '++id, startedAt',
    });
  }
}

export const db = new MetronomeDB();
