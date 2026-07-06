import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clamp } from '../engine/types';

export interface Reminder {
  id: string;
  time: string; // "HH:MM" 24h local
  days: number[]; // 0=Sun..6=Sat; empty = every day
  label: string;
  enabled: boolean;
}

interface SettingsState {
  theme: 'dark' | 'light';
  screenFlash: boolean;
  autoDetectPractice: boolean;
  a4: number; // tuner reference pitch
  reminders: Reminder[];
  setTheme: (t: 'dark' | 'light') => void;
  setScreenFlash: (v: boolean) => void;
  setAutoDetectPractice: (v: boolean) => void;
  setA4: (v: number) => void;
  addReminder: (r: Reminder) => void;
  updateReminder: (id: string, patch: Partial<Reminder>) => void;
  removeReminder: (id: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      screenFlash: false,
      autoDetectPractice: true,
      a4: 440,
      reminders: [],
      setTheme: (theme) => set({ theme }),
      setScreenFlash: (screenFlash) => set({ screenFlash }),
      setAutoDetectPractice: (autoDetectPractice) => set({ autoDetectPractice }),
      setA4: (a4) => set({ a4: clamp(a4, 415, 466) }),
      addReminder: (r) => set((s) => ({ reminders: [...s.reminders, r] })),
      updateReminder: (id, patch) =>
        set((s) => ({
          reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      removeReminder: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
    }),
    { name: 'open-metronome-settings' },
  ),
);
