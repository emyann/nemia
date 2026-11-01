/**
 * Pruning a finished run: what a prune kept (`prunedKept`), whether it may run again (`pruneAgain`), what it refuses (`pruneRefusal`)
 * and what a pruned or a held run refuses (`prunedRefusal`, `heldRefusal`), and the lines that say what it frees (`pruneLines`); and
 * the daemon's rule for a finished run: which runs it may free (`freeable`), which of them a sweep takes (`freeTurn`), and what it says
 * of one it left (`freeSaid`) or freed (`freedLine`). Pure.
 */
import { andList, isRepositoryRun, prunedWords, type RepositoryRun, type Pruned, type Run } from '../record/record.ts';
import { holdWord } from '../wait/wait.ts';
import { sizeOf } from '../artifacts/artifacts.ts';
import type { Decision } from '../decide/decide.ts';
import { engineWords, type EngineForgetting } from '../forgetting/forgetting.ts';

/** What is kept of a pruned run, after `prunedWords`: its files too, unless `nemia prune --artifacts` removed them. */
export const prunedKept = (pruned: Pruned): string =>
  pruned.artifacts ? 'its branches and record are kept' : 'its branches, record and files are kept';

/** A step at its gate on a pruned run, as `nemia ls` and `nemia decide` both say it: no approval is left to give (`prunedRefusal`). */
export const neverApproved = (pruned: Pruned): string => `not approved, and never can be: the run was ${prunedWords(pruned)}`;

/**
 * Why a verb that would file work into a pruned run is refused — or null, for a run nobody pruned. Pure. A retry continues in the step's
 * worktree, a round and an approval file what inherits one, and an acceptance files what waits on a loop: every one of them would start a
 * session in a directory `nemia prune` removed. What is left of the run is its branches, which a person lands by hand, and its record. A
 * run whose files alone were pruned, its worktrees gone or never cut, is over all the same, and refused in words that name its files.
 */
export function prunedRefusal(run: Run, what: string): string | null {
  if (!run.pruned) return null;
  const { at, worktrees, artifacts } = run.pruned;
  if (artifacts && !worktrees.length) {
    return `${run.id} was pruned at ${artifacts.at}: its files were removed (nemia prune --artifacts), and ${what} would file work on a run whose files the steps after it read are gone. Its branches are kept, with the work on them — nemia decide ${run.id} names them. For more work on it, start a new run with nemia start.`;
  }
  const files = artifacts ? `, its files at ${artifacts.at} (nemia prune --artifacts)` : '';
  return `${run.id} was pruned at ${at}: its worktrees were removed (nemia prune)${files}, and ${what} would file work into one of them. Its branches are kept, with the work on them — nemia decide ${run.id} names them. For more work on it, start a new run with nemia start.`;
}

/**
 * Why a verb that would release work on a held run is refused — or null, for a run nobody holds. Pure. The hold is a person's word that
 * nothing more of the run is filed until other runs land (`Run.hold`); an approval, a try, a round or an acceptance each file work, or
 * release it, and taking one now would be a second word against the first. The question a step asked stays on its record, and is asked
 * again once the hold lifts; a person who wants to answer it now lifts the hold first, which is the one way the refusal names.
 */
export function heldRefusal(run: Run, what: string): string | null {
  if (!run.hold) return null;
  return `${run.id} is ${holdWord(run.hold.until.map((id) => ({ run: id })))} (nemia hold, at ${run.hold.at || 'a time its file no longer says'}), and ${what} would release work the hold keeps back. What the step asks stays on its record, and is asked again once the hold lifts; to answer it now, lift the hold first: nemia hold ${run.id} --off.`;
}

/**
 * What `nemia prune` found of one run, as git and the engine say it now: what `pruneRefusal` judges. `decided` is the kind `nemia decide`
 * says (`decision`), undefined for a record that froze no workflow and whose folder does not read; `held` is why `nemia rm` would not
 * forget it (`forgetRefusal`, worded for `nemia prune`); `owed` the steps a pass still owes a hand-off (`handOffOwed` in advance.verb.ts);
 * and each worktree its place lists as the run's, with who holds it (`heldBy`), its tip when a removal would leave what it holds on no
 * branch (`offBranch`, `heldWorktree`), each change it holds uncommitted, and `fix`, the place's command for it (its `say`).
 */
export type PruneFacts = {
  decided: Decision['kind'] | undefined;
  held: string | null;
  owed: readonly string[];
  worktrees: ReadonlyArray<{ path: string; heldBy?: string; offBranch?: string; changes?: readonly string[]; fix?: string }>;
  /** Whether this prune would remove the run's files directory (`--artifacts`, and one is there). */
  files?: boolean;
};

/**
 * The `nemia prune` a person is told to run for one run: the flags they gave repeated, so what they run next is not refused for a flag it
 * left out — a files directory asked for is asked for again, and a run nobody has decided keeps its `--unmerged`. Pure.
 */
export const pruneAgain = (id: string, { unmerged = false, artifacts = false }: { unmerged?: boolean; artifacts?: boolean } = {}): string =>
  `nemia prune ${id}${unmerged ? ' --unmerged' : ''}${artifacts ? ' --artifacts' : ''}`;

/**
 * Why `nemia prune` will not remove this run's worktrees, in words that say what to do instead — or null, when it may. Pure. Every reason
 * is named at once, so a person clears them in one go.
 *
 * `nemia prune` removes a run's worktrees and nothing else: they are most of the space a run holds (a `node_modules` per workspace
 * package), and nothing that reads a run that is over reads them — `nemia decide`, the board and a run that waits on this one read its
 * branches, its files directory and the engine's record. So it takes only what is rebuildable, and refuses where a worktree still holds
 * anything else:
 *
 * - **a folder run**: its steps' folders are its work, not a checkout of a branch, and they are kept until `nemia rm` forgets the run.
 * - **a run that is not over** (`decision` says running), or whose workflow no longer reads, so that nobody can say.
 * - **whatever holds `nemia rm`** (`held`): a task in flight, anything due, an ask no pass has spent, a step at its gate. A run waiting on
 *   this one is no reason here, since the record it reads stays.
 * - **a run finished and not merged**, unless `unmerged` — or already pruned, whose merge is not asked again of its worktrees; its files,
 *   when this prune would remove them (`files`), are asked again, since that word was for the worktrees — and said only once nothing
 *   above holds it, since `--unmerged` clears none of that: pruned, none of its steps can be tried again, sent round or approved
 *   (`prunedRefusal`), and its branch is the one place its work is left. A run that worked in the repository itself has no branch to
 *   merge, and is refused so only for its files, which are part of what a person reads to decide it.
 * - **a hand-off still owed** (`owed`): what a pass would commit, and the files it would collect, are only in the worktree.
 * - **a worktree the place would not remove, or that holds what no branch has**: held; on no branch; or with changes no commit holds —
 *   where `nemia rm` would commit them under a step's name, `nemia prune` leaves that to a person, since the run is not being forgotten.
 *
 * `unmerged` and `artifacts` are the flags the person gave, and every command offered repeats them (`pruneAgain`).
 */
export function pruneRefusal(
  run: Run,
  facts: PruneFacts,
  { unmerged = false, artifacts = false }: { unmerged?: boolean; artifacts?: boolean } = {},
): string | null {
  const id = run.id;
  const again = pruneAgain(id, { unmerged, artifacts });
  const agreed = unmerged || (Boolean(run.pruned) && !facts.files);
  if (!isRepositoryRun(run)) {
    return `a folder run: its steps' folders are its work, kept with the run until it is forgotten — no worktree to prune. nemia rm ${id} forgets it with them.`;
  }
  const said: string[] = [];
  if (facts.decided === undefined) {
    said.push(`its workflow no longer reads, so whether it is over cannot be told — nemia rm ${id} forgets it whole`);
  } else if (facts.decided === 'running') {
    said.push(
      `it is not over — nemia decide ${id} says it is still running. Pruning is not cancelling: nemia cancel ${id} files nothing more, then ${again} once what was in flight has settled`,
    );
  } else if (facts.held) {
    said.push(facts.held.replace(/\.$/, ''));
  }
  if (facts.decided === 'awaiting' && !agreed && !facts.held) said.push(unmergedRefusal(run, artifacts));
  if (facts.owed.length) {
    const one = facts.owed.length === 1;
    said.push(
      `${andList(facts.owed)} ${one ? 'is' : 'are'} still to be handed off — a pass commits what ${one ? 'it' : 'they'} left, and collects ${one ? 'its' : 'their'} files, from the worktree: let a tick run (nemia tick), then ${again}`,
    );
  }
  said.push(...facts.worktrees.flatMap((w) => worktreeRefusal(w, again) ?? []));
  return said.length ? `${said.join('; ')}.` : null;
}

/**
 * Why `nemia prune` waits on a run that finished and nobody has decided: its branch, or the repository it worked in, is what is read. Pure.
 */
function unmergedRefusal(run: RepositoryRun, artifacts: boolean): string {
  const again = pruneAgain(run.id, { unmerged: true, artifacts });
  return run.isolate
    ? `it finished and is not merged into ${run.branch}: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left. Merge it first, or prune it all the same: ${again}`
    : `it finished on ${run.branch} itself and waits on your decision: pruned, none of its steps can be tried again, sent round or approved, and its files are part of what you read to decide it. Decide it first, or prune it all the same: ${again}`;
}

/**
 * Why `nemia prune` keeps one worktree — held, on no branch, or holding changes — with the place's command for it, or undefined. Pure.
 */
function worktreeRefusal(w: PruneFacts['worktrees'][number], again: string): string | undefined {
  if (w.heldBy !== undefined) {
    return `${w.path} is held${w.heldBy ? ` (${w.heldBy})` : ''}, and the place will not remove it — let it go if nothing needs it${w.fix ? `: ${w.fix}` : ''}`;
  }
  if (w.offBranch !== undefined) {
    return `${w.path} is on no branch${w.offBranch ? ` at its tip ${w.offBranch.slice(0, 7)}` : ''} — and removing it would leave what it holds on none: put it on one${w.fix ? ` (${w.fix})` : ''}, then ${again}`;
  }
  if (!w.changes?.length) return undefined;
  const shown = w.changes.slice(0, 3).join(', ');
  const more = w.changes.length > 3 ? ` and ${w.changes.length - 3} more` : '';
  return `${w.path} holds changes no commit has (${shown}${more}), and they would be lost with it: commit them on its branch, or discard them${w.fix ? ` (${w.fix})` : ''}, then ${again}`;
}

/**
 * What `nemia prune` found, or did, with one run, for `pruneLines` to say.
 *
 *   refused   `pruneRefusal` said why, and nothing was touched
 *   nothing   no worktree of it is left to remove — nor, under `--artifacts`, a files directory — and `nothing` says why
 *   prunable  what `nemia prune --yes` would remove: each worktree, with what it holds on disk, and under `--artifacts` its files directory
 *   pruned    those removed, and the run marked pruned; `left`, each git would not remove when asked, in its words, with the place's
 *             command to look in it (`fix`); each left because the place's `remove` did not answer (`unread`, why); and the files
 *             directory when what was in it did not all go
 */
export type Pruning = {
  id: string;
  kind: 'refused' | 'nothing' | 'prunable' | 'pruned';
  refusal?: string;
  nothing?: string;
  worktrees: Array<{ path: string; bytes: number }>;
  /** The run's files directory (`runs/<id>/artifacts/`), under `--artifacts`: what it holds, or on `pruned` what its removal freed. */
  artifacts?: { path: string; bytes: number };
  left: Array<{ path: string; git: string; fix?: string } | { path: string; unread: string } | { path: string; files: string }>;
  /** When the run was pruned, on `pruned`. */
  at?: string;
  /**
   * Given `--unmerged`: the command a kept line offers repeats it (`pruneAgain`), since a run nobody has decided is refused its files
   * without it.
   */
  unmerged?: true;
  /** What `nemia rm` would forget of the engine's tasks of the run (`runsForgetting`), as `nemia prune` lists it: never removed by it. */
  engine?: EngineForgetting;
};

/** The bytes a list of worktrees holds, together. */
export const prunedBytes = (worktrees: ReadonlyArray<{ bytes: number }>): number => worktrees.reduce((sum, w) => sum + w.bytes, 0);

/** The bytes one run's prune frees, or would: its worktrees and, under `--artifacts`, its files. */
export const pruningBytes = (p: Pick<Pruning, 'worktrees' | 'artifacts'>): number => prunedBytes(p.worktrees) + (p.artifacts?.bytes ?? 0);

/**
 * What `nemia prune` says of one run: a line, and under a run with worktrees, one line for each, and one for its files directory under
 * `--artifacts`; and what `nemia rm` would forget of the engine's tasks (`engineWords`), which no prune touches. Pure. A prune of the
 * worktrees alone says that the files are kept.
 */
export function pruneLines(p: Pruning): string[] {
  const engine = p.engine && p.kind !== 'refused' ? engineWords(p.engine, { id: p.id, dry: true }) : '';
  return engine ? [...storeLines(p), `   ${engine}`] : storeLines(p);
}

/** What `nemia prune` says of one run's worktrees and files. */
function storeLines(p: Pruning): string[] {
  const n = p.worktrees.length;
  const worktrees = `${n} worktree${n === 1 ? '' : 's'}`;
  const what = !p.artifacts ? worktrees : n ? `${worktrees} and its files` : 'its files';
  const each = [...p.worktrees, ...(p.artifacts ? [p.artifacts] : [])].map((w) => `   ${w.path}  ${sizeOf(w.bytes)}`);
  if (p.kind === 'refused') return [`${p.id}  not pruned: ${p.refusal}`];
  if (p.kind === 'nothing') return [`${p.id}  nothing to prune: ${p.nothing}`];
  if (p.kind === 'prunable') return [`${p.id}  would remove ${what}, ${sizeOf(pruningBytes(p))}`, ...each];
  return [
    `${p.id}  pruned: removed ${what}, ${sizeOf(pruningBytes(p))} freed; ${p.artifacts ? 'its record and branches are kept' : 'its record, branches and files are kept'}`,
    ...each,
    ...p.left.map((l) =>
      'git' in l
        ? `   kept ${l.path}: git would not remove it — ${l.git}; look in it before anything is forced${l.fix ? `: ${l.fix}` : ''}`
        : 'unread' in l
          ? `   kept ${l.path}: the place's remove did not answer — ${l.unread}; ${pruneAgain(p.id, { unmerged: p.unmerged, artifacts: Boolean(p.artifacts) })} once it does`
          : `   kept what is left in ${l.path}: ${l.files} — what is still there is kept, and read as it is; ${pruneAgain(p.id, { unmerged: p.unmerged, artifacts: true })} removes it once it can be`,
    ),
  ];
}

/** A run as a pass answered it, as far as the daemon's rule reads it: the run, its status, and whether the pass found it at rest. */
export type Answered = { readonly run: Run; readonly status: string; readonly feed: { readonly atRest?: true } };

/**
 * The runs the daemon may free of their worktrees, by id, among what a pass answered: at rest, succeeded or cancelled, and a
 * repository's. Pure. Every other run is none of the rule's, and nothing is asked of its place: one in flight, failed, stopped, over
 * its budget or waiting on a person may still be tried again from its worktree, and a folder run's folders are its work. Whether a
 * succeeded run is merged is not read here: the prune's own judgement refuses one that is not (`pruneRefusal`).
 */
export const freeable = (answers: readonly Answered[]): string[] =>
  answers
    .filter((a) => a.feed.atRest === true && (a.status === 'succeeded' || a.status === 'cancelled') && isRepositoryRun(a.run))
    .map((a) => a.run.id);

/**
 * The candidates one sweep judges: up to `bound` of those not judged yet, in order; and once every one has been, one of them, each in
 * its turn (`turn` counts the sweeps). Pure. So a store with many finished runs is freed `bound` a sweep, and a run that stays — one
 * awaiting its merge, a worktree a person must see to — costs a judgement a sweep at most, whatever their number.
 */
export function freeTurn(candidates: readonly string[], judged: ReadonlySet<string>, bound: number, turn: number): string[] {
  const fresh = candidates.filter((id) => !judged.has(id)).slice(0, Math.max(0, bound));
  if (fresh.length || !candidates.length || bound < 1) return fresh;
  const next = candidates[turn % candidates.length];
  return next === undefined ? [] : [next];
}

/**
 * What the daemon says of a run it judged and did not free — or null, when the refusal is the rule's own boundary and nothing is to be
 * said. Pure. Said: a place that did not answer (`facts` undefined: the judgement got no further), and a finished run — landed or
 * cancelled, nothing holding it, no hand-off owed — whose worktree is what refuses, locked, on no branch or holding changes: a person
 * must see to it. Not said: a run not merged or not over, which is kept on purpose.
 */
export function freeSaid(facts: PruneFacts | undefined, refusal: string): string | null {
  if (!facts) return refusal;
  const finished = (facts.decided === 'landed' || facts.decided === 'cancelled') && !facts.held && !facts.owed.length;
  return finished ? refusal : null;
}

/** What the daemon says of a run it freed: how many worktrees, and the bytes that freed. Pure. */
export const freedLine = (p: Pick<Pruning, 'id' | 'worktrees'>): string =>
  `${p.id}  freed: removed ${p.worktrees.length} worktree${p.worktrees.length === 1 ? '' : 's'}, ${sizeOf(prunedBytes(p.worktrees))}; its record, branches and files are kept`;
