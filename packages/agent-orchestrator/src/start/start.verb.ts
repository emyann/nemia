/**
 * Starting a workflow folder's run (`start`): it refuses what it can before anything is written, and writes the run's record; nothing is
 * filed here — the tick files a run's first steps on its next pass. `wf plan` and the inbox start their runs through it. A controller: the
 * runtime it reads, through the client (`runtime-client.ts`), is its harnesses, which say which steps a session can be bridged for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { HARNESSES, readRemote } from '../runtime-client.ts';
import { remoteAgentsFile } from '../harness/a2a.store.ts';
import { refusalLines } from '../workspace/workspace.ts';
import { type Workflow } from '../step/step.ts';
import { remoteNameOf } from '../harness/harness.ts';
import { fansOut, isFolderTeam } from '../workflow/index.ts';
import { loadWorkflows, skillsFor, type Places } from '../folder/folder.store.ts';
import { workRoot } from '../record/places.store.ts';
import { gateRefusal } from '../ending/ending.ts';
import { type Run } from '../record/record.ts';
import { afterRefusal } from '../wait/wait.ts';
import { inputRefusal, type InputFile } from './inputs.ts';
import { HOME, inputsDir, runId, runsDir, writeRun } from '../record/record.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { makeWorkspace, readInclude } from '../workspace/worktree.store.ts';
import { parentRecord } from '../branches/branches.store.ts';
import { Invalid } from '../refusal/refusal.ts';

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
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix. What `startPlan` asks of every card
 * before the first run is started. Refused:
 * - a folder that is not a workflow (`loadWorkflows`);
 * - with `isolate: false` (`--no-worktree`): a team that says `workspace: folder`, which has no base branch to work on in place; one that
 *   can run two steps at once, which would share a directory; and an ending (`workspace: main`), which would merge a result branch the run
 *   does not have into the branch it stands on;
 * - a step named for another step's check (`<step>-check`) or try (`<step>-try<n>`, `<step>-try<n>-check`): the run files those tasks
 *   under those names, and would read one task as the other;
 * - a `remote: true` the engine does not bridge (`remoteRefusal`), and a remote agent not declared (`undeclaredRefusal`): the engine
 *   refuses them only when the step is filed, with the run on the record.
 */
export function stepsToStart(workflowDir: string, isolate: boolean, places: Places): Workflow[] {
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

/**
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
