/**
 * The contract between the orchestrator and a place skill (the git-out design, *The seam* and *The contracts*): the
 * verbs a place answers, the request each is handed, the answer each gives, and what the skill's `place.json` declares. Types and constants
 * alone: `place.store.ts` runs a verb's script and decodes what it prints into these.
 *
 * A verb is run as `node <skill>/scripts/<verb>.ts`, one JSON request on stdin carrying `v` (`PLACE_CONTRACT`), and has one of three
 * outcomes (`PlaceOutcome`): its answer, a refusal the place words itself, or unread, when it gave neither in time.
 */

/** The verbs a place may answer, in the order a run meets them. */
export const PLACE_VERBS = ['open', 'make', 'handoff', 'report', 'standing', 'status', 'land', 'inventory', 'remove'] as const;

/** A verb a place may answer. */
export type PlaceVerb = (typeof PLACE_VERBS)[number];

/** The version of the contract, carried as `v` on every request and in `place.json`. */
export const PLACE_CONTRACT = 1;

/** How long a verb's script may take before it is unread, in milliseconds: two minutes, and ten for `make`, whose fan-in merge is slow. */
export const PLACE_DEADLINE_MS: Readonly<Record<PlaceVerb, number>> = {
  open: 120_000,
  make: 600_000,
  handoff: 120_000,
  report: 120_000,
  standing: 120_000,
  status: 120_000,
  land: 120_000,
  inventory: 120_000,
  remove: 120_000,
};

/** What `open` answers at `wf start`: the repository, the commit a run starts from, and the line of work it is on. */
export type Opened = { readonly repo: string; readonly baseRef: string; readonly branch: string };

/** What `make` answers: the directory a step works in, its line of work, the paths a fan-in merge left conflicted, and notes for its brief. */
export type Made = {
  readonly workspace: string;
  readonly branch: string;
  readonly conflicts: readonly string[];
  readonly notes: readonly string[];
};

/** What `handoff` answers: the commit it made of what a step left, or null when there was nothing to commit. */
export type HandedOff = { readonly commit: string | null };

/** One file a result branch changed: its path, where it came `from` when renamed, how, and its lines added and removed (null for binary). */
export type ChangedFile = {
  readonly path: string;
  readonly from?: string;
  readonly status: string;
  readonly added: number | null;
  readonly removed: number | null;
};

/** Whether a result branch merges onto the base as it is: cleanly, with conflicts in these paths, or not known, and why. */
export type TrialMerge =
  | { readonly clean: true }
  | { readonly clean: false; readonly conflicts: readonly string[] }
  | { readonly unknown: string };

/**
 * What `report` answers: the base and tips it was made at, the files each result branch changed, the full diff of each path asked of,
 * each branch's trial merge onto the base, whether each path asked of is on a branch, and each path's text at the base (null if absent).
 */
export type Changes = {
  readonly at: { readonly baseRef: string; readonly onto: string; readonly tips: Readonly<Record<string, string>> };
  readonly files: Readonly<Record<string, readonly ChangedFile[]>>;
  readonly diffs: Readonly<Record<string, string>>;
  readonly merges: Readonly<Record<string, TrialMerge>>;
  readonly present: Readonly<Record<string, 'file' | 'directory' | 'absent'>>;
  readonly atBase: Readonly<Record<string, string | null>>;
};

/** One result branch as `standing` reads it: its tip, whether it is on its base, whether it holds work past the run's base, and how far ahead. */
export type BranchStood = {
  readonly branch: string;
  readonly tip: string | null;
  readonly onBase: 'yes' | 'no' | 'unknown';
  readonly pastBase: boolean | null;
  readonly ahead: number | null;
};

/** What `standing` answers: every head of the repository by name, and each result branch asked of. */
export type Standing = { readonly heads: Readonly<Record<string, string>>; readonly branches: readonly BranchStood[] };

/**
 * What `status` answers of a checkout an ending lands in: whose merge is in progress (`ours` when every commit it merges is one of the
 * run's tips), whether a path is unmerged, the result branches a commit now would leave out, and HEAD when there is one.
 */
export type Status = {
  readonly merging: 'ours' | 'other' | 'none';
  readonly conflicted: boolean;
  readonly missing: readonly string[];
  readonly head?: string;
};

/** What `land` answers: the commit that landed the staged merge, or that the merge was taken back. */
export type Landed = { readonly commit: string } | { readonly aborted: true };

/** One workspace a run left, as `inventory` reads it: where, for which step, on what, and whether it holds anything no commit has. */
export type Held = {
  readonly path: string;
  readonly step?: string;
  readonly branch?: string;
  readonly head?: string;
  readonly detached: boolean;
  readonly locked?: string;
  readonly prunable: boolean;
  readonly clean: boolean | null;
  readonly onBranch: boolean;
};

/** What `inventory` answers: the workspaces a run left, and its lines of work with whether each is merged. */
export type Inventory = {
  readonly workspaces: readonly Held[];
  readonly branches: readonly { readonly branch: string; readonly merged: boolean }[];
};

/** What `remove` answers: the workspaces removed and those left with why, the lines of work deleted and those kept with why. */
export type Removed = {
  readonly removed: readonly string[];
  readonly left: readonly { readonly path: string; readonly said: string }[];
  readonly deleted: readonly string[];
  readonly kept: readonly { readonly branch: string; readonly said: string }[];
};

/** Each verb's answer. */
export type PlaceAnswers = {
  readonly open: Opened;
  readonly make: Made;
  readonly handoff: HandedOff;
  readonly report: Changes;
  readonly standing: Standing;
  readonly status: Status;
  readonly land: Landed;
  readonly inventory: Inventory;
  readonly remove: Removed;
};

/** Each verb's request, as the code hands it: `v` is added by the runner. */
export type PlaceRequests = {
  readonly open: { readonly root: string };
  readonly make: {
    readonly repo: string;
    readonly at: string;
    readonly name: string;
    readonly from: string;
    readonly also: readonly string[];
  };
  readonly handoff: { readonly workspace: string; readonly step: string; readonly why: string };
  readonly report: {
    readonly repo: string;
    readonly baseRef: string;
    readonly onto: string;
    readonly branches: readonly string[];
    readonly diffOf: readonly string[];
    readonly present: readonly string[];
    readonly atBase: readonly string[];
  };
  readonly standing: {
    readonly repo: string;
    readonly branches: readonly { readonly branch: string; readonly tip?: string; readonly baseRef: string }[];
    readonly base: string;
  };
  readonly status: { readonly checkout: string; readonly tips: Readonly<Record<string, string>> };
  readonly land:
    | { readonly checkout: string; readonly act: 'commit'; readonly message: string }
    | { readonly checkout: string; readonly act: 'abort' };
  readonly inventory: { readonly repo: string; readonly under: string; readonly prefix: string };
  readonly remove: { readonly repo: string; readonly workspaces: readonly string[]; readonly branches: readonly string[] };
};

/** A verb that gave no answer: which, the last words its script said or why it was not heard, and when, as an ISO time. */
export type Unread = { readonly verb: PlaceVerb; readonly said: string; readonly at: string };

/** A verb's outcome: its answer, the place's refusal in its own words, or unread. Unread is never a verdict: the verb is asked again. */
export type PlaceOutcome<V extends PlaceVerb> =
  | { readonly answer: PlaceAnswers[V] }
  | { readonly refused: string }
  | { readonly unread: Unread };

/** The keys of `place.json`'s `say`: the sentences the code prints that name a place's own commands, as templates with `{name}` holes. */
export const PLACE_SAYS = ['look', 'readResult', 'ship', 'drop', 'conflicts', 'unlock'] as const;

/**
 * What a place skill's `place.json` declares: the contract's version, the verbs its scripts answer, the tools a landing session is denied,
 * and the sentences the code prints for it (`look` a list of lines, each other one line).
 */
export type PlaceDeclared = {
  readonly v: typeof PLACE_CONTRACT;
  readonly verbs: readonly PlaceVerb[];
  readonly denyWhileLanding: readonly string[];
  readonly say: { readonly look: readonly string[] } & { readonly [K in Exclude<(typeof PLACE_SAYS)[number], 'look'>]: string };
};
