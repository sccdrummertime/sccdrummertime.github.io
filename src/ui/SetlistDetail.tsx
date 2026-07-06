import { useEffect, useRef, useState } from 'react';
import { db, type Setlist, type Song } from '../db/db';
import { useMetro } from '../state/metro';

interface Props {
  setlistId: number;
  goBack: () => void;
  goToMetronome: () => void;
}

export function SetlistDetail({ setlistId, goBack, goToMetronome }: Props) {
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState('');
  const playSetlist = useMetro((s) => s.playSetlist);

  // drag state — DOM order stays fixed during a drag; the held row follows the
  // finger via transform and the others slide aside with a transition. Only on
  // release is the array actually reordered and persisted. Refs mirror state so
  // window-level pointer handlers never read a stale closure.
  const listRef = useRef<HTMLDivElement>(null);
  const dragFromRef = useRef<number | null>(null); // where the held row started
  const dragToRef = useRef<number>(0); // slot currently under the finger
  const startYRef = useRef(0);
  const orderRef = useRef<number[]>([]);
  const [drag, setDrag] = useState<{ from: number; to: number; offset: number } | null>(null);
  const [order, _setOrder] = useState<number[]>([]);
  const setOrder = (ids: number[]) => {
    orderRef.current = ids;
    _setOrder(ids);
  };

  const refresh = async () => {
    const sl = await db.setlists.get(setlistId);
    setSetlist(sl ?? null);
    setOrder(sl?.songIds ?? []);
    setAllSongs(await db.songs.orderBy('name').toArray());
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setlistId]);

  /** Window-level drag listeners (registered before the loading early-return —
   *  hooks must run on every render; and window keeps receiving events no matter
   *  what re-renders under the finger). */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const from = dragFromRef.current;
      if (from === null || !listRef.current) return;
      const rows = listRef.current.children;
      if (rows.length === 0) return;
      const rect = listRef.current.getBoundingClientRect();
      const rowH = (rows[0] as HTMLElement).offsetHeight || 1;
      const to = Math.min(
        orderRef.current.length - 1,
        Math.max(0, Math.floor((e.clientY - rect.top) / rowH)),
      );
      dragToRef.current = to;
      setDrag({ from, to, offset: e.clientY - startYRef.current });
    };
    const up = () => {
      const from = dragFromRef.current;
      if (from === null) return;
      const to = dragToRef.current;
      dragFromRef.current = null;
      setDrag(null);
      if (to !== from) {
        const next = [...orderRef.current];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setOrder(next);
        void db.setlists.update(setlistId, { songIds: next });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [setlistId]);

  if (!setlist) {
    return (
      <div className="screen">
        <button className="ghost" onClick={goBack}>
          ← Library
        </button>
      </div>
    );
  }

  const songById = new Map(allSongs.map((s) => [s.id!, s]));
  const songsInOrder = order.map((id) => songById.get(id)).filter((s): s is Song => !!s);

  const persistOrder = async (ids: number[]) => {
    await db.setlists.update(setlistId, { songIds: ids });
  };

  const addSong = async (song: Song) => {
    const ids = [...order, song.id!];
    setOrder(ids);
    await persistOrder(ids);
  };

  const removeAt = async (index: number) => {
    const ids = order.filter((_, i) => i !== index);
    setOrder(ids);
    await persistOrder(ids);
  };

  const play = (index: number) => {
    playSetlist(setlist.name, songsInOrder, index);
    goToMetronome();
  };

  /** Hold the ≡ handle and move: rows are uniform height, so the target slot is
   *  simple pointer-Y arithmetic. During the drag the held row tracks the finger
   *  and the others animate aside; release commits + persists (listeners above). */
  const onHandleDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragFromRef.current = index;
    dragToRef.current = index;
    startYRef.current = e.clientY;
    setDrag({ from: index, to: index, offset: 0 });
  };

  /** Per-row transform while a drag is live: the held row follows the finger,
   *  rows between the origin and target slot shift one row-height aside. */
  const rowStyle = (i: number): React.CSSProperties | undefined => {
    if (!drag || !listRef.current) return undefined;
    const rowH = (listRef.current.children[0] as HTMLElement | undefined)?.offsetHeight ?? 0;
    if (i === drag.from) return { transform: `translateY(${drag.offset}px)` };
    if (drag.from < drag.to && i > drag.from && i <= drag.to) {
      return { transform: `translateY(${-rowH}px)` };
    }
    if (drag.from > drag.to && i >= drag.to && i < drag.from) {
      return { transform: `translateY(${rowH}px)` };
    }
    return undefined;
  };

  const q = pickQuery.trim().toLowerCase();
  const pickList = (q ? allSongs.filter((s) => s.name.toLowerCase().includes(q)) : allSongs);

  return (
    <div className="screen">
      <div className="row spread" style={{ justifyContent: 'space-between' }}>
        <button className="ghost" onClick={goBack}>
          ← Library
        </button>
        {songsInOrder.length > 0 && (
          <button className="primary" onClick={() => play(0)}>
            ▶ Play setlist
          </button>
        )}
      </div>
      <h2 className="screen-title">{setlist.name}</h2>
      <div className="sub">
        {songsInOrder.length === 0
          ? 'No songs yet — add some below.'
          : `${songsInOrder.length} song${songsInOrder.length === 1 ? '' : 's'} · tap a song to play it · hold ≡ to reorder`}
      </div>

      <div ref={listRef} className="drag-list" style={{ marginTop: 8 }}>
        {songsInOrder.map((song, i) => (
          <div
            className={`list-item${drag?.from === i ? ' dragging' : ''}`}
            style={rowStyle(i)}
            key={`${song.id}-${i}`}
          >
            <button
              className="drag-handle"
              aria-label={`Hold and move to reorder ${song.name}`}
              onPointerDown={onHandleDown(i)}
            >
              ≡
            </button>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => play(i)}>
              <div>
                {i + 1}. {song.name}
              </div>
              <div className="meta">
                {song.bpm} BPM · {song.signature.beats}/{song.signature.unit}
              </div>
            </div>
            <button
              className="ghost"
              aria-label={`Remove ${song.name} from ${setlist.name}`}
              onClick={() => void removeAt(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        {!picking ? (
          <button className="primary" onClick={() => setPicking(true)}>
            + Add songs
          </button>
        ) : (
          <>
            <div className="row spread" style={{ margin: 0 }}>
              <h3>Add songs</h3>
              <button className="ghost" onClick={() => setPicking(false)}>
                Done
              </button>
            </div>
            <input
              className="search"
              placeholder="Search songs…"
              value={pickQuery}
              onChange={(e) => setPickQuery(e.target.value)}
            />
            {pickList.length === 0 && (
              <div className="sub">No songs in your library yet — create one from the Library screen.</div>
            )}
            {pickList.map((song) => (
              <div className="list-item" key={song.id}>
                <div>
                  {song.name} <span className="meta">{song.bpm} BPM</span>
                </div>
                <button onClick={() => void addSong(song)}>+ Add</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
