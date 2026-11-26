/**
 * The words of `nemia assign`: a run in someone's hand, who answers what it asks of a person until they give it back (`--off`), the run
 * is over, or an ask goes unanswered past their time (`--for`, an hour unless another is given). Pure.
 */
import type { Args, CommandWords } from './command.ts';
import { saidFlags, saidRefusal, takesFor, takesOf, type Said } from './commands-flags.ts';
import { BY_CAP, WHY_CAP } from './commands-runs-act.ts';
import { timeoutRefusal } from './commands-runs-pause.ts';

/** `nemia assign`'s two forms, as each of its refusals ends on them. */
const ASSIGN_SHAPE = 'nemia assign <runId> [--to <name>] [--why "<words>"] [--for <d>], or nemia assign <runId> --off';

/** `nemia assign`'s `--to` and `--why`. */
const ASSIGN_SAID: readonly Said[] = [
  { flag: '--to', key: 'to', takes: 'who has the run in hand, by a name', cap: BY_CAP },
  { flag: '--why', key: 'why', takes: 'the words for why they have it', cap: WHY_CAP },
];

/** `--for`'s refusal of a value left out, saying what it takes. */
const FOR_TAKES = `--for takes how long an ask may wait on the assignee, as --for 1h: ${ASSIGN_SHAPE}.`;

/** `--to`, `--why` and `--for`, each with its refusal of a value left out, saying what it takes. */
const ASSIGN_TAKES: Readonly<Record<string, string>> = { ...takesOf(ASSIGN_SAID, ASSIGN_SHAPE), '--for': FOR_TAKES };

/**
 * Refused of `nemia assign`'s arguments before any run is read: what `saidRefusal` refuses of `--to` and `--why`, a `--for` out of a
 * timeout's form (`timeoutRefusal`), and `--off` with any of the three, which go with the assignee put next.
 * @param args The command line's arguments, by key.
 */
export function assignRefusal(args: Args) {
  const said = ASSIGN_SAID.map((s) => saidRefusal(args, s, ASSIGN_TAKES)).find((r) => r !== null);
  if (said) return said;
  const time = args.for;
  if (typeof time === 'string') {
    if (time.startsWith('--')) return FOR_TAKES;
    const wrong = timeoutRefusal(time);
    if (wrong !== undefined) return `--for: ${wrong}: ${ASSIGN_SHAPE}, as nemia assign <runId> --for 2h.`;
  }
  if (args.off === true && (args.to !== undefined || args.why !== undefined || args.for !== undefined))
    return `nemia assign --off gives the run back whole, and takes no --to, --why or --for: those go with the assignee put next — ${ASSIGN_SHAPE}.`;
  return null;
}

/** `nemia assign`: a run in someone's hand; with `--off`, given back now. */
export const ASSIGN_WORDS = {
  name: 'assign',
  served: [{ endpoint: 'runs.assign' }, { endpoint: 'runs.unassign', as: 'unassign' }],
  usage: '<runId> [--to <name>] [--why "<words>"] [--for <d>]',
  help: [
    'say who has a run in hand: what it asks of a person — an approval, a',
    'question, a retry, a budget, a hold only a person ends — is theirs to',
    'answer, and leaves waiting on you, the bell and the counts, until they',
    'give it back (--off), the run is over, or an ask waits on them past',
    'their time, when it is yours again. Nothing is refused because of it:',
    'anyone may still answer. nemia ls says assigned to <name>. Refused of a',
    'run cancelled, pruned or over, and of one someone already has in hand.',
    '--to: who has it (default: your OS user); --why: the reason;',
    '--for: how long an ask may wait on them (90s, 10m, 2h; from 1s to 23h;',
    'default 1h).',
    'nemia assign <runId> --off: give the run back now',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      ...saidFlags(ASSIGN_SAID, 'nemia assign', 'an assignee', ASSIGN_TAKES, ASSIGN_SHAPE),
      { flag: '--for', kind: 'text', key: 'for', takes: FOR_TAKES, twice: `nemia assign takes --for once: an assignee has one time. ${ASSIGN_SHAPE}.` },
      { flag: '--off', kind: 'switch', key: 'off' },
    ],
    unknown: (arg) => `nemia assign does not take ${arg}. It takes the run, then who has it or --off: ${ASSIGN_SHAPE}.`,
    apart: (_value, flag) => takesFor(ASSIGN_TAKES, flag),
    missing: 'nemia assign takes the run first: nemia assign <runId> [--to <name>], or nemia assign <runId> --off.',
  },
  check: assignRefusal,
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `assign` and `unassign` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;
