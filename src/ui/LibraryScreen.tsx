import { useEffect, useRef, useState } from 'react';
import { db, type Setlist, type Song } from '../db/db';
import { exportLibrary, importLibrary } from '../db/transfer';
import { useMetro } from '../state/metro';

export function LibraryScreen({ goToMetronome }: { goToMetronome: () => void }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { update, setLoadedSong, beginNewSong, beginEditSong } = useMetro();

  const refresh = async () => {
    setSongs(await db.songs.orderBy('name').toArray());
    setSetlists(await db.setlists.orderBy('name').toArray());
  };
  useEffect(() => {
    void refresh();
  }, []);

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
    update({
      bpm: song.bpm,
      signature: song.signature,
      subdivision: song.subdivision,
      accents: song.accents,
      sound: song.sound,
    });
    setLoadedSong(song.name);
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
    await db.setlists.add({ name: name.trim(), songIds: [], createdAt: Date.now() });
    await refresh();
  };

  const addToSetlist = async (song: Song) => {
    if (setlists.length === 0) {
      setStatus('Create a setlist first.');
      return;
    }
    const names = setlists.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
    const pick = prompt(`Add to which setlist?\n${names}\n\nEnter number:`);
    const idx = Number(pick) - 1;
    const sl = setlists[idx];
    if (!sl) return;
    if (!sl.songIds.includes(song.id!)) {
      await db.setlists.update(sl.id!, { songIds: [...sl.songIds, song.id!] });
      await refresh();
      setStatus(`Added to “${sl.name}”.`);
    }
  };

  const moveInSetlist = async (sl: Setlist, index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= sl.songIds.length) return;
    const songIds = [...sl.songIds];
    [songIds[index], songIds[target]] = [songIds[target], songIds[index]];
    await db.setlists.update(sl.id!, { songIds });
    await refresh();
  };

  const removeFromSetlist = async (sl: Setlist, index: number) => {
    const songIds = sl.songIds.filter((_, i) => i !== index);
    await db.setlists.update(sl.id!, { songIds });
    await refresh();
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

  const q = query.trim().toLowerCase();
  const filtered = q ? songs.filter((s) => s.name.toLowerCase().includes(q)) : songs;
  const songById = new Map(songs.map((s) => [s.id!, s]));

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

      <input
        className="search"
        placeholder="Search songs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 && <div className="sub">No songs yet. Tap “+ New song” to create one.</div>}
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
            <button onClick={() => void addToSetlist(song)}>+ Setlist</button>
            <button className="ghost" onClick={() => void deleteSong(song)}>
              ✕
            </button>
          </div>
        </div>
      ))}

      {setlists.length > 0 && (
        <>
          <h2 className="screen-title" style={{ marginTop: 20 }}>
            Setlists
          </h2>
          {setlists.map((sl) => (
            <div className="card" key={sl.id}>
              <div className="row spread" style={{ margin: 0 }}>
                <h3>{sl.name}</h3>
                <button
                  className="ghost"
                  onClick={async () => {
                    if (confirm(`Delete setlist “${sl.name}”?`)) {
                      await db.setlists.delete(sl.id!);
                      await refresh();
                    }
                  }}
                >
                  ✕
                </button>
              </div>
              {sl.songIds.length === 0 && <div className="sub">Empty — add songs from the list above.</div>}
              {sl.songIds.map((id, i) => {
                const song = songById.get(id);
                if (!song) return null;
                return (
                  <div className="list-item" key={`${id}-${i}`}>
                    <div>
                      {i + 1}. {song.name} <span className="meta">{song.bpm} BPM</span>
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <button
                        aria-label={`Move ${song.name} up`}
                        disabled={i === 0}
                        onClick={() => void moveInSetlist(sl, i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${song.name} down`}
                        disabled={i === sl.songIds.length - 1}
                        onClick={() => void moveInSetlist(sl, i, 1)}
                      >
                        ↓
                      </button>
                      <button onClick={() => loadSong(song)}>Load</button>
                      <button
                        className="ghost"
                        aria-label={`Remove ${song.name} from ${sl.name}`}
                        onClick={() => void removeFromSetlist(sl, i)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
