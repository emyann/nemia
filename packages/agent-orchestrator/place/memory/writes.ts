/**
 * The verbs of the test place that change a repository or a directory: `make`, `handoff`, `land`, `remove`, `export` and `seal`, each
 * over what the place holds (`Held`) and answering as its twin of the git place does, refusing in its own words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkoutAt, committed, dirty, mergedIn, repositoryAt, takenBack } from './acts.ts';
import { isDirectory, OWN, real, writeChanges } from './disk.ts';
import { noRepository, refused, runBranch, type Reply } from './reads.ts';
import { commitAt, type Held, type Repository } from './world.ts';
import type { PlaceRequests } from '../../src/place/place.ts';

/** A workspace cut at `at` on the new branch `name` from `from`, its files written there; why not, where it cannot be. */
function cut(repo: Repository, at: string, name: string, from: string): string | undefined {
  const base = commitAt(repo, from);
  if (!base) return `${from} names no commit of ${repo.root}`;
  if (repo.branches.has(name)) return `a branch named ${name} is there already`;
  if (fs.existsSync(at) && (!isDirectory(at) || fs.readdirSync(at).length)) return `${at} is there already, and is not empty`;
  writeChanges(at, {}, base.tree);
  repo.branches.set(name, base.id);
  repo.checkouts.set(real(at), { dir: real(at), branch: name });
  return undefined;
}

/**
 * `make`: the workspace at `at` on `name`, the branch of the run's leaf (`runBranch`), cut from `from` or taken up as it stands while its
 * directory is one, with each branch of `also` merged into it: one the repository lacks, or asked while a conflict stands, is a note,
 * dropped where a conflict is left.
 */
export function make(held: Held, { repo: dir, at, run, leaf, from, also }: PlaceRequests['make']): Reply<'make'> {
  const name = runBranch(run, leaf);
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so no workspace can be cut from it`);
  const repo = repositoryAt(held, dir);
  if (!repo) return refused(`${at} could not be cut on ${name} from ${from}: ${noRepository(dir)}`);
  const there = repo.checkouts.get(real(at));
  if (there && there.branch !== name)
    return refused(`${at} holds a workspace on ${there.branch}, not on ${name}: remove it, then let the run cut it again`);
  const failed = there && isDirectory(at) ? undefined : cut(repo, at, name, from);
  if (failed) return refused(`${at} could not be cut on ${name} from ${from}: ${failed}`);
  const found = checkoutAt(held, at)!;
  const notes: string[] = [];
  for (const branch of also) {
    const tip = commitAt(repo, branch);
    if (!tip) notes.push(`merge: ${branch} was not merged — it names no commit of ${repo.root}`);
    else if (found.checkout.staged) notes.push(`merge: ${branch} was not merged — a merge before it is not concluded`);
    else mergedIn(held, found, tip.id, true, `Merge branch '${branch}' into ${name}`);
  }
  const conflicts = [...(found.checkout.staged?.conflicts ?? [])];
  return { workspace: at, branch: name, conflicts, notes: conflicts.length ? [] : notes };
}

/** `handoff`: what a step left uncommitted in its workspace, committed on its branch; null where it left nothing. */
export function handoff(held: Held, { workspace, step, why }: PlaceRequests['handoff']): Reply<'handoff'> {
  if (!isDirectory(workspace)) return refused(`${workspace} is not a directory, so nothing of ${step} is there to hand off`);
  const found = checkoutAt(held, workspace);
  if (!found) return refused(`nothing of ${step} can be handed off: ${noRepository(workspace)}`);
  if (!dirty(found.repo, found.checkout)) return { commit: null };
  return { commit: committed(held, found, `${step}: hand off what was left uncommitted${why}`) };
}

/**
 * `land`: the merge staged in a checkout committed under the message given, or taken back. The commit holds the merge as it was staged
 * and resolved, never a file the checkout was left since.
 */
export function land(held: Held, request: PlaceRequests['land']): Reply<'land'> {
  const { repo: dir, act } = request;
  const found = checkoutAt(held, dir);
  if (!found) return refused(`there is no merge to ${act}: ${noRepository(dir)}`);
  const { staged } = found.checkout;
  if (!staged) return refused(`no merge is in progress in ${dir}, so there is none to ${act}`);
  if (request.act === 'abort') {
    takenBack(found);
    return { aborted: true };
  }
  if (staged.conflicts.length) return refused(`${staged.conflicts.join(', ')} still in conflict in ${dir}: resolve each, then land again`);
  if (!request.message.trim()) return refused(`the merge in ${dir} is given an empty message, and is not committed under none`);
  return { commit: committed(held, found, request.message.trim(), staged.tree) };
}

/** Why the workspace `dir` of `repo` is not removed, or undefined once it is, with its directory. */
function workspaceLeft(repo: Repository, dir: string): string | undefined {
  const checkout = repo.checkouts.get(real(dir));
  if (!checkout || checkout.dir === repo.root) return `${dir} is no workspace cut from ${repo.root}`;
  if (fs.existsSync(checkout.dir) && dirty(repo, checkout)) return `${dir} holds work no commit has: commit it or take it away first`;
  fs.rmSync(checkout.dir, { recursive: true, force: true });
  repo.checkouts.delete(checkout.dir);
  return undefined;
}

/** Why the branch `name` of `repo` is not deleted, or undefined once it is. */
function branchKept(repo: Repository, name: string): string | undefined {
  if (!repo.branches.has(name)) return `${repo.root} has no branch ${name}`;
  const held = [...repo.checkouts.values()].find((c) => c.branch === name);
  if (held) return `${name} is the branch ${held.dir} is on`;
  repo.branches.delete(name);
  return undefined;
}

/** `remove`: each workspace that holds nothing uncommitted taken away, those whose directory is gone forgotten, each branch deleted. */
export function remove(held: Held, { repo: dir, workspaces, branches }: PlaceRequests['remove']): Reply<'remove'> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so there is no repository to remove anything from`);
  const repo = repositoryAt(held, dir);
  const answer: { removed: string[]; left: { path: string; said: string }[]; deleted: string[]; kept: { branch: string; said: string }[] } =
    { removed: [], left: [], deleted: [], kept: [] };
  for (const workspace of workspaces) {
    const said = repo ? workspaceLeft(repo, workspace) : noRepository(dir);
    if (said === undefined) answer.removed.push(workspace);
    else answer.left.push({ path: workspace, said });
  }
  for (const gone of [...(repo?.checkouts.values() ?? [])].filter((c) => !fs.existsSync(c.dir))) repo?.checkouts.delete(gone.dir);
  for (const branch of branches) {
    const said = repo ? branchKept(repo, branch) : noRepository(dir);
    if (said === undefined) answer.deleted.push(branch);
    else answer.kept.push({ branch, said });
  }
  return answer;
}

/** `export`: a tag's files written into an empty folder, which is given the place's own folder for `seal` to take away. */
export function exported(held: Held, { repo: dir, tag, into }: PlaceRequests['export']): Reply<'export'> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so no tag in it can be exported`);
  const repo = repositoryAt(held, dir);
  const id = repo?.tags.get(tag);
  const commit = id === undefined ? undefined : repo?.commits.get(id);
  if (!commit) return refused(`${dir} has no tag ${tag}: tag the commit to release (world.tag)`);
  if (fs.existsSync(into) && fs.readdirSync(into).length)
    return refused(`${into} is not empty, and a tag is exported into an empty folder`);
  writeChanges(into, {}, commit.tree);
  fs.mkdirSync(path.join(into, OWN));
  return { commit: commit.id };
}

/** `seal`: the place's own folder taken from a tree `export` wrote; refused for a checkout, which is no export's. */
export function seal(held: Held, { tree }: PlaceRequests['seal']): Reply<'seal'> {
  if (!isDirectory(tree)) return refused(`${tree} is not a directory, so there is no exported tree to seal`);
  if (checkoutAt(held, tree)) return refused(`${tree} is a checkout that holds a commit, not a tree an export wrote: it is left as it is`);
  const own = path.join(tree, OWN);
  if (!fs.existsSync(own)) return { removed: false };
  fs.rmSync(own, { recursive: true, force: true });
  return { removed: true };
}
