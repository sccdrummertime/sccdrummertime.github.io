# Open Metronome — project rules

React + TypeScript + Vite PWA. Free/open-source metronome; MIT; all data local (IndexedDB
via Dexie); no cloud, no accounts, no ads, no feature caps — ever.

## Commands
- `npm run dev` — dev server (or the `metronome-dev` launch config)
- `npm test` — vitest unit tests
- `npm run build` — `tsc --noEmit` + vite build (must pass before any commit)

## Hard rules
- **Timing goes through the engine.** All click scheduling uses the AudioContext clock via
  `src/engine/scheduler.ts` (Web Worker tick + lookahead). Never use `setInterval`/`setTimeout`
  for beat timing.
- `src/engine/` and `src/features/practice/logic.ts` stay framework-free and pure where
  possible — they are unit-tested and must remain portable to a future native (Capacitor) wrap.
- **Never trust imported data**: everything entering IndexedDB from a file goes through
  `sanitizeSong`/`importLibrary` validation. Bump `SCHEMA_VERSION` on any export-format change.
- **User data must survive deploys.** IndexedDB is per-origin and untouched by shipping new
  code — keep it that way. Dexie schema changes are the ONLY thing that can wipe a user's
  library: only ever *add* stores/indexes with a new, higher `this.version(n)` block; never
  drop or rename a store or lower the version; when transforming data provide an `.upgrade()`
  that preserves rows. Any `db.ts` schema change requires a migration test in `*.test.ts`
  proving existing data survives. Never call `db.delete()` / clear stores outside an explicit
  user action.
- No new runtime dependencies without a stated reason; no analytics/telemetry of any kind.
- Engine or logic changes require a test in the matching `*.test.ts`; run `npm test` and
  `npm run build` before committing.
