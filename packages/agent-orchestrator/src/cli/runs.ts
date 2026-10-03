/**
 * The verbs over runs and agents — `wf rm`, `wf prune`, `wf show`, `wf logs` and `wf agents custom` — their
 * flags, read off the command line, and what each prints.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  agentsFor,
  clearCustomInstructions,
  customInstructionsFile,
  forget,
  forgetLine,
  HOME,
  Missing,
  prune,
  pruneLines,
  pruningBytes,
  readCustomInstructions,
  runStore,
  sizeOf,
  writeCustomInstructions,
  type ForgetHow,
  type Pruning,
} from '../runner.ts';
import { HELP, usage, readFlags, confirmed, type Engine } from './flags.ts';

/**
 * `wf rm`'s arguments: the runs to forget, each once, and its two switches. Refused before any run is read: a flag it does not take, and
 * `--force-unmerged` without `--delete-branches` — it forces what that flag deletes, and alone would delete nothing, silently.
 */
export function rmHow(argv: string[]): { ids: string[]; how: ForgetHow } {
  const ids: string[] = [];
  const how: ForgetHow = {};
  for (const arg of argv) {
    if (arg === '--delete-branches') how.deleteBranches = true;
    else if (arg === '--force-unmerged') how.forceUnmerged = true;
    else if (arg.startsWith('-'))
      usage(
        `wf rm does not take ${arg}. It takes the runs to forget, then --delete-branches, and --force-unmerged beside it: wf rm <runId> [<runId> ...] [--delete-branches [--force-unmerged]].`,
      );
    else if (!ids.includes(arg)) ids.push(arg);
  }
  if (how.forceUnmerged && !how.deleteBranches) {
    usage(
      "--force-unmerged forces --delete-branches to delete a branch not merged into its run's base branch, and alone deletes nothing: wf rm <runId> --delete-branches --force-unmerged.",
    );
  }
  if (!ids.length && argv.length) usage('wf rm takes the runs to forget, by id: wf rm <runId> [<runId> ...] — wf ls lists them.');
  return { ids, how };
}

/**
 * `wf prune`'s arguments: the runs to prune, each once — none is every run — and its three switches. Refused before any run is read: a flag
 * it does not take.
 */
export function pruneHow(argv: string[]): { ids: string[]; unmerged: boolean; yes: boolean; artifacts: boolean } {
  const ids: string[] = [];
  let unmerged = false;
  let yes = false;
  let artifacts = false;
  for (const arg of argv) {
    if (arg === '--unmerged') unmerged = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--artifacts') artifacts = true;
    else if (arg.startsWith('-'))
      usage(
        `wf prune does not take ${arg}. It takes the runs to prune — none is every run — then --unmerged, --artifacts and --yes: wf prune [<runId> ...] [--unmerged] [--artifacts] [--yes].`,
      );
    else if (!ids.includes(arg)) ids.push(arg);
  }
  return { ids, unmerged, yes, artifacts };
}

/**
 * `wf rm`: each run forgotten, judged on its own, a line each, a refusal included; once every run has had its say, it fails naming those
 * not forgotten, exit 2, or 1 when one failed otherwise.
 */
export async function rmVerb(rest: string[], e: Engine): Promise<void> {
  const { ids, how } = rmHow(rest);
  if (!ids.length) return console.log(HELP);
  const notForgotten: string[] = [];
  let failed = false;
  for (const id of ids) {
    try {
      const forgot = await forget(e, id, how);
      console.log(forgetLine(forgot));
      if (forgot.kind === 'refused' || forgot.kind === 'held') notForgotten.push(id);
    } catch (err) {
      console.log(`${id}  not forgotten: ${(err as Error).message}`);
      notForgotten.push(id);
      if ((err as { exitCode?: number }).exitCode !== 2) failed = true;
    }
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

/** Each of `ids` judged for `wf prune`, removing nothing; a run it cannot judge is said and tallied. */
async function judged(e: Engine, ids: string[], how: { unmerged: boolean; artifacts: boolean }, tally: PruneTally): Promise<Pruning[]> {
  const found: Pruning[] = [];
  for (const id of ids) {
    try {
      found.push(await prune(e, id, how));
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
async function prunedAll(e: Engine, prunable: Pruning[], how: { unmerged: boolean; artifacts: boolean }, tally: PruneTally): Promise<void> {
  for (const p of prunable) {
    try {
      const done = await prune(e, p.id, { ...how, yes: true });
      for (const line of pruneLines(done)) console.log(line);
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
export async function pruneVerb(rest: string[], e: Engine): Promise<void> {
  const { ids, unmerged, yes, artifacts } = pruneHow(rest);
  const named = ids.length > 0;
  const tally: PruneTally = { notPruned: [], failed: false };
  const found = await judged(e, named ? ids : runStore.runs.list().map((r) => r.id), { unmerged, artifacts }, tally);
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
  await prunedAll(e, prunable, { unmerged, artifacts }, tally);
  return refusedNamed(tally);
}

/** `wf show`: the run's record as JSON, its brief and each step's body cut short. */
export function showVerb(rest: string[]): void {
  if (!rest[0]) return console.log(HELP);
  const run = runStore.runs.read(rest[0]);
  const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  console.log(JSON.stringify({ ...run, brief: `${run.brief.slice(0, 120)}…`, workflow }, null, 2));
  return;
}

/** `wf logs`: a step's session output, from the engine, or that it has not run yet. */
export async function logsVerb(rest: string[], e: Engine): Promise<void> {
  const [runId, stepName] = rest;
  if (!runId || !stepName) return console.log(HELP);
  const taskId = runStore.runs.read(runId).steps[stepName]?.taskId;
  if (!taskId) return console.log(`${stepName} has not run yet`);
  return console.log(await e.logs(taskId));
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
 * The names of the agents a run on `repo` may name, sorted: the repository's own, then yours, as a workflow of the repository finds them
 * (`agentsFor`). A name whose file does not read is one all the same.
 */
const agentNamesAround = (repo: string): string[] =>
  [...agentsFor(path.join(path.resolve(repo), 'workflows', '_'), { repo: path.resolve(repo), home: HOME }).keys()].sort();

/**
 * `wf agents custom`: a person's custom instructions for one agent, kept in their store (`customInstructionsFile`) — printed bare, written
 * from `--file`, removed with `--clear`. Refused, writing nothing: a name no place has, and what `writeCustomInstructions` refuses. A run
 * already started keeps the words it was started with.
 */
export function agentsCustom(args: string[]): void {
  const [name, ...flags] = args;
  if (!name || name.startsWith('-')) return console.log(HELP);
  const how = customHow(flags);
  const names = agentNamesAround(how.repo);
  if (!names.includes(name))
    throw new Missing({
      message: `no agent named ${name} where a run on ${path.resolve(how.repo)} looks for one, nor in yours (${path.join(HOME, 'workflows', 'agents')}). ${names.length ? `The agents there: ${names.join(', ')}.` : 'There are none.'} Name one of them, or the repository it is in: --repo <r>.`,
    });
  const file = customInstructionsFile(HOME, name);
  const kept = 'a run already started keeps the words it was started with';
  if (how.clear)
    return console.log(
      clearCustomInstructions(HOME, name)
        ? `${name}: custom instructions removed, ${file} — ${kept}`
        : `${name} has no custom instructions to remove`,
    );
  if (how.file !== undefined) {
    writeCustomInstructions(HOME, name, wordsFrom(how.file));
    return console.log(
      `${name}: custom instructions written to ${file}, told after its instructions in every run started from now — ${kept}`,
    );
  }
  const words = readCustomInstructions(HOME, name);
  if (words === undefined)
    return console.log(`${name} has no custom instructions. Set them with wf agents custom ${name} --file <path>, or --file - for stdin.`);
  console.log(`${file}\n\n${words}`);
}
