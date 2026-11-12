/**
 * The verbs about the machine a command line is typed on, never a daemon's store (the distribution intent's Q6): its login service, its
 * releases, a daemon of its own, what it runs, the person's tokens of its store and its Claude token, and the verbs that read and write
 * files of this machine and no store (`template`, `frontmatter`, `admit`). Each is named by its first word, runs on the orchestrator's own
 * CLI whatever context is in use, and is the only kind of command that CLI still serves. Pure.
 */
export const MACHINE_VERBS = [
  'service',
  'upgrade',
  'up',
  'tick',
  'version',
  'token',
  'claude-token',
  'template',
  'frontmatter',
  'admit',
] as const;

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];
