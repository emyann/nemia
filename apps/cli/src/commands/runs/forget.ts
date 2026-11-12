/**
 * The runners that forget runs: `nemia rm` (the Run's `delete`, the run whole, `?whole=true`) and `nemia prune` (`prune`). Each run named
 * is judged on its own, a line each, a refusal included, and once every run has had its say the runner exits 2 naming those left, or 1
 * where one failed otherwise. `nemia prune` asks first: each run previewed by the api (`preview`), the space it holds listed, then
 * removed on `--yes` or a person's y at the terminal.
 */
import readline from 'node:readline/promises';
import { type Args, helpOf, PRUNE_WORDS, RM_WORDS, type RunPruned } from 'objects';
import { asked, everyPage, pageOf } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { listArg, namespaceOfRun, said, switchArg } from '../requests.ts';

/** The runs named, in the order typed. */
const idsOf = (args: Args): readonly string[] => listArg(args, 'runId');

/** The runs a verb named and left, and whether one failed otherwise than by a refusal, which makes its exit 1 and not 2. */
type Tally = { left: string[]; failed: boolean };

/** The exit of a verb that judged each run on its own: 0 where none was left; else refused, naming them, 2, or 1 where one failed. */
function tallied(verb: string, did: string, { left, failed }: Tally): number {
  if (!left.length) return 0;
  throw new Refused(
    `nemia ${verb}: ${left.join(', ')} not ${did} — ${left.length > 1 ? 'each' : 'its'} line above says why, and what to do.`,
    failed ? 1 : 2,
  );
}

/** The line of a run a verb could not act on: the api's words as they are where they already open with the run, else after its id. */
const refusedLine = (id: string, did: string, words: string): string =>
  words.startsWith(`${id}  `) ? words : `${id}  not ${did}: ${words}`;

/** A run a verb could not act on: its line (`refusedLine`), and its place in the tally. */
function leftLine(id: string, did: string, err: unknown, tally: Tally): void {
  said([refusedLine(id, did, err instanceof Error ? err.message : String(err))]);
  tally.left.push(id);
  if (!(err instanceof Refused)) tally.failed = true;
}

/** `nemia rm <runId>... [--delete-branches [--force-unmerged]]`: each run forgotten whole, its line each; none named, the help. */
export async function rm(args: Args): Promise<number> {
  const ids = idsOf(args);
  if (!ids.length) {
    said([helpOf([RM_WORDS])]);
    return 0;
  }
  const query = {
    whole: 'true' as const,
    ...(switchArg(args, 'deleteBranches') ? { deleteBranches: 'true' as const } : {}),
    ...(switchArg(args, 'forceUnmerged') ? { forceUnmerged: 'true' as const } : {}),
  };
  const tally: Tally = { left: [], failed: false };
  for (const name of ids) {
    try {
      const namespace = await namespaceOfRun(RM_WORDS.name, name);
      const removed = await asked(RM_WORDS.name, (c) => c.runs.delete({ params: { namespace, name }, query }));
      said([removed.line ?? `${name}  forgotten`]);
      if (!removed.removed) tally.left.push(name);
    } catch (err) {
      leftLine(name, 'forgotten', err, tally);
    }
  }
  return tallied(RM_WORDS.name, 'forgotten', tally);
}

/** Bytes, as a person reads them. */
const sizeOf = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/** Whether the person at the terminal says y to `question`; no terminal, no. */
async function confirmed(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await terminal.question(question)).trim());
  } finally {
    terminal.close();
  }
}

/** Every run that is over, by its name: what `nemia prune` judges when it names none. */
async function overRuns(): Promise<string[]> {
  const listed = await asked(PRUNE_WORDS.name, (c) =>
    pageOf(everyPage((page) => c.runs.listAll({ query: { ...page, fieldSelector: 'status.state=finished' } }))),
  );
  return listed.items.map((run) => run.metadata.name);
}

/** A run `nemia prune` previewed and found ready: its namespace and what the api said of it. */
type Ready = { name: string; namespace: string; preview: RunPruned };

/** The prefix of the api's words for a run with nothing to prune, which a prune of every run says nothing of. */
const NOTHING = 'Nothing to prune';

/** A run `nemia prune` could not preview, said: nothing to prune, said only where named; else its refusal, tallied where named. */
function unready(name: string, named: boolean, err: unknown, tally: Tally): void {
  const words = err instanceof Error ? err.message : String(err);
  if (words.includes(NOTHING)) {
    if (named) said([`${name}  ${words}`]);
    return;
  }
  if (named) leftLine(name, 'pruned', err, tally);
  else said([refusedLine(name, 'pruned', words)]);
}

/** Each of `ids` previewed, said and tallied, in the order named (`unready`). */
async function previewed(ids: readonly string[], named: boolean, payload: object, tally: Tally): Promise<Ready[]> {
  const ready: Ready[] = [];
  for (const name of ids) {
    try {
      const namespace = await namespaceOfRun(PRUNE_WORDS.name, name);
      const preview = await asked(PRUNE_WORDS.name, (c) =>
        c.runs.prune({ params: { namespace, name }, payload: { ...payload, preview: true } }),
      );
      said(preview.lines);
      ready.push({ name, namespace, preview });
    } catch (err) {
      unready(name, named, err, tally);
    }
  }
  return ready;
}

/** What `nemia prune` says where nothing is ready: nothing to prune, unless a run named was refused, which its line said. */
function noneReady(named: boolean, artifacts: boolean, tally: Tally): number {
  if (!tally.left.length)
    said([named ? 'nothing to prune' : `nothing to prune: no run that is over has a worktree${artifacts ? ' or files' : ''} left`]);
  return tallied(PRUNE_WORDS.name, 'pruned', tally);
}

/** Whether `nemia prune` removes what it listed: on `--yes`, or a person's y; else it says the command that would, and removes nothing. */
async function removing(args: Args, ready: readonly Ready[], named: boolean): Promise<boolean> {
  if (switchArg(args, 'yes') || (await confirmed('remove them? [y/N] '))) return true;
  const flags = ['unmerged', 'artifacts'].filter((key) => switchArg(args, key)).map((key) => `--${key}`);
  said([`nothing removed: nemia prune ${[...(named ? ready.map((r) => r.name) : []), ...flags, '--yes'].join(' ')} removes them`]);
  return false;
}

/** Each run of `ready` pruned, its lines said, a run not pruned or with something left tallied. */
async function removed(ready: readonly Ready[], payload: object, tally: Tally): Promise<void> {
  for (const { name, namespace } of ready) {
    try {
      const done = await asked(PRUNE_WORDS.name, (c) => c.runs.prune({ params: { namespace, name }, payload }));
      said(done.lines);
      if (!done.pruned || done.left.length) tally.left.push(name);
    } catch (err) {
      leftLine(name, 'pruned', err, tally);
    }
  }
}

/**
 * `nemia prune [<runId>...] [--unmerged] [--artifacts] [--yes]`: the space runs that are over hold, listed with its size, and freed on
 * `--yes` or a person's y; with none named, every run that is over.
 */
export async function prune(args: Args): Promise<number> {
  const ids = idsOf(args);
  const named = ids.length > 0;
  const unmerged = switchArg(args, 'unmerged');
  const artifacts = switchArg(args, 'artifacts');
  const payload = { ...(unmerged ? { unmerged } : {}), ...(artifacts ? { artifacts } : {}) };
  const tally: Tally = { left: [], failed: false };
  const ready = await previewed(named ? ids : await overRuns(), named, payload, tally);
  if (!ready.length) return noneReady(named, artifacts, tally);
  const total = sizeOf(ready.reduce((sum, r) => sum + (r.preview.bytes ?? 0), 0));
  said([`${ready.length} run${ready.length > 1 ? 's' : ''} to prune, ${total} in all`]);
  if (await removing(args, ready, named)) await removed(ready, payload, tally);
  return tallied(PRUNE_WORDS.name, 'pruned', tally);
}
