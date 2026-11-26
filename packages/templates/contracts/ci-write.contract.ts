/**
 * What sdlc's CI watcher writes for one condition of one step's try (`packages/templates/sdlc/carried/ci-watch.ts`, the program
 * `programs/ci-watch/program.yaml` the daemon keeps running per factory): `conditionDue`, whether the step has reached the condition;
 * `headWrite`, the condition `ci`, CI at the head of the run's pull request; and `mergeWrite`, the condition `base-ci`, CI at the merge
 * commit the run landed as on the base branch. Pure: the watcher reads the api and GitHub, hands each what it read, and acts on its word.
 *
 * Level-triggered: each pass reads the world again and carries nothing between passes. Once a re-run is read from GitHub's `run_attempt`
 * (`Red`), a dispatch from the runs GitHub holds at the head (`stuck`), and a condition already decided for the try from what the api
 * serves of it (`decided`), so a watcher started again does what the one before it would have done, and never a second re-run.
 *
 * The words of what is written — the head or the merge commit judged, the jobs, the Actions address, the `nemia retry` line — are the
 * watcher's, never these laws': only which act is due.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * One check of the step's current try as the api serves it, in the step's order: its name, whether it passed on this try, and the
 * condition it waits on where it waits on one.
 */
export type ServedCheck = { readonly name: string; readonly passed: boolean; readonly condition: string | null };

/**
 * Where the run's pull request stands on GitHub: `none` open nor merged, `open` and mergeable or not yet computed, `conflicting` with its
 * base (GitHub runs no `pull_request` workflow on it), or `merged`.
 */
export type Pull = 'none' | 'open' | 'conflicting' | 'merged';

/**
 * The CI context the factory names (`ciCheck`) at the commit judged, its latest run of each check read: `passed`, `failed` (failed or
 * timed out), `pending`, `absent` (not reported), `superseded` (no verdict of its own: every run of it cancelled, as when a newer push
 * replaced it), or `undeclared` (neither that commit's tree nor its base's declares a CI workflow, so nothing will report one).
 */
export type Ci = 'passed' | 'failed' | 'pending' | 'absent' | 'superseded' | 'undeclared';

/**
 * A red context as GitHub and its logs say it, read only where `Ci` is `failed`: `change`, a red job's log names a line that failed it
 * (`rerunDue`, `contracts/second-run.contract.ts`), which a second run would fail again; `rerun`, none is the change's and the red run
 * is on its first attempt (`run_attempt` 1); `again`, it was re-run once already (`run_attempt` above 1) and is red still.
 */
export type Red = 'change' | 'rerun' | 'again';

/**
 * What the watcher does for the condition: `nothing` (no write, no call that acts); `pass`, write `True`; `refuse`, write `False`;
 * `wait`, write `Unknown` with why, where it differs from what is written; `rerun`, re-run the red run's failed jobs, then write
 * `Unknown`; `dispatch`, dispatch the workflow of the run GitHub queued at the head and never started, then write `Unknown`.
 */
export type Act = 'nothing' | 'pass' | 'refuse' | 'wait' | 'rerun' | 'dispatch';

/** What the watcher read for the condition `ci` of a step's try. */
export type HeadRead = {
  /** The step has reached the condition (`conditionDue`). */
  readonly due: boolean;
  /** `True` or `False` is written for the try the step is on. */
  readonly decided: boolean;
  readonly pull: Pull;
  /**
   * The open pull request's head is the tip of the run's result branch in the run's repository: the commit the step's checks judged.
   * Read only where `pull` is `open` or `conflicting`.
   */
  readonly ours: boolean;
  /** The context at that head; read only where the head is ours and the pull request open. */
  readonly ci: Ci;
  /** Whose the red is; read only where `ci` is `failed`. */
  readonly red: Red;
  /**
   * The context is absent, a run GitHub queued at the head has waited past the stuck bound and never started, and no run at that head
   * was dispatched already.
   */
  readonly stuck: boolean;
};

/** What the watcher read for the condition `base-ci` of a step's try. */
export type MergeRead = {
  readonly due: boolean;
  readonly decided: boolean;
  /** The factory waits on CI at the merge commit (`landingWaitsOnCi`, handed to the program as a flag). */
  readonly waits: boolean;
  /** The run has exactly one pull request merged, with a merge commit of two parents. */
  readonly merged: boolean;
  /** The merge commit's tree is its pull request's head's: CI judged that tree at the head, before the merge, under `ci`. */
  readonly sameTree: boolean;
  /** The context at the merge commit. */
  readonly ci: Ci;
  /** Whose the red at the merge is; read only where `ci` is `failed`. */
  readonly red: Red;
  /** The context at the base's tip where that tip holds the merge commit and is not it (GitHub's compare); `none` where it is not read. */
  readonly tip: 'passed' | 'failed' | 'none';
};

/** The watcher may act: the step has reached the condition, and nothing decided is written for its try. */
const live = (r: { due: boolean; decided: boolean }) => r.due && !r.decided;

/** The run's open pull request, at the step's head, mergeable or not yet computed. */
const openOurs = (r: HeadRead) => r.pull === 'open' && r.ours;

const conditionDueSpec = spec<(checking: boolean, checks: readonly ServedCheck[], condition: string) => boolean>({
  ensures: {
    dueExactlyOnceTheChecksBeforeItPassed: {
      description:
        "A condition is due exactly where the step is checking its try, a check of it waits on the condition, and every check listed before the first such check passed on this try: never while the step's session runs, nor before the checks that act for its head (the push) passed",
      condition: ({ input: [checking, checks, condition], output }) => {
        const at = checks.findIndex((c) => c.condition === condition);
        return output === (checking && at >= 0 && checks.slice(0, at).every((c) => c.passed));
      },
    },
  },
});
export type ConditionDue = Implementation<typeof conditionDueSpec>;

const headWriteSpec = spec<(read: HeadRead) => Act>({
  ensures: {
    nothingBeforeItIsDueOrOnceDecidedOrOnAnotherHead: {
      description:
        "Nothing is written or done before the step reaches the condition, once True or False is written for its try, or where the open pull request's head is not the step's",
      condition: ({ input: [r], output }) =>
        (output === 'nothing') === (!live(r) || ((r.pull === 'open' || r.pull === 'conflicting') && !r.ours)),
    },
    passesAMergedPullOrAGreenHeadOrOneNoCiJudges: {
      description:
        "True is written exactly where the run's pull request is merged, or open at the step's head with the context passed there or no CI workflow declared",
      condition: ({ input: [r], output }) =>
        (output === 'pass') === (live(r) && (r.pull === 'merged' || (openOurs(r) && (r.ci === 'passed' || r.ci === 'undeclared')))),
    },
    refusesAConflictOrARedNoSecondRunWouldChange: {
      description:
        "False is written exactly where the step's pull request conflicts with its base, or its head is red and the red is the change's or already re-run once",
      condition: ({ input: [r], output }) =>
        (output === 'refuse') ===
        (live(r) && r.ours && (r.pull === 'conflicting' || (r.pull === 'open' && r.ci === 'failed' && r.red !== 'rerun'))),
    },
    rerunsARedOnceOnItsFirstAttempt: {
      description: "The failed jobs are re-run exactly where the head is red, none of its red jobs is the change's, and its run is on its first attempt",
      condition: ({ input: [r], output }) => (output === 'rerun') === (live(r) && openOurs(r) && r.ci === 'failed' && r.red === 'rerun'),
    },
    dispatchesARunGitHubNeverStarted: {
      description: 'A queued run is dispatched exactly where the context is absent at the head and GitHub queued a run there it never started',
      condition: ({ input: [r], output }) => (output === 'dispatch') === (live(r) && openOurs(r) && r.ci === 'absent' && r.stuck),
    },
  },
});
export type HeadWrite = Implementation<typeof headWriteSpec>;

const mergeWriteSpec = spec<(read: MergeRead) => Act>({
  ensures: {
    nothingBeforeItIsDueOrOnceDecided: {
      description: 'Nothing is written or done before the step reaches the condition, or once True or False is written for its try',
      condition: ({ input: [r], output }) => (output === 'nothing') === !live(r),
    },
    passesWhatCiAlreadyJudgedOrIsNotAskedToJudge: {
      description:
        "True is written exactly where the factory does not wait on CI at the merge, or the run's merge holds a tree CI judged at its head, no CI is declared, the context passed at the merge, or the merge has a red or no verdict of its own and the base's tip that holds it passed",
      condition: ({ input: [r], output }) =>
        (output === 'pass') ===
        (live(r) &&
          (!r.waits ||
            (r.merged &&
              (r.sameTree ||
                r.ci === 'undeclared' ||
                r.ci === 'passed' ||
                ((r.ci === 'failed' || r.ci === 'superseded') && r.tip === 'passed'))))),
    },
    refusesAMergeThatTurnedTheBaseRed: {
      description:
        "False is written exactly where the merge is red, re-run once already, and the base's tip that holds it did not pass, or the merge has no verdict of its own and that tip is red",
      condition: ({ input: [r], output }) =>
        (output === 'refuse') ===
        (live(r) &&
          r.waits &&
          r.merged &&
          !r.sameTree &&
          ((r.ci === 'failed' && r.red !== 'rerun' && r.tip !== 'passed') || (r.ci === 'superseded' && r.tip === 'failed'))),
    },
    rerunsARedAtTheMergeOnce: {
      description: "The merge's failed jobs are re-run exactly where it is red on its run's first attempt and the base's tip that holds it did not pass",
      condition: ({ input: [r], output }) =>
        (output === 'rerun') ===
        (live(r) && r.waits && r.merged && !r.sameTree && r.ci === 'failed' && r.red === 'rerun' && r.tip !== 'passed'),
    },
    neverDispatchesOnTheBase: {
      description: 'Nothing is dispatched at the merge: a push to the base starts its own runs',
      condition: ({ output }) => output !== 'dispatch',
    },
  },
});
export type MergeWrite = Implementation<typeof mergeWriteSpec>;
