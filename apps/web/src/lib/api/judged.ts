/**
 * What a run established, as the api judges it (apps/api/src/runs/judged.ts): where it stands, who it waits on, what it cost, what to
 * decide. Each type has its schema beside it, which `get` decodes the api's answer with.
 */
import { Schema } from 'effect';

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
export const StringsSchema = Schema.mutable(Schema.Array(Schema.String));

/**
 * Mirrors `PlaceKind` in agent-orchestrator's record/record.ts: the kind of workspace a run's steps work in — git's worktrees, or folders
 * the run makes.
 */
export type PlaceKind = 'git' | 'folder';

/** Decodes a `PlaceKind`. */
export const PlaceKindSchema = Schema.Literals(['git', 'folder']) satisfies Schema.Schema<PlaceKind>;

/** Mirrors `RunStatus` in apps/api/src/runs/judged.ts: where `assess` puts the run. */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Decodes a `RunStatus`. */
export const RunStatusSchema = Schema.Literals(['running', 'succeeded', 'failed', 'cancelled']) satisfies Schema.Schema<RunStatus>;

/** Mirrors `RunStoppedOn` in apps/api/src/runs/judged.ts: what stopped a `failed` run in which no step broke, as `wf decide` says it. */
export type RunStoppedOn = 'awaiting approval' | 'blocked';

/** Decodes a `RunStoppedOn`. */
export const RunStoppedOnSchema = Schema.Literals(['awaiting approval', 'blocked']) satisfies Schema.Schema<RunStoppedOn>;

/**
 * Mirrors `RunToDecide` in apps/api/src/runs/judged.ts: what a person has to decide about a run's result, the fifth reason a run waits on
 * one — `approve`, the gate on its last step, with `step`, `filed` whether it has run, and `says`, what it would do, the first line of the
 * step's own note (null where it has none, and for a gated step that has signed off, whose closeout is what to read); or `git`, result
 * branches ahead of the base that nothing in the workflow merges.
 *
 * On `approve`, `back` are the steps a send-back goes to (`sendBackTo`): the step itself once it has a task, the work an ending waits on
 * before it is filed; and `onto` the base branch the run's result is on its way to: what the Factory's card answers the gate with, off the
 * list.
 *
 * `said` is the whole of what `wf ls` prints after `→ to decide:`, and `command` the command at the end of it. The board runs neither.
 */
export type RunToDecide =
  | {
      kind: 'approve';
      step: string;
      says: string | null;
      filed: boolean;
      back: string[];
      onto: string | null;
      said: string;
      command: string;
    }
  | { kind: 'git'; branches: string[]; said: string; command: string };

/** Decodes a `RunToDecide`, either kind. */
export const RunToDecideSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('approve'),
    step: Schema.String,
    says: Schema.NullOr(Schema.String),
    filed: Schema.Boolean,
    back: StringsSchema,
    onto: Schema.NullOr(Schema.String),
    said: Schema.String,
    command: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('git'), branches: StringsSchema, said: Schema.String, command: Schema.String }),
]) satisfies Schema.Schema<RunToDecide>;

/**
 * Mirrors `Spent` in apps/api/src/runs/judged.ts: what sessions cost, as the package adds it up — the dollars of the attempts that ended
 * with a cost on them, how many did and how many ended with none — and `said`, its word for it: `$4.20`, or `≥$4.20` where an ended attempt
 * has no cost on it.
 */
export type Spent = { usd: number; measured: number; unmeasured: number; said: string };

/** Decodes a `Spent`. */
export const SpentSchema = Schema.Struct({
  usd: Schema.Number,
  measured: Schema.Number,
  unmeasured: Schema.Number,
  said: Schema.String,
}) satisfies Schema.Schema<Spent>;

/**
 * Mirrors `RunWaiting` in apps/api/src/runs/judged.ts: what a run started `--after` still waits on, in the package's words. `runs` are each
 * run not shipped, and why one never will without a person (`missing`, `cancelledAt`, `gone`); `word` is what `wf ls` prints on its roots —
 * `waiting on a-1x2y (cancelled)` — and `advice` the line `wf decide` prints under it; `onYou` whether a person has to act.
 */
export type RunWaiting = {
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/** Decodes a `RunWaiting`. */
export const RunWaitingSchema = Schema.Struct({
  runs: Schema.mutable(
    Schema.Array(
      Schema.Struct({ run: Schema.String, missing: Schema.Boolean, cancelledAt: Schema.NullOr(Schema.String), gone: StringsSchema }),
    ),
  ),
  word: Schema.String,
  advice: Schema.String,
  onYou: Schema.Boolean,
}) satisfies Schema.Schema<RunWaiting>;

/**
 * Mirrors `RunHolding` in apps/api/src/runs/judged.ts: a person's hold on a run (`wf hold <run> --until <run>`), in the package's words.
 * `at` is when it was put; `runs` each run it names that has not shipped, and why one never will without a person — or, in the moment every
 * one has shipped and the next tick has not yet lifted the hold, each of them `shipped`. `word` is what `wf ls` prints
 * (`held until a-1x2y ships`), `advice` the line `wf decide` prints under it, which names `wf hold <run> --off`; `onYou` whether only a
 * person's hand lifts it. While it stands no step waits on you and nothing is offered: every verb that would release work is refused.
 */
export type RunHolding = {
  at: string;
  runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[]; shipped: boolean }>;
  word: string;
  advice: string;
  onYou: boolean;
};

/** Decodes a `RunHolding`. */
export const RunHoldingSchema = Schema.Struct({
  at: Schema.String,
  runs: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        run: Schema.String,
        missing: Schema.Boolean,
        cancelledAt: Schema.NullOr(Schema.String),
        gone: StringsSchema,
        shipped: Schema.Boolean,
      }),
    ),
  ),
  word: Schema.String,
  advice: Schema.String,
  onYou: Schema.Boolean,
}) satisfies Schema.Schema<RunHolding>;

/**
 * Mirrors `StepNeeds` in apps/api/src/runs/judged.ts. `needs`: the closeout's, for a step whose current try signed off blocked.
 * `blockedByHarness`: whether the harness marked its session blocked while it gave no closeout — the engine's `needs-human`. `waitingFor`:
 * what that harness says the session waits for, in the package's words — `words` the wait, `advice` what a person does about it — null
 * where the harness said nothing, and on the list as on the detail, since it costs no read of its own. What that session said last is on a
 * run's detail alone (`lastLine`): the list reads no conversation. `approve`: what `wf ls` asks of you for a step waiting at its gate,
 * `approve plan`; null for any other step, and for one already sent back. `denied`: what the harness denied the step's current try, `calls`
 * each as a permission rule names it (`Skill(look)`) and `words` the line `wf ls` says (`denied: Skill(look), Bash(pytest)`); null for a
 * step denied nothing, and for one whose harness cannot say.
 */
export type StepNeeds = {
  needs: string | null;
  blockedByHarness: boolean;
  waitingFor: { words: string; advice: string } | null;
  approve: string | null;
  denied: { words: string; calls: string[] } | null;
};

/** The fields of a `StepNeeds`, for the schema of a step that carries them to take in with its own (`RunSummarySchema` in runs.ts). */
export const StepNeedsFields = {
  needs: Schema.NullOr(Schema.String),
  blockedByHarness: Schema.Boolean,
  waitingFor: Schema.NullOr(Schema.Struct({ words: Schema.String, advice: Schema.String })),
  approve: Schema.NullOr(Schema.String),
  denied: Schema.NullOr(Schema.Struct({ words: Schema.String, calls: StringsSchema })),
};
