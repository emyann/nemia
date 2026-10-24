/**
 * The board's copies of the api's answers, held equal to them by the compiler: each mirror under `src/lib/api/` against the api's own type,
 * both ways (`Same`), read by the web's typecheck. The api is imported for its types alone, which node strips, so the board's `src` still
 * imports nothing out of `apps/web`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import type * as Board from '../src/lib/api.ts';
import { Schema } from 'effect';
import { decodes, type Holds, type Same } from '../src/lib/api/decodes.ts';
import { get, UnreadAnswer } from '../src/lib/api/read.ts';
import { StepTrySchema, type StepTry as BoardTry } from '../src/lib/api/tries.ts';
import type * as agents from '../../api/src/agents/agents.ts';
import type * as answers from '../../api/src/asks/answers.ts';
import type * as app from '../../api/src/app.ts';
import type * as artifacts from '../../api/src/steps/artifacts.ts';
import type * as builder from '../../api/src/workflows/builder.ts';
import type * as capabilities from '../../api/src/capabilities/capabilities.ts';
import type * as ceilings from '../../api/src/factory/ceilings.ts';
import type * as chat from '../../api/src/nemia/chat.ts';
import type * as custom from '../../api/src/custom/custom.ts';
import type * as daemon from '../../api/src/factory/daemon.ts';
import type * as decision from '../../api/src/decide/decision.ts';
import type * as detail from '../../api/src/detail/detail.ts';
import type * as factories from '../../api/src/factories/factories.ts';
import type * as inbox from '../../api/src/inbox/inbox.ts';
import type * as instruction from '../../api/src/factories/instruction.ts';
import type * as logs from '../../api/src/steps/logs.ts';
import type * as machines from '../../api/src/machines/machines.ts';
import type * as nemia from '../../api/src/nemia/nemia.ts';
import type * as path from '../../api/src/steps/path.ts';
import type * as pause from '../../api/src/factory/pause.ts';
import type * as quota from '../../api/src/factory/quota.ts';
import type * as reach from '../../api/src/capabilities/reach.ts';
import type * as rules from '../../api/src/factories/rules.ts';
import type * as runs from '../../api/src/runs/runs.ts';
import type * as servers from '../../api/src/servers/servers.ts';
import type * as skills from '../../api/src/agents/skills.ts';
import type * as step from '../../api/src/step/step.ts';
import type * as steps from '../../api/src/steps/steps.ts';
import type * as told from '../../api/src/detail/told.ts';
import type * as tries from '../../api/src/detail/tries.ts';
import type * as usage from '../../api/src/detail/usage.ts';
import type * as words from '../../api/src/workflows/words.ts';
import type * as workflows from '../../api/src/workflows/workflows.ts';
import type * as yours from '../../api/src/workflows/yours.ts';

/** A step of a run's page, as the api answers it. */
type Step = runs.RunPage['steps'][number];
type SaidHeld = Omit<Step['said'][number], 'after'> & { after: NonNullable<Step['said'][number]['after']> | null };
type RadiusOf = Extract<decision.Touched['radius'], { changes: unknown }>;
type ChatEventOf = chat.ChatHistoryAnswer['events'][number];
type AskOf = Extract<ChatEventOf, { kind: 'question' }>;
type ServerOf = Omit<servers.FactoryServersRead['servers'][number], 'state'> & { state: string | null };
/**
 * `T` with each literal widened to its kind, for a value the api types by its literals that the board reads as words: a table the api
 * writes `as const`, or a machine's states and events, which the board draws and never branches on.
 */
type Widened<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer E)[]
        ? Widened<E>[]
        : { [K in keyof T]: Widened<T[K]> };
type PausedOf = Awaited<ReturnType<typeof pause.pauseOf>>;

/**
 * The fixtures of `Same`: it refuses `any`, an optional key for a required one, a widened literal and a key left out, and takes
 * `readonly`.
 */
// @ts-expect-error -- `any` is never the same as anything.
export type RefusesAny = Holds<Same<any, { a: string }>>;
// @ts-expect-error -- an optional key is not a required one.
export type RefusesOptional = Holds<Same<{ a?: string }, { a: string }>>;
// @ts-expect-error -- a literal widened to a string.
export type RefusesWidened = Holds<Same<{ a: 'x' | 'y' }, { a: string }>>;
// @ts-expect-error -- a key left out.
export type RefusesDropped = Holds<Same<{ a: string }, { a: string; b: number }>>;
// @ts-expect-error -- an optional key left out.
export type RefusesDroppedOptional = Holds<Same<{ a: string }, { a: string; b?: number }>>;
export type TakesReadonly = Holds<Same<{ a: readonly string[] }, { a: string[] }>>;

export type WorkflowPageAddress = Holds<Same<Board.WorkflowPageAddress, step.WorkflowPageAddress>>;

export type AgentUser = Holds<Same<Board.AgentUser, agents.AgentUser>>;
/** The board shows no agent's copy of another, so it reads no `copied`. */
export type AgentListing = Holds<Same<Board.AgentListing, Omit<agents.AgentListing, 'copied'>>>;
/** As `AgentListing`; and the Agents page lists no step an agent fills: the factories it fills one in are what it shows. */
export type LibraryAgent = Holds<Same<Board.LibraryAgent, Omit<agents.LibraryAgent, 'copied' | 'fills'>>>;
/** As `AgentListing`. */
export type AgentSaved = Holds<Same<Board.AgentSaved, Omit<agents.AgentSaved, 'agent'> & { agent: Omit<agents.AgentListing, 'copied'> }>>;
export type AgentTried = Holds<Same<Board.AgentTried, agents.AgentTried>>;
export type CustomInstructions = Holds<Same<Board.CustomInstructions, custom.CustomInstructionsAnswer>>;
export type CustomInstructionsCleared = Holds<Same<Board.CustomInstructionsCleared, custom.CustomInstructionsCleared>>;
export type AgentRoleKey = Holds<Same<Board.AgentRoleKey, keyof agents.AgentListing['keys']>>;

/**
 * Held open: the api may leave `after` out, and the board refuses that; `firstAfter` (lib/transcript.ts) reads a null mark only, so
 * taking an absent one changes the session page, not only the mirror.
 */
export type Said = Holds<Same<Board.Said, SaidHeld>>;
export type QuestionAnswer = Holds<Same<Board.QuestionAnswer, answers.Answer>>;

export type AutoList = Holds<Same<Board.AutoList, nemia.AutoAnswer>>;
export type AutoRule = Holds<Same<Board.AutoRule, nemia.AutoAnswer['rules'][number]>>;
export type Condition = Holds<Same<Board.Condition, nemia.AutoAnswer['rules'][number]['when'][number]>>;

export type Bridge = Holds<Same<Board.Bridge, NonNullable<detail.StepFiled['bridge']>>>;

export type KeyKind = Holds<Same<Board.KeyKind, words.KeyKind>>;
export type KeyField = Holds<Same<Board.KeyField, builder.KeyField>>;
export type KeyForm = Holds<Same<Board.KeyForm, builder.KeyForm>>;

export type Described = Holds<Same<Board.Described, capabilities.Described>>;
export type McpServer = Holds<Same<Board.McpServer, capabilities.McpServer>>;
export type StepReach = Holds<Same<Board.StepReach, reach.StepReach>>;
/** The two tables are dated data the api types `as const`; the board reads their words. */
export type MeasuredTools = Holds<Same<Board.MeasuredTools, Widened<typeof capabilities.MEASURED_TOOLS>>>;
export type ReadOnlyCommands = Holds<Same<Board.ReadOnlyCommands, Widened<typeof capabilities.READ_ONLY_COMMANDS>>>;
export type Capabilities = Holds<
  Same<
    Board.Capabilities,
    Omit<reach.CapabilitiesWithSteps, 'measured' | 'readOnly'> & {
      measured: Widened<reach.CapabilitiesWithSteps['measured']>;
      readOnly: Widened<reach.CapabilitiesWithSteps['readOnly']>;
    }
  >
>;

export type Ceilings = Holds<Same<Board.Ceilings, ceilings.Ceilings>>;
export type PassCost = Holds<Same<Board.PassCost, NonNullable<ceilings.Ceilings['pass']>>>;

export type ChatHistory = Holds<Same<Board.ChatHistory, chat.ChatHistoryAnswer>>;
export type ChatEvent = Holds<Same<Board.ChatEvent, ChatEventOf>>;
export type ChatPresence = Holds<Same<Board.ChatPresence, chat.ChatHistoryAnswer['presence']>>;
export type ChatFrom = Holds<Same<Board.ChatFrom, Extract<ChatEventOf, { kind: 'message' }>['from']>>;
export type ChatStepState = Holds<Same<Board.ChatStepState, Extract<ChatEventOf, { kind: 'step' }>['state']>>;
export type AskQuestion = Holds<Same<Board.AskQuestion, AskOf['questions'][number]>>;
export type AskOption = Holds<Same<Board.AskOption, AskOf['questions'][number]['options'][number]>>;
export type AskPick = Holds<Same<Board.AskPick, chat.ChatAnswerBody['picks'][number]>>;
export type ChatSent = Holds<Same<Board.ChatSent, chat.ChatSentAnswer>>;
export type ChatAnswer = Holds<Same<Board.ChatAnswer, chat.ChatAnswerAnswer>>;
export type ChatStop = Holds<Same<Board.ChatStop, chat.ChatStopAnswer>>;
export type ChatReadMark = Holds<Same<Board.ChatReadMark, chat.ChatReadAnswer>>;

/** The holder's kind is drawn as the api names it: one of its words is a command, which the board never spells (structure.test.ts). */
export type Daemon = Holds<Same<Board.Daemon, Omit<daemon.Daemon, 'by'> & { by: string | null }>>;

export type Touched = Holds<Same<Board.Touched, decision.Touched>>;
export type DiffFile = Holds<Same<Board.DiffFile, decision.DiffFile>>;
export type SensitiveDiff = Holds<Same<Board.SensitiveDiff, decision.SensitiveDiff>>;
export type Lesson = Holds<Same<Board.Lesson, decision.Lesson>>;
export type DecideCommand = Holds<Same<Board.DecideCommand, decision.DecideCommand>>;
export type Standing = Holds<Same<Board.Standing, decision.Standing>>;
export type StandingMerge = Holds<Same<Board.StandingMerge, decision.StandingMerge>>;
export type Collisions = Holds<Same<Board.Collisions, decision.Collisions>>;
export type Decidable = Holds<Same<Board.Decidable, decision.Decidable>>;
export type RunDecision = Holds<Same<Board.RunDecision, decision.RunDecision>>;
export type Radius = Holds<Same<Board.Radius, RadiusOf>>;
export type Change = Holds<Same<Board.Change, RadiusOf['changes'][number]>>;
export type Group = Holds<Same<Board.Group, RadiusOf['groups'][number]>>;
export type Collision = Holds<Same<Board.Collision, decision.Collisions['colliding'][number]>>;
export type MergeWord = Holds<Same<Board.MergeWord, decision.Collisions['colliding'][number]['merge']>>;
export type CheckoutHold = Holds<Same<Board.CheckoutHold, NonNullable<decision.Decidable['checkout']>>>;
export type RunSlot = Holds<Same<Board.RunSlot, NonNullable<Extract<decision.RunDecision, { running: true }>['held']>>>;

export type StepBudget = Holds<Same<Board.StepBudget, detail.StepBudget>>;
export type StepRaise = Holds<Same<Board.StepRaise, detail.StepRaise>>;
export type StepApproval = Holds<Same<Board.StepApproval, detail.StepApproval>>;
export type StepGate = Holds<Same<Board.StepGate, detail.StepGate>>;
export type StepAcceptance = Holds<Same<Board.StepAcceptance, detail.StepAcceptance>>;
export type StepAsked = Holds<Same<Board.StepAsked, detail.StepAsked>>;
export type StepSpec = Holds<Same<Board.StepSpec, detail.StepSpec>>;
export type StepFiled = Holds<Same<Board.StepFiled, detail.StepFiled>>;
/** As `Said`, held open. */
export type RunDetail = Holds<
  Same<Board.RunDetail, Omit<runs.RunPage, 'steps'> & { steps: Array<Omit<Step, 'said'> & { said: SaidHeld[] }> }>
>;
export type StepTimelineTry = Holds<Same<Board.StepTimelineTry, detail.StepTimelineTry>>;
export type TimelineTotal = Holds<Same<Board.TimelineTotal, detail.StepTimelineTotal>>;
export type StepStatus = Holds<Same<Board.StepStatus, NonNullable<detail.StepRaise['own']>>>;
export type TaskSpan = Holds<Same<Board.TaskSpan, NonNullable<detail.StepTimelineTry['session']>>>;
export type TurnSpan = Holds<Same<Board.TurnSpan, NonNullable<detail.StepTimelineTry['turn']>>>;

export type FactorySchedule = Holds<Same<Board.FactorySchedule, factories.ScheduleAnswer>>;
export type FactoryUntrusted = Holds<Same<Board.FactoryUntrusted, factories.UntrustedAnswer>>;
export type Factory = Holds<Same<Board.Factory, factories.FactoryAnswer>>;
/** Whether a clear removed a file is not the board's to read. */
export type FactoryRules = Holds<Same<Board.FactoryRules, Omit<rules.FactoryRules, 'removed'>>>;
export type FactoryInstruction = Holds<Same<Board.FactoryInstruction, instruction.FactoryInstruction>>;
/**
 * A server's `state` is the harness's own word, carried and drawn as it comes: one the runtime does not list yet is shown, not refused.
 */
export type FactoryServer = Holds<Same<Board.FactoryServer, ServerOf>>;
export type FactoryServers = Holds<
  Same<Board.FactoryServers, Omit<servers.FactoryServersRead, 'servers'> & { servers: readonly ServerOf[] }>
>;
export type BuiltinServer = Holds<Same<Board.BuiltinServer, servers.FactoryServersRead['builtin'][number]>>;

export type RunGraph = Holds<Same<Board.RunGraph, runs.RunPage['graph']>>;
export type GraphEdge = Holds<Same<Board.GraphEdge, runs.RunPage['graph']['edges'][number]>>;

export type InboxEntry = Holds<Same<Board.InboxEntry, inbox.InboxEntry>>;
export type InboxCardPage = Holds<Same<Board.InboxCardPage, inbox.InboxCardPage>>;
export type Queued = Holds<Same<Board.Queued, inbox.InboxQueueAnswer>>;
export type FromSet = Holds<Same<Board.FromSet, inbox.InboxFromAnswer>>;

export type PlaceKind = Holds<Same<Board.PlaceKind, runs.RunPage['place']>>;
export type RunStatus = Holds<Same<Board.RunStatus, runs.RunPage['status']>>;
/** The codes the board groups and colours by, each held to the field the api carries it in. */
export type RunPhase = Holds<Same<Board.RunPhase, runs.RunPage['phase']>>;
export type RunReason = Holds<Same<Board.RunReason, runs.RunListing['reason']>>;
export type StepPhase = Holds<Same<Board.StepPhase, runs.RunListing['steps'][number]['phase']>>;
export type StepReason = Holds<Same<Board.StepReason, Step['reason']>>;
export type TryPhase = Holds<Same<Board.StepPhase, tries.StepTry['phase']>>;
export type TryReason = Holds<Same<Board.StepReason, tries.StepTry['reason']>>;
export type CheckVerdict = Holds<Same<Board.CheckVerdict, NonNullable<logs.StepCheck['verdict']>>>;
export type StepVerdict = Holds<Same<Board.CheckVerdict, NonNullable<runs.RunListing['steps'][number]['verdict']>>>;
export type CheckResult = Holds<Same<Board.CheckResult, NonNullable<logs.StepCheck['verdict']>['result']>>;
export type RunToDecide = Holds<Same<Board.RunToDecide, NonNullable<runs.RunPage['toDecide']>>>;
export type Spent = Holds<Same<Board.Spent, NonNullable<runs.RunPage['cost']>>>;
export type AtWork = Holds<Same<Board.AtWork, NonNullable<runs.RunPage['atWork']>>>;
export type RunTokens = Holds<Same<Board.RunTokens, NonNullable<runs.RunPage['tokens']>>>;
export type RunWaiting = Holds<Same<Board.RunWaiting, NonNullable<runs.RunPage['waiting']>>>;
export type RunHolding = Holds<Same<Board.RunHolding, NonNullable<runs.RunPage['holding']>>>;
export type StepNeeds = Holds<Same<Board.StepNeeds, Pick<Step, keyof Board.StepNeeds>>>;

export type TaskPart = Holds<Same<Board.TaskPart, told.TaskPart>>;
export type StepLayers = Holds<Same<Board.StepLayers, NonNullable<Step['layers']>>>;

export type GivenSkill = Holds<Same<Board.GivenSkill, skills.GivenSkill>>;
export type WorkflowStepSpec = Holds<Same<Board.WorkflowStepSpec, workflows.WorkflowStepSpec>>;
export type StepKey = Holds<Same<Board.StepKey, keyof workflows.WorkflowStepSpec>>;
export type KeyRow = Holds<Same<Board.KeyRow, workflows.KeyRow>>;
export type AgentSkill = Holds<Same<Board.AgentSkill, NonNullable<agents.AgentListing['card']>[number]>>;
export type SkillCost = Holds<Same<Board.SkillCost, NonNullable<skills.SkillRow['cost']>>>;

export type MachineListing = Holds<Same<Board.MachineListing, machines.MachineListing>>;
/** A machine's states, events and verbs are words the page draws for whichever machine the api names. */
export type MachineGraph = Holds<Same<Board.MachineGraph, Widened<machines.MachineGraph>>>;
export type MachineEdge = Holds<Same<Board.MachineEdge, Widened<machines.MachineGraph['edges'][number]>>>;
export type MachineVerb = Holds<Same<Board.MachineVerb, Widened<machines.MachineGraph['verbs'][number]>>>;

export type Paused = Holds<Same<Board.Paused, PausedOf>>;
export type Pause = Holds<Same<Board.Pause, NonNullable<PausedOf['pause']>>>;
export type Finishing = Holds<Same<Board.Finishing, PausedOf['finishing'][number]>>;
export type PauseStaged = Holds<Same<Board.PauseStaged, PausedOf['staged'][number]>>;
export type PauseHeld = Holds<Same<Board.PauseHeld, PausedOf['held'][number]>>;
export type PauseNowRead = Holds<Same<Board.PauseNowRead, pause.PauseNowRead>>;
export type Interrupt = Holds<Same<Board.Interrupt, pause.PauseNowRead['interrupts'][number]>>;

export type QuotaWindow = Holds<Same<Board.QuotaWindow, quota.QuotaWindow>>;
export type Quota = Holds<Same<Board.Quota, quota.Quota>>;

export type RunSummary = Holds<Same<Board.RunSummary, runs.RunListing>>;
export type OpenRuns = Holds<Same<Board.OpenRuns, runs.OpenListing>>;
export type FinishedPage = Holds<Same<Board.FinishedPage, runs.FinishedListing>>;
export type ListedRun = Holds<Same<Board.ListedRun, runs.OpenListing['inFlight'][number]>>;
export type WaitingRun = Holds<Same<Board.WaitingRun, runs.OpenListing['waiting'][number]>>;
export type RunClock = Holds<Same<Board.RunClock, NonNullable<runs.OpenListing['inFlight'][number]['clock']>>>;
export type StepCost = Holds<Same<Board.StepCost, NonNullable<runs.OpenListing['waiting'][number]['stepCosts']>[number]>>;
export type FinishedRun = Holds<Same<Board.FinishedRun, runs.FinishedListing['runs'][number]>>;
export type Hold = Holds<Same<Board.Hold, runs.Hold>>;

export type SkillRow = Holds<Same<Board.SkillRow, skills.SkillRow>>;
export type SkillPlace = Holds<Same<Board.SkillPlace, skills.SkillPlace>>;
export type SkillAdded = Holds<Same<Board.SkillAdded, skills.SkillAdded>>;
export type SkillUser = Holds<Same<Board.SkillUser, skills.SkillUser>>;
export type SkillDetail = Holds<Same<Board.SkillDetail, skills.SkillDetail>>;
export type SkillSaved = Holds<Same<Board.SkillSaved, skills.SkillSaved>>;
export type SkillDraft = Holds<Same<Board.SkillDraft, NonNullable<skills.SkillDetail['draft']>>>;

export type TranscriptEvent = Holds<Same<Board.TranscriptEvent, steps.TranscriptEvent>>;
export type StepTranscript = Holds<Same<Board.StepTranscript, steps.StepTranscript>>;
/** As a machine's: a step of a task's path is drawn by its state's and its event's words. */
export type LifecycleTransition = Holds<Same<Board.LifecycleTransition, Widened<path.LifecycleTransition>>>;
export type StepPath = Holds<Same<Board.StepPath, Omit<path.StepPath, 'path'> & { path: Widened<path.LifecycleTransition>[] }>>;

export type YourStore = Holds<Same<Board.YourStore, yours.YourStore>>;

export type StepArtifact = Holds<Same<Board.StepArtifact, artifacts.StepArtifact>>;
export type StepReply = Holds<Same<Board.StepReply, tries.StepReply>>;
export type StepCloseout = Holds<Same<Board.StepCloseout, tries.StepCloseout>>;
export type StepValue = Holds<Same<Board.StepValue, artifacts.StepValue>>;
export type StepLog = Holds<Same<Board.StepLog, logs.StepLog>>;
export type StepCheck = Holds<Same<Board.StepCheck, logs.StepCheck>>;
export type StepUnreadable = Holds<Same<Board.StepUnreadable, tries.StepUnreadable>>;
export type StepAttempts = Holds<Same<Board.StepAttempts, tries.StepAttempts>>;
export type StepTry = Holds<Same<Board.StepTry, tries.StepTry>>;
export type AskedQuestions = Holds<Same<Board.AskedQuestions, tries.StepCloseout['questions'][number]>>;
export type Question = Holds<Same<Board.Question, tries.StepCloseout['questions'][number]['questions'][number]>>;
export type QuestionOption = Holds<
  Same<Board.QuestionOption, tries.StepCloseout['questions'][number]['questions'][number]['options'][number]>
>;

export type Usage = Holds<Same<Board.Usage, usage.Usage>>;
export type StepUsed = Holds<Same<Board.StepUsed, usage.StepUsed>>;
export type RunRead = Holds<Same<Board.RunRead, usage.RunRead>>;

/**
 * Held open: the footer still draws a version with no release (`versionWords`, lib/footer.ts), which the api always answers; making
 * `release` required changes the footer, not only the mirror.
 */
export type Version = Holds<Same<Board.Version, Omit<app.VersionAnswer, 'release'> & { release?: app.VersionAnswer['release'] }>>;
export type VersionRelease = Holds<Same<Board.VersionRelease, NonNullable<app.VersionAnswer['release']>>>;

export type ListedStep = Holds<Same<Board.ListedStep, workflows.ListedStep>>;
export type StepOwn = Holds<Same<Board.StepOwn, workflows.StepOwn>>;
export type WorkflowListing = Holds<Same<Board.WorkflowListing, workflows.WorkflowListing>>;
export type RecentRun = Holds<Same<Board.RecentRun, step.RecentRun>>;
export type SkillFrom = Holds<Same<Board.SkillFrom, step.SkillFrom>>;
export type Hiring = Holds<Same<Board.Hiring, step.Hiring>>;
export type WorkflowStepPage = Holds<Same<Board.WorkflowStepPage, step.WorkflowStepPage>>;
export type WorkflowSaved = Holds<Same<Board.WorkflowSaved, builder.WorkflowSaved>>;

/**
 * Mirrors no entry can hold yet: the api answers each through the package's command table, which types no answer, and the package's
 * entries name none of them. Each is wired once the package exports its type and the api names it.
 */
const UNWIRED: Readonly<Record<string, string>> = {
  Level: "nemia level's answer (`NemiaLevel`), not exported by the package",
  Spend: "nemia level's answer (`NemiaLevel`), not exported by the package",
  Raise: "nemia level's answer (`NemiaLevel`), not exported by the package",
  FactoryLevel: "nemia level's answer (`NemiaLevel`), not exported by the package",
  NemiaLevel: 'not exported by the package',
  NemiaMemory: 'not exported by the package',
  WorkflowRemoved: 'not exported by the package',
};

/** The types exported from `text` whose doc comment says they mirror one of the api's, by name. */
export function mirrorsOf(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((node) =>
    (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
    ts.getJSDocCommentsAndTags(node).some((doc) => /\bMirrors\b/.test(doc.getText(source)))
      ? [node.name.text]
      : [],
  );
}

/** The mirrors of `texts` (a file's name to its text) that `entries` names no entry for, each with its file and the fix. */
export function unwired(texts: ReadonlyMap<string, string>, entries: ReadonlySet<string>): string[] {
  return [...texts].flatMap(([file, text]) =>
    mirrorsOf(file, text)
      .filter((name) => !entries.has(name))
      .map(
        (name) => `${file}: ${name} mirrors an api type with no entry in test/wire.test.ts: add \`export type ${name} = Holds<Same<…>>\``,
      ),
  );
}

/** The board's types this file holds equal to the api's (`Same<Board.X, …>`), and those it says why it cannot yet. */
const entriesIn = (text: string): Set<string> =>
  new Set([...text.matchAll(/Same<\s*Board\.(\w+)\b/g)].map((m) => m[1]).concat(Object.keys(UNWIRED)));

const API = new URL('../src/lib/api/', import.meta.url);

test('every mirror under src/lib/api has an entry here', () => {
  const texts = new Map(
    fs
      .readdirSync(API)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => [f, fs.readFileSync(new URL(f, API), 'utf8')] as const),
  );
  const entries = entriesIn(fs.readFileSync(new URL(import.meta.url), 'utf8'));
  assert.deepEqual(unwired(texts, entries), []);
  assert.ok([...texts].reduce((n, [file, text]) => n + mirrorsOf(file, text).length, 0) > 100, 'the scan finds the mirrors it is for');
});

test('REFUSED: a mirror with no entry, named with its file', () => {
  const planted = new Map([
    [
      'planted.ts',
      '/** Mirrors `Planted` in apps/api/src/planted.ts. */\nexport type Planted = { a: string };\n/** Not one. */\nexport type Own = 1;',
    ],
  ]);
  const found = unwired(planted, new Set(['Own']));
  assert.equal(found.length, 1);
  assert.match(found[0], /^planted\.ts: Planted /);
  assert.equal(unwired(planted, new Set(['Planted'])).length, 0, 'and an entry answers it');
});

test('decodes takes a schema that decodes its type, and the compiler refuses one that does not', () => {
  const taken = decodes<{ a: string; b?: number }>()(Schema.Struct({ a: Schema.String, b: Schema.optional(Schema.Number) }));
  assert.ok(Schema.isSchema(taken));
  // @ts-expect-error -- a schema that decodes `any`.
  decodes<{ a: string }>()(Schema.Any);
  // @ts-expect-error -- a key the type requires, made optional.
  decodes<{ a: string }>()(Schema.Struct({ a: Schema.optional(Schema.String) }));
  // @ts-expect-error -- a key of the type left out.
  decodes<{ a: string; b: number }>()(Schema.Struct({ a: Schema.String }));
  // @ts-expect-error -- a word of the type left out.
  decodes<{ a: 'x' | 'y' }>()(Schema.Struct({ a: Schema.Literal('x') }));
});

/** A try as the api answers it, every key the board reads in its words. */
const aTry: BoardTry = {
  try: 1,
  round: 1,
  cause: null,
  current: true,
  taskId: 't-1',
  note: null,
  phase: 'waiting',
  reason: 'Blocked',
  message: 'succeeded · BLOCKED',
  status: 'succeeded · BLOCKED',
  attempts: { count: 1, latest: null },
  check: { command: 'npm test', taskId: 't-2', verdict: { result: 'failed', exit: 1 }, refused: null },
  closeout: null,
  unreadable: null,
  answer: null,
};

/** `body` read through `get` with `schema`, off a fetch that answers it, the global one put back after. */
async function readOf<T>(body: unknown, schema: Parameters<typeof get<T>>[1]): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status: 200 });
  try {
    return await get('/api/try', schema);
  } finally {
    globalThis.fetch = real;
  }
}

test('a step reads its codes, and a reason or a verdict this board does not know is an answer it refuses to read', async () => {
  assert.deepEqual(await readOf(aTry, StepTrySchema), aTry);
  await assert.rejects(readOf({ ...aTry, reason: 'NotAReason' }, StepTrySchema), UnreadAnswer);
  await assert.rejects(readOf({ ...aTry, phase: 'blocked' }, StepTrySchema), UnreadAnswer);
  await assert.rejects(readOf({ ...aTry, check: { ...aTry.check, verdict: { result: 'exit 1', exit: 1 } } }, StepTrySchema), UnreadAnswer);
  await assert.rejects(readOf({ ...aTry, check: { ...aTry.check, verdict: 'passed' } }, StepTrySchema), UnreadAnswer);
});
