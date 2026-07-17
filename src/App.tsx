import { useEffect, useState } from 'react';
import { MetronomeScreen } from './ui/MetronomeScreen';
import { LibraryScreen } from './ui/LibraryScreen';
import { PracticeScreen } from './ui/PracticeScreen';
import { TunerScreen } from './ui/TunerScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { useSettings } from './state/settings';
import { useMetro } from './state/metro';
import { initTracker } from './features/practice/tracker';
import { requestPersistentStorage } from './db/storage';

type Tab = 'metronome' | 'library' | 'practice' | 'tuner' | 'settings';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'metronome', icon: '𝅘𝅥', label: 'Metronome' },
  { id: 'library', icon: '♬', label: 'Library' },
  { id: 'practice', icon: '📈', label: 'Practice' },
  { id: 'tuner', icon: '🎯', label: 'Tuner' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
];

/** While the app is open, fire enabled reminders at their set time. */
function useReminderClock() {
  useEffect(() => {
    let fired = new Set<string>();
    let firedDay = new Date().toDateString();
    const check = () => {
      const { reminders } = useSettings.getState();
      const now = new Date();
      if (now.toDateString() !== firedDay) {
        // new day — yesterday's fired keys can never match again, drop them
        fired = new Set();
        firedDay = now.toDateString();
      }
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const r of reminders) {
        const key = `${r.id}-${r.time}`;
        if (!r.enabled || r.time !== hhmm || fired.has(key)) continue;
        fired.add(key);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('Open Metronome', { body: r.label });
        }
      }
    };
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);
}

/** Hold a Screen Wake Lock while `active` (metronome running + user opted in).
 *  The lock is auto-released by the browser whenever the page is hidden, so we
 *  re-acquire it every time the page becomes visible again. Best-effort: silently
 *  no-ops where the API is unsupported (older iOS Safari) or the request is denied. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // denied or transiently unavailable — a later visibility change retries
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

export default function App() {
  const [tab, setTab] = useState<Tab>('metronome');
  const theme = useSettings((s) => s.theme);
  const keepAwake = useSettings((s) => s.keepAwake);
  const running = useMetro((s) => s.running);

  useWakeLock(running && keepAwake);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    initTracker();
    // opt our IndexedDB data out of automatic browser eviction (best-effort)
    void requestPersistentStorage();
  }, []);

  useReminderClock();

  return (
    <div className="app">
      {tab === 'metronome' && <MetronomeScreen goToLibrary={() => setTab('library')} />}
      {tab === 'library' && <LibraryScreen goToMetronome={() => setTab('metronome')} />}
      {tab === 'practice' && <PracticeScreen />}
      {tab === 'tuner' && <TunerScreen />}
      {tab === 'settings' && <SettingsScreen />}
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
