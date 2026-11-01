/**
 * The contract between the orchestrator and a place (the git-out design, *The seam* and *The contracts*): the verbs a place answers, the
 * request each is handed, the answer each gives, and what a place declares of itself. Types and constants alone: `place.store.ts` holds
 * the service a caller asks.
 *
 * A verb is a question asked of the place the program was given, and has one of three outcomes (`PlaceOutcome`): its answer, a refusal the
 * place words itself, or unread, when it gave neither in time.
 */

/** The verbs a place may answer, in the order a run meets them: `root` first, asked of a folder before any run. */
export const PLACE_VERBS = [
  'root',
  'open',
  'make',
  'handoff',
  'report',
  'standing',
  'trial',
  'status',
  'land',
  'inventory',
  'remove',
  'export',
  'seal',
] as const;

/** A verb a place may answer. */
export type PlaceVerb = (typeof PLACE_VERBS)[number];

/** How long a verb may take before it is unread, in milliseconds: two minutes, and ten for `make`, whose fan-in merge is slow. */
export const PLACE_DEADLINE_MS: Readonly<Record<PlaceVerb, number>> = {
  root: 120_000,
  open: 120_000,
  make: 600_000,
  handoff: 120_000,
  report: 120_000,
  standing: 120_000,
  trial: 120_000,
  status: 120_000,
  land: 120_000,
  inventory: 120_000,
  remove: 120_000,
  export: 120_000,
  seal: 120_000,
};

/**
 * What `root` answers of a folder: the root of the main checkout of the repository it is in, from that root, a folder inside it or a
 * workspace cut from it alike, or null for a folder in no repository.
 */
export type Rooted = { readonly root: string | null };

/**
 * What `open` answers at `nemia start`: the repo, the commit a run starts from, the line of work it is on, and, where the place names
 * one, `inProgressFile`: the absolute path of the file whose presence says a merge is in progress in that repo, which the code reads
 * with a `stat` and no process (`stagedHere`).
 */
export type Opened = { readonly repo: string; readonly baseRef: string; readonly branch: string; readonly inProgressFile?: string };

/**
 * What `make` answers: the directory a step works in, its line of work, the paths a fan-in merge left conflicted, and notes for the run's
 * log — what `.worktreeinclude` copied or refused, and a merge that failed with nothing conflicted.
 */
export type Made = {
  readonly workspace: string;
  readonly branch: string;
  readonly conflicts: readonly string[];
  readonly notes: readonly string[];
};

/** What `handoff` answers: the commit it made of what a step left, or null when there was nothing to commit. */
export type HandedOff = { readonly commit: string | null };

/**
 * How a file changed over a range, in the place's words (GitHub's for a commit's files): `added`, `modified`, `removed`, `renamed` (its
 * `from` says where it came from), `copied` (`from` names the original), and `changed`, its type and not its text — a file turned into a
 * symbolic link. A place translates its own record into these; the git place maps git's status letters (`report.ts`).
 */
export type FileChange = 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed';

/**
 * One file a result branch changed: its path, where it came `from` when renamed or copied, how (`FileChange`), and its lines added and
 * removed (null for binary).
 */
export type ChangedFile = {
  readonly path: string;
  readonly from?: string;
  readonly status: FileChange;
  readonly added: number | null;
  readonly removed: number | null;
};

/** Whether a result branch merges onto the base as it is: cleanly, with conflicts in these paths, or not known, and why. */
export type TrialMerge =
  | { readonly clean: true }
  | { readonly clean: false; readonly conflicts: readonly string[] }
  | { readonly unknown: string };

/**
 * What `report` answers: the base, the commit `onto` names now (null where the place has none) and each branch's tip it read; the files
 * each branch changed; for each branch, the whole diff of each path asked of that it changed; whether each path asked of is a file, a
 * directory or absent on each branch; and each path's text at the base (null if absent). A branch the place does not have is in none of
 * them: not known, never a branch that changed nothing.
 */
export type Changes = {
  readonly at: { readonly baseRef: string; readonly onto: string | null; readonly tips: Readonly<Record<string, string>> };
  readonly files: Readonly<Record<string, readonly ChangedFile[]>>;
  readonly diffs: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly present: Readonly<Record<string, Readonly<Record<string, 'file' | 'directory' | 'absent'>>>>;
  readonly atBase: Readonly<Record<string, string | null>>;
};

/**
 * One result branch as `standing` reads it: its tip, whether it is on its base, whether it holds work past the run's base, and how far
 * ahead.
 */
export type BranchStood = {
  readonly branch: string;
  readonly tip: string | null;
  readonly onBase: 'yes' | 'no' | 'unknown';
  readonly pastBase: boolean | null;
  readonly ahead: number | null;
};

/**
 * What was last read of a result branch against its run's `baseRef`, handed back to `standing`: the commit judged (null where none was) and
 * its `pastBase`. The place lists no distance from that `baseRef` for it, and believes `pastBase` only while the branch's commit is `tip`.
 */
export type KnownStood = { readonly tip: string | null; readonly pastBase: boolean | null };

/** What `standing` answers: the tip of every branch of the repo by name, and each result branch asked of. */
export type Standing = { readonly tips: Readonly<Record<string, string>>; readonly branches: readonly BranchStood[] };

/** What `trial` answers: the commit each base asked of names now (null where the place has none), and each trial in the order asked. */
export type Trials = { readonly at: Readonly<Record<string, string | null>>; readonly trials: readonly TrialMerge[] };

/**
 * What `status` answers of the repo an ending lands in: whose merge is in progress (`ours` when every commit it merges is one of the
 * run's tips), whether a path is unmerged, the result branches a commit now would leave out, and the commit the repo is at, its `tip`,
 * when there is one.
 */
export type MergeState = {
  readonly merging: 'ours' | 'other' | 'none';
  readonly conflicted: boolean;
  readonly missing: readonly string[];
  readonly tip?: string;
};

/** What `land` answers: the commit that landed the merge in progress, or that the merge was taken back. */
export type PlaceLanded = { readonly commit: string } | { readonly aborted: true };

/**
 * One workspace a run left, as `inventory` reads it: where, for which step, on which branch, at which commit (`tip`), whether the place
 * may remove it (`removable`: `yes`, `gone` when its folder is no longer there and the place only forgets it, `held` when someone holds
 * it, their words in `heldBy`), whether its work is on a branch (`onBranch`: it is on one, or it is clean and its commit is in the
 * branch it was cut on), whether it holds anything no commit has — `clean` null where that could not be read — and the paths it holds
 * uncommitted (`changes`).
 */
export type Held = {
  readonly path: string;
  readonly step?: string;
  readonly branch?: string;
  readonly tip?: string;
  readonly removable: 'yes' | 'gone' | 'held';
  readonly heldBy?: string;
  readonly onBranch: boolean;
  readonly clean: boolean | null;
  readonly changes?: readonly string[];
};

/**
 * What `inventory` answers: the workspaces a run left, and the branches the place named for that run, with whether each is merged — no
 * other run's.
 */
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

/** What `export` answers: the commit the tag names, whose tree it wrote. */
export type Exported = { readonly commit: string };

/** What `seal` answers: whether an exported tree held the empty repository `export` gave it, now removed. */
export type Sealed = { readonly removed: boolean };

/** Each verb's answer. */
export type PlaceAnswers = {
  readonly root: Rooted;
  readonly open: Opened;
  readonly make: Made;
  readonly handoff: HandedOff;
  readonly report: Changes;
  readonly standing: Standing;
  readonly trial: Trials;
  readonly status: MergeState;
  readonly land: PlaceLanded;
  readonly inventory: Inventory;
  readonly remove: Removed;
  readonly export: Exported;
  readonly seal: Sealed;
};

/**
 * Each verb's request, as the code hands it. A run's branches are the place's to name: `make` is handed the run and the leaf of the
 * step's cut, and `inventory` the run, and the place lists that run's branches alone.
 */
export type PlaceRequests = {
  readonly root: { readonly dir: string };
  readonly open: { readonly root: string; readonly isolate: boolean };
  readonly make: {
    readonly repo: string;
    readonly at: string;
    readonly run: string;
    readonly leaf: string;
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
    readonly branches: readonly {
      readonly branch: string;
      readonly tip?: string;
      readonly baseRef: string;
      readonly known?: KnownStood;
    }[];
    readonly base: string;
  };
  readonly trial: { readonly repo: string; readonly trials: readonly { readonly onto: string; readonly branch: string }[] };
  readonly status: { readonly repo: string; readonly tips: Readonly<Record<string, string>> };
  readonly land:
    | { readonly repo: string; readonly act: 'commit'; readonly message: string }
    | { readonly repo: string; readonly act: 'abort' };
  readonly inventory: { readonly repo: string; readonly under: string; readonly run: string; readonly base: string };
  readonly remove: { readonly repo: string; readonly workspaces: readonly string[]; readonly branches: readonly string[] };
  readonly export: { readonly repo: string; readonly tag: string; readonly into: string };
  readonly seal: { readonly tree: string };
};

/** A verb that gave no answer: which, the place's words on why it was not heard, and when, as an ISO time. */
export type Unread = { readonly verb: PlaceVerb; readonly said: string; readonly at: string };

/** A verb's outcome: its answer, the place's refusal in its own words, or unread. Unread is never a verdict: the verb is asked again. */
export type PlaceOutcome<V extends PlaceVerb> =
  | { readonly answer: PlaceAnswers[V] }
  | { readonly refused: string }
  | { readonly unread: Unread };

/** The keys of a place's `say`: the sentences the code prints that name a place's own commands, as templates with `{name}` holes. */
export const PLACE_SAYS = [
  'look',
  'readResult',
  'ship',
  'drop',
  'conflicts',
  'unlock',
  'stage',
  'attach',
  'commit',
  'inspect',
  'orphans',
  'results',
  'merge',
  'mergeUncommitted',
  'showMerge',
  'lastMerge',
] as const;

/** A key of a place's `say`. */
export type SayKey = (typeof PLACE_SAYS)[number];

/** The keys of `say` that are a list of lines, each line a template: the others are one line. */
export const SAY_LISTS = ['look', 'results'] as const;

/**
 * The holes the code fills in each `say` template: `look` the commit a step's work started from, `results` each result branch and the
 * base it lands on, `merge` and `mergeUncommitted` the commit a round merges in, `showMerge` and `lastMerge` none.
 */
export const SAY_HOLES: Readonly<Record<SayKey, readonly string[]>> = {
  look: ['baseRef'],
  readResult: ['repo', 'baseRef', 'branch'],
  ship: ['repo', 'branch'],
  drop: ['repo', 'branches'],
  conflicts: [],
  unlock: ['repo', 'path'],
  stage: ['repo', 'branches'],
  attach: ['path'],
  commit: ['path'],
  inspect: ['path'],
  orphans: [],
  results: ['base', 'branch'],
  merge: ['sha'],
  mergeUncommitted: ['sha'],
  showMerge: [],
  lastMerge: [],
};

/** What a place's `say` holds: each list key a list of templates, each other key one template. */
export type PlaceSay = { readonly [K in (typeof SAY_LISTS)[number]]: readonly string[] } & {
  readonly [K in Exclude<SayKey, (typeof SAY_LISTS)[number]>]: string;
};

/** What a place declares of itself: the tools a landing session is denied, and the sentences the code prints for it (`PlaceSay`). */
export type PlaceDeclared = {
  readonly denyWhileLanding: readonly string[];
  readonly say: PlaceSay;
};

/**
 * The holes `say` names that the code does not fill for their key (`SAY_HOLES`), each as `{ key, hole }` in the order of `PLACE_SAYS`:
 * such a hole would be printed as written. Empty when every one is filled. Pure.
 */
export function unknownHoles(say: PlaceSay): readonly { readonly key: SayKey; readonly hole: string }[] {
  return PLACE_SAYS.flatMap((key) => {
    const templates: readonly string[] = typeof say[key] === 'string' ? [say[key]] : say[key];
    const named = templates.flatMap((template) =>
      [...template.matchAll(/\{(\w+)\}/g)].flatMap(([, hole]) => (hole === undefined ? [] : [hole])),
    );
    return [...new Set(named)].filter((hole) => !SAY_HOLES[key].includes(hole)).map((hole) => ({ key, hole }));
  });
}

/** Why a `say` template of `file` names a hole the code does not fill for its key (`unknownHoles`), with the fix. Pure. */
export function unknownHoleRefusal(file: string, key: SayKey, hole: string): string {
  const allowed = SAY_HOLES[key].length ? SAY_HOLES[key].map((h) => `{${h}}`).join(', ') : 'no hole';
  return `${file}: \`say.${key}\` names {${hole}}, a hole the code does not fill: ${key} may name ${allowed}; write the rest as the place's own words`;
}

/**
 * The sections of a place skill's SKILL.md a brief sends a step to where it is handed no `say`: how to read what a step's work changed
 * (`read`), and how to merge the base into it when a person asks (`merge`).
 */
export const SKILL_SECTIONS = { read: 'Read what changed', merge: 'Merge the base when a person asks' } as const;

/** Where a brief sends a step for the place's own commands it was not handed: the section of its place skill named `section`. Pure. */
export const skillSaid = (section: keyof typeof SKILL_SECTIONS): string => `as your place's skill says under *${SKILL_SECTIONS[section]}*`;

/**
 * A `say` template of a place filled: each `{name}` hole `holes` names replaced by its value, and any other text — a hole it does not
 * name, a `<branch>` left for a person — as written. Pure.
 */
export const sayFilled = (template: string, holes: Readonly<Record<string, string>>): string =>
  template.replace(/\{(\w+)\}/g, (hole: string, name: string) => (Object.hasOwn(holes, name) ? holes[name] : undefined) ?? hole);

/** What a place verb said instead of answering: its refusal in its words, or why it was not heard. Pure. */
export const unansweredWords = (outcome: { readonly refused: string } | { readonly unread: Unread }): string =>
  'refused' in outcome ? outcome.refused : outcome.unread.said;
