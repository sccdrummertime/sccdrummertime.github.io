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

  // drag state — orderRef mirrors `order` so pointer handlers (which can fire
  // against a stale render's closure) always read/persist the latest sequence
  const listRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const orderRef = useRef<number[]>([]);
  const [dragging, setDragging] = useState(false);
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

  /** Window-level drag listeners: a reorder re-keys the dragged row, so its
   *  original DOM node (and any pointer capture on it) doesn't survive the swap —
   *  only window reliably keeps receiving move/up. Must be registered before the
   *  loading early-return below (hooks must run on every render). */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const from = dragIndexRef.current;
      if (from === null || !listRef.current) return;
      const rows = listRef.current.children;
      if (rows.length === 0) return;
      const rect = listRef.current.getBoundingClientRect();
      const rowH = (rows[0] as HTMLElement).offsetHeight || 1;
      const ids = orderRef.current;
      const target = Math.min(ids.length - 1, Math.max(0, Math.floor((e.clientY - rect.top) / rowH)));
      if (target !== from) {
        const next = [...ids];
        const [moved] = next.splice(from, 1);
        next.splice(target, 0, moved);
        setOrder(next);
        dragIndexRef.current = target;
      }
    };
    const up = () => {
      if (dragIndexRef.current === null) return;
      dragIndexRef.current = null;
      setDragging(false);
      void db.setlists.update(setlistId, { songIds: orderRef.current });
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
   *  simple pointer-Y arithmetic; the list live-reorders under the finger and
   *  the result persists on release (window listeners above). */
  const onHandleDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragIndexRef.current = index;
    setDragging(true);
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

      <div ref={listRef} style={{ marginTop: 8 }}>
        {songsInOrder.map((song, i) => (
          <div
            className={`list-item${dragging && dragIndexRef.current === i ? ' dragging' : ''}`}
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
