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
  update: (patch: Partial<MetronomeConfig>) => void;
  setSignature: (beats: number, unit: 2 | 4 | 8 | 16) => void;
  setLoadedSong: (name: string | null) => void;
  beginNewSong: (name: string) => void;
  beginEditSong: (song: Song) => void;
  cancelSongDraft: () => void;
  clearSongDraft: () => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export const useMetro = create<MetroState>((set, get) => ({
  config: defaultConfig(),
  running: false,
  loadedSongName: null,
  songDraft: null,
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
  beginNewSong: (name) => {
    if (get().running) get().stop();
    get().update(defaultConfig());
    set({ loadedSongName: name, songDraft: { mode: 'create', name } });
  },
  beginEditSong: (song) => {
    if (get().running) get().stop();
    get().update({
      bpm: song.bpm,
      signature: song.signature,
      subdivision: song.subdivision,
      accents: song.accents,
      sound: song.sound,
    });
    set({ loadedSongName: song.name, songDraft: { mode: 'edit', id: song.id, name: song.name } });
  },
  cancelSongDraft: () => set({ songDraft: null, loadedSongName: null }),
  clearSongDraft: () => set({ songDraft: null }),
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
