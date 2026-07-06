/** Data durability helpers. Songs/setlists/history live in IndexedDB, which is
 *  scoped to the origin and untouched by code deploys — but browsers may EVICT
 *  best-effort storage under disk pressure, and iOS Safari deletes a plain
 *  website's storage after 7 days of no visits (installed home-screen apps are
 *  exempt). Requesting persistent storage opts our data out of automatic
 *  eviction where the browser supports it. */

export type PersistState = 'persisted' | 'best-effort' | 'unsupported';

/** Ask the browser to make our storage persistent (best-effort, safe to call
 *  repeatedly). Returns the resulting state. */
export async function requestPersistentStorage(): Promise<PersistState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

export async function storageState(): Promise<PersistState> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}
