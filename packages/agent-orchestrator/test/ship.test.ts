/**
 * The end of a run, on disk: a workflow whose last step merges, in a repository of the test place, which starts no process.
 *
 * What a gate means to `assess`, `listing` and `decision` is pure, and lives in run.test.ts. This is the part that is not: a run whose
 * ending step is never filed until a person approves it, the merge its session stages through the test place's handle (`World`), and
 * what the checkout looks like when its check refuses. What the test place does not model — git's own words to a landing session, a hook,
 * an octopus, a linked worktree, a `git` planted on the PATH — is in `ship-git.boundary.test.ts`, and an install in the checkout in
 * `ship-install.boundary.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads. The file sets what its starts through `main` depend
 * on itself: a run on a repository no factory holds goes to the default factory (`WF_DEFAULT_FACTORY_STARTS`), and a command that ticks
 * starts no daemon.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TaskSpec } from 'agent-runtime';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { StepRecord } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { TEAM, TEAM_DEV } from './team.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import type { World } from '../place/memory/world.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { placeOver, unreadBy } from './place-over.ts';

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
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
} = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

/** The handle on this test's place: a session's and a person's part in its repositories. */
const world = (): World => stand().world;

/** What `checkout` holds uncommitted, a path a line, and empty where it is clean. */
const uncommitted = (checkout: string): string => world().changes(checkout).join('\n');

/** `branch` merged into `repo`'s checkout and committed, as a person merges a result by hand. */
const mergedByHand = (repo: string, branch: string): void => {
  world().stage(repo, branch);
  world().commit(repo, `Merge branch '${branch}'`);
};
const { readRun, stepsOf, runFile } = await import('../src/record/record.store.ts');
const { roundOf } = await import('../src/run.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { resumePause, putPause } = await import('../src/pause/pause.store.ts');
const { main } = await import('../src/cli/main.ts');
type PlaceVerb = import('../src/place/place.ts').PlaceVerb;
type Place = import('../src/place/place.store.ts').Place;
type PlaceAnswers = import('../src/place/place.ts').PlaceAnswers;
const { PlaceService } = await import('../src/place/place.store.ts');
type PlaceOutcome<V extends PlaceVerb> = import('../src/place/place.ts').PlaceOutcome<V>;
const { stagedHere, statusMemo, mergeStaged } = await import('../src/place/landing.store.ts');
const { landEnding, checkoutHold } = await import('../src/ending/ending.verb.ts');
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

/** Every branch of a run's repository and its commit, asked of this test's place now (`headsNow`): what a memo reads a run's tips off. */
const liveHeads = (run: RepositoryRun) => headsNow(run, stand().place);

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

/** A repository with one file committed on main. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, { 'add.ts': 'export const add = (a, b) => a + b;\n' });
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
  world().commit(work.workspace!, 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  const pass = await runWith(e, advanceRun(readRun(run.id)));
  return { repo, id: run.id, branch: work.branch!, e, tasks, filings, settle, pass, base: world().head(repo) };
}

/**
 * A step's record without what every filing writes of the revisions it took — the agent and skill pins (`pinned`) and the digest of the
 * closeout schema it was given (`closeoutHash`), whose subject is `revisions.test.ts`: what is left is what this file is about.
 */
const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
  const { pinned: _, closeoutHash: __, ...rest } = record ?? { taskId: null };
  return rest;
};

test('`nemia start` on a folder with an ending says so: nothing of that step runs until a person approves it', async (t) => {
  const repo = aRepo();
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  try {
    await main(['start', 'add sub', '--repo', repo, '--workflows', folder()], promised({}), undefined, stand().place);
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
  assert.deepEqual(
    [pass.filed, pass.status],
    [[], 'awaiting approval'],
    'the ending is not filed, and the run reads as one waiting on a person',
  );
  assert.deepEqual(filings, [`${id}-implement`]);
  assert.equal(readRun(id).steps.ship.taskId, null);
  assert.equal(world().head(repo), base, 'the base branch has not moved');
  assert.equal(uncommitted(repo), '', 'and the checkout is clean');

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

  mergedByHand(repo, branch);
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
    await main(['ls', id], e, undefined, stand().place);
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
    await main(['decide', id], e, undefined, stand().place);
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

  mergedByHand(repo, branch);
  const forgot = await runWith(e, forgetRun(id));
  assert.equal(forgot.kind, 'forgotten', forgot.kind === 'refused' ? forgot.refusal : '');
  assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false);
});

test("an ending's gate is a decision again once the base branch no longer has the result: git is read each pass, and the approval is honoured", async () => {
  const { repo, id, branch, e, base } = await atTheGate();
  mergedByHand(repo, branch);
  await aPass(e);
  assert.equal((await runWith(e, list(e, readRun(id)))).toDecide, undefined);
  world().putBack(repo, base);
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

const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';

/**
 * A run at its ending, approved and filed, whose shipper did as its recipe says: staged the merge of the result in the repository's
 * checkout and signed off `done` with the message — and the pass after, which files ship's check on that merge.
 */
async function stagedAndSigned(given: Given & { message?: string; artifacts?: string[] } = {}) {
  const at = await atTheGate(given);
  await runWith(at.e, approveRun(at.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(at.e, advanceRun(readRun(at.id)))).filed, ['ship']);
  world().stage(at.repo, at.branch);
  at.settle(`${at.id}-ship`, 'succeeded', { ...SIGNED, artifacts: given.artifacts ?? [], message: given.message ?? MESSAGE });
  const signed = await runWith(at.e, advanceRun(readRun(at.id)));
  return { ...at, signed, checkId: `${at.id}-ship-check` };
}

/** Whether a merge is staged in `repo`'s checkout and not committed. */
const mergeHead = (repo: string): boolean => world().staged(repo) !== null;

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

test('a pass after a restart does what the last one would have: a merge committed before the run wrote it down is recorded as landed, never committed twice, and one aborted by hand is recorded as nothing landed', async () => {
  {
    const { repo, id, e, settle, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    world().commit(repo, 'the commit the pass made before it died');
    const head = world().head(repo);
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
    assert.equal(world().head(repo), head, 'nothing committed again');
    assert.equal((await runWith(e, decideRun(id))).decision.kind, 'shipped');
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    const shot = photographed(id, { count: 3, bytes: 10 });
    settle(checkId, 'failed', undefined, 1);
    world().takeBack(repo);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(
      readRun(id).steps.ship.landed,
      { aborted: 'its check refused the merge (exit 1)' },
      'after git merge --abort of a refused merge, what the check said is recorded, and nothing is aborted again',
    );
    assert.deepEqual(pngsIn(shot.dir), [...shot.pictures].sort(), 'nothing landed: every picture is kept');
    assert.equal(world().head(repo), base);
  }
  {
    const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    world().takeBack(repo);
    await runWith(e, advanceRun(readRun(id)));
    assert.deepEqual(readRun(id).steps.ship.landed, {
      aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed',
    });
    assert.equal(
      world().head(repo),
      base,
      'a check that passed on a merge no longer staged commits nothing: the run does not merge again on its own',
    );
  }
});

test("REFUSED at shipped defaults: a merge in the checkout that is not the run's is never touched — committed nor aborted — with nothing of the ending running", async () => {
  const { repo, id, e, settle, base, checkId } = await stagedAndSigned();
  settle(checkId, 'succeeded', undefined, 0);
  world().takeBack(repo);
  const theirs = world().branch(repo, 'theirs', { 'mul.ts': 'export const mul = (a, b) => a * b;\n' });
  world().stage(repo, 'theirs');
  for (let pass = 0; pass < 2; pass++) {
    await runWith(e, advanceRun(readRun(id)));
    assert.equal(
      world().staged(repo),
      theirs,
      "a person took the checkout for a merge of their own before the pass landed the run's: their merge is still staged",
    );
    assert.equal(world().head(repo), base);
    assert.equal(readRun(id).steps.ship.landed, undefined, 'and the run has written nothing of its own merge yet');
  }
  world().takeBack(repo);
  await runWith(e, advanceRun(readRun(id)));
  assert.match(
    String((readRun(id).steps.ship.landed as { aborted?: string }).aborted),
    /no longer staged/,
    "once theirs is done, the run's merge is read as gone",
  );
  assert.equal(world().head(repo), base, 'and nothing of it is committed');
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
    await main(['decide', first.id], e, undefined, stand().place);
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
  assert.equal(world().head(repo), first.base, 'nothing merged while two endings wanted the same directory');
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
    await main(['decide', second.id], e, undefined, stand().place);
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
  world().stage(repo, parent.branch);
  world().commit(repo, `Merge branch '${parent.branch}'`);
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
  world().stage(repo, branch);
  world().commit(repo, `Merge branch '${branch}'`);
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
  assert.equal(world().head(repo), base, 'nothing is merged');
  assert.equal(uncommitted(repo), '');
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

  const tip = world().head(review.workspace!);
  fs.writeFileSync(path.join(review.workspace!, 'NOTES.md'), "a person's notes\n");
  await runWith(e, advanceRun(readRun(id)));
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(world().head(review.workspace!), tip, "no commit under review's name");
  assert.match(uncommitted(review.workspace!), /NOTES\.md/, "the edit is still the person's, uncommitted");
});

test("a check that refuses leaves the checkout clean: the abort the ending's prose names takes the trial merge back, and the run says what happened", async () => {
  const { repo, id, branch, e, settle, base } = await atTheGate();
  await runWith(e, approveRun(id, 'ship'));
  await runWith(e, advanceRun(readRun(id)));

  world().stage(repo, branch);
  assert.notEqual(
    uncommitted(repo),
    '',
    'the step, played as its prose says when the check refuses: the trial merge is staged and uncommitted, then aborted',
  );
  world().takeBack(repo);
  assert.equal(uncommitted(repo), '', 'the checkout is as it was');
  assert.equal(world().head(repo), base, 'and the base branch has not moved');

  settle(`${id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(id)));
  const record = readRun(id);
  assert.equal(uncommitted(repo), '', 'nor does the run commit what a step left in that checkout');
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
  world().stage(at.repo, at.branch);
  return { ...at, pass };
};

test('REFUSED at shipped defaults: an ending that stopped on its own word is written down once — its merge left staged is taken back, and a merge a person stages after it is theirs', async () => {
  {
    const { repo, id, branch, e, settle, base } = await atTheGate();
    await runWith(e, approveRun(id, 'ship'));
    await runWith(e, advanceRun(readRun(id)));
    world().stage(repo, branch);
    settle(`${id}-ship`, 'succeeded', BLOCKED);
    const pass = await runWith(e, advanceRun(readRun(id)));
    assert.equal(mergeHead(repo), false, 'blocked with its merge left staged: the pass takes it back');
    assert.equal(uncommitted(repo), '');
    assert.equal(world().head(repo), base);
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
    assert.notEqual(uncommitted(repo), '');
    assert.equal(world().head(repo), base);
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
  world().commit(work.workspace!, 'add sub');
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
  return { repo, id: run.id, branch: work.branch!, ...b, base: world().head(repo) };
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
    await main(['decide', id], e, undefined, stand().place);
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
  assert.deepEqual(filedAs(readRun(id).steps.ship), {
    taskId: null,
    workspace: repo,
    branch: 'main',
    tries: [{ taskId: `${id}-ship`, then: 'back' }],
  });
  assert.equal(world().head(repo), base, 'nothing merged');
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
  world().commit(work.workspace!, 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  assert.deepEqual((await runWith(e, advanceRun(readRun(run.id)))).filed, [], 'out of rounds, nothing after the loop is filed');
  return { repo, id: run.id, ...b, base: world().head(repo) };
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
  world().stage(repo, readRun(id).steps.implement.branch!);
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
  mergedByHand(repo, branch);
  assert.deepEqual(await decideScreen(t, e, [id], { '<id>': id, '<repo>': repo, '<root>': ROOT }, stand().place), [
    '<id>  add sub',
    '',
    '  shipped — wf/<id>/run is already on main',
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
  const base = world().head(repo).slice(0, 7);
  return decideScreen(t, e, [id], { '<id>': id, '<repo>': repo, '<root>': ROOT, '<base>': base }, stand().place);
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
    '  touched  wf/<id>/run',
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
    '  wf/<id>/run  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/run is ahead of main by 1 commit',
    '  merges    wf/<id>/run merges cleanly onto main',
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
    '  touched  wf/<id>/run',
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
    '  wf/<id>/run  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/run is ahead of main by 1 commit',
    '  merges    wf/<id>/run merges cleanly onto main',
    '  others    no other run is in flight on main',
    "  semantic  merges cleanly onto main, and ship's landing check refused the merged tree at <base>: a conflict of meaning, not of text",
  ]);
});

test('the whole screen of a run whose ending waits for the checkout, first filed and then sent back', async (t) => {
  const { repo, first, second, e, settle } = await twoApproved();
  await runWith(e, advanceRun(readRun(second.id)));
  await runWith(e, advanceRun(readRun(first.id)));
  const ids = { '<first>': first.id, '<second>': second.id, '<repo>': repo, '<root>': ROOT };
  assert.deepEqual(await decideScreen(t, e, [first.id], ids, stand().place), [
    '<first>  add sub',
    '',
    '  still running: ship',
    "  ship: waiting on the checkout (<second>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <second>'s ship has settled",
    '  nothing to decide yet',
  ]);
  settle(`${second.id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(first.id)));
  assert.deepEqual(await decideScreen(t, e, [second.id], ids, stand().place), [
    '<second>  add sub',
    '',
    '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
    '  BLOCKED, waiting on you: ship',
    '',
    '  once more, on the next tick:',
    '    ship: blocked. Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <second> ship  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  wf/<second>/run',
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
    '  wf/<second>/run  — 1 file: +1 −0',
    '',
    '  branch    wf/<second>/run is ahead of main by 1 commit',
  ]);
  await runWith(e, retryRun(second.id, 'ship', { mode: 'nudge', message: 'the check was green here; run it again' }));
  await runWith(e, advanceRun(readRun(second.id)));
  assert.deepEqual(await decideScreen(t, e, [second.id], ids, stand().place), [
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
        assert.deepEqual(landed, { commit: world().head(repo) }, 'committed onto the base branch');
        assert.notEqual(world().head(repo), base);
      } else {
        assert.ok(landed && 'aborted' in landed, JSON.stringify(landed));
        assert.equal(world().head(repo), base, 'aborted, the base branch where it was');
      }
    } finally {
      resumePause();
    }
  }
});

/** main moves under the run: a commit on the base branch that gives add.ts a `sub` of its own, which the branch's conflicts with. */
const mainMoves = (repo: string): string => {
  fs.appendFileSync(path.join(repo, 'add.ts'), 'export const sub = (a, b) => b - a;\n');
  world().commit(repo, "main's sub");
  return world().head(repo);
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
  world().commit(work.workspace!, 'add sub');
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
  world().commit(work.workspace!, 'add sub');
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
  world().commit(work.workspace!, 'add sub');
  b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: false });
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, approveRun(run.id, 'ship', 'Merge it.'));
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).filed, ['ship']);
  world().stage(repo, work.branch!);
  b.settle(`${run.id}-ship`, 'succeeded', { ...SIGNED, message: MESSAGE });
  assert.deepEqual((await runWith(b.e, advanceRun(readRun(run.id)))).checked, ['ship']);
  const checkId = `${run.id}-ship-check`;
  b.settle(checkId, 'failed', undefined, finished ? 1 : undefined);
  b.tasks.get(checkId)!.printed = FAILING;
  await runWith(b.e, advanceRun(readRun(run.id)));
  assert.equal(mergeHead(repo), false, 'the run aborted the merge its check refused');
  return { repo, id: run.id, branch: work.branch!, ...b, checkId, base: world().head(repo) };
}

test('REFUSED at shipped defaults: a merge of work that merges cleanly onto a base moved since its landing check refused it is nothing to merge, in the words of any clean trial merge; a base that moves into a conflict is a merge as text', async () => {
  const { repo, id, e, branch } = await refusedOnBase();
  fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
  world().commit(repo, 'mul');
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
    await main(['merge', id], e, undefined, stand().place);
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

/** This test's place, its `status` answered by `status`. */
const statusPlace = (status: (request: PlaceRequests['status']) => PlaceOutcome<'status'>): Place => placeOver(stand().place, { status });

/** This test's place, whose `status` answers as its own does and counts each time it is asked (`asked`). */
function countedPlace(): { place: Place; asked: () => number } {
  let asked = 0;
  const place = statusPlace((request) => {
    asked += 1;
    return stand().place.askNow('status', request);
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
    mergeStaged(readRun(id), stepsOf(readRun(id)), statusMemo(liveHeads, stand().place)),
    true,
    'its merge read staged by the place',
  );
  settle(checkId, 'succeeded', undefined, 0);
  await runWith(e, advanceRun(readRun(id)));
  const head = world().head(repo);
  assert.notEqual(head, base);
  assert.deepEqual(readRun(id).steps.ship.landed, { commit: head });
  assert.equal(uncommitted(repo), '');
  assert.equal(
    mergeStaged(readRun(id), stepsOf(readRun(id)), statusMemo(liveHeads, stand().place)),
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
    assert.equal(world().head(repo), base);
    assert.equal(readRun(id).steps.ship.landed, undefined, `${phase}: the record unlanded`);
  }

  const { repo, id, e, settle, checkId, base } = await stagedAndSigned();
  settle(checkId, 'succeeded', undefined, 0);
  assert.equal((await landedThrough(e, id, stand().place)).landed, true, "the same pass through the package's place lands");
  assert.notEqual(world().head(repo), base);
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
    assert.equal(world().head(repo), base);
  }
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
  world().stage(repo, staging.branch);
  await runWith(shared.e, approveRun(waiting.id, 'ship'));
  const run = readRun(waiting.id);
  const held = (memo: ReturnType<typeof statusMemo>) =>
    runWith(
      shared.e,
      checkoutHold(
        shared.e,
        run,
        stepsOf(run),
        { standing: standingNow(runStore.runs.list()).pipe(Effect.provide(stand().layer)) },
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
  assert.equal(merging(readRun(named.id), stepsOf(readRun(named.id)), statusMemo(liveHeads, stand().place)), 'ours');
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
    merging(run, stepsOf(run), statusMemo(liveHeads, stand().place)),
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
  world().stage(repo, staging.branch);
  shared.settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
  await runWith(shared.e, approveRun(waiting.id, 'ship'));
  const run = readRun(waiting.id);
  const held = await runWith(
    shared.e,
    checkoutHold(
      shared.e,
      run,
      stepsOf(run),
      { standing: standingNow(runStore.runs.list()).pipe(Effect.provide(stand().layer)) },
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
  world().stage(repo, branch);
  rewritten(id, (record) => {
    delete record.stagedFile;
  });
  assert.equal(stagedHere(repositoryRun(readRun(id))), undefined, 'a record with no marker');
  settle(`${id}-ship`, 'succeeded', BLOCKED);
  await runWith(e, advanceRun(readRun(id)));
  assert.equal(mergeHead(repo), false, 'the merge taken back');
  assert.equal(world().head(repo), base);
  assert.equal(uncommitted(repo), '');
  assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'ship ended blocked with its merge staged' });
});
