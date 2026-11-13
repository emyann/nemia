/**
 * The closed words the objects carry: each list a field of an object is one of, said once here and read by the Schemas beside it
 * (`run.ts`). Plain tuples of strings, importing nothing, each with its union beside it. Every other layer but the runtime imports a list
 * or its union from the `objects` entry rather than spelling it again; the one exception is a tuple in a file the orchestrator's pure
 * entries load, which cannot load `objects` at run time: `wordsHeld` holds each such tuple equal to these at compile time, both ways
 * (`packages/agent-orchestrator/src/object/run.model.ts`), so a word added on one side alone fails the typecheck.
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
 * A run's state in the list, each run in exactly one: `waiting`, it waits on a person, though something of it may still move;
 * `inFlight`, something of it moves, or it is running and waits on nobody; `finished`, every other run. What a RunList's
 * `?fieldSelector=status.state…` selects by.
 */
export const RUN_STATES = ['waiting', 'inFlight', 'finished'] as const;

/** One of `RUN_STATES`. */
export type RunState = (typeof RUN_STATES)[number];

/**
 * How a finished run ended: `cancelled`, a person called it off; `undecided`, its work is done and nobody has decided its result;
 * `succeeded`; or `failed`, every other end.
 */
export const RUN_OUTCOMES = ['succeeded', 'failed', 'cancelled', 'undecided'] as const;

/** One of `RUN_OUTCOMES`. */
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

/**
 * What a step or a run waits on when the wait is a thing's, not a person's (reason `Waiting`): other runs (`run`), the limit on runs in
 * flight (`limit`), the base branch the run lands on, while another run lands there (`base`), the store's pause (`pause`), or a person's
 * hold that names no run, which a person alone lifts (`hold`).
 */
export const WAIT_ON = ['run', 'limit', 'base', 'pause', 'hold'] as const;

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

/** One of `RUN_STATUSES`. */
export type RunStatusWord = (typeof RUN_STATUSES)[number];

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

/** One of `STEP_STATUSES`. */
export type StepStatusWord = (typeof STEP_STATUSES)[number];

/** How a try is taken: continuing the session, in a fresh one, or running the check again. */
export const RETRY_MODES = ['continue', 'fresh', 'recheck'] as const;

/** One of `RETRY_MODES`. */
export type RetryMode = (typeof RETRY_MODES)[number];

/** Where a task stands on the clock. */
export const SPAN_AT = ['unknown', 'queued', 'starting', 'running', 'ended', 'unspawned'] as const;

/** One of `SPAN_AT`. */
export type SpanAt = (typeof SPAN_AT)[number];

/** How a raise of a step's cap is asked for: with a try, or with a round. */
export const RAISE_BY = ['retry', 'round'] as const;

/** One of `RAISE_BY`. */
export type RaiseBy = (typeof RAISE_BY)[number];

/** How a step signed off, in its closeout. */
export const OUTCOMES = ['done', 'blocked'] as const;

/** One of `OUTCOMES`. */
export type Outcome = (typeof OUTCOMES)[number];

/** How an attempt ended. */
export const ENGINE_OUTCOMES = ['succeeded', 'failed', 'stopped'] as const;

/** One of `ENGINE_OUTCOMES`. */
export type EngineOutcome = (typeof ENGINE_OUTCOMES)[number];

/** Why an attempt ended. */
export const ATTEMPT_ENDS = ['harness', 'lost', 'unstartable', 'operator', 'deadline', 'budget', 'unsigned'] as const;

/** One of `ATTEMPT_ENDS`. */
export type AttemptEnd = (typeof ATTEMPT_ENDS)[number];

/** The last event of a session before a person's words went to it, by its kind. */
export const SAID_AFTER = ['text', 'thinking', 'tool_use', 'tool_result', 'system'] as const;

/** One of `SAID_AFTER`. */
export type SaidAfter = (typeof SAID_AFTER)[number];

/** Where a session's peak stands against its step's cap. */
export const PEAK_MARKS = ['cap', 'large'] as const;

/** One of `PEAK_MARKS`. */
export type PeakMark = (typeof PEAK_MARKS)[number];

/**
 * Where the mode a try's session ran in came from, beside what it was filed with: the mode filed, its harness's default where none was,
 * or its harness, which ran it in another mode than the one filed.
 */
export const RUNS_IN_BY = ['filed', 'default', 'harness'] as const;

/** One of `RUNS_IN_BY`. */
export type RunsInBy = (typeof RUNS_IN_BY)[number];

/** What the board does with a file a closeout named: shows it as an image, as text, or links it. */
export const ARTIFACT_KINDS = ['image', 'text', 'other'] as const;

/** One of `ARTIFACT_KINDS`. */
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** How a step was handed a run's section of its task: waited for, or read. */
export const HANDED_HOW = ['waited', 'read'] as const;

/** One of `HANDED_HOW`. */
export type HandedHow = (typeof HANDED_HOW)[number];

/** Where a step's told layers were given: its prompt, or its brief. */
export const TOLD_VIA = ['prompt', 'brief'] as const;

/** One of `TOLD_VIA`. */
export type ToldVia = (typeof TOLD_VIA)[number];

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

/**
 * The runtime's task phases, as Nemia's level says her session's (`NemiaLevel.phase`): the closed set a task's view stands in, held
 * equal to the runtime's `TaskPhase` by the orchestrator's typecheck (`runtime-client.ts`).
 */
export const ENGINE_PHASES = [
  'pending',
  'starting',
  'working',
  'quiescent',
  'needs-human',
  'input-required',
  'idle',
  'restarting',
  'between-attempts',
  'ending',
  'succeeded',
  'failed',
  'stopped',
] as const;

/** One of `ENGINE_PHASES`. */
export type EnginePhase = (typeof ENGINE_PHASES)[number];

/** The answers a rule at a gate may give unasked: a step approved at its gate, and a step tried again. */
export const RULE_ANSWERS = ['approve', 'retry'] as const;

/** One of `RULE_ANSWERS`. */
export type RuleAnswer = (typeof RULE_ANSWERS)[number];

/** Where a rule for auto came from: the builtin default, or an agent's proposal the person confirmed. */
export const RULE_ORIGINS = ['default', 'proposed'] as const;

/** One of `RULE_ORIGINS`. */
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

/** How many of the steps at their gate an agent's rules in force could ever approve unasked: every one, some, or none. */
export const POLICY_REACHES = ['all', 'some', 'none'] as const;

/** One of `POLICY_REACHES`. */
export type PolicyReachWord = (typeof POLICY_REACHES)[number];

/** Why a condition can never hold at a gate: the step is approved before it runs, or it has no check to pass. */
export const NEVER_HOLDS = ['approved-before-it-runs', 'no-check'] as const;

/** One of `NEVER_HOLDS`. */
export type NeverHolds = (typeof NEVER_HOLDS)[number];

/** Who a message of a chat is from: the task's agent, the person, the keeper's quiet marker, or another agent the person allowed. */
export const CHAT_FROM = ['agent', 'person', 'keeper', 'peer'] as const;

/** One of `CHAT_FROM`. */
export type ChatFrom = (typeof CHAT_FROM)[number];

/** Where a tool call of a chat stands: done, at work, failed, not begun, or waiting on the person. */
export const CALL_STATES = ['done', 'running', 'error', 'pending', 'waits'] as const;

/** One of `CALL_STATES`. */
export type CallState = (typeof CALL_STATES)[number];

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
 * (`factory`, the folder a factory made from a template keeps in the store), the repository (`repo`), your library (`yours`),
 * or what Nemia builds in (`builtin`).
 */
export const DEFINITION_ORIGINS = ['factory', 'repo', 'yours', 'builtin'] as const;

/** One of `DEFINITION_ORIGINS`. */
export type DefinitionOrigin = (typeof DEFINITION_ORIGINS)[number];

/** Where an agent file the store knows of was found: a repository a factory names, your library, or the folder `?path=` names. */
export const AGENT_SOURCE_PLACES = ['repository', 'library', 'path'] as const;

/** One of `AGENT_SOURCE_PLACES`. */
export type AgentSourcePlace = (typeof AGENT_SOURCE_PLACES)[number];

/** What a node of a workflow's graph is: a step, a condition that routes, or a node that files a card for another workflow. */
export const NODE_KINDS = ['step', 'condition', 'workflow'] as const;

/** One of `NODE_KINDS`. */
export type NodeKind = (typeof NODE_KINDS)[number];

/** What an edge of a workflow's graph says: a wait (`after`), an input handed on, a loop back, or a condition's route. */
export const EDGE_KINDS = ['after', 'input', 'loop', 'route'] as const;

/** One of `EDGE_KINDS`. */
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** How a refused write's definition changes instead: through the `default` namespace, or the factory's own way. */
export const WRITE_WAYS = ['default', 'factory'] as const;

/** One of `WRITE_WAYS`. */
export type WriteWay = (typeof WRITE_WAYS)[number];

/** Where a gate's budgets come from: the gated step's proposal, before the approval; the approval's caps, after it. */
export const GATE_BUDGETS_FROM = ['proposed', 'approved'] as const;

/** One of `GATE_BUDGETS_FROM`. */
export type GateBudgetsFrom = (typeof GATE_BUDGETS_FROM)[number];

/**
 * The reasons an Event is served under: the feed's codes, in its table's order (`REASONS`, agent-orchestrator's `src/feed/reason.ts`),
 * `Unknown` among them, the word a line whose reason this `nemia` does not know is served as.
 */
export const EVENT_REASONS = [
  'Running',
  'Succeeded',
  'Failed',
  'Cancelled',
  'AwaitingApproval',
  'AwaitingAnswer',
  'AwaitingRound',
  'Removed',
  'Pending',
  'Waiting',
  'Checking',
  'CheckPassed',
  'CheckFailed',
  'Denied',
  'BudgetExhausted',
  'OverBudget',
  'Stopped',
  'Skipped',
  'Sent',
  'Paused',
  'Unsigned',
  'UnreadableCloseout',
  'ToolDenied',
  'Approved',
  'CancelAsked',
  'HoldPut',
  'HoldLifted',
  'SpawnFailed',
  'SessionLost',
  'ClosedOut',
  'RevisionsBehind',
  'Unknown',
  'DaemonStarted',
  'StorePaused',
  'StoreResumed',
  'LevelChanged',
  'NotReady',
  'Ready',
  'ConflictsPending',
  'ConflictsSettled',
  'LeftEnded',
] as const;

/** One of `EVENT_REASONS`. */
export type EventReason = (typeof EVENT_REASONS)[number];

/** What an Event is about: a run, one of its steps, a daemon that took the store, the store itself, or a factory. */
export const INVOLVED_KINDS = ['Run', 'Step', 'Daemon', 'Store', 'Factory'] as const;

/** One of `INVOLVED_KINDS`. */
export type InvolvedKind = (typeof INVOLVED_KINDS)[number];

/** How serious an Event is, as Kubernetes types one: routine news, or something gone wrong. */
export const EVENT_TYPES = ['Normal', 'Warning'] as const;

/** One of `EVENT_TYPES`. */
export type EventType = (typeof EVENT_TYPES)[number];

/** Whose deed an Event is: the tick's judgement, the runtime's journal, a person's verb, or a daemon that took the store. */
export const EVENT_SOURCES = ['tick', 'runtime', 'person', 'daemon'] as const;

/** One of `EVENT_SOURCES`. */
export type EventSource = (typeof EVENT_SOURCES)[number];

/** Who an Event waits on, where it waits on someone: a person. */
export const EVENT_WAITS = ['person'] as const;

/** One of `EVENT_WAITS`. */
export type EventWaits = (typeof EVENT_WAITS)[number];

/** The type of a value a template's parameter takes when the template is applied. */
export const TEMPLATE_PARAMETER_TYPES = ['string', 'number', 'boolean'] as const;

/** One of `TEMPLATE_PARAMETER_TYPES`. */
export type TemplateParameterType = (typeof TEMPLATE_PARAMETER_TYPES)[number];

/**
 * What a watch of a list says, in Kubernetes' words: an object it holds that the watcher was not sent (`ADDED`), one sent that changed
 * (`MODIFIED`), one sent that it no longer holds (`DELETED`), and a mark that every change up to a `resourceVersion` was sent
 * (`BOOKMARK`), the first of which ends the initial state.
 */
export const WATCH_EVENT_TYPES = ['ADDED', 'MODIFIED', 'DELETED', 'BOOKMARK'] as const;

/** One of `WATCH_EVENT_TYPES`. */
export type WatchEventType = (typeof WATCH_EVENT_TYPES)[number];

/** What a resource of the api can be asked, in Kubernetes' words, as discovery says them (`APIResource`). */
export const RESOURCE_VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'] as const;

/** One of `RESOURCE_VERBS`. */
export type ResourceVerb = (typeof RESOURCE_VERBS)[number];

/**
 * Where a proposal stands: waiting on an approval, approved and not yet applied (at its run's end, or a write in flight), applied as a
 * new revision, declined by the person, stale (an object moved since it was read), dropped (its run called off), or failed midway.
 */
export const PROPOSAL_PHASES = ['waiting', 'approved', 'applied', 'declined', 'stale', 'dropped', 'failed'] as const;

/** One of `PROPOSAL_PHASES`. */
export type ProposalPhase = (typeof PROPOSAL_PHASES)[number];

/** When an approved proposal applies: at approval, or at the successful end of the run that proposed it. */
export const APPLY_AT = ['approval', 'run-end'] as const;

/** One of `APPLY_AT`. */
export type ApplyAt = (typeof APPLY_AT)[number];

/** What a proposal does to one object, Kubernetes' verbs for a write: makes it, writes it, or removes it. */
export const CHANGE_VERBS = ['create', 'update', 'delete'] as const;

/** One of `CHANGE_VERBS`. */
export type ChangeVerb = (typeof CHANGE_VERBS)[number];

/** What one change does to access, as the machinery computes it: reaches further, reaches less, or leaves it as it was. */
export const ACCESS_CHANGES = ['widens', 'narrows', 'same'] as const;

/** One of `ACCESS_CHANGES`. */
export type AccessChange = (typeof ACCESS_CHANGES)[number];

/** Who calls the api: the person (no session's token), or an agent's session the store started. */
export const CALLER_KINDS = ['person', 'agent'] as const;

/** One of `CALLER_KINDS`. */
export type CallerKind = (typeof CALLER_KINDS)[number];

/** Who approved a proposal: the person, or an agent under a rule the person confirmed. */
export const APPROVED_BY = ['person', 'rule'] as const;

/** One of `APPROVED_BY`. */
export type ApprovedBy = (typeof APPROVED_BY)[number];

/** The kinds a proposal carries: a factory's definitions and wiring, never the person's settings. */
export const PROPOSABLE_KINDS = ['Workflow', 'Agent', 'Skill', 'Hire', 'McpServer', 'Factory'] as const;

/** One of `PROPOSABLE_KINDS`. */
export type ProposableKind = (typeof PROPOSABLE_KINDS)[number];

/**
 * Why a call on a proposal is refused where the caller may not make it (a 403): an approval refused (`proposalApproval`), a proposal in
 * another factory than the caller's (`mayPropose`), or a write only the person makes (a delegation, a decline).
 */
export const PROPOSAL_REFUSALS = [
  'not-waiting',
  'other-factory',
  'own-agent',
  'not-auto',
  'not-delegated',
  'no-rule',
  'person-only',
] as const;

/** One of `PROPOSAL_REFUSALS`. */
export type ProposalRefusal = (typeof PROPOSAL_REFUSALS)[number];

/**
 * Why the api's write guard refuses a write before its body is read (a 403, `Forbidden`'s `reason`): addressed to a name that is not this
 * machine (`host`), or made by a page on another site (`site`). A body not sent as JSON is the 415's, which needs no word.
 */
export const GUARD_REFUSALS = ['host', 'site'] as const;

/** One of `GUARD_REFUSALS`. */
export type GuardRefusal = (typeof GUARD_REFUSALS)[number];

/**
 * The types a `Table`'s column says its cells are, as Kubernetes' server-side printing names them (`meta.k8s.io/v1`
 * `TableColumnDefinition.type`, the OpenAPI types).
 */
export const TABLE_COLUMN_TYPES = ['string', 'integer', 'number', 'boolean', 'date'] as const;

/** One of `TABLE_COLUMN_TYPES`. */
export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

/** Why a presented session token is refused (a 401): the store never minted it, or its session's try is no longer live. */
export const TOKEN_REFUSALS = ['unknown-token', 'session-ended', 'token-required', 'person-token-required'] as const;

/** One of `TOKEN_REFUSALS`. */
export type TokenRefusal = (typeof TOKEN_REFUSALS)[number];

/** The kinds the api serves as objects, each with its object Schema, its `<Kind>List` and its get endpoint here. */
export const KINDS = [
  'Run',
  'Card',
  'Factory',
  'McpServer',
  'Schedule',
  'Hire',
  'Volume',
  'Workflow',
  'Agent',
  'Skill',
  'Template',
  'Subscription',
  'Event',
  'Proposal',
  'Delegation',
] as const;
export type Kind = (typeof KINDS)[number];

/**
 * The states of a task's lifecycle, the runtime's (`STATES`, agent-runtime's lifecycle.ts), in its table's order: what a step's path says
 * a task was in at each entry of its journal. Held equal to the runtime's by the api's step reads' test.
 */
export const LIFECYCLE_STATES = [
  'submitted',
  'starting',
  'working',
  'input-required',
  'stopping',
  'ending',
  'completed',
  'failed',
  'canceled',
] as const;

/** One of `LIFECYCLE_STATES`. */
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/** Who said an event of a session's conversation (`TranscriptEvent['role']`, agent-runtime's seam.ts): a tool's result is `user`. */
export const TRANSCRIPT_ROLES = ['assistant', 'user', 'system'] as const;

/** One of `TRANSCRIPT_ROLES`. */
export type TranscriptRole = (typeof TRANSCRIPT_ROLES)[number];

/**
 * Where a `user` event's words came from, as the harness said it: the runtime's `ORIGIN_KINDS` (agent-runtime's seam.ts, the Agent SDK's
 * words) and `unknown`, which the runtime reads a word it has not named as (`originOf`).
 */
export const TRANSCRIPT_ORIGINS = [
  'human',
  'channel',
  'peer',
  'task-notification',
  'coordinator',
  'unclassified',
  'observer',
  'auto-continuation',
  'observer-activity',
  'unknown',
] as const;

/** One of `TRANSCRIPT_ORIGINS`. */
export type TranscriptOrigin = (typeof TRANSCRIPT_ORIGINS)[number];

/**
 * The label of a command `nemia decide` offers on a run awaiting a person (`DecideCommand`, decide.ts): land it, drop it, read it, once
 * more, refresh, approve, send back, forget it.
 */
export const DECIDE_LABELS = ['land it', 'drop it', 'read it', 'once more', 'refresh', 'approve', 'send back', 'forget it'] as const;
export type DecideLabel = (typeof DECIDE_LABELS)[number];

/** Which of its three the lesson line of a decision is (`Lesson`, decide.ts): written where the next agent reads, nothing, or not known. */
export const LESSON_STATES = ['written', 'nothing', 'unknown'] as const;
export type LessonState = (typeof LESSON_STATES)[number];

/** What still finishes under a pause: a step's session, its check, or a landing. */
export const FINISHING_KINDS = ['session', 'check', 'landing'] as const;
export type FinishingKind = (typeof FINISHING_KINDS)[number];

/** What a pause at once cuts: a step's session or its check, never a landing. */
export const INTERRUPT_KINDS = ['session', 'check'] as const;
export type InterruptKind = (typeof INTERRUPT_KINDS)[number];

/** The kind of a metric of the process, in Effect's own words for it. */
export const METRIC_TYPES = ['Counter', 'Frequency', 'Gauge', 'Histogram', 'Summary'] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

/** Where the store's daemon stands: none, a file that does not read, stopped, gone, stalled, or `ticking`, the one moving the runs. */
export const DAEMON_KINDS = ['none', 'unreadable', 'stopped', 'gone', 'stalled', 'ticking'] as const;
export type DaemonKind = (typeof DAEMON_KINDS)[number];

/** What the api's process table says of the daemon's pid: the same process, another, not known, or gone. */
export const DAEMON_IDENTITIES = ['same', 'other', 'unknown', 'gone'] as const;
export type DaemonIdentity = (typeof DAEMON_IDENTITIES)[number];

/** Where the subscription's quota stands as the board is given it, each said in `Quota`'s note. */
export const QUOTA_STATES = ['fresh', 'asking', 'no-plan', 'unanswered', 'no-claude', 'timeout', 'failed', 'unknown'] as const;
export type QuotaState = (typeof QUOTA_STATES)[number];

/** The ranges the system's series are read over, and the span of a point in each. */
export const SERIES_RANGES = ['24h', '7d', '30d', 'all'] as const;
export type SeriesRange = (typeof SERIES_RANGES)[number];
export const SERIES_SPANS = ['minute', 'hour', 'day'] as const;
export type SeriesSpan = (typeof SERIES_SPANS)[number];

/** What the flow numbers' rows go by. */
export const STATS_BY = ['agent', 'step', 'factory', 'workflow', 'repo'] as const;
export type StatsBy = (typeof STATS_BY)[number];

/**
 * The events of the feed's stream: `opened`, the first, sent the moment it opens so a proxy hands its head on, which every reader skips; a
 * line's, by what it is about (`store`, `daemon`, `factory`, `step`, `removed`, `run`); where it has read to (`bookmark`); a label query's
 * hint (`hint`); and a read that failed and the read after it (`unreadable`, `readable`).
 */
export const FEED_STREAM_EVENTS = [
  'opened',
  'store',
  'daemon',
  'factory',
  'step',
  'removed',
  'run',
  'bookmark',
  'hint',
  'unreadable',
  'readable',
] as const;
export type FeedStreamEventName = (typeof FEED_STREAM_EVENTS)[number];

/**
 * The name of the board's cookie that holds one of the person's tokens: set HttpOnly by `POST /api/session` from a token the person
 * pasted, sent by the browser on every request of the board's, and read by the api as the request's token where it presents no bearer.
 */
export const TOKEN_COOKIE = 'nemia-token';

/** What `POST /api/session` and `DELETE /api/session` did to the board's cookie: set it, or cleared it. */
export const SESSION_COOKIE_STATES = ['set', 'cleared'] as const;

/** One of `SESSION_COOKIE_STATES`. */
export type SessionCookieState = (typeof SESSION_COOKIE_STATES)[number];

/**
 * What a need's check said of it (`needStateOf`, agent-orchestrator's src/needs/needs.ts): exit 0 is `met`, any other exit `missing`,
 * and a check that did not answer in its time, or whose shell did not start, `unknown` — never missing, so it holds no run.
 */
export const NEED_STATES = ['met', 'missing', 'unknown'] as const;

/** One of `NEED_STATES`. */
export type NeedState = (typeof NEED_STATES)[number];

/**
 * A piece of the readiness read's state: a need's (`NEED_STATES`), or `inactive`, a harness nobody activated and nothing runs on — no
 * factory's workflow names it and it is not the default — shown with what activates it, and never counted against `ready`.
 */
export const READINESS_STATES = [...NEED_STATES, 'inactive'] as const;

/** One of `READINESS_STATES`. */
export type ReadinessState = (typeof READINESS_STATES)[number];

/**
 * The kinds of address a bind is told as (`addressKind`, agent-orchestrator's src/service/address.ts): this machine alone, every
 * interface, a private network's (RFC 1918), a carrier-grade or Tailscale network's (100.64.0.0/10), a link's own, an IPv6 private
 * network's (fc00::/7), and any other.
 */
export const ADDRESS_KINDS = ['loopback', 'wildcard', 'private', 'shared', 'link-local', 'unique-local', 'public'] as const;

/** One of `ADDRESS_KINDS`. */
export type AddressKind = (typeof ADDRESS_KINDS)[number];

/**
 * The areas of the readiness read, each piece in one: a harness's install and sign-in, the service and its linger, the bind, the machine
 * (cgroup v2, `systemd --user`, the tools folder on PATH), a place's need (the git identity), a workflow's need, a factory's repository's
 * need (its toolchain), the factories, the release, and the client's own pieces a laptop adds (its context reaches the server, the
 * server takes its token).
 */
export const READINESS_AREAS = [
  'harness',
  'service',
  'bind',
  'machine',
  'place',
  'workflow',
  'repository',
  'factory',
  'release',
  'client',
] as const;

/** One of `READINESS_AREAS`. */
export type ReadinessArea = (typeof READINESS_AREAS)[number];

/**
 * What a missing piece of the readiness read costs, which the piece declares (`cost`): a run waits on it (`run`: a harness not signed
 * in, a place's or a workflow's need, no factory, a server the client cannot reach), which makes the server not ready and raises the
 * board's banner; or it is advised, no run waiting on it, listed with its fix and raising no banner — it keeps the server up, open or
 * current (`server`: the service, its linger, the bind), or it is the client's own comfort (`client`: `nemia` on PATH).
 */
export const READINESS_COSTS = ['run', 'server', 'client'] as const;

/** One of `READINESS_COSTS`. */
export type ReadinessCost = (typeof READINESS_COSTS)[number];

/**
 * Where a fix stands, as the runtime's task that runs it says: filed and not yet started (`pending`), running, or ended — `succeeded`
 * on exit 0, `failed` on any other end.
 */
export const FIX_PHASES = ['pending', 'running', 'succeeded', 'failed'] as const;

/** One of `FIX_PHASES`. */
export type FixPhase = (typeof FIX_PHASES)[number];

/** One event of a fix's output stream: `output`, a chunk of what it printed; `ended`, its end, with its phase. */
export const FIX_STREAM_EVENTS = ['output', 'ended'] as const;

/** One of `FIX_STREAM_EVENTS`. */
export type FixStreamEventName = (typeof FIX_STREAM_EVENTS)[number];

/**
 * Where an upgrade started from the board or the MCP port stands (`Upgrade.phase`), as the runtime's task that runs `nemia upgrade <tag>`
 * says: filed and not yet started (`pending`, waiting for a slot), running, or ended — `succeeded` on exit 0, `failed` on any other end,
 * the pointer `releases/current` left where it was.
 */
export const UPGRADE_PHASES = ['pending', 'running', 'succeeded', 'failed'] as const;

/** One of `UPGRADE_PHASES`. */
export type UpgradePhase = (typeof UPGRADE_PHASES)[number];

/** One event of an upgrade's output stream: `output`, a chunk of what it printed; `ended`, its end, its data the `Upgrade` as JSON. */
export const UPGRADE_STREAM_EVENTS = ['output', 'ended'] as const;

/** One of `UPGRADE_STREAM_EVENTS`. */
export type UpgradeStreamEventName = (typeof UPGRADE_STREAM_EVENTS)[number];

/**
 * What a need's fix is (`NeedFix.kind`): one the server runs to put the need in place (`puts`, a fix that says no kind); one a person
 * types on the server, since it asks them for what a fix task cannot read, a code pasted back (`typed`); and one that takes a met need
 * away, a harness deactivated (`removes`), refused while an unfinished run needs it.
 */
export const FIX_KINDS = ['puts', 'typed', 'removes'] as const;

/** One of `FIX_KINDS`. */
export type FixKind = (typeof FIX_KINDS)[number];

/**
 * Where a need's check and fix run (`Need.scope`): once on the machine (`machine`, a need that says no scope), or in each factory's
 * repository (`repository`, its toolchain), read and fixed per factory.
 */
export const NEED_SCOPES = ['machine', 'repository'] as const;

/** One of `NEED_SCOPES`. */
export type NeedScope = (typeof NEED_SCOPES)[number];

/** Which of a harness's two needs a readiness piece is (`ReadinessPiece.harness.part`): its program installed, or its sign-in. */
export const HARNESS_PARTS = ['install', 'sign-in'] as const;

/** One of `HARNESS_PARTS`. */
export type HarnessPart = (typeof HARNESS_PARTS)[number];

/**
 * Where a ticket stands (`ticketState`, agent-orchestrator's src/pairing/ticket.ts) — a pairing, or a first-visit link: waiting on the
 * person's approval, claimable, claimed for good, or past its time unclaimed.
 */
export const TICKET_STATES = ['waiting', 'claimable', 'claimed', 'expired'] as const;

/** One of `TICKET_STATES`. */
export type TicketState = (typeof TICKET_STATES)[number];

/**
 * The shape of a read the api serves (`ReadBound`, reads.ts): a list's page, a read from a cursor, a whole read by part, one object, a
 * stream, a file's bytes.
 */
export const READ_SHAPES = ['page', 'cursor', 'part', 'one', 'stream', 'bytes'] as const;
