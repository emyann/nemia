/**
 * The package's root: what `agent-orchestrator` exports, each name re-exported by name from the file that holds it, and nothing else here.
 *
 * The runtime is reached through one client, `runtime-client.ts`, the only file that imports `agent-runtime`: it creates the runtime
 * (`engine()`, `HARNESSES`) and names its types. Its words come through its pure door, `agent-runtime/vocabulary`, which any file imports:
 * `HARNESS_CHOICES`, the words each harness takes per key, is re-exported from there. The controllers are a verb each, in its feature's
 * folder, and each imports the client, or a controller that does, never the runtime: `views.verb.ts` (what the runtime's views of a run's
 * tasks say), `start.verb.ts`, `plan.verb.ts` and `inbox.verb.ts` (starting runs, plans and inbox cards), `tick.verb.ts` and
 * `advance.verb.ts` (a pass — `tickRun`, `advanceRun` — and the filings it adopts), what a person asks of a run (`cancel.verb.ts`,
 * `retry.verb.ts`, `gate.verb.ts`, `say.verb.ts`, `wait.verb.ts`, `round.verb.ts`), the table of the commands that call them, each defined
 * once (`commands.verb.ts`), `forget.verb.ts` and `prune.verb.ts` (`nemia rm` and `nemia prune`), `list.verb.ts` and `decide.verb.ts`
 * (what a person reads of a run: `nemia ls` and `nemia decide`), `stats.verb.ts` (what the store's runs add up to: `nemia stats`), and
 * `chat.verb.ts` (a chat with a long-lived task, read and written). They import one way — views and starting beneath the tick, the tick
 * beneath the rest — so no cycle forms among them (`test/boundary.test.ts`).
 *
 * What of the I/O never names the engine sits beneath the controllers, and this file re-exports what it exported of them:
 * `record.store.ts` (a run's id, its files' names, a step's check stderr, artifacts and inputs), `files.store.ts` (the run store a run's
 * record, a person's files beside it and the inbox's are read and written through, `runStore`, and the inbox's folder, `inboxDir`),
 * `daemon.store.ts` (`tick.json` and who ticks the store), `feed.store.ts` (the feed's file), `worktree.store.ts` (git, a step's worktree,
 * its `node_modules`, the hand-off commit), `branches.store.ts` (what git says of a run's result branches), `artifacts.store.ts` (the
 * files a step hands over), `folder.store.ts` and `write.store.ts` (a workflow folder read and written), `agents/read.store.ts` and
 * `skills/read.store.ts` (the agents and the skills a folder's steps may name, read), `lookup.store.ts` (the workflow folders a place
 * holds), `agents.store.ts`, `roster.store.ts`, `fills.store.ts`, `try.store.ts`, `custom.store.ts` and `skills.store.ts` (an agent, the
 * agents of both places read, the steps each fills, an agent's try folder written, a person's custom instructions for one, and a skill
 * read and written), `place.store.ts` (a place skill's verbs run and heard), `plan.store.ts` (a plan folder read), `inbox.store.ts` (the
 * inbox's cards filed, queued and dropped), `factory.store.ts` (the factories, `factoriesDir`), `config.store.ts` (the `WF_` environment)
 * and `telemetry.store.ts` (what a daemon's process logs and exports, `telemetryLayer`). They import neither the runtime nor a controller,
 * and load as a tree: the bottom, beneath `record.store.ts`, beneath `worktree.store.ts` and `write.store.ts`, beneath the rest, so no
 * cycle can form (`test/boundary.test.ts`).
 */
export { attemptVerdict, verdictWord } from './check/check.ts';
export { VERSION } from './version/version.ts';
export { leaseRelease, trialRefusal, type Running } from './release/release.ts';
export { currentRelease } from './release/release.store.ts';
export { runningRelease } from './release/version.verb.ts';
export { Conflict, Invalid, isRefusal, Missing } from './refusal/refusal.ts';
export { maxConcurrent, maxRuns, verifiesRest, wfRoot } from './config/config.store.ts';
export type { Refusal } from './refusal/refusal.ts';
export {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  branchesToRead,
  countsLine,
  inFullLines,
  lessonLine,
  parseGlobs,
  touchedLines,
} from './branches/index.ts';
export { LARGE_CONTEXT, budgetWord, dollars, peakMark, readWords, rebuiltCache, sumUsage, usedLines } from './status/status.ts';
export { isRepositoryRun, placeOf } from './run.ts';
export { answerIn, deniedWords, harnessWaitLine, waitingWords } from './run.ts';
/**
 * The name the engine gives a task's session, which is the name `claude agents` lists it under: what a person is told to look for when
 * their step's session waits on them (`harnessWaitLine`). Re-exported because the api cannot import agent-runtime — it is not a
 * dependency of it — and the runtime client (`runtime-client.ts`) is the only file in the workspace that knows the engine exists.
 */
export { nameFor } from './runtime-client.ts';
/**
 * The runtime's task lifecycle as plain data — its states, its edges, its first and final states — which the board draws. Re-exported
 * because the api cannot import agent-runtime, as `nameFor` is.
 */
export { lifecycleGraph, type LifecycleGraph } from './runtime-client.ts';
/**
 * What a harness says of its subscription's limits, as the engine's `quota` answers it: the limits, each with its use and its reset, or
 * why there are none. Re-exported because the api cannot import agent-runtime, as `nameFor` is.
 */
export type { HarnessQuota, QuotaLimit } from './runtime-client.ts';
/**
 * Why one task's journal does not read, when `err` is what a read of it rejected with; undefined for any other failure
 * (`unreadableJournal`).
 */
export { unreadableJournal } from './runtime-client.ts';
export {
  filesPrunedWords,
  pruneLines,
  prunedBytes,
  prunedKept,
  prunedRefusal,
  prunedWords,
  pruneRefusal,
  pruningBytes,
  sizeOf,
} from './run.ts';
export type { Pruned, PrunedFiles, PruneFacts, Pruning } from './run.ts';
export { BY_CAP, heldRefusal, holdAdvice, holdRefusal, holdsOf, holdWord, oneLine, WHY_CAP } from './run.ts';
export type { Hold } from './run.ts';
export {
  acceptAsk,
  acceptanceOf,
  acceptedLines,
  approvalOf,
  approvalRefusal,
  approvalWordsRefusal,
  approvedFirst,
  artifactLines,
  branchWord,
  checkoutLine,
  checkoutWord,
  endingSteps,
  firstLine,
  merges,
  ownNote,
  resultSteps,
  sendBackTo,
  toDecideWords,
  budgetRefusal,
  roundBudgetRefusal,
  ceilingLines,
  forgetLine,
  idRefusal,
  costLine,
  slotWord,
  durationWord,
  fromNote,
  gateRefusal,
  gatesOf,
  hasGate,
  inputsNote,
  onYouWords,
  namesInOrder,
  owedFields,
  roundDueNote,
  runCostLines,
  runSpend,
  saidLines,
  spentWord,
  stepSpend,
  taskSpend,
  tryNote,
  waitAdvice,
  waitWord,
} from './run.ts';
export { envelopeRefusals, outputLines } from './closeout/index.ts';
export { answersOr, askedQuestions, questionLines } from './question/index.ts';
export { dueNote, messageRefusal, signoffsSpent } from './retry/index.ts';
export { atWork, firstFiledAt, runStartedAt, runTokens, timeline, timelineLines, timelineTotalLines } from './timeline/index.ts';
export type { FolderRun, RepositoryRun, PlaceKind } from './run.ts';
export type {
  Acceptance,
  Approval,
  AskName,
  BranchFate,
  BranchStanding,
  ToDecide,
  CloseoutAsked,
  ForgetHow,
  Forgot,
  ParentCloseout,
  ParentRun,
  ParentStep,
  Raise,
  Round,
  RoundAsk,
  RunSlot,
  Said,
  SaidTo,
  Shipped,
  Spend,
  SpendOf,
  TaskSpend,
  Wait,
} from './run.ts';
export type { AtWork, RunTokens, SlotWait, TaskSpan, Timeline, TimelineTotal, TimelineTry } from './timeline/index.ts';
export type { Retry, RetryAsk, RetryHow, RetryMode } from './retry/index.ts';
export {
  agentUsers,
  formerKeyLines,
  loadWorkflows,
  workflowDescription,
  workflowFolder,
  workflowReadme,
  workflowsIn,
} from './folder/folder.store.ts';
export { cardSkills, isShippedPlace, lookupRoots, oneFolder, preloads, skillsFor, skillVersion } from './skills/read.store.ts';
export type { Places } from './skills/read.store.ts';
export { agentsFor, agentVersion, customInstructionsFile, loadAgents, readCustomInstructions } from './agents/read.store.ts';
export { clearCustomInstructions, customInstructionsFor, writeCustomInstructions } from './agents/custom.store.ts';
export { cardToStart, planLines, planStopped } from './plan/plan.ts';
export type { Card, Planned } from './plan/plan.ts';
export {
  INBOX_KEY_MEANINGS,
  INBOX_KEYS,
  ignoredRepoLine,
  inboxLines,
  inboxNameRefusal,
  noCardLine,
  parseInboxCard,
  queueLine,
  queueOrder,
  workflowAt,
} from './inbox/index.ts';
export type { InboxCard, InboxListing, QueueStarted, QueueTry } from './inbox/index.ts';
export {
  DEFAULT_FACTORY,
  factoryLines,
  factoryNameRefusal,
  factoryRepo,
  writersOf,
  fillsOf,
  hireRefusal,
  hireRefusalOf,
  noFactoryLine,
  outsideRefusal,
  unattachedRefusal,
  unfilledRefusal,
} from './factory/factory.ts';
export type {
  Factory,
  FactoryCondition,
  FactoryListing,
  FactoryTemplate,
  Hires,
  InstructionAt,
  Schedule,
  TemplateStatus,
} from './factory/factory.ts';
export { feedLineWords, REMOVED } from './feed/index.ts';
export type { FeedLine, FeedPublished } from './feed/index.ts';
export type { FeedSaid, FeedWords } from './run.ts';
export { BOOKMARK_EVERY, bookmarkLine, DEFAULT_SELECTORS, subscriptionNameRefusal, watchedLine } from './subscription/index.ts';
export {
  LABEL_KEYS,
  labelKeysRefusal,
  parseSelectors,
  RESERVED_KEYS,
  selectableOf,
  SELECTABLE_KEYS,
  SELECTOR_FORM,
  selectorsRefusal,
  selects,
} from './watch/selector.ts';
export type { Clause, Selectors } from './watch/selector.ts';
export type { Watched } from './subscription/index.ts';
export {
  DAEMON_FILE,
  DEFAULT_EVERY_MS,
  MAX_EVERY_MS,
  STALE_FLOOR_MS,
  STALE_PASSES,
  daemonLine,
  everyOf,
  holderOf,
  holderWords,
  livenessLine,
  livenessWords,
  staleAfterMs,
  START_WORDS,
  takenFromLine,
  takeoverLine,
} from './daemon/daemon.ts';
export type { DaemonFile, DaemonStanding, HolderKind, Identity, Liveness } from './daemon/daemon.ts';
export {
  HOME,
  acceptFile,
  approvalFile,
  artifactsDir,
  askFile,
  inputsDir,
  readAcceptances,
  readApprovals,
  roundAskFile,
  runId,
  stepsOf,
} from './record/record.store.ts';
export { inboxDir, keptRuns, runStore } from './record/files.store.ts';
export type { RunStore } from './record/record.ts';
export {
  alive,
  beat,
  ceilings,
  daemonFile,
  daemonStanding,
  identify,
  lastCeilings,
  lastPassCost,
  parseDaemonFile,
  passed,
  procStartOf,
  releaseStore,
  stillHeld,
  storeRefusal,
  takeStore,
} from './daemon/daemon.store.ts';
export type { TakenStore } from './daemon/daemon.store.ts';
export { holdUrl, runMain, up } from './daemon/up.verb.ts';
export type { UpOptions } from './daemon/up.verb.ts';
export { ensureDaemon, liveDemandHost } from './demand/demand.verb.ts';
export type { DemandHost } from './demand/demand.verb.ts';
export { telemetryLayer } from './telemetry/telemetry.store.ts';
export { addPass, breakdownLines, heaviest, PHASES, STATS_EVERY_MS, summaryDue, summaryLine } from './meter/index.ts';
export type {
  HarnessCost,
  Interval,
  PassBucket,
  PassCost,
  PassCostRead,
  PassesRead,
  PassPart,
  PassSummary,
  Phase,
  PhaseCost,
  RecentPass,
} from './meter/index.ts';
export { feedCursorRefusal, feedFile, freshFeedMemo, readFeed, readFeedEnds, watchFeed } from './feed/feed.store.ts';
export { cursorFileStart, cutCursorFile, keepCursor } from './watch/cursor.store.ts';
export { emitFeed, FEED_FOLLOW_BEATS, FEED_FOLLOW_READS, FEED_FOLLOWERS, FeedHub, feedHubLayer, followFeed } from './feed/feed.verb.ts';
export { followStep } from './following/following.verb.ts';
export type { StepMoment } from './following/following.ts';
export type { Followed } from './feed/feed.verb.ts';
export { lockfileParts, provisionDeps } from './workspace/worktree.store.ts';
export { artifactFiles, missingArtifacts } from './artifacts/artifacts.store.ts';
export { lackLines } from './artifacts/artifacts.ts';
export { lackedOf } from './record/record.ts';
export { branchStandings, parentRecord, resultBranches, type BranchReader } from './branches/branches.store.ts';
export { passStanding, standingLive, standingLiveOf, standingReader, standingSnapshot, standingWhen } from './standing/standing.verb.ts';
export { changesOf, type BranchChanges, type Note } from './branches/changes.store.ts';
export { evictedBy } from './rest/rest.ts';
export { removeAgent, writeAgent } from './agents/agents.store.ts';
export { copySkill, givenSkills, skillDirIn, skillFolders, skillRead, skillText, writeSkill } from './skills/skills.store.ts';
export { PlaceService, type Place } from './place/place.store.ts';
export { gitPlaceLayer, shipped, shippedGitPlace } from './place/shipped.store.ts';
export { briefNow } from './tick/told.verb.ts';
export type {
  BranchStood,
  ChangedFile,
  Changes,
  HandedOff,
  Held,
  Inventory,
  Landed,
  Made,
  Opened,
  PlaceAnswers,
  PlaceDeclared,
  PlaceOutcome,
  PlaceRequests,
  PlaceVerb,
  Removed,
  Standing,
  Status,
  TrialMerge,
  Unread,
} from './place/place.ts';
export { writeWorkflow } from './folder/write.store.ts';
export { workflowStale, workflowTaken } from './folder/folder.ts';
export { workflowVersion } from './folder/version.store.ts';
export { foldersIn } from './folder/lookup.store.ts';
export type { AgentSchema, AgentSidecar, AgentWritten } from './agents/agents.store.ts';
export { agentPlaces, agentRead, agentSkillsFound, findAgent, listAgents, type Readings } from './roster/roster.store.ts';
export { agentFileOf, factoriesFilling, stepsFilled } from './roster/fills.store.ts';
export { inFactory } from './roster/roster.ts';
export { TRY_STEP, triesDir, tryDir, tryFolder, writeTryFolder } from './try/try.store.ts';
export { skillCopyCommand, untriedOf, yourAgentsDir, type Untried } from './try/try.ts';
export { repoWriteRefusal } from './yours/yours.ts';
export type { AgentCopiedFrom, AgentFill, AgentPlace, AgentReading, AgentsRead, AgentUser, CardRead, FilledStep } from './roster/roster.ts';
export type { AgentSource, AgentSourcePlace } from './sources/sources.ts';
export type { GivenRead, SkillChange, SkillCopied, SkillRead, SkillWritten } from './skills/skills.store.ts';
export type { WorkflowWritten } from './folder/write.store.ts';
export { addToInbox, dropFromInbox, inboxNameAt, queueInInbox, readInbox } from './inbox/inbox.store.ts';
export type { InboxDropped, InboxQueued } from './inbox/inbox.store.ts';
export {
  addFactory,
  attachWorkflow,
  defaultStartsAllowed,
  detachWorkflow,
  factoriesDir,
  fireAgent,
  hireAgent,
  readFactories,
  readFactory,
  clearSchedule,
  removeFactory,
  setInstruction,
  setSchedule,
  startFactory,
  templatedTree,
} from './factory/factory.store.ts';
export type { ScheduleListed } from './schedule/schedule.ts';
export type { PlaceTrust, Untrusted } from './trust/trust.ts';
export { EngineService, HARNESSES, asked, engine, remoteAgents, runWith } from './runtime-client.ts';
export { HARNESS_CHOICES } from 'agent-runtime/vocabulary';
export { A2A_AGENTS_FILE, envNameOf } from './harness/a2a.store.ts';
export {
  bridgeOf,
  closeoutAsked,
  closeoutOf,
  closeoutReader,
  consumption,
  deniedOf,
  exitVerdicts,
  harnessBlocked,
  parentRead,
  parentsRead,
  filingsRead,
  taskPhasesRead,
  saidCount,
  spendReader,
  viewedOnce,
  unjudgedWord,
  waitingOf,
} from './views/views.verb.ts';
export { endWords, phaseOfView, wordOfView } from './views/views-words.ts';
export type { Bridge, CheckReport } from './views/views.verb.ts';
export { readPlan } from './plan/plan.store.ts';
export { leftOutMounts, repoFor, startRun } from './start/start.verb.ts';
export { startFromInbox, startQueued } from './inbox/inbox.verb.ts';
export { startPlan } from './plan/plan.verb.ts';
export type { InboxStart, InboxStarted } from './inbox/inbox.verb.ts';
export type { PlanStarted } from './plan/plan.verb.ts';
export { advanceRun } from './tick/advance.verb.ts';
export { refusalLines, tickRun } from './tick/tick.verb.ts';
export { checkoutHold } from './ending/ending.verb.ts';
export { runSlots, type Slots, slotsOf } from './cap/cap.verb.ts';
export type { MergeWord, StandingMerge } from './branches/index.ts';
export type { Collision, Collisions } from './collide/collide.ts';
export type { FolderLoaded } from './folder/workflows.verb.ts';
export type { SkillPage } from './skills/skills.verb.ts';
export type { Advanced } from './tick/advance.verb.ts';
export type { Pass } from './tick/tick.verb.ts';
export { acceptRun, roundRun } from './round/round.verb.ts';
export { mergeRun } from './merge/merge.verb.ts';
export { approveRun } from './gate/gate.verb.ts';
export { askedNow } from './question/asked.verb.ts';
export { cancelRun } from './cancel/cancel.verb.ts';
export { hold, unhold } from './wait/wait.verb.ts';
export {
  finishingWords,
  heldLines,
  heldWords,
  pausedLines,
  pausedWords,
  pauseWords,
  RESUMED,
  stagedWords,
  type Finishing,
  type Interrupt,
  type Pause,
  type Paused,
  type PausedNow,
  type PauseHeld,
  type PauseStaged,
} from './pause/pause.ts';
export { readPause } from './pause/pause.store.ts';
export { retryRun } from './retry/retry.verb.ts';
export { sayRun } from './say/say.verb.ts';
export { COMMANDS, TABLE } from './command/commands.verb.ts';
export { admitted } from './admission/admit.verb.ts';
export { PRUNE, RM } from './command/runs.verb.ts';
export { LOGS, STATS } from './command/reads.verb.ts';
export { START } from './start/commands.verb.ts';
export { INBOX, INBOX_ADD, INBOX_QUEUE } from './inbox/commands.verb.ts';
export { FACTORY } from './factory/factory.verb.ts';
export { FACTORY_INSTRUCT, FACTORY_INSTRUCTION, factoryInstruction } from './factory/instruction.verb.ts';
export { FACTORY_RULES, factoryRules } from './rules/rules.verb.ts';
export type { FactoryRules } from './rules/rules.verb.ts';
export type { FactoryInstruction } from './factory/instruction.verb.ts';
export { AGENTS_CUSTOM } from './agents/custom.verb.ts';
export { AUTO_PROPOSE } from './auto/auto.verb.ts';
export type { Command, Ran } from './command/entry.verb.ts';
export { CLI, CLI_VERBS, commandBreaks, commandLine, generated, helpOf, leftOut, parseArgv, routeList } from './command/command.ts';
export type { Args, CommandSpec, Flag, Positional, Route, Spec } from './command/command.ts';
export type { Accepted, RoundAsked } from './round/round.verb.ts';
export type { Approved } from './gate/gate.verb.ts';
export type { Asked } from './retry/retry.verb.ts';
export type { Cancelled } from './cancel/cancel.verb.ts';
export type { Holding } from './wait/wait.verb.ts';
export type { Told } from './say/say.verb.ts';
export { forgetRun, runsForgetting } from './forget/forget.verb.ts';
export { freeingMany, judgingMany, prune, type Listed, type Turned } from './prune/prune.verb.ts';
export { decideRun } from './decide/decide.verb.ts';
export { freshStatsMemo, statsRun } from './stats/stats.verb.ts';
export type { StatsMemo, StatsOptions } from './stats/stats.verb.ts';
export { seriesMemo } from './series/series.ts';
export type { Health, SeriesMemo, SeriesPoint, SeriesRead } from './series/series.ts';
export { BY_KEYS, statsLine, statsLines, statsQueryOf } from './stats/index.ts';
export type { ByKey, QueryKey, Stats, StatsQuery } from './stats/index.ts';
export { list, pausedRead, runReading, unjudgedOf } from './list/list.verb.ts';
export type { ReadingHow, RunReading } from './list/list.verb.ts';
export type { Answered, Decided } from './decide/decide.verb.ts';
export type { DecideCommand } from './decide/decide.ts';
export type { RunsListed, Unjudged } from './list/list.ts';
export { graphOf, runGraph } from './summary/graph.ts';
export type { GraphEdge, RunGraph } from './summary/graph.ts';
export {
  bare,
  filedTimes,
  judgedSteps,
  judgedUnlessUnreadable,
  seenBy,
  stepNames,
  tryOf,
  unreadableOf,
  viewsFor,
  viewsOf,
  workflowsOf,
} from './summary/reads.verb.ts';
export type { Filings, TaskView, Unreadable, Views } from './summary/reads.verb.ts';
export { holdingOf, judge, needsOf, runWaitingOf, spentOf, standingsOf, wordOf } from './summary/judged.verb.ts';
export type { GitAsked, JudgeHow, RunHolding, RunStatus, RunToDecide, RunWaiting, Spent, StepNeeds } from './summary/judged.verb.ts';
export { restingMemo, restingRead } from './rest/resting.verb.ts';
export type { RestingMemo, RestingRead } from './rest/resting.verb.ts';
export { recordMemo } from './rest/kept.ts';
export type { RecordMemo } from './rest/kept.ts';
export type { ScheduleRuns } from './factory/factory.verb.ts';
export type { PauseRuns } from './pause/pause.verb.ts';
export type { InboxRuns } from './inbox/inbox.store.ts';
export { judgedNow, runsSummarized } from './summary/summary.verb.ts';
export type { RunSummary, SummaryHow } from './summary/summary.verb.ts';
export type { FinishedPage, FinishedRun, ListedRun, OpenRuns, RunClock, RunOutcome, StepCost, WaitingRun } from './runlist/runlist.verb.ts';
export { driftWords, kindsDrift, revisionNow, REVISION_KINDS, stepsDrift } from './revisions/revisions.ts';
export type { Drift, KindName, Pin, Revision, RevisionKind } from './revisions/revisions.ts';
export { ledgerOf, topsOf } from './revisions/revisions.store.ts';
export { chatHistory, chatRead, chatSend, chatSince } from './chat/chat.verb.ts';
export type { ChatChanges, ChatHistory, ChatPlace, ChatReads } from './chat/chat.verb.ts';
export type { ChatEvent, ChatFrom, Presence, StepState } from './chat/chat.ts';
export { nemiaChatPlace } from './nemia/level.store.ts';
