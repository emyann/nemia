/**
 * What sdlc's landing program writes for one condition of one land step's try (`packages/templates/sdlc/carried/land.ts`, the program
 * `programs/land/program.yaml` the daemon keeps running per factory): `turnWrite`, the condition `turn`, the landing's one slot taken and
 * the run's head brought up to its base where the factory names a refresh; `landWrite`, the condition `landed` on GitHub, the run's pull
 * request merged; and `localWrite`, the condition `landed` with no remote, the run's result merged in the repository's own checkout. Pure:
 * the program reads the api, GitHub and git, hands each what it read, and acts on its word.
 *
 * Level-triggered: each pass reads the world again and carries nothing between passes. Who holds the slot is read from the conditions the
 * api serves (`held`), a merge already made from GitHub or git (`pull`, `onBase`), and a merge a stopped program left staged from the
 * checkout (`checkout`), so a program started again does what the one before it would have done, and never lands a run twice.
 *
 * The words written — the pull request, the merge commit, the files that conflict, the `nemia retry` line — are the program's, never
 * these laws': only which act is due.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Where the run's pull request stands on GitHub: `none` open nor merged; `open` and mergeable or not yet computed; `conflicting` with its
 * base; `merged`, exactly one, as a merge commit; `other`, more than one open or merged, or one merged some other way (squashed, rebased),
 * which a person sorts out.
 */
export type Pull = 'none' | 'open' | 'conflicting' | 'merged' | 'other';

/** What GitHub says of merging the open pull request now: `yes` (MERGEABLE), `no` (CONFLICTING), `unknown` (not computed yet). */
export type Mergeable = 'yes' | 'no' | 'unknown';

/**
 * The repository's own checkout as the local landing reads it: `ready`, on the base branch, clean, with no merge in progress; `ours`, a
 * merge in progress whose heads are this run's result branches, left staged by a program stopped mid-landing; `busy`, anything else (on
 * another branch, changes not committed, another merge in progress), which is a person's.
 */
export type Checkout = 'ready' | 'ours' | 'busy';

/**
 * What the program does for the condition `turn`: `nothing`; `pass`, write `True`; `wait`, write `Unknown` with why; `refresh`, bring the
 * head up to its base (merge it in, the factory's install and refresh, push), then write `True`, or `False` where the refresh refuses;
 * `refuse`, write `False`.
 */
export type TurnAct = 'nothing' | 'pass' | 'wait' | 'refresh' | 'refuse';

/**
 * What the program does for the condition `landed` on GitHub: `nothing`; `pass`, write `True`; `wait`, write `Unknown` with why; `merge`,
 * merge the pull request with a merge commit at its head, its title and description the message, then write `True`, or `False` where
 * GitHub declines; `refuse`, write `False`.
 */
export type LandAct = 'nothing' | 'pass' | 'wait' | 'merge' | 'refuse';

/**
 * What the program does for the condition `landed` with no remote: `nothing`; `pass`, write `True`; `wait`, write `Unknown` with why;
 * `abort`, take back the merge of this run's left staged (`git merge --abort`), writing nothing, so the next pass stages it again;
 * `merge`, stage every result branch in one `git merge --no-ff --no-commit`, run the local check on the merged tree and commit it, then
 * write `True`, or take it back and write `False` where it conflicts or the check refuses.
 */
export type LocalAct = 'nothing' | 'pass' | 'wait' | 'abort' | 'merge';

/** What the program read for the condition `turn` of a land step's try. */
export type TurnRead = {
  /** The step has reached the condition (`conditionDue`): it is checking, and every condition before `turn` passed on this try. */
  readonly due: boolean;
  /** `True` or `False` is written for the try the step is on. */
  readonly decided: boolean;
  /**
   * Another run of the factory holds the landing's one slot: its land step is checking, `turn` is `True` for its try and `landed` is not
   * decided; or the program gave the slot to another run earlier in this pass.
   */
  readonly held: boolean;
  readonly pull: Pull;
  /** The open pull request's head is the tip of the run's result branch, not a draft, and based on the base branch. */
  readonly ours: boolean;
  /** The factory names a refresh (`landingRefresh` is not empty). */
  readonly refreshes: boolean;
  /** The head does not hold the base branch's tip, after a fetch; read only where the factory names a refresh. */
  readonly lacksBase: boolean;
};

/** What the program read for the condition `landed` of a land step's try, on GitHub. */
export type LandRead = {
  readonly due: boolean;
  readonly decided: boolean;
  readonly pull: Pull;
  /** As in `TurnRead`: the open pull request is the run's own, at its result branch's tip. */
  readonly ours: boolean;
  readonly mergeable: Mergeable;
  /** The CI context the factory names (`ciCheck`) passed at the head, or neither the head nor its base declares a CI workflow. */
  readonly green: boolean;
  /** The head holds the base branch's tip where the factory names a refresh; true where it names none. */
  readonly current: boolean;
  /**
   * A commit of one of the run's result branches has no equivalent patch (`git cherry`) on the open head, or on the merge commit where
   * the pull request is merged.
   */
  readonly leftOut: boolean;
};

/** What the program read for the condition `landed` of a land step's try, with no remote. */
export type LocalRead = {
  readonly due: boolean;
  readonly decided: boolean;
  /** Every commit of every result branch of the run has an equivalent patch on the base branch's tip: landed already, or by hand. */
  readonly onBase: boolean;
  readonly checkout: Checkout;
};

/** The program may act: the step has reached the condition, and nothing decided is written for its try. */
const live = (r: { due: boolean; decided: boolean }) => r.due && !r.decided;

/** The run's open pull request, mergeable or conflicting, at its result branch's tip. */
const openOurs = (r: { pull: Pull; ours: boolean }) => (r.pull === 'open' || r.pull === 'conflicting') && r.ours;

const turnWriteSpec = spec<(read: TurnRead) => TurnAct>({
  ensures: {
    nothingBeforeItIsDueOrOnceDecided: {
      description: 'Nothing is written or done before the step reaches the condition, or once True or False is written for its try',
      condition: ({ input: [r], output }) => (output === 'nothing') === !live(r),
    },
    passesAMergedRunOrTheSlotFreeAtAHeadThatLandsAsItIs: {
      description:
        "The turn is given exactly where the run's pull request is merged already, or the slot is free and the run's own open head needs no refresh: the factory names none, or the head holds the base",
      condition: ({ input: [r], output }) =>
        (output === 'pass') ===
        (live(r) && (r.pull === 'merged' || (!r.held && openOurs(r) && (!r.refreshes || !r.lacksBase)))),
    },
    refreshesOnlyWithTheSlotFree: {
      description:
        "The head is refreshed exactly where the slot is free, the open pull request is the run's own, the factory names a refresh and the head lacks the base: two refreshed heads never wait on CI at once",
      condition: ({ input: [r], output }) =>
        (output === 'refresh') === (live(r) && !r.held && openOurs(r) && r.refreshes && r.lacksBase),
    },
    waitsBehindTheHolderOrForAPullRequest: {
      description: 'The step waits exactly where it is not merged and another run holds the slot, or no pull request of the run is open',
      condition: ({ input: [r], output }) =>
        (output === 'wait') === (live(r) && r.pull !== 'merged' && r.pull !== 'other' && (r.held || r.pull === 'none')),
    },
    refusesAPullRequestThatIsNotTheRunsOwn: {
      description:
        "False is written exactly where the slot is free and the open pull request is not the run's own at its tip, or the run has several pull requests or one merged other than by a merge commit",
      condition: ({ input: [r], output }) =>
        (output === 'refuse') ===
        (live(r) && (r.pull === 'other' || (!r.held && (r.pull === 'open' || r.pull === 'conflicting') && !r.ours))),
    },
  },
});
export type TurnWrite = Implementation<typeof turnWriteSpec>;

const landWriteSpec = spec<(read: LandRead) => LandAct>({
  ensures: {
    nothingBeforeItIsDueOrOnceDecided: {
      description: 'Nothing is written or done before the step reaches the condition, or once True or False is written for its try',
      condition: ({ input: [r], output }) => (output === 'nothing') === !live(r),
    },
    aMergedPullRequestReadsAsLanded: {
      description:
        "True is written, and nothing merged, exactly where the run's pull request is merged as a merge commit that holds every result branch: by this program before a restart, or by a person",
      condition: ({ input: [r], output }) => (output === 'pass') === (live(r) && r.pull === 'merged' && !r.leftOut),
    },
    mergesOnlyTheRunsOwnGreenWholeCurrentHead: {
      description:
        "The pull request is merged exactly where it is open, the run's own, mergeable, green at its head, holding the base where the factory refreshes, and leaving no result branch out",
      condition: ({ input: [r], output }) =>
        (output === 'merge') ===
        (live(r) && r.pull === 'open' && r.ours && r.mergeable === 'yes' && r.green && r.current && !r.leftOut),
    },
    waitsWhileGitHubComputesWhetherItMerges: {
      description: "The step waits exactly where the run's own open pull request is not yet computed mergeable or not",
      condition: ({ input: [r], output }) =>
        (output === 'wait') === (live(r) && r.pull === 'open' && r.ours && r.mergeable === 'unknown'),
    },
    neverMergesTwice: {
      description: 'Nothing is merged where a pull request of the run is merged already, whatever way',
      condition: ({ input: [r], output }) => !(output === 'merge' && (r.pull === 'merged' || r.pull === 'other')),
    },
  },
});
export type LandWrite = Implementation<typeof landWriteSpec>;

const localWriteSpec = spec<(read: LocalRead) => LocalAct>({
  ensures: {
    nothingBeforeItIsDueOrOnceDecided: {
      description: 'Nothing is written or done before the step reaches the condition, or once True or False is written for its try',
      condition: ({ input: [r], output }) => (output === 'nothing') === !live(r),
    },
    takesBackAMergeOfItsOwnLeftStaged: {
      description:
        'A merge of this run left staged in the checkout by a program stopped mid-landing is taken back before anything else, so it is staged and judged again, never committed unjudged',
      condition: ({ input: [r], output }) => (output === 'abort') === (live(r) && r.checkout === 'ours'),
    },
    aResultOnTheBaseReadsAsLanded: {
      description:
        'True is written, and nothing merged, exactly where every result branch is on the base branch by patch, and no merge of the run is left staged',
      condition: ({ input: [r], output }) => (output === 'pass') === (live(r) && r.onBase && r.checkout !== 'ours'),
    },
    mergesOnlyInAReadyCheckout: {
      description:
        "The result is staged exactly where it is not on the base yet and the checkout is on the base branch, clean, with no merge in progress: a person's work is never merged into",
      condition: ({ input: [r], output }) => (output === 'merge') === (live(r) && !r.onBase && r.checkout === 'ready'),
    },
    waitsOnABusyCheckout: {
      description: "The step waits, saying what is in the way, exactly where the result is not on the base and the checkout is a person's",
      condition: ({ input: [r], output }) => (output === 'wait') === (live(r) && !r.onBase && r.checkout === 'busy'),
    },
  },
});
export type LocalWrite = Implementation<typeof localWriteSpec>;
