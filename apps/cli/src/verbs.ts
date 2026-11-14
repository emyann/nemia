/**
 * The client's own verb lists, spelled once, read by the route (`src/route.ts`) and its contract (`contracts/route.contract.ts`):
 * no file of `src` imports a value of a contract, which ships the verifier (`tools/guards/test/no-contract-values.test.ts`).
 */

/**
 * The reads this client asks the api for whose help the orchestrator's CLI still holds: `doctor`, whose `fix` starts a fix on the server
 * the context names and follows it (`src/doctor.ts`), and `daemon`, where the store's daemon stands (`src/reads/daemon.ts`), which that CLI
 * keeps as the starter this client spawns on demand. The other reads' words are the client's (`MOVED_COMMANDS`).
 */
export const READ_VERBS = ['doctor', 'daemon'] as const;

/** A read this client asks the api for. */
export type ReadVerb = (typeof READ_VERBS)[number];

/**
 * The verbs this client alone has, generic over every kind the api serves, `channel`, the feed pushed into a Claude Code session
 * (`src/watch/channel.ts`), and `server`, the daemon a context names asked about itself through its api (`nemia server upgrade`,
 * `src/server/upgrade.ts`), never `service`, this machine's login unit, which is a machine verb: no process answers them.
 */
export const CLIENT_VERBS = ['get', 'apply', 'explain', 'propose', 'proposals', 'decide', 'channel', 'server'] as const;

/** One of `CLIENT_VERBS`. */
export type ClientVerb = (typeof CLIENT_VERBS)[number];
