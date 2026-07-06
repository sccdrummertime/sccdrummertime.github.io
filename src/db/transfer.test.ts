// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { exportLibrary, importLibrary, sanitizeSong } from './transfer';

beforeEach(async () => {
  await db.songs.clear();
  await db.setlists.clear();
});

const validSong = {
  name: 'Take Five',
  bpm: 172,
  signature: { beats: 5, unit: 4 },
  subdivision: 1,
  accents: ['accent1', 'normal', 'normal', 'accent2', 'normal'],
  sound: 'woodblock',
};

describe('sanitizeSong', () => {
  it('accepts a valid song', () => {
    const s = sanitizeSong(validSong);
    expect(s?.name).toBe('Take Five');
    expect(s?.bpm).toBe(172);
  });
  it('rejects garbage bpm, missing name, bad signature', () => {
    expect(sanitizeSong({ ...validSong, bpm: 'fast' })).toBeNull();
    expect(sanitizeSong({ ...validSong, bpm: 9999 })).toBeNull();
    expect(sanitizeSong({ ...validSong, name: '' })).toBeNull();
    expect(sanitizeSong({ ...validSong, signature: { beats: 0, unit: 4 } })).toBeNull();
    expect(sanitizeSong({ ...validSong, signature: { beats: 4, unit: 5 } })).toBeNull();
    expect(sanitizeSong('not an object')).toBeNull();
  });
  it('repairs fixable fields instead of rejecting', () => {
    const s = sanitizeSong({ ...validSong, accents: ['bogus'], sound: 'airhorn', subdivision: 99 });
    expect(s?.accents).toEqual(['normal', 'normal', 'normal', 'normal', 'normal']);
    expect(s?.sound).toBe('classic');
    expect(s?.subdivision).toBe(1);
  });
});

describe('export/import round trip', () => {
  it('round-trips songs and setlists', async () => {
    const id = await db.songs.add({ ...validSong, createdAt: 1 } as never);
    await db.setlists.add({ name: 'Gig', songIds: [id], createdAt: 1 });
    const json = await exportLibrary();

    await db.songs.clear();
    await db.setlists.clear();
    const result = await importLibrary(json);
    expect(result.songs).toBe(1);
    expect(result.skipped).toBe(0);
    const songs = await db.songs.toArray();
    expect(songs[0].name).toBe('Take Five');
    const setlists = await db.setlists.toArray();
    expect(setlists[0].songIds).toEqual([songs[0].id]);
  });
  it('rejects non-JSON and foreign files', async () => {
    await expect(importLibrary('not json')).rejects.toThrow('valid JSON');
    await expect(importLibrary('{"app":"other"}')).rejects.toThrow('Open Metronome');
    await expect(
      importLibrary(JSON.stringify({ app: 'open-metronome', schemaVersion: 99, songs: [] })),
    ).rejects.toThrow('newer app version');
  });
  it('imports good entries and counts skipped bad ones', async () => {
    const json = JSON.stringify({
      app: 'open-metronome',
      schemaVersion: 1,
      songs: [validSong, { name: 'Broken', bpm: 'nope' }],
      setlists: [],
    });
    const result = await importLibrary(json);
    expect(result.songs).toBe(1);
    expect(result.skipped).toBe(1);
  });
});
