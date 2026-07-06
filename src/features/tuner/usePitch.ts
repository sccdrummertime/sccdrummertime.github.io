import { useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';

export interface PitchReading {
  freq: number;
  note: string;
  octave: number;
  cents: number; // deviation from the nearest note, -50..+50
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function freqToReading(freq: number, a4: number): PitchReading {
  const midi = 69 + 12 * Math.log2(freq / a4);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const note = NOTE_NAMES[((nearest % 12) + 12) % 12];
  const octave = Math.floor(nearest / 12) - 1;
  return { freq, note, octave, cents };
}

const CLARITY_THRESHOLD = 0.9; // below this the detector is guessing — show nothing

export function usePitch(active: boolean, a4: number) {
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!active) return;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch {
        if (!cancelled) setError('Microphone access is needed for the tuner.');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const buf = new Float32Array(analyser.fftSize);
      const sampleRate = ctx.sampleRate;

      const loop = () => {
        if (cancelled) return;
        analyser.getFloatTimeDomainData(buf);
        const [freq, clarity] = detector.findPitch(buf, sampleRate);
        if (clarity > CLARITY_THRESHOLD && freq > 40 && freq < 5000) {
          setReading(freqToReading(freq, a4));
        } else {
          setReading(null);
        }
        raf.current = requestAnimationFrame(loop);
      };
      loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setReading(null);
      setError(null);
    };
  }, [active, a4]);

  return { reading, error };
}
