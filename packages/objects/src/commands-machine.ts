/**
 * The verbs about the machine a command line is typed on, never a daemon's store (the distribution intent's Q6): its login service, its
 * releases, a daemon of its own, what it runs and its Claude token, and the verbs that read and write
 * files of this machine and no store (`template`, `frontmatter`, `admit`). Each is named by its first word, runs on the orchestrator's own
 * CLI whatever context is in use, and is the only kind of command that CLI still serves. Pure.
 */
export const MACHINE_VERBS = ['service', 'upgrade', 'up', 'tick', 'version', 'claude-token', 'template', 'frontmatter', 'admit'] as const;

/** One of `MACHINE_VERBS`. */
export type MachineVerb = (typeof MACHINE_VERBS)[number];

/**
 * The commands the client holds that follow a stream rather than answer once: `watch`, the feed followed as it is written. The MCP port
 * makes a tool of every other command's endpoint (`served`); a stream's form there is `wait`, which answers once what it waited on, so a
 * stream links no endpoint of its own. Pure.
 */
export const STREAM_COMMANDS = ['watch'] as const;

/** One of `STREAM_COMMANDS`. */
export type StreamCommand = (typeof STREAM_COMMANDS)[number];
