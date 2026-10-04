/**
 * The commands over a run's course and the store's tick, each defined once: `wf cancel` and `wf hold`, whose handlers call the package's
 * verbs (`cancel`, `hold`, `unhold`), the store's cordon (`wf cordon`, `wf uncordon`, and the api's read of it), and `wf tick`, `wf up` and `wf watch`, which the CLI alone serves and runs itself (`RAN`): their
 * specs, refusals and help, with no handler.
 */
import { cancel } from '../cancel/cancel.verb.ts';
import type { CancelPlan } from '../cancel/cancel.ts';
import { everyOf } from '../daemon/daemon.ts';
import { cursorTakes } from '../feed/feed.ts';
import { BY_CAP, oneLine, WHY_CAP, type Hold } from '../record/record.ts';
import { holdWord } from '../wait/wait.ts';
import { hold, unhold } from '../wait/wait.verb.ts';
import { liftCordon, putCordon } from '../cordon/cordon.store.ts';
import { cordonWords, UNCORDONED, type Cordon, type Cordoned } from '../cordon/cordon.ts';
import { cordonRead } from '../list/list.verb.ts';
import type { Args } from './command.ts';
import type { Command, Ran } from './entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The values under `key`, in the order given, or none. */
const listOf = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : [];
};

/** `wf cancel`: what a run has in flight asked to stop, and nothing more filed; the plan it followed, a run already over included. */
export const CANCEL: Command<{ id: string; plan: CancelPlan }> = {
  name: 'cancel',
  usage: '<runId>',
  help: ['stop what it has in flight; file nothing more'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `wf cancel takes one run's id: not ${arg}.`,
  },
  writes: true,
  only: { side: 'cli', why: 'the board offers no cancel: a person stops a run at the command line' },
  async handler(e, args) {
    const { run, plan } = await cancel(e, textOf(args, 'runId') ?? '');
    return { id: run.id, plan };
  },
  print: ({ id, plan }) => {
    if (plan.kind === 'finished') return [`${id}  already ${plan.status} — nothing to stop`];
    const head = plan.kind === 'already-cancelled' ? `${id}  already cancelled at ${plan.at}` : `${id}  cancelled`;
    if (plan.stop.length)
      return [head, `   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`];
    return plan.kind === 'cancel' ? [head, `   nothing was in flight — no further steps will be filed`] : [head];
  },
};

/** `wf hold`'s two forms, as each of its refusals ends on them. */
const HOLD_SHAPE = 'wf hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>], or wf hold <runId> --off';

/** `--why` or `--by`: the flag, the key it fills, what it takes as its refusals say it, and the longest it may be. */
type Said = { readonly flag: '--why' | '--by'; readonly key: 'why' | 'by'; readonly takes: string; readonly cap: number };

/** `wf hold`'s `--why` and `--by`. */
const SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the run is held', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who puts the hold, by a name', cap: BY_CAP },
];

/** Each of `said`'s refusals of a value left out, saying what it takes, ending on the command's forms. */
const takesOf = (said: readonly Said[], shape: string): Readonly<Record<string, string>> =>
  Object.fromEntries(said.map(({ flag, takes }) => [flag, `${flag} takes ${takes}: ${shape}.`]));

/** `--until`, `--why` and `--by`, each with its refusal of a value left out, saying what it takes. */
const HOLD_TAKES: Readonly<Record<string, string>> = {
  '--until': `--until takes the run to wait on, by id: ${HOLD_SHAPE}.`,
  ...takesOf(SAID, HOLD_SHAPE),
};

/** `--why` or `--by`'s value as one line: every run of whitespace, a newline included, one space. */
const saidOf = (args: Args, key: 'why' | 'by'): string | undefined => {
  const value = textOf(args, key);
  return value === undefined ? undefined : oneLine(value, Number.POSITIVE_INFINITY);
};

/**
 * Refused of `--why` or `--by`: a value starting `--`, which reads as the value left out (its refusal in `takes`), blank, or longer than
 * its cap.
 */
function saidRefusal(args: Args, { flag, key, takes, cap }: Said, refusals: Readonly<Record<string, string>>): string | null {
  const value = textOf(args, key);
  if (value === undefined) return null;
  if (value.startsWith('--')) return refusals[flag];
  const line = saidOf(args, key) ?? '';
  if (!line) return `${flag} takes ${takes}, and was given only blanks: give it words, or leave ${flag} out.`;
  if (line.length > cap) return `${flag} takes at most ${cap} characters, and was given ${line.length}: say it shorter.`;
  return null;
}

/** `--why` and `--by` as `command` takes them, for what it puts (`a hold`): each a text flag given once, refused in `refusals`' words. */
const saidFlags = (said: readonly Said[], command: string, puts: string, refusals: Readonly<Record<string, string>>, shape: string) =>
  said.map(({ flag, key }) => ({
    flag,
    kind: 'text' as const,
    key,
    takes: refusals[flag],
    twice: `${command} takes ${flag} once: ${puts} says one ${key}. ${shape}.`,
  }));

/**
 * Refused of `wf hold`'s arguments before any run is read: a run to wait on empty or starting `-`, what `saidRefusal` refuses of `--why`
 * and `--by`; then together: `--until` and `--off` both, `--why` or `--by` with `--off`, and neither `--until` nor `--off`. A run named
 * twice is the verb's to refuse (`holdRefusal`), in its words.
 */
function holdArgsRefusal(args: Args): string | null {
  const until = listOf(args, 'until');
  const off = args.off === true;
  if (until.some((id) => !id || id.startsWith('-'))) return HOLD_TAKES['--until'];
  const said = SAID.map((s) => saidRefusal(args, s, HOLD_TAKES)).find((r) => r !== null);
  if (said) return said;
  if (off && until.length) return `wf hold takes --until or --off, not both: lift the hold first, then hold it again — ${HOLD_SHAPE}.`;
  if (off && (args.why !== undefined || args.by !== undefined))
    return `wf hold --off lifts the hold whole, and takes no --why or --by: those go with --until, on the hold put next — ${HOLD_SHAPE}.`;
  if (!off && !until.length) return `wf hold needs the runs to wait on, or --off to lift a hold: ${HOLD_SHAPE}.`;
  return null;
}

/**
 * `wf hold`: a run held until other runs ship, or with `--off` its hold lifted now. The api serves the lift alone, on
 * `DELETE /api/runs/:runId/hold`; a hold is put at the command line.
 */
export const HOLD: Command<{ id: string; lifted: boolean; hold: Hold }> = {
  name: 'hold',
  usage: '<runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
  help: [
    'file nothing more of a run until other runs ship, as --after would',
    'have: what is in flight finishes, nothing new is filed, and nothing',
    'is asked of you — wf ls and wf decide say held until <run> ships, and',
    'what a step asks is asked once the hold lifts. The tick lifts it when',
    'every run named has shipped. Refused of a run cancelled, pruned,',
    'finished or already held, and of a run named that is unknown, the run',
    'itself, or one that already waits on it, through --after or a hold.',
    '--why: the reason, shown beside held until <run> ships wherever it is',
    'said; --by: who puts the hold (default: your OS user).',
    'wf hold <runId> --off: lift the hold now, and the next tick goes on as',
    'if it had never been put',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--until', kind: 'text', key: 'until', takes: HOLD_TAKES['--until'], many: true },
      ...saidFlags(SAID, 'wf hold', 'a hold', HOLD_TAKES, HOLD_SHAPE),
      { flag: '--off', kind: 'switch', key: 'off' },
    ],
    unknown: (arg) => `wf hold does not take ${arg}. It takes the run, then the runs it waits on or --off: ${HOLD_SHAPE}.`,
    apart: (_value, flag) => HOLD_TAKES[flag],
    missing: 'wf hold takes the run first: wf hold <runId> --until <runId> [--until <runId> ...], or wf hold <runId> --off.',
  },
  check: holdArgsRefusal,
  writes: true,
  route: { method: 'DELETE', path: '/api/runs/:runId/hold', status: 200, sets: { off: true } },
  async handler(e, args) {
    const runId = textOf(args, 'runId') ?? '';
    if (args.off === true) {
      const { run, hold: lifted } = unhold(runId);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const { run, hold: put } = await hold(e, runId, [...listOf(args, 'until')], { why: saidOf(args, 'why'), by: saidOf(args, 'by') });
    return { id: run.id, lifted: false, hold: put };
  },
  print: ({ id, lifted, hold: put }, args) => [
    lifted
      ? `${id}  hold lifted — the next tick goes on, and what its steps ask is asked`
      : `${id}  ${holdWord(
          listOf(args, 'until').map((u) => ({ run: u })),
          put,
        )} — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  ],
};

/** `wf cordon`'s form, as each of its refusals ends on it. */
const CORDON_SHAPE = 'wf cordon [--why "<words>"] [--by <name>]';

/** `wf cordon`'s `--why` and `--by`. */
const CORDON_SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the store is cordoned', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who cordons it, by a name', cap: BY_CAP },
];

/** `wf cordon`'s `--why` and `--by`, each with its refusal of a value left out. */
const CORDON_TAKES = takesOf(CORDON_SAID, CORDON_SHAPE);

/**
 * `wf cordon`: the store cordoned, as `kubectl cordon` marks a node (`putCordon`), on `POST /api/cordon` too; the cordon as written.
 * Refused while a cordon stands (`Conflict`).
 */
export const CORDON: Command<{ cordon: Cordon }> = {
  name: 'cordon',
  usage: '[--why "<words>"] [--by <name>]',
  help: [
    'cordon the store, as kubectl cordon marks a node: no pass starts new',
    'work — no step, try, round or check filed, no queued task admitted,',
    'no queued card started — and what runs finishes, its end and closeout',
    'recorded; a landing whose check has ended commits or aborts. wf start',
    'still writes a run, and approvals, retries and answers are kept, not',
    'acted on: the pass after wf uncordon files what waits. wf ls, wf feed,',
    'wf start and wf up say it. Refused while a cordon stands.',
    '--why: the reason, said wherever the cordon is; --by: who cordons it',
    '(default: your OS user)',
  ],
  spec: {
    positionals: [],
    flags: saidFlags(CORDON_SAID, 'wf cordon', 'a cordon', CORDON_TAKES, CORDON_SHAPE),
    unknown: (arg) => `wf cordon does not take ${arg}: ${CORDON_SHAPE}.`,
    apart: (_value, flag) => CORDON_TAKES[flag],
  },
  check: (args) => CORDON_SAID.map((s) => saidRefusal(args, s, CORDON_TAKES)).find((r) => r !== null) ?? null,
  writes: true,
  route: { method: 'POST', path: '/api/cordon', status: 200 },
  handler: async (_e, args) => ({ cordon: putCordon({ why: saidOf(args, 'why'), by: saidOf(args, 'by') }) }),
  print: ({ cordon }) => [cordonWords(cordon)],
};

/** `wf uncordon`: the store's cordon lifted (`liftCordon`), on `DELETE /api/cordon` too; the cordon lifted. Refused with none (`Missing`). */
export const UNCORDON: Command<{ cordon: Cordon }> = {
  name: 'uncordon',
  usage: '',
  help: ["lift the store's cordon: the next pass files what waits"],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `wf uncordon takes no ${arg}: it lifts the store's cordon, whoever put it.`,
  },
  writes: true,
  route: { method: 'DELETE', path: '/api/cordon', status: 200 },
  handler: async () => ({ cordon: liftCordon() }),
  print: () => [UNCORDONED],
};

/** The store's cordon and the landings it holds with their merge staged (`cordonRead`), which the api alone serves. */
export const CORDONED: Command<Cordoned> = {
  name: 'cordoned',
  usage: '',
  help: ["the store's cordon, and each landing it holds with its merge staged"],
  spec: { positionals: [], flags: [], unknown: (arg) => `the cordon takes no ${arg}.` },
  writes: false,
  route: { method: 'GET', path: '/api/cordon', status: 200 },
  only: { side: 'api', why: 'the board says the cordon over its frame; at the command line, wf ls says it, and each landing it holds' },
  handler: (e) => cordonRead(e),
  print: () => [],
};

/** The `--stats` switch of `wf tick` and `wf up`. */
const STATS = { flag: '--stats', kind: 'switch', key: 'stats' } as const;

/** `wf tick`: one pass of the tick, run by the CLI's runner. */
const TICK: Ran = {
  name: 'tick',
  usage: '[--stats]',
  help: [
    'one pass: tick the engine, file what became ready — refused while a',
    'wf up ticks the store, since it runs the same pass (daemon.json);',
    '--stats says after it what the pass cost, phase by phase',
  ],
  spec: {
    positionals: [],
    flags: [STATS],
    unknown: (arg) => `wf tick takes no ${arg}: wf tick runs one pass, and wf tick --stats says after it what the pass cost.`,
  },
  writes: true,
  only: { side: 'cli', why: 'a pass is run where the store is, by a person or by wf up; the api runs none' },
};

/** Refused of `wf up`'s arguments: an interval beside `--stats`, which ticks nothing, or one `everyOf` refuses. */
function upRefusal(args: Args): string | null {
  const every = textOf(args, 'every');
  if (every === undefined) return null;
  if (args.stats === true)
    return `wf up --stats reads what the last pass cost and ticks nothing, so it takes no ${every}: wf up --stats alone, or wf up ${every} to tick.`;
  const asked = everyOf(every);
  return 'refusal' in asked ? asked.refusal : null;
}

/** `wf up`: a pass every interval, holding the store, until it is stopped; or, with `--stats`, what the last pass cost. */
const UP: Ran = {
  name: 'up',
  usage: '[ms]',
  help: [
    'the same, on a timer (4000 unless given; whole ms, 1 to 2147483647),',
    'holding the store: a second wf up is refused while this one ticks,',
    'and takes the store over once its process is gone or it has been',
    'silent for 10 intervals, at least 15 minutes; it writes',
    'WF_ROOT/daemon.json — pid, start, last pass, and a beat each interval;',
    'once a minute, a line of what its passes cost (tick-stats.json); the',
    "store's cordon once it is put, and again once it is lifted.",
    'wf up --stats: what the last pass cost, phase by phase — read, not',
    'run, so it fits while a wf up holds the store; where none does,',
    'wf tick --stats',
  ],
  spec: {
    positionals: [{ key: 'every', takes: 'optional', kind: 'text' }],
    flags: [STATS],
    unknown: (arg) => {
      const asked = everyOf(arg);
      return 'refusal' in asked ? asked.refusal : `wf up takes one pass interval at most, and was given ${arg} too: wf up [ms].`;
    },
  },
  check: upRefusal,
  writes: true,
  only: { side: 'cli', why: 'wf up holds the store as long as its process lives; the api holds none' },
};

/** `wf watch`: the feed followed from a cursor until it is stopped. */
const WATCH: Ran = {
  name: 'watch',
  usage: '[cursor]',
  help: ["wf feed's lines, followed as the tick writes them, until ^C"],
  spec: {
    positionals: [{ key: 'cursor', takes: 'optional', kind: 'text' }],
    flags: [],
    unknown: () => cursorTakes('watch'),
  },
  check: (args) => {
    const cursor = textOf(args, 'cursor');
    return cursor === undefined || /^\d+$/.test(cursor) ? null : cursorTakes('watch');
  },
  writes: false,
  only: { side: 'cli', why: 'it follows the feed on a terminal until ^C; the board reads what changed from the api' },
};

/** The commands the CLI serves alone and runs itself, in the order `wf`'s help lists them. */
export const RAN: readonly Ran[] = [TICK, UP, WATCH];
