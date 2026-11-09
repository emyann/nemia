/**
 * What this browser keeps for the board — an arrangement, the open runs, the bar's width, a message that did not go — each under a key of
 * its own in `localStorage`, and the one door every page keeps it through. A browser that refuses storage, or a sandboxed frame that
 * throws on reading `localStorage` itself, keeps nothing and throws nothing: what is set lasts as long as the page does.
 */

/** What is kept under `key`, read by `parse`: `none` where nothing is kept, `parse` reads nothing in it, or storage is refused. */
export function readStored<T>(key: string, parse: (raw: string) => T | undefined, none: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? none : (parse(raw) ?? none);
  } catch {
    return none;
  }
}

/** Keeps `value` under `key`: where storage is refused or full, nothing is kept. */
export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/** Forgets what is kept under `key`: where storage is refused, nothing was kept to forget. */
export function forgetStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}
