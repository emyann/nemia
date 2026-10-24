/**
 * What the board works out from a run's decision, without React: when to ask for it, the Factory card's line, a group's
 * bar, and what a line of a diff is. Pure. The words themselves are the api's, which are the CLI `decide`'s.
 */
import type { Decidable, DecideCommand, Group, RunDecision, RunSummary, Touched } from './api';
import { stepState } from './status.ts';

/**
 * Whether a run has something to decide, as its page and the list read it: `assess` says it finished, or a step waits
 * on a person — and nobody called it off. The api has the last word (`isDecidable`); this only says when to ask.
 */
export const decidableRun = (run: Pick<RunSummary, 'status' | 'cancelledAt' | 'waitingOnYou'>): boolean =>
  run.cancelledAt === null && run.status !== 'cancelled' && (run.status !== 'running' || run.waitingOnYou.length > 0);

/** Whether the api's answer is a decision to show, rather than `running` or `nothing`. */
export const isDecidable = (decision: RunDecision | undefined): decision is Decidable => Boolean(decision && 'touched' in decision);

/**
 * The run's state for the decision's cache: where the run stands, who it waits on, what a hold on it says, and each step's task and
 * settled word. A decision is read again only when one of those moves: a hold written, lifted, or whose runs have landed.
 * A run without `holding` is stamped as one nobody holds. A step's word is read as on a run nobody holds, so a gate in flight or not
 * is one stamp either way: the hold is stamped on its own.
 *
 * A filed step still in flight is one word, whatever the engine calls it: `working`, `quiescent`,
 * `starting`, `between-attempts`, `needs-human` and `pending` flip between polls while nothing the decision says has moved,
 * and each flip would ask the api — an observation per task, and `git diff` — again. A step that signs off, a check that
 * settles, a try filed (a new task) all move it.
 */
export const decisionStamp = (
  run: Pick<RunSummary, 'status' | 'cancelledAt' | 'waitingOnYou'> & { holding?: RunSummary['holding'] } & {
    steps: ReadonlyArray<Pick<RunSummary['steps'][number], 'name' | 'taskId' | 'phase' | 'reason' | 'on' | 'via' | 'message'>>;
  },
): string =>
  JSON.stringify([
    run.status,
    run.waitingOnYou,
    run.holding?.word ?? null,
    run.steps.map((s) => {
      const state = stepState(s, run.cancelledAt !== null, false);
      const inFlight = s.taskId !== null && (state === 'working' || state === 'needs-human' || state === 'waiting');
      return [s.name, s.taskId, inFlight ? 'in flight' : s.message];
    }),
  ]);

/**
 * The Factory card's line for a run waiting on you: `touched 2 packages · +979 −12`. Every group the branches it reads touched, counted
 * once; the lines of every file, each file counted once; and how many branches' changes are not known, never counted as none.
 *
 * Once per file, not once per branch: each branch is diffed against the run's base, and a follower in a worktree of its own starts from its
 * parent's branch, so a fan-out's result branches each carry the parent's changes, which a sum would count once per branch. A file on
 * several branches counts the change with the most lines among them — the parent's plus a follower's own on top of it. Two siblings that
 * each changed one file apart count the larger alone: the card is a line for triage, and the CLI's `decide`, which prints each branch on
 * its own, is where the whole of it is. A binary file adds no lines.
 */
export function touchedSummary(touched: readonly Touched[]): string {
  const read = touched.flatMap((t) => ('error' in t.radius ? [] : [t.radius]));
  const unread = touched.length - read.length;
  if (!touched.length) return 'touched nothing — no branch to read';
  if (!read.length) return `touched not known — what ${unread === 1 ? 'its branch' : `its ${unread} branches`} changed was not said`;
  const groups = new Set(read.flatMap((r) => r.groups.map((g) => g.name))).size;
  const files = new Map<string, { added: number; removed: number }>();
  for (const c of read.flatMap((r) => r.changes)) {
    const lines = { added: c.added ?? 0, removed: c.removed ?? 0 };
    const seen = files.get(c.path);
    if (!seen || lines.added + lines.removed > seen.added + seen.removed) files.set(c.path, lines);
  }
  let added = 0;
  let removed = 0;
  for (const lines of files.values()) {
    added += lines.added;
    removed += lines.removed;
  }
  return `touched ${groups} package${groups === 1 ? '' : 's'} · +${added} −${removed}${unread ? ` · ${unread} not known` : ''}`;
}

/**
 * A group's +/− bar, as a percentage of the track each part fills: the group with the most lines changed on the branch
 * fills it, and the others in proportion. A group of binary files only has no lines, and no bar.
 */
export function barOf(group: Pick<Group, 'added' | 'removed'>, most: number): { added: number; removed: number } {
  if (most <= 0) return { added: 0, removed: 0 };
  const pct = (n: number) => Math.round((n / most) * 10_000) / 100;
  return { added: pct(group.added), removed: pct(group.removed) };
}

/** The most lines any of these groups changed: what `barOf` measures a bar against. */
export const mostLines = (groups: readonly Group[]): number => Math.max(0, ...groups.map((g) => g.added + g.removed));

export type DiffLine = 'meta' | 'hunk' | 'added' | 'removed' | 'context';

/**
 * What a line of a unified diff is, for its colour: a file's header lines (`+++`, `---`, and every line no other kind claims, such as
 * `diff --git`, `index`, `new file mode`, `rename from`, `similarity index`, `Binary files … differ`), a hunk's header, an added line, a
 * removed one, or context.
 */
export function diffLine(line: string): DiffLine {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'meta';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  if (line.startsWith(' ') || line === '' || line.startsWith('\\')) return 'context';
  return 'meta';
}

/** A file's lines in the diff, off the branch's radius — both ends of a rename — when git counted it. */
export function changeOf(touched: Touched | undefined, file: string): { added: number | null; removed: number | null } | undefined {
  if (!touched || 'error' in touched.radius) return undefined;
  return touched.radius.changes.find((c) => c.path === file || (c.from && `${c.from} → ${c.path}` === file));
}

