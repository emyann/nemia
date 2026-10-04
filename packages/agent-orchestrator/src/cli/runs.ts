/**
 * The verb over agents — `wf agents custom` — its flags, read off the command line, and what it prints; and the runners of `wf rm` and
 * `wf prune` (`RM`, `PRUNE`), which walk the many runs a command line names through the entry's handler, ask a person's yes, and tally
 * what was not done into the exit code.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  clearCustomInstructions,
  customInstructionsFile,
  customInstructionsFor,
  HOME,
  PRUNE,
  pruneLines,
  pruningBytes,
  RM,
  runStore,
  sizeOf,
  writeCustomInstructions,
  type Args,
  type Pruning,
} from '../runner.ts';
import { HELP, usage, readFlags, confirmed, type Engine } from './flags.ts';

/** The runs a command line named, in the order given, each once (`RM`'s and `PRUNE`'s many positional). */
const idsOf = (args: Args): readonly string[] => (Array.isArray(args.runId) ? args.runId : []);

/**
 * One run `wf rm` was given, forgotten through `RM`'s handler and said in its line; returns whether it is still there, and whether that is
 * a failure other than a refusal.
 */
async function rmOne(e: Engine, id: string, args: Args): Promise<{ kept: boolean; failed: boolean }> {
  try {
    const data = await RM.handler(e, { ...args, runId: id });
    for (const line of RM.print(data, args)) console.log(line);
    return { kept: data.forgot.kind === 'refused' || data.forgot.kind === 'held', failed: false };
  } catch (err) {
    console.log(`${id}  not forgotten: ${(err as Error).message}`);
    return { kept: true, failed: (err as { exitCode?: number }).exitCode !== 2 };
  }
}

/**
 * `wf rm`: each run forgotten, judged on its own, a line each, a refusal included; once every run has had its say, it fails naming those
 * not forgotten, exit 2, or 1 when one failed otherwise.
 */
export async function rmVerb(args: Args, e: Engine): Promise<void> {
  const ids = idsOf(args);
  if (!ids.length) return console.log(HELP);
  const notForgotten: string[] = [];
  let failed = false;
  for (const id of ids) {
    const one = await rmOne(e, id, args);
    if (one.kept) notForgotten.push(id);
    failed ||= one.failed;
  }
  if (notForgotten.length) {
    throw Object.assign(
      new Error(
        `wf rm: ${notForgotten.join(', ')} not forgotten — ${notForgotten.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: failed ? 1 : 2 },
    );
  }
  return;
}

/** The runs `wf prune` named and did not prune, and whether one failed otherwise than by a refusal, which makes its exit 1 and not 2. */
type PruneTally = { notPruned: string[]; failed: boolean };

/** A run `wf prune` failed to judge or to prune: its line, and its place in the tally. */
function notPrunedLine(id: string, err: unknown, tally: PruneTally): void {
  console.log(`${id}  not pruned: ${(err as Error).message}`);
  tally.notPruned.push(id);
  if ((err as { exitCode?: number }).exitCode !== 2) tally.failed = true;
}

/** `wf prune`'s end: once every run has had its say, it fails naming each run not pruned, exit 2, or 1 when one failed otherwise. */
function refusedNamed(tally: PruneTally): void {
  if (tally.notPruned.length) {
    throw Object.assign(
      new Error(
        `wf prune: ${tally.notPruned.join(', ')} not pruned — ${tally.notPruned.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
      ),
      { exitCode: tally.failed ? 1 : 2 },
    );
  }
}

/** Each of `ids` judged for `wf prune`, removing nothing whatever `args` says; a run it cannot judge is said and tallied. */
async function judged(e: Engine, ids: readonly string[], args: Args, tally: PruneTally): Promise<Pruning[]> {
  const found: Pruning[] = [];
  for (const id of ids) {
    try {
      found.push((await PRUNE.handler(e, { ...args, runId: id, yes: false })).pruning);
    } catch (err) {
      notPrunedLine(id, err, tally);
    }
  }
  return found;
}

/**
 * What `wf prune` found, a run's lines each. Of named runs, a refusal is tallied; of every run, a run with nothing to prune is not said at
 * all, and the runs not over are said in one line.
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

/** The runs `wf prune` removes once a person has said yes, each judged again as it is pruned, never trusted from the listing. */
async function prunedAll(e: Engine, prunable: Pruning[], args: Args, tally: PruneTally): Promise<void> {
  for (const p of prunable) {
    try {
      const data = await PRUNE.handler(e, { ...args, runId: p.id, yes: true });
      const done = data.pruning;
      for (const line of PRUNE.print(data, args)) console.log(line);
      if (done.kind === 'refused' || done.left.length) tally.notPruned.push(p.id);
    } catch (err) {
      notPrunedLine(p.id, err, tally);
    }
  }
}

/** Whether `wf prune` removes `prunable`: on `--yes`, or a person's y; else it says the command that would, and removes nothing. */
async function removing(
  prunable: Pruning[],
  named: boolean,
  { unmerged, yes, artifacts }: { unmerged: boolean; yes: boolean; artifacts: boolean },
): Promise<boolean> {
  if (yes || (await confirmed('remove them? [y/N] '))) return true;
  console.log(
    `nothing removed: wf prune ${[...(named ? prunable.map((p) => p.id) : []), ...(unmerged ? ['--unmerged'] : []), ...(artifacts ? ['--artifacts'] : []), '--yes'].join(' ')} removes them`,
  );
  return false;
}

/**
 * `wf prune`: the space runs that are over hold, listed with its size and freed on `--yes` or a person's y. Named runs are judged each on
 * its own, a line each, a refusal included; with none, every run.
 */
export async function pruneVerb(args: Args, e: Engine): Promise<void> {
  const ids = idsOf(args);
  const unmerged = args.unmerged === true;
  const yes = args.yes === true;
  const artifacts = args.artifacts === true;
  const named = ids.length > 0;
  const tally: PruneTally = { notPruned: [], failed: false };
  const found = await judged(e, named ? ids : runStore.runs.list().map((r) => r.id), args, tally);
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
  await prunedAll(e, prunable, args, tally);
  return refusedNamed(tally);
}

/** `wf agents custom`'s flags after the agent's name: the words to write (`--file <path>`, or `-` for stdin), `--clear`, and `--repo`. */
function customHow(argv: string[]): { file?: string; clear: boolean; repo: string } {
  const { values, switches } = readFlags(argv, {
    takes: {
      '--file': 'the file whose words to write, or - to read them from stdin: wf agents custom <name> --file <path>',
      '--repo': 'the repository whose agents to look in: wf agents custom <name> --repo <r>',
    },
    switches: ['--clear'],
    unknown: (arg) =>
      `wf agents custom takes one agent's name, then --file <path> (or --file - for stdin), --clear or --repo <r>, not ${arg}.`,
    twice: (flag) => `wf agents custom takes ${flag} once: one agent's words are one file.`,
  });
  const clear = switches.includes('--clear');
  const file = values['--file']?.[0];
  if (clear && file !== undefined)
    usage('wf agents custom takes --file or --clear, not both: --file writes the words, --clear removes them.');
  return { ...(file !== undefined && { file }), clear, repo: values['--repo']?.[0] ?? '.' };
}

/** The words `--file` names: the file's text, or stdin's for `-`. Refused, naming the file, when it cannot be read. */
function wordsFrom(file: string): string {
  try {
    return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (err) {
    return usage(
      `wf agents custom cannot read ${file === '-' ? 'stdin' : path.resolve(file)}: ${(err as Error).message}. Name a file that is there.`,
    );
  }
}

/**
 * `wf agents custom`: a person's custom instructions for one agent, kept in their store (`customInstructionsFile`) — printed bare, written
 * from `--file`, removed with `--clear`. Refused, writing nothing: a name no place has, and what `writeCustomInstructions` refuses. A run
 * already started keeps the words it was started with.
 */
export function agentsCustom(args: string[]): void {
  const [name, ...flags] = args;
  if (!name || name.startsWith('-')) return console.log(HELP);
  const how = customHow(flags);
  const file = customInstructionsFile(HOME, name);
  const kept = 'a run already started keeps the words it was started with';
  if (how.clear)
    return console.log(
      clearCustomInstructions(HOME, name, how.repo)
        ? `${name}: custom instructions removed, ${file} — ${kept}`
        : `${name} has no custom instructions to remove`,
    );
  if (how.file !== undefined) {
    writeCustomInstructions(HOME, name, wordsFrom(how.file), how.repo);
    return console.log(
      `${name}: custom instructions written to ${file}, told after its instructions in every run started from now — ${kept}`,
    );
  }
  const words = customInstructionsFor(HOME, name, how.repo);
  if (words === undefined)
    return console.log(`${name} has no custom instructions. Set them with wf agents custom ${name} --file <path>, or --file - for stdin.`);
  console.log(`${file}\n\n${words}`);
}
