import type { AccentState } from '../engine/types';

/** Segments lit per accent state — fill level reads as loudness, like hardware
 *  metronomes: full block = strongest accent, empty outline = silent. */
const FILL: Record<AccentState, number> = {
  accent1: 4,
  accent2: 3,
  accent3: 2,
  normal: 1,
  off: 0,
};

interface Props {
  accents: AccentState[];
  activeBeat: number | null;
  onTap?: (beat: number) => void;
}

export function BeatBlocks({ accents, activeBeat, onTap }: Props) {
  return (
    <div className="blocks" aria-label="Beat accents — tap a beat to change its accent">
      {accents.map((accent, i) => {
        const fill = FILL[accent];
        return (
          <button
            key={i}
            className={`block${activeBeat === i ? ' now' : ''}${fill === 0 ? ' off' : ''}`}
            data-accent={accent}
            aria-label={`Beat ${i + 1}: ${accent}`}
            onClick={onTap ? () => onTap(i) : undefined}
            disabled={!onTap}
          >
            {[3, 2, 1, 0].map((seg) => (
              <span key={seg} className={`seg${seg < fill ? ' lit' : ''}`} />
            ))}
          </button>
        );
      })}
    </div>
  );
}
