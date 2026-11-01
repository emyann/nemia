/**
 * The command lines a run's page shows a person beside its controls, each built off the orchestrator's table (`commandLine` over
 * `COMMANDS`), so the board spells none.
 */
import { commandLine } from 'agent-orchestrator';
import { commandNamed } from '../store.ts';

const DECIDE = commandNamed('decide');
const APPROVE = commandNamed('approve');
const RETRY = commandNamed('retry');
const SAY = commandNamed('say');
const REFRESH = commandNamed('refresh');

/** The line that prints what there is to decide on a run: `nemia decide <run>`. */
export const decideLine = (runId: string): string => commandLine(DECIDE, { runId });

/**
 * The line that takes the new revisions of every kind a run resolved: `nemia refresh <run>`, the run alone — the step refresh takes is
 * `--base`'s (`nemia refresh <run> [<step>] --base`), which this line does not ask, so it is not said, not even as `[<step>]`.
 */
export const refreshLine = (runId: string): string =>
  commandLine(
    { name: REFRESH.name, spec: { ...REFRESH.spec, positionals: REFRESH.spec.positionals.filter((p) => p.key === 'runId') } },
    { runId },
  );

/** A step's lines beside its controls: its approval at its gate, a try in its session, and words said to it. */
export type StepCommands = { approve: string; retry: string; say: string };

/** A step's lines: `nemia approve <run> <step>`, `nemia retry <run> <step>` and `nemia say <run> <step>`. */
export const stepCommands = (runId: string, step: string): StepCommands => ({
  approve: commandLine(APPROVE, { runId, step }),
  retry: commandLine(RETRY, { runId, step }),
  say: commandLine(SAY, { runId, step }),
});
