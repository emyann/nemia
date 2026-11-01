/**
 * The runners of `nemia agents custom`, `nemia factory instruct` and `nemia factory rules`, which read the words a file holds; and the
 * runner of `nemia rm` (`RM`), which walks the many runs a command line names through the entry's handler, and of `nemia prune`, which
 * hands them to the package's many-run verbs (`judgingMany`, `freeingMany`) and prints what they answer; each asks a person's yes and
 * tallies what was not done into the exit code; and the runner of `nemia admit`, which reads the call on stdin.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  admitted,
  AGENTS_CUSTOM,
  POLICY_PROPOSE,
  FACTORY_INSTRUCT,
  FACTORY_RULES,
  freeingMany,
  HOME,
  judgingMany,
  pruneLines,
  pruningBytes,
  RM,
  runStore,
  runsForgetting,
  runWith,
  type Place,
  sizeOf,
  TABLE,
  type Args,
  type Listed,
  type Pruning,
  type Turned,
} from '../runner.ts';
import { HELP, placedIn, usage, confirmed, type Engine } from './flags.ts';

/** The runs a command line named, in the order given, each once (the many positional of `RM`, and of `nemia prune`). */
const idsOf = (args: Args): readonly string[] => (Array.isArray(args.runId) ? args.runId : []);

/**
 * One run `nemia rm` was given, forgotten through `RM`'s handler and said in its line; returns whether it is still there, and whether that
 * is a failure other than a refusal.
 */
async function rmOne(e: Engine, place: Place, id: string, args: Args): Promise<{ kept: boolean; failed: boolean }> {
  try {
    const data = await runWith(e, placedIn(place, RM.handler({ ...args, runId: id })));
    for (const line of RM.print(data, args)) console.log(line);
    return { kept: data.forgot.kind === 'refused' || data.forgot.kind === 'held', failed: false };
  } catch (err) {
    console.log(`${id}  not forgotten: ${(err as Error).message}`);
    return { kept: true, failed: (err as { exitCode?: number }).exitCode !== 2 };
  }
}

/**
 * `nemia rm`: each run forgotten, judged on its own, a line each, a refusal included; once every run has had its say, it fails naming those
 * not forgotten, exit 2, or 1 when one failed otherwise.
 */
export async function rmVerb(args: Args, e: Engine, place: Place): Promise<void> {
  const ids = idsOf(args);
  if (!ids.length) return console.log(HELP);
  const notForgotten: string[] = [];
  let failed = false;
  for (const id of ids) {
    const one = await rmOne(e, place, id, args);
    if (one.kept) notForgotten.push(id);
    failed ||= one.failed;
  }
  if (notForgotten.length) {
    throw Object.assign(
      new Error(
        `nemia rm: ${notForgotten.join(', ')} not forgotten — ${notForgotten.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: failed ? 1 : 2 },
    );
  }
  return;
}

/** The runs `nemia prune` named and did not prune, and whether one failed otherwise than by a refusal, which makes its exit 1 and not 2. */
type PruneTally = { notPruned: string[]; failed: boolean };

/** A run `nemia prune` failed to judge or to prune: its line, and its place in the tally. */
function notPrunedLine(id: string, err: unknown, tally: PruneTally): void {
  console.log(`${id}  not pruned: ${(err as Error).message}`);
  tally.notPruned.push(id);
  if ((err as { exitCode?: number }).exitCode !== 2) tally.failed = true;
}

/** `nemia prune`'s end: once every run has had its say, it fails naming each run not pruned, exit 2, or 1 when one failed otherwise. */
function refusedNamed(tally: PruneTally): void {
  if (tally.notPruned.length) {
    throw Object.assign(
      new Error(
        `nemia prune: ${tally.notPruned.join(', ')} not pruned — ${tally.notPruned.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: tally.failed ? 1 : 2 },
    );
  }
}

/** Each of `ids` judged for `nemia prune`, side by side, nothing removed; a run it cannot judge is said and tallied, in the order named. */
async function judged(
  e: Engine,
  place: Place,
  ids: readonly string[],
  flags: { unmerged: boolean; artifacts: boolean },
  tally: PruneTally,
): Promise<readonly Listed[]> {
  const listed = await runWith(e, placedIn(place, judgingMany(ids, flags)));
  for (const l of listed) if ('failed' in l) notPrunedLine(l.id, l.failed, tally);
  return listed;
}

/**
 * What `nemia rm` would forget of the engine's tasks of each run `nemia prune` found over or with nothing to prune (`runsForgetting`), put
 * on its finding: one count over all of them, which reads the engine's feed once. A run it could not count, and a count that fails, are
 * said, and cost only their lines.
 */
async function withEngine(e: Engine, place: Place, found: Pruning[]): Promise<Pruning[]> {
  const asked = found.filter((p) => p.kind === 'prunable' || p.kind === 'nothing').map((p) => p.id);
  if (!asked.length) return found;
  try {
    const { counted, uncounted } = await runWith(e, placedIn(place, runsForgetting(asked)));
    for (const { text } of uncounted) console.log(text);
    return found.map((p) => {
      const engine = counted.get(p.id);
      return engine !== undefined ? { ...p, engine } : p;
    });
  } catch (err) {
    console.log(`what nemia rm would forget of the engine's tasks was not counted: ${(err as Error).message}`);
    return found;
  }
}

/**
 * What `nemia prune` found, a run's lines each. Of named runs, a refusal is tallied; of every run, a run with nothing to prune is not said
 * at all, and the runs not over are said in one line.
 */
function printFound(found: Pruning[], named: boolean, tally: PruneTally): void {
  const running = found.filter((p) => !named && p.kind === 'refused' && /\bit is not over\b/.test(p.refusal ?? ''));
  for (const p of found) {
    if (!named && (p.kind === 'nothing' || running.includes(p))) continue;
    for (const line of pruneLines(p)) console.log(line);
    if (named && p.kind === 'refused') tally.notPruned.push(p.id);
  }
  if (running.length)
    console.log(`${running.length} run${running.length > 1 ? 's' : ''} not over, not pruned: ${running.map((p) => p.id).join(', ')}`);
}

/** One turn of `nemia prune`'s removal, said as it ends: each run's lines, and a run not pruned, or with something left, tallied. */
function saidTurn(turn: readonly Turned[], tally: PruneTally): void {
  for (const done of turn) {
    if ('failed' in done) {
      notPrunedLine(done.id, done.failed, tally);
      continue;
    }
    for (const line of pruneLines(done.pruning)) console.log(line);
    if (done.pruning.kind === 'refused' || done.pruning.left.length) tally.notPruned.push(done.id);
  }
}

/** Whether `nemia prune` removes `prunable`: on `--yes`, or a person's y; else it says the command that would, and removes nothing. */
async function removing(
  prunable: Pruning[],
  named: boolean,
  { unmerged, yes, artifacts }: { unmerged: boolean; yes: boolean; artifacts: boolean },
): Promise<boolean> {
  if (yes || (await confirmed('remove them? [y/N] '))) return true;
  console.log(
    `nothing removed: nemia prune ${[...(named ? prunable.map((p) => p.id) : []), ...(unmerged ? ['--unmerged'] : []), ...(artifacts ? ['--artifacts'] : []), '--yes'].join(' ')} removes them`,
  );
  return false;
}

/**
 * `nemia prune`: the space runs that are over hold, listed with its size and freed on `--yes` or a person's y. Named runs are judged each
 * on its own, a line each, a refusal included; with none, every run. The runs are judged side by side and printed in the order named
 * (`judgingMany`), a run that could not be judged first; those ready are removed a turn at a time, each turn said as it ends
 * (`freeingMany`): on the listing's judgement under `--yes`, judged again after a person's y.
 */
export async function pruneVerb(args: Args, e: Engine, place: Place): Promise<void> {
  const ids = idsOf(args);
  const unmerged = args.unmerged === true;
  const yes = args.yes === true;
  const artifacts = args.artifacts === true;
  const named = ids.length > 0;
  const tally: PruneTally = { notPruned: [], failed: false };
  const listed = await judged(e, place, named ? ids : runStore.runs.list().map((r) => r.id), { unmerged, artifacts }, tally);
  const found = await withEngine(
    e,
    place,
    listed.flatMap((l) => ('failed' in l ? [] : [l.pruning])),
  );
  printFound(found, named, tally);
  const prunable = found.filter((p) => p.kind === 'prunable');
  if (!prunable.length) {
    if (!found.some((p) => p.kind === 'refused'))
      console.log(named ? 'nothing to prune' : `nothing to prune: no run that is over has a worktree${artifacts ? ' or files' : ''} left`);
    return refusedNamed(tally);
  }
  const total = sizeOf(prunable.reduce((sum, p) => sum + pruningBytes(p), 0));
  console.log(`${prunable.length} run${prunable.length > 1 ? 's' : ''} to prune, ${total} in all`);
  if (!(await removing(prunable, named, { unmerged, yes, artifacts }))) return refusedNamed(tally);
  await runWith(
    e,
    placedIn(
      place,
      freeingMany(listed, { unmerged, artifacts, yes }, (turn) => saidTurn(turn, tally)),
    ),
  );
  return refusedNamed(tally);
}

/**
 * The words `--file` names for the command `name`: the file's text, or stdin's for `-`. Refused, naming the file, when it cannot be read.
 */
function wordsFrom(file: string, name: string): string {
  try {
    return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (err) {
    return usage(
      `nemia ${name} cannot read ${file === '-' ? 'stdin' : path.resolve(file)}: ${(err as Error).message}. Name a file that is there.`,
    );
  }
}

/** The arguments of `command` with the words its `--file` names read in (`wordsFrom`), where it names one. */
const withWords = (args: Args, command: string): Args =>
  typeof args.file === 'string' ? { ...args, words: wordsFrom(args.file, command) } : args;

/**
 * `nemia agents custom`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler (`AGENTS_CUSTOM`) in its
 * store, and what the entry says of them printed.
 */
export async function agentsCustomRun(args: Args, e: Engine, place: Place): Promise<void> {
  const asked = withWords(args, AGENTS_CUSTOM.name);
  const data = await runWith(e, placedIn(place, AGENTS_CUSTOM.handler(asked, undefined, HOME)));
  for (const line of AGENTS_CUSTOM.print(data, asked)) console.log(line);
}

/**
 * `nemia factory instruct`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function factoryInstructRun(args: Args, e: Engine, place: Place): Promise<void> {
  const asked = withWords(args, FACTORY_INSTRUCT.name);
  const data = await runWith(e, placedIn(place, FACTORY_INSTRUCT.handler(asked, undefined, HOME)));
  for (const line of FACTORY_INSTRUCT.print(data, asked)) console.log(line);
}

/**
 * `nemia factory rules`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function factoryRulesRun(args: Args, e: Engine, place: Place): Promise<void> {
  const asked = withWords(args, FACTORY_RULES.name);
  const data = await runWith(e, placedIn(place, FACTORY_RULES.handler(asked, undefined, HOME)));
  for (const line of FACTORY_RULES.print(data, asked)) console.log(line);
}

/**
 * `nemia policy propose`'s runner: the proposal `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function policyProposeRun(args: Args, e: Engine, place: Place): Promise<void> {
  const asked = withWords(args, POLICY_PROPOSE.name);
  const data = await runWith(e, placedIn(place, POLICY_PROPOSE.handler(asked, undefined, HOME)));
  for (const line of POLICY_PROPOSE.print(data, asked)) console.log(line);
}

/**
 * `nemia admit`'s runner: the call read on stdin, decided against the table (`admitted`) under the floor `--at-least` gives, and the answer
 * printed as JSON, or nothing.
 */
export async function admitRun(args: Args, e: Engine, place: Place): Promise<void> {
  const floor = typeof args.atLeast === 'string' ? (args.atLeast as Parameters<typeof admitted>[2]) : undefined;
  const auto = typeof args.auto === 'string' ? args.auto : undefined;
  const answer = await runWith(e, placedIn(place, admitted(fs.readFileSync(0, 'utf8'), TABLE, floor, auto)));
  if (answer !== undefined) console.log(JSON.stringify(answer));
}
