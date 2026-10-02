/**
 * Starting a workflow folder's run: the program `startRun`, beside `start`, its plain face. It refuses what it can before anything is
 * written, and writes the run's record; nothing is filed here — the tick files a run's first steps on its next pass. `wf plan` and the
 * inbox start their runs through it. A controller whose program requires nothing: the runtime it reads, through the client
 * (`runtime-client.ts`), is its harnesses, which say which steps a session can be bridged for, and never the engine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { configRefusal, HARNESSES, readRemote, tried } from '../runtime-client.ts';
import { remoteAgentsFile } from '../harness/a2a.store.ts';
import { refusalLines } from '../workspace/workspace.ts';
import { type Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness, remoteNameOf } from '../harness/harness.ts';
import { filedRefusal, lineOf } from '../keys/index.ts';
import { filedConfig } from '../filed/filed.ts';
import { budgetUsdFor } from '../status/status.ts';
import { renderedFlags } from '../agents/agents.ts';
import { ownOf } from '../tick/file.verb.ts';
import { fansOut, isFolderTeam } from '../workflow/index.ts';
import { loadWorkflows, skillsFor, type Places } from '../folder/folder.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { workRoot } from '../record/places.store.ts';
import { gateRefusal } from '../ending/ending.ts';
import { type Run } from '../record/record.ts';
import { afterRefusal } from '../wait/wait.ts';
import { inputRefusal, type InputFile } from './inputs.ts';
import { runStore } from '../record/files.store.ts';
import { HOME, inputsDir, runId, runsDir } from '../record/record.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { makeWorkspace, readInclude } from '../workspace/worktree.store.ts';
import { parentRecord } from '../branches/branches.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  DEFAULT_FACTORY,
  factoryRepo,
  fillsOf,
  outsideRefusal,
  unattachedRefusal,
  unfilledRefusal,
  type Factory,
} from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { Effect } from 'effect';

/**
 * Why the engine refuses `claude.remoteControl` on a harness that runs a prompt and exits, in its words (agent-runtime's `file()`), which
 * `test/store.test.ts` holds this copy to by asking the engine. A copy, since `start` is synchronous and the engine's door is not, and the
 * engine refuses only at filing, on the run's first pass, after the run is written.
 */
const NOT_BRIDGED =
  'has no such flag: it runs a prompt and exits, and only a Claude Code background session (`claude --bg --remote-control`) is bridged';

/**
 * Why the engine refuses `claude.remoteControl` on a Claude Code job, in its words (agent-runtime's `claudeCodeRefuses`), which
 * `test/store.test.ts` holds this copy to by asking the engine: a `claude` step without `background: true` runs `claude -p`.
 */
const JOB_NOT_BRIDGED = 'only a background session (`claude --bg`) can be bridged: a job runs `claude -p`, which opens no bridge';

/**
 * The first step that says `remote: true` where the engine refuses `claude.remoteControl` — every one of `HARNESSES` but Claude Code's, as
 * the engine's own door judges (`NOT_BRIDGED`), and on Claude Code every step but a background session (`JOB_NOT_BRIDGED`) — refused by
 * name in the engine's words, or undefined. A step without a `harness:` runs on `claude`, the engine's first.
 */
function remoteRefusal(steps: readonly Workflow[]): string | undefined {
  const bridged = Object.entries(HARNESSES)
    .filter(([, h]) => h === 'claude')
    .map(([name]) => name);
  const step = steps.find((s) => s.remote && !bridged.includes(s.harness ?? 'claude'));
  if (step) {
    return `${step.name}: \`remote: true\` asks for a session bridged to claude.ai, and the \`${step.harness}\` harness ${NOT_BRIDGED}. Run the step on ${bridged.join(' or ')} with \`background: true\` — delete \`harness: ${step.harness}\` — or delete \`remote: true\`.`;
  }
  const job = steps.find((s) => s.remote && !s.background);
  if (job)
    return `${job.name}: \`remote: true\` bridges a session to claude.ai, and ${JOB_NOT_BRIDGED}. Write \`background: true\` beside it, or delete \`remote: true\`.`;
  return undefined;
}

/**
 * A workflow folder's steps, as a run in `factory` runs them: each step its hires fill (`fillsOf`, by the folder's name) resolved against
 * the agent hired, as if its file named it. Refused: first, a workflow the factory has not attached (`unattachedRefusal`), before its
 * folder is read, since a factory offers only its workflows; then every step left with no agent (`unfilledRefusal`), since a factory's
 * steps are filled by its hires; and a hire into a step whose file names its own agent (`parseWorkflow`). With no factory — the default —
 * every workflow is offered, and a step that names no agent is a plain session, as it always was.
 */
function stepsIn(workflowDir: string, places: Places, factory: Factory | undefined): Workflow[] {
  if (!factory) return loadWorkflows(workflowDir, places);
  const workflow = path.basename(path.resolve(workflowDir));
  const unattached = unattachedRefusal(factory, workflow);
  if (unattached) throw new Invalid({ message: unattached });
  const steps = loadWorkflows(workflowDir, places, { factory: factory.name, workflow, agents: fillsOf(factory.hires, workflow) });
  const unfilled = unfilledRefusal(steps, factory.name, workflow);
  if (unfilled) throw new Invalid({ message: unfilled });
  return steps;
}

/**
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix. What `startPlan` asks of every card
 * before the first run is started. Refused:
 * - a folder that is not a workflow (`loadWorkflows`), and, in a factory, a workflow it has not attached, or a step its hires leave
 *   unfilled or fill twice (`stepsIn`);
 * - with `isolate: false` (`--no-worktree`): a team that says `workspace: folder`, which has no base branch to work on in place; one that
 *   can run two steps at once, which would share a directory; and an ending (`workspace: main`), which would merge a result branch the run
 *   does not have into the branch it stands on;
 * - a step named for another step's check (`<step>-check`) or try (`<step>-try<n>`, `<step>-try<n>-check`): the run files those tasks
 *   under those names, and would read one task as the other;
 * - a `remote: true` the engine does not bridge (`remoteRefusal`), and a remote agent not declared (`undeclaredRefusal`): the engine
 *   refuses them only when the step is filed, with the run on the record;
 * - a step whose first filing's config its harness refuses (`configRefused`), the run started at `gates` beside the workflow's own.
 */
export function stepsToStart(
  workflowDir: string,
  isolate: boolean,
  places: Places,
  factory?: Factory,
  gates: readonly string[] = [],
): Workflow[] {
  const steps = stepsIn(workflowDir, places, factory);
  if (!isolate && isFolderTeam(steps)) {
    throw new Invalid({
      message:
        `--no-worktree: this workflow's steps say \`workspace: folder\`, so each works in a folder the run makes, with no git repository — there is no base branch for them to work on in place.\n` +
        `Start it without --no-worktree.`,
    });
  }
  if (!isolate && fansOut(steps)) {
    throw new Invalid({
      message:
        'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\n' +
        'Either drop --no-worktree, or make the steps a chain.',
    });
  }
  const ending = !isolate ? steps.find((s) => s.workspace === 'main') : undefined;
  if (ending) {
    throw new Invalid({
      message:
        `${ending.name}: \`workspace: main\` ends this workflow by merging the run's result branch onto the base branch, and --no-worktree gives the run no result branch — every step works on the base branch itself, where the work already is, so there would be nothing to merge.\n` +
        `Either drop --no-worktree, or start a workflow whose last step is not an ending.`,
    });
  }
  const clash = steps.find((s) => s.check && steps.some((other) => other.name === `${s.name}-check`));
  if (clash) {
    throw new Invalid({
      message: `${clash.name}-check: a step may not be named for another step's check. ${clash.name} has a \`check:\`, and the run files it as ${clash.name}-check. Rename ${clash.name}-check.md.`,
    });
  }
  const tryClash = steps
    .map((s) => ({ s, of: /^(.+)-try\d+(?:-check)?$/.exec(s.name)?.[1] }))
    .find(({ of }) => of && steps.some((other) => other.name === of));
  if (tryClash) {
    const { s, of } = tryClash;
    throw new Invalid({
      message: `${s.name}: a step may not be named for another step's try. The run files ${of} tried again as ${of}-try2, its check as ${of}-try2-check, and on. Rename ${s.name}.md.`,
    });
  }
  const unbridged = remoteRefusal(steps);
  if (unbridged) throw new Invalid({ message: unbridged });
  const undeclared = undeclaredRefusal(steps);
  if (undeclared) throw new Invalid({ message: undeclared });
  const refusedConfig = configRefused(steps, places, gates);
  if (refusedConfig) throw new Invalid({ message: refusedConfig });
  return steps;
}

/**
 * The first step whose config, as its first filing would file it (`filedConfig`) in a run started at `gates`, the runtime refuses on its
 * harness (`configRefusal`), in the runtime's words after the step's line they come from (`filedRefusal`); undefined where every step's
 * is taken. A step on a remote agent is configured by its operator, and asked nothing. Its agent's flags name the folder the run renders
 * it to, which is not there yet: the runtime judges which flags a step has, never where they point.
 */
export function configRefused(steps: readonly Workflow[], places: Places, gates: readonly string[]): string | undefined {
  for (const step of steps.filter((s) => !isRemoteHarness(s.harness))) {
    const own = ownOf(step, renderedFlags(step, '.'), () => places.repo);
    const config = filedConfig(step, steps, { gates: [...gates] }, { model: step.model, budgetUsd: budgetUsdFor(step, step.budget), own });
    const why = filedRefusal((c) => configRefusal(step.harness ?? DEFAULT_HARNESS, c), step.name, config, lineOf(step));
    if (why) return why;
  }
  return undefined;
}

/**
 * The first step whose `harness: a2a:<name>` names an agent the store's `a2a-agents.json` does not give the engine, refused with the fix,
 * or undefined. Read here, before the run is written, since the engine would otherwise refuse the filing on the first pass, with the run on
 * the record. A name the file does not declare is refused with the entry to add; a file refused as it stands, or the entry a step names
 * refused by the runtime, in the file's words (`readRemote`) — and only when a step names a remote agent, and only the entry it names:
 * `engine()` leaves out what is refused, and every other command and run works on.
 */
function undeclaredRefusal(steps: readonly Workflow[]): string | undefined {
  const remote = steps
    .map((s) => ({ s, name: remoteNameOf(s.harness) }))
    .filter((r): r is { s: Workflow; name: string } => r.name !== undefined);
  if (remote.length === 0) return undefined;
  const read = readRemote();
  if (read.unread)
    return `${remote[0].s.name}: \`harness: ${remote[0].s.harness}\` names a remote A2A agent, and the file that declares them is refused. ${read.unread}`;
  const refused = remote.find(({ name }) => read.refused.has(name));
  if (refused)
    return `${refused.s.name}: \`harness: ${refused.s.harness}\` names a remote A2A agent whose entry is refused. ${read.refused.get(refused.name)}`;
  const missing = remote.find(({ name }) => !read.agents.has(name));
  if (!missing) return undefined;
  const file = remoteAgentsFile(HOME);
  const has = read.agents.size === 0 ? 'declares none' : `declares ${[...read.agents.keys()].map((n) => `\`${n}\``).join(', ')}`;
  return `${missing.s.name}: \`harness: ${missing.s.harness}\` names a remote A2A agent \`${missing.name}\`, and ${file} ${has}. Add it there — \`{ "${missing.name}": { "url": "https://…" } }\`, the agent's base URL, where its card is served — or name a declared one.`;
}

/**
 * A `.worktreeinclude` with lines `start` refuses, refused where a person is looking, rather than line by line in a daemon's log. Only a
 * run that cuts worktrees reads the file.
 */
export function refuseInclude(repo: string, isolate: boolean): void {
  const refused = isolate ? (readInclude(repo)?.refused ?? []) : [];
  if (refused.length) {
    throw new Invalid({
      message: `${path.join(repo, '.worktreeinclude')}: ${refusalLines(refused).join('; ')}. Each line is a gitignored path inside the repository, relative to its root — fix or remove ${refused.length === 1 ? 'that line' : 'those lines'}.`,
    });
  }
}

/** What `wf start` is told: the brief, the repository and the workflow folder, and what `startRun` says of each of the rest. */
export type StartOptions = {
  brief: string;
  repo: string;
  repoNamed?: boolean;
  workflowDir: string;
  isolate?: boolean;
  after?: readonly string[];
  inputs?: readonly string[];
  from?: { inbox: string };
  gates?: readonly string[];
  factory?: string;
};

/** What a run is told at `wf start` and frozen on its record, whatever its place: the brief, the steps, and each option given. */
type Told = Pick<Run, 'brief' | 'workflowDir' | 'workflow' | 'after' | 'inputs' | 'from' | 'gates' | 'factory'>;

/** Why a folder team refuses `--repo`: its run works in folders it makes, and would never look at the repository named. */
const repoNamedRefusal = (repo: string): string =>
  `--repo ${repo}: this workflow's steps say \`workspace: folder\`, so the run works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${repo}.\n` +
  `Start it without --repo, or start a workflow whose steps work on a repository.`;

/** The files `wf start --input` names, each resolved from where it is typed, and what is there: a file, a directory, other or nothing. */
function inputsOf(given: readonly string[]): InputFile[] {
  return given.map((g): InputFile => {
    const resolved = path.resolve(g);
    const at = fs.statSync(resolved, { throwIfNoEntry: false });
    return { given: g, resolved, kind: !at ? 'missing' : at.isFile() ? 'file' : at.isDirectory() ? 'directory' : 'other' };
  });
}

/**
 * What `opts` tells the run, with `steps` as the workflow it freezes, `inputs` by name, and `factory` the one it is started in; an option
 * not given is left out, and so is the default factory.
 */
function toldOf(opts: StartOptions, steps: Workflow[], inputs: readonly InputFile[], factory: Factory | undefined): Told {
  const after = opts.after ?? [];
  const gates = opts.gates ?? [];
  return {
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
    ...(after.length ? { after: [...after] } : {}),
    ...(inputs.length ? { inputs: inputs.map((f) => path.basename(f.resolved)) } : {}),
    ...(opts.from ? { from: { inbox: opts.from.inbox } } : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
    ...(factory ? { factory: factory.name } : {}),
  };
}

/** A folder run's record, its workspace its own directory in the store: fails with an `--after`'s refusal (`afterRefusal`). */
const folderRun = Effect.fn('folderRun')(function* (id: string, told: Told, steps: Run['steps']) {
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { place: { kind: 'folder' } }, parentRecord));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    place: { kind: 'folder' },
    workspace: workRoot(runsDir(), id),
    ...told,
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/** A git run's record on `repo`, on the branch checked out there (`makeWorkspace`): fails with an `--after`'s refusal (`afterRefusal`). */
const gitRun = Effect.fn('gitRun')(function* (id: string, told: Told, steps: Run['steps'], repo: string, isolate: boolean) {
  const { workspace, baseRef, branch } = yield* tried(() => makeWorkspace(repo));
  const refusedAfter = yield* tried(() => afterRefusal(told.after ?? [], { repo, branch }, parentRecord));
  if (refusedAfter) return yield* Effect.fail(new Invalid({ message: refusedAfter }));
  const run: Run = {
    id,
    repo,
    workspace,
    baseRef,
    isolate,
    ...told,
    branch,
    steps,
    createdAt: new Date().toISOString(),
  };
  return run;
});

/** Copies `inputs` into the run's own `inputs/` (`inputsDir`); throws with exit 1 when one cannot be, the run's directory removed. */
function copyInputs(run: Run, inputs: readonly InputFile[]): void {
  if (!inputs.length) return;
  const dir = inputsDir(run);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of inputs) fs.copyFileSync(f.resolved, path.join(dir, path.basename(f.resolved)), fs.constants.COPYFILE_EXCL);
  } catch (err) {
    fs.rmSync(path.dirname(dir), { recursive: true, force: true });
    throw Object.assign(
      new Error(
        `--input: the run's files could not be copied into ${dir} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
}

/**
 * Renders the steps' agents into the run's `agents/` (`writeAgentFiles`), with the skills the folder's places hold (`skillsFor`); throws
 * with exit 1 when they cannot be, the run's directory removed.
 */
function renderAgents(run: Run, steps: readonly Workflow[], workflowDir: string, places: Places): void {
  try {
    writeAgentFiles(run, steps, skillsFor(workflowDir, places));
  } catch (err) {
    fs.rmSync(path.join(runsDir(), run.id), { recursive: true, force: true });
    throw Object.assign(
      new Error(
        `the steps' agents could not be rendered into ${path.join(runsDir(), run.id, 'agents')} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
}

/** The factory a run is started in, read (`readFactory`); none for no name and for the default factory, which is no file. */
const factoryNamed = (name: string | undefined): Factory | undefined =>
  name === undefined || name === DEFAULT_FACTORY ? undefined : readFactory(name);

/**
 * The repository a run started in the factory `name` works on (`factoryRepo`): `named`, else the factory's one repository, else
 * `fallback`. What `wf start` resolves its workflow folder against, before `start` judges it. Refused as `start` refuses the factory: none
 * by that name, or one whose file does not read (`readFactory`).
 */
export const repoFor = (name: string | undefined, named: string | undefined, fallback: string): string =>
  factoryRepo(factoryNamed(name), named, fallback);

/**
 * Starts a run of `opts.workflowDir`'s steps, and returns its record, written. Requires nothing: it reads no engine.
 *
 * `after` names the runs this one waits on (`wf start --after`): refused before anything is written when one could never ship onto
 * this run's base, or when the run is a folder run, which has no branch to wait for (`afterRefusal`), and frozen on the record. Left out,
 * the record has no `after`.
 *
 * `inputs` are files to hand every step (`wf start --input`), by path from where `wf start` is typed: refused before anything is written
 * when one is not a file or two would take one name (`inputRefusal`), then copied into the run's own `inputs/` (`inputsDir`), and their
 * names frozen on the record. Left out, no directory is made, and the record has no `inputs`.
 *
 * `from` says where the brief came from — the inbox card `startFromInbox` starts — and is frozen on the record. Left out, the record has
 * none.
 *
 * `gates` are the steps whose closeout waits for a person before anything after them is filed, beside those the workflow gates itself
 * (`wf start --gate`, a card's `gate:`): refused before anything is written when one is given twice or names no step of the workflow
 * (`gateRefusal`), and frozen on the record. Left out, the record has none.
 *
 * A team that says `workspace: folder` runs no git: the repository is not looked at, and refused when a person named it (`repoNamed`); the
 * run's own directory in the store is its workspace, each step's folder made beneath it when the step is filed (`folderPlace`).
 *
 * The record's steps are keyed in the order the steps run, as `loadWorkflows` gives them: the order `wf ls`, `wf decide` and the board list
 * them in. The inputs are copied and the steps' agents rendered (`writeAgentFiles`) before the record is written, so a record never names a
 * file that is not there: a copy or a render that fails removes the run's directory, and is an `Error` with exit 1.
 *
 * `factory` names the factory the run is started in (`wf start --factory`): its hires fill the workflow's steps (`stepsToStart`), read as
 * they are now and frozen into the run's steps, so a later hire changes no run started. Refused before anything is written when it names
 * no factory, or one whose file does not read (`readFactory`), when it has not attached the workflow (`stepsIn`), and, for a git run, when
 * `repo` is not one of its repositories (`outsideRefusal`); a folder team works on none. Its name is frozen on the record. Left out, or the
 * default factory, nothing is read, and the record has no `factory`: a record that names none is the default factory's.
 *
 * Fails with the refusal it met, every one before anything is written (`stepsToStart`, `refuseInclude` and those above); dies of anything
 * else, the copy's and the render's `Error` included (`tried`).
 */
export const startRun = Effect.fn('start')(function* (opts: StartOptions) {
  const isolate = opts.isolate ?? true;
  const places = placesOf(opts.repo);
  const factory = yield* tried(() => factoryNamed(opts.factory));
  const steps = yield* tried(() => stepsToStart(opts.workflowDir, isolate, places, factory, opts.gates));
  const folder = isFolderTeam(steps);
  if (folder && opts.repoNamed) return yield* Effect.fail(new Invalid({ message: repoNamedRefusal(opts.repo) }));
  const outside = factory && !folder ? outsideRefusal(factory, opts.repo) : undefined;
  if (outside) return yield* Effect.fail(new Invalid({ message: outside }));
  const refusedGates = gateRefusal(opts.gates ?? [], steps);
  if (refusedGates) return yield* Effect.fail(new Invalid({ message: refusedGates }));
  if (!folder) yield* tried(() => refuseInclude(opts.repo, isolate));
  const inputs = yield* tried(() => inputsOf(opts.inputs ?? []));
  const refusedInputs = inputRefusal(inputs);
  if (refusedInputs) return yield* Effect.fail(new Invalid({ message: refusedInputs }));
  const id = runId(opts.brief);
  const told = toldOf(opts, steps, inputs, factory);
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const run = yield* folder ? folderRun(id, told, stepRecords) : gitRun(id, told, stepRecords, opts.repo, isolate);
  yield* tried(() => copyInputs(run, inputs));
  yield* tried(() => renderAgents(run, steps, opts.workflowDir, places));
  yield* tried(() => runStore.runs.create(run));
  return run;
});

/**
 * `wf start`'s plain face: `startRun`, run synchronously. Returns the run's record; throws the refusal the program failed with, or what it
 * died of, as it was thrown.
 */
export const start = (opts: StartOptions): Run => Effect.runSync(startRun(opts));
