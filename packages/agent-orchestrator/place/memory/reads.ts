/**
 * The verbs of the test place that read and change nothing: `root`, `open`, `standing`, `report`, `trial`, `status` and `inventory`, each over
 * what the place holds (`Held`) and answering as its twin of the git place does for a repository it holds, refusing in its own words.
 */
import fs from 'node:fs';
import { checkoutAt, dirty, headOf, repositoryAt, treeOf, type Found } from './acts.ts';
import { inside, isDirectory, readTree, real, stagedFile } from './disk.ts';
import { ahead, baseOf, changesOf, commitAt, kindIn, merged, within, type Held, type Repository } from './world.ts';
import type { BranchStood, Held as Left, PlaceAnswers, PlaceRequests, PlaceVerb, TrialMerge } from '../../src/place/place.ts';

/** A refusal in the place's words. */
export type Refusal = { readonly refused: string };

/** What a verb answers: its answer, or its refusal. */
export type Reply<V extends PlaceVerb> = PlaceAnswers[V] | Refusal;

/** A refusal in the place's words. */
export const refused = (words: string): Refusal => ({ refused: words });

/** How a directory the test place holds no repository in is said, with what makes one. */
export const noRepository = (dir: string): string =>
  `${dir} is no repository this test place holds: make one there with world.repository, or ask the place that made it`;

/** `root`: the root of the repository that holds a checkout at `dir` or above it, or null where the place holds none there. */
export function root(held: Held, { dir }: PlaceRequests['root']): Reply<'root'> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so it is in no repository: name a folder that is there`);
  const at = real(dir);
  for (const repo of held.repositories.values())
    for (const checkout of repo.checkouts.values()) if (checkout.dir === at || inside(checkout.dir, at)) return { root: repo.root };
  return { root: null };
}

/** `open`: the repository at `root`, the commit and the branch it is on, and the file a staged merge is marked by. */
export function open(held: Held, { root }: PlaceRequests['open']): Reply<'open'> {
  if (!isDirectory(root)) return refused(`${root} is not a directory: name a repository with --repo`);
  const at = checkoutAt(held, root);
  if (!at) return refused(noRepository(root));
  return { repo: root, baseRef: headOf(at.repo, at.checkout), branch: at.checkout.branch, staged: stagedFile(at.checkout.dir) };
}

/** Whether a commit is within another, or unknown where the repository lacks one of them. */
function withinOf(repo: Repository, commit: string, of: string): 'yes' | 'no' | 'unknown' {
  const base = commitAt(repo, of);
  if (!base || !repo.commits.has(commit)) return 'unknown';
  return within(repo, commit, base.id) ? 'yes' : 'no';
}

/** Where one branch asked of stands against `base`. */
function stood(repo: Repository, base: string, one: PlaceRequests['standing']['branches'][number]): BranchStood {
  const head = repo.branches.get(one.branch) ?? null;
  const commit = head ?? one.tip;
  const onBase = commit ? withinOf(repo, commit, base) : 'unknown';
  const known = one.known?.tip === commit && one.known?.pastBase !== null ? one.known?.pastBase : undefined;
  const inRunBase = onBase === 'yes' && known === undefined ? withinOf(repo, commit!, one.baseRef) : 'unknown';
  const pastBase = onBase !== 'yes' ? null : (known ?? (inRunBase === 'unknown' ? null : inRunBase === 'no'));
  return { branch: one.branch, tip: head, onBase, pastBase, ahead: head === null ? null : ahead(repo, commitAt(repo, base)!.id, head) };
}

/** `standing`: every branch and its commit, and where each branch asked of stands against `base`. */
export function standing(held: Held, { repo: dir, base, branches }: PlaceRequests['standing']): Reply<'standing'> {
  const repo = repositoryAt(held, dir);
  if (!repo) return refused(`the branches of ${dir} cannot be listed: ${noRepository(dir)}`);
  if (branches.length && !commitAt(repo, base))
    return refused(`${base} names no commit in ${dir}, the base the branches are asked of: is it a branch of that repository?`);
  const heads = Object.fromEntries([...repo.branches].sort(([a], [b]) => (a < b ? -1 : 1)));
  return { heads, branches: branches.map((one) => stood(repo, base, one)) };
}

/** `report`: what each branch the repository has changed since the commit it shares with the base. */
export function report(held: Held, request: PlaceRequests['report']): Reply<'report'> {
  const { repo: dir, baseRef, onto, branches, diffOf, present, atBase } = request;
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so nothing a branch in it changed can be read`);
  const repo = repositoryAt(held, dir);
  const base = repo && commitAt(repo, baseRef);
  if (!repo || !base) return refused(`the base ${baseRef} cannot be read in ${dir}`);
  const read = branches.flatMap((branch) => {
    const tip = commitAt(repo, branch);
    return tip ? [{ branch, tip, changes: changesOf(baseOf(repo, base.id, tip.id)?.tree ?? {}, tip.tree) }] : [];
  });
  const by = <A>(of: (one: (typeof read)[number]) => A): Record<string, A> => Object.fromEntries(read.map((one) => [one.branch, of(one)]));
  return {
    at: { baseRef, onto: commitAt(repo, onto)?.id ?? null, tips: by(({ tip }) => tip.id) },
    files: by(({ changes }) => changes.map(({ path, status, added, removed }) => ({ added, removed, path, status }))),
    diffs: by(({ changes }) => Object.fromEntries(changes.filter((c) => diffOf.includes(c.path)).map((c) => [c.path, c.diff]))),
    present: by(({ tip }) => Object.fromEntries(present.map((p) => [p, kindIn(tip.tree, p)]))),
    atBase: Object.fromEntries(atBase.map((p) => [p, base.tree[p] ?? null])),
  };
}

/** Whether `branch` merges onto `onto` as both are now. */
function tried(repo: Repository | undefined, { onto, branch }: { readonly onto: string; readonly branch: string }): TrialMerge {
  const [ours, theirs] = [repo && commitAt(repo, onto), repo && commitAt(repo, branch)];
  if (!repo || !ours || !theirs) return { unknown: `${!ours ? onto : branch} names no commit the test place holds` };
  const { conflicts } = merged(baseOf(repo, ours.id, theirs.id)?.tree ?? {}, ours.tree, theirs.tree);
  return conflicts.length ? { clean: false, conflicts } : { clean: true };
}

/** `trial`: the commit each base names now, and whether each branch merges onto its base. */
export function trial(held: Held, { repo: dir, trials }: PlaceRequests['trial']): Reply<'trial'> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so no branch in it can be tried`);
  const repo = repositoryAt(held, dir);
  const at = Object.fromEntries(trials.map(({ onto }) => [onto, (repo && commitAt(repo, onto)?.id) ?? null]));
  return { at, trials: trials.map((pair) => tried(repo, pair)) };
}

/** `status`: whose merge is staged in a checkout, whether it conflicts, and the tips a commit now would leave out. */
export function status(held: Held, { checkout: dir, tips }: PlaceRequests['status']): Reply<'status'> {
  const at = checkoutAt(held, dir);
  if (!at) return refused(`no merge can be staged in ${dir}: ${noRepository(dir)}`);
  const { repo, checkout } = at;
  const heads = checkout.staged?.heads ?? [];
  const asked = new Set(Object.values(tips));
  const head = headOf(repo, checkout);
  return {
    merging: !heads.length ? 'none' : heads.every((h) => asked.has(h)) ? 'ours' : 'other',
    conflicted: Boolean(checkout.staged?.conflicts.length),
    missing: Object.entries(tips)
      .filter(([, id]) => !heads.includes(id) && !(repo.commits.has(id) && within(repo, id, head)))
      .map(([branch]) => branch),
    head,
  };
}

/** A path the commit does not know, as the highest folder of it holding no path the commit knows, closed by `/`; else the path. */
function unknownIn(known: readonly string[], file: string): string {
  const folders = file.split('/').slice(0, -1);
  const prefixes = folders.map((_, i) => `${folders.slice(0, i + 1).join('/')}/`);
  return prefixes.find((prefix) => !known.some((k) => k.startsWith(prefix))) ?? file;
}

/**
 * The paths `found`'s checkout holds that its commit does not, those the commit knows first, each group in order: a folder the commit
 * does not know is named once, whatever it holds.
 */
function changesIn({ repo, checkout }: Found): string[] {
  const [was, now] = [treeOf(repo, checkout), readTree(checkout.dir)];
  const paths = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((p) => was[p] !== now[p]).sort();
  const news = paths.filter((p) => was[p] === undefined).map((p) => unknownIn(Object.keys(was), p));
  return [...paths.filter((p) => was[p] !== undefined), ...new Set(news)];
}

/** One workspace as `inventory` lists it. */
function left(found: Found): Left {
  const { repo, checkout } = found;
  const there = fs.existsSync(checkout.dir);
  const changes = there ? changesIn(found) : [];
  return {
    path: checkout.dir,
    head: headOf(repo, checkout),
    branch: checkout.branch,
    detached: false,
    prunable: !there,
    clean: there ? !dirty(repo, checkout) : null,
    onBranch: true,
    ...(changes.length ? { changes } : {}),
  };
}

/** `inventory`: the workspaces a repository has inside `under`, and its branches under `prefix` with whether `base` holds each. */
export function inventory(held: Held, { repo: dir, under, prefix, base }: PlaceRequests['inventory']): Reply<'inventory'> {
  if (!isDirectory(dir)) return { workspaces: [], branches: [] };
  const repo = repositoryAt(held, dir);
  if (!repo) throw new Error(noRepository(dir));
  const onto = commitAt(repo, base);
  return {
    workspaces: [...repo.checkouts.values()].filter((c) => inside(real(under), c.dir)).map((checkout) => left({ repo, checkout })),
    branches: [...repo.branches]
      .filter(([branch]) => branch.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([branch, id]) => ({ branch, merged: Boolean(onto && within(repo, id, onto.id)) })),
  };
}
