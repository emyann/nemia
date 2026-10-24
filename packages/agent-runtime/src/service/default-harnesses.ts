/**
 * The harnesses an engine runs when its options name none. Here, and not beside what they refuse of a task (`harnesses.ts`), so
 * that what reads them needs nothing else of `service/`: the options read them to know the names the engine will run before it
 * builds (`holdersRefusalOf`), and `harnesses.ts` reaches back into the options for what a harness refuses.
 */
import { codex } from '../harness/codex/codex.ts';
import { commandHarness } from '../harness/command/command.ts';
import type { HarnessConfig } from './options.ts';

/** The harnesses of an engine given none: Claude Code, Codex and a process. */
export const DEFAULT_HARNESSES: Record<string, HarnessConfig> = {
  claude: 'claude',
  codex,
  command: commandHarness,
};
