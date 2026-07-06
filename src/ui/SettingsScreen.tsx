import { useMetro } from '../state/metro';
import { useSettings } from '../state/settings';

export function SettingsScreen() {
  const s = useSettings();
  const { config, update } = useMetro();

  return (
    <div className="screen">
      <h2 className="screen-title">Settings</h2>

      <div className="card">
        <label className="toggle">
          <span>
            <strong>Dark theme</strong>
          </span>
          <input
            type="checkbox"
            checked={s.theme === 'dark'}
            onChange={(e) => s.setTheme(e.target.checked ? 'dark' : 'light')}
          />
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

      <div className="card">
        <h3>About</h3>
        <div className="sub">
          Open Metronome is free, open-source software (MIT license). Everything — every feature,
          unlimited songs and setlists — is available to everyone. Your data never leaves this
          device: no account, no cloud, no ads, no subscriptions.
        </div>
      </div>
    </div>
  );
}
