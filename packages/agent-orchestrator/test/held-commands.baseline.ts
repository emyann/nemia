/**
 * The store verbs the in-process CLI still serves, group by group, while their move to the client is in flight (`heldBreaks`,
 * `src/command/command.ts`): a name leaves its group in the change that moves its words into `objects`' `COMMAND_WORDS` and its runner
 * into `apps/cli`. The lists only shrink, and none joins one. `KEPT` is what stays for good, each with why.
 */

/**
 * What this CLI keeps beside the verbs about this machine: the readiness read, whose `doctor` and `doctor fix` the client asks the api
 * for itself (`apps/cli/src/doctor.ts`) while their help is printed here and `doctor carry` reads this machine's own files in process,
 * whatever the context; and `readiness`, the retired word the client refuses naming `nemia doctor`.
 */
export const KEPT: readonly string[] = ['doctor', 'doctor fix', 'doctor carry', 'readiness'];

/** The run's verbs. */
export const HELD_RUN: readonly string[] = [];

/** The inbox's writes and the labels. */
export const HELD_INBOX: readonly string[] = ['inbox add', 'inbox queue', 'inbox from', 'inbox rm', 'label run', 'label inbox'];

/** The factories' verbs. */
export const HELD_FACTORY: readonly string[] = [
  'factory',
  'factory ls',
  'factory add',
  'factory apply',
  'factory adopt',
  'factory diff',
  'factory upgrade',
  'factory resolve',
  'factory attach',
  'factory detach',
  'factory hire',
  'factory fire',
  'factory schedule',
  'factory unschedule',
  'factory servers',
  'factory server add',
  'factory server rm',
  'factory volume add',
  'factory volume rm',
  'factory setting set',
  'factory setting rm',
  'factory cost-line set',
  'factory cost-line rm',
  'factory rules',
  'factory instruction',
  'factory instruct',
  'factory revisions',
  'factory trust',
  'factory rm',
];

/** The policies and the rest of the agents' and workflows' verbs. */
export const HELD_DEFINITION: readonly string[] = [
  'agents',
  'agents card',
  'agents sources',
  'agents custom',
  'agents copy',
  'agents rm',
  'agents run',
  'policy',
  'policy propose',
  'policy confirm',
  'policy rm',
  'policy reach',
  'workflows rm',
];

/** The moved reads, whose words and help are still here. */
export const HELD_READ: readonly string[] = ['inbox', 'ls', 'show', 'closeout', 'watch'];

/** The rest of the store's verbs. */
export const HELD_REST: readonly string[] = [
  'concluded',
  'logs',
  'stats',
  'passes',
  'series',
  'subscribe',
  'unsubscribe',
  'level',
  'memory',
  'chat speakers',
  'chat allow',
  'chat disallow',
  'pairings ls',
  'pairings approve',
  'board link',
  'daemon',
];

/** Every store verb this CLI still serves. */
export const HELD: readonly string[] = [...HELD_RUN, ...HELD_INBOX, ...HELD_FACTORY, ...HELD_DEFINITION, ...HELD_READ, ...HELD_REST];
