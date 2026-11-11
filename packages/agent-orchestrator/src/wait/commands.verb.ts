/** `nemia hold`, an entry of the command table: a run held until other runs land or a person lifts it (`hold`), or lifted (`unhold`). */
import { BY_CAP, WHY_CAP, type Hold } from '../record/record.ts';
import { holdWord } from './wait.ts';
import { hold, unhold } from './wait.verb.ts';
import { Effect, Schema } from 'effect';
import { RunHold } from 'objects';
import { checked, type Command } from '../command/entry.verb.ts';
import { saidFlags, saidOf, saidRefusal, takesFor, takesOf, type Args, type Said } from '../command/command.ts';

/** The values under `key`, in the order given, or none. */
const listOf = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : [];
};

/** `nemia hold`'s two forms, as each of its refusals ends on them. */
const HOLD_SHAPE = 'nemia hold <runId> [--until <runId> ...] [--why "<words>"] [--by <name>], or nemia hold <runId> --off';

/** `nemia hold`'s `--why` and `--by`. */
const SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the run is held', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who puts the hold, by a name', cap: BY_CAP },
];

/** `--until`'s refusal of a value left out, saying what it takes. */
const UNTIL_TAKES = `--until takes the run to wait on, by id: ${HOLD_SHAPE}.`;

/** `--until`, `--why` and `--by`, each with its refusal of a value left out, saying what it takes. */
const HOLD_TAKES: Readonly<Record<string, string>> = { '--until': UNTIL_TAKES, ...takesOf(SAID, HOLD_SHAPE) };

/**
 * Refused of `nemia hold`'s arguments before any run is read: a run to wait on empty or starting `-`, what `saidRefusal` refuses of `--why`
 * and `--by`; then together: `--until` and `--off` both, and `--why` or `--by` with `--off`. Neither `--until` nor `--off` is a hold that
 * names no run, which a person alone lifts. A run named twice is the verb's to refuse (`holdRefusal`), in its words.
 */
function holdArgsRefusal(args: Args): string | null {
  const until = listOf(args, 'until');
  const off = args.off === true;
  if (until.some((id) => !id || id.startsWith('-'))) return UNTIL_TAKES;
  const said = SAID.map((s) => saidRefusal(args, s, HOLD_TAKES)).find((r) => r !== null);
  if (said) return said;
  if (off && until.length) return `nemia hold takes --until or --off, not both: lift the hold first, then hold it again — ${HOLD_SHAPE}.`;
  if (off && (args.why !== undefined || args.by !== undefined))
    return `nemia hold --off lifts the hold whole, and takes no --why or --by: those go with the hold put next — ${HOLD_SHAPE}.`;
  return null;
}

/**
 * What `nemia hold` takes: the run, the hold as the api is sent it (`objects`' `RunHold`: `until`, `why`, `by`), and `off`, its lift — the
 * api's `DELETE …/hold`, never its `POST`.
 */
export const HoldInput = Schema.Struct({ runId: Schema.String, ...RunHold.fields, off: Schema.optionalKey(Schema.Boolean) });
export type HoldInput = typeof HoldInput.Type;

/**
 * `nemia hold`: a run held until other runs land, or, naming none, until a person lifts it, or with `--off` its hold lifted now. The api
 * serves both: it puts a hold on `POST /api/runs/:runId/hold`, whose route fixes `off` false so no body lifts through it, and lifts one on
 * `DELETE /api/runs/:runId/hold`.
 */
export const HOLD: Command<{ id: string; lifted: boolean; hold: Hold }, HoldInput> = {
  name: 'hold',
  served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'unhold' }],
  usage: '<runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
  help: [
    'file nothing more of a run until other runs land, as --after would',
    'have: what is in flight finishes, nothing new is filed, and nothing',
    'is asked of you — nemia ls and nemia decide say held until <run> lands, and',
    'what a step asks is asked once the hold lifts. The tick lifts it when',
    'every run named has landed. With no --until, the run is held until a',
    'person lifts it (--off), and no tick lifts it: nemia ls and nemia',
    'decide say held until a person lifts it. Refused of a run cancelled,',
    'pruned, finished or already held, and of a run named that is unknown,',
    'the run itself, or one that already waits on it, through --after or a',
    'hold.',
    '--why: the reason, shown beside held until <run> lands wherever it is',
    'said; --by: who puts the hold (default: your OS user).',
    'nemia hold <runId> --off: lift the hold now, and the next tick goes on as',
    'if it had never been put',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--until', kind: 'text', key: 'until', takes: UNTIL_TAKES, many: true },
      ...saidFlags(SAID, 'nemia hold', 'a hold', HOLD_TAKES, HOLD_SHAPE),
      { flag: '--off', kind: 'switch', key: 'off' },
    ],
    unknown: (arg) => `nemia hold does not take ${arg}. It takes the run, then the runs it waits on or --off: ${HOLD_SHAPE}.`,
    apart: (_value, flag) => takesFor(HOLD_TAKES, flag),
    missing: 'nemia hold takes the run first: nemia hold <runId> [--until <runId> ...], or nemia hold <runId> --off.',
  },
  check: holdArgsRefusal,
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `hold` and `unhold` of `objects`' Api, calling this handler" },
  input: HoldInput,
  handler: Effect.fnUntraced(function* (input: HoldInput) {
    yield* checked(holdArgsRefusal(input));
    const { runId } = input;
    if (input.off === true) {
      const { run, hold: lifted } = yield* unhold(runId);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const { run, hold: put } = yield* hold(runId, [...(input.until ?? [])], { why: saidOf(input, 'why'), by: saidOf(input, 'by') });
    return { id: run.id, lifted: false, hold: put };
  }),
  print: ({ id, lifted, hold: put }) => [
    lifted
      ? `${id}  hold lifted — the next tick goes on, and what its steps ask is asked`
      : `${id}  ${holdWord(
          put.until.map((u) => ({ run: u })),
          put,
        )} — nothing more of it is filed, and nothing is asked of you, until then; ${put.until.length ? 'the next tick lifts the hold' : `no tick lifts it: nemia hold ${id} --off`}`,
  ],
};
