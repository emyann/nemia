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
import type * as ceilings from '../../api/src/gauges/ceilings.ts';
import type * as chat from '../../api/src/nemia/chat.ts';
import type * as custom from '../../api/src/custom/custom.ts';
import type * as daemon from '../../api/src/gauges/daemon.ts';
import type * as decision from '../../api/src/decide/decision.ts';
import type * as logs from '../../api/src/steps/logs.ts';
import type * as nemia from '../../api/src/nemia/nemia.ts';
import type * as path from '../../api/src/steps/path.ts';
import type * as pause from '../../api/src/gauges/pause.ts';
import type * as quota from '../../api/src/gauges/quota.ts';
import type * as reach from '../../api/src/capabilities/reach.ts';
import type * as runs from '../../api/src/runs/runs.ts';
import type * as skills from '../../api/src/agents/skills.ts';
import type * as step from '../../api/src/step/step.ts';
import type * as steps from '../../api/src/steps/steps.ts';
import type * as words from '../../api/src/workflows/words.ts';
import type * as workflows from '../../api/src/workflows/workflows.ts';
import type * as yours from '../../api/src/workflows/yours.ts';

/** A step of a run's object, as the api answers it (`GET /api/runs/:id`): its status, as the package judges it. */
type Step = runs.RunAnswer['status']['steps'][number];
type Judged = runs.RunAnswer['status'];
/**
 * A run as its object answers it (`RunAnswer`), which the board's row of a run (`runRowOf`) is made of: its status, its place off its
 * spec, and its graph without what a step is handed, which the board draws no edge of.
 */
type RunRow = Omit<Judged, 'graph'> &
  Pick<runs.RunAnswer['spec'], 'place'> & {
    graph: Omit<Judged['graph'], 'edges'> & { edges: Array<Exclude<Judged['graph']['edges'][number], { kind: 'input' }>> };
  };
type SaidHeld = Omit<Step['said'][number], 'after'> & { after: NonNullable<Step['said'][number]['after']> | null };
type RadiusOf = Extract<decision.Touched['radius'], { changes: unknown }>;
type ChatEventOf = chat.ChatHistoryAnswer['events'][number];
type AskOf = Extract<ChatEventOf, { kind: 'question' }>;
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

export type CustomInstructions = Holds<Same<Board.CustomInstructions, custom.CustomInstructionsAnswer>>;
export type CustomInstructionsCleared = Holds<Same<Board.CustomInstructionsCleared, custom.CustomInstructionsCleared>>;
export type AgentRoleKey = Holds<Same<Board.AgentRoleKey, keyof agents.AgentListing['keys']>>;

/**
 * Held open: the api may leave `after` out, and the board refuses that; `firstAfter` (lib/transcript.ts) reads a null mark only, so
 * taking an absent one changes the session page, not only the mirror.
 */
export type Said = Holds<Same<Board.Said, SaidHeld>>;
export type QuestionAnswer = Holds<Same<Board.QuestionAnswer, answers.Answer>>;

export type PolicyList = Holds<Same<Board.PolicyList, nemia.PolicyAnswer>>;
export type PolicyRule = Holds<Same<Board.PolicyRule, nemia.PolicyAnswer['rules'][number]>>;
export type ProposalRule = Holds<Same<Board.ProposalRule, nemia.PolicyAnswer['proposalRules'][number]>>;
export type Condition = Holds<Same<Board.Condition, nemia.PolicyAnswer['rules'][number]['when'][number]>>;

export type Bridge = Holds<Same<Board.Bridge, NonNullable<runs.StepFiled['bridge']>>>;

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
export type ChatCallState = Holds<Same<Board.ChatCallState, Extract<ChatEventOf, { kind: 'call' }>['state']>>;
export type AskQuestion = Holds<Same<Board.AskQuestion, AskOf['questions'][number]>>;
export type AskOption = Holds<Same<Board.AskOption, AskOf['questions'][number]['options'][number]>>;
export type AskPick = Holds<Same<Board.AskPick, chat.ChatAnswerBody['picks'][number]>>;
export type PermissionFacts = Holds<Same<Board.PermissionFacts, Extract<ChatEventOf, { kind: 'permission' }>['permission']>>;
export type ChatSent = Holds<Same<Board.ChatSent, chat.ChatSentAnswer>>;
export type ChatSpeaker = Holds<Same<Board.ChatSpeaker, NonNullable<chat.ChatSentAnswer['from']>>>;
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

export type RunLines = Holds<Same<Board.RunLines, runs.RunLinesAnswer>>;
export type RunGraph = Holds<Same<Board.RunGraph, RunRow['graph']>>;
export type GraphEdge = Holds<Same<Board.GraphEdge, RunRow['graph']['edges'][number]>>;
export type GraphNode = Holds<Same<Board.GraphNode, NonNullable<RunRow['graph']['nodes']>[number]>>;

export type PlaceKind = Holds<Same<Board.PlaceKind, RunRow['place']>>;
export type RunStatus = Holds<Same<Board.RunStatus, RunRow['status']>>;
/** The codes the board groups and colours by, each held to the field the api carries it in. */
export type RunPhase = Holds<Same<Board.RunPhase, RunRow['phase']>>;
export type RunReason = Holds<Same<Board.RunReason, RunRow['reason']>>;
export type StepPhase = Holds<Same<Board.StepPhase, RunRow['steps'][number]['phase']>>;
export type StepReason = Holds<Same<Board.StepReason, Step['reason']>>;
export type TryPhase = Holds<Same<Board.StepPhase, runs.StepTry['phase']>>;
export type TryReason = Holds<Same<Board.StepReason, runs.StepTry['reason']>>;
export type TryOn = Holds<Same<Board.WaitOn | null, runs.StepTry['on']>>;
export type TryVia = Holds<Same<Board.AnswerVia | null, runs.StepTry['via']>>;
export type StepOn = Holds<Same<Board.WaitOn | null, Step['on']>>;
export type StepVia = Holds<Same<Board.AnswerVia | null, Step['via']>>;
export type RunOn = Holds<Same<Board.WaitOn | null, RunRow['on']>>;
export type RunVia = Holds<Same<Board.AnswerVia | null, RunRow['via']>>;
export type CheckVerdict = Holds<Same<Board.CheckVerdict, NonNullable<logs.StepCheck['verdict']>>>;
export type StepVerdict = Holds<Same<Board.CheckVerdict, NonNullable<RunRow['steps'][number]['verdict']>>>;
export type CheckResult = Holds<Same<Board.CheckResult, NonNullable<logs.StepCheck['verdict']>['result']>>;
export type RunToDecide = Holds<Same<Board.RunToDecide, NonNullable<RunRow['toDecide']>>>;
export type Spent = Holds<Same<Board.Spent, NonNullable<RunRow['cost']>>>;
export type AtWork = Holds<Same<Board.AtWork, NonNullable<RunRow['atWork']>>>;
export type RunTokens = Holds<Same<Board.RunTokens, NonNullable<RunRow['tokens']>>>;
export type RunWaiting = Holds<Same<Board.RunWaiting, NonNullable<RunRow['waiting']>>>;
export type RunHolding = Holds<Same<Board.RunHolding, NonNullable<RunRow['holding']>>>;
export type StepNeeds = Holds<Same<Board.StepNeeds, Pick<Step, keyof Board.StepNeeds>>>;

export type TaskPart = Holds<Same<Board.TaskPart, runs.TaskPart>>;
export type StepLayers = Holds<Same<Board.StepLayers, NonNullable<workflows.ListedStep['layers']>>>;

export type WorkflowStepSpec = Holds<Same<Board.WorkflowStepSpec, workflows.WorkflowStepSpec>>;
export type StepKey = Holds<Same<Board.StepKey, keyof workflows.WorkflowStepSpec>>;
export type KeyRow = Holds<Same<Board.KeyRow, workflows.KeyRow>>;
export type AgentSkill = Holds<Same<Board.AgentSkill, NonNullable<agents.AgentListing['card']>[number]>>;
export type SkillCost = Holds<Same<Board.SkillCost, NonNullable<skills.SkillRow['cost']>>>;

/** The lifecycle's states, events and verbs are words the Debug panel draws, whichever the runtime's code names. */
export type MachineGraph = Holds<Same<Board.MachineGraph, Widened<path.StepPath['lifecycle']>>>;
export type MachineEdge = Holds<Same<Board.MachineEdge, Widened<path.StepPath['lifecycle']['edges'][number]>>>;
export type MachineVerb = Holds<Same<Board.MachineVerb, Widened<path.StepPath['lifecycle']['verbs'][number]>>>;

export type Paused = Holds<Same<Board.Paused, PausedOf>>;
export type Pause = Holds<Same<Board.Pause, NonNullable<PausedOf['pause']>>>;
export type Finishing = Holds<Same<Board.Finishing, PausedOf['finishing'][number]>>;
export type Parked = Holds<Same<Board.Parked, PausedOf['parked'][number]>>;
export type PauseStaged = Holds<Same<Board.PauseStaged, PausedOf['staged'][number]>>;
export type PauseHeld = Holds<Same<Board.PauseHeld, PausedOf['held'][number]>>;
export type PauseNowRead = Holds<Same<Board.PauseNowRead, pause.PauseNowRead>>;
export type Interrupt = Holds<Same<Board.Interrupt, pause.PauseNowRead['interrupts'][number]>>;

export type QuotaWindow = Holds<Same<Board.QuotaWindow, quota.QuotaWindow>>;
export type Quota = Holds<Same<Board.Quota, quota.Quota>>;

export type TranscriptEvent = Holds<Same<Board.TranscriptEvent, steps.TranscriptEvent>>;
export type StepTranscript = Holds<Same<Board.StepTranscript, steps.StepTranscript>>;
/** As a machine's: a step of a task's path is drawn by its state's and its event's words. */
export type LifecycleTransition = Holds<Same<Board.LifecycleTransition, Widened<path.LifecycleTransition>>>;
export type StepPath = Holds<
  Same<
    Board.StepPath,
    Omit<path.StepPath, 'path' | 'lifecycle'> & {
      path: Widened<path.LifecycleTransition>[];
      lifecycle: Widened<path.StepPath['lifecycle']>;
    }
  >
>;

export type YourStore = Holds<Same<Board.YourStore, yours.YourStore>>;

export type StepArtifact = Holds<Same<Board.StepArtifact, artifacts.StepArtifact>>;
export type StepReply = Holds<Same<Board.StepReply, runs.StepReply>>;
export type StepCloseout = Holds<Same<Board.StepCloseout, runs.StepCloseout>>;
export type StepValue = Holds<Same<Board.StepValue, artifacts.StepValue>>;
export type StepLog = Holds<Same<Board.StepLog, logs.StepLog>>;
export type StepCheck = Holds<Same<Board.StepCheck, logs.StepCheck>>;
export type StepUnreadable = Holds<Same<Board.StepUnreadable, runs.StepUnreadable>>;
export type StepAttempts = Holds<Same<Board.StepAttempts, runs.StepAttempts>>;
export type SessionRelease = Holds<Same<Board.SessionRelease, runs.SessionRelease>>;
export type SessionHarness = Holds<Same<Board.SessionHarness, runs.SessionHarness>>;
export type StepTry = Holds<Same<Board.StepTry, runs.StepTry>>;
export type AskedQuestions = Holds<Same<Board.AskedQuestions, runs.StepCloseout['questions'][number]>>;
export type Question = Holds<Same<Board.Question, runs.StepCloseout['questions'][number]['questions'][number]>>;
export type QuestionOption = Holds<
  Same<Board.QuestionOption, runs.StepCloseout['questions'][number]['questions'][number]['options'][number]>
>;

export type Usage = Holds<Same<Board.Usage, runs.Usage>>;
export type StepUsed = Holds<Same<Board.StepUsed, runs.StepUsed>>;
export type RunRead = Holds<Same<Board.RunRead, runs.RunRead>>;

/**
 * Held open: the footer still draws a version with no release (`versionWords`, lib/footer.ts), which the api always answers; making
 * `release` required changes the footer, not only the mirror.
 */
export type Version = Holds<Same<Board.Version, Omit<app.VersionAnswer, 'release'> & { release?: app.VersionAnswer['release'] }>>;
export type VersionRelease = Holds<Same<Board.VersionRelease, NonNullable<app.VersionAnswer['release']>>>;

export type RecentRun = Holds<Same<Board.RecentRun, step.RecentRun>>;
export type SkillFrom = Holds<Same<Board.SkillFrom, step.SkillFrom>>;
export type Hiring = Holds<Same<Board.Hiring, step.Hiring>>;
export type WorkflowStepPage = Holds<Same<Board.WorkflowStepPage, step.WorkflowStepPage>>;

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
  reason: 'AwaitingAnswer',
  on: null,
  via: 'closeout',
  message: 'succeeded · BLOCKED',
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
  await assert.rejects(readOf({ ...aTry, via: 'harness' }, StepTrySchema), UnreadAnswer);
  await assert.rejects(readOf({ ...aTry, on: 'slot' }, StepTrySchema), UnreadAnswer);
  const { via: _, ...unqualified } = aTry;
  await assert.rejects(readOf(unqualified, StepTrySchema), UnreadAnswer, 'a key the board reads is required, null rather than absent');
  await assert.rejects(readOf({ ...aTry, check: { ...aTry.check, verdict: { result: 'exit 1', exit: 1 } } }, StepTrySchema), UnreadAnswer);
  await assert.rejects(readOf({ ...aTry, check: { ...aTry.check, verdict: 'passed' } }, StepTrySchema), UnreadAnswer);
});
