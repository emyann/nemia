/** The harnesses an engine runs when its options name none, and what they refuse of a task's configuration. */
import { claudeDetached } from '../harness/claude/index.ts';
import { codex } from '../harness/codex/codex.ts';
import { commandHarness } from '../harness/command/command.ts';
import { argsRefusalOf, type HarnessArgs } from '../harness/args.ts';
import { harnessRefusalOf, type HarnessConfig } from '../facade/consumer.ts';

/** The harnesses of an engine given none: Claude Code, Codex, `claude -p` on the detached worker, and a process. */
export const DEFAULT_HARNESSES: Record<string, HarnessConfig> = {
  claude: 'claude',
  codex,
  'claude-detached': claudeDetached,
  command: commandHarness,
};

/**
 * Why a task filed on `harness` with `config` would be refused, in the runtime's words, or `undefined`: what `file()` of an engine given
 * no harnesses refuses of a task's configuration, for a caller that checks one before it files it. Takes the name of one of
 * `DEFAULT_HARNESSES` and the task's `config`, as `file()` takes them. Refuses, in order: what no harness could use (`argsRefusalOf`) —
 * a key that is no harness argument, an empty model or effort, a list that is not one of tool names or rules, a cap that is not dollars;
 * then a harness this engine does not have, and what the harness named has no knob for or refuses in its own words (`harnessRefusalOf`) —
 * a mode, an effort or a window it does not take, a background session, a spend cap, a tool list or Claude Code's flags where it has none.
 * A remote agent's entry is `remoteConfigRefusal`'s.
 */
export const configRefusal = (harness: string, config: HarnessArgs): string | undefined =>
  argsRefusalOf({ config }) ?? harnessRefusalOf({ brief: '', cwd: '', harness, config }, DEFAULT_HARNESSES);
