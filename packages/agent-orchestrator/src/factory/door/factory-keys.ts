/**
 * The keys of a factory's records in the keyspace (`src/keyspace/keyspace.store.ts`): the factory itself, its level, its servers and the
 * controller's status of it, each under a prefix of its own and the factory's name, the default factory's too where it has one (its
 * servers). Pure: the key a record of the factory `name` is at, and the name a key says.
 */

/** The prefix of every factory's record: what `<root>/factories/<name>.json` held. */
export const FACTORIES_PREFIX = '/registry/factories/';

/** The prefix of every factory's level record: what `<root>/factories/<name>/level.json` held. */
export const LEVELS_PREFIX = '/registry/levels/';

/** The prefix of every factory's servers record: what `<root>/factories/<name>/servers.json` held. */
export const SERVERS_PREFIX = '/registry/servers/';

/** The prefix of every factory's applied status: what `<root>/factories/<name>/status.json` held. */
export const APPLIED_PREFIX = '/registry/applied/';

/**
 * The key of the factory `name`'s record.
 * @param name The factory's name.
 */
export const factoryKey = (name: string) => `${FACTORIES_PREFIX}${name}`;

/**
 * The key of the factory `name`'s level record.
 * @param name The factory's name.
 */
export const levelKey = (name: string) => `${LEVELS_PREFIX}${name}`;

/**
 * The key of the factory `name`'s servers record.
 * @param name The factory's name.
 */
export const serversKey = (name: string) => `${SERVERS_PREFIX}${name}`;

/**
 * The key of the factory `name`'s applied status.
 * @param name The factory's name.
 */
export const appliedKey = (name: string) => `${APPLIED_PREFIX}${name}`;
