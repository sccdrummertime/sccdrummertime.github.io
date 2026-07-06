import { useState } from 'react';
import { usePitch } from '../features/tuner/usePitch';
import { useSettings } from '../state/settings';

export function TunerScreen() {
  const [active, setActive] = useState(false);
  const a4 = useSettings((s) => s.a4);
  const setA4 = useSettings((s) => s.setA4);
  const { reading, error } = usePitch(active, a4);

  const inTune = reading !== null && Math.abs(reading.cents) <= 5;
  const needleLeft = reading ? 50 + (reading.cents / 50) * 50 : 50;

  return (
    <div className="screen">
      <h2 className="screen-title">Tuner</h2>

      <div className="tuner-note" style={{ color: inTune ? 'var(--good)' : 'var(--text)' }}>
        {reading ? (
          <>
            {reading.note}
            <sub style={{ fontSize: 28 }}>{reading.octave}</sub>
          </>
        ) : (
          <span style={{ color: 'var(--text-dim)' }}>—</span>
        )}
      </div>
      <div style={{ textAlign: 'center' }} className="sub">
        {reading ? `${reading.freq.toFixed(1)} Hz · ${reading.cents > 0 ? '+' : ''}${reading.cents}¢` : active ? 'Listening…' : 'Tuner is off'}
      </div>

      <div className="tuner-cents">
        <div className="center" />
        <div
          className={`needle${inTune ? ' in-tune' : ''}`}
          style={{ left: `${Math.min(98, Math.max(2, needleLeft))}%` }}
        />
      </div>
      <div className="row spread" style={{ padding: '0 8px' }}>
        <span className="sub">−50¢</span>
        <span className="sub">0</span>
        <span className="sub">+50¢</span>
      </div>

      <div className="row">
        <button className={active ? '' : 'primary'} onClick={() => setActive(!active)}>
          {active ? 'Stop tuner' : 'Start tuner'}
        </button>
      </div>
      {error && <div className="muted-note" style={{ textAlign: 'center' }}>{error}</div>}

      <div className="card">
        <label className="toggle">
          <span>
            <strong>Reference pitch</strong>
            <div className="sub">A4 frequency (standard is 440 Hz)</div>
          </span>
          <input
            type="number"
            min={415}
            max={466}
            value={a4}
            style={{ width: 80 }}
            onChange={(e) => setA4(Number(e.target.value) || 440)}
          />
        </label>
      </div>
    </div>
  );
}
