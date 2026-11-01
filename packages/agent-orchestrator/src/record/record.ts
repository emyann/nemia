/**
 * A run's record, as data: its shape (`Run`, a `RepositoryRun` or a `FolderRun`), the facts a person files beside it (`Hold`, `Approval`,
 * `Acceptance`, `Pruned`), the words a step's status is said in (`StepStatus`), a step's own record (`StepRecord`, `LandingRecord`), the
 * try it is on (`tryOf`) and the task ids a run files (`runTasks`), and the small words every part of the run's judgement shares
 * (`andList`, `fenced`, `oneLine`, `prunedWords`, …); and the store's interface a run is read and written through (`RunStore`).
 * Pure: `record.store.ts` reads and writes the record.
 */
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import type { EarlierTry, RetryAsk } from '../retry/index.ts';
import type { MergeOf, RoundAsk } from '../status/status.ts';
import type { Pause } from '../pause/pause.ts';
import type { Pin } from '../revisions/revisions.ts';

/**
 * A folder a step may reach beyond its workspace, as the runtime takes it (`config.mounts`): an absolute path, and whether the step may
 * only read it.
 */
export type Mount = { path: string; readOnly: boolean };

/** What the engine says about one step's task. `unknown` is a task we filed and cannot find. */
export type TaskPhase = 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown';

/**
 * What the engine's record of a task says of its closeout: `false`, never asked for one; `true`, asked; `unsigned`, asked, and its
 * last attempt ended without it (`closedOut: false` on its end, or `former: 'unsigned'`). `stepStatus` reads it; a caller with only a yes
 * or a no gives that (`closeoutAsked` in views.verb.ts reads all three).
 */
export type CloseoutAsked = boolean | 'unsigned';

/**
 * A run record: a repository run (`RepositoryRun`), whose steps work on branches of one repository, or a folder run (`FolderRun`), whose
 * steps work in folders the run makes and which needs no repository. Which is `place`, frozen at start: absent on a repository run, as
 * on any record that names no kind, and `{ kind: 'folder' }` on a folder run, an object so that another kind can say which workspace it is.
 */
export type Run = RepositoryRun | FolderRun;

export type RepositoryRun = RunBase & {
  place?: undefined;
  /** The repository the work is about. */
  repo: string;
  /** The commit the workspace started from, so a reviewer can diff against it. */
  baseRef: string;
  /** The repository's branch when the run started. */
  branch: string;
  /** Whether each step gets a worktree of its own. False only for `--no-worktree`. */
  isolate: boolean;
  /**
   * The place skill a run named when a record said which place its verbs ran from, by name and digest. Read and kept, never written: a
   * run asks the place its program is given.
   */
  placeSkill?: { skill: string; version: string };
  /**
   * The file whose presence says a merge is staged in the repository's checkout, as the place's `open` named it at `nemia start`, read
   * with a `stat` (`stagedHere`). Absent for a run started before the place named one, whose checkout is read through `status`.
   */
  stagedFile?: string;
};

/** A run of a team whose every step says `place: folder`: no repository, no base, no branch, no worktrees. */
export type FolderRun = RunBase & {
  place: { kind: 'folder' };
  repo?: undefined;
  baseRef?: undefined;
  branch?: undefined;
  isolate?: undefined;
  placeSkill?: undefined;
  stagedFile?: undefined;
};

/**
 * The kinds of place a run's steps work in, as a step's `place:` says them: `git`, which a record without `place` is, and `folder`. Held
 * here, in a pure file the package's entries reach, and decoded by the place's model (`PlaceKind`, place/place.model.ts), which a pure
 * file may not import (test/boundary.test.ts).
 */
export const PLACE_KINDS = ['git', 'folder'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Which kind of workspace a run's steps work in. Pure. */
export const placeOf = (run: Pick<Run, 'place'>): PlaceKind => run.place?.kind ?? 'git';

/** Whether a run is a repository run: what reading its repository, base and branches needs. */
export const isRepositoryRun = (run: Run): run is RepositoryRun => placeOf(run) === 'git';

type RunBase = {
  id: string;
  /**
   * Where the run's first step works: its repository's checkout, or a folder run's own folder. Later steps inherit, fork or merge from it.
   */
  workspace: string;
  /** What the person actually asked for. This travels to EVERY step; it is the spec. */
  brief: string;
  workflowDir: string;
  /**
   * The workflow as it was when the run started, read once by `nemia start` and never again.
   *
   * A fence, not a cache. The folder is a path anybody can edit — with `--no-worktree` a step works
   * in the very checkout it lives in — and a `check:` is the command that judges a step: one the step
   * could rewrite would be a step marking its own homework. Every pass reads this. Absent, the folder
   * is read.
   */
  workflow?: Workflow[];
  /**
   * The runs this one waits on (`nemia start --after`), frozen at start like the workflow: none of its steps is filed until
   * every one of them has landed (`runReady`). Absent on a run that waits on none.
   */
  after?: string[];
  /**
   * The runs this one is handed as context (`nemia start --from`, a card's `from:`), frozen at start: what each concluded is read once, on
   * the pass that files the roots, and none is ever waited on. Absent on a run handed none.
   */
  context?: string[];
  /**
   * The files `nemia start --input` copied into the run's own `inputs/` directory (`inputsDir` in record.store.ts), by name, in the order
   * given. Named on every step's brief that carries what was asked for (`inputsLine`), and under the run's line in `nemia decide`. Absent
   * on a run given none.
   */
  inputs?: string[];
  /**
   * Where the run came from, when it was not typed at `nemia start`: `{ inbox: <name> }` for a card started out of the inbox
   * (`startFromInbox` in inbox.verb.ts), which keeps the card. The inbox's listing reads it to give the card its state, `started` while
   * this record stands, and `nemia inbox` to say it was `started as` this run, and `nemia decide` names the card under the run's line.
   * Absent on a run started any other way.
   */
  from?: { inbox: string };
  /**
   * The schedule that started the run, when the tick did (`startDue` in schedule.verb.ts): the factory, the workflow, and the fire it was
   * started for (`due`). The schedule's last run is read off it. Absent on a run started any other way.
   */
  scheduled?: { factory: string; workflow: string; due: string };
  /**
   * The steps this run is gated at beyond those its workflow gates (`gate: true`), frozen at start: `nemia start --gate <step>`, and an
   * inbox card's `gate:`. Each such step's closeout waits for a person — `nemia approve` — before anything after it is filed (`hasGate`).
   * Absent on a run given none.
   */
  gates?: string[];
  /**
   * The factory the run was started in (`nemia start --factory`), frozen at start: its hires filled the steps, and a repository run's
   * `repo` is one of its repositories. Absent on a run in the default factory, which is every record written before a run named its
   * factory.
   */
  factory?: string;
  /**
   * The folders beyond its workspace each local step may read, frozen at start from the factory (`factoryMounts`): its repositories but
   * the run's own, each read-only, left out when it was no directory at start. Filed with every local step (`filedConfig`), named on its
   * brief (`mountsLine`), so a later change to the factory changes no run started. Absent: none.
   */
  mounts?: Mount[];
  /**
   * What people approved at a gate (`nemia approve`), each in a file of its own beside the retry asks —
   * `runs/<id>.asks/approve-<step>-<try>` — composed on read, as `cancelledAt` is (`readRun` in record.store.ts), and never written into
   * the record: the tick owns the record, a person owns their word. An approval opens a gate for the try it names (`approvalOf`), and one
   * for an earlier try is spent. Absent when there are none.
   */
  approvals?: Approval[];
  /**
   * What people accepted at a loop out of rounds (`nemia approve`), each in a file of its own beside the approvals —
   * `runs/<id>.asks/accept-<step>-<try>` — composed on read like them, and never written into the record. An acceptance ends the loop on a
   * person's word where the looping step asked for another round it has no rounds left for: what waits on it is filed as if it had said
   * `again: false`, with its findings still on the record (`acceptanceOf`). One for an earlier try is spent. Absent when there are none.
   */
  acceptances?: Acceptance[];
  /**
   * When the cap on runs in flight (`WF_MAX_RUNS`) first held this run, with nothing of it filed: written once, by the pass that held it.
   * What says the time before its first filing was a wait for a run slot (`timeline`). Absent on a run the cap never held.
   */
  slotHeldAt?: string;
  /**
   * The approvals whose gate wait the tick has put into the metrics (`gateWaits`), by step and try: each written by the pass that read the
   * approval first, so a pass after a restart, which reads the same approval, emits none again. `[]` on a run started with it; absent on a
   * record written before it, whose gates are never timed. A gate approved on a try that answered an earlier try's session is timed only
   * while `runTimed` is `false`.
   */
  gatesTimed?: Array<{ step: string; try: number }>;
  /**
   * The sessions whose denied calls the tick has handed the metrics (`deniedCalls`), by task: how many of its attempts, from the first, are
   * counted. Written by the pass that counts them, so a pass after a restart, which reads the same attempts, counts none again. `[]` on a
   * run started with it; absent on a record written before it, whose denied calls are never counted.
   */
  deniedCounted?: Array<{ task: string; attempts: number }>;
  /**
   * The tasks whose settle the tick has handed the metrics (`settlesDue`), a session's and a check's alike: each written by the pass that
   * first reads it settled, so a pass after a restart, which reads the same task settled, counts none again, and a task that settled
   * while no daemon read is counted by the first that does. `[]` on a run started with it; absent on a record written before it, whose
   * settles are never counted.
   */
  settlesCounted?: string[];
  /**
   * Whether the tick has handed the run's timeline to the metrics (`timelineFacts`): `false` on a run started with it, `true` once the
   * pass that read the run over, with nothing of it in flight, has written it, so a pass after a restart hands none again. Absent on a
   * record written before it, whose timeline is never handed over.
   */
  runTimed?: boolean;
  /**
   * Each result branch's commit, as this run's own tick last saw it once the run had finished (`tipsSeen`): what `nemia decide` offers to
   * land. Kept so that once a person has deleted the branch after the merge, git can still be asked whether that commit is on the base
   * (the place's `standing`, `standingNow`) — by this run's own `nemia decide`, and by a run that waits on it. Absent until the run has
   * finished.
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
   * When `nemia prune` removed the run's worktrees, and which, with what each held on disk — composed on read from a file of its own,
   * `runs/<id>.pruned`, as `cancelledAt` is (`readRun` in record.store.ts), and never written into the record. A pruned run is read as it
   * was, off its record, its branches and its files directory, and nothing more of it is filed: every verb that would work in a worktree
   * refuses it (`prunedRefusal`), and so does every pass (`advance`). Absent on a run nobody pruned.
   */
  pruned?: Pruned;
  /**
   * That a person holds the run until other runs land (`nemia hold <run> --until <run>…`), and since when — composed on read from a file of
   * its own, `runs/<id>.hold`, as `cancelledAt` is, and never written into the record. While it stands the run files nothing new, and no
   * verb offers or takes an approval, a try, a round or an acceptance (`heldRefusal`): what is in flight runs on, and what a step asks
   * stays on its record, to be asked once the hold lifts. The tick lifts it once every run it names has landed, as `--after` reads
   * landed (`removeHold`); `nemia hold <run> --off` lifts it by hand. Absent on a run nobody holds.
   */
  hold?: Hold;
  /**
   * What this run resolved of each kind it reads — its workflow folder, each step's agent, each skill and its factory's rules — with the
   * revision of each (`Pin`): written by the pass that resolves them, which is every pass while the run has filed nothing, and again by
   * the pass that takes a person's refresh. Never re-read from the folder for a run that has filed: `stepsOf` reads the frozen workflow,
   * and these say which revision that copy is. Absent on a record written before revisions, which pinned nothing.
   */
  pinned?: readonly Pin[];
  /**
   * That a person paused the whole store (`nemia pause`), by whom and why — composed on read onto every run from the store's one file,
   * `$WF_ROOT/cordon`, and never written into a record. While it stands the run files nothing new, no step, try, round or check, and
   * what a person writes meanwhile waits on its own files for the lift (`assess`); what is in flight runs on. Absent while the store is not
   * paused.
   */
  pause?: Pause;
  /**
   * Per step: the task the engine ran, and the workspace and branch it ran in.
   *
   * `taskId` is the step's OWN task, always — `apps/api` reads it. The run's check of the step's work
   * is a task of its own, under `check`, filed once the step has signed off and been handed off.
   *
   * Both are the CURRENT try's. A step tried again (`retries:`, `nemia retry`) keeps the tries it replaced
   * beside them, under `tries`, in order — so everything that reads `taskId` and `check` reads the try
   * that decides the step.
   */
  steps: Record<string, StepRecord>;
  createdAt: string;
};

/**
 * A person's hold on a run, as its file says it: when it was put, the runs it waits on to land, in the order they were named, the
 * person's words for why (`why`, absent when none were given) and who put it (`by`, absent on a file older code wrote), each one line.
 */
export type Hold = { at: string; until: string[]; why?: string; by?: string };

/** The longest a hold's why is kept and shown (`nemia hold --why`): what is over it is clipped with `…` (`oneLine`). */
export const WHY_CAP = 200;

/** The longest a hold's name for who put it is kept and shown (`nemia hold --by`). */
export const BY_CAP = 64;

/**
 * What `nemia prune` removed of a run, as its file says it: when, and each worktree with the bytes it held (`du`), which are what it freed
 * — and, once `nemia prune --artifacts` removed its files directory (`runs/<id>/artifacts/`), when that was and what it freed. `at` is when
 * its worktrees went; a prune of the files alone, of a run whose worktrees were already gone or never cut, says its own time there too.
 */
export type Pruned = { at: string; worktrees: Array<{ path: string; bytes: number }>; artifacts?: PrunedFiles };

/** When `nemia prune --artifacts` removed a run's files directory, and the bytes that freed. */
export type PrunedFiles = { at: string; bytes: number };

/**
 * A person's word at a gate, as its file says it (`nemia approve`): the step, the try it approves, when, and what they said with it — the
 * words every step after the gate is handed under `## Approved` (`approvedSection`). `message` is absent on an approval given without any.
 */
export type Approval = { step: string; try: number; at: string; message?: string };

/**
 * A person's word at a loop out of rounds, as its file says it (`nemia approve`): the looping step, the try it accepts, when, and what they
 * said — the words every step after the loop is handed under `## Accepted`, beside the findings the loop left open (`acceptedSection`).
 *
 * `message` is required, where an approval's is not: an approval says yes to work a step handed on, and an acceptance says yes to work a
 * reviewer has just said is not done. What makes that a decision rather than a shrug is the reason, and it is the one thing the shipper and
 * whoever reads the merge have.
 */
export type Acceptance = { step: string; try: number; at: string; message: string };

/**
 * Where one step stands. ONE vocabulary, shared by `assess`, `listing` and `decision`, so the DAG,
 * `nemia ls` and `nemia decide` cannot disagree about a step.
 *
 *   pending          not filed
 *   running          filed, and not settled — or a task the engine cannot find
 *   blocked          it signed off `blocked`: it finished its session, not the work
 *   unsigned         it ended without the closeout it was asked for, or without a field its `output:` declares, or its closeout
 *                    named a file the run did not have (`StepRecord.filesRead`)
 *   checking         signed off, and its `check:` is due or running
 *   verified         its check exited 0
 *   unverified       signed off, and it declared no `check:` — nothing but its own word says it worked
 *   awaiting approval verified or unverified, at a gate (`hasGate`), with no approval of the try it is on: nothing after it is filed until
 *                    a person says so — `nemia approve`, or `nemia retry --message` to send it back. And, on an ending step in the
 *                    repository's checkout (`approvedFirst`), the same word before it is filed: its approval is what runs it
 *                    (`waitsAtGate`)
 *   exhausted        verified or unverified, and it asked for another round of its `loop:` on the last one `rounds:` allows
 *   over budget      its tries have together cost its `budget:` or more, so nothing is left to spend, and the way on is another session
 *                    of it — its last try ended without letting what waits on it run (a check that did not finish is not that: it
 *                    runs again for nothing), or its loop asks for a round that would file it again — or, on a looping step that asked
 *                    for one, a step of its loop is. Never a step of a loop whose round is due: `nemia retry --round --budget` raised the
 *                    cap (`roundSpans`)
 *   budget exhausted its harness ended its session at the step's `budget:` (a `claude` job: the runtime's `limit: 'budget'` on the
 *                    attempt)
 *   denied           it signed off, and its harness denied its try a call, on a step that says `denials: fail`: nothing after it is
 *                    filed and no check is run on work done without the tool; `retries:` never files a try of it, since the try would run
 *                    under the same frozen `allowedTools:` — a person does, `nemia retry`
 *   failed (check)   its check did not exit 0
 *   failed, stopped  the engine's own words for the step's task
 *
 * Only `verified` and `unverified` let a follower be filed. The engine's `succeeded` means the session
 * ended, never that the work is done.
 */
export type StepStatus =
  | 'pending'
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

/** A step in one of these stops what waits on it: for good where it broke, or until a person answers — a gate approved, a question met. */
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

/** The first line of some prose that is not blank, trimmed; empty where there is none. Pure. */
export const firstLine = (body: string): string =>
  body
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean) ?? '';

/** The statuses a try takes a step on from (`retryable`): a step over its budget in one waits for a person to raise the cap. */
export const TRIED_FROM: ReadonlySet<StepStatus> = new Set(['unsigned', 'failed (check)', 'failed', 'stopped', 'blocked', 'denied']);
export const SETTLED: ReadonlySet<TaskPhase> = new Set(['succeeded', 'failed', 'stopped']);

/** The try a step is on: the first, and one more for each try its record keeps behind it. */
export const tryOf = (run: Run, step: string): number => (run.steps[step]?.tries?.length ?? 0) + 1;

/**
 * The try the task a step is on was first filed for, from 1: the try it is on, unless a later try kept the same task — a recheck, which
 * replaces the check alone, or one answered into the session the task holds open — in which case the try that filed it. What a fact read
 * off the task's own journal belongs to, since the journal does not move when the try does. Pure.
 */
export const taskTryOf = (run: Run, step: string): number => {
  const record = run.steps[step];
  const tries = record?.tries ?? [];
  const first = tries.findIndex((t) => t.taskId === record?.taskId);
  return first === -1 ? tries.length + 1 : first + 1;
};

/**
 * The try the current turn of a step's task was given, from 1: the try it is on, less each recheck behind it, since a recheck replaces the
 * check alone and the session's turn — and the closeout it gave — stays the try's before it. A try answered into the session the task
 * holds open is a turn of its own, and its own try. What a closeout read off the task's current turn belongs to (`closeoutsOf`). Pure.
 */
export const turnTryOf = (run: Run, step: string): number => {
  const tries = run.steps[step]?.tries ?? [];
  let at = tries.length + 1;
  while (at > 1 && tries[at - 2]?.cause === 'recheck') at--;
  return at;
};

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
 * the workflow does not, in the record's order. Pure. What `nemia decide` prints each step in: a record may be keyed in the folder's order,
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
  /**
   * The task whose leftovers the run has committed (`handOffDue`): once for each try, so what a person leaves in the workspace after is
   * theirs.
   */
  handedOff?: string;
  /**
   * What the run did with the merge an ending that lands on its check staged (`landingDue`): the commit it made, or why it made none. Once
   * for each try.
   */
  landed?: LandingRecord;
  /**
   * What the run read of the files the closeout of a task of the step named (`FilesRead`): written by the tick on the pass that first
   * read the task signed (`filesDue`), whether or not a file lacked, so the files of a task are read once. The step whose current task
   * named a file the run did not have reads `unsigned` (`lackedOf`): a closeout the run does not accept. Gone with the try, as
   * `handedOff` is, and kept by a recheck, which is the same task.
   */
  filesRead?: FilesRead;
  /**
   * The agent and skill revisions the step's current try was filed on (`stepPins`): what a step that has landed says it ran on, which the
   * board reads beside the run's own pins once a refresh has moved those past it. Written at each filing, so a try filed again says the
   * revisions that try took. Absent on a step nothing has filed, and on a record written before revisions.
   */
  pinned?: readonly Pin[];
  /**
   * The digest of the closeout schema the step's current try was filed with (`closeoutHashOf`): read when a later filing would continue
   * that session, and the session started fresh instead where the schema has moved — a continued session is asked for its closeout in the
   * schema it was given, and one asked in another would pay for the whole conversation again for an answer in the wrong shape. Absent on a
   * record written before it, which resumes as it always did.
   */
  closeoutHash?: string;
};

/**
 * A file a closeout named that the run did not have when the step signed off, and why, in a word of a declared file that is missing
 * (`MissingArtifact`, artifacts.ts) — one of those the step can answer, by writing the file where its brief says or taking the name
 * off (`REFUSING`). The record is decoded by its shape, so `why` is text here, and worded by `lackWords`.
 */
export type LackedFile = { path: string; why: string };

/**
 * That the files the closeout of task `taskId` named were read off the disk, and those the run did not have then: none, or why for each,
 * by its path as the closeout gave it.
 */
export type FilesRead = { taskId: string; lacked: Readonly<Record<string, string>> };

/** The files the closeout of the task a step is on named that the run did not have (`StepRecord.filesRead`): none of another task's. */
export const lackedOf = (record: StepRecord | undefined): LackedFile[] =>
  record?.filesRead && record.filesRead.taskId === record.taskId
    ? Object.entries(record.filesRead.lacked).map(([path, why]) => ({ path, why }))
    : [];

/**
 * What the run did with an ending's staged merge (`landingDue`): committed it onto the base branch, or not — aborted, or found nothing to
 * commit — and why; or, for an ending that stopped on its own word with nothing staged, nothing at all (`untouched`), written down so that
 * what a person stages in the checkout after it is theirs. An abort of a merge its check refused names the base it was staged on
 * (`refusedOn`), which `nemia refresh --base` reads (`mergeAsk`).
 */
export type LandingRecord = { commit: string } | { aborted: string; refusedOn?: string } | { untouched: string };

/**
 * Whether a check that did not pass REFUSED the work, rather than not finishing.
 *
 * Refused: it ran to its end and exited non-zero — settled `failed`, with an exit code. Did not finish:
 * `stopped` — killed, or never started — or `failed` without an exit code, which is a check stopped at its
 * deadline or lost. That is no verdict on the work: `retries:` spends no try on it, and `nemia decide` offers
 * `nemia retry --recheck`.
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
 * A pruned run in words, as `nemia decide` says it under the run's line and where a decision would otherwise wait on a person's verb: when
 * it was pruned — or that its marker no longer says — and what was removed. Pure.
 */
export const prunedWords = (pruned: Pruned): string => {
  const files = pruned.artifacts ? filesPrunedWords(pruned.artifacts) : '';
  if (pruned.artifacts && !pruned.worktrees.length)
    return `pruned at ${pruned.artifacts.at || 'a time its marker no longer says'} — ${files}`;
  return `pruned at ${pruned.at || 'a time its marker no longer says'} — its worktrees were removed (nemia prune)${files ? `, and ${files}` : ''}`;
};

/**
 * That `nemia prune --artifacts` removed a run's files, and when, as every surface that reads a pruned run says it: `nemia decide`, a
 * refusal, and the api's answer for a file that was there. Pure.
 */
export const filesPrunedWords = (files: PrunedFiles): string =>
  `its files were removed at ${files.at || 'a time its marker no longer says'} (nemia prune --artifacts)`;

/**
 * Free text from outside — a harness's word, a closeout's `needs` — made one line of at most `cap` characters: every run of whitespace, a
 * newline included, becomes one space, and what is over the cap is clipped with `…`. Pure. What `waitingWords` does to a harness's word,
 * for every screen that prints such text into a line of its own.
 */
export function oneLine(text: string, cap: number): string {
  const line = text.trim().replace(/\s+/g, ' ');
  return line.length <= cap ? line : `${line.slice(0, cap - 1).trimEnd()}…`;
}

/** The most denied calls a line names before it counts the rest: `denied: A, B, C, D, E and 3 more`. */
export const DENIED_SHOWN = 5;

/** The longest one denied call a line prints: a file tool's is its path, which can be long, and a command's first word is free text. */
export const DENIED_CAP = 60;

/**
 * Text in a fence longer than any run of backticks inside it, so what it quotes cannot close the fence, nor open a section of the brief's.
 */
export function fenced(text: string, info = ''): string[] {
  const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((ticks) => ticks.length + 1)));
  return [`${fence}${info}`, text, fence];
}

/** JSON in a fence longer than any run of backticks inside it (`fenced`). */
export function dataBlock(value: unknown): string[] {
  return fenced(JSON.stringify(value, null, 2), 'json');
}

/** Every task a step has filed: its current try's and its check's, and each earlier try's and its check's, in that order. */
export const stepTasks = ({ taskId, check, tries }: StepRecord): string[] => [
  ...(taskId ? [taskId] : []),
  ...(check ? [check.taskId] : []),
  ...(tries ?? []).flatMap((t) => [t.taskId, ...(t.check ? [t.check.taskId] : [])]),
];

/**
 * Every task a run has filed (`stepTasks`), step by step: what a read of the whole run reads, and what a journal that does not read can
 * cost it.
 */
export const runTasks = (run: Pick<Run, 'steps'>): string[] => Object.values(run.steps).flatMap(stepTasks);

/**
 * Why a run is not judged, whole, when a task it reads has a journal that does not read: `own`, the task of its own that does not
 * (`runTasks`), or undefined for a task of a run it waits on; `why`, the runtime's words; `by`, what does not judge it — `the board`,
 * `nemia ls`, `nemia decide`. One sentence wherever a run is left unjudged, as the tick leaves it: what reads, what does not, and what that
 * costs.
 */
export function unjudgedWords(runId: string, own: string | undefined, why: string, by: string): string {
  const what = own ? `the journal of its task ${own} does not: ${why}` : `the journal of a task of a run it waits on does not: ${why}`;
  return `${runId}'s record reads, but ${/[.!?]$/.test(what) ? what : `${what}.`} So ${by} does not judge the run, and the tick does not advance it, until that journal reads again.`;
}

/**
 * Why `by` leaves a run unjudged whose unfrozen workflow folder does not load, followed by the refusal's words (`unloadedFolder`), which
 * name the folder and the two ways on: one sentence wherever such a run is left unjudged, as the tick leaves it.
 */
export function unloadedWords(runId: string, why: string, by: string): string {
  return `${runId}'s workflow folder does not load, so ${by} does not judge the run, and the tick does not advance it, until it loads again: ${why}`;
}

/** The asks waiting beside a run, tries and rounds, and a line for each file named as one that cannot be read as one. */
export type AsksRead = { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] };

/**
 * The verb a person's ask answers with: a try or a round (`nemia retry`, `--round` for a round), a yes at a gate or to a loop out of
 * rounds (`nemia approve`), the base brought into a loop's work (`nemia refresh --base`).
 */
export type AskKind = 'retry' | 'approve' | 'refresh';

/**
 * Which ask of its verb, as its file is named: a try (`retry-…`), a round (`round-…`), an approval at a gate (`approve-…`), a loop out of
 * rounds ended as it stands (`accept-…`), a merge of the base (`merge-…`). The files keep the names they had, so no ask on disk is
 * orphaned.
 */
export type AskOf = 'try' | 'round' | 'gate' | 'loop' | 'base';

/**
 * Which ask: which of its verb (`of`), its step, and its number — the try it names, or the round a round ask asks for; for a merge, the
 * loop's target and its try that merges.
 */
export type AskKey = { of: AskOf; step: string; n: number };

/** A person's request beside a run, of its verb and which, as its verb writes it. */
export type PersonRequest =
  | { kind: 'retry'; of: 'try'; ask: RetryAsk }
  | { kind: 'retry'; of: 'round'; ask: RoundAsk }
  | { kind: 'approve'; of: 'gate'; ask: Approval }
  | { kind: 'approve'; of: 'loop'; ask: Acceptance }
  | { kind: 'refresh'; of: 'base'; ask: RoundAsk & { merge: MergeOf } };

/**
 * What a merge ask's file holds (`mergeAskIn`): the looping step, the round it is on, the base branch, its commit, when it was asked, and
 * the landing refused on that commit, where one was (`MergeOf`).
 */
export type MergeAskHeld = {
  loop: string;
  round: number;
  onto: string;
  sha: string;
  at: string;
  landing?: { step: string; check: string };
};

/**
 * What writing a person's ask did, and `where` a person finds its file: written; or not, since a file already stood at its name — `stray`
 * says why that file is not an ask of its kind, read as the tick reads it, and is null when it reads as one or is gone since.
 */
export type AskWritten = { written: true; where: string } | { written: false; where: string; stray: string | null };

/**
 * The run store, as a plain value of synchronous methods: a run's record, and the files a person keeps beside it, by run id and never by
 * path. The tick writes the record; a person's verbs write their own files; no method lets one writer write the other's, but the tick's one
 * touch on a person's file, a hold lifted. Its implementation is `filesStore` (`files.store.ts`), bound as `runStore` there. What the
 * tick's pass and a person's verbs read and write of the store, grouped as `runs`, `asks`, `holds` and `forgetting`, the tasks `nemia rm`
 * has yet to see the engine forget; and the inbox, `inbox`: a person's cards, which their verbs write, and the tick's tries of a queued
 * card's start, which the tick alone writes.
 */
export type RunStore = {
  readonly runs: {
    /**
     * A run: its record, with the person's files composed onto it — the cancellation, the pruning, the hold, the approvals and the
     * acceptances. Refused: an id with no record (`Missing`), and a record that does not read as a run (`UnreadableRecord`).
     */
    readonly read: (id: string) => Run;
    /**
     * Every run in the store; a record that does not read as a run is left out and said once on `said`, stderr unless given. A run `kept`
     * answers for an id is listed as given, its record not read.
     */
    readonly list: (said?: (line: string) => void, kept?: (id: string) => Run | undefined) => Run[];
    /**
     * One run by id, found among the ids the store lists, never read by a path made of the id, with the person's files composed onto it
     * as `read` composes them. Undefined for an id the store does not list — one climbing out of the store's own directory among them —
     * for a record removed since the listing, and for one that does not read as a run, which is said once on `said`, stderr unless given,
     * as `list` says it.
     */
    readonly find: (id: string, said?: (line: string) => void) => Run | undefined;
    /**
     * Make a new run's record: `nemia start`'s, the one writer that makes one. A run from a card (`from.inbox`) is refused while another
     * run from it stands.
     */
    readonly create: (run: Run) => void;
    /**
     * Write back the record a pass read, without the person's files composed onto it, and only while it is there: false when it is not,
     * and no record is made again.
     */
    readonly rewrite: (run: Run) => boolean;
    /**
     * Each run's stamp: a text that changes whenever anything a pass reads of the run changes — its record, a person's file, an ask — and
     * that the memo of runs at rest compares. Taken before the pass reads the records, so a change between the two is never missed; a pass
     * reads no record whose stamp holds.
     */
    readonly stamps: () => Map<string, string>;
    /** Whether the run's record is there. */
    readonly exists: (id: string) => boolean;
    /** Whether a new run may not take the id: a record, a person's file, an ask or a directory of the store already has it. */
    readonly taken: (id: string) => boolean;
    /** Whether a person called the run off: cancelled it, pruned it, or holds it — or paused the whole store. */
    readonly calledOff: (id: string) => boolean;
    /**
     * Write down that a person cancelled the run (`nemia cancel`), and answer with the time that stands: the first cancellation is kept.
     */
    readonly cancel: (id: string) => string;
    /**
     * Remove what the store keeps under the run's id, whether or not its record is there — the record, the cancellation, the prune marker,
     * the hold, the asks and the run's own directory, in that order — and answer with each path removed, from `WF_ROOT`, a directory's with
     * a trailing `/`. Writes nothing.
     */
    readonly forget: (id: string) => string[];
    /**
     * The id of every run whose record file is in the store, read or not, sorted: what `nemia rm` keeps another run's check logs by,
     * where `list` would leave out a record that does not read. None when there is no store.
     */
    readonly ids: () => string[];
    /** The run's files directory, the files its steps handed on: its path while it is a directory and no link; else undefined. */
    readonly filesAt: (id: string) => string | undefined;
    /** Remove the run's files directory: null once it is gone, there before or not; else the first line of why it would not go. */
    readonly dropFiles: (id: string) => string | null;
    /** Write the prune marker a person's `nemia prune` puts on the run, whole over the one there; `undefined` takes the marker away. */
    readonly prune: (id: string, marker: Pruned | undefined) => void;
    /** The prune marker as its file reads now, with no read of the record: undefined for a run with none. */
    readonly pruned: (id: string) => Pruned | undefined;
  };
  readonly asks: {
    /** The asks waiting beside the run. */
    readonly read: (id: string) => AsksRead;
    /** Every ask that carried a message, waiting or consumed. */
    readonly answers: (id: string) => RetryAsk[];
    /**
     * Set aside each ask, approval and acceptance the run's record already answers, and each ask of `voided` (an ask `nemia pause --now`
     * wrote, found void): consumed, never edited.
     */
    readonly consume: (run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[], voided?: readonly RetryAsk[]) => void;
    /**
     * Write a person's ask, whole and exclusively, keyed by its kind, its step and its number: never over a file at its name, which is
     * answered as `written: false`, with why that file is no ask of its kind (`AskWritten`).
     */
    readonly write: (id: string, ask: PersonRequest) => AskWritten;
    /** Where a person finds the ask `key` of the run: the path a message names for them to read or remove. */
    readonly where: (id: string, key: AskKey) => string;
  };
  readonly holds: {
    /** Lift the hold put at `at`, and only while it still stands: false when it is gone or a hold was put since. */
    readonly lift: (id: string, at: string) => boolean;
    /**
     * Hold the run until the runs `until` land, with a person's `why` and who they are (`by`) when given: the hold written, or null when
     * one already stands, which is kept.
     */
    readonly put: (id: string, until: readonly string[], said: Pick<Hold, 'why' | 'by'>) => Hold | null;
    /** Whether a hold's file is there, read as a hold or not: one that does not read still holds the run. */
    readonly stands: (id: string) => boolean;
  };
  readonly refresh: {
    /**
     * Write down that a person asked the run to take the new revisions: the ask written, or null when one already stands, which is kept.
     */
    readonly put: (id: string) => { at: string } | null;
    /** Lift the ask, once the pass has taken the revisions it asked for: whether there was one. */
    readonly lift: (id: string) => boolean;
    /** Whether an ask's file is there, read as one or not. */
    readonly stands: (id: string) => boolean;
  };
  readonly forgetting: {
    /**
     * Write down the engine's tasks `nemia rm` forgets of the run, before anything of it is removed: `nemia rm`'s alone, whole over the
     * marker there, through a hidden file renamed over it. Throws what the filesystem throws.
     */
    readonly write: (id: string, taskIds: readonly string[]) => void;
    /** The task ids written down for the run, or undefined when no marker is there or it does not read as one. */
    readonly read: (id: string) => string[] | undefined;
    /** The runs a marker stands for, by id. None when there is none. */
    readonly list: () => string[];
    /** Take the run's marker away, there or not: `nemia rm` once its tasks are forgotten, or the tick once it forgot what had waited. */
    readonly lift: (id: string) => void;
    /** Where a person finds the run's marker: the path a message names for them to read or remove. */
    readonly where: (id: string) => string;
  };
};
