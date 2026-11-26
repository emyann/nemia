/**
 * The words of `nemia condition`: a condition a check of a step waits on, written for the try the step is on, by a person or by a
 * template's program (`WRITTEN_CONDITION_STATUSES`). Pure.
 */
import type { Args, CommandWords } from './command.ts';
import { WRITTEN_CONDITION_STATUSES } from './words.ts';

/** The command's form, which each refusal ends on. */
const CONDITION_SHAPE = `nemia condition <runId> <step> <name> --status ${WRITTEN_CONDITION_STATUSES.join('|')} [--message "<words>"] [--try <n>]`;

/**
 * The refusal of `nemia condition` given no status, one that is none of `WRITTEN_CONDITION_STATUSES`, or a try that is no whole number
 * from 1; null where none is.
 * @param args The command line's arguments, by key.
 */
export function conditionRefusal({ status, try: tried }: Args) {
  if (typeof status !== 'string' || !WRITTEN_CONDITION_STATUSES.some((s) => s === status))
    return `--status takes ${WRITTEN_CONDITION_STATUSES.join(', ')}, and here it is ${typeof status === 'string' ? status : 'left out'}: ${CONDITION_SHAPE}.`;
  if (typeof tried === 'string' && !/^[1-9][0-9]*$/.test(tried))
    return `--try takes the try of the step the status speaks of, a whole number from 1, and here it is ${tried}: ${CONDITION_SHAPE}.`;
  return null;
}

/** `nemia condition`: a condition of a step written for its try, True, False or Unknown, with the writer's words. */
export const CONDITION_WORDS = {
  name: 'condition',
  served: [{ endpoint: 'runs.condition' }],
  usage: '<runId> <step> <name> --status True|False|Unknown [--message "<words>"] [--try <n>]',
  help: [
    'write a condition a check of the step waits on (condition: <name> in its checks:): True lets',
    'the step go on, False refuses it as a failed check is (it counts against retries:, then waits',
    'on you), Unknown leaves it waiting. It speaks of one try of the step: --try, else the try the',
    "step is on now; a status for any other try is refused. The step's own session, and its checks,",
    "are refused: a step never vouches for its own work. A template's program writes it with the",
    'session token it is given.',
    '--message: the words that go with the status; a False one is handed to the next try as the',
    "check's output",
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
      { key: 'condition', takes: 'required', kind: 'name' },
    ],
    flags: [
      {
        flag: '--status',
        kind: 'name',
        key: 'status',
        takes: `--status takes ${WRITTEN_CONDITION_STATUSES.join(', ')}: ${CONDITION_SHAPE}.`,
        twice: `nemia condition takes --status once: ${CONDITION_SHAPE}.`,
      },
      {
        flag: '--message',
        kind: 'text',
        key: 'message',
        takes: `--message takes the words that go with the status, quoted: ${CONDITION_SHAPE}.`,
        twice: `nemia condition takes --message once: put all your words in it, quoted — ${CONDITION_SHAPE}.`,
      },
      {
        flag: '--try',
        kind: 'name',
        key: 'try',
        takes: `--try takes the try of the step the status speaks of: ${CONDITION_SHAPE}.`,
        twice: `nemia condition takes --try once: ${CONDITION_SHAPE}.`,
      },
    ],
    unknown: (arg) =>
      `nemia condition does not take ${arg}. It takes the run, the step, the condition's name, --status, --message and --try: ${CONDITION_SHAPE}.`,
    missing: `nemia condition takes the run, the step and the condition's name: ${CONDITION_SHAPE}.`,
  },
  check: conditionRefusal,
  writes: true,
  ticks: true,
  class: 'act',
} as const satisfies CommandWords;
