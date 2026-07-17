import { useEffect, useRef, useState } from 'react';
import { useMetro } from '../state/metro';
import { useSettings, THEMES } from '../state/settings';
import { exportLibrary, importLibrary } from '../db/transfer';
import { requestPersistentStorage, storageState, type PersistState } from '../db/storage';

function DataCard() {
  const [persist, setPersist] = useState<PersistState>('unsupported');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageState().then(setPersist);
  }, []);

  const backup = async () => {
    const json = await exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `open-metronome-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus('Backup file downloaded — keep it somewhere safe.');
  };

  const restore = async (file: File) => {
    try {
      const r = await importLibrary(await file.text());
      setStatus(
        `Restored ${r.songs} song(s), ${r.setlists} setlist(s).` +
          (r.skipped ? ` Skipped ${r.skipped} invalid.` : ''),
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Restore failed.');
    }
  };

  const enablePersist = async () => {
    setPersist(await requestPersistentStorage());
  };

  return (
    <div className="card">
      <h3>Your data &amp; backup</h3>
      <div className="sub">
        Songs, setlists, and practice history are saved on this device only. New app updates
        never erase them.
      </div>

      <div className="row spread" style={{ marginTop: 10 }}>
        <span className="sub">
          Storage:{' '}
          {persist === 'persisted'
            ? '🔒 Protected from automatic cleanup'
            : persist === 'best-effort'
              ? '⚠ Not yet protected'
              : '—'}
        </span>
        {persist === 'best-effort' && <button onClick={() => void enablePersist()}>Protect</button>}
      </div>

      <div className="row" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        <button className="primary" onClick={() => void backup()}>
          Download backup
        </button>
        <button onClick={() => fileRef.current?.click()}>Restore from backup</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void restore(f);
            e.target.value = '';
          }}
        />
      </div>
      {status && <div className="muted-note">{status}</div>}
      <div className="muted-note">
        On iPhone/iPad, add the app to your Home Screen (Share → Add to Home Screen) — this keeps
        your library from being auto-cleared, and download a backup now and then for safety.
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const s = useSettings();
  const { config, update } = useMetro();

  return (
    <div className="screen">
      <h2 className="screen-title">Settings</h2>

      <div className="card">
        <label className="toggle" style={{ alignItems: 'flex-start' }}>
          <span>
            <strong>Theme</strong>
            <div className="sub">Pick your color</div>
          </span>
        </label>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch${s.theme === t.id ? ' active' : ''}`}
              data-theme={t.id}
              onClick={() => s.setTheme(t.id)}
              aria-label={`${t.label} theme`}
              aria-pressed={s.theme === t.id}
            >
              <span className="dot" />
              {t.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <span>
            <strong>Keep screen awake</strong>
            <div className="sub">Stops the display from sleeping while playing</div>
          </span>
          <input type="checkbox" checked={s.keepAwake} onChange={(e) => s.setKeepAwake(e.target.checked)} />
        </label>
        <label className="toggle">
          <span>
            <strong>Screen flash on beat</strong>
            <div className="sub">Visual cue for loud or silent environments</div>
          </span>
          <input type="checkbox" checked={s.screenFlash} onChange={(e) => s.setScreenFlash(e.target.checked)} />
        </label>
        <label className="toggle">
          <span>
            <strong>Auto-log practice sessions</strong>
            <div className="sub">Runs of 1+ minute are logged automatically</div>
          </span>
          <input
            type="checkbox"
            checked={s.autoDetectPractice}
            onChange={(e) => s.setAutoDetectPractice(e.target.checked)}
          />
        </label>
        <label className="toggle">
          <span>
            <strong>Volume</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })}
          />
        </label>
      </div>

      <DataCard />

      <div className="card">
        <h3>About</h3>
        <div className="sub">
          Open Metronome is free, open-source software (MIT license). Everything — every feature,
          unlimited songs and setlists — is available to everyone. Your data never leaves this
          device: no account, no cloud, no ads, no subscriptions.
        </div>
        <div className="muted-note">Build {__BUILD_ID__}</div>
      </div>
    </div>
  );
}
