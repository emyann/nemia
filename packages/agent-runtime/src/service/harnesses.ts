/** What the harnesses an engine runs when its options name none (`default-harnesses.ts`) refuse of a task's configuration. */
import { argsRefusalOf, type HarnessArgs } from '../harness/args.ts';
import { harnessRefusalOf } from './harness-refusal.ts';
import { DEFAULT_HARNESSES } from './default-harnesses.ts';

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
