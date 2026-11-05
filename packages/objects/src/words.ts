/**
 * The closed words the objects carry: each list a field of an object is one of, said once here and read by the Schemas beside it
 * (`run.ts`). Plain tuples of strings, importing nothing. The orchestrator holds its own unions and its pure files' tuples equal to these
 * at compile time, both ways (`packages/agent-orchestrator/src/object/run.model.ts`): a word added on one side alone fails the typecheck.
 *
 * `nemia/v1` is additions only: a word is never renamed or dropped under it, and a word added is one an older reader refuses, so it is a
 * change of the version (`packages/objects/CLAUDE.md`).
 */

/**
 * Where a step is in its life: not yet at work (`pending`), at work or its check running (`running`), waiting on a person (`waiting`),
 * done (`succeeded`), broken (`failed`), or stopped by an operator or a cancel (`stopped`).
 */
export const STEP_PHASES = ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped'] as const;

/** One of `STEP_PHASES`. */
export type StepPhase = (typeof STEP_PHASES)[number];

/** Where a run is in its life: a step's phases, and `cancelled` for a run a person called off. */
export const RUN_PHASES = [...STEP_PHASES, 'cancelled'] as const;

/** One of `RUN_PHASES`. */
export type RunPhase = (typeof RUN_PHASES)[number];

/**
 * What a step or a run waits on when the wait is a thing's, not a person's (reason `Waiting`): other runs (`run`), the limit on runs in
 * flight (`limit`), the base branch the run lands on, while another run lands there (`base`), or the store's pause (`pause`).
 */
export const WAIT_ON = ['run', 'limit', 'base', 'pause'] as const;

/** One of `WAIT_ON`. */
export type WaitOn = (typeof WAIT_ON)[number];

/** Where a person is asked for an answer (reason `AwaitingAnswer`): by the session itself (`session`), or by the closeout (`closeout`). */
export const ANSWER_VIA = ['session', 'closeout'] as const;

/** One of `ANSWER_VIA`. */
export type AnswerVia = (typeof ANSWER_VIA)[number];

/** The reasons a step can stand in: the feed's codes of a step that are a word it keeps. */
export const STEP_REASONS = [
  'Pending',
  'Waiting',
  'Running',
  'Checking',
  'Paused',
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'Denied',
  'Succeeded',
  'CheckPassed',
  'Failed',
  'CheckFailed',
  'UnreadableCloseout',
  'Stopped',
  'Skipped',
  'Sent',
  'Unknown',
] as const;

/** One of `STEP_REASONS`. */
export type StepReason = (typeof STEP_REASONS)[number];

/** The reasons a run can stand in. */
export const RUN_REASONS = [
  'Running',
  'Waiting',
  'Succeeded',
  'Failed',
  'Cancelled',
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'OverBudget',
  'BudgetExhausted',
  'Unsigned',
  'Denied',
] as const;

/** One of `RUN_REASONS`. */
export type RunReason = (typeof RUN_REASONS)[number];

/** What a check's verdict can be: `passed`, `failed`, `unfinished` (no verdict on the work), `running`, or `unknown`. */
export const CHECK_RESULTS = ['passed', 'failed', 'unfinished', 'running', 'unknown'] as const;

/** One of `CHECK_RESULTS`. */
export type CheckResult = (typeof CHECK_RESULTS)[number];

/** The kinds of place a run's steps work in, as a step's `place:` says them: a repository (`git`), or a folder. */
export const PLACE_KINDS = ['git', 'folder'] as const;

/** One of `PLACE_KINDS`. */
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Why a try was moved behind the one that replaced it: the run's word, a person's mode, a round, a merge, a sending back. */
export const TRY_CAUSES = ['retries', 'signoff', 'continue', 'fresh', 'recheck', 'round', 'merge', 'back'] as const;

/** One of `TRY_CAUSES`. */
export type TryCause = (typeof TRY_CAUSES)[number];

/** The kinds a run resolves and a revision is kept for: its workflow folder, each step's agent, each skill, and the factory's rules. */
export const REVISION_KINDS = ['workflow', 'agent', 'skill', 'rules'] as const;

/** One of `REVISION_KINDS`. */
export type RevisionKind = (typeof REVISION_KINDS)[number];

/** A run's word, as `nemia ls` says it. */
export const RUN_STATUSES = ['running', 'succeeded', 'failed', 'cancelled', 'awaiting approval', 'waiting'] as const;

/** A step's word, as `nemia ls` says it. */
export const STEP_STATUSES = [
  'pending',
  'running',
  'blocked',
  'unsigned',
  'checking',
  'verified',
  'unverified',
  'awaiting approval',
  'exhausted',
  'over budget',
  'budget exhausted',
  'denied',
  'failed (check)',
  'failed',
  'stopped',
  'skipped',
  'sent',
] as const;

/** How a try is taken: continuing the session, in a fresh one, or running the check again. */
export const RETRY_MODES = ['continue', 'fresh', 'recheck'] as const;

/** Where a task stands on the clock. */
export const SPAN_AT = ['unknown', 'queued', 'starting', 'running', 'ended', 'unspawned'] as const;

/** How a raise of a step's cap is asked for: with a try, or with a round. */
export const RAISE_BY = ['retry', 'round'] as const;

/** How a step signed off, in its closeout. */
export const OUTCOMES = ['done', 'blocked'] as const;

/** How an attempt ended. */
export const ENGINE_OUTCOMES = ['succeeded', 'failed', 'stopped'] as const;

/** Why an attempt ended. */
export const ATTEMPT_ENDS = ['harness', 'lost', 'unstartable', 'operator', 'deadline', 'budget', 'unsigned'] as const;

/** The last event of a session before a person's words went to it, by its kind. */
export const SAID_AFTER = ['text', 'thinking', 'tool_use', 'tool_result', 'system'] as const;

/** Where a session's peak stands against its step's cap. */
export const PEAK_MARKS = ['cap', 'large'] as const;

/** Where the way a try's session runs came from: what it was filed with, the default, or its tools. */
export const RUNS_IN_BY = ['filed', 'default', 'tools'] as const;

/** What the board does with a file a closeout named: shows it as an image, as text, or links it. */
export const ARTIFACT_KINDS = ['image', 'text', 'other'] as const;

/** How a step was handed a run's section of its task: waited for, or read. */
export const HANDED_HOW = ['waited', 'read'] as const;

/** Where a step's told layers were given: its prompt, or its brief. */
export const TOLD_VIA = ['prompt', 'brief'] as const;

/** The conditions the controller says of a templated factory: whether its base holds the template, and whether an upgrade waits. */
export const FACTORY_CONDITION_TYPES = ['Applied', 'ConflictsPending'] as const;

/** One of `FACTORY_CONDITION_TYPES`. */
export type FactoryConditionType = (typeof FACTORY_CONDITION_TYPES)[number];

/** Why a factory's condition is what it is, one word each, as the controller writes them. */
export const FACTORY_CONDITION_REASONS = [
  'NoUpgrade',
  'TemplateInvalid',
  'VersionDrift',
  'Rendered',
  'ParamsChanged',
  'ContentChanged',
  'VersionUnknown',
  'Upgraded',
  'Merged',
  'UpgradePending',
  'Conflicts',
] as const;

/** One of `FACTORY_CONDITION_REASONS`. */
export type FactoryConditionReason = (typeof FACTORY_CONDITION_REASONS)[number];

/** Whether a factory's condition holds, as Kubernetes words it. */
export const FACTORY_CONDITION_STATUSES = ['True', 'False'] as const;

/** One of `FACTORY_CONDITION_STATUSES`. */
export type ConditionStatus = (typeof FACTORY_CONDITION_STATUSES)[number];

/** What an MCP server's header value is served as: never a value a header is sent with. Sent back, it keeps the stored value. */
export const HEADER_MASK = '********';

/** Where a step's agent came from: its own file's `agent:`, the factory's hire, neither, or both, which a start refuses. */
export const FILL_ORIGINS = ['step', 'factory', 'unfilled', 'refused'] as const;

/** One of `FILL_ORIGINS`. */
export type FillOrigin = (typeof FILL_ORIGINS)[number];

/** Where a setting a session gets came from: the step's own file, its agent's file, or neither, the harness's own default. */
export const SETTING_ORIGINS = ['step', 'agent', 'default'] as const;

/** One of `SETTING_ORIGINS`. */
export type SettingOrigin = (typeof SETTING_ORIGINS)[number];

/** The levels a factory runs at, the least left to Nemia first: a person starts every run, some start themselves, or all do. */
export const LEVELS = ['manual', 'semi-auto', 'auto'] as const;

/** One of `LEVELS`. */
export type Level = (typeof LEVELS)[number];

/** Whether a factory's runs follow the revisions merged since they started (`follow`) or keep those they started on (`pinned`). */
export const REVISIONS_POLICIES = ['follow', 'pinned'] as const;

/** One of `REVISIONS_POLICIES`. */
export type RevisionsPolicy = (typeof REVISIONS_POLICIES)[number];

/** How an MCP server is reached over its url: streamable HTTP, or server-sent events. */
export const MCP_TRANSPORTS = ['http', 'sse'] as const;

/** One of `MCP_TRANSPORTS`. */
export type McpTransport = (typeof MCP_TRANSPORTS)[number];

/** The state of an MCP server as its harness reports it, the runtime's own words carried whole. */
export const MCP_STATES = ['connected', 'needs-auth', 'failed', 'pending', 'disabled'] as const;

/** One of `MCP_STATES`. */
export type McpState = (typeof MCP_STATES)[number];

/** Where an MCP server's sign-in stands: none asked, one waiting on the person, or how the last one ended. */
export const SIGN_IN_STATES = ['none', 'waiting', 'connected', 'expired', 'failed'] as const;

/** One of `SIGN_IN_STATES`. */
export type SignInStateWord = (typeof SIGN_IN_STATES)[number];

/**
 * Where a definition — a Workflow, an Agent, a Skill — is read from, in the order a factory looks a name up: the factory's own tree
 * (`factory`, the folder a factory made from a template keeps in the store), the repository's checkout (`repo`), your library (`yours`),
 * or what Nemia builds in (`builtin`).
 */
export const DEFINITION_ORIGINS = ['factory', 'repo', 'yours', 'builtin'] as const;

/** One of `DEFINITION_ORIGINS`. */
export type DefinitionOrigin = (typeof DEFINITION_ORIGINS)[number];

/** What a node of a workflow's graph is: a step, a condition that routes, or a node that files a card for another workflow. */
export const NODE_KINDS = ['step', 'condition', 'workflow'] as const;

/** One of `NODE_KINDS`. */
export type NodeKind = (typeof NODE_KINDS)[number];

/** What an edge of a workflow's graph says: a wait (`after`), an input handed on, a loop back, or a condition's route. */
export const EDGE_KINDS = ['after', 'input', 'loop', 'route'] as const;

/** One of `EDGE_KINDS`. */
export type EdgeKind = (typeof EDGE_KINDS)[number];
