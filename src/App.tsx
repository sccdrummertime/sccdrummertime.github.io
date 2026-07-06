import { useEffect, useState } from 'react';
import { MetronomeScreen } from './ui/MetronomeScreen';
import { LibraryScreen } from './ui/LibraryScreen';
import { PracticeScreen } from './ui/PracticeScreen';
import { TunerScreen } from './ui/TunerScreen';
import { SettingsScreen } from './ui/SettingsScreen';
import { useSettings } from './state/settings';
import { initTracker } from './features/practice/tracker';

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
    const fired = new Set<string>();
    const check = () => {
      const { reminders } = useSettings.getState();
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const r of reminders) {
        const key = `${r.id}-${now.toDateString()}-${r.time}`;
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

export default function App() {
  const [tab, setTab] = useState<Tab>('metronome');
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    initTracker();
  }, []);

  useReminderClock();

  return (
    <div className="app">
      {tab === 'metronome' && <MetronomeScreen />}
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
