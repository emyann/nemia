/**
 * The commands over a run's course and the store's tick, each defined once: `nemia cancel`, `nemia hold`, `nemia rm` and `nemia prune`,
 * whose handlers call the package's verbs (`cancelRun`, `hold`, `unhold`, `forgetRun`, `prune`) on one run — the CLI's runners walk the
 * many runs `nemia rm` and `nemia prune` take — the store's pause (`nemia pause`, `nemia resume`, and the api's read of it), and `nemia
 * tick`, `nemia up` and `nemia watch`, which the CLI alone serves and runs itself (`RAN`): their specs, refusals and help, with no
 * handler.
 */
import { cancelRun } from '../cancel/cancel.verb.ts';
import type { CancelPlan } from '../cancel/cancel.ts';
import { everyOf } from '../daemon/daemon.ts';
import { forgetLine, type Forgot } from '../forget/forget.ts';
import { SELECTOR_FORM, selectorsRefusal } from '../watch/selector.ts';
import { retiredWakeRefusal } from '../subscription/index.ts';
import { forgetRun } from '../forget/forget.verb.ts';
import type { EngineForgetting } from '../forgetting/forgetting.ts';
import { pruneLines, type Pruning } from '../prune/prune.ts';
import { prune } from '../prune/prune.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { BY_CAP, oneLine, WHY_CAP, type Hold } from '../record/record.ts';
import { holdWord } from '../wait/wait.ts';
import { hold, unhold } from '../wait/wait.verb.ts';
import { readPause, resumePause, putPause } from '../pause/pause.store.ts';
import { nowRead, pauseNow } from '../pause/pause.verb.ts';
import {
  NOW_COST,
  nowLines,
  pausedNowLines,
  pauseWords,
  RESUMED,
  type Interrupt,
  type Pause,
  type Paused,
  type PausedNow,
} from '../pause/pause.ts';
import { Effect } from 'effect';
import { pausedRead } from '../list/list.verb.ts';
import { tried } from '../runtime-client.ts';
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

/** `nemia cancel`: what a run has in flight asked to stop, and nothing more filed; the plan it followed, a run already over included. */
export const CANCEL: Command<{ id: string; plan: CancelPlan }> = {
  name: 'cancel',
  usage: '<runId>',
  help: ['stop what it has in flight; file nothing more'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia cancel takes one run's id: not ${arg}.`,
  },
  writes: true,
  ticks: true,
  nemia: 'prompts',
  only: { side: 'cli', why: 'the board offers no cancel: a person stops a run at the command line' },
  handler: Effect.fnUntraced(function* (args: Args) {
    const { run, plan } = yield* cancelRun(textOf(args, 'runId') ?? '');
    return { id: run.id, plan };
  }),
  print: ({ id, plan }) => {
    if (plan.kind === 'finished') return [`${id}  already ${plan.status} — nothing to stop`];
    const head = plan.kind === 'already-cancelled' ? `${id}  already cancelled at ${plan.at}` : `${id}  cancelled`;
    if (plan.stop.length)
      return [head, `   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`];
    return plan.kind === 'cancel' ? [head, `   nothing was in flight — no further steps will be filed`] : [head];
  },
};

/** `nemia hold`'s two forms, as each of its refusals ends on them. */
const HOLD_SHAPE = 'nemia hold <runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>], or nemia hold <runId> --off';

/** `--why` or `--by`: the flag, the key it fills, what it takes as its refusals say it, and the longest it may be. */
type Said = { readonly flag: '--why' | '--by'; readonly key: 'why' | 'by'; readonly takes: string; readonly cap: number };

/** `nemia hold`'s `--why` and `--by`. */
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
 * Refused of `nemia hold`'s arguments before any run is read: a run to wait on empty or starting `-`, what `saidRefusal` refuses of `--why`
 * and `--by`; then together: `--until` and `--off` both, `--why` or `--by` with `--off`, and neither `--until` nor `--off`. A run named
 * twice is the verb's to refuse (`holdRefusal`), in its words.
 */
function holdArgsRefusal(args: Args): string | null {
  const until = listOf(args, 'until');
  const off = args.off === true;
  if (until.some((id) => !id || id.startsWith('-'))) return HOLD_TAKES['--until'];
  const said = SAID.map((s) => saidRefusal(args, s, HOLD_TAKES)).find((r) => r !== null);
  if (said) return said;
  if (off && until.length) return `nemia hold takes --until or --off, not both: lift the hold first, then hold it again — ${HOLD_SHAPE}.`;
  if (off && (args.why !== undefined || args.by !== undefined))
    return `nemia hold --off lifts the hold whole, and takes no --why or --by: those go with --until, on the hold put next — ${HOLD_SHAPE}.`;
  if (!off && !until.length) return `nemia hold needs the runs to wait on, or --off to lift a hold: ${HOLD_SHAPE}.`;
  return null;
}

/**
 * `nemia hold`: a run held until other runs ship, or with `--off` its hold lifted now. The api serves both: it puts a hold on
 * `POST /api/runs/:runId/hold`, whose route fixes `off` false so no body lifts through it, and lifts one on `DELETE /api/runs/:runId/hold`.
 */
export const HOLD: Command<{ id: string; lifted: boolean; hold: Hold }> = {
  name: 'hold',
  usage: '<runId> --until <runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
  help: [
    'file nothing more of a run until other runs ship, as --after would',
    'have: what is in flight finishes, nothing new is filed, and nothing',
    'is asked of you — nemia ls and nemia decide say held until <run> ships, and',
    'what a step asks is asked once the hold lifts. The tick lifts it when',
    'every run named has shipped. Refused of a run cancelled, pruned,',
    'finished or already held, and of a run named that is unknown, the run',
    'itself, or one that already waits on it, through --after or a hold.',
    '--why: the reason, shown beside held until <run> ships wherever it is',
    'said; --by: who puts the hold (default: your OS user).',
    'nemia hold <runId> --off: lift the hold now, and the next tick goes on as',
    'if it had never been put',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--until', kind: 'text', key: 'until', takes: HOLD_TAKES['--until'], many: true },
      ...saidFlags(SAID, 'nemia hold', 'a hold', HOLD_TAKES, HOLD_SHAPE),
      { flag: '--off', kind: 'switch', key: 'off' },
    ],
    unknown: (arg) => `nemia hold does not take ${arg}. It takes the run, then the runs it waits on or --off: ${HOLD_SHAPE}.`,
    apart: (_value, flag) => HOLD_TAKES[flag],
    missing: 'nemia hold takes the run first: nemia hold <runId> --until <runId> [--until <runId> ...], or nemia hold <runId> --off.',
  },
  check: holdArgsRefusal,
  writes: true,
  nemia: 'hers',
  route: [
    { method: 'POST', path: '/api/runs/:runId/hold', status: 200, sets: { off: false } },
    { method: 'DELETE', path: '/api/runs/:runId/hold', status: 200, sets: { off: true } },
  ],
  handler: Effect.fnUntraced(function* (args: Args) {
    const runId = textOf(args, 'runId') ?? '';
    if (args.off === true) {
      const { run, hold: lifted } = yield* unhold(runId);
      return { id: run.id, lifted: true, hold: lifted };
    }
    const { run, hold: put } = yield* hold(runId, [...listOf(args, 'until')], { why: saidOf(args, 'why'), by: saidOf(args, 'by') });
    return { id: run.id, lifted: false, hold: put };
  }),
  print: ({ id, lifted, hold: put }, args) => [
    lifted
      ? `${id}  hold lifted — the next tick goes on, and what its steps ask is asked`
      : `${id}  ${holdWord(
          listOf(args, 'until').map((u) => ({ run: u })),
          put,
        )} — nothing more of it is filed, and nothing is asked of you, until then; the next tick lifts the hold`,
  ],
};

/** `nemia rm`'s form, as its refusals end on it. */
const RM_FORM = 'nemia rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]]';

/**
 * Refused of `nemia rm`'s arguments before any run is read: `--force-unmerged` without `--delete-branches` — it forces what that flag
 * deletes, and alone would delete nothing, silently — then a switch with no run to forget.
 */
function rmRefusal(args: Args): string | null {
  if (args.forceUnmerged === true && args.deleteBranches !== true)
    return "--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: nemia rm <runId> --delete-branches --force-unmerged.";
  if (args.runId === undefined && args.deleteBranches === true)
    return 'nemia rm takes the runs to forget, by id: nemia rm <runId> [<runId> ...] — nemia ls lists them.';
  return null;
}

/**
 * `nemia rm`: one run forgotten, judged on its own (`forget`), and what was done with it (`forgot`), a refusal included, and with its
 * tasks on the engine (`engine`, null where nothing was removed). The api removes a
 * run only once it is gone: what `forget` refused, or held, is a 409 in its words, and a run gone since the route read it a 404.
 */
export const RM: Command<{ id: string; removed: boolean; engine: EngineForgetting | null; forgot: Forgot }> = {
  name: 'rm',
  usage: '<runId> [<runId> ...] [--delete-branches [--force-unmerged]]',
  help: [
    "forget runs that are over, a line each: a run's worktrees removed",
    'through git, what one held uncommitted committed first, then its',
    'record and every file under WF_ROOT keyed by its id. Refused while',
    'a task of it is in flight, anything is due to be filed or asked',
    'for, or a run waiting on it has not started. Its branches are kept:',
    "--delete-branches deletes those merged into the run's base branch,",
    'and --force-unmerged beside it the others, with their work. Then',
    "the engine forgets the run's tasks: their journals and session",
    'files; one not settled yet is forgotten by the next passes',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'many', kind: 'name' }],
    flags: [
      { flag: '--delete-branches', kind: 'switch', key: 'deleteBranches' },
      { flag: '--force-unmerged', kind: 'switch', key: 'forceUnmerged' },
    ],
    unknown: (arg) =>
      `nemia rm does not take ${arg}. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: ${RM_FORM}.`,
  },
  check: rmRefusal,
  writes: true,
  nemia: 'prompts',
  route: { method: 'DELETE', path: '/api/runs/:runId', status: 200 },
  handler: Effect.fnUntraced(function* (args: Args) {
    const forgot = yield* forgetRun(textOf(args, 'runId') ?? '', {
      deleteBranches: args.deleteBranches === true,
      forceUnmerged: args.forceUnmerged === true,
    });
    return { id: forgot.id, removed: forgot.kind === 'forgotten', engine: forgot.engine ?? null, forgot };
  }),
  print: ({ forgot }) => [forgetLine(forgot)],
  apiKeys: ['id', 'removed', 'engine'],
  apiRefusal: ({ forgot }) => {
    if (forgot.kind === 'refused') return new Conflict({ message: forgot.refusal ?? forgetLine(forgot) });
    if (forgot.kind === 'held') return new Conflict({ message: forgetLine(forgot) });
    return forgot.kind === 'missing' ? new Missing({ message: forgetLine(forgot) }) : null;
  },
};

/**
 * `nemia prune`: one run judged for what it holds that a prune frees (`prune`), and removed on `yes`; the api always prunes as `--yes`
 * does, its route fixing `yes`. What `prune` refused, or found nothing to prune of, is a 409 on the api, in its words.
 */
export const PRUNE: Command<{
  id: string;
  pruned: boolean;
  lines: readonly string[];
  worktrees: Pruning['worktrees'];
  artifacts: NonNullable<Pruning['artifacts']> | null;
  left: Pruning['left'];
  pruning: Pruning;
}> = {
  name: 'prune',
  usage: '[<runId> ...] [--unmerged] [--artifacts] [--yes]',
  help: [
    'free the space runs that are over hold: their worktrees, removed',
    "through git, and nothing else — each run's record, branches and",
    'files are kept, and it stays on nemia ls, nemia decide and the board,',
    'marked pruned. --artifacts removes its files too (runs/<id>/',
    'artifacts/: screenshots, logs), of a run whose worktrees are',
    'already gone as well; its record and branches are still kept.',
    'Lists what it would remove, with its size, and removes it on',
    '--yes, or on y at the prompt. With no run, every run. Refused',
    'while a run is not over, owes a hand-off, is a folder run, or has',
    'a worktree locked, on no branch, or with changes no commit has;',
    'and a finished run not merged unless --unmerged, with --artifacts',
    'as without: its files are what a person reads to decide it',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'many', kind: 'name' }],
    flags: [
      { flag: '--unmerged', kind: 'switch', key: 'unmerged' },
      { flag: '--artifacts', kind: 'switch', key: 'artifacts' },
      { flag: '--yes', kind: 'switch', key: 'yes' },
    ],
    unknown: (arg) =>
      `nemia prune does not take ${arg}. It takes the runs to prune — none is every run — then --unmerged, --artifacts and --yes: nemia prune [<runId> ...] [--unmerged] [--artifacts] [--yes].`,
  },
  writes: true,
  nemia: 'prompts',
  route: { method: 'POST', path: '/api/runs/:runId/prune', status: 200, sets: { yes: true } },
  handler: Effect.fnUntraced(function* (args: Args) {
    const p: Pruning = yield* prune(textOf(args, 'runId') ?? '', {
      unmerged: args.unmerged === true,
      artifacts: args.artifacts === true,
      yes: args.yes === true,
    });
    const { id, worktrees, left } = p;
    return { id, pruned: p.kind === 'pruned', lines: pruneLines(p), worktrees, artifacts: p.artifacts ?? null, left, pruning: p };
  }),
  print: ({ pruning }) => pruneLines(pruning),
  apiKeys: ['id', 'pruned', 'lines', 'worktrees', 'artifacts', 'left'],
  apiRefusal: ({ pruning }) => {
    if (pruning.kind === 'refused') return new Conflict({ message: pruning.refusal ?? pruneLines(pruning).join('\n') });
    return pruning.kind === 'nothing' ? new Conflict({ message: `Nothing to prune: ${pruning.nothing}.` }) : null;
  },
};

/** `nemia pause`'s form, as each of its refusals ends on it. */
const PAUSE_SHAPE = 'nemia pause [--why "<words>"] [--by <name>] [--now [--yes]]';

/** `nemia pause`'s `--why` and `--by`. */
const PAUSE_SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the store is paused', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who pauses it, by a name', cap: BY_CAP },
];

/** `nemia pause`'s `--why` and `--by`, each with its refusal of a value left out. */
const PAUSE_TAKES = takesOf(PAUSE_SAID, PAUSE_SHAPE);

/** What `nemia pause --now` would stop, before it acts: the pause that stands, if one does, and each task at work but a landing. */
type PauseNowRead = { pause: Pause | null; interrupts: Interrupt[] };

/**
 * What `nemia pause` answers: the pause put; with `--now`, what it would stop (`PauseNowRead`), or with `--yes` what it did (`PausedNow`).
 */
type PauseAnswer = { pause: Pause } | PausedNow | PauseNowRead;

/** `nemia pause`'s handler, by its flags: a plain pause, refused while one stands; `--now`, which only reads; `--now --yes`, which acts. */
const pauseBy = Effect.fnUntraced(function* (args: Args) {
  const said = { why: saidOf(args, 'why'), by: saidOf(args, 'by') };
  if (args.now !== true) return { pause: putPause(said) } satisfies PauseAnswer;
  if (args.yes !== true) return { pause: readPause(), interrupts: yield* nowRead() } satisfies PauseAnswer;
  return (yield* pauseNow(said)) satisfies PauseAnswer;
});

/**
 * `nemia pause`: the store paused (`putPause`), on `POST /api/pause` too; the pause as written. Refused while a pause stands (`Conflict`).
 * `--now` says what a pause at once would stop and writes nothing; `--now --yes`, as the route always does, pauses at once (`pauseNow`).
 */
export const PAUSE: Command<PauseAnswer> = {
  name: 'pause',
  usage: '[--why "<words>"] [--by <name>] [--now [--yes]]',
  help: [
    'pause the store: no pass starts new work — no step, try, round or',
    'check filed, no queued task admitted, no queued card started — and',
    'what runs finishes, its end and closeout recorded; a landing whose',
    'check has ended commits or aborts. Pausing: N finishing while a',
    'session works or a check or landing runs, Paused once none does.',
    'nemia start still writes a run, and approvals, retries and answers are',
    'kept, not acted on: the pass after nemia resume files what waits. nemia ls,',
    'nemia watch --once, nemia start and nemia up say it, and nemia ls names what finishes.',
    'Refused while a pause stands.',
    '--why: the reason, said wherever the pause is; --by: who pauses it',
    '(default: your OS user)',
    '--now: pause at once — each step session or check at work, but a',
    'landing, is asked to stop and tried again on nemia resume: a nudge of',
    'its session, or a recheck. A pause that stands is kept as it was.',
    '--yes: with --now, act; without it, --now only says what it would',
    'interrupt',
  ],
  spec: {
    positionals: [],
    flags: [
      ...saidFlags(PAUSE_SAID, 'nemia pause', 'a pause', PAUSE_TAKES, PAUSE_SHAPE),
      { flag: '--now', kind: 'switch', key: 'now' },
      { flag: '--yes', kind: 'switch', key: 'yes' },
    ],
    unknown: (arg) => `nemia pause does not take ${arg}: ${PAUSE_SHAPE}.`,
    apart: (_value, flag) => PAUSE_TAKES[flag],
  },
  check: (args) => PAUSE_SAID.map((s) => saidRefusal(args, s, PAUSE_TAKES)).find((r) => r !== null) ?? null,
  writes: true,
  nemia: 'hers',
  route: { method: 'POST', path: '/api/pause', status: 200, sets: { yes: true } },
  handler: pauseBy,
  print: (answer) =>
    'interrupts' in answer
      ? nowLines(answer.interrupts, answer.pause !== null)
      : 'kept' in answer
        ? pausedNowLines(answer)
        : [pauseWords(answer.pause)],
};

/**
 * `nemia resume`: the store's pause lifted (`resumePause`), on `DELETE /api/pause` too; the pause lifted. Refused with none (`Missing`).
 */
export const RESUME: Command<{ pause: Pause }> = {
  name: 'resume',
  usage: '',
  help: ['resume the store: the next pass files what waits'],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia resume takes no ${arg}: it resumes the store, whoever paused it.`,
  },
  writes: true,
  ticks: true,
  nemia: 'hers',
  route: { method: 'DELETE', path: '/api/pause', status: 200 },
  handler: () => tried(() => ({ pause: resumePause() })),
  print: () => [RESUMED],
};

/** The store's pause and the checks it holds, a landing with its merge staged among them (`pausedRead`), which the api alone serves. */
export const PAUSED: Command<Paused> = {
  name: 'paused',
  usage: '',
  help: ["the store's pause, what finishes under it, and each check it holds, a landing with its merge staged among them"],
  spec: { positionals: [], flags: [], unknown: (arg) => `the pause takes no ${arg}.` },
  writes: false,
  nemia: 'read',
  route: { method: 'GET', path: '/api/pause', status: 200 },
  only: {
    side: 'api',
    why: 'the board says the pause in its bottom bar; at the command line, nemia ls says it, what finishes and each check it holds',
  },
  handler: () => pausedRead(),
  print: () => [],
};

/** What a pause at once would stop (`nowRead`), and what it costs (`NOW_COST`): the board's confirm, which the api alone serves. */
export const PAUSE_NOW: Command<{ interrupts: Interrupt[]; cost: string }> = {
  name: 'pause now',
  usage: '',
  help: ['what a pause at once would stop, each task at work but a landing, and what that costs'],
  spec: { positionals: [], flags: [], unknown: (arg) => `what a pause at once would stop takes no ${arg}.` },
  writes: false,
  nemia: 'read',
  route: { method: 'GET', path: '/api/pause/now', status: 200 },
  only: { side: 'api', why: 'the board confirms a pause at once with it; at the command line, nemia pause --now says it' },
  handler: Effect.fnUntraced(function* () {
    return { interrupts: yield* nowRead(), cost: NOW_COST };
  }),
  print: () => [],
};

/** The `--stats` switch of `nemia tick` and `nemia up`. */
const STATS = { flag: '--stats', kind: 'switch', key: 'stats' } as const;

/** `nemia tick`: one pass of the tick, run by the CLI's runner. */
const TICK: Ran = {
  name: 'tick',
  usage: '[--stats]',
  help: [
    'one pass: tick the engine, file what became ready — refused while a',
    'daemon (the api, or a nemia up) ticks the store, since it runs the same',
    'pass (daemon.json);',
    '--stats says after it what the pass cost, phase by phase',
  ],
  spec: {
    positionals: [],
    flags: [STATS],
    unknown: (arg) => `nemia tick takes no ${arg}: nemia tick runs one pass, and nemia tick --stats says after it what the pass cost.`,
  },
  writes: true,
  nemia: 'out',
  only: { side: 'cli', why: 'a pass is run where the store is, by a person or by a daemon; the api serves none on a route' },
};

/** Refused of `nemia up`'s arguments: an interval beside `--stats`, which ticks nothing, or one `everyOf` refuses. */
function upRefusal(args: Args): string | null {
  const every = textOf(args, 'every');
  if (every === undefined) return null;
  if (args.stats === true)
    return `nemia up --stats reads what the last pass cost and ticks nothing, so it takes no ${every}: nemia up --stats alone, or nemia up ${every} to tick.`;
  const asked = everyOf(every);
  return 'refusal' in asked ? asked.refusal : null;
}

/** `nemia up`: a pass every interval, holding the store, until it is stopped; or, with `--stats`, what the last pass cost. */
const UP: Ran = {
  name: 'up',
  usage: '[ms]',
  help: [
    'the headless daemon, where no board is served: the same pass on a',
    'timer (4000 unless given; whole ms, 1 to 2147483647), holding the',
    "store. The api's process (npm start in apps/api) is the daemon where",
    'one is: one store takes one, and each is refused while the other',
    "ticks. It takes the store over once its holder's process is gone or",
    'it has been silent for 10 intervals, at least 15 minutes; it writes',
    'WF_ROOT/daemon.json — who holds it, pid, start, last pass, and a beat',
    'each interval;',
    'once a minute, a line of what its passes cost (tick-stats.json); the',
    "store's pause once it is put, again each time it says another thing",
    '(Pausing: N finishing, then Paused), and once it is resumed.',
    'nemia up --stats: what the last pass cost, phase by phase — read, not',
    'run, so it fits while a daemon holds the store; where none does,',
    'nemia tick --stats',
  ],
  spec: {
    positionals: [{ key: 'every', takes: 'optional', kind: 'text' }],
    flags: [STATS],
    unknown: (arg) => {
      const asked = everyOf(arg);
      return 'refusal' in asked ? asked.refusal : `nemia up takes one pass interval at most, and was given ${arg} too: nemia up [ms].`;
    },
  },
  check: upRefusal,
  writes: true,
  nemia: 'out',
  only: { side: 'cli', why: 'nemia up holds the store as long as its process lives; the api holds none' },
};

/** What `nemia watch` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WATCH_USAGE = '[cursor] [--once] [-l <selector>]... [--cursor-file <path>] [--json]';

/** The command line `nemia watch`'s refusals end on. */
const WATCH_FORM = `nemia watch ${WATCH_USAGE}`;

/** The refusal of a cursor `nemia watch` does not take: a second, or anything but a whole number of bytes. */
const cursorTakes = `nemia watch takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: ${WATCH_FORM}`;

/** The refusal of a `-l` given no selector, or one of the command's own flags for it. */
const SELECTOR_TAKES = `nemia watch -l takes a selector of the feed's lines: ${SELECTOR_FORM}`;

/** The refusal of a `--cursor-file` given no path. */
const CURSOR_FILE_TAKES =
  'nemia watch --cursor-file takes the path this watch keeps the cursor it has read to in — written after every line and read again ' +
  'when a watch starts there: nemia watch --cursor-file <path>';

/** What each value flag of `nemia watch` takes, by its name: the refusal of a value given apart that is one of its own flags. */
const WATCH_TAKES: Readonly<Record<string, string>> = {
  '-l': SELECTOR_TAKES,
  '--cursor-file': CURSOR_FILE_TAKES,
};

/**
 * The refusal of a cursor typed beside `--cursor-file`: the file is where the watch keeps its place, so one of the two would be lost
 * without a word. It names which to drop.
 */
const bothCursors = (cursor: string): string =>
  `nemia watch takes a cursor or --cursor-file, not both, and it was given ${cursor} and a file: the file is where the watch keeps its ` +
  `place, so drop the ${cursor} — or drop --cursor-file and read from ${cursor} this once (delete the file to start the watch over).`;

/**
 * `nemia watch`: the feed selected and followed from a cursor until it is stopped, with the store's liveness — or read once to the feed's
 * end with `--once`, which prints where it got to and exits.
 */
const WATCH: Ran = {
  name: 'watch',
  usage: WATCH_USAGE,
  help: [
    "the feed's lines, followed as the tick writes them, until ^C, and a",
    'daemon down line when nothing ticks the store, daemon up when it does',
    "again: a run's status, a step's word as nemia ls says it, and what a",
    "person's word changed. --once: read from the cursor to the feed's end,",
    'print cursor: <n> and stop; from the start with no cursor. -l: the',
    'lines a selector takes, given again for another (key=v, key!=v, "key in',
    '(a,b)", "key notin (a,b)", key), over run, factory, workflow, step,',
    'agent, kind, reason, type, waits and source. --cursor-file: keep the',
    'cursor read to in a file, and start from it where it is there.',
    '--json: one JSON object a line, a feed line with its cursor, and a',
    'cursor of its own every 30 seconds while the feed is still. With no -l,',
    'every line; -l waits=person takes the lines that wait on a person. A',
    'step with no agent carries agent: none, which -l agent!=none leaves out.',
  ],
  spec: {
    positionals: [{ key: 'cursor', takes: 'optional', kind: 'text' }],
    flags: [
      { flag: '--once', kind: 'switch', key: 'once' },
      { flag: '-l', kind: 'text', key: 'selector', many: true, takes: SELECTOR_TAKES },
      { flag: '--cursor-file', kind: 'text', key: 'cursorFile', takes: CURSOR_FILE_TAKES, twice: 'nemia watch takes --cursor-file once.' },
      { flag: '--json', kind: 'switch', key: 'json' },
    ],
    unknown: (arg) => retiredWakeRefusal('nemia watch', arg) ?? `nemia watch does not take ${arg}: ${WATCH_FORM}`,
    apart: (_value, flag) => WATCH_TAKES[flag] ?? cursorTakes,
  },
  check: (args) => {
    const cursor = textOf(args, 'cursor');
    if (cursor !== undefined && cursor.startsWith('-')) return `nemia watch does not take ${cursor}: ${WATCH_FORM}`;
    if (cursor !== undefined && !/^\d+$/.test(cursor)) return cursorTakes;
    if (cursor !== undefined && textOf(args, 'cursorFile') !== undefined) return bothCursors(cursor);
    return selectorsRefusal(listOf(args, 'selector')) ?? null;
  },
  writes: false,
  nemia: 'read',
  only: { side: 'cli', why: 'it follows the feed on a terminal until ^C; the board reads what changed from the api' },
};

/** The commands the CLI serves alone and runs itself, in the order `nemia`'s help lists them. */
export const RAN: readonly Ran[] = [TICK, UP, WATCH];
