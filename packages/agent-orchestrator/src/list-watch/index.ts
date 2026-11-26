/** The face of `list-watch/`: what a watch of a list says changed, and the watched kinds a watch from a revision is asked of. */
export { watchChanges } from './list-watch.ts';
export type { Versioned } from './list-watch.ts';
export { isWatchedKind, revisionTable, DEFINITIONS_PREFIX, REPO_SCOPE } from './kind-watch.ts';
export type { KindChange, WatchedKind } from './kind-watch.ts';
