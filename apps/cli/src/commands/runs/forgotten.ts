/**
 * What `nemia rm` prints of a run it forgot, worded here off what the api answers (`objects`' `RunRemoved`): one line, its worktrees
 * removed, handed off and already gone, the files removed, what became of each branch, and what the engine did with its tasks. A run not
 * forgotten — refused, held, or with no record — is the api's refusal, in its words, and is no answer here.
 */
import type { RunRemoved } from 'objects';

/** What the engine forgot of a removed run's tasks. */
type Engine = NonNullable<RunRemoved['engine']>;

/** Bytes, as a person reads them. */
export const sizeOf = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/** `n` tasks, in words. */
const tasksWord = (n: number): string => `${n} task${n === 1 ? '' : 's'}`;

/** What the engine forgot of the run's tasks, with their journals' size and feed lines; empty where it forgot none. */
const forgotWords = (f: Engine): string =>
  f.forgotten.length
    ? `the engine forgot ${tasksWord(f.forgotten.length)} of it (${sizeOf(f.journalBytes)} of journal, ${f.feedLines} feed line${f.feedLines === 1 ? '' : 's'})`
    : '';

/** What waits of the run's tasks, and why, and that the daemon's passes forget it from `marker`; empty where nothing waits. */
const waitWords = (f: Engine, marker: string): string => {
  if (!f.waiting.length) return '';
  const one = f.waiting.length === 1;
  return `${tasksWord(f.waiting.length)} of it ${one ? 'waits' : 'wait'} — ${f.why.join('; ')} — and the daemon's passes forget ${one ? 'it once it settles' : 'them once they settle'}, from ${marker}`;
};

/** The engine's refusals, of tasks by name and of the whole call, and the marker they leave, which only a person removes; empty without. */
const refusalWords = (f: Engine, marker: string): string => {
  if (!f.refused.length && f.refusal === undefined) return '';
  const said = [
    f.refused.length ? `the engine refused to forget ${tasksWord(f.refused.length)} of it: ${f.refusedWhy.join('; ')}` : '',
    f.refusal === undefined ? '' : `the engine refused to forget its tasks: ${f.refusal}`,
  ]
    .filter(Boolean)
    .join('; ');
  return `${said} ${marker} keeps their ids and the daemon asks again each pass; only a person removes it, once nothing of them is wanted: rm ${marker}`;
};

/** What the engine did with the run `id`'s tasks: forgot, left, waits and refused; empty where it keeps none. */
export const engineWords = (f: Engine, id: string): string => {
  const marker = f.marker ?? `the marker of ${id}`;
  const left = f.left.length ? `it left ${f.left.join('; ')}` : '';
  return [forgotWords(f), left, waitWords(f, marker), refusalWords(f, marker)].filter(Boolean).join('; ');
};

/** What became of the run's worktrees: removed, what each held committed first, and those already gone. */
const worktreeWords = ({ worktrees = [], handedOff = [], gone = [] }: RunRemoved): string[] =>
  [
    worktrees.length ? `removed ${worktrees.length} worktree${worktrees.length > 1 ? 's' : ''}` : '',
    ...handedOff.map((h) => `committed what ${h.step} left uncommitted${h.branch ? ` on ${h.branch}` : ''} as ${h.commit.slice(0, 7)}`),
    gone.length ? `${gone.length} worktree${gone.length > 1 ? 's were' : ' was'} already gone` : '',
  ].filter(Boolean);

/** What became of the run's branches: deleted, merged or forced; kept, unasked or not merged; and kept by git or an unanswered place. */
function branchWords({ id, branches = [], base: named }: RunRemoved): string[] {
  const base = named ?? 'its base branch';
  const them = (n: number) => (n > 1 ? 'them' : 'it');
  const deleted = branches.filter((b) => b.deleted);
  const kept = (why: 'default' | 'unmerged') => branches.filter((b) => !b.deleted && b.why === why).map((b) => b.branch);
  const unasked = kept('default');
  const unmerged = kept('unmerged');
  return [
    deleted.length
      ? `deleted ${deleted.map((b) => `${b.branch} (${b.why === 'forced' ? `not merged into ${base}, forced` : `merged into ${base}`})`).join(', ')}`
      : '',
    unasked.length
      ? `kept ${unasked.join(', ')} — branches are kept unless asked: --delete-branches deletes those merged into ${base}`
      : '',
    unmerged.length
      ? `kept ${unmerged.join(', ')}: not merged into ${base} — --force-unmerged deletes ${them(unmerged.length)}, and the work on ${them(unmerged.length)}`
      : '',
    ...branches.map(({ branch, why }) =>
      typeof why !== 'object'
        ? ''
        : 'git' in why
          ? `kept ${branch}: git would not delete it — ${why.git}`
          : `kept ${branch}: the place's remove did not answer — ${why.unread}; nemia rm ${id} again deletes it once it does`,
    ),
  ].filter(Boolean);
}

/** What `nemia rm` did with the run's worktrees, branches and files. */
function storeLine(r: RunRemoved): string {
  const files = r.files?.length ? `removed ${r.files.join(', ')}` : '';
  const unfrozen = r.unfrozen ? `its workflow was never frozen, and ${r.unfrozen}` : '';
  if (r.folder)
    return [`${r.id}  forgotten: a folder run, whose steps worked in its own directory — no worktrees, no branches`, files, unfrozen]
      .filter(Boolean)
      .join('; ');
  const worktrees = worktreeWords(r);
  const branches = branchWords(r);
  return [
    `${r.id}  forgotten: ${worktrees.length ? worktrees.join(', ') : r.isolate === false ? `no worktrees, it worked in ${r.repo ?? ''} itself` : 'no worktrees'}`,
    files,
    branches.length ? branches.join('; ') : r.isolate === false ? 'no branch of its own' : 'no branches left',
    unfrozen,
  ]
    .filter(Boolean)
    .join('; ');
}

/** The one line `nemia rm` prints of a run it forgot: what it did with the run, then what the engine did with its tasks. */
export function forgottenLine(r: RunRemoved): string {
  const engine = r.engine ? engineWords(r.engine, r.id) : '';
  return engine ? `${storeLine(r)}; ${engine}` : storeLine(r);
}
