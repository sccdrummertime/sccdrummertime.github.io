import { create } from 'zustand';
import { Metronome, type BeatEvent } from '../engine/scheduler';
import type { MetronomeConfig } from '../engine/types';
import { defaultConfig } from '../engine/types';
import { defaultAccents } from '../engine/patterns';
import { trackerOnStart, trackerOnStop } from '../features/practice/tracker';
import { useSettings } from './settings';
import type { Song } from '../db/db';

/** Non-null while the metronome screen is being used to author a song's settings
 *  (as opposed to just practicing with whatever is currently dialed in). */
export interface SongDraft {
  mode: 'create' | 'edit';
  id?: number; // set only in 'edit' mode
  name: string;
}

/** Non-null while playing through a setlist: the metronome screen shows
 *  prev/pause/next transport for it. Songs are snapshotted at play time so
 *  later library edits don't yank settings mid-gig. */
export interface ActiveSetlist {
  name: string;
  songs: Song[];
  index: number;
}

/** One engine instance for the whole app; this store mirrors its config so React
 *  re-renders, and every write goes through to the engine live. */
export const metronome = new Metronome();

const beatListeners = new Set<(e: BeatEvent) => void>();
metronome.onBeat = (e) => beatListeners.forEach((fn) => fn(e));

export function onBeat(fn: (e: BeatEvent) => void): () => void {
  beatListeners.add(fn);
  return () => beatListeners.delete(fn);
}

interface MetroState {
  config: MetronomeConfig;
  running: boolean;
  loadedSongName: string | null;
  songDraft: SongDraft | null;
  activeSetlist: ActiveSetlist | null;
  update: (patch: Partial<MetronomeConfig>) => void;
  setSignature: (beats: number, unit: 2 | 4 | 8 | 16) => void;
  setLoadedSong: (name: string | null) => void;
  applySong: (song: Song) => void;
  beginNewSong: (name: string) => void;
  beginEditSong: (song: Song) => void;
  cancelSongDraft: () => void;
  clearSongDraft: () => void;
  playSetlist: (name: string, songs: Song[], index: number) => void;
  setlistGoTo: (index: number) => void;
  setlistGo: (delta: -1 | 1) => void;
  exitSetlist: () => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export const useMetro = create<MetroState>((set, get) => ({
  config: defaultConfig(),
  running: false,
  loadedSongName: null,
  songDraft: null,
  activeSetlist: null,
  update: (patch) => {
    metronome.setConfig(patch);
    set({ config: metronome.getConfig() });
  },
  setSignature: (beats, unit) => {
    // changing meter resets the accent grid to a musical default for that meter
    const accents = defaultAccents({ beats, unit });
    get().update({ signature: { beats, unit }, accents });
  },
  setLoadedSong: (loadedSongName) => set({ loadedSongName }),
  applySong: (song) => {
    get().update({
      bpm: song.bpm,
      signature: song.signature,
      subdivision: song.subdivision,
      accents: song.accents,
      sound: song.sound,
    });
    set({ loadedSongName: song.name });
  },
  beginNewSong: (name) => {
    if (get().running) get().stop();
    get().update(defaultConfig());
    set({ loadedSongName: name, songDraft: { mode: 'create', name }, activeSetlist: null });
  },
  beginEditSong: (song) => {
    if (get().running) get().stop();
    get().applySong(song);
    set({ songDraft: { mode: 'edit', id: song.id, name: song.name }, activeSetlist: null });
  },
  cancelSongDraft: () => set({ songDraft: null, loadedSongName: null }),
  clearSongDraft: () => set({ songDraft: null }),
  playSetlist: (name, songs, index) => {
    if (songs.length === 0) return;
    const i = Math.min(Math.max(index, 0), songs.length - 1);
    get().applySong(songs[i]);
    set({ activeSetlist: { name, songs, index: i }, songDraft: null });
    void metronome.start();
  },
  setlistGoTo: (index) => {
    const sl = get().activeSetlist;
    if (!sl || index < 0 || index >= sl.songs.length || index === sl.index) return;
    const wasRunning = get().running;
    if (wasRunning) get().stop();
    get().applySong(sl.songs[index]);
    set({ activeSetlist: { ...sl, index } });
    // restart so the new song begins on beat 1 rather than mid-bar
    if (wasRunning) void metronome.start();
  },
  setlistGo: (delta) => {
    const sl = get().activeSetlist;
    if (sl) get().setlistGoTo(sl.index + delta);
  },
  exitSetlist: () => set({ activeSetlist: null }),
  start: () => void metronome.start(),
  stop: () => metronome.stop(),
  toggle: () => metronome.toggle(),
}));

metronome.onStateChange = (running) => {
  useMetro.setState({ running });
  if (running) {
    // starting a tracked run is gated on the setting...
    if (useSettings.getState().autoDetectPractice) {
      trackerOnStart(useMetro.getState().loadedSongName ?? undefined);
    }
  } else {
    // ...but a stop always closes any open run (no-op if none) — otherwise toggling
    // the setting off mid-run would orphan the span
    trackerOnStop();
  }
};
