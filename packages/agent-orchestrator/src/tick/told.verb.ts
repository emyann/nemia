/**
 * A step as the tick tells it (`toldOf`): the step its brief is composed for, the harness's own arguments it is filed with (`ownOf`), and
 * what its place says to it (`placeTold`); the files its last closeout lacked (`lacksTold`), and which files the steps before it named
 * are there (`foldersTold`); and what a pass named, found or thrown as its fault (`found`, `recordNamed`). And what one pass reads of a
 * run before it adopts or files anything (`readPass`): the engine's views of its tasks, the readers made of them, and the asks beside
 * it, through the Run door — the asks waiting, and every answer a person gave, waiting or consumed, which the steps after each are told.
 * A controller: it reads the run's rendered agent folder, the skills where a start of the run's folder finds them, and the run's place.
 */
import path from 'node:path';
import { Effect, Result } from 'effect';
import { ownArgsOf } from 'agent-runtime/vocabulary';
import { refusedTold } from './assess.ts';
import { declarationOf, DEFAULT_HARNESS } from '../harness/harness.ts';
import { mcpServerOf, over, type ClaudeFlags, type CodexArgs, type Engine, type TaskView } from '../runtime-client.ts';
import {
  isRepositoryRun,
  lackedOf,
  type CloseoutAsked,
  type Mount,
  type Run,
  type StepRecord,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import { filedFolders, type FiledFolders } from '../filed/filed.ts';
import { artifactFiles, filesHanded, holdsCloseout } from '../artifacts/artifacts.store.ts';
import { lackLines } from '../artifacts/artifacts.ts';
import type { EndingStopped, RetryBriefing } from '../brief/index.ts';
import { budgetOf, ownStatus, type RoundAsk, type SpendOf } from '../status/status.ts';
import type { Retry, RetryAsk } from '../retry/index.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, saidIn, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { RunId } from '../record/record.model.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { splitFrontmatter, type Workflow } from '../step/step.ts';
import { realRepoOf } from '../workspace/worktree.store.ts';
import { agentFilesDir, renderedIn } from '../agents/agents.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { workflowDescription } from '../folder/folder.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { SkillName } from '../agents/agents.model.ts';
import { enabledSkillsOf, renderedFlags, rendersAgent, unrendered, type SkillAgain } from '../agents/agents.ts';
import type { LandingWords, Verdict } from '../check/check.ts';
import { landingWords, placeSay } from '../place/landing.store.ts';
import type { Place } from '../place/place.store.ts';
import type { PlaceSay } from '../place/place.ts';
import { composeBrief } from '../brief/index.ts';
import { artifactsDir, inputsDir } from '../record/record.store.ts';
import { workflowFilesDir } from '../frozen/frozen.store.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { factoryServers } from '../factory/servers/servers.store.ts';
import type { FactoryServers } from '../factory/servers/index.ts';
import { inboxDir } from '../record/files.store.ts';

/**
 * A step as the tick tells it and files it: with its agent's instructions in Claude Code's prompt and its skills in a plugin, where
 * `nemia start` rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent —
 * is filed with no flags and told everything in its brief. Where the rendered folder is not there as its flags name it (`unrendered`,
 * `renderedIn`) — gone, or rendered under the plugin's former name — a flag naming a file that is not there would end the session at its
 * start, so its brief tells it its skills whole, read again through the Skill door from where a start of this run's folder finds them
 * (`skillsTold`), asked only of such a step. Bridged to
 * claude.ai, where anyone signed in can drive it, only when the step says `remote: true`, never by default: as Claude Code's own flag,
 * first among its others (`claude.remoteControl`). A codex step of a repository run is filed with its repository's real path as the
 * directory Codex's trust extends from (`codex.trustFrom`), so a `--repo` given through a symlink names what the operator's Codex config
 * lists; a folder run has no repository, and a step on another harness takes no Codex arguments, so either is filed with none, as is one
 * whose repository is no longer there to resolve (`realRepoOf`). And the skills its session is given, and no other (`enabledSkillsOf`),
 * off the step as it is told: one whose rendered folder is gone holds none, and is told them in its brief. All are the harness's own
 * arguments (`own`), which the first filing, a try and a round each spread into its `config`.
 */
export const toldOf = Effect.fnUntraced(function* (run: Run, step: Workflow) {
  const dir = agentFilesDir(run, step.name);
  const told: Workflow =
    rendersAgent(step) && !renderedIn(dir, step) ? unrendered(step, step.agent?.skills?.length ? yield* skillsTold(step, run) : []) : step;
  return {
    step: told,
    own: { ...ownOf(told, renderedFlags(told, dir), () => realRepoOf(run)), enabledSkills: enabledSkillsOf(told) },
  } satisfies StepTold;
});

/**
 * The skills of `step`, each read again through the Skill door from where a start of `run`'s folder finds it (`SkillDoor.skills.found`):
 * its body, or why it could not be told — none found, refused, or a SKILL.md the door reads none of. The one read of a skill after a run
 * started, since the copy `nemia start` froze went with the folder; asked of the door, so a program given its memory tells what it holds.
 */
const skillsTold = Effect.fnUntraced(function* (step: Workflow, run: Run) {
  const door = (yield* SkillDoor).skills;
  const found = yield* door.found({ dir: run.workflowDir, places: placesOf(run.repo) });
  const told: SkillAgain[] = [];
  for (const name of step.agent?.skills ?? []) {
    const from = found.at.get(name);
    if (typeof from !== 'string') {
      told.push({ name, missing: from ? from.message : `no folder holds it in ${found.looked.join(', ')}.` });
      continue;
    }
    const read = yield* Effect.result(door.read(SkillName.read(path.basename(from)), path.dirname(from)));
    told.push(
      Result.isSuccess(read)
        ? skillAgainOf(name, from, read.success.text, read.success.error ?? 'it holds nothing')
        : skillAgainOf(name, from, '', read.failure.message),
    );
  }
  return told;
});

/** The skill `name` of the folder `from` as its brief tells it: the body of its SKILL.md's `text`, or why it could not be read. Pure. */
function skillAgainOf(name: string, from: string, text: string, why: string): SkillAgain {
  const file = path.join(from, 'SKILL.md');
  if (!text) return { name, missing: `${file} could not be read — ${why}.` };
  try {
    return { name, text: splitFrontmatter(`${name}/SKILL.md`, text).body };
  } catch (err) {
    return { name, missing: `${file} could not be read — ${err instanceof Error ? err.message : String(err)}.` };
  }
}

/**
 * The harness's own arguments a step is filed with (`toldOf`): what its harness's declaration makes of the neutral asks (`ownArgsOf`) —
 * trust the repository, at its real path, asked only of a step whose harness takes it; a remote control where the step says `remote:
 * true` — with the flags its agent rendered to spread over them. A remote control its harness has no word for is filed in the words of
 * the default harness's, which has one, so the runtime refuses it by its line at `nemia start` rather than the run dropping it. Pure but
 * for `repoOf`.
 */
export const ownOf = (step: Pick<Workflow, 'harness' | 'remote'>, rendered: ClaudeFlags | undefined, repoOf: () => string | undefined) => {
  const declaration = declarationOf(step.harness);
  const remoteControl = step.remote === true;
  const unanswered = remoteControl && declaration?.asks?.remoteControl === undefined;
  const asked = {
    ...(unanswered ? ownArgsOf(declarationOf(DEFAULT_HARNESS), { remoteControl }) : {}),
    ...ownArgsOf(declaration, { trustRepository: repoOf, remoteControl }),
  };
  return { ...asked, claude: asked.claude === undefined ? rendered : { ...asked.claude, ...rendered } };
};

/**
 * What a step's place says to it (`placeTold`): how it lands, undefined for a step that does not land on its check (`words`), and its
 * commands (`say`), undefined for a folder run's step.
 */
export type PlaceTold = {
  readonly words: LandingWords | undefined;
  readonly say: PlaceSay | undefined;
  readonly targets?: Readonly<Record<string, string>>;
};

/**
 * A step as the tick tells it (`toldOf`): the step its brief is composed for, and the harness's own arguments it is filed with.
 */
export type StepTold = {
  readonly step: Workflow;
  readonly own: { claude?: ClaudeFlags; codex?: CodexArgs; enabledSkills: string[] | 'default' };
};

/** A step as a try files it (`toldOf`), with what its place says to it (`PlaceTold`). */
export type Told = StepTold & PlaceTold;

/**
 * What `step` of `run`, among its `steps`, is told and denied by `place` (`landingWords`, `placeSay`), its branches named off `heads`
 * where given.
 */
/**
 * For a judge (`route: judge`), what each workflow a node after it routes to says it is for: its README's description, read from the
 * folder beside the run's own workflow, where a team keeps its workflows. Empty for any other step, and for a workflow with no description.
 */
export function workflowTargets(run: Run, steps: readonly Workflow[], step: Workflow): Record<string, string> {
  if (step.route?.kind !== 'judge') return {};
  const named = steps.filter((s) => s.after.includes(step.name)).flatMap((s) => (s.workflow === undefined ? [] : [s.workflow]));
  return Object.fromEntries(
    named.flatMap((w) => {
      const about = workflowDescription(path.join(path.dirname(run.workflowDir), w));
      return about ? [[w, about]] : [];
    }),
  );
}

export function placeTold(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
  place: Place,
  heads?: Readonly<Record<string, string>>,
): PlaceTold {
  const targets = workflowTargets(run, steps, step);
  return {
    words: landingWords(run, steps, step, place, heads),
    say: placeSay(run, place),
    ...(Object.keys(targets).length ? { targets } : {}),
  };
}

/**
 * The folders a step of `run` is filed from (`filedFolders`): the run's artifacts folder, the store's inbox, the run's inputs
 * folder (`inputsDir`) only when its record names an input, so a run given none is filed and told as before, and the run's copy of its
 * workflow folder (`workflowFilesDir`) only when its record names one. What a *brief* reads, which asks for no server; `filedAt` is what
 * a filing takes.
 */
export const filedFoldersAt = (
  run: Pick<Run, 'id' | 'inputs' | 'workflowFiles'>,
): { runArtifacts: string; inbox: string; inputs?: string; workflowFiles?: string } => ({
  runArtifacts: path.dirname(artifactsDir(run, 'step')),
  inbox: inboxDir(),
  ...(run.inputs?.length ? { inputs: inputsDir(run) } : {}),
  ...(run.workflowFiles === undefined ? {} : { workflowFiles: workflowFilesDir(run, run.workflowFiles) }),
});

/**
 * What a step of `run` is filed with (`filedConfig`): its folders, and the MCP servers the run's factory records, read from the store
 * `home` the caller was given. The root is a parameter and has no default: a caller that passes none does not compile, so no filing
 * reads a store nobody named (`test/root-given.test.ts`).
 */
export const filedAt = (
  run: Pick<Run, 'id' | 'inputs' | 'factory' | 'workflowFiles'>,
  home: string,
): { runArtifacts: string; inbox: string; inputs?: string; workflowFiles?: string; servers: FactoryServers } => ({
  ...filedFoldersAt(run),
  servers: recordedServers(run.factory, home),
});

/**
 * The MCP servers the factory `factory` records, each through `mcpServerOf` — the runtime's one producer of the bytes a harness sees,
 * applied here and nowhere else on this road, so a session is handed the spelling a state read was handed and finds the sign-in filed
 * under it. `{}` for a factory that records none — and `{}`, silently here, for a record that does not read: this is spread into
 * every filing, and a throw would be a defect that stops the whole pass over one bad file. The pass refuses the step itself and says
 * why (`fileReady`), where a note can carry the file and the command to type, and `nemia factory servers` refuses it loudly to the
 * person who asks.
 */
const recordedServers = (factory: string | undefined, home: string): FactoryServers => {
  try {
    const record = factoryServers(home, factory ?? DEFAULT_FACTORY);
    return Object.fromEntries(Object.entries(record).map(([name, server]) => [name, mcpServerOf(server)]));
  } catch {
    return {};
  }
};

/**
 * What `step` of `run`, not yet filed, would be told now from `steps` (`composeBrief`), with what its place says to it (`placeTold`):
 * what the board shows of a step to come. Where the place gives no words, the brief sends the step to its place's skill.
 */
export function briefNow(step: Workflow, run: Run, steps: readonly Workflow[], place: Place): string {
  const told = placeTold(run, steps, step, place);
  const none = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;
  return composeBrief(step, run, steps, ...none, told);
}

/**
 * The files the closeout of the try that ended named that the run did not have (`lackedOf`), as its next try is told them: a line each,
 * with a near name off what the step's files directory holds now (`lackLines`). Nothing for a try that lacked none.
 */
export const lacksTold = (run: Run, name: string, record: StepRecord): Pick<RetryBriefing, 'lacks'> => {
  const lacked = lackedOf(record);
  if (!lacked.length) return {};
  const there = artifactFiles(run, name).map((file) => file.path);
  return { lacks: lackLines(lacked, artifactsDir(run, name), there) };
};

/**
 * The folders a step is filed with and its brief names (`filedFolders`), those a step before it handed over that hold its
 * `closeout.json` (`holdsCloseout`), which the brief sends the step to, and for each other, which of the files that step's closeout named
 * are there now (`filesHanded`): the brief lists those, and hands on no name with no file.
 */
export const foldersTold = (
  run: Run,
  reads: { steps: readonly Workflow[]; signedOff: (step: string) => Closeout | undefined },
  step: Workflow,
  caller: readonly Mount[] = [],
): FiledFolders => {
  const folders = filedFolders(step, reads.steps, { ...filedFoldersAt(run), caller });
  const closeouts = folders.handed.filter((m) => holdsCloseout(run, path.basename(m.path))).map((m) => m.path);
  const named = folders.handed
    .filter((m) => !closeouts.includes(m.path))
    .map((m) => {
      const from = path.basename(m.path);
      return [m.path, filesHanded(run, from, reads.signedOff(from))] as const;
    });
  return { ...folders, named: Object.fromEntries(named), closeouts };
};

/** What a try's telling reads of its pass (`Filing`): the run, and what the pass read of its steps, tasks and closeouts. */
type TriedReads = {
  run: Run;
  reads: {
    steps: readonly Workflow[];
    views: ReadonlyMap<string, TaskView>;
    phaseOf: (taskId: string) => TaskPhase;
    signedOff: (step: string) => Closeout | undefined;
    asked: (taskId: string) => CloseoutAsked;
    spendOf: SpendOf;
  };
};

/** What a pass read and named (`what`), found: one it does not have is thrown, naming it, as a fault of the pass. */
export const found = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`the pass named ${what}, which it does not have: report it as a defect of the tick`);
  return value;
};

/** The run's record of the step of this name, which the pass named: one the run has none of is thrown (`found`). */
export const recordNamed = (run: Run, name: string): StepRecord => found(run.steps[name], `the record of step ${name} of run ${run.id}`);

/** The task of the session a try stops first (`Retry.stopFirst`), which runs: a step with none on the record is thrown (`found`). */
export const taskToStop = (run: Run, name: string): string =>
  found(recordNamed(run, name).taskId ?? undefined, `a task of step ${name} of run ${run.id}`);

/** The step of this name, which the pass's assessment named: one the pass did not read is thrown (`found`). */
export const stepNamed = (f: TriedReads, name: string): Workflow =>
  found(
    f.reads.steps.find((s) => s.name === name),
    `the step ${name}`,
  );

/** What the ending a try is sent back from said, for the work's brief: its status, its summary and needs, and where it merges. */
const endingSaid = (f: TriedReads, ending: Workflow): EndingStopped => {
  const { run, reads } = f;
  const said = reads.signedOff(ending.name);
  return {
    step: ending.name,
    status: ownStatus(ending, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf),
    ...(said?.summary ? { summary: said.summary } : {}),
    ...(said?.needs ? { needs: said.needs } : {}),
    onto: isRepositoryRun(run) ? run.branch : 'the base branch',
  };
};

/**
 * What a local try's brief is told of its try (`RetryBriefing`): how it came and on whose word, the session it continues and what was said
 * to it, how the try before it ended, what its check refused, what was denied it, and the ending it was sent back from.
 */
export const tryTold = (
  f: TriedReads,
  r: Retry,
  record: StepRecord,
  t: { status: StepStatus; resumeFrom: string | undefined; refusal: RetryBriefing['refusal'] },
): RetryBriefing => ({
  try: r.try,
  by: r.by,
  mode: r.mode,
  ...(r.model ? { model: r.model } : {}),
  ...(r.message !== undefined ? { message: r.message } : {}),
  ...(r.budget !== undefined ? { budget: r.budget } : {}),
  ...(r.pastCap ? { pastCap: true as const } : {}),
  resumed: Boolean(t.resumeFrom),
  ...(t.resumeFrom ? { said: saidIn(record.taskId === null ? undefined : f.reads.views.get(record.taskId)) } : {}),
  status: t.status,
  ...(t.refusal ? { refusal: t.refusal } : {}),
  ...(t.status === 'denied' ? { denied: (record.taskId === null ? undefined : f.reads.spendOf(record.taskId))?.denied ?? [] } : {}),
  ...(t.status === 'unsigned' ? lacksTold(f.run, r.step, record) : {}),
  ...(t.status === 'unsigned' ? refusedTold(stepNamed(f, r.step), f.reads.signedOff(r.step), f.reads.steps) : {}),
  ...(r.back?.[0] !== undefined ? { ending: endingSaid(f, stepNamed(f, r.back[0])) } : {}),
});

/**
 * Whether any step of this run has a cap in force on it (`budgetOf`: its `budget:`, or the last a person raised it to) — read off the
 * record, with nothing asked of the engine. What the tick's pass reads the earlier tries for (`taskPhases`): with no cap anywhere, what
 * they cost is a number nothing in the pass looks at, and a step answered without limit would grow that read for ever.
 */
const underBudget = (steps: readonly Workflow[], run: Run): boolean => steps.some((s) => budgetOf(s, run) !== undefined);

/** A pass's reads of a run, before it adopts or files anything: the engine's views of its tasks, the readers made of them, and its asks. */
export const readPass = Effect.fnUntraced(function* (e: Engine, run: Run) {
  const steps = yield* stepsOf(run);
  const { views, phaseOf } = yield* taskPhasesRead(run, { earlierTries: underBudget(steps, run) }).pipe(over(e));
  const signedOff = closeoutReader(views, run, steps);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  const door = yield* RunDoor;
  const { asks, rounds: roundAsks, notes: askNotes } = yield* door.asks.read(RunId.read(run.id));
  const answers = yield* door.asks.answers(RunId.read(run.id));
  const home = yield* StoreRoot;
  const reads: PassReads = { steps, views, phaseOf, signedOff, asked, verdictOf, sessionBlocked, spendOf, asks, roundAsks, answers, home };
  return { reads, askNotes };
});

/**
 * What a pass read of a run before it filed anything (`advanceRun`): the run's steps, the engine's views of its tasks and the readers made
 * of them, and a person's asks. One for the pass: every phase of it reads the same.
 */
export type PassReads = {
  steps: Workflow[];
  views: Map<string, TaskView>;
  phaseOf: (taskId: string) => TaskPhase;
  signedOff: (step: string) => Closeout | undefined;
  asked: (taskId: string) => CloseoutAsked;
  verdictOf: (step: string) => Verdict | undefined;
  sessionBlocked: (taskId: string) => boolean;
  spendOf: SpendOf;
  asks: RetryAsk[];
  roundAsks: RoundAsk[];
  /** Every answer a person gave with `nemia retry --message` on the run, waiting or consumed: what the steps after each are handed. */
  answers: readonly RetryAsk[];
  /** The store's root, as the pass was given it (`StoreRoot`): where a filing reads the run's factory's MCP server record. */
  home: string;
};
