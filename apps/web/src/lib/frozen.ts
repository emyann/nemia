/**
 * `T` read only, all the way down: what a reader takes where a value read only (a run's view, `RunView`, every array of it read only)
 * and one whose arrays are not (a test's fixture, a value the board builds) are both handed to it. A reader that sorts one copies it
 * first.
 */
export type Frozen<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
