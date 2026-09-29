/**
 * Starting runs: a workflow folder's run (`start`), a plan folder's cards (`startPlan`), an inbox card (`startFromInbox`), and the queue's
 * next card (`startQueued`, which the tick calls). Each refuses what it can before anything is written, and writes the run's record; nothing
 * is filed here — the tick files a run's first steps on its next pass. A controller: the runtime it reads, through the client
 * (`runtime-client.ts`), is its harnesses, which say which steps a session can be bridged for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HARNESSES, readRemote } from './runtime-client.ts';
import { remoteAgentsFile } from './harness/a2a.store.ts';
import { refusalLines } from './workspace/workspace.ts';
import { WorkflowError, type Workflow } from './step/step.ts';
import { remoteNameOf } from './harness/harness.ts';
import { fansOut, isFolderTeam } from './workflow/index.ts';
import { loadWorkflows, skillsFor, workflowFolder, workflowsIn, type Places } from './workflow-store.ts';
import {
  inboxListing,
  inboxNameRefusal,
  nextQueued,
  noCardLine,
  noWorkflowRefusal,
  parseInboxCard,
  startedRefusal,
  type InboxCard,
  type QueueStarted,
  type QueueTry,
} from './inbox/inbox.ts';
import { parsePlan, planOrder, type Card, type Planned } from './plan/plan.ts';
import { workRoot } from './record/places.store.ts';
import { gateRefusal } from './ending/ending.ts';
import { isGitRun, type Run } from './record/record.ts';
import { afterRefusal } from './wait/wait.ts';
import { inputRefusal, type InputFile } from './run.ts';
import { HOME, inputsDir, isDirectory, listRuns, runId, runsDir, writeRun } from './record/record.store.ts';
import { writeAgentFiles } from './agents/agents.store.ts';
import { makeWorkspace, readInclude } from './worktree.ts';
import { parentRecord } from './branches.ts';
import { inboxCards, inboxDir, inboxFiles, queueDir, queueTries } from './inbox/inbox.store.ts';
import { Conflict, Invalid, Missing } from './refusal/refusal.ts';

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
 * The first step that says `remote: true` where the engine refuses `claude.remoteControl` — every one of `HARNESSES` but Claude Code's, as the
 * engine's own door judges (`NOT_BRIDGED`), and on Claude Code every step but a background session (`JOB_NOT_BRIDGED`) — refused by name
 * in the engine's words, or undefined. A step without a `harness:` runs on `claude`, the engine's first.
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
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix. What `startPlan` asks of every card
 * before the first run is started. Refused:
 * - a folder that is not a workflow (`loadWorkflows`);
 * - with `isolate: false` (`--no-worktree`): a team that says `workspace: folder`, which has no base branch to work on in place; one that can
 *   run two steps at once, which would share a directory; and an ending (`workspace: main`), which would merge a result branch the run does
 *   not have into the branch it stands on;
 * - a step named for another step's check (`<step>-check`) or try (`<step>-try<n>`, `<step>-try<n>-check`): the run files those tasks
 *   under those names, and would read one task as the other;
 * - a `remote: true` the engine does not bridge (`remoteRefusal`), and a remote agent not declared (`undeclaredRefusal`): the engine refuses
 *   them only when the step is filed, with the run on the record.
 */
function stepsToStart(workflowDir: string, isolate: boolean, places: Places): Workflow[] {
  const steps = loadWorkflows(workflowDir, places);
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
  return steps;
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

/** A `.worktreeinclude` with lines `start` refuses, refused where a person is looking, rather than line by line in a daemon's log. Only a run that cuts worktrees reads the file. */
function refuseInclude(repo: string, isolate: boolean): void {
  const refused = isolate ? (readInclude(repo)?.refused ?? []) : [];
  if (refused.length) {
    throw new Invalid({
      message: `${path.join(repo, '.worktreeinclude')}: ${refusalLines(refused).join('; ')}. Each line is a gitignored path inside the repository, relative to its root — fix or remove ${refused.length === 1 ? 'that line' : 'those lines'}.`,
    });
  }
}

/**
 * `after` names the runs this one waits on (`wf start --after`): refused before anything is written when one could never ship onto
 * this run's base, or when the run is a folder run, which has no branch to wait for (`afterRefusal`), and frozen on the record. Left out,
 * the record has no `after`.
 *
 * `inputs` are files to hand every step (`wf start --input`), by path from where `wf start` is typed: refused before anything is written
 * when one is not a file or two would take one name (`inputRefusal`), then copied into the run's own `inputs/` (`inputsDir`), and their
 * names frozen on the record. Left out, no directory is made, and the record has no `inputs`.
 *
 * `from` says where the brief came from — the inbox card `startFromInbox` starts — and is frozen on the record. Left out, the record has none.
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
 * file that is not there: a copy or a render that fails removes the run's directory, and throws with exit 1.
 */
export function start(opts: {
  brief: string;
  repo: string;
  repoNamed?: boolean;
  workflowDir: string;
  isolate?: boolean;
  after?: readonly string[];
  inputs?: readonly string[];
  from?: { inbox: string };
  gates?: readonly string[];
}): Run {
  const isolate = opts.isolate ?? true;
  const places = placesOf(opts.repo);
  const steps = stepsToStart(opts.workflowDir, isolate, places);
  const folder = isFolderTeam(steps);
  if (folder && opts.repoNamed) {
    throw new Invalid({
      message:
        `--repo ${opts.repo}: this workflow's steps say \`workspace: folder\`, so the run works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${opts.repo}.\n` +
        `Start it without --repo, or start a workflow whose steps work on a repository.`,
    });
  }
  const gates = opts.gates ?? [];
  const refusedGates = gateRefusal(gates, steps);
  if (refusedGates) throw new Invalid({ message: refusedGates });
  if (!folder) refuseInclude(opts.repo, isolate);
  const inputs = (opts.inputs ?? []).map((given): InputFile => {
    const resolved = path.resolve(given);
    const at = fs.statSync(resolved, { throwIfNoEntry: false });
    return { given, resolved, kind: !at ? 'missing' : at.isFile() ? 'file' : at.isDirectory() ? 'directory' : 'other' };
  });
  const refusedInputs = inputRefusal(inputs);
  if (refusedInputs) throw new Invalid({ message: refusedInputs });
  const id = runId(opts.brief);
  const after = opts.after ?? [];
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const told = {
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
    ...(after.length ? { after: [...after] } : {}),
    ...(inputs.length ? { inputs: inputs.map((f) => path.basename(f.resolved)) } : {}),
    ...(opts.from ? { from: { inbox: opts.from.inbox } } : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
  };
  let run: Run;
  if (folder) {
    const refusedAfter = afterRefusal(after, { place: { kind: 'folder' } }, parentRecord);
    if (refusedAfter) throw new Invalid({ message: refusedAfter });
    run = {
      id,
      place: { kind: 'folder' },
      workspace: workRoot(runsDir(), id),
      ...told,
      steps: stepRecords,
      createdAt: new Date().toISOString(),
    };
  } else {
    const { workspace, baseRef, branch } = makeWorkspace(opts.repo);
    const refusedAfter = afterRefusal(after, { repo: opts.repo, branch }, parentRecord);
    if (refusedAfter) throw new Invalid({ message: refusedAfter });
    run = {
      id,
      repo: opts.repo,
      workspace,
      baseRef,
      isolate,
      ...told,
      branch,
      steps: stepRecords,
      createdAt: new Date().toISOString(),
    };
  }
  if (inputs.length) {
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
  try {
    writeAgentFiles(run, steps, skillsFor(opts.workflowDir, places));
  } catch (err) {
    fs.rmSync(path.join(runsDir(), run.id), { recursive: true, force: true });
    throw Object.assign(
      new Error(
        `the steps' agents could not be rendered into ${path.join(runsDir(), run.id, 'agents')} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`,
      ),
      { exitCode: 1 },
    );
  }
  writeRun(run);
  return run;
}

/** Where a run on `repo` looks for its steps' agents and skills beside its folder's own (`lookupRoots`): the repository, then the store. */
export const placesOf = (repo: string | undefined): Places => ({ ...(repo ? { repo } : {}), home: HOME });

/**
 * A plan folder's cards, parents first (`parsePlan`, `planOrder`): every entry of the folder handed to the pure parser — a folder inside it
 * by its name and a trailing `/`, a markdown file with its text.
 */
export function readPlan(dir: string): Card[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new WorkflowError(`no plan folder at ${dir}. A plan is a folder of cards, one <card>.md each: wf plan <folder> --repo <r>.`);
  }
  const files = entries.map((name) => {
    const at = path.join(dir, name);
    if (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory()) return { file: `${name}/`, text: '' };
    return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' };
  });
  return planOrder(parsePlan(files, dir));
}

/** What `startPlan` did: the cards it started, in order; the workflow folder each card's `workflow:` was found at; and, when a `start()` refused part-way, which card, why, and the cards after it. */
export type PlanStarted = {
  started: Planned[];
  folderOf: (card: Card) => string;
  stopped?: { card: Card; error: Error & { exitCode?: number }; rest: Card[] };
};

/**
 * `wf plan`: every card of a plan folder started, parents first, each with `start()` and `after` the runs of the cards its `after:` names —
 * the record `wf start --after` writes, so the tick, `wf ls`, `wf decide` and the board need nothing new; parents first, so every card a
 * card's `after:` names has a run by then. Nothing else is written: no plan
 * record, and no file of its own. The runs and their `after` are the plan.
 *
 * Refused before the first run is started, naming the card and the fix: a folder `parsePlan` refuses; a card whose `workflow:` names no
 * workflow folder (`workflowFolder`, from the plan folder), or one `start` would refuse — that refusal, behind the card; and a
 * `.worktreeinclude` `start` would refuse. A `start()` that refuses after that, part-way, stops the plan: the runs already started stand,
 * and `stopped` says which card refused and which are left. `startRun` is `start`, unless a test hands it one of its own.
 */
export function startPlan(opts: { dir: string; repo: string; startRun?: typeof start }): PlanStarted {
  const cards = readPlan(opts.dir);
  refuseInclude(opts.repo, true);
  const folders = new Map<string, string>();
  for (const card of cards) {
    try {
      const folder = workflowFolder(card.workflow, opts.dir, opts.repo);
      stepsToStart(folder, true, placesOf(opts.repo));
      folders.set(card.name, folder);
    } catch (err) {
      throw new Invalid({ message: `${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}` });
    }
  }
  const folderOf = (card: Card): string => folders.get(card.name)!;
  const startRun = opts.startRun ?? start;
  const started: Planned[] = [];
  for (const [i, card] of cards.entries()) {
    const runOf = new Map(started.map((p) => [p.card.name, p.runId]));
    try {
      const run = startRun({ brief: card.body, repo: opts.repo, workflowDir: folderOf(card), after: card.after.map((a) => runOf.get(a)!) });
      started.push({ card, runId: run.id, workflowDir: run.workflowDir });
    } catch (err) {
      return { started, folderOf, stopped: { card, error: err as Error, rest: cards.slice(i + 1) } };
    }
  }
  return { started, folderOf };
}

/** How to start an inbox card (`startFromInbox`): the card, and what its start says over it or beside it. */
export type InboxStart = {
  /** The card's name, as `wf inbox` lists it. */
  name: string;
  /** What the run is asked to do, in place of the card's body: the note rewritten into work. The card's body when left out. */
  brief?: string;
  /** The workflow, over the card's `workflow:`: a folder — from `from` when relative — or a name under the repository's `workflows/`. */
  workflow?: string;
  /** Where a relative `workflow` is read from: where `wf start` was typed. The current directory when left out. */
  from?: string;
  /**
   * The repository, over the card's `repo:`: named by a person at start (`wf start <card> --repo`), and refused as `start()` refuses it for a
   * team that says `workspace: folder`. The card's own `repo:` is not: the board writes one on every card it files, so a folder team takes
   * it as it takes the directory `wf start` is typed in, and never looks at it.
   */
  repo?: string;
  /** The repository when neither `repo` nor the card names one: `wf start`'s `.`, or the board's own. */
  callerRepo: string;
  /** The runs it waits on (`wf start --after`): an inbox card has no `after:`, so it is said here, at start. */
  after?: readonly string[];
  isolate?: boolean;
  inputs?: readonly string[];
  /** The steps its run is gated at (`wf start --gate`), beside the card's own `gate:`. */
  gates?: readonly string[];
};

/**
 * What `startFromInbox` did: the run, the card it started, and whether the card left the inbox — and, when not, why.
 *
 * `ignoredRepo` is the card's own `repo:` when the run looks at no repository: a folder team's does not, and a card written by hand, or
 * by a writer that does not ask `cardRepoRefusal`, may carry one. The run is started all the same, and the line says the path was not
 * looked at: said, not refused, since a card on disk cannot be edited from the board. A `repo` a person gives for such a team is refused by `start()`.
 */
export type InboxStarted = ({ run: Run; card: InboxCard; removed: true } | { run: Run; card: InboxCard; removed: false; why: string }) & {
  ignoredRepo?: string;
};

/**
 * `wf start <inbox>/<name>.md`, and the board's start of a card: a card out of the inbox started with `start()`, `from: { inbox: <name> }` on
 * its record, then removed from the inbox.
 *
 * The brief is `brief`, or else the card's body. The workflow is `workflow`, else the card's `workflow:` — found from the inbox folder as
 * `wf plan` finds a card's from its plan folder: a name under the repository's `workflows/`, or a path — else refused, naming the repository's
 * workflows. The repository is `repo`, else the card's `repo:`, else `callerRepo`. The run is gated at the card's `gate:` and at `gates`, the
 * card's first; a step both name is gated once.
 *
 * The record is written first, so a removal that fails leaves a card `wf inbox` lists as started — never a run with no trace of its card. It
 * says so in `why`, and the card is not started again (`startedRefusal`) until a person drops it. Refused by name before anything is written,
 * exit 2: a name that is not a card's (`inboxNameRefusal`), a card not there (`Missing`) — naming the cards there are — a card that does not
 * read, a card already started (`Conflict`), no workflow, a workflow that does not load behind the card, a `gate:` naming no step of it, in the card's words, and a
 * `brief` with nothing in it; and whatever `start()` refuses — an `--after`, an `--input`, a `--gate` — as it refuses it.
 */
export function startFromInbox(opts: InboxStart): InboxStarted {
  const refused = inboxNameRefusal(opts.name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${opts.name}.md`);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Missing({
      message: `${noCardLine(opts.name, inboxCards())} Start one of those — wf start ${path.join(inboxDir(), '<name>.md')} — or park the idea first: wf inbox add "<idea>".`,
    });
  }
  const card = parseInboxCard(`${opts.name}.md`, text, isDirectory);
  const started = listRuns()
    .filter((r) => r.from?.inbox === card.name)
    .map((r) => r.id);
  if (started.length) throw new Conflict({ message: startedRefusal(card, file, started) });

  const repo = opts.repo ?? card.repo ?? opts.callerRepo;
  let workflowDir: string;
  if (opts.workflow !== undefined) workflowDir = workflowFolder(opts.workflow, opts.from ?? process.cwd(), repo);
  else if (card.workflow !== undefined) {
    try {
      workflowDir = workflowFolder(card.workflow, inboxDir(), repo);
    } catch (err) {
      throw new WorkflowError(`${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}`);
    }
  } else throw new WorkflowError(noWorkflowRefusal(card, file, repo, workflowsIn(path.join(repo, 'workflows'))));
  if (opts.brief !== undefined && !opts.brief.trim()) {
    throw new WorkflowError(
      `${card.file}: the brief given in place of the card's body is empty. Give what the run is asked to do, or leave it out, and the run is asked what the card says.`,
    );
  }
  const flags = opts.gates ?? [];
  if (card.gate !== undefined) {
    const refusedGate = gateRefusal([card.gate], loadWorkflows(workflowDir, placesOf(repo)), (step) => `${card.file}: \`gate: ${step}\``);
    if (refusedGate) throw new WorkflowError(`${refusedGate} Correct the line, or delete it.`);
  }
  const gates = [...(card.gate !== undefined && !flags.includes(card.gate) ? [card.gate] : []), ...flags];

  const run = start({
    brief: opts.brief?.trim() ?? card.body,
    repo,
    repoNamed: opts.repo !== undefined,
    workflowDir,
    isolate: opts.isolate,
    after: opts.after,
    inputs: opts.inputs,
    from: { inbox: card.name },
    ...(gates.length ? { gates } : {}),
  });
  const ignoredRepo = card.repo !== undefined && !isGitRun(run) ? { ignoredRepo: card.repo } : {};
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    return { run, card, removed: false, why: `${file} could not be removed — ${(err as Error).message}`, ...ignoredRepo };
  }
  return { run, card, removed: true, ...ignoredRepo };
}

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and its `repo:` or else `repo`,
 * the daemon's — so its base is its base branch as it is now, and its brief is frozen now. Undefined with no card to start. A card whose
 * `repo:` the run looks at none of — a folder team's — carries it on `ignoredRepo`, as `wf start` says it: a tick's line (`queueLine`) is
 * the only place a daemon's start is read. The result names the repository (`on`) only for a card that names none, whose start turns on
 * where the daemon runs.
 *
 * A start that does not happen is written down (`QueueTry`), and the card left as it is. A refusal — exit 2, the package's own, by name: the
 * workflow gone, the repository gone — lasts: no pass after it tries the card while it reads the same and would be tried on the same
 * repository, and the next card has its turn. Any other failure — git failing on the repository, say — is no verdict on the card: the next
 * pass tries it again, where it keeps its place, and a failure the same as the last pass's is said as `again`, and not written again. A
 * failure is said on one line, its lines joined by ` / `; a try that cannot be written is said all the same, and the next pass tries the
 * card again. The inbox and the tries are read once. A try written for a card that is no longer queued as it was is removed on the way, or
 * on a later pass when it cannot be.
 */
export function startQueued(repo: string, runs: readonly Run[] = listRuns()): QueueStarted | undefined {
  const files = inboxFiles();
  const tries = queueTries();
  const listing = inboxListing(files, runs, isDirectory, tries);
  for (const name of tries.keys()) {
    if (listing.some((l) => l.name === name && l.tried)) continue;
    try {
      fs.rmSync(path.join(queueDir(), `${name}.json`), { force: true });
    } catch {}
  }
  const next = nextQueued(listing, repo);
  if (!next) return undefined;
  const on = next.repo ?? repo;
  const where = next.repo ? {} : { on };
  try {
    const started = startFromInbox({ name: next.name, callerRepo: repo });
    const ignored = started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {};
    return started.removed
      ? { card: next.name, run: started.run.id, removed: true, ...ignored }
      : { card: next.name, run: started.run.id, removed: false, why: started.why, ...ignored };
  } catch (err) {
    const refused = (err as { exitCode?: number }).exitCode === 2;
    const why = (err instanceof Error ? err.message : String(err))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' / ');
    const last = next.tried;
    if (!refused && last && !last.refused && last.why === why && last.repo === on)
      return { card: next.name, failed: why, again: true, ...where };
    const tried: QueueTry = { at: new Date().toISOString(), text: files.find((f) => f.file === next.file)!.text, repo: on, why, refused };
    try {
      fs.mkdirSync(queueDir(), { recursive: true });
      fs.writeFileSync(path.join(queueDir(), `${next.name}.json`), JSON.stringify(tried, null, 2));
    } catch {}
    return refused ? { card: next.name, refused: why, ...where } : { card: next.name, failed: why, again: false, ...where };
  }
}
