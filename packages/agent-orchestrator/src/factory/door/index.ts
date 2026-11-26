/**
 * The face of `door/`: the keys of a factory's records and how the door counts a factory's generation, re-exported by name. The store
 * files of the folder (`factories.store.ts`, `records.store.ts`) are the door's own, and are not on it.
 */
export {
  APPLIED_PREFIX,
  FACTORIES_PREFIX,
  LEVELS_PREFIX,
  SERVERS_PREFIX,
  appliedKey,
  factoryKey,
  levelKey,
  serversKey,
} from './factory-keys.ts';
export { generationOf, generationWritten } from './generation.ts';
