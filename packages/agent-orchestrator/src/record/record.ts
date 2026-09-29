/**
 * A run's record, as data: its shape (`Run`, a `GitRun` or a `FolderRun`), the facts a person files beside it (`Hold`, `Approval`,
 * `Acceptance`, `Pruned`), the words a step's status is said in (`StepStatus`), a step's own record (`StepRecord`, `Landed`) and the task
 * ids a run files, and the small words every part of the run's judgement shares (`andList`, `fenced`, `oneLine`, `prunedWords`, …).
 * Pure: `record.store.ts` reads and writes the record.
 */
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import { tryOf, type EarlierTry } from '../retry/retry-ask.ts';

/** What the engine says about one step's task. `unknown` is a task we filed and cannot find. */
export type TaskPhase = 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown';

/**
 * What the engine's record of a task says of its closeout: `false`, never asked for one; `true`, asked; `unsigned`, asked, and its
 * last attempt ended without it (`stated: false` on its end, or `reason: 'unsigned'`). `stepStatus` reads it; a caller with only a yes
 * or a no gives that (`closeoutAsked` in views.ts reads all three).
 */
export type CloseoutAsked = boolean | 'unsigned';

/**
 * A run record: a git run (`GitRun`), whose steps work on branches of one repository, or a folder run (`FolderRun`), whose steps work
 * in folders the run makes and which needs no repository. Which is `place`, frozen at start: absent on a git run, as on any record
 * that names no kind, and `{ kind: 'folder' }` on a folder run, an object so that another kind can say which workspace it is.
 */
export type Run = GitRun | FolderRun;

export type GitRun = RunBase & {
  place?: undefined;
  /** The repository the work is about. */
  repo: string;
  /** The commit the workspace started from, so a reviewer can diff against it. */
  baseRef: string;
  /** The repository's branch when the run started. */
  branch: string;
  /** Whether each step gets a worktree of its own. False only for `--no-worktree`. */
  isolate: boolean;
};

/** A run of a team whose every step says `workspace: folder`: no repository, no base, no branch, no worktrees. */
export type FolderRun = RunBase & {
  place: { kind: 'folder' };
  repo?: undefined;
  baseRef?: undefined;
  branch?: undefined;
  isolate?: undefined;
};

/** The kinds of workspace a run's steps work in: `git`, which a record without `place` is, and `folder`. */
export type PlaceKind = 'git' | 'folder';

/** Which kind of workspace a run's steps work in. Pure. */
export const placeOf = (run: Pick<Run, 'place'>): PlaceKind => run.place?.kind ?? 'git';

/** Whether a run is a git run: what reading its repository, base and branches needs. */
export const isGitRun = (run: Run): run is GitRun => placeOf(run) === 'git';

type RunBase = {
  id: string;
  /** Where the run's first step works: its repository's checkout, or a folder run's own folder. Later steps inherit, fork or merge from it. */
  workspace: string;
  /** What the person actually asked for. This travels to EVERY step; it is the spec. */
  brief: string;
  workflowDir: string;
  /**
   * The workflow as it was when the run started, read once by `wf start` and never again.
   *
   * A fence, not a cache. The folder is a path anybody can edit — with `--no-worktree` a step works
   * in the very checkout it lives in — and a `check:` is the command that judges a step: one the step
   * could rewrite would be a step marking its own homework. Every pass reads this. Absent, the folder
   * is read.
   */
  workflow?: Workflow[];
  /**
   * The runs this one waits on (`wf start --after`), frozen at start like the workflow: none of its steps is filed until
   * every one of them has shipped (`runReady`). Absent on a run that waits on none.
   */
  after?: string[];
  /**
   * The files `wf start --input` copied into the run's own `inputs/` directory (`inputsDir` in record.store.ts), by name, in the order given.
   * Named on every step's brief that carries what was asked for (`inputsLine`), and under the run's line in `wf decide`. Absent on a run
   * given none.
   */
  inputs?: string[];
  /**
   * Where the run came from, when it was not typed at `wf start`: `{ inbox: <name> }` for a card started out of the inbox (`startFromInbox` in
   * start.ts), which removes the card once this record is written. `wf inbox` reads it to say a card still there was `started as` this run,
   * and `wf decide` names the card under the run's line. Absent on a run started any other way.
   */
  from?: { inbox: string };
  /**
   * The steps this run is gated at beyond those its workflow gates (`gate: true`), frozen at start: `wf start --gate <step>`, and an inbox
   * card's `gate:`. Each such step's closeout waits for a person — `wf approve` — before anything after it is filed (`hasGate`). Absent on a
   * run given none.
   */
  gates?: string[];
  /**
   * What people approved at a gate (`wf approve`), each in a file of its own beside the retry asks — `runs/<id>.asks/approve-<step>-<try>` —
   * composed on read, as `cancelledAt` is (`readRun` in record.store.ts), and never written into the record: the tick owns the record, a person
   * owns their word. An approval opens a gate for the try it names (`approvalOf`), and one for an earlier try is spent. Absent when there
   * are none.
   */
  approvals?: Approval[];
  /**
   * What people accepted at a loop out of rounds (`wf accept`), each in a file of its own beside the approvals —
   * `runs/<id>.asks/accept-<step>-<try>` — composed on read like them, and never written into the record. An acceptance ends the loop on a
   * person's word where the looping step asked for another round it has no rounds left for: what waits on it is filed as if it had said
   * `again: false`, with its findings still on the record (`acceptanceOf`). One for an earlier try is spent. Absent when there are none.
   */
  acceptances?: Acceptance[];
  /**
   * When the cap on runs in flight (`WF_MAX_RUNS`) first held this run, with nothing of it filed: written once, by the pass that held it. What
   * says the time before its first filing was a wait for a run slot (`timeline`). Absent on a run the cap never held.
   */
  slotHeldAt?: string;
  /**
   * Each result branch's commit, as this run's own tick last saw it once the run had finished (`tipsSeen`): what `wf decide` offers to
   * ship. Kept so that once a person has deleted the branch after the merge, git can still be asked whether that commit is on the base
   * (`isShipped` in branches.ts) — by this run's own `wf decide`, and by a run that waits on it. Absent until the run has finished.
   */
  tips?: Record<string, string>;
  /**
   * When somebody called the run off, if they did.
   *
   * On the run rather than on a step, because that is what it is about: stopping the step in
   * flight is one consequence of it, and "file nothing further" is the other, and no step's task
   * can hold the second one.
   */
  cancelledAt?: string;
  /**
   * When `wf prune` removed the run's worktrees, and which, with what each held on disk — composed on read from a file of its own,
   * `runs/<id>.pruned`, as `cancelledAt` is (`readRun` in record.store.ts), and never written into the record. A pruned run is read as it was,
   * off its record, its branches and its files directory, and nothing more of it is filed: every verb that would work in a worktree refuses
   * it (`prunedRefusal`), and so does every pass (`advance`). Absent on a run nobody pruned.
   */
  pruned?: Pruned;
  /**
   * That a person holds the run until other runs ship (`wf hold <run> --until <run>…`), and since when — composed on read from a file of
   * its own, `runs/<id>.hold`, as `cancelledAt` is, and never written into the record. While it stands the run files nothing new, and no
   * verb offers or takes an approval, a try, a round or an acceptance (`heldRefusal`): what is in flight runs on, and what a step asks
   * stays on its record, to be asked once the hold lifts. The tick lifts it once every run it names has shipped, as `--after` reads
   * shipped (`removeHold`); `wf hold <run> --off` lifts it by hand. Absent on a run nobody holds.
   */
  hold?: Hold;
  /**
   * Per step: the task the engine ran, and the workspace and branch it ran in.
   *
   * `taskId` is the step's OWN task, always — `apps/api` reads it. The run's check of the step's work
   * is a task of its own, under `check`, filed once the step has signed off and been handed off.
   *
   * Both are the CURRENT try's. A step tried again (`retries:`, `wf retry`) keeps the tries it replaced
   * beside them, under `tries`, in order — so everything that reads `taskId` and `check` reads the try
   * that decides the step.
   */
  steps: Record<string, StepRecord>;
  createdAt: string;
};

/** A person's hold on a run, as its file says it: when it was put, and the runs it waits on to ship, in the order they were named. */
export type Hold = { at: string; until: string[] };

/**
 * What `wf prune` removed of a run, as its file says it: when, and each worktree with the bytes it held (`du`), which are what it freed —
 * and, once `wf prune --artifacts` removed its files directory (`runs/<id>/artifacts/`), when that was and what it freed. `at` is when
 * its worktrees went; a prune of the files alone, of a run whose worktrees were already gone or never cut, says its own time there too.
 */
export type Pruned = { at: string; worktrees: Array<{ path: string; bytes: number }>; artifacts?: PrunedFiles };

/** When `wf prune --artifacts` removed a run's files directory, and the bytes that freed. */
export type PrunedFiles = { at: string; bytes: number };

/**
 * A person's word at a gate, as its file says it (`wf approve`): the step, the try it approves, when, and what they said with it — the
 * words every step after the gate is handed under `## Approved` (`approvedSection`). `message` is absent on an approval given without any.
 */
export type Approval = { step: string; try: number; at: string; message?: string };

/**
 * A person's word at a loop out of rounds, as its file says it (`wf accept`): the looping step, the try it accepts, when, and what they said
 * — the words every step after the loop is handed under `## Accepted`, beside the findings the loop left open (`acceptedSection`).
 *
 * `message` is required, where an approval's is not: an approval says yes to work a step handed on, and an acceptance says yes to work a
 * reviewer has just said is not done. What makes that a decision rather than a shrug is the reason, and it is the one thing the shipper and
 * whoever reads the merge have.
 */
export type Acceptance = { step: string; try: number; at: string; message: string };

/**
 * Where one step stands. ONE vocabulary, shared by `assess`, `listing` and `decision`, so the DAG,
 * `wf ls` and `wf decide` cannot disagree about a step.
 *
 *   waiting          not filed
 *   running          filed, and not settled — or a task the engine cannot find
 *   blocked          it signed off `blocked`: it finished its session, not the work
 *   unsigned         it ended without the closeout it was asked for, or without a field its `output:` declares
 *   checking         signed off, and its `check:` is due or running
 *   verified         its check exited 0
 *   unverified       signed off, and it declared no `check:` — nothing but its own word says it worked
 *   awaiting approval verified or unverified, at a gate (`hasGate`), with no approval of the try it is on: nothing after it is filed until
 *                    a person says so — `wf approve`, or `wf retry --message` to send it back. And, on an ending step in the repository's
 *                    checkout (`approvedFirst`), the same word before it is filed: its approval is what runs it (`waitsAtGate`)
 *   exhausted        verified or unverified, and it asked for another round of its `loop:` on the last one `rounds:` allows
 *   over budget      its tries have together cost its `budget:` or more, so nothing is left to spend, and the way on is another session
 *                    of it — its last try ended without letting what waits on it run (a check that did not finish is not that: it
 *                    runs again for nothing), or its loop asks for a round that would file it again — or, on a looping step that asked
 *                    for one, a step of its loop is. Never a step of a loop whose round is due: `wf round --budget` raised the cap (`roundSpans`)
 *   budget exhausted its harness ended its session at the step's `budget:` (a `claude -p` job: the runtime's `limit: 'budget'` on the attempt)
 *   denied           it signed off, and its harness denied its try a call, on a step that says `denials: fail`: nothing after it is filed and
 *                    no check is run on work done without the tool; `retries:` never files a try of it, since the try would run under the
 *                    same frozen `allowedTools:` — a person does, `wf retry`
 *   failed (check)   its check did not exit 0
 *   failed, stopped  the engine's own words for the step's task
 *
 * Only `verified` and `unverified` let a follower be filed. The engine's `succeeded` means the session
 * ended, never that the work is done.
 */
export type StepStatus =
  | 'waiting'
  | 'running'
  | 'blocked'
  | 'unsigned'
  | 'checking'
  | 'verified'
  | 'unverified'
  | 'awaiting approval'
  | 'exhausted'
  | 'over budget'
  | 'budget exhausted'
  | 'denied'
  | 'failed (check)'
  | 'failed'
  | 'stopped';

/** What a follower may be filed on. */
export const satisfiesAfter = (s: StepStatus): boolean => s === 'verified' || s === 'unverified';

/** Final without satisfying `after`: nothing waiting on a step in one of these can ever run. */
export const stopsFollowers = (s: StepStatus): boolean =>
  s === 'blocked' ||
  s === 'unsigned' ||
  s === 'awaiting approval' ||
  s === 'exhausted' ||
  s === 'over budget' ||
  s === 'budget exhausted' ||
  s === 'denied' ||
  s === 'failed (check)' ||
  s === 'failed' ||
  s === 'stopped';

/** The first line of a step's prose, trimmed: what a folder says its ending step would do, on `wf ls` and `wf decide`. Pure. */
export const firstLine = (body: string): string =>
  body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) ?? '';

/** The statuses a try takes a step on from (`retryable`): a step over its budget in one waits for a person to raise the cap. */
export const TRIED_FROM: ReadonlySet<StepStatus> = new Set(['unsigned', 'failed (check)', 'failed', 'stopped', 'blocked', 'denied']);
export const SETTLED: ReadonlySet<TaskPhase> = new Set(['succeeded', 'failed', 'stopped']);

/**
 * The id of a step's check task. Derived, never generated: a pass that files the check and dies
 * before writing the run down finds it under this id on the next pass, and adopts it rather than
 * filing a second — the engine's own rule for a session, one layer up.
 *
 * The current try's, unless another is named: `<run>-<step>-check` on the first try, and
 * `<run>-<step>-try<n>-check` on the n-th.
 */
export const checkTaskId = (run: Run, step: string, n = tryOf(run, step)): string =>
  n <= 1 ? `${run.id}-${step}-check` : `${run.id}-${step}-try${n}-check`;

/** The id of a step's own task on its n-th try: `<run>-<step>`, then `<run>-<step>-try<n>`. Derived, for the reason a check's is. */
export const stepTaskId = (run: Pick<Run, 'id'>, step: string, n = 1): string =>
  n <= 1 ? `${run.id}-${step}` : `${run.id}-${step}-try${n}`;

/**
 * The names on a run's record in the order its steps run — `steps` as `stepsOf` gives them (`orderSteps`) — then any the record has that
 * the workflow does not, in the record's order. Pure. What `wf decide` prints each step in: a record may be keyed in the folder's order,
 * and read by its keys a `plan → implement ⇄ review` run would print implement first.
 */
export const namesInOrder = (run: Pick<Run, 'steps'>, steps: readonly Pick<Workflow, 'name'>[]): string[] => [
  ...steps.map((s) => s.name).filter((name) => Object.hasOwn(run.steps, name)),
  ...Object.keys(run.steps).filter((name) => !steps.some((s) => s.name === name)),
];

/** One step on the run's record: its current try's task and check, where it works, and the tries before (`Run.steps`). */
export type StepRecord = {
  taskId: string | null;
  workspace?: string;
  branch?: string;
  check?: { taskId: string };
  tries?: EarlierTry[];
  /** The task whose leftovers the run has committed (`handOffDue`): once for each try, so what a person leaves in the workspace after is theirs. */
  handedOff?: string;
  /** What the run did with the merge an ending that lands on its check staged (`landingDue`): the commit it made, or why it made none. Once for each try. */
  landed?: Landed;
};

/**
 * What the run did with an ending's staged merge (`landingDue`): committed it onto the base branch, or not — aborted, or found nothing to
 * commit — and why; or, for an ending that stopped on its own word with nothing staged, nothing at all (`untouched`), written down so that
 * what a person stages in the checkout after it is theirs.
 */
export type Landed = { commit: string } | { aborted: string } | { untouched: string };

/**
 * Whether a check that did not pass REFUSED the work, rather than not finishing.
 *
 * Refused: it ran to its end and exited non-zero — settled `failed`, with an exit code. Did not finish:
 * `stopped` — killed, or never started — or `failed` without an exit code, which is a check stopped at its
 * deadline or lost. That is no verdict on the work: `retries:` spends no try on it, and `wf decide` offers
 * `wf retry --recheck`.
 *
 * Only a number is a refusal. A verdict nobody read (`undefined`) is no evidence of one, and is read as `listing`
 * words it: `unfinished`. Read the other way, a caller that passed none would call a check stopped at its
 * deadline refused, and a run the tick left waiting on a person would read running, with a try due that the
 * tick never files.
 */
export const refusedCheck = (phase: TaskPhase, verdict: Verdict | undefined): boolean => phase === 'failed' && typeof verdict === 'number';

/** `a` and `b`, or `a, b and c`. */
export const andList = (items: readonly string[]): string =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '');

/**
 * A pruned run in words, as `wf decide` says it under the run's line and where a decision would otherwise wait on a person's verb: when it was
 * pruned — or that its marker no longer says — and what was removed. Pure.
 */
export const prunedWords = (pruned: Pruned): string => {
  const files = pruned.artifacts ? filesPrunedWords(pruned.artifacts) : '';
  if (pruned.artifacts && !pruned.worktrees.length)
    return `pruned at ${pruned.artifacts.at || 'a time its marker no longer says'} — ${files}`;
  return `pruned at ${pruned.at || 'a time its marker no longer says'} — its worktrees were removed (wf prune)${files ? `, and ${files}` : ''}`;
};

/**
 * That `wf prune --artifacts` removed a run's files, and when, as every surface that reads a pruned run says it: `wf decide`, a refusal,
 * and the api's answer for a file that was there. Pure.
 */
export const filesPrunedWords = (files: PrunedFiles): string =>
  `its files were removed at ${files.at || 'a time its marker no longer says'} (wf prune --artifacts)`;

/**
 * Free text from outside — a harness's word, a closeout's `needs` — made one line of at most `cap` characters: every run of whitespace, a
 * newline included, becomes one space, and what is over the cap is clipped with `…`. Pure. What `waitingWords` does to a harness's word, for
 * every screen that prints such text into a line of its own.
 */
export function oneLine(text: string, cap: number): string {
  const line = text.trim().replace(/\s+/g, ' ');
  return line.length <= cap ? line : `${line.slice(0, cap - 1).trimEnd()}…`;
}

/** The most denied calls a line names before it counts the rest: `denied: A, B, C, D, E and 3 more`. */
export const DENIED_SHOWN = 5;

/** The longest one denied call a line prints: a file tool's is its path, which can be long, and a command's first word is free text. */
export const DENIED_CAP = 60;

/** Text in a fence longer than any run of backticks inside it, so what it quotes cannot close the fence, nor open a section of the brief's. */
export function fenced(text: string, info = ''): string[] {
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((ticks) => ticks.length + 1)));
  return [`${fence}${info}`, text, fence];
}

/** JSON in a fence longer than any run of backticks inside it (`fenced`). */
export function dataBlock(value: unknown): string[] {
  return fenced(JSON.stringify(value, null, 2), 'json');
}
