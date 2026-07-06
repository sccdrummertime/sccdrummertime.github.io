import { useEffect, useRef, useState } from 'react';
import { db, type Setlist, type Song } from '../db/db';
import { exportLibrary, importLibrary } from '../db/transfer';
import { useMetro } from '../state/metro';
import { SetlistDetail } from './SetlistDetail';

export function LibraryScreen({ goToMetronome }: { goToMetronome: () => void }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [openSetlistId, setOpenSetlistId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { applySong, beginNewSong, beginEditSong } = useMetro();

  const refresh = async () => {
    setSongs(await db.songs.orderBy('name').toArray());
    setSetlists(await db.setlists.orderBy('name').toArray());
  };
  useEffect(() => {
    void refresh();
  }, [openSetlistId]);

  const newSong = () => {
    const name = prompt('Song name?');
    if (!name?.trim()) return;
    beginNewSong(name.trim());
    goToMetronome();
  };

  const editSong = (song: Song) => {
    beginEditSong(song);
    goToMetronome();
  };

  const loadSong = (song: Song) => {
    useMetro.getState().exitSetlist();
    applySong(song);
    goToMetronome();
  };

  const deleteSong = async (song: Song) => {
    if (!confirm(`Delete “${song.name}”?`)) return;
    await db.songs.delete(song.id!);
    // also remove from any setlists
    for (const sl of await db.setlists.toArray()) {
      if (sl.songIds.includes(song.id!)) {
        await db.setlists.update(sl.id!, { songIds: sl.songIds.filter((i) => i !== song.id) });
      }
    }
    await refresh();
  };

  const createSetlist = async () => {
    const name = prompt('Setlist name?');
    if (!name?.trim()) return;
    const id = await db.setlists.add({ name: name.trim(), songIds: [], createdAt: Date.now() });
    setOpenSetlistId(id); // jump straight in so songs can be added immediately
  };

  const doExport = async () => {
    const json = await exportLibrary();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'open-metronome-library.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const doImport = async (file: File) => {
    try {
      const result = await importLibrary(await file.text());
      setStatus(
        `Imported ${result.songs} song(s), ${result.setlists} setlist(s).` +
          (result.skipped ? ` Skipped ${result.skipped} invalid entr${result.skipped === 1 ? 'y' : 'ies'}.` : ''),
      );
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.');
    }
  };

  if (openSetlistId !== null) {
    return (
      <SetlistDetail
        setlistId={openSetlistId}
        goBack={() => setOpenSetlistId(null)}
        goToMetronome={goToMetronome}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? songs.filter((s) => s.name.toLowerCase().includes(q)) : songs;

  return (
    <div className="screen">
      <h2 className="screen-title">Library</h2>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <button className="primary" onClick={newSong}>
          + Add new song
        </button>
        <button onClick={createSetlist}>New setlist</button>
        <button onClick={doExport}>Export</button>
        <button onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doImport(f);
            e.target.value = '';
          }}
        />
      </div>
      {status && <div className="muted-note">{status}</div>}

      {setlists.length > 0 && (
        <>
          <h2 className="screen-title" style={{ marginTop: 12 }}>
            Setlists
          </h2>
          {setlists.map((sl) => (
            <div
              className="list-item"
              key={sl.id}
              style={{ cursor: 'pointer' }}
              onClick={() => setOpenSetlistId(sl.id!)}
            >
              <div>
                <div>{sl.name}</div>
                <div className="meta">
                  {sl.songIds.length} song{sl.songIds.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="row" style={{ margin: 0 }}>
                <button onClick={(e) => { e.stopPropagation(); setOpenSetlistId(sl.id!); }}>
                  Open
                </button>
                <button
                  className="ghost"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete setlist “${sl.name}”?`)) {
                      await db.setlists.delete(sl.id!);
                      await refresh();
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <h2 className="screen-title" style={{ marginTop: 12 }}>
        Songs
      </h2>
      <input
        className="search"
        placeholder="Search songs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 && <div className="sub">No songs yet. Tap “+ Add new song” to create one.</div>}
      {filtered.map((song) => (
        <div className="list-item" key={song.id}>
          <div>
            <div>{song.name}</div>
            <div className="meta">
              {song.bpm} BPM · {song.signature.beats}/{song.signature.unit}
            </div>
          </div>
          <div className="row" style={{ margin: 0 }}>
            <button className="primary" onClick={() => loadSong(song)}>
              Load
            </button>
            <button onClick={() => editSong(song)}>Edit</button>
            <button className="ghost" onClick={() => void deleteSong(song)}>
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
