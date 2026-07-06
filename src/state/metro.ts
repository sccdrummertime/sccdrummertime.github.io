import { create } from 'zustand';
import { Metronome, type BeatEvent } from '../engine/scheduler';
import type { MetronomeConfig } from '../engine/types';
import { defaultConfig } from '../engine/types';
import { defaultAccents } from '../engine/patterns';
import { trackerOnStart, trackerOnStop } from '../features/practice/tracker';
import { useSettings } from './settings';

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
  update: (patch: Partial<MetronomeConfig>) => void;
  setSignature: (beats: number, unit: 2 | 4 | 8 | 16) => void;
  setLoadedSong: (name: string | null) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export const useMetro = create<MetroState>((set, get) => ({
  config: defaultConfig(),
  running: false,
  loadedSongName: null,
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
  start: () => void metronome.start(),
  stop: () => metronome.stop(),
  toggle: () => metronome.toggle(),
}));

metronome.onStateChange = (running) => {
  useMetro.setState({ running });
  if (useSettings.getState().autoDetectPractice) {
    if (running) trackerOnStart(useMetro.getState().loadedSongName ?? undefined);
    else trackerOnStop();
  }
};
