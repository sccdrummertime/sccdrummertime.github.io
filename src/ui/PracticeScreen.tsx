import { useEffect, useState } from 'react';
import { db, type PracticeSession } from '../db/db';
import { currentStreak, dayKey, highscores } from '../features/practice/logic';
import { useSettings, type Reminder } from '../state/settings';

function fmtDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const stop = async (log: boolean) => {
    setRunning(false);
    if (log && elapsed >= 10) {
      await db.sessions.add({
        startedAt,
        endedAt: Date.now(),
        durationSec: elapsed,
        auto: false,
      });
    }
    setElapsed(0);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return (
    <div className="card">
      <h3>Stopwatch</h3>
      <div className="stopwatch">
        {mm}:{ss}
      </div>
      <div className="row">
        {!running ? (
          <button
            className="primary"
            onClick={() => {
              setStartedAt(Date.now());
              setElapsed(0);
              setRunning(true);
            }}
          >
            Start
          </button>
        ) : (
          <>
            <button className="primary" onClick={() => void stop(true)}>
              Stop &amp; log
            </button>
            <button onClick={() => void stop(false)}>Discard</button>
          </>
        )}
      </div>
    </div>
  );
}

function Reminders() {
  const { reminders, addReminder, updateReminder, removeReminder } = useSettings();
  const [notifState, setNotifState] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  const add = async () => {
    const time = prompt('Remind me at what time? (24h, e.g. 18:30)');
    if (!time || !/^\d{1,2}:\d{2}$/.test(time.trim())) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      setNotifState(await Notification.requestPermission());
    }
    addReminder({
      id: crypto.randomUUID(),
      time: time.trim().padStart(5, '0'),
      days: [],
      label: 'Time to practice 🎵',
      enabled: true,
    });
  };

  return (
    <div className="card">
      <h3>Practice reminders</h3>
      {reminders.length === 0 && <div className="sub">No reminders set.</div>}
      {reminders.map((r: Reminder) => (
        <label className="toggle" key={r.id}>
          <span>
            {r.time} daily
            <button className="ghost" onClick={() => removeReminder(r.id)}>
              ✕
            </button>
          </span>
          <input
            type="checkbox"
            checked={r.enabled}
            onChange={(e) => updateReminder(r.id, { enabled: e.target.checked })}
          />
        </label>
      ))}
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button onClick={() => void add()}>Add daily reminder</button>
      </div>
      {notifState === 'denied' && (
        <div className="muted-note">Notifications are blocked in your browser settings.</div>
      )}
      <div className="muted-note">
        Reminders fire through system notifications where your platform allows it; on iPhone,
        install the app to your home screen first.
      </div>
    </div>
  );
}

export function PracticeScreen() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);

  useEffect(() => {
    void db.sessions.orderBy('startedAt').reverse().toArray().then(setSessions);
  }, []);

  const scores = highscores(sessions);
  const streak = currentStreak(sessions, Date.now());
  const practicedDays = new Set(sessions.map((s) => dayKey(s.startedAt)));

  // last 28 days, oldest first
  const days: { key: string; label: number; practiced: boolean; today: boolean }[] = [];
  for (let i = 27; i >= 0; i--) {
    const t = Date.now() - i * 86400000;
    const key = dayKey(t);
    days.push({
      key,
      label: new Date(t).getDate(),
      practiced: practicedDays.has(key),
      today: i === 0,
    });
  }

  return (
    <div className="screen">
      <h2 className="screen-title">Practice</h2>

      <div className="stat-grid">
        <div className="stat">
          <div className="value">{streak}🔥</div>
          <div className="label">Day streak</div>
        </div>
        <div className="stat">
          <div className="value">{scores.longestStreakDays}</div>
          <div className="label">Best streak</div>
        </div>
        <div className="stat">
          <div className="value">{scores.longestSessionSec ? fmtDur(scores.longestSessionSec) : '—'}</div>
          <div className="label">Longest session</div>
        </div>
        <div className="stat">
          <div className="value">{scores.totalPracticeSec ? fmtDur(scores.totalPracticeSec) : '—'}</div>
          <div className="label">Total time</div>
        </div>
      </div>

      <div className="card">
        <h3>Last 4 weeks</h3>
        <div className="cal">
          {days.map((d) => (
            <div
              key={d.key}
              className={`day${d.practiced ? ' practiced' : ''}${d.today ? ' today' : ''}`}
              title={d.key}
            >
              {d.label}
            </div>
          ))}
        </div>
      </div>

      <Stopwatch />
      <Reminders />

      <div className="card">
        <h3>Recent sessions</h3>
        {sessions.length === 0 && (
          <div className="sub">
            Sessions appear here automatically when you practice with the metronome.
          </div>
        )}
        {sessions.slice(0, 15).map((s) => (
          <div className="list-item" key={s.id}>
            <div>
              {new Date(s.startedAt).toLocaleDateString()}{' '}
              <span className="meta">
                {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {s.songName ? ` · ${s.songName}` : ''}
                {s.auto ? '' : ' · stopwatch'}
              </span>
            </div>
            <div>{fmtDur(s.durationSec)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
