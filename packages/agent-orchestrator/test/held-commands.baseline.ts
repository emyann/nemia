/**
 * The store verbs the in-process CLI still serves, group by group, while their move to the client is in flight (`heldBreaks`,
 * `src/command/command.ts`): a name leaves its group in the change that moves its words into `objects`' `COMMAND_WORDS` and its runner
 * into `apps/cli`. The lists only shrink, and none joins one. `KEPT` is what stays for good, each with why.
 */

/**
 * What this CLI keeps beside the verbs about this machine: the readiness read, whose `doctor` and `doctor fix` the client asks the api
 * for itself (`apps/cli/src/doctor.ts`) while their help is printed here and `doctor carry` reads this machine's own files in process,
 * whatever the context; `readiness`, the retired word the client refuses naming `nemia doctor`; and `daemon`, which the client spawns
 * here as `daemon --json` to start this machine's daemon on demand (`apps/cli/src/daemon.ts`): it is what starts one, not a read of a
 * store, which `nemia daemon` asks the api for itself (`apps/cli/src/reads/daemon.ts`).
 */
export const KEPT: readonly string[] = ['doctor', 'doctor fix', 'doctor carry', 'readiness', 'daemon'];

/** The run's verbs. */
export const HELD_RUN: readonly string[] = [];

/** The inbox's writes and the labels. */
export const HELD_INBOX: readonly string[] = [];

/** The factories' verbs. */
export const HELD_FACTORY: readonly string[] = [];

/** The policies and the rest of the agents' and workflows' verbs. */
export const HELD_DEFINITION: readonly string[] = [];

/** The moved reads whose words and help are still here: none, each said in `objects`' `READ_WORDS`. */
export const HELD_READ: readonly string[] = [];

/** The rest of the store's verbs. */
export const HELD_REST: readonly string[] = [];

/** Every store verb this CLI still serves. */
export const HELD: readonly string[] = [...HELD_RUN, ...HELD_INBOX, ...HELD_FACTORY, ...HELD_DEFINITION, ...HELD_READ, ...HELD_REST];
