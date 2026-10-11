/**
 * The end of a run, on disk: a workflow whose last step merges, in a real repository.
 *
 * What a gate means to `assess`, `listing` and `decision` is pure, and lives in run.test.ts. This is the part that is not: a run whose
 * ending step is never filed until a person approves it, the merge that step's own prose describes run against real git, and what the
 * checkout looks like when its check refuses.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { TaskSpec } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';
import { placeOver, unreadBy } from './place-over.ts';

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  approveRun,
  artifactFiles,
  artifactsDir,
  cancelRun,
  decideRun,
  forgetRun,
  isRepositoryRun,
  list,
  mergeRun,
  retryRun,
  roundRun,
  startRun,
  toDecideWords,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { readRun, stepsOf, runFile } = await import('../src/record/record.store.ts');
const { roundOf } = await import('../src/run.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { resumePause, putPause } = await import('../src/pause/pause.store.ts');
const { main } = await import('../src/cli/main.ts');
const { checkoutParts } = await import('../src/workspace/worktree.store.ts');
type PlaceVerb = import('../src/place/place.ts').PlaceVerb;
const { shippedGitPlace } = await import('../src/place/shipped.store.ts');
const { gitPlace } = await import('../place/git/place.ts');
type Place = import('../src/place/place.store.ts').Place;
type PlaceAnswers = import('../src/place/place.ts').PlaceAnswers;
const { PlaceService } = await import('../src/place/place.store.ts');
type PlaceOutcome<V extends PlaceVerb> = import('../src/place/place.ts').PlaceOutcome<V>;
const { stagedHere, statusMemo, mergeStaged, landingDenies, landingWords } = await import('../src/place/landing.store.ts');
const { landEnding, checkoutHold } = await import('../src/ending/ending.verb.ts');
const { filedDenies } = await import('../src/ending/ending.ts');
const { landingContract } = await import('../src/check/check.ts');
const { heldRead } = await import('../src/list/list.verb.ts');
const { merging } = await import('../src/prune/prune.verb.ts');
const { taskPhasesRead, closeoutReader, closeoutAsked, spendReader, exitVerdicts } = await import('../src/views/views.verb.ts');
type PlaceRequests = import('../src/place/place.ts').PlaceRequests;

const { headsNow, NOTHING_READ, passStanding, standingLive, standingNow, standingReader } =
  await import('../src/standing/standing.verb.ts');
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(runStore.runs.list()));

/** Whether `branch` of `run` is shipped, its standing asked now, as a person's verb asks it (`standingLive`). */
const isShipped = async (run: RepositoryRun, branch: string) => (await runPlaced(standingLive([run]))).shipped(run, branch);

/** Every branch of a run's repository and its commit, asked of the shipped place now (`headsNow`): what a memo reads a run's tips off. */
const liveHeads = (run: RepositoryRun) => headsNow(run, shippedGitPlace);

/** A run this file started on a repository, as `isShipped` reads one: a repository run. */
const repositoryRun = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/**
 * The ending of the tests' team's `dev` (`team.ts`): the file a person reads, its keys and its agent. It names `agent: shipper`, so the
 * team's agents and skills are copied beside every folder this file makes under `ROOT`.
 */
const SHIP_MD = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');
fs.cpSync(path.join(TEAM, 'agents'), path.join(ROOT, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(ROOT, 'skills'), { recursive: true });

/**
 * What the shipper's own `disallowedTools:` denies: what no step needs, and a push, a forced branch delete, a kill by name and the
 * browser's unsafe tool.
 */
const SHIPPER_DENIED = [
  'SendMessage',
  'CronCreate',
  'CronDelete',
  'RemoteTrigger',
  'Bash(git push)',
  'Bash(git push:*)',
  'Bash(git branch -D:*)',
  'Bash(git branch --delete --force:*)',
  'Bash(pkill:*)',
  'Bash(killall:*)',
  'mcp__playwright__browser_run_code_unsafe',
];
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one file committed on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'add.ts'), 'export const add = (a, b) => a + b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/**
 * `implement → ship`, with the team's `dev/ship.md` as its ending — its keys and its agent — with only its `after:` changed, since this
 * folder has no review.
 */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  assert.match(SHIP_MD, /^after: review$/m);
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review$/m, 'after: implement'));
  return dir;
};

/**
 * An engine board a test settles by hand, as gate.test.ts's: what each task was filed with, and every filing. `settle` takes a check's
 * exit code where it is given: a check settled with none did not finish (`exitVerdicts`). `list` views the tasks it is handed that were
 * filed. A check's stdout is empty unless a test gives it (`printed`), and an `Error` given in its place is what reading it throws.
 */
const board = () => {
  type Filed = { id: string; brief: string; cwd?: string; closeoutSchema?: object; config?: TaskSpec['config'] } & Record<string, unknown>;
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; exitCode?: number; printed?: string | Error }>();
  const filings: string[] = [];
  const e = promised({
    view: async (id: string) => {
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [{ n: 1, ended: null, nativeId: `native-${id}`, closeout: t.closeout, exitCode: t.exitCode ?? null, usage: null }],
        },
      };
    },
    file: async (spec: Filed) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending' });
      return spec.id;
    },
    stop: async () => {},
    forget: async (ids: string[]) => ({
      forgotten: true,
      tasks: ids.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })),
    }),
    /** A check's verdict is its attempt's exit code (`exitVerdicts`); its log and streams say nothing of it. */
    logs: async () => '(no output yet)',
    output: async (id: string, stream: 'stdout' | 'stderr') => {
      const t = tasks.get(id);
      if (t?.printed instanceof Error) throw t.printed;
      return typeof t?.exitCode === 'number' ? (stream === 'stdout' ? (t.printed ?? '') : '') : undefined;
    },
    feed: async () => ({ entries: [], cursor: 0 }),
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, exitCode });
  return { e, tasks, filings, settle };
};

/**
 * `implement ⇄ review → ship`, as the team's dev is, with its `dev/ship.md` as the ending, whose `after: review` is
 * what this folder has: what a person types `nemia round` at once the loop has handed on.
 */
const loopingFolder = (rounds = 3): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-loop-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'review.md'),
    `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: ${rounds}\n---\nreview it\n`,
  );
  fs.writeFileSync(
    path.join(dir, 'review.schema.json'),
    JSON.stringify(
      {
        type: 'object',
        properties: { again: { type: 'boolean' } },
        required: ['again'],
        additionalProperties: false,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD);
  return dir;
};

/**
 * A folder whose ONE step merges: the team's `dev/ship.md` with its `after:` dropped, which `validateMainWorkspace` allows —
 * nothing waits on it, and nothing ends the workflow beside it. Its ending is also its root, which is the one way a run with nothing filed
 * can be the run that wants the checkout.
 */
const mergeOnly = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-merge-'));
  fs.writeFileSync(path.join(dir, 'ship.md'), SHIP_MD.replace(/^after: review\n/m, ''));
  return dir;
};

/**
 * `implement → ship` with the team's ship.md's `check:` line taken out: an ending with no check of its own, whose own session runs the
 * check and commits, in its prose. Nothing of the run lands such a merge (`landsOnCheck`).
 */
const uncheckedFolder = (): string => {
  const dir = folder();
  const file = path.join(dir, 'ship.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^check: .+\n/m);
  fs.writeFileSync(file, text.replace(/^check: .+\n/m, ''));
  return dir;
};

/** A folder of one step, for a run started `--after` another. */
const oneStep = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-one-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'the check refused', artifacts: [], needs: 'read the suite' };

/** What implement does in its worktree, by default: add.ts gains `sub`. */
const addSub = (workspace: string) => fs.appendFileSync(path.join(workspace, 'add.ts'), 'export const sub = (a, b) => a - b;\n');

/** A repository, a board, a folder and the work implement does, where a test gives its own. */
type Given = { repo?: string; board?: ReturnType<typeof board>; dir?: string; work?: (workspace: string) => void };

/**
 * A run of `implement → ship` with implement done and committed on its branch: the run at its result, waiting at the ending's gate.
 *
 * A repository and a board of its own, unless it is given them: two runs of one repository, on one board, are two endings for one checkout.
 */
async function atTheGate(given: Given = {}) {
  const repo = given.repo ?? aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: given.dir ?? folder() }));
  const { e, tasks, filings, settle } = given.board ?? board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  (given.work ?? addSub)(work.workspace!);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, e, tasks, filings, settle, pass, base: git(repo, 'rev-parse', 'HEAD') };
}

test('`nemia start` on a folder with an ending says so: nothing of that step runs until a person approves it', async (t) => {
  const repo = aRepo();
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['start', 'add sub', '--repo', repo, '--workflows', folder()], promised({}));
  } finally {
    log.mock.restore();
  }
  const id = printed[0].split(' ')[0];
  assert.equal(printed[0], `${id}  2 step(s): implement → ship (shipper)`, "the team's ship.md names its agent");
  assert.ok(
    printed.includes(`ends at: ship — nothing of it runs until nemia approve ${id} ship, which is what files it`),
    printed.join('\n'),
  );
  assert.ok(!printed.some((l) => l.startsWith('gated at:')), 'an ending is not a handoff waiting to be let through');
});

test('a run stops at its ending step: nothing of it is filed, the checkout is untouched, and `nemia ls` says what is to be decided', async () => {
  const { repo, id, branch, e, filings, pass, base } = await atTheGate();
  assert.deepEqual([pass.filed, pass.status], [[], 'failed'], 'the ending is not filed, and the run reads as one waiting on a person');
  assert.deepEqual(filings, [`${id}-implement`]);
  assert.equal(readRun(id).steps.ship.taskId, null);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has not moved');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and the checkout is clean');

  const listed = await runWith(e, list(e, readRun(id)));
  assert.equal(listed.steps.find((s) => s.name === 'ship')?.status, 'awaiting approval');
  assert.deepEqual(listed.toDecide, {
    kind: 'approve',
    step: 'ship',
    says: "Stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.",
    filed: false,
  });
  assert.doesNotMatch(toDecideWords(readRun(id), listed.toDecide), /You are/, "the gate says ship.md's note, not its agent's instructions");
  const again = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(
    [again.filed, again.checked, again.tried],
    [[], [], []],
    'pass after pass, the gate is read off the world, and nothing is spent while it holds',
  );
  assert.equal(await isShipped(repositoryRun(readRun(id)), branch), false);
});

test("REFUSED at shipped defaults: an ending's gate whose result a person merged by hand — the run has shipped as git reads it, a run `--after` it starts, every screen agrees, and `nemia approve` names `nemia cancel` instead", async (t) => {
  const { repo, id, branch, e, filings } = await atTheGate();
  assert.equal(
    (await runWith(e, list(e, readRun(id)))).toDecide?.kind,
    'approve',
    'at its gate, with the branch ahead: a decision to make',
  );
  const child = await runPlaced(startRun({ brief: 'read the flag', repo, workflowDir: oneStep(), after: [id] }));
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(child.id)))).filed,
    [],
    'the child waits on a run that has not shipped: nothing of it is filed while the result is off the base',
  );

  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  assert.equal(await isShipped(repositoryRun(readRun(id)), branch), true, 'a person merged the result by hand, and nobody told the run');

  await aPass(e);
  const listed = await runWith(e, list(e, readRun(id)));
  assert.equal(listed.toDecide, undefined, 'nothing to decide: git already has the result');
  assert.deepEqual(listed.waitingOnYou, [], 'and nobody is waited on for an approval that would be refused');
  const ship = listed.steps.find((s) => s.name === 'ship')!;
  assert.deepEqual(
    [ship.status, ship.note],
    [
      'awaiting approval',
      `${branch} is on main — nothing is left for ship to merge: the run has shipped as git reads it, and nothing waits on you; close the record if you want it closed: nemia cancel ${id}`,
    ],
    "the ending's line in nemia ls says where the branch stands, and the one command there still is",
  );
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['ls', id], e);
  } finally {
    log.mock.restore();
  }
  assert.ok(!printed.some((l) => l.includes('→ to decide') || l.includes('→ waiting on you')), printed.join('\n'));
  assert.ok(
    printed.some((l) => l.includes(`${branch} is on main — nothing is left for ship to merge`)),
    printed.join('\n'),
  );

  const { decision } = await runWith(e, decideRun(id));
  assert.deepEqual(
    [decision.kind, decision.kind === 'shipped' ? decision.branches : []],
    ['shipped', [branch]],
    'nemia decide says the same before anybody closes the record: shipped',
  );
  const screen: string[] = [];
  const log2 = t.mock.method(console, 'log', (...args: unknown[]) => {
    screen.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', id], e);
  } finally {
    log2.mock.restore();
  }
  assert.ok(
    screen.some((l) =>
      l.endsWith(
        `\n\n  shipped — ${branch} is already on main\n  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel ${id}`,
      ),
    ),
    screen.join('\n'),
  );
  assert.ok(
    !screen.some((l) => l.includes('AWAITING APPROVAL') || l.includes('nemia approve')),
    `no AWAITING APPROVAL above a branch on main\n${screen.join('\n')}`,
  );

  await assert.rejects(runWith(e, approveRun(id, 'ship', 'Merge it.')), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(
      err.message,
      `${branch} is on main, so there is nothing left for ship to merge: approving would file it to merge what the base branch already has. ` +
        `The run has shipped as git reads it — nemia decide ${id} says so, and a run started --after it goes on without ship. Nothing waits on you; if you want the record closed: nemia cancel ${id}.`,
    );
    return true;
  });
  assert.deepEqual(readRun(id).approvals ?? [], [], 'nothing was written');

  for (const pass of [1, 2]) assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, [], `pass ${pass}: ship is never filed`);
  assert.deepEqual(filings, [`${id}-implement`]);
  assert.equal(readRun(id).steps.ship.taskId, null);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(child.id)))).filed,
    ['implement'],
    "the child starts on git's word: its parent has shipped",
  );

  await runWith(e, cancelRun(id));
  assert.equal(
    (await runWith(e, decideRun(id))).decision.kind,
    'cancelled',
    'the command the refusal names is honoured once the child has started: the record is closed, with nothing to decide',
  );
});

test('`nemia rm` of a run whose ending never ran and whose result a person merged by hand forgets it: the gate holds nothing, so the approval it named is not named', async () => {
  const { repo, id, branch, e } = await atTheGate();
  const held = await runWith(e, forgetRun(id));
  assert.equal(held.kind, 'refused', 'at its gate with the branch ahead, the run is held');
  assert.match(
    held.kind === 'refused' ? (held.refusal ?? '') : '',
    new RegExp(`ship waits at its gate for your approval, and it is filed once it is approved: nemia approve ${id} ship`),
  );

  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  const forgot = await runWith(e, forgetRun(id));
  assert.equal(forgot.kind, 'forgotten', forgot.kind === 'refused' ? forgot.refusal : '');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false);
});

test("an ending's gate is a decision again once the base branch no longer has the result: git is read each pass, and the approval is honoured", async () => {
  const { repo, id, branch, e, base } = await atTheGate();
  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  await aPass(e);
  assert.equal((await runWith(e, list(e, readRun(id)))).toDecide, undefined);
  git(repo, 'reset', '-q', '--hard', base);
  await aPass(e);
  const listed = await runWith(e, list(e, readRun(id)));
  assert.equal(
    listed.toDecide?.kind,
    'approve',
    "the merge reset away before anybody pushed it: the branch is ahead again, and the gate is a person's word again",
  );
  assert.match(listed.steps.find((s) => s.name === 'ship')!.note ?? '', /^approve it: nemia approve /);
  assert.equal((await runWith(e, approveRun(id, 'ship'))).approval.step, 'ship');
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, ['ship']);
});

test("an approved ending with no check of its own is filed, in the repository's own checkout, and the merge its prose describes ships the run", async () => {
  const { repo, id, branch, e, tasks, settle, base } = await atTheGate({ dir: uncheckedFolder() });
  const { approval } = await runWith(e, approveRun(id, 'ship', 'Merge it.'));
  assert.deepEqual([approval.step, approval.try], ['ship', 1]);

  const filed = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(filed.filed, ['ship'], 'the approval is what files it');
  const spec = tasks.get(`${id}-ship`)!.spec;
  assert.equal(spec.cwd, repo, "in the repository's own checkout, not a worktree");
  assert.equal(readRun(id).steps.ship.workspace, repo);
  assert.match(spec.brief, new RegExp(`You are in ${repo}, the repository's own checkout, on main`), 'told where the work is: the base');
  assert.match(spec.brief, new RegExp(`git log --oneline main\\.\\.${branch}`), 'and the branch');
  assert.match(spec.brief, /## Approved\n\nA person approved this step before it was filed/);
  assert.match(spec.brief, /Merge it\./, 'and what the person said when they approved it');
  assert.doesNotMatch(
    spec.brief,
    /## The run checks and lands your merge/,
    "with no check of its own it is told nothing of the run's landing, which it does not have",
  );
  assert.deepEqual(
    (spec.config as { disallowedTools?: string[] }).disallowedTools,
    SHIPPER_DENIED,
    "its recipe's fallback is its own: it commits the merge itself, and is denied only what its agent denies",
  );

  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  const files = spec.brief.match(
    /## Files for the person who decides\n\nA report, a log or a screenshot reaches them one way: put it in `([^`]+)`/,
  )?.[1];
  assert.ok(
    files && path.isAbsolute(files) && !files.startsWith(repo),
    `the brief names a directory outside the checkout\n\n${spec.brief}`,
  );
  const message = path.join(files, 'merge-message.txt');
  fs.writeFileSync(
    message,
    `Add sub\n\nadd.ts exports sub beside add.\nRun ${id}, ${branch}: 1 commit; the check passed on the merged tree.\n`,
  );
  git(repo, 'commit', '-F', message);
  const merged = git(repo, 'rev-parse', 'HEAD');
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, artifacts: [message] });
  await runWith(e, advanceRun(readRun(id)));

  const record = readRun(id);
  assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base, 'the base branch has moved');
  assert.equal(
    git(repo, 'log', '-1', '--format=%s'),
    'Add sub',
    "the step, played as its prose says, commits under the subject it wrote into its files directory, with -F: not git's Merge branch",
  );
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout, the message included');
  assert.equal(await isShipped(repositoryRun(record), branch), true);
  const { decision, toDecide, standings } = await runWith(e, decideRun(id));
  assert.deepEqual([decision.kind, toDecide, standings], ['shipped', undefined, [{ branch, where: 'on' }]]);
  assert.equal(
    git(repo, 'rev-parse', 'HEAD'),
    merged,
    "the run committed nothing of its own in that checkout: the merge commit is the step's, and the only one",
  );
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 2, 'a merge, of the base and the branch');
  assert.equal(record.steps.ship.landed, undefined, 'and the run wrote nothing of a landing it did not make');
  assert.equal(record.steps.ship.check, undefined, 'nor filed a check');
});

test('the place reads the checkout as a landing needs it: whose merge is staged, a conflict, a result branch it leaves out; land ends it', () => {
  const repo = aRepo();
  const branch = (name: string, file: string, text: string) => {
    git(repo, 'checkout', '-q', '-b', name, 'main');
    fs.writeFileSync(path.join(repo, file), text);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', name);
    git(repo, 'checkout', '-q', 'main');
    return git(repo, 'rev-parse', name);
  };
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const placed = gitPlace({ env });
  const answered = <V extends PlaceVerb>(verb: V, request: PlaceRequests[V]) => {
    const outcome = placed.askNow(verb, request);
    assert.ok('answer' in outcome, `${verb} answered: ${JSON.stringify(outcome)}`);
    return outcome.answer;
  };
  const status = (checkout: string, tips: Record<string, string>) => answered('status', { checkout, tips });
  const land = (checkout: string, act: { act: 'commit'; message: string } | { act: 'abort' }) =>
    placed.askNow('land', { checkout, ...act });
  const stagedIn = (root: string) => ({ stagedFile: answered('open', { root, isolate: false }).staged });
  const a = branch('wf/r/a', 'a.ts', 'a\n');
  const b = branch('wf/r/b', 'b.ts', 'b\n');
  const base = git(repo, 'rev-parse', 'HEAD');
  const tips = { 'wf/r/a': a, 'wf/r/b': b };
  const marker = stagedIn(repo);
  assert.deepEqual(status(repo, tips), { merging: 'none', conflicted: false, missing: ['wf/r/a', 'wf/r/b'], head: base });
  assert.equal(stagedHere(marker), false);

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a');
  assert.equal(stagedHere(marker), true, 'read off the file open named alone, which is all a pass asks of a checkout with no landing due');
  assert.deepEqual(status(repo, tips), { merging: 'ours', conflicted: false, missing: ['wf/r/b'], head: base }, 'one branch of two staged');
  assert.equal(status(repo, { 'wf/r/b': b }).merging, 'other', "a merge of a commit that is not one of the run's tips is another's");
  assert.deepEqual(land(repo, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(git(repo, 'status', '--porcelain'), '');
  const nothing = land(repo, { act: 'abort' });
  assert.ok('refused' in nothing, 'with nothing to abort, the place refuses');
  assert.match(nothing.refused, /MERGE_HEAD|no merge/i, "and says why, in git's words");

  git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/a', 'wf/r/b');
  assert.deepEqual(status(repo, tips), { merging: 'ours', conflicted: false, missing: [], head: base });
  const made = land(repo, { act: 'commit', message: 'Add a and b\n\nboth.\n' });
  assert.ok('answer' in made && 'commit' in made.answer);
  assert.equal(git(repo, 'log', '-1', '--format=%B'), 'Add a and b\n\nboth.');
  assert.equal(git(repo, 'log', '-1', '--format=%P').split(' ').length, 3, 'an octopus of the base and both tips');
  assert.deepEqual(status(repo, tips), { merging: 'none', conflicted: false, missing: [], head: made.answer.commit }, 'both on HEAD');

  const c1 = branch('wf/r/c1', 'c.ts', 'one\n');
  const c2 = branch('wf/r/c2', 'c.ts', 'two\n');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'c1', 'wf/r/c1');
  assert.throws(() => git(repo, 'merge', '--no-ff', '--no-commit', 'wf/r/c2'));
  assert.deepEqual(
    status(repo, { 'wf/r/c1': c1, 'wf/r/c2': c2 }).conflicted,
    true,
    'a conflict is staged as a merge in progress, with its paths unmerged',
  );
  assert.ok('refused' in land(repo, { act: 'commit', message: 'never\n' }), 'the place refuses to commit a conflict');
  assert.deepEqual(land(repo, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(stagedHere(marker), false);

  const linked = path.join(path.dirname(repo), `${path.basename(repo)}-linked`);
  const d = branch('wf/r/d', 'd.ts', 'd\n');
  git(repo, 'worktree', 'add', '-q', '-b', 'side', linked, 'main');
  assert.ok(fs.statSync(path.join(linked, '.git')).isFile(), "a linked worktree's .git is a file naming its own git directory");
  const linkedMarker = stagedIn(linked);
  git(linked, 'merge', '--no-ff', '--no-commit', 'wf/r/d');
  assert.equal(stagedHere(linkedMarker), true, 'and its merge is read there, off the file open named for it');
  assert.equal(stagedHere(marker), false, "the main checkout's own merge is its own");
  assert.equal(status(linked, { 'wf/r/d': d }).merging, 'ours');
  assert.deepEqual(land(linked, { act: 'abort' }), { answer: { aborted: true } });
  assert.equal(stagedHere(linkedMarker), false);
  assert.equal(stagedHere({ stagedFile: path.join(repo, 'no-such', 'MERGE_HEAD') }), false, 'no checkout, no merge');
});

const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';

/**
 * A run at its ending, approved and filed, whose shipper did as its recipe says: staged the merge of the result in the repository's
 * checkout and signed off `done` with the message — and the pass after, which files ship's check on that merge.
 */
async function stagedAndSigned(given: Given & { message?: string; artifacts?: string[] } = {}) {
  const at = await atTheGate(given);
  await runWith(at.e, approveRun(at.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(at.e, advanceRun(readRun(at.id)))).filed, ['ship']);
  git(at.repo, 'merge', '--no-ff', '--no-commit', at.branch);
  at.settle(`${at.id}-ship`, 'succeeded', { ...SIGNED, artifacts: given.artifacts ?? [], message: given.message ?? MESSAGE });
  const signed = await runWith(at.e, advanceRun(readRun(at.id)));
  return { ...at, signed, checkId: `${at.id}-ship-check` };
}

const mergeHead = (repo: string): boolean => fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));

/**
 * What the ship's check leaves in its files directory when its e2e runs on the merged tree (`WF_ARTIFACTS`): a picture per page and
 * theme, `-failed` for a page that failed. By default the shape of a web run's `artifacts/ship` in the owner's store: 252 of them,
 * about 194 KB each, 48.9 MB. The bytes in the directory before, to measure what a landing frees.
 */
const photographed = (id: string, { count = 252, bytes = 194_000 } = {}): { dir: string; pictures: string[]; before: number } => {
  const dir = artifactsDir({ id }, 'ship');
  fs.mkdirSync(dir, { recursive: true });
  const pictures = Array.from({ length: count }, (_, i) => `page-${String(i).padStart(3, '0')}-${i % 2 ? 'dark' : 'light'}.png`);
  pictures[0] = 'answer-light-failed.png';
  for (const name of pictures) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
  return { dir, pictures, before: bytesIn(dir) };
};
const bytesIn = (dir: string): number =>
  artifactFiles({ id: path.basename(path.dirname(path.dirname(dir))) }, 'ship').reduce((sum, f) => sum + f.bytes, 0);
const pngsIn = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.png'))
        .sort()
    : [];

test("an approved ending stages the merge and signs off its message; the run executes ship's check on the merged tree, and commits the merge only on its exit 0", async () => {
  const { repo, id, branch, e, tasks, settle, base, signed, checkId } = await stagedAndSigned();
  const spec = tasks.get(`${id}-ship`)!.spec;
  assert.match(
    spec.brief,
    /## The run checks and lands your merge\n\nOnce you sign off, the run executes `npm test && npm run typecheck && /,
    'told what the run does with what it stages',
  );
  assert.match(spec.brief, /do not run\nthe check, commit, or abort a clean merge yourself/);
  assert.doesNotMatch(spec.brief, /This workflow's check, which its work was judged by/, "not told the work's check as one to run");
  assert.deepEqual(
    (spec.closeoutSchema as { required: string[] }).required.slice(-1),
    ['message'],
    'asked for the message in its closeout',
  );
  assert.deepEqual(
    (spec.config as { disallowedTools?: string[] }).disallowedTools,
    [...SHIPPER_DENIED, 'Bash(git commit:*)', 'Bash(git merge --continue:*)'],
    "the session may not commit the merge it stages — the run does, on the check's word — beside what the shipper's own disallowedTools denies (filedDenies)",
  );

  assert.deepEqual(signed.checked, ['ship']);
  const check = tasks.get(checkId)!.spec;
  assert.deepEqual(
    [check.harness, check.cwd, check.deadlineSeconds],
    ['check', repo, 2700],
    "the check is filed as any step's is, on the check harness, in the checkout where the merge is, but with a landing's own deadline: " +
      'the e2e on the merged tree runs in it (`LANDING_CHECK_DEADLINE_SECONDS`)',
  );
  const command = readRun(id).workflow!.find((s) => s.name === 'ship')!.check!;
  assert.deepEqual(check.config?.command, ['sh', '-c', command], 'the command frozen on the record, with no install to run first');
  const env = check.config?.env ?? {};
  assert.equal(env.WF_BASE_REF, undefined, 'no WF_BASE_REF: what it judges is the merge, which the command reads off MERGE_HEAD');
  assert.equal(env.WF_WORKSPACE, repo);
  assert.deepEqual(
    Object.keys(env).filter((k) => !/^WF_[A-Z_]+$/.test(k) || k === 'WF_STDERR' || k === 'WF_STDOUT'),
    [],
    'only WF_ names, and none for streams the runtime keeps',
  );
  assert.equal((await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status, 'checking');

  for (const phase of ['pending', 'running'] as const) {
    settle(checkId, phase);
    await runWith(e, advanceRun(readRun(id)));
    assert.equal(
      git(repo, 'rev-parse', 'HEAD'),
      base,
      `${phase}: nothing lands while the check runs, and the base branch stays where it was`,
    );
    assert.equal(mergeHead(repo), true, `${phase}: nothing is taken back, and the merge stays staged`);
  }

  const shot = photographed(id);
  await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), "what the check's e2e took of the merged tree stays while it runs");

  settle(checkId, 'succeeded', undefined, 0);
  const landed = await runWith(e, advanceRun(readRun(id)));
  const head = git(repo, 'rev-parse', 'HEAD');
  assert.notEqual(head, base, 'the base branch has moved');
  assert.equal(git(repo, 'log', '-1', '--format=%B'), MESSAGE.trim(), 'under the message the step signed off, whole');
  assert.equal(git(repo, 'log', '-1', '--format=%(trailers)'), '', 'with no trailer');
  assert.equal(git(repo, 'log', '-1', '--format=%P'), `${base} ${git(repo, 'rev-parse', branch)}`, 'a merge, of the base and the branch');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'and nothing is left in the checkout');
  assert.equal(mergeHead(repo), false);
  assert.deepEqual(readRun(id).steps.ship.landed, { commit: head });
  assert.ok(
    landed.notes.includes(`ship: its check passed on the merge, and the run committed its merge onto main as ${head.slice(0, 7)}`),
    landed.notes.join('\n'),
  );
  assert.deepEqual(pngsIn(shot.dir), [], 'landed, its pictures of the merged tree are read by nobody: removed on the pass that lands');
  assert.ok(
    landed.notes.includes(
      'ship: removed the 252 pictures its check took of the merged tree (46.6 MB); e2e-pictures.txt says what they were',
    ),
    landed.notes.join('\n'),
  );
  const note = fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8');
  assert.match(
    note,
    new RegExp(
      `^ship's check passed on the merge, and the run committed it as ${head.slice(0, 12)}\\.\nSo the run removed the 252 pictures`,
    ),
  );
  assert.ok(note.includes(`ae logs ${checkId}; its stderr: ae output ${checkId} stderr`), note);
  assert.ok(note.includes('  answer-light-failed.png  189.5 KB\n'), note);
  const after = bytesIn(shot.dir);
  assert.equal(shot.before, 252 * 194_000);
  assert.equal(after, Buffer.byteLength(note), 'a note in their place');
  assert.ok(
    shot.before - after > 48_000_000,
    `on the store's shape, every byte of them less the note's is freed: freed ${shot.before - after} of ${shot.before} bytes`,
  );
  assert.equal(landed.status, 'succeeded');
  const { decision } = await runWith(e, decideRun(id));
  assert.equal(decision.kind, 'shipped');
  const shipLine = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!;
  assert.equal(shipLine.status, 'verified ✓');
  assert.equal(
    shipLine.note,
    `the run committed its merge onto main as ${head.slice(0, 7)}`,
    'nemia ls, and the board after it, say what landed — the commit — where nothing else of a run names it',
  );

  fs.writeFileSync(path.join(shot.dir, 'late.png'), 'a picture put there after the landing');
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head, 'once for the try: a pass after it commits nothing more, whatever the checkout holds');
  assert.deepEqual(pngsIn(shot.dir), ['late.png'], 'and removes nothing more');
  assert.equal(fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8'), note, 'nor writes the note again');
});

test("REFUSED at shipped defaults: an ending in the checkout reads its run's artifacts through the rule the run files it with, and no `settings.local.json`; a step in a worktree is filed with no such rule", async () => {
  const { repo, id, tasks } = await stagedAndSigned();
  const notes = path.join(artifactsDir({ id }, 'implement'), 'notes.md');
  fs.mkdirSync(path.dirname(notes), { recursive: true });
  fs.writeFileSync(notes, 'what the implement step left for the ending\n');
  const runArtifacts = path.join(ROOT, 'runs', id, 'artifacts');
  const rule = `Read(/${runArtifacts}/**)`;
  const allows = (task: string) => (tasks.get(task)!.spec.config as { allowedTools?: string[] }).allowedTools ?? [];

  assert.ok(
    allows(`${id}-ship`).includes(rule),
    `the ending is given a read of its own run's artifacts: ${allows(`${id}-ship`).join(', ')}`,
  );
  assert.equal(rule.startsWith('Read(//'), true, "an absolute path, in the rule's `//` form");
  assert.ok(path.relative(runArtifacts, notes).split(path.sep)[0] !== '..', 'and the file the implement step left lies under it');
  assert.equal(
    fs.existsSync(path.join(repo, '.claude', 'settings.local.json')),
    false,
    'with no local settings in the checkout to give it',
  );
  assert.ok(
    !allows(`${id}-implement`).some((r) => r.startsWith('Read(')),
    `a step in a worktree is filed with its own rules only: ${allows(`${id}-implement`).join(', ')}`,
  );
  const mounts = (task: string) => (tasks.get(task)!.spec.config as { mounts?: unknown }).mounts;
  assert.deepEqual(
    mounts(`${id}-ship`),
    [{ path: artifactsDir({ id }, 'implement'), readOnly: true }],
    'and the ending is filed the folder of the step it comes after, read-only, beside its allow, and not its own',
  );
});

/** `npm`, offline, in a directory: a workspace-only tree needs no registry, and a test never reaches one. */
const npm = (cwd: string, ...args: string[]) =>
  execFileSync('npm', [...args, '--offline', '--no-audit', '--no-fund'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * A repository as npm workspaces leave it: `packages/a` a workspace package, the lockfile npm writes committed on main, and `node_modules`
 * installed from it in the checkout — as a person's checkout is, by the `npm install` they last ran on main.
 */
const anNpmRepo = (): string => {
  const repo = aRepo();
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', private: true, workspaces: ['packages/*'] }));
  fs.mkdirSync(path.join(repo, 'packages', 'a'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'packages', 'a', 'package.json'), JSON.stringify({ name: 'a', version: '1.0.0' }));
  fs.writeFileSync(path.join(repo, 'packages', 'a', 'index.js'), "module.exports = 'a';\n");
  fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  npm(repo, 'install', '--package-lock-only');
  npm(repo, 'install');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'workspaces');
  return repo;
};

/** implement's work that brings a dependency: a workspace package `b`, and the lockfile npm writes for it, as a branch commits both. */
const addB = (workspace: string) => {
  fs.mkdirSync(path.join(workspace, 'packages', 'b'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'packages', 'b', 'package.json'), JSON.stringify({ name: 'b', version: '1.0.0' }));
  fs.writeFileSync(path.join(workspace, 'packages', 'b', 'index.js'), "module.exports = 'b';\n");
  npm(workspace, 'install', '--package-lock-only');
};

/** The team's folder, its ship's `check:` a line that needs package `b` installed where it runs, as a typecheck needs `@types/js-yaml`. */
const requiringB = (): string => {
  const dir = folder();
  const ship = path.join(dir, 'ship.md');
  const text = fs.readFileSync(ship, 'utf8');
  assert.match(text, /^check: .+$/m);
  fs.writeFileSync(ship, text.replace(/^check: .+$/m, `check: node -e "require('b')"`));
  return dir;
};

/** The check the run filed, run as the engine's worker runs it, in the checkout, with `npm` offline and a `PATH` a test may put first. */
const runCheck = (tasks: ReturnType<typeof board>['tasks'], checkId: string, repo: string, first?: string) => {
  const [cmd = '', ...args] = tasks.get(checkId)!.spec.config?.command ?? [];
  const PATH = first ? `${first}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH;
  return spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', env: { ...process.env, PATH, npm_config_offline: 'true' } });
};

/** Each entry under a `node_modules`, a level down, with what it is and when it changed: what an install would change. */
const modulesOf = (repo: string): string[] =>
  fs
    .readdirSync(path.join(repo, 'node_modules'), { recursive: true, withFileTypes: false })
    .map(String)
    .sort()
    .map((rel) => {
      const st = fs.lstatSync(path.join(repo, 'node_modules', rel));
      return `${rel} ${st.isSymbolicLink() ? 'link' : st.isDirectory() ? 'dir' : 'file'} ${st.mtimeMs}`;
    });

test("an ending's merge that brings a dependency: its check installs what the merged lockfile asks for in the checkout, first, says so, and lands — package.json and package-lock.json as the merge staged them", async () => {
  const repo = anNpmRepo();
  const { id, e, tasks, settle, signed, checkId, base } = await stagedAndSigned({ repo, dir: requiringB(), work: addB });
  assert.throws(() => execFileSync('node', ['-e', "require('b')"], { cwd: repo, stdio: 'ignore' }), 'the checkout does not have b yet');

  const filed = tasks.get(checkId)!.spec;
  assert.equal(filed.brief, `node -e "require('b')"`);
  assert.deepEqual(filed.config?.command?.slice(0, 2), ['sh', '-c']);
  assert.match(filed.config?.command?.[2] ?? '', /\nnode -e "require\('b'\)"$/, 'the install first, then the check on a line of its own');
  assert.ok(
    signed.notes.includes(
      "ship: the merge's package-lock.json asks for node_modules/b, which the checkout's node_modules does not have: its check runs npm install there first",
    ),
    signed.notes.join('\n'),
  );

  const r = runCheck(tasks, checkId, repo);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\[nemia check\] the staged merge asks for packages this checkout has not installed: npm install --no-save/m);
  assert.equal(fs.realpathSync(path.join(repo, 'node_modules', 'b')), fs.realpathSync(path.join(repo, 'packages', 'b')));
  git(repo, 'diff', '--quiet');
  assert.match(
    git(repo, 'diff', '--cached', '--name-only'),
    /^package-lock\.json$/m,
    "the merge owns the manifests: the working tree still matches what it staged, and what it staged is the branch's lockfile",
  );

  settle(checkId, 'succeeded', undefined, 0);
  await runWith(e, advanceRun(readRun(id)));
  const landed = readRun(id).steps.ship.landed;
  assert.ok(landed && 'commit' in landed, JSON.stringify(landed));
  assert.equal(git(repo, 'rev-parse', 'HEAD^1'), base);
  assert.equal(git(repo, 'status', '--porcelain'), '', 'nothing left in the checkout');
});

test("an ending's merge whose lockfile is main's: its check installs nothing, and the checkout's node_modules is as it was", async () => {
  const repo = anNpmRepo();
  const before = modulesOf(repo);
  const { tasks, signed, checkId } = await stagedAndSigned({ repo, dir: requiringB() });
  assert.deepEqual(tasks.get(checkId)!.spec.config?.command, ['sh', '-c', `node -e "require('b')"`], 'the check alone, no install');
  assert.equal(
    signed.notes.some((n) => n.includes('npm install')),
    false,
    signed.notes.join('\n'),
  );

  const bin = fs.mkdtempSync(path.join(ROOT, 'npm-'));
  fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\ntouch ${JSON.stringify(path.join(bin, 'called'))}\n`, { mode: 0o755 });
  const r = runCheck(tasks, checkId, repo, bin);
  assert.equal(r.status, 1, `the check refuses on its own command, which needs b\n${r.stdout}${r.stderr}`);
  assert.equal(
    fs.existsSync(path.join(bin, 'called')),
    false,
    'npm was not called: the one first on the PATH leaves a mark, and there is none',
  );
  assert.deepEqual(modulesOf(repo), before);
});

test("a merge its check refused is aborted with the branch's packages left installed; the next `npm install` on main takes them out", async () => {
  const repo = anNpmRepo();
  const { id, e, tasks, settle, checkId } = await stagedAndSigned({ repo, dir: requiringB(), work: addB });
  assert.equal(runCheck(tasks, checkId, repo).status, 0);
  settle(checkId, 'failed', undefined, 1);
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(mergeHead(repo), false, 'aborted');
  assert.ok(readRun(id).steps.ship.landed && 'aborted' in readRun(id).steps.ship.landed!);
  assert.equal(fs.existsSync(path.join(repo, 'packages', 'b')), false, 'the branch is gone from the checkout');
  assert.ok(fs.lstatSync(path.join(repo, 'node_modules', 'b')).isSymbolicLink(), 'and its package is still installed');
  assert.equal(checkoutParts(repo), null, 'a package the lockfile does not name is not looked for');

  assert.match(npm(repo, 'install'), /removed 1 package/, "npm install on main removes what main's lockfile does not name");
  assert.equal(fs.existsSync(path.join(repo, 'node_modules', 'b')), false);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test("REFUSED at shipped defaults: a landing removes only the check's pictures — a picture the ending's closeout names, a file that is no picture, one in a folder, and a link are kept, and nothing is removed through a link", async () => {
  const outside = path.join(fs.mkdtempSync(path.join(ROOT, 'outside-')), 'kept.png');
  fs.writeFileSync(outside, "not the run's");
  const { id, e, settle, checkId } = await stagedAndSigned();
  const dir = artifactsDir({ id }, 'ship');
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  for (const name of ['named.png', 'also-named.png', 'page-light.png', 'trace.txt', 'shots/deep.png'])
    fs.writeFileSync(path.join(dir, name), name);
  fs.symlinkSync(outside, path.join(dir, 'link.png'));
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, artifacts: [path.join(dir, 'named.png'), 'also-named.png'], message: MESSAGE });
  settle(checkId, 'succeeded', undefined, 0);
  await runWith(e, advanceRun(readRun(id)));
  assert.ok('commit' in readRun(id).steps.ship.landed!, 'it landed');
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    ['also-named.png', 'e2e-pictures.txt', 'link.png', 'named.png', 'shots', 'trace.txt'],
    'the two pictures the closeout names, by absolute path in its directory and from the workspace root, are kept',
  );
  assert.deepEqual(fs.readdirSync(path.join(dir, 'shots')), ['deep.png']);
  assert.equal(fs.readFileSync(outside, 'utf8'), "not the run's", 'and what the link leads to is untouched');
  assert.match(
    fs.readFileSync(path.join(dir, 'e2e-pictures.txt'), 'utf8'),
    /removed the 1 picture the check[^]*\n {2}page-light\.png {2}14 B\n/,
  );
});

for (const [said, exitCode, words] of [
  ['refuses', 1, 'its check refused the merge (exit 1)'],
  ['does not finish', undefined, 'its check did not finish'],
] as const) {
  test(`REFUSED at shipped defaults: a check that ${said} on the merge has the run abort it — the base branch never moves, and a try of ship merges again, never --recheck`, async (t) => {
    const { repo, id, e, tasks, settle, base, checkId } = await stagedAndSigned();
    const shot = photographed(id, { count: 4, bytes: 10 });
    settle(checkId, 'failed', undefined, exitCode);
    const pass = await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      pngsIn(shot.dir),
      [...shot.pictures].sort(),
      "nothing landed, so every picture stays for whoever reads why, the failed page's among them",
    );
    assert.equal(fs.existsSync(path.join(shot.dir, 'e2e-pictures.txt')), false, 'and no note stands in for them');
    assert.ok(!pass.notes.some((n) => n.includes('pictures')), pass.notes.join('\n'));
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing landed');
    assert.equal(git(repo, 'status', '--porcelain'), '', 'and the checkout is as it was: the merge was aborted');
    assert.equal(mergeHead(repo), false);
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: words, ...(exitCode === undefined ? {} : { refusedOn: base }) },
      'a refusal names the base the merge was staged on, which `nemia merge` reads; a check that did not finish names none',
    );
    assert.ok(pass.notes.includes(`ship: ${words}, so the run aborted its merge; nothing landed on main`), pass.notes.join('\n'));
    const shipLine = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!;
    assert.equal(shipLine.status, `failed ✗ check (${exitCode === undefined ? 'unfinished' : 'exit 1'})`);
    assert.equal(shipLine.note, `nothing landed on main: ${words}`, 'and why nothing landed');

    const printed = (await decideLines(t, e, id)).flatMap((l) => l.split('\n'));
    const line = printed.find((l) => l.trimStart().startsWith('ship: '))?.trim();
    assert.ok(line, printed.join('\n'));
    assert.ok(line.includes(`nemia retry ${id} ship`), line);
    assert.ok(!printed.some((l) => l.includes('--recheck')), printed.join('\n'));
    if (exitCode === undefined)
      assert.equal(
        line,
        `ship: its check did not finish, so the run aborted the merge and nothing landed on main. Merge and check again:  nemia retry ${id} ship`,
      );

    await assert.rejects(runWith(e, retryRun(id, 'ship', { mode: 'recheck' })), (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.match(
        err.message,
        new RegExp(
          `^--recheck runs a step's check again on the work as it stands, and ship's check was run on the merge ship staged in the repository's checkout, which the run aborted when its check ${exitCode === undefined ? 'did not finish' : 'refused it'}: there is nothing staged for it to judge\\. Merge and check again, in a new try of ship: nemia retry ${id} ship\\.$`,
        ),
      );
      return true;
    });
    await runWith(e, retryRun(id, 'ship', { mode: 'nudge' }));
    assert.deepEqual(
      (await runWith(e, advanceRun(readRun(id)))).tried,
      ['ship'],
      'the try the refusal names is honoured: a new try of ship, which stages the merge again and is checked again',
    );
    assert.equal(readRun(id).steps.ship.landed, undefined, 'and the new try has landed nothing yet');
    const again = tasks.get(readRun(id).steps.ship.taskId!)!.spec.config as { disallowedTools?: string[]; allowedTools?: string[] };
    assert.ok(again.disallowedTools?.includes('Bash(git commit:*)'), 'and it may not commit the merge either');
    assert.ok(
      again.allowedTools?.includes(`Read(/${path.join(ROOT, 'runs', id, 'artifacts')}/**)`),
      "and it reads its run's artifacts again",
    );
  });
}

test('a pass after a restart does what the last one would have: a merge committed before the run wrote it down is recorded as landed, never committed twice, and one aborted by hand is recorded as nothing landed', async () => {
  {
    const { repo, id, e, settle, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    git(repo, 'commit', '-q', '-m', 'the commit the pass made before it died');
    const head = git(repo, 'rev-parse', 'HEAD');
    const shot = photographed(id, { count: 3, bytes: 10 });
    fs.writeFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'the note of the pass that died\n');
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { commit: head },
      "the daemon died after git commit and before it wrote the record: the next pass reads the result on the checkout's HEAD",
    );
    assert.deepEqual(pngsIn(shot.dir), [], 'the pass that died had removed some of the pictures, and the rest go');
    assert.equal(
      fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8'),
      'the note of the pass that died\n',
      'and the note it wrote, which lists them all, is left as it is',
    );
    assert.equal(git(repo, 'rev-parse', 'HEAD'), head, 'nothing committed again');
    assert.equal((await runWith(e, decideRun(id))).decision.kind, 'shipped');
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    const shot = photographed(id, { count: 3, bytes: 10 });
    settle(checkId, 'failed', undefined, 1);
    git(repo, 'merge', '--abort');
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'its check refused the merge (exit 1)' },
      'after git merge --abort of a refused merge, what the check said is recorded, and nothing is aborted again',
    );
    assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), 'nothing landed: every picture is kept');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    git(repo, 'merge', '--abort');
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(readRun(id).steps.ship.landed, {
      aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed',
    });
    assert.equal(
      git(repo, 'rev-parse', 'HEAD'),
      base,
      'a check that passed on a merge no longer staged commits nothing: the run does not merge again on its own',
    );
  }
});

test("REFUSED at shipped defaults: a merge in the checkout that is not the run's is never touched — committed nor aborted — with nothing of the ending running", async () => {
  const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
  settle(checkId, 'succeeded', undefined, 0);
  git(repo, 'merge', '--abort');
  git(repo, 'checkout', '-q', '-b', 'theirs');
  fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'mul');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'merge', '--no-ff', '--no-commit', 'theirs');
  const theirs = git(repo, 'rev-parse', 'theirs');
  for (let pass = 0; pass < 2; pass++) {
    await runWith(e, advanceRun(readRun(id)));
    assert.equal(
      fs.readFileSync(path.join(repo, '.git', 'MERGE_HEAD'), 'utf8').trim(),
      theirs,
      "a person took the checkout for a merge of their own before the pass landed the run's: their merge is still staged",
    );
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
    assert.equal(readRun(id).steps.ship.landed, undefined, 'and the run has written nothing of its own merge yet');
  }
  git(repo, 'merge', '--abort');
  await runWith(e, advanceRun(readRun(id)));
  assert.match(
    String((readRun(id).steps.ship.landed as { aborted?: string }).aborted),
    /no longer staged/,
    "once theirs is done, the run's merge is read as gone",
  );
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'and nothing of it is committed');
});

test('REFUSED at shipped defaults: a merge the run is not to commit is aborted — the run called off while its check ran, a message left blank, and a commit git refuses', async () => {
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    await runWith(e, cancelRun(id));
    settle(checkId, 'stopped');
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'the run was called off before its merge was committed' },
      'called off while the check runs on the merge: the check stops, and the merge is taken back, cancelled or not',
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned({ message: '  \n' });
    settle(checkId, 'succeeded', undefined, 0);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'ship signed off no commit message' },
      "signed off with no message, the check passed: nothing is committed under git's default or none",
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    fs.writeFileSync(
      path.join(repo, '.git', 'hooks', 'commit-msg'),
      '#!/bin/sh\necho "commit-msg: refused by the hook" >&2\necho "  see CONTRIBUTING" >&2\nexit 1\n',
      { mode: 0o755 },
    );
    const shot = photographed(id, { count: 3, bytes: 10 });
    settle(checkId, 'succeeded', undefined, 0);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), 'its check passed and nothing landed: every picture is kept');
    const landed = readRun(id).steps.ship.landed as { aborted: string };
    assert.match(
      landed.aborted,
      /^the place refused the commit of its merge: .*refused by the hook \/ see CONTRIBUTING$/,
      "a hook refused the commit: the merge is aborted, and the place's words, git's lines, are on the record, joined on one",
    );
    const note = (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.note!;
    assert.match(
      note,
      /^nothing landed on main: the place refused the commit of its merge: .*refused by the hook \/ see CONTRIBUTING$/,
      "nemia ls prints them on the step's row, never a line break inside it",
    );
    assert.equal(mergeHead(repo), false);
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
});

test("REFUSED at shipped defaults: `nemia rm` of a run whose merge is staged and not landed, and another run's ending, wait until the run has landed it", async () => {
  const shared = board();
  const repo = aRepo();
  const { id, e, settle, checkId } = await stagedAndSigned({ repo, board: shared });
  const other = await atTheGate({ repo, board: shared });
  await runWith(e, approveRun(other.id, 'ship'));

  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(other.id)))).filed,
    [],
    "while the check runs on the merge, the other run's ending is not filed into that checkout",
  );
  settle(checkId, 'succeeded', undefined, 0);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(other.id)))).filed,
    [],
    'with the check settled and nothing landed yet, a merge staged and not landed still holds the checkout',
  );
  const refused = await runWith(e, forgetRun(id));
  assert.equal(refused.kind, 'refused', 'nor is the run forgotten: the pass that lands it has not come');
  assert.equal(
    refused.kind === 'refused' && refused.refusal,
    `ship's merge is staged in the repository's checkout (${repo}), and the run has not yet committed or aborted it. ` +
      `The next tick lands it, cancelled or not: nemia rm ${id} once nemia ls ${id} says what became of ship's merge.`,
  );
  assert.equal(mergeHead(repo), true, 'and nothing was touched');

  await runWith(e, advanceRun(readRun(id)));
  assert.equal(mergeHead(repo), false);
  assert.deepEqual((await runWith(e, advanceRun(readRun(other.id)))).filed, ['ship'], 'landed, the checkout is free');
  assert.notEqual((await runWith(e, forgetRun(id))).kind, 'refused');
});

/**
 * Two runs of one repository, each at its ending's gate and each approved — and the SECOND's approval written older than the first's, since
 * a rule about order that a fixture already has proves nothing.
 */
async function twoApproved() {
  const shared = board();
  const repo = aRepo();
  const first = await atTheGate({ repo, board: shared });
  const second = await atTheGate({ repo, board: shared });
  await runWith(shared.e, approveRun(first.id, 'ship'));
  const { file } = await runWith(shared.e, approveRun(second.id, 'ship'));
  fs.writeFileSync(file, JSON.stringify({ at: '2026-09-17T08:00:00.000Z' }));
  return { repo, first, second, ...shared };
}

test("two runs' ending steps never work in one checkout at once: the oldest approval takes it, and the other reads as waiting for it", async (t) => {
  const { repo, first, second, e } = await twoApproved();

  const one = await runWith(e, advanceRun(readRun(first.id)));
  const two = await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual(
    [one.filed, two.filed],
    [[], ['ship']],
    'one ending, in one checkout: a pass over both, the first run first, files the older approval, whatever order it reads the runs in',
  );
  assert.equal(
    one.inFlight,
    true,
    'and the run held back is in flight all the same: its ending is approved, and a directory is what it waits for',
  );
  assert.equal(readRun(first.id).steps.ship.taskId, null);
  assert.equal(readRun(second.id).steps.ship.workspace, repo, "and the one that was filed is in the repository's own checkout");

  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(first.id)))).filed,
    [],
    'pass after pass, while that step is in the checkout: read from the world each time',
  );
  const listed = await runWith(e, list(e, readRun(first.id)));
  assert.equal(
    listed.steps.find((s) => s.name === 'ship')!.status,
    `waiting on the checkout (${second.id}'s ship has it)`,
    "both screens say which run's step has it",
  );
  const { decision, checkout } = await runWith(e, decideRun(first.id));
  assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
  assert.deepEqual(checkout, { run: second.id, step: 'ship' });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', first.id], e);
  } finally {
    log.mock.restore();
  }
  assert.ok(
    printed.includes(
      `  ship: waiting on the checkout (${second.id}'s ship has it) — it works in the repository's own checkout, ` +
        `and two endings never do at once; the next tick files ship once ${second.id}'s ship has settled`,
    ),
    printed.join('\n'),
  );
});

test('a run whose ending waits for the checkout is filed once the step in it settles', async () => {
  const { repo, first, second, e, settle } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual((await runWith(e, advanceRun(readRun(first.id)))).filed, [], 'held while the other run works in the checkout');

  settle(`${second.id}-ship`, 'succeeded', SIGNED);
  const now = await runWith(e, advanceRun(readRun(first.id)));
  assert.deepEqual(now.filed, ['ship'], 'and filed on the first pass after it settles');
  assert.equal(readRun(first.id).steps.ship.workspace, repo);
  assert.equal((await runWith(e, list(e, readRun(first.id)))).steps.find((s) => s.name === 'ship')!.status, 'pending');
});

test("a try of an ending step waits for the checkout as its first filing does: a person's send-back of a ship that ended blocked files nothing while another run's ship is merging", async (t) => {
  const { repo, first, second, e, settle } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  const freed = await runWith(e, advanceRun(readRun(first.id)));
  assert.deepEqual(
    freed.filed,
    ['ship'],
    "the older approval's ship signed off blocked, its check refused and its trial merge aborted: the checkout is free, and the other run takes it",
  );

  const { ask } = await runWith(e, retryRun(second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' }));
  assert.deepEqual(
    [ask.step, ask.try],
    ['ship', 2],
    'a person sends the blocked one back while that step is merging: allowed, for a settled step that signed off blocked, and held',
  );
  for (const pass of [1, 2]) {
    const held = await runWith(e, advanceRun(readRun(second.id)));
    assert.deepEqual([held.tried, held.filed], [[], []], `pass ${pass}: the try waits for the checkout`);
  }
  assert.deepEqual(readRun(second.id).steps.ship.tries, undefined, 'and no try was taken');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), first.base, 'nothing merged while two endings wanted the same directory');
  const listed = await runWith(e, list(e, readRun(second.id)));
  assert.deepEqual(
    [listed.steps[1].status, listed.steps[1].note],
    ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`],
  );

  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', second.id], e);
  } finally {
    log.mock.restore();
  }
  assert.ok(
    printed.includes(
      `  ship: waiting on the checkout (${first.id}'s ship has it) — it works in the repository's own checkout, ` +
        `and two endings never do at once; the next tick files ship once ${first.id}'s ship has settled`,
    ),
    `nemia decide says it on the screen of a run whose ending ended blocked\n${printed.join('\n')}`,
  );
  assert.ok(
    !printed.some((l) => l.includes('the next tick files it')),
    'and not that the next tick files the try, as the try due would have said',
  );

  settle(`${first.id}-ship`, 'succeeded', SIGNED);
  const tried = await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual(tried.tried, ['ship'], 'once the step in the checkout settles, the try is filed there, as any try of it would be');
  assert.equal(readRun(second.id).steps.ship.workspace, repo);
});

test("a run whose ending's try the checkout holds is a run still running: `nemia ls`, `nemia decide` and the pass agree, and it still counts against the cap on runs in flight", async () => {
  const { first, second, e, settle } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(first.id)))).filed,
    ['ship'],
    'the older approval signed off blocked, and the other run takes the freed directory',
  );
  await runWith(e, retryRun(second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' }));

  const pass = await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual([pass.filed, pass.tried], [[], []], 'nothing of it is filed while the other run is in the checkout');
  assert.equal(
    pass.status,
    'running',
    'and the run is running, not failed: a try asked for and not yet filed is work in hand, not a run waiting on a person',
  );
  assert.equal(pass.inFlight, true, 'so the cap on runs in flight still counts it: the slot is held for the ending it is queued for');

  const listed = await runWith(e, list(e, readRun(second.id)));
  assert.deepEqual(listed.waitingOnYou, [], 'nobody is waited on — the answer was given, and what holds it is a directory');
  assert.equal(listed.toDecide, undefined, 'and there is nothing to decide');
  assert.deepEqual(
    [listed.steps[1].status, listed.steps[1].note],
    ['succeeded · BLOCKED', `try 2 asked (--nudge) — waiting on the checkout (${first.id}'s ship has it)`],
  );
  const { decision } = await runWith(e, decideRun(second.id));
  assert.deepEqual(
    [decision.kind, decision.kind === 'running' ? decision.waiting : []],
    ['running', ['ship']],
    'nemia decide says the same as nemia ls and the pass in that window',
  );

  settle(`${first.id}-ship`, 'succeeded', SIGNED);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(second.id)))).tried,
    ['ship'],
    'the try is filed on the first pass after the step in the checkout settles',
  );
});

test("a cancelled run holds the checkout while its ending's session is still in it: `nemia cancel` asks the engine to stop it, and it is still merging until it has", async () => {
  const { repo, first, second, e, settle, tasks } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  assert.equal(tasks.get(`${second.id}-ship`)!.phase, 'pending', 'its session is in the checkout');

  const { plan } = await runWith(e, cancelRun(second.id));
  assert.deepEqual(plan.kind === 'cancel' ? plan.stop.map((x) => x.name) : [], ['ship'], 'called off: the engine is asked to stop it');
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(first.id)))).filed,
    [],
    'until it has settled that agent is still mid git merge in that directory, so the other run files nothing into it',
  );
  assert.equal(
    (await runWith(e, list(e, readRun(first.id)))).steps.find((s) => s.name === 'ship')!.status,
    `waiting on the checkout (${second.id}'s ship has it)`,
  );

  settle(`${second.id}-ship`, 'stopped');
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(first.id)))).filed,
    ['ship'],
    'settled stopped a tick or two later: the checkout is free, and the next pass takes it',
  );
  assert.equal(readRun(first.id).steps.ship.workspace, repo);
});

test('a run whose ending the pass will not file claims no checkout: one waiting on a run that has not shipped, and one the cap on runs in flight holds, each hold nobody — however old their word', async () => {
  const shared = board();
  const repo = aRepo();
  const waiting = await atTheGate({ repo, board: shared });
  const child = await runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: mergeOnly(), after: [waiting.id] }));
  const { file } = await runWith(shared.e, approveRun(child.id, 'ship'));
  fs.writeFileSync(file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
  assert.deepEqual(
    (await runWith(shared.e, advanceRun(readRun(child.id)))).filed,
    [],
    'a merge-only run approved oldest waits on a run at its own gate: advance files a root only once every run it waits on has shipped',
  );

  await runWith(shared.e, approveRun(waiting.id, 'ship'));
  assert.deepEqual(
    (await runWith(shared.e, advanceRun(readRun(waiting.id)))).filed,
    ['ship'],
    'so the checkout goes to the run that would use it',
  );
  assert.equal((await runWith(shared.e, list(shared.e, readRun(waiting.id)))).steps.find((s) => s.name === 'ship')!.status, 'pending');

  const capped = board();
  const other = aRepo();
  const inFlight = await atTheGate({ repo: other, board: capped });
  await runWith(capped.e, approveRun(inFlight.id, 'ship'));
  const queued = await runPlaced(startRun({ brief: 'ship the flag', repo: other, workflowDir: mergeOnly() }));
  fs.writeFileSync((await runWith(capped.e, approveRun(queued.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T05:00:00.000Z' }));
  process.env.WF_MAX_RUNS = '1';
  try {
    assert.deepEqual(
      (await runWith(capped.e, advanceRun(readRun(queued.id), { inFlight: 1, cap: 1 }))).filed,
      [],
      'the cap on runs in flight holds its root while a run is in flight',
    );
    assert.deepEqual(
      (await runWith(capped.e, advanceRun(readRun(inFlight.id)))).filed,
      ['ship'],
      "so its ending claims nothing, and holds no other run's",
    );
  } finally {
    delete process.env.WF_MAX_RUNS;
  }
});

test("a run with nothing filed is held by the checkout like any other: its ending is its root, and a root is not filed into a directory another run's ship is in", async () => {
  const shared = board();
  const repo = aRepo();
  const { e, settle } = shared;

  const parent = await atTheGate({ repo, board: shared });
  await runWith(e, approveRun(parent.id, 'ship'));
  await runWith(e, advanceRun(readRun(parent.id)));
  git(repo, 'merge', '--no-ff', '--no-commit', parent.branch);
  git(repo, 'commit', '--no-edit');
  settle(`${parent.id}-ship`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(parent.id)));
  assert.equal(
    await isShipped(repositoryRun(readRun(parent.id)), parent.branch),
    true,
    "the merge-only run's parent has shipped: nothing but the checkout is between it and being filed",
  );

  const other = await atTheGate({ repo, board: shared });
  fs.writeFileSync((await runWith(e, approveRun(other.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T06:00:00.000Z' }));
  const child = await runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: mergeOnly(), after: [parent.id] }));
  fs.writeFileSync((await runWith(e, approveRun(child.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));

  assert.deepEqual((await runWith(e, advanceRun(readRun(other.id)))).filed, ['ship'], 'the older word takes the checkout');
  assert.deepEqual((await runWith(e, advanceRun(readRun(child.id)))).filed, [], 'and the run with nothing filed waits for it');
  await aPass(e);
  assert.equal((await runWith(e, list(e, readRun(child.id)))).steps[0].status, `waiting on the checkout (${other.id}'s ship has it)`);

  settle(`${other.id}-ship`, 'succeeded', SIGNED);
  assert.deepEqual((await runWith(e, advanceRun(readRun(child.id)))).filed, ['ship'], 'and is filed once that step settles');
  assert.equal(readRun(child.id).steps.ship.workspace, repo);
});

test("a `workspace: main` task the engine has lost holds no checkout: a run nobody can stop does not hold every other run's ending for ever", async () => {
  const { first, second, e, tasks } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual((await runWith(e, advanceRun(readRun(first.id)))).filed, [], 'held while the engine has that step in flight');

  tasks.delete(`${second.id}-ship`);
  assert.deepEqual((await runWith(e, advanceRun(readRun(first.id)))).filed, ['ship'], 'and filed once the engine no longer holds it');
});

test("a run another waited on hands forward what its work said, not what its ending said: the ending's account is of the merge, and it declares nothing", async () => {
  const { repo, id, branch, e, settle, tasks } = await atTheGate();
  await runWith(e, approveRun(id, 'ship'));
  await runWith(e, advanceRun(readRun(id)));
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  git(repo, 'commit', '--no-edit');
  settle(`${id}-ship`, 'succeeded', { ...SIGNED, summary: 'SHIP-ACCOUNT: merged it onto main, the check passed' });
  await runWith(e, advanceRun(readRun(id)));

  const child = await runPlaced(startRun({ brief: 'read the flag', repo, workflowDir: oneStep(), after: [id] }));
  const filed = await runWith(e, advanceRun(readRun(child.id)));
  assert.deepEqual(filed.filed, ['implement'], 'the parent shipped, so the child is filed');
  const brief = tasks.get(`${child.id}-implement`)!.spec.brief;
  assert.match(brief, new RegExp(`## From run ${id}\\n`));
  assert.match(brief, /What implement said when it signed off, its `summary`:\n\n```text\ndid the work\n```/);
  assert.doesNotMatch(brief, /SHIP-ACCOUNT/, "the ending's account is of the merge, and says nothing of the work");
  assert.doesNotMatch(brief, /What ship said when it signed off/);
});

test('a sent-back ending merges nothing: the work is filed again, the checkout is untouched, and the gate holds again once it signs off', async () => {
  const { repo, id, branch, e, settle, base } = await atTheGate();
  const { ask } = await runWith(e, retryRun(id, 'implement', { mode: 'nudge', message: 'sub subtracts the wrong way round' }));
  assert.deepEqual([ask.step, ask.try], ['implement', 2]);

  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual([sent.tried, sent.filed], [['implement'], []], 'the work goes again, and the ending is not filed');
  assert.equal(readRun(id).steps.ship.taskId, null);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing is merged');
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal((await runWith(e, list(e, readRun(id)))).toDecide, undefined, 'while the work runs there is nothing to decide');
  await assert.rejects(
    runWith(e, approveRun(id, 'ship')),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith('ship is not at its gate yet'),
    'and the approval of a step that has not been filed is refused',
  );

  settle(`${id}-implement-try2`, 'succeeded', SIGNED);
  const held = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(held.filed, [], 'and the gate holds the ending again');
  assert.deepEqual((await runWith(e, list(e, readRun(id)))).toDecide?.kind, 'approve');
  assert.equal(await isShipped(repositoryRun(readRun(id)), branch), false);
});

test("REFUSED at the ending's gate, at shipped defaults: a send-back with no words names the step at the gate — ship, not the work — and the two commands it names are honoured", async () => {
  const { id, e } = await atTheGate();
  await assert.rejects(runWith(e, retryRun(id, 'implement', { mode: 'nudge' })), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(
      err.message,
      "ship is at its gate, not implement: ship ends the run in the repository's own checkout, nothing of it has run, and the send-back from that gate goes to implement, the work it would act on. " +
        `A try with no words tells its session nothing to change, so it would sign off as it did. Say what to change: nemia retry ${id} implement --message "<objection>" — or approve the ending, which is what files it: nemia approve ${id} ship.`,
    );
    return true;
  });
  const { ask } = await runWith(e, retryRun(id, 'implement', { mode: 'nudge', message: 'sub subtracts the wrong way round' }));
  assert.deepEqual([ask.step, ask.try], ['implement', 2], 'the send-back it names is honoured');
  const other = await atTheGate();
  assert.equal(
    (await runWith(other.e, approveRun(other.id, 'ship'))).approval.step,
    'ship',
    'and so is the approval, on a run of its own, since one takes the other back',
  );
});

test('REFUSED at shipped defaults: a try of the ending step itself, which has not run, names the approval that files it and the send-back to the work', async () => {
  const { id, e } = await atTheGate();
  await assert.rejects(runWith(e, retryRun(id, 'ship', { mode: 'nudge' })), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(
      err.message,
      "ship is at its gate, and nothing of it has run: it ends the run in the repository's own checkout, and your approval is what files it, so there is no try of it to replace. " +
        `Approve it: nemia approve ${id} ship — or send the work back: nemia retry ${id} implement --message "<objection>".`,
    );
    return true;
  });
  assert.equal(readRun(id).steps.ship.taskId, null, 'and nothing was written');
});

test("REFUSED at shipped defaults: `nemia round` at an ending's gate says the run is at that gate — not that what waits on the loop has been filed", async () => {
  const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: loopingFolder() }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual([pass.looped, pass.filed], [[], []], 'the loop has handed on, and the ending waits at its gate');
  assert.equal((await runWith(e, list(e, readRun(run.id)))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  await assert.rejects(runWith(e, roundRun(run.id, 'review')), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(
      err.message,
      "review signed off without asking for another round (`again: false`), so its loop is over — and nothing waiting on it has been filed: the run is at ship's gate, " +
        `where nothing of ship has run and your approval is what files it. Approve it: nemia approve ${run.id} ship — or send the work back: nemia retry ${run.id} review --message "<objection>".`,
    );
    return true;
  });
  assert.ok(!fs.existsSync(path.join(ROOT, 'runs', `${run.id}.asks`, 'round-review-2')), 'and no ask was written');
});

test("REFUSED at shipped defaults: a step is handed off once — a person's edit in the reviewed worktree while the run waits at its ending's gate is not committed under review's name, pass after pass", async () => {
  const { id, e, settle } = await stoppedOnBase();
  await runWith(e, retryRun(id, 'review', { mode: 'nudge', message: 'take main' }));
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
  const tipsBefore = readRun(id).tips;
  const handing = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(
    [handing.filed, handing.looped, handing.tried],
    [[], [], []],
    'the pass that hands review off files nothing: the ending waits at its gate',
  );
  assert.deepEqual(
    readRun(id).tips,
    tipsBefore,
    'and no tip moved: the work sent back, review handed on with no commit of its own, so nothing else of the pass wrote the record',
  );
  const review = readRun(id).steps.review;
  assert.equal(
    review.handedOff,
    `${id}-review-try2`,
    'the mark is written for itself: it is on the record on disk, not only in the pass that set it',
  );

  const tip = git(review.workspace!, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(review.workspace!, 'NOTES.md'), "a person's notes\n");
  await runWith(e, advanceRun(readRun(id)));
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(git(review.workspace!, 'rev-parse', 'HEAD'), tip, "no commit under review's name");
  assert.match(git(review.workspace!, 'status', '--porcelain'), /NOTES\.md/, "the edit is still the person's, uncommitted");
});

test("a check that refuses leaves the checkout clean: the abort the ending's prose names takes the trial merge back, and the run says what happened", async () => {
  const { repo, id, branch, e, settle, base } = await atTheGate();
  await runWith(e, approveRun(id, 'ship'));
  await runWith(e, advanceRun(readRun(id)));

  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  assert.notEqual(
    git(repo, 'status', '--porcelain'),
    '',
    'the step, played as its prose says when the check refuses: the trial merge is staged and uncommitted, then aborted',
  );
  git(repo, 'merge', '--abort');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'the checkout is as it was');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'and the base branch has not moved');

  settle(`${id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(id)));
  const record = readRun(id);
  assert.equal(git(repo, 'status', '--porcelain'), '', 'nor does the run commit what a step left in that checkout');
  assert.equal(await isShipped(repositoryRun(record), branch), false);
  const { decision } = await runWith(e, decideRun(id));
  assert.equal(decision.kind, 'awaiting');
  if (decision.kind !== 'awaiting') return;
  assert.deepEqual([decision.outcome, decision.stuck, decision.branches], ['blocked', ['ship'], [branch]]);
});

/**
 * An ending that signed off blocked on a clean checkout, read by a pass; then a merge of its branch staged by hand in that checkout, as a
 * person resolving what stopped it, or a supervisor merging it on trial, stages one.
 */
const blockedClean = async () => {
  const at = await atTheGate();
  await runWith(at.e, approveRun(at.id, 'ship'));
  await runWith(at.e, advanceRun(readRun(at.id)));
  at.settle(`${at.id}-ship`, 'succeeded', BLOCKED);
  const pass = await runWith(at.e, advanceRun(readRun(at.id)));
  git(at.repo, 'merge', '--no-ff', '--no-commit', at.branch);
  return { ...at, pass };
};

test('REFUSED at shipped defaults: an ending that stopped on its own word is written down once — its merge left staged is taken back, and a merge a person stages after it is theirs', async () => {
  {
    const { repo, id, branch, e, settle, base } = await atTheGate();
    await runWith(e, approveRun(id, 'ship'));
    await runWith(e, advanceRun(readRun(id)));
    git(repo, 'merge', '--no-ff', '--no-commit', branch);
    settle(`${id}-ship`, 'succeeded', BLOCKED);
    const pass = await runWith(e, advanceRun(readRun(id)));
    assert.equal(mergeHead(repo), false, 'blocked with its merge left staged: the pass takes it back');
    assert.equal(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
    assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'ship ended blocked with its merge staged' });
    assert.ok(
      pass.notes.includes('ship: ship ended blocked with its merge staged, so the run aborted its merge; nothing landed on main'),
      pass.notes.join('\n'),
    );
  }
  {
    const { repo, id, e, base, pass } = await blockedClean();
    assert.deepEqual(readRun(id).steps.ship.landed, { untouched: 'ship ended blocked, and nothing of it was staged' });
    assert.ok(
      pass.notes.includes('ship: ship ended blocked, and nothing of it was staged: the run left the checkout as it found it'),
      pass.notes.join('\n'),
    );
    assert.equal(
      (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.note,
      undefined,
      'nemia ls says the step as it stopped, and nothing of a landing the run did not make',
    );
    for (let i = 0; i < 2; i++) await runWith(e, advanceRun(readRun(id)));
    assert.equal(mergeHead(repo), true, "no pass after takes the person's merge back: it is still staged");
    assert.notEqual(git(repo, 'status', '--porcelain'), '');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
  {
    const { repo, id, e } = await blockedClean();
    const forgot = await runWith(e, forgetRun(id));
    assert.notEqual(forgot.kind, 'refused', forgot.kind === 'refused' ? forgot.refusal : '');
    assert.equal(mergeHead(repo), true, "nemia rm does not wait on it: the run is forgotten with the person's merge left as it is");
  }
});

/**
 * An ending stopped on its base branch: `implement ⇄ review → ship`, implement verified, review done with `again: false`, ship approved
 * at try 1, filed in the repository's own checkout, and signed off blocked — the work does not hold on the base branch as it is now.
 */
async function stoppedOnBase(dir = loopingFolder()) {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir }));
  const b = board();
  const { e, settle } = b;
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  if (readRun(run.id).steps.review) {
    settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
    await runWith(e, advanceRun(readRun(run.id)));
  }
  await runWith(e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, ['ship']);
  settle(`${run.id}-ship`, 'succeeded', STOPPED);
  await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, ...b, base: git(repo, 'rev-parse', 'HEAD') };
}

const STOPPED = {
  outcome: 'blocked',
  summary: 'main moved since the branch was cut: the trial merge conflicts in add.ts, so I aborted it',
  artifacts: [],
  needs: "the branch has to take main: add.ts conflicts with main's sub",
};

/** What `nemia decide` prints for a run, line by line. */
async function decideLines(t: { mock: { method: typeof import('node:test').mock.method } }, e: Engine, id: string): Promise<string[]> {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', id], e);
  } finally {
    log.mock.restore();
  }
  return printed;
}

test("an ending that stopped on the base branch sends the work back through the loop: review hears the objection and the ending's needs, implement gets a round, and ship waits at its gate for a new approval", async (t) => {
  const { repo, id, e, tasks, filings, settle, base } = await stoppedOnBase();
  assert.equal(readRun(id).steps.ship.taskId, `${id}-ship`, 'the fixture is the incident: ship ran on its approval');

  const printed = await decideLines(t, e, id);
  assert.ok(
    printed.some((l) =>
      l.includes(
        `ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry ${id} ship  (`,
      ),
    ),
    `nemia decide offers both ways on, each with when to take it\n${printed.join('\n')}`,
  );
  assert.ok(
    printed.some((l) =>
      l.includes(
        `review: ship stopped on the base branch. Send the work back, when it does not hold on the base branch — review is filed again with your objection and what ship said, may ask for a round, and ship waits at its gate for a new approval:  nemia retry ${id} review --message "<objection>"`,
      ),
    ),
    printed.join('\n'),
  );

  const { ask } = await runWith(e, retryRun(id, 'review', { mode: 'nudge', message: 'take main, and keep both subs working' }));
  assert.deepEqual([ask.step, ask.try], ['review', 2]);
  assert.equal(
    (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status,
    'waiting',
    'between the ask and the pass, the ending reads as waiting for the work, not as blocked: what the next pass will say',
  );

  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual([sent.tried, sent.filed], [['review'], []], 'the reviewer is filed again, and the ending is not');
  assert.deepEqual(readRun(id).steps.ship, {
    taskId: null,
    workspace: repo,
    branch: 'main',
    tries: [{ taskId: `${id}-ship`, then: 'back' }],
  });
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'nothing merged');
  const brief = tasks.get(`${id}-review-try2`)!.spec.brief;
  assert.match(
    brief,
    /the work went on to ship, which a person approved: it acts on main in the repository's own checkout, and it stopped there — `blocked` —/,
  );
  assert.match(brief, /## Your answer\n\n```text\ntake main, and keep both subs working\n```/);
  assert.match(brief, /## What ship said\n\nIts summary:\n\n```text\nmain moved since the branch was cut/);
  assert.match(brief, /What it needs:\n\n```text\nthe branch has to take main: add.ts conflicts with main's sub\n```/);
  assert.match(
    brief,
    /sign off with `again: true` and say what — what ship needs among it: the work's next round is on the run's branch, where merging main into it is the work's to do\./,
  );
  await assert.rejects(
    runWith(e, approveRun(id, 'ship')),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith('ship is not at its gate yet'),
    'the approval of try 1 does not carry over, and none is taken while the work is out',
  );

  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
  const looped = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(looped.looped, ['review'], 'the reviewer asks for a round: implement goes on, on its branch, and review reviews again');
  assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
  settle(`${id}-implement-try2`, 'succeeded', {
    ...SIGNED,
    replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch, and both subs are one' }],
  });
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
  const settled = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(settled.filed, [], 'the loop has settled, and the ending holds at its gate: nothing of it runs');
  const listed = await runWith(e, list(e, readRun(id)));
  assert.deepEqual([listed.steps.find((s) => s.name === 'ship')!.status, listed.toDecide?.kind], ['awaiting approval', 'approve']);

  const { approval } = await runWith(e, approveRun(id, 'ship', 'Merge it, now it takes main.'));
  assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try the ending is now on');
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, ['ship'], 'files it');
  assert.equal(tasks.get(`${id}-ship-try2`)!.spec.cwd, repo);
});

test("a send-back composes with `nemia round` in a loop out of rounds, as the incident's was: review's `again: true` reads exhausted, a round takes it once more, and ship waits at its gate for a new approval", async () => {
  const { id, e, filings, settle } = await stoppedOnBase(loopingFolder(1));
  await runWith(e, retryRun(id, 'review', { mode: 'nudge', message: 'take main' }));
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
  const spent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(
    [spent.looped, spent.filed],
    [[], []],
    "at rounds: 1 the loop's only round was spent before ship ran: no round is left, so nothing goes round on its own",
  );
  const listed = await runWith(e, list(e, readRun(id)));
  assert.deepEqual(
    ['review', 'ship'].map((n) => listed.steps.find((s) => s.name === n)!.status),
    ['rounds exhausted', 'waiting'],
    'review asked for a round the loop does not have, and ship still waits for the work',
  );
  await assert.rejects(
    runWith(e, approveRun(id, 'ship')),
    (err: Error & { exitCode?: number }) => err.exitCode === 2,
    'and no approval is taken while the work is out',
  );

  const { ask: asked } = await runWith(e, roundRun(id, 'review'));
  assert.equal(asked.round, 2, 'a person takes the loop once more');
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(id)))).looped,
    ['review'],
    'the round goes to implement, and review hands on after it',
  );
  assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
  settle(`${id}-implement-try2`, 'succeeded', {
    ...SIGNED,
    replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch' }],
  });
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, [], 'the loop has settled, and nothing of ship runs');
  assert.equal((await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  const { approval } = await runWith(e, approveRun(id, 'ship', 'Merge it, now it takes main.'));
  assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try ship is now on');
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, ['ship']);
});

/** Why a person judged the loop's findings later work rather than this run's: what `nemia accept` carries to the shipper. */
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';

/**
 * A loop out of rounds before its ending: `implement ⇄ review → ship` at `rounds: 1`, implement committed on its branch, review done
 * with `again: true` — out of rounds, and nothing after the loop is ever filed, so the ending never reaches its gate.
 */
async function atTheCap() {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: loopingFolder(1) }));
  const b = board();
  const { e, settle } = b;
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, [], 'out of rounds, nothing after the loop is filed');
  return { repo, id: run.id, ...b, base: git(repo, 'rev-parse', 'HEAD') };
}

test("the incident's other ending: at rounds exhausted a person accepts the work as it stands, and ship reaches its gate on their word — approved, filed, and told why the findings are still open", async () => {
  const { repo, id, e, tasks } = await atTheCap();
  const stuck = await runWith(e, list(e, readRun(id)));
  assert.deepEqual(
    ['review', 'ship'].map((n) => stuck.steps.find((s) => s.name === n)!.status),
    ['rounds exhausted', 'waiting'],
    'the ending never reaches its gate, which is how the work came to be merged by hand',
  );
  await assert.rejects(
    runWith(e, approveRun(id, 'ship')),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith('ship is not at its gate yet'),
  );

  const { acceptance } = await runWith(e, acceptRun(id, 'review', ENOUGH));
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(id)))).filed,
    [],
    'accepted, the loop ends and the run does not; the ending is approved before it is filed, so it goes to its gate, not to work',
  );
  const listed = await runWith(e, list(e, readRun(id)));
  assert.deepEqual([listed.steps.find((s) => s.name === 'ship')!.status, listed.toDecide?.kind], ['awaiting approval', 'approve']);
  const { decision: d, offers, accepted } = await runWith(e, decideRun(id));
  assert.deepEqual(
    [d.kind === 'awaiting' && d.awaitingApproval, offers],
    [['ship'], []],
    'the gate is what is left to decide, and no round is offered',
  );
  assert.deepEqual(accepted, { review: `accepted as it stands ${acceptance.at.slice(11, 16)}Z, its findings open — "${ENOUGH}"` });

  await runWith(e, approveRun(id, 'ship', 'Merge it; the findings are follow-up.'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, ['ship']);
  const brief = tasks.get(`${id}-ship`)!.spec.brief;
  assert.match(brief, /\n## Accepted\n/, 'approved, it is told why it is shipping work a reviewer had more to say about');
  assert.match(brief, /review judged this work and asked for another round after the 1 `rounds: 1` allows\./);
  assert.ok(brief.includes(ENOUGH), brief);
  assert.equal(tasks.get(`${id}-ship`)!.spec.cwd, repo, "and filed in the repository's own checkout as ever");
});

test("a send-back at the ending's gate spends the acceptance: the loop is open again, its findings with it, and the work goes back to the reviewer", async () => {
  const { id, e, tasks } = await atTheCap();
  await runWith(e, acceptRun(id, 'review', ENOUGH));
  await runWith(e, advanceRun(readRun(id)));
  assert.equal((await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');

  const { ask } = await runWith(e, retryRun(id, 'review', { mode: 'nudge', message: "the second finding is this run's after all" }));
  assert.deepEqual([ask.step, ask.try], ['review', 2]);
  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual([sent.tried, sent.filed], [['review'], []]);
  assert.equal(readRun(id).acceptances, undefined, 'spent by the try after it, as an approval is');
  assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'done', 'accept-review-1')), 'and moved whole');
  assert.doesNotMatch(tasks.get(`${id}-review-try2`)!.spec.brief, /## Accepted/, 'the reviewer is not told its own loop was ended');
  await assert.rejects(
    runWith(e, acceptRun(id, 'review', ENOUGH)),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message.startsWith("round 1 of review's loop is still running"),
    'on the new try, the acceptance that ended the old one opens nothing',
  );
});

test("REFUSED at shipped defaults: a send-back from a stopped ending with no words, to a step that is not the loop's, a round of the loop, or while the ending's own try is asked for — and the ending's try while a send-back is", async () => {
  const { id, e } = await stoppedOnBase();
  const refused = (words: string) => (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.equal(err.message, words);
    return true;
  };
  await assert.rejects(
    runWith(e, retryRun(id, 'review', { mode: 'nudge' })),
    refused(
      "review's work went on to ship, and ship stopped on the base branch (blocked) without doing what it was approved for: a try of review sends the work back from there, and one with no words tells its session nothing to change. " +
        `Say what to change: nemia retry ${id} review --message "<objection>" — or ship again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${id} ship.`,
    ),
  );
  await assert.rejects(
    runWith(e, retryRun(id, 'implement', { mode: 'nudge', message: 'take main' })),
    refused(
      "ship stopped on the base branch (blocked) without doing what it was approved for, and the work goes back through the folder's loop, not to implement: send it back to review, which is filed again with your objection and what ship said, and may ask for a round of the work — " +
        `nemia retry ${id} review --message "<objection>". Or ship again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${id} ship.`,
    ),
  );
  await assert.rejects(
    runWith(e, roundRun(id, 'review')),
    refused(
      'review signed off without asking for another round (`again: false`), and ship stopped on the base branch (blocked) without doing what it was approved for: a round would file the work again with nothing said of why. ' +
        'Send it back, with what to change — review is filed again with your objection and what ship said, and its `again: true` is the round: ' +
        `nemia retry ${id} review --message "<objection>". Or ship again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${id} ship.`,
    ),
    "a round carries no words, and the loop is over: what goes round again is the send-back's again: true",
  );
  assert.ok(!fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'round-review-2')), 'and no ask was written');

  const { ask } = await runWith(e, retryRun(id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' }));
  await assert.rejects(
    runWith(e, retryRun(id, 'review', { mode: 'nudge', message: 'take main' })),
    (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 &&
      err.message.startsWith(
        `try 2 of ship is asked for (--nudge, at ${ask.at}): it does the act again on the work as it stands, and a send-back would take that try back.`,
      ),
    'the two ways on take the same try of the ending: one asked refuses the other, each way round',
  );
  fs.rmSync(path.join(ROOT, 'runs', `${id}.asks`, 'retry-ship-2'));
  const back = await runWith(e, retryRun(id, 'review', { mode: 'nudge', message: 'take main' }));
  await assert.rejects(
    runWith(e, retryRun(id, 'ship', { mode: 'nudge' })),
    refused(
      `the work is being sent back from ship (nemia retry ${id} review, at ${back.ask.at}): ship returns to its gate once it settles, and a try of ship now would act on work that is being changed. Wait for it: nemia ls ${id}.`,
    ),
  );
});

test('REFUSED at shipped defaults: a folder with no loop before its ending has no way to send the work back from it, and says so — shipping again is still there', async () => {
  const { id, e, settle, tasks } = await stoppedOnBase(folder());
  await assert.rejects(
    runWith(e, retryRun(id, 'implement', { mode: 'nudge', message: 'take main' })),
    (err: Error & { exitCode?: number }) => {
      assert.equal(err.exitCode, 2);
      assert.equal(
        err.message,
        'ship stopped on the base branch (blocked) without doing what it was approved for, and this workflow has no loop before it to send the work back through: a send-back files the looping step an ending waits on, whose `again: true` gives the work a round, and implement does not loop. ' +
          `Ship again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${id} ship. For work that does not hold on the base branch, call this run off (nemia cancel ${id}) and start one for the work on the base branch as it is now (nemia start); a folder that gives its ending a \`loop:\` step to wait on can send work back.`,
      );
      return true;
    },
  );
  assert.equal(readRun(id).steps.implement.tries, undefined, 'and nothing was asked');

  await runWith(e, retryRun(id, 'ship', { mode: 'nudge', message: 'the checkout is clean now' }));
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(id)))).tried,
    ['ship'],
    'shipping again is a try of the ending, filed without a new approval',
  );
  assert.ok(tasks.get(`${id}-ship-try2`));
  const { repo, branch } = readRun(id) as unknown as { repo: string; branch: string };
  git(repo, 'merge', '--no-ff', '--no-commit', readRun(id).steps.implement.branch!);
  assert.equal(branch, 'main');
  settle(`${id}-ship-try2`, 'succeeded', { ...SIGNED, message: MESSAGE });
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).checked, ['ship'], "the try's merge is checked as the first try's was");
  settle(`${id}-ship-try2-check`, 'succeeded', undefined, 0);
  const done = await runWith(e, advanceRun(readRun(id)));
  assert.equal(done.status, 'succeeded', 'once its merge lands the run is over');
  assert.notEqual(
    (await runWith(e, list(e, readRun(id)))).steps.find((s) => s.name === 'ship')!.status,
    'awaiting approval',
    'not at its gate again',
  );
});

test('the whole screen of a run whose result a person merged by hand, its ending never run', async (t) => {
  const { repo, id, branch, e } = await atTheGate();
  git(repo, 'merge', '--no-ff', '--no-edit', branch);
  assert.deepEqual(await decideScreen(t, e, [id], { '<id>': id, '<repo>': repo, '<root>': ROOT }), [
    '<id>  add sub',
    '',
    '  shipped — wf/<id>/implement is already on main',
    '  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel <id>',
  ]);
});

/**
 * The screen of an ending whose check on the staged merge settled with `exitCode`, its approval's time written as `08:00Z` and two of the
 * check's pictures in its files.
 */
async function checkedScreen(t: TestContext, exitCode: number | undefined): Promise<string[]> {
  const { repo, id, e, settle, checkId } = await stagedAndSigned();
  const approval = path.join(ROOT, 'runs', `${id}.asks`, 'approve-ship-1');
  fs.writeFileSync(approval, JSON.stringify({ ...JSON.parse(fs.readFileSync(approval, 'utf8')), at: '2026-09-17T08:00:00.000Z' }));
  photographed(id, { count: 2, bytes: 10 });
  settle(checkId, 'failed', undefined, exitCode);
  await runWith(e, advanceRun(readRun(id)));
  const base = git(repo, 'rev-parse', 'HEAD').trim().slice(0, 7);
  return decideScreen(t, e, [id], { '<id>': id, '<repo>': repo, '<root>': ROOT, '<base>': base });
}

test("the whole screen of an ending whose check did not finish on the merge, with the check's files", async (t) => {
  assert.deepEqual(await checkedScreen(t, undefined), [
    '<id>  add sub',
    '',
    '  CHECK DID NOT FINISH: ship  — stopped, or killed before it exited: no verdict on the work, and no retry spent; nothing after it ran',
    '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
    '',
    '  once more, on the next tick:',
    '    ship: its check did not finish, so the run aborted the merge and nothing landed on main. Merge and check again:  nemia retry <id> ship',
    '',
    '  touched  wf/<id>/implement',
    '    (root)  1 file   +1 −0',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did the work',
    '',
    '  ship',
    '    gate  approved 08:00Z — "Merge it."',
    '    check  npm test && npm run typecheck && npm run lint  →  unfinished ✗',
    '      stdout:',
    '        (no output yet)',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1        filed not known  settled before it spawned  used not measured',
    '              try 1 check  filed not known  settled before it spawned',
    '    did the work',
    '    message: Add sub',
    '      ',
    '      add.ts exports sub beside add.',
    '      The run, its branch: 1 commit; the check on the merged tree.',
    '      ',
    '    files:',
    '      <root>/runs/<id>/artifacts/ship/answer-light-failed.png  10 B',
    '      <root>/runs/<id>/artifacts/ship/page-001-dark.png  10 B',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  wf/<id>/implement  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/implement is ahead of main by 1 commit',
    '  merges    wf/<id>/implement merges cleanly onto main',
    '  others    no other run is in flight on main',
  ]);
});

test("the whole screen of an ending whose check refused the merge, with the check's files", async (t) => {
  assert.deepEqual(await checkedScreen(t, 1), [
    '<id>  add sub',
    '',
    '  FAILED CHECK: ship  — the run executed its check and it did not exit 0; nothing after it ran',
    '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
    '',
    '  once more, on the next tick:',
    '    ship: failed (check) — nothing landed on main: its check refused the merge (exit 1). Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <id> ship  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  wf/<id>/implement',
    '    (root)  1 file   +1 −0',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did the work',
    '',
    '  ship',
    '    gate  approved 08:00Z — "Merge it."',
    '    check  npm test && npm run typecheck && npm run lint  →  exit 1 ✗',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1        filed not known  settled before it spawned  used not measured',
    '              try 1 check  filed not known  settled before it spawned',
    '    did the work',
    '    message: Add sub',
    '      ',
    '      add.ts exports sub beside add.',
    '      The run, its branch: 1 commit; the check on the merged tree.',
    '      ',
    '    files:',
    '      <root>/runs/<id>/artifacts/ship/answer-light-failed.png  10 B',
    '      <root>/runs/<id>/artifacts/ship/page-001-dark.png  10 B',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  wf/<id>/implement  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/implement is ahead of main by 1 commit',
    '  merges    wf/<id>/implement merges cleanly onto main',
    '  others    no other run is in flight on main',
    "  semantic  merges cleanly onto main, and ship's landing check refused the merged tree at <base>: a conflict of meaning, not of text",
  ]);
});

test('the whole screen of a run whose ending waits for the checkout, first filed and then sent back', async (t) => {
  const { repo, first, second, e, settle } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  await runWith(e, advanceRun(readRun(first.id)));
  const ids = { '<first>': first.id, '<second>': second.id, '<repo>': repo, '<root>': ROOT };
  assert.deepEqual(await decideScreen(t, e, [first.id], ids), [
    '<first>  add sub',
    '',
    '  still running: ship',
    "  ship: waiting on the checkout (<second>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <second>'s ship has settled",
    '  nothing to decide yet',
  ]);
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(first.id)));
  assert.deepEqual(await decideScreen(t, e, [second.id], ids), [
    '<second>  add sub',
    '',
    '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
    '  BLOCKED, waiting on you: ship',
    '',
    '  once more, on the next tick:',
    '    ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <second> ship  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  wf/<second>/implement',
    '    (root)  1 file   +1 −0',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    did the work',
    '',
    '  ship  BLOCKED',
    '    gate  approved 08:00Z',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed not known  settled before it spawned  used not measured',
    '    the check refused',
    '    !! declared and not given: message',
    '    needs: read the suite',
    '    to answer it:  nemia retry <second> ship --message "<answer>"',
    '',
    '  cost  run not measured',
    '  timeline  run  queued —  ran —  wall not known',
    '',
    '  wf/<second>/implement  — 1 file: +1 −0',
    '',
    '  branch    wf/<second>/implement is ahead of main by 1 commit',
  ]);
  await runWith(e, retryRun(second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' }));
  await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual(await decideScreen(t, e, [second.id], ids), [
    '<second>  add sub',
    '',
    '  still running: ship',
    "  ship: waiting on the checkout (<first>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <first>'s ship has settled",
    '  nothing to decide yet',
  ]);
});

test('while the store is paused, a landing whose check has ended commits on its exit 0, and one its check refused is aborted, as without it', async () => {
  for (const [exit, phase] of [
    [0, 'succeeded'],
    [1, 'failed'],
  ] as const) {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    putPause({ why: 'merging by hand', by: 'ann' });
    try {
      settle(checkId, phase, undefined, exit);
      const paused = runStore.runs.read(id);
      assert.ok(paused.pause, 'the run is read with the pause, as every pass reads it');
      const advanced = await runWith(e, advanceRun(paused));
      assert.deepEqual(advanced.filed, [], `exit ${exit}: nothing filed`);
      assert.equal(mergeHead(repo), false, `exit ${exit}: the merge is not left staged in the checkout`);
      const landed = readRun(id).steps.ship.landed;
      if (exit === 0) {
        assert.deepEqual(landed, { commit: git(repo, 'rev-parse', 'HEAD') }, 'committed onto the base branch');
        assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base);
      } else {
        assert.ok(landed && 'aborted' in landed, JSON.stringify(landed));
        assert.equal(git(repo, 'rev-parse', 'HEAD'), base, 'aborted, the base branch where it was');
      }
    } finally {
      resumePause();
    }
  }
});

/** main moves under the run: a commit on the base branch that gives add.ts a `sub` of its own, which the branch's conflicts with. */
const mainMoves = (repo: string): string => {
  fs.appendFileSync(path.join(repo, 'add.ts'), 'export const sub = (a, b) => b - a;\n');
  git(repo, 'commit', '-q', '-am', "main's sub");
  return git(repo, 'rev-parse', 'HEAD');
};

/** A refusal of `nemia merge`: exit 2, in `words`, and no ask written. */
const mergeRefused = (id: string, words: RegExp) => (err: Error & { exitCode?: number }) => {
  assert.equal(err.exitCode, 2);
  assert.match(err.message, words);
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'runs', `${id}.asks`)).filter((f) => f.startsWith('merge-')),
    [],
  );
  return true;
};

test('REFUSED at shipped defaults: a merge of work whose trial merge onto the base is clean — nothing to merge, and the refusal says to approve the landing', async () => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: loopingFolder() }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  addSub(work.workspace!);
  git(work.workspace!, 'commit', '-q', '-am', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  await runWith(e, advanceRun(readRun(run.id)));
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`), { recursive: true });
  await assert.rejects(
    runWith(e, mergeRun(run.id)),
    mergeRefused(
      run.id,
      new RegExp(`^${work.branch} merges cleanly onto main: nothing to merge — approve the landing: nemia approve ${run.id} ship\\.$`),
    ),
  );
});

test('REFUSED at shipped defaults: a merge of an ending stopped on a base that merges cleanly says to ship it again, and one of a run with no loop says to send its result step back', async () => {
  const { id, e } = await stoppedOnBase();
  await assert.rejects(
    runWith(e, mergeRun(id)),
    mergeRefused(id, new RegExp(`nothing to merge — ship it again: nemia retry ${id} ship\\.$`)),
  );

  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder() }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  mainMoves(repo);
  fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`), { recursive: true });
  await assert.rejects(
    runWith(b.e, mergeRun(run.id)),
    mergeRefused(
      run.id,
      new RegExp(`^implement closes no loop, [^]*nemia retry ${run.id} implement --message "merge main, keeping both meanings"\\.$`),
    ),
  );
});

test('nemia decide offers the merge where the work conflicts with the base, and not where it merges cleanly: the bare `nemia merge`, labelled merge', async () => {
  const { repo, id, e } = await stoppedOnBase();
  const merges = async () => (await runWith(e, decideRun(id))).commands.filter((c) => c.label === 'merge');
  assert.deepEqual(await merges(), [], 'a base that merges cleanly is shipped again, never merged');
  mainMoves(repo);
  const decided = await runWith(e, decideRun(id));
  assert.deepEqual(
    decided.commands.filter((c) => c.label === 'merge'),
    [
      {
        label: 'merge',
        command: `nemia merge ${id} review`,
        said: `review: implement's work conflicts with main. Merge main into it — implement continued, then a new review, on round 1, which the merge does not spend:  nemia merge ${id} review`,
        step: 'review',
      },
    ],
  );
  assert.ok(decided.offers.includes(decided.commands.find((c) => c.label === 'merge')!.said!), decided.offers.join('\n'));
  await runWith(e, mergeRun(id));
  assert.deepEqual(await merges(), [], 'nor once it is asked');
});

/** A `git` on PATH that answers every command as git does but reading the commit `branch` names, which it says it has none of. */
function blindTo(branch: string): string {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const dir = scratch('wf-ship-blind-git-');
  fs.writeFileSync(
    path.join(dir, 'git'),
    `#!/bin/sh\ncase "$*" in *"rev-parse --verify --quiet ${branch}^{commit}"*) exit 1;; esac\nexec ${real} "$@"\n`,
    { mode: 0o755 },
  );
  return dir;
}

test('REFUSED at shipped defaults: a merge whose trial read no commit of the base says git cannot read it, and `nemia decide` offers none', async () => {
  const { repo, id, e } = await stoppedOnBase();
  mainMoves(repo);
  const before = process.env.PATH;
  process.env.PATH = `${blindTo('main')}${path.delimiter}${before}`;
  try {
    await assert.rejects(
      runWith(e, mergeRun(id)),
      mergeRefused(id, new RegExp(`^git cannot read main in ${repo}\\. Check the repository, then: nemia merge ${id}\\.$`)),
    );
    assert.deepEqual(
      (await runWith(e, decideRun(id))).commands.filter((c) => c.label === 'merge'),
      [],
    );
  } finally {
    process.env.PATH = before;
  }
});

test('a loop out of rounds is sent to merge without `nemia round`: the merge spends no round, and the reviewer after it hands on to the gate', async () => {
  const { repo, id, e, settle } = await atTheCap();
  const sha = mainMoves(repo);
  const { ask } = await runWith(e, mergeRun(id, 'review'));
  assert.deepEqual([ask.round, ask.merge.sha], [1, sha]);
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).looped, ['review']);
  assert.equal(roundOf(readRun(id), 'review'), 1);
  settle(`${id}-implement-try2`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
  await runWith(e, advanceRun(readRun(id)));
  const listed = await runWith(e, list(e, readRun(id)));
  assert.equal(listed.steps.find((s) => s.name === 'ship')!.status, 'awaiting approval');
  assert.equal(roundOf(readRun(id), 'review'), 1, 'still round 1 of 1');
});

test("a merge past round 1 owes no replies: the target's merge try is handed no findings, and its empty list signs it off, so review is filed after it", async () => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: loopingFolder(2) }));
  const { e, settle, tasks } = board();
  const id = run.id;
  await runWith(e, advanceRun(readRun(id)));
  const work = readRun(id).steps.implement;
  addSub(work.workspace!);
  git(work.workspace!, 'commit', '-q', '-am', 'add sub');
  settle(`${id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(e, advanceRun(readRun(id)));
  const unsigned = 'A closeout without it, or with an empty list, is unsigned.';
  assert.ok(tasks.get(`${id}-implement-try2`)!.spec.brief.includes(unsigned), 'round 2 of a round owes its replies');
  settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, replies: [{ finding: 'sub', answer: 'fixed', why: 'kept it' }] });
  await runWith(e, advanceRun(readRun(id)));
  settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, [], 'out of rounds at round 2 of 2');

  mainMoves(repo);
  await runWith(e, mergeRun(id, 'review'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).looped, ['review']);
  assert.equal(roundOf(readRun(id), 'review'), 2);
  const brief = tasks.get(`${id}-implement-try3`)!.spec.brief;
  assert.ok(brief.includes('You were handed no findings this round.'), brief);
  assert.ok(!brief.includes(unsigned), brief);
  settle(`${id}-implement-try3`, 'succeeded', { ...SIGNED, replies: [] });
  await runWith(e, advanceRun(readRun(id)));
  assert.ok(tasks.has(`${id}-review-try3`), 'the merge try signed off with no replies, and review reads the merge');
});

test('REFUSED at shipped defaults: a round or an acceptance of a loop out of rounds while a merge of it is asked — either would drop the merge unsaid, and the refusal names the ask to take back', async () => {
  const { repo, id, e } = await atTheCap();
  mainMoves(repo);
  await runWith(e, mergeRun(id, 'review'));
  const asks = () => fs.readdirSync(path.join(ROOT, 'runs', `${id}.asks`)).sort();
  const written = asks();
  const waits = (verb: string) => (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.match(
      err.message,
      new RegExp(
        `^a merge of main into implement's work is asked \\(at [^)]+\\), and the next tick files it once, on round 1: [^]* merge-implement-2, in the run's \\.asks directory — then: ${verb}\\.$`,
      ),
    );
    assert.deepEqual(asks(), written, 'nothing written');
    return true;
  };
  await assert.rejects(runWith(e, roundRun(id, 'review')), waits(`nemia round ${id} review`));
  await assert.rejects(runWith(e, acceptRun(id, 'review', ENOUGH)), waits(`nemia accept ${id} review --message "<why>"`));
  await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(
    readRun(id).steps.implement.tries?.map((t) => t.then),
    ['merge'],
    'the merge is filed, as asked',
  );
});

test('a merge a pass filed and never wrote down is adopted as a merge: the round kept, the base moved to the commit merged, nothing filed twice', async () => {
  const { repo, id, e, tasks, filings } = await stoppedOnBase();
  const sha = mainMoves(repo);
  await runWith(e, mergeRun(id));
  tasks.set(`${id}-implement-try2`, { spec: { id: `${id}-implement-try2`, brief: '## Merge main' }, phase: 'pending' });
  const before = filings.length;
  await runWith(e, advanceRun(readRun(id)));
  const run = readRun(id);
  assert.deepEqual(
    run.steps.implement.tries?.map((t) => t.then),
    ['merge'],
  );
  assert.equal(run.steps.implement.taskId, `${id}-implement-try2`);
  assert.equal(roundOf(run, 'review'), 1);
  assert.equal(run.baseRef, sha);
  assert.ok(!filings.slice(before).includes(`${id}-implement-try2`), filings.join(', '));
});

/** What the ship's check printed on the merged tree it refused, as turbo prefixes node's spec reporter: a test failed, listed twice. */
const FAILING = [
  '@x/add:test: ✔ add adds (1.2ms)',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
  '@x/add:test: ℹ fail 1',
  '@x/add:test: ✖ failing tests:',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
].join('\n');

/**
 * A loop's work that merges cleanly onto main and that ship's check refused on the merged tree: implement and review done, ship approved
 * and filed, its merge staged and signed off, and its check settled `failed` with exit 1 — with none where it did not finish (`finished`)
 * — printing `FAILING`; the pass after aborts the merge. The base branch is where the merge was staged on (`base`).
 */
async function refusedOnBase(finished = true) {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: loopingFolder() }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  addSub(work.workspace!);
  git(work.workspace!, 'commit', '-q', '-am', 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['ship']);
  git(repo, 'merge', '--no-ff', '--no-commit', work.branch!);
  b.settle(`${run.id}-ship`, 'succeeded', { ...SIGNED, message: MESSAGE });
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['ship']);
  const checkId = `${run.id}-ship-check`;
  b.settle(checkId, 'failed', undefined, finished ? 1 : undefined);
  b.tasks.get(checkId)!.printed = FAILING;
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(mergeHead(repo), false, 'the run aborted the merge its check refused');
  return { repo, id: run.id, branch: work.branch!, ...b, checkId, base: git(repo, 'rev-parse', 'HEAD') };
}

test("a merge of work that merges cleanly but whose landing check refused the merged tree on the base as it is: the conflict is semantic, the ask names the landing, and the target is told so with the check's failing tests", async () => {
  const { id, e, tasks, checkId, base } = await refusedOnBase();
  assert.deepEqual(
    readRun(id).steps.ship.landed,
    { aborted: 'its check refused the merge (exit 1)', refusedOn: base },
    'the record names the base the refused merge was staged on',
  );
  const before = roundOf(readRun(id), 'review');

  const { ask } = await runWith(e, mergeRun(id));
  const merge = { target: 'implement', try: 2, onto: 'main', sha: base, landing: { step: 'ship', check: checkId } };
  assert.deepEqual(ask.merge, merge);
  assert.deepEqual(
    runStore.asks.read(id).rounds.map((a) => a.merge),
    [merge],
    'the ask file keeps the landing it was asked on',
  );

  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual([sent.looped, sent.filed], [['review'], []], sent.notes.join('\n'));
  const run = readRun(id);
  assert.equal(roundOf(run, 'review'), before, 'the round stays as it is');
  assert.equal(run.baseRef, base, "the run's base is the commit merged");
  assert.deepEqual(
    run.steps.ship.tries?.map((t) => t.then),
    ['back'],
  );
  assert.equal(run.steps.ship.landed, undefined, 'the ending sent back keeps no landing, and so lets no merge through a second time');
  const brief = tasks.get(`${id}-implement-try2`)!.spec.brief;
  assert.match(brief, /^## Merge main\n/);
  assert.ok(
    brief.includes(
      `the work merges cleanly onto \`main\` as text, but ship's check refused the\nmerged tree at \`${base}\` (exit 1), so the conflict is semantic`,
    ),
    brief,
  );
  assert.ok(brief.includes(`\n    git merge --no-ff --no-commit ${base}\n`), brief);
  assert.ok(!brief.includes(`\n    git merge ${base}\n`), 'never the merge a textual conflict is made by');
  assert.ok(brief.includes('so `git show --remerge-diff` shows the fix'), brief);
  assert.match(brief, /\n## What ship's check said on the merged tree\n/);
  assert.ok(brief.includes(`"exit": 1,\n  "failing": [\n    "@x/add:test: ✖ sub subtracts (2.1ms)"\n  ],\n`), brief);
  assert.ok(brief.includes('You were handed no findings this round.'), 'a merge answers no finding');
});

test('REFUSED at shipped defaults: a merge of work that merges cleanly onto a base moved since its landing check refused it is nothing to merge, in the words of any clean trial merge; a base that moves into a conflict is a merge as text', async () => {
  const { repo, id, e, branch } = await refusedOnBase();
  fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'mul');
  await assert.rejects(
    runWith(e, mergeRun(id)),
    mergeRefused(id, new RegExp(`^${branch} merges cleanly onto main: nothing to merge — ship it again: nemia retry ${id} ship\\.$`)),
  );
  const sha = mainMoves(repo);
  const { ask } = await runWith(e, mergeRun(id));
  const merge = { target: 'implement', try: 2, onto: 'main', sha };
  assert.deepEqual(ask.merge, merge, 'no landing: its check refused another commit of the base');
  assert.deepEqual(
    runStore.asks.read(id).rounds.map((a) => a.merge),
    [merge],
  );
});

test('REFUSED at shipped defaults: a merge of work that merges cleanly whose landing check did not finish is nothing to merge', async () => {
  const { id, e, branch } = await refusedOnBase(false);
  const landed = readRun(id).steps.ship.landed;
  assert.ok(landed && 'aborted' in landed && !('refusedOn' in landed), JSON.stringify(landed));
  await assert.rejects(
    runWith(e, mergeRun(id)),
    mergeRefused(id, new RegExp(`^${branch} merges cleanly onto main: nothing to merge — ship it again: nemia retry ${id} ship\\.$`)),
  );
});

test('nemia decide offers the merge of work its landing check refused, saying the conflict is semantic, and `nemia merge` says what it asked', async (t) => {
  const { id, e, base } = await refusedOnBase();
  assert.deepEqual(
    (await runWith(e, decideRun(id))).commands.filter((c) => c.label === 'merge'),
    [
      {
        label: 'merge',
        command: `nemia merge ${id} review`,
        said: `review: implement's work merges cleanly onto main, but ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic. Merge main into it and fix what broke — implement continued, then a new review, on round 1, which the merge does not spend:  nemia merge ${id} review`,
        step: 'review',
      },
    ],
  );
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['merge', id], e);
  } finally {
    log.mock.restore();
  }
  assert.ok(
    printed[0]?.includes(
      `asked: merge main at ${base.slice(0, 7)} into implement's work, where ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic — the next tick files it`,
    ),
    printed.join('\n'),
  );
});

test('nemia decide reads the semantic conflict live at an ending whose landing check refused the merged tree: clean as text, refused on the base as it is', async () => {
  const { id, e, base, checkId } = await refusedOnBase();
  const { collisions, toDecide } = await runWith(e, decideRun(id));
  assert.equal(toDecide?.kind === 'approve', false, 'the ending waits at no gate: it was filed, and its landing aborted');
  assert.deepEqual(collisions?.semantic, {
    step: 'ship',
    check: checkId,
    sha: base,
    said: `merges cleanly onto main, and ship's landing check refused the merged tree at ${base.slice(0, 7)}: a conflict of meaning, not of text`,
  });
  assert.deepEqual(
    collisions?.base.map((b) => b.said),
    ['merges cleanly onto main'],
  );
});

test("a semantic merge whose check's output the engine cannot give is filed all the same, its brief saying why the output is missing", async () => {
  const { id, e, tasks, checkId } = await refusedOnBase();
  await runWith(e, mergeRun(id));
  tasks.get(checkId)!.printed = new Error('the stream is gone');
  const sent = await runWith(e, advanceRun(readRun(id)));
  assert.deepEqual(sent.looped, ['review'], sent.notes.join('\n'));
  const brief = tasks.get(`${id}-implement-try2`)!.spec.brief;
  assert.ok(brief.includes('git merge --no-ff --no-commit'), brief);
  assert.ok(
    brief.includes(
      `What it said cannot be given here — the engine could not give what its task ${checkId} printed: the stream is gone. Its task is \`${checkId}\`.`,
    ),
    brief,
  );
});

/** The package's place, its `status` answered by `status`. */
const statusPlace = (status: (request: PlaceRequests['status']) => PlaceOutcome<'status'>): Place => placeOver(shippedGitPlace, { status });

/** The package's place, whose `status` answers as the package's does and counts each time it is asked (`asked`). */
function countedPlace(): { place: Place; asked: () => number } {
  let asked = 0;
  const place = statusPlace((request) => {
    asked += 1;
    return shippedGitPlace.askNow('status', request);
  });
  return { place, asked: () => asked };
}

/** A place whose `status` gives every request `reply`. */
const answeringPlace = (reply: PlaceAnswers['status']): Place => statusPlace(() => ({ answer: reply }));

/** A place whose `status` reads no checkout: it is not heard, in its words. */
const failingPlace = (): Place => statusPlace(() => unreadBy('status', 'this place cannot read the checkout'));

/** What `landEnding` does with the run `id` as the board reads it now, through the place `place`, and the memo it read through. */
async function landedThrough(e: Engine, id: string, place: Place) {
  const run = readRun(id);
  const { views, phaseOf } = await runWith(e, taskPhasesRead(run));
  const memo = statusMemo(liveHeads, place);
  const verdictOf = exitVerdicts(views, run);
  return landEnding(run, stepsOf(run), phaseOf, closeoutReader(views, run), closeoutAsked(views), spendReader(views), verdictOf, memo);
}

/** Rewrite the record of run `id` through `edit`, as a record a nemia before this one wrote, or an odd one, reads. */
const rewritten = (id: string, edit: (record: Record<string, unknown>) => void): void => {
  const record = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Record<string, unknown>;
  edit(record);
  fs.writeFileSync(runFile(id), JSON.stringify(record, null, 2));
};

test('a run started before its place named a staged-merge file reads its checkout through `status`, and lands as any other', async () => {
  const { repo, id, e, settle, checkId, base } = await stagedAndSigned();
  rewritten(id, (record) => delete record.stagedFile);
  assert.equal(stagedHere(repositoryRun(readRun(id))), undefined, 'a record with no marker');
  assert.equal(
    mergeStaged(readRun(id), stepsOf(readRun(id)), statusMemo(liveHeads, shippedGitPlace)),
    true,
    'its merge read staged by the place',
  );
  settle(checkId, 'succeeded', undefined, 0);
  await runWith(e, advanceRun(readRun(id)));
  const head = git(repo, 'rev-parse', 'HEAD');
  assert.notEqual(head, base);
  assert.deepEqual(readRun(id).steps.ship.landed, { commit: head });
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.equal(
    mergeStaged(readRun(id), stepsOf(readRun(id)), statusMemo(liveHeads, shippedGitPlace)),
    false,
    'landed, nothing is read staged',
  );
});

test('REFUSED: a checkout its place gives no reading of is never a verdict — a check passed or refused, nothing is committed or aborted, the record stays unlanded, and the run says why', async () => {
  const place = failingPlace();
  for (const [phase, exitCode] of [
    ['succeeded', 0],
    ['failed', 1],
  ] as const) {
    const { repo, id, e, settle, checkId, base } = await stagedAndSigned();
    settle(checkId, phase, undefined, exitCode);
    const out = await landedThrough(e, id, place);
    assert.equal(out.landed, false, `${phase}: nothing written`);
    assert.equal(out.notes.length, 1, out.notes.join('\n'));
    assert.match(out.notes[0], /^ship: the run read no state of its checkout, so it neither commits nor aborts its merge \(/);
    assert.match(out.notes[0], /this place cannot read the checkout\): the next tick tries again$/, out.notes[0]);
    assert.equal(mergeHead(repo), true, `${phase}: the merge stays staged`);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
    assert.equal(readRun(id).steps.ship.landed, undefined, `${phase}: the record unlanded`);
  }

  const { repo, id, e, settle, checkId, base } = await stagedAndSigned();
  settle(checkId, 'succeeded', undefined, 0);
  assert.equal((await landedThrough(e, id, shippedGitPlace)).landed, true, "the same pass through the package's place lands");
  assert.notEqual(git(repo, 'rev-parse', 'HEAD'), base);
});

test("REFUSED: a merge its place reads as another's (`merging: 'other'`) is left alone, its check passed or refused", async () => {
  for (const [phase, exitCode] of [
    ['succeeded', 0],
    ['failed', 1],
  ] as const) {
    const { repo, id, e, settle, checkId, base } = await stagedAndSigned();
    settle(checkId, phase, undefined, exitCode);
    const place = answeringPlace({ merging: 'other', conflicted: false, missing: [], head: base });
    assert.deepEqual(await landedThrough(e, id, place), { notes: [], landed: false }, phase);
    assert.equal(mergeHead(repo), true, `${phase}: neither committed nor aborted`);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  }
});

test('REFUSED: a landing session is denied and told what its place says — a planted place that denies `hg commit` gives exactly that, and no git word', async () => {
  const say = { ...shippedGitPlace.declared.say, stage: 'hg -R {repo} merge {branches}' };
  const place: Place = { ...shippedGitPlace, declared: { denyWhileLanding: ['Bash(hg commit:*)'], say } };
  const { id, repo, branch } = await atTheGate();
  const run = readRun(id);
  const ship = stepsOf(run).find((s) => s.name === 'ship')!;
  const denied = filedDenies(ship, run, () => landingDenies(run, place))!;
  assert.deepEqual(denied, [...SHIPPER_DENIED, 'Bash(hg commit:*)']);
  assert.equal(
    denied.some((d) => d.includes('git commit')),
    false,
  );
  const words = landingWords(run, ship, place)!;
  assert.deepEqual(words, { stage: `hg -R ${repo} merge ${branch}`, denied: ['Bash(hg commit:*)'] });
  const told = landingContract(ship.check!, words);
  assert.ok(told.includes(`\`hg -R ${repo} merge ${branch}\``), told);
  assert.ok(told.includes('Your fence denies `Bash(hg commit:*)`'), told);
  assert.doesNotMatch(told, /git (commit|merge)/);
  const implement = stepsOf(run).find((s) => s.name === 'implement')!;
  assert.equal(landingWords(run, implement, place), undefined, 'a step that lands nothing is told nothing of it');
});

test("the place's `status` is asked only where a landing needs it: never of a landed run or a busy ending, once per checkout and run in a pass", async () => {
  const counted = countedPlace();
  const done = await stagedAndSigned();
  done.settle(done.checkId, 'succeeded', undefined, 0);
  await runWith(done.e, advanceRun(readRun(done.id)));
  const landed = readRun(done.id);
  assert.ok(landed.steps.ship.landed);
  const { stagedFile: _, ...unmarked } = repositoryRun(landed);
  const runs = Array.from({ length: 10 }, (_, i) => ({ ...(i % 2 ? landed : unmarked), id: `${landed.id}-${i}` }));
  assert.deepEqual(
    await runWith(done.e, heldRead(done.e, runs, standingReader(NOTHING_READ)).pipe(Effect.provide(PlaceService.layer(counted.place)))),
    { staged: [], held: [] },
  );
  assert.equal(counted.asked(), 0, 'a pause read over 10 landed runs, with the marker and without, asks nothing');

  const shared = board();
  const repo = aRepo();
  const waiting = await atTheGate({ repo, board: shared });
  const staging = await atTheGate({ repo, board: shared });
  await runWith(shared.e, approveRun(staging.id, 'ship'));
  assert.deepEqual((await runWith(shared.e, advanceRun(readRun(staging.id)))).filed, ['ship']);
  git(repo, 'merge', '--no-ff', '--no-commit', staging.branch);
  await runWith(shared.e, approveRun(waiting.id, 'ship'));
  const run = readRun(waiting.id);
  const held = (memo: ReturnType<typeof statusMemo>) =>
    runWith(
      shared.e,
      checkoutHold(
        shared.e,
        run,
        stepsOf(run),
        { standing: standingNow(runStore.runs.list()).pipe(Effect.provide(gitPlaceLayer)) },
        process.env,
        memo,
      ),
    );
  for (const phase of ['pending', 'running'] as const) {
    shared.settle(`${staging.id}-ship`, phase);
    assert.deepEqual(
      await held(statusMemo(liveHeads, counted.place)),
      { run: staging.id, step: 'ship' },
      `${phase}: held by the ending in it`,
    );
    assert.deepEqual(await landedThrough(shared.e, staging.id, counted.place), { notes: [], landed: false });
    assert.equal(counted.asked(), 0, `${phase}: a busy ending asks nothing`);
  }

  shared.settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
  const memo = statusMemo(liveHeads, counted.place);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await held(memo), { run: staging.id, step: 'ship' }, 'held by the run whose merge is staged and not landed');
  }
  assert.equal(counted.asked(), 1, 'two runs on one checkout, asked twice in a pass, read it once');
  assert.equal(stagedHere(repositoryRun(readRun(staging.id))), true);
});

test('a record that names a place skill, written when a run named one, lands through the place the pass is given, as any other', async () => {
  const named = await stagedAndSigned();
  rewritten(named.id, (record) => {
    record.placeSkill = { skill: 'svn', version: '1' };
    delete record.stagedFile;
  });
  assert.deepEqual(readRun(named.id).placeSkill, { skill: 'svn', version: '1' }, 'the record still reads, its name kept');
  assert.equal(merging(readRun(named.id), stepsOf(readRun(named.id)), statusMemo(liveHeads, shippedGitPlace)), 'ours');
  named.settle(named.checkId, 'succeeded', undefined, 0);
  await runWith(named.e, advanceRun(readRun(named.id)));
  const landed = readRun(named.id).steps.ship.landed;
  assert.ok(landed && 'commit' in landed, JSON.stringify(landed));
  assert.equal(mergeHead(named.repo), false);
});

test('a landed run started before its place named a staged-merge file is removed with no `status`, its checkout gone', async () => {
  const done = await stagedAndSigned();
  done.settle(done.checkId, 'succeeded', undefined, 0);
  await runWith(done.e, advanceRun(readRun(done.id)));
  rewritten(done.id, (record) => {
    delete record.stagedFile;
  });
  fs.rmSync(done.repo, { recursive: true, force: true });
  const run = readRun(done.id);
  assert.ok(run.steps.ship.landed && 'commit' in run.steps.ship.landed);
  assert.equal(
    merging(run, stepsOf(run), statusMemo(liveHeads, shippedGitPlace)),
    'none',
    'a landing already made owes no read of a checkout that is gone',
  );
});

test('REFUSED: a staged merge its place gives no reading of holds the checkout — another run approved on the same repository waits for it', async () => {
  const shared = board();
  const repo = aRepo();
  const waiting = await atTheGate({ repo, board: shared });
  const staging = await atTheGate({ repo, board: shared });
  await runWith(shared.e, approveRun(staging.id, 'ship'));
  assert.deepEqual((await runWith(shared.e, advanceRun(readRun(staging.id)))).filed, ['ship']);
  git(repo, 'merge', '--no-ff', '--no-commit', staging.branch);
  shared.settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
  await runWith(shared.e, approveRun(waiting.id, 'ship'));
  const run = readRun(waiting.id);
  const held = await runWith(
    shared.e,
    checkoutHold(
      shared.e,
      run,
      stepsOf(run),
      { standing: standingNow(runStore.runs.list()).pipe(Effect.provide(gitPlaceLayer)) },
      process.env,
      statusMemo(liveHeads, failingPlace()),
    ),
  );
  assert.deepEqual(held, { run: staging.id, step: 'ship' }, 'held by the run whose merge nobody can read');
  assert.equal(mergeHead(repo), true);
});

test('a run started before its place named a staged-merge file, its ending signed off blocked with its merge staged, has the merge aborted', async () => {
  const { repo, id, e, settle, base } = await atTheGate();
  await runWith(e, approveRun(id, 'ship'));
  assert.deepEqual((await runWith(e, advanceRun(readRun(id)))).filed, ['ship']);
  const branch = readRun(id).steps.implement.branch!;
  git(repo, 'merge', '--no-ff', '--no-commit', branch);
  rewritten(id, (record) => {
    delete record.stagedFile;
  });
  assert.equal(stagedHere(repositoryRun(readRun(id))), undefined, 'a record with no marker');
  settle(`${id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(mergeHead(repo), false, 'the merge taken back');
  assert.equal(git(repo, 'rev-parse', 'HEAD'), base);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'ship ended blocked with its merge staged' });
});
