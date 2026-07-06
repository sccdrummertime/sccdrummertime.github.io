# Open Metronome

A free, open-source metronome and practice tracker. **No subscriptions, no cloud, no ads,
no caps — every feature for every user.** All data stays on your device.

## Features

- **Precise engine** — lookahead scheduling on the audio clock (no drift), timer runs in a
  Web Worker so background-tab throttling can't break timing.
- **Tap tempo**, 20–400 BPM.
- **Time signatures** — presets (2/4 … 12/8) plus fully custom, with musical default accents
  (6/8 pulses on 1 and 4).
- **Subdivisions** — eighths, triplets, sixteenths.
- **Per-beat accents** — tap any beat to cycle normal → accent 1 → 2 → 3 → silent.
- **5 synthesized click sounds** — no samples to decode, sample-accurate at high BPM.
- **Screen flash** visual beat cue.
- **Tempo trainer** — BPM ramps up (or down) every N bars toward a target.
- **Muted beats trainer** — random-beat or whole-bar muting to internalize the pulse.
- **Auto-stop** after a set number of bars or seconds.
- **Song & setlist library** — unlimited, searchable, shareable as a JSON file (validated on
  import — schema-versioned).
- **Practice tracking** — automatic session detection (1+ minute runs are logged; short
  breaks merge into one session), 4-week calendar, streaks, highscores, stopwatch,
  best-effort local reminders.
- **Chromatic tuner** — microphone pitch detection (McLeod method via [pitchy]), adjustable
  A4 reference.
- **Dark & light themes.** Installable PWA, works fully offline.

[pitchy]: https://github.com/ianprime0509/pitchy

## Run it

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (engine, practice logic, import/export)
npm run build      # type-check + production build (dist/)
```

Serve `dist/` from any static host. Being a PWA, it installs to the home screen on
iPhone/Android and runs offline.

## Architecture

- `src/engine/` — framework-free metronome core: `scheduler.ts` (Web Worker tick +
  AudioContext lookahead scheduling), `sounds.ts` (synthesized clicks), `patterns.ts`
  (pure meter/accent/trainer math), `tapTempo.ts`.
- `src/db/` — Dexie (IndexedDB) storage for songs, setlists, sessions; versioned +
  validated JSON export/import.
- `src/features/` — practice-session logic (pure + tested) and the tuner hook.
- `src/state/` — zustand stores bridging the engine singleton and React.
- `src/ui/` — the five screens.

Platform notes: LED/torch flash was deliberately left out (driver latency makes it lag the
beat; strobing is also a photosensitivity hazard). Reminders use the Notification API and
are best-effort on web — they become fully reliable if the app is later wrapped natively
(Capacitor), which the engine/data layers were structured to allow.

## License

MIT — see [LICENSE](LICENSE).
