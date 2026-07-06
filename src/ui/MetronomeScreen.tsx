import { useEffect, useRef, useState } from 'react';
import { onBeat, useMetro } from '../state/metro';
import { useSettings } from '../state/settings';
import { cycleAccent } from '../engine/patterns';
import { CLICK_SOUNDS } from '../engine/sounds';
import { TapTempo } from '../engine/tapTempo';
import { clampBpm, type Subdivision } from '../engine/types';

const SIGNATURES: [number, 2 | 4 | 8 | 16][] = [
  [2, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [6, 8],
  [7, 8],
  [9, 8],
  [12, 8],
];

const SUBDIVISIONS: { value: Subdivision; label: string }[] = [
  { value: 1, label: 'Beat' },
  { value: 2, label: 'Eighths' },
  { value: 3, label: 'Triplets' },
  { value: 4, label: 'Sixteenths' },
];

const tapper = new TapTempo();

export function MetronomeScreen() {
  const { config, running, loadedSongName, update, setSignature, toggle } = useMetro();
  const screenFlash = useSettings((s) => s.screenFlash);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const [showCustomSig, setShowCustomSig] = useState(false);

  useEffect(() => {
    return onBeat((e) => {
      if (!e.isSub) {
        setActiveBeat(e.pos.beat);
        setLiveBpm(e.bpm);
        if (screenFlash && flashRef.current && e.accent !== 'off' && !e.muted) {
          const el = flashRef.current;
          el.classList.add('on');
          setTimeout(() => el.classList.remove('on'), 60);
        }
      }
    });
  }, [screenFlash]);

  useEffect(() => {
    if (!running) {
      setActiveBeat(null);
      setLiveBpm(null);
    }
  }, [running]);

  const setBpm = (bpm: number) => update({ bpm: clampBpm(bpm) });
  const displayBpm = running && config.incremental.enabled && liveBpm ? liveBpm : config.bpm;
  const sigIsPreset = SIGNATURES.some(
    ([b, u]) => b === config.signature.beats && u === config.signature.unit,
  );

  return (
    <div className="screen">
      <div ref={flashRef} className="flash-overlay" />
      {loadedSongName && (
        <div className="sub" style={{ textAlign: 'center' }}>
          ♪ {loadedSongName}
        </div>
      )}
      <div className="bpm-display">
        <div className="bpm">{displayBpm}</div>
        <div className="label">BPM</div>
      </div>

      <input
        className="bpm-slider"
        type="range"
        min={20}
        max={400}
        value={config.bpm}
        onChange={(e) => setBpm(Number(e.target.value))}
        aria-label="Tempo"
      />
      <div className="row">
        <button onClick={() => setBpm(config.bpm - 5)}>−5</button>
        <button onClick={() => setBpm(config.bpm - 1)}>−1</button>
        <button
          onClick={() => {
            const bpm = tapper.tap(performance.now());
            if (bpm) setBpm(bpm);
          }}
        >
          Tap tempo
        </button>
        <button onClick={() => setBpm(config.bpm + 1)}>+1</button>
        <button onClick={() => setBpm(config.bpm + 5)}>+5</button>
      </div>

      <div className="beats" aria-label="Beat accents — tap a beat to change its accent">
        {config.accents.map((accent, i) => (
          <button
            key={i}
            className={`beat${activeBeat === i ? ' now' : ''}`}
            data-accent={accent}
            onClick={() => {
              // read live state, not the render closure — rapid taps must each advance the cycle
              const accents = [...useMetro.getState().config.accents];
              accents[i] = cycleAccent(accents[i]);
              update({ accents });
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="muted-note" style={{ textAlign: 'center' }}>
        Tap a beat: normal → accent 1 → 2 → 3 → silent
      </div>

      <button className={`start-btn${running ? ' running' : ''}`} onClick={toggle}>
        {running ? 'Stop' : 'Start'}
      </button>

      <div className="row">
        <select
          value={sigIsPreset ? `${config.signature.beats}/${config.signature.unit}` : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              setShowCustomSig(true);
              return;
            }
            setShowCustomSig(false);
            const [b, u] = e.target.value.split('/').map(Number);
            setSignature(b, u as 2 | 4 | 8 | 16);
          }}
          aria-label="Time signature"
        >
          {SIGNATURES.map(([b, u]) => (
            <option key={`${b}/${u}`} value={`${b}/${u}`}>
              {b}/{u}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        <select
          value={config.subdivision}
          onChange={(e) => update({ subdivision: Number(e.target.value) as Subdivision })}
          aria-label="Subdivision"
        >
          {SUBDIVISIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={config.sound}
          onChange={(e) => update({ sound: e.target.value as typeof config.sound })}
          aria-label="Click sound"
        >
          {CLICK_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {(showCustomSig || !sigIsPreset) && (
        <div className="row">
          <div className="field">
            <span>Beats per bar</span>
            <input
              type="number"
              min={1}
              max={32}
              value={config.signature.beats}
              onChange={(e) => {
                const b = Math.min(32, Math.max(1, Number(e.target.value) || 1));
                setSignature(b, config.signature.unit);
              }}
            />
          </div>
          <div className="field">
            <span>Beat unit</span>
            <select
              value={config.signature.unit}
              onChange={(e) =>
                setSignature(config.signature.beats, Number(e.target.value) as 2 | 4 | 8 | 16)
              }
            >
              {[2, 4, 8, 16].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card">
        <label className="toggle">
          <span>
            <strong>Tempo trainer</strong>
            <div className="sub">Gradually change speed while you play</div>
          </span>
          <input
            type="checkbox"
            checked={config.incremental.enabled}
            onChange={(e) => update({ incremental: { ...config.incremental, enabled: e.target.checked } })}
          />
        </label>
        {config.incremental.enabled && (
          <div className="row spread">
            <div className="field">
              <span>Start BPM</span>
              <input
                type="number"
                value={config.incremental.startBpm}
                onChange={(e) =>
                  update({ incremental: { ...config.incremental, startBpm: clampBpm(Number(e.target.value) || 20) } })
                }
              />
            </div>
            <div className="field">
              <span>Target BPM</span>
              <input
                type="number"
                value={config.incremental.targetBpm}
                onChange={(e) =>
                  update({ incremental: { ...config.incremental, targetBpm: clampBpm(Number(e.target.value) || 20) } })
                }
              />
            </div>
            <div className="field">
              <span>+BPM</span>
              <input
                type="number"
                min={1}
                value={config.incremental.incrementBpm}
                onChange={(e) =>
                  update({ incremental: { ...config.incremental, incrementBpm: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </div>
            <div className="field">
              <span>Every bars</span>
              <input
                type="number"
                min={1}
                value={config.incremental.everyBars}
                onChange={(e) =>
                  update({ incremental: { ...config.incremental, everyBars: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <label className="toggle">
          <span>
            <strong>Muted beats trainer</strong>
            <div className="sub">Silences beats so you internalize the pulse</div>
          </span>
          <input
            type="checkbox"
            checked={config.trainer.enabled}
            onChange={(e) => update({ trainer: { ...config.trainer, enabled: e.target.checked } })}
          />
        </label>
        {config.trainer.enabled && (
          <>
            <div className="row">
              <select
                value={config.trainer.mode}
                onChange={(e) =>
                  update({ trainer: { ...config.trainer, mode: e.target.value as 'random' | 'pattern' } })
                }
              >
                <option value="random">Random beats</option>
                <option value="pattern">Whole bars</option>
              </select>
              {config.trainer.mode === 'random' ? (
                <div className="field">
                  <span>Mute chance %</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={Math.round(config.trainer.randomChance * 100)}
                    onChange={(e) =>
                      update({
                        trainer: {
                          ...config.trainer,
                          randomChance: Math.min(0.9, Math.max(0, Number(e.target.value) / 100)),
                        },
                      })
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="field">
                    <span>Play bars</span>
                    <input
                      type="number"
                      min={1}
                      value={config.trainer.playBars}
                      onChange={(e) =>
                        update({ trainer: { ...config.trainer, playBars: Math.max(1, Number(e.target.value) || 1) } })
                      }
                    />
                  </div>
                  <div className="field">
                    <span>Mute bars</span>
                    <input
                      type="number"
                      min={1}
                      value={config.trainer.muteBars}
                      onChange={(e) =>
                        update({ trainer: { ...config.trainer, muteBars: Math.max(1, Number(e.target.value) || 1) } })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <label className="toggle">
          <span>
            <strong>Auto-stop</strong>
            <div className="sub">Stop after a set number of bars or time</div>
          </span>
          <input
            type="checkbox"
            checked={config.autoStop.enabled}
            onChange={(e) => update({ autoStop: { ...config.autoStop, enabled: e.target.checked } })}
          />
        </label>
        {config.autoStop.enabled && (
          <div className="row">
            <select
              value={config.autoStop.mode}
              onChange={(e) => update({ autoStop: { ...config.autoStop, mode: e.target.value as 'bars' | 'seconds' } })}
            >
              <option value="bars">After bars</option>
              <option value="seconds">After time</option>
            </select>
            {config.autoStop.mode === 'bars' ? (
              <div className="field">
                <span>Bars</span>
                <input
                  type="number"
                  min={1}
                  value={config.autoStop.bars}
                  onChange={(e) =>
                    update({ autoStop: { ...config.autoStop, bars: Math.max(1, Number(e.target.value) || 1) } })
                  }
                />
              </div>
            ) : (
              <div className="field">
                <span>Seconds</span>
                <input
                  type="number"
                  min={5}
                  value={config.autoStop.seconds}
                  onChange={(e) =>
                    update({ autoStop: { ...config.autoStop, seconds: Math.max(5, Number(e.target.value) || 5) } })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
