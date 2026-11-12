/**
 * The lines a person types about a run, built off the orchestrator's table (`COMMANDS`): the run's own (`decideLine`, `refreshLine`),
 * each step's beside its controls (`stepCommands`), and where it came from (`fromNote`) — all of it `runLines`, read once for a run off
 * its record: constant for the run, judging nothing and reading no task.
 */
import { commandLine, type CommandSpec } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import type { Served } from '../command/entry.verb.ts';
import { fromNote } from '../start/index.ts';
import type { Run } from '../record/record.ts';

/**
 * The command of the table (`COMMANDS`) named `name`: thrown as this module loads when the table holds none by that name, so a name the
 * table renamed is a failed start, not a page that fails as it is read.
 */
function named(name: string): Served {
  const command = COMMANDS.find((c) => c.name === name);
  if (command === undefined) throw new Error(`No command '${name}' in the orchestrator's table (COMMANDS): name one it holds.`);
  return command;
}

const APPROVE = named('approve');
const RETRY = named('retry');
const SAY = named('say');
const REFRESH = named('refresh');

/** `nemia decide`, the CLI's own verb (`CLI_VERBS`), as its line takes the run: its read model is `decisionRead`, no entry of the table. */
const DECIDE: Pick<CommandSpec, 'name' | 'spec'> = {
  name: 'decide',
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia decide does not take ${arg}.`,
  },
};

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

/** A run's lines: the run's two, where it came from (null for a run started from no card), and each of its steps' three, by name. */
export type RunLines = {
  decide: string;
  refresh: string;
  fromNote: string | null;
  steps: Record<string, StepCommands>;
};

/**
 * The lines of `run`, off its record alone: one entry per step it froze, in the order it froze them, then any its record holds besides
 * (a record with no frozen workflow names its steps there alone).
 */
export const runLines = (run: Run): RunLines => {
  const names = [...new Set([...(run.workflow ?? []).map((s) => s.name), ...Object.keys(run.steps)])];
  return {
    decide: decideLine(run.id),
    refresh: refreshLine(run.id),
    fromNote: fromNote(run) ?? null,
    steps: Object.fromEntries(names.map((name) => [name, stepCommands(run.id, name)])),
  };
};
