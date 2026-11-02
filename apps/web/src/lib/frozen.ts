/**
 * `T` read only, all the way down: what a reader takes where both a run's view (`RunView`, every array of it read only, as the generated
 * mirror has them) and the api's hand mirrors (`RunSummary`, whose arrays are not) are handed to it. A reader that sorts one
 * copies it first.
 */
export type Frozen<T> = T extends (...args: never[]) => unknown ? T : T extends object ? { readonly [K in keyof T]: Frozen<T[K]> } : T;
