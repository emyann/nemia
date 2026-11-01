/**
 * The end of a run, on disk: a workflow whose last step merges, in a repository of the test place, which starts no process, told as
 * stories. One run's ending: a run to its ending's gate, approved, merged and landed on its check, and a run `--after` it; a landing read
 * again after a restart, a pause or a person's hand; a record an older nemia wrote; a place that reads the checkout oddly; and an ending
 * that stops on its own word or whose check refuses the merged tree. The ends of runs that share a repository: a result a person merged
 * by hand before its ending ran — the run has landed as git reads it, and a run `--after` it starts — and two runs of one repository at
 * their endings, which never work in its one checkout at once. The work sent back from a run's ending: a send-back at the ending's gate,
 * an ending stopped on its base branch that sends the work back through the loop, a loop out of rounds before its ending, and `nemia
 * refresh --base`, the merge of the base into the work — where it conflicts as text, and where the ending's check refused the merged tree
 * (the conflict is semantic).
 *
 * What a gate means to `assess`, `listing` and `decision` is pure, and lives in `assess-endings.test.ts`. What the test place does not
 * model — git's own words to a landing session, a hook, an octopus, a linked worktree, a `git` planted on the PATH — is in
 * `ship-git.boundary.test.ts`, and an install in the checkout in `ship-install.boundary.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads. A run on a repository no factory holds goes to the
 * default factory (`WF_DEFAULT_FACTORY_STARTS`), and a command that ticks starts no daemon. `endings(stage, root)` imports the runner,
 * so it is called once the environment is set; the team's agents and skills are copied beside every folder made under `root`, since the
 * team's `ship.md` names `agent: shipper`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { placeOver, unreadBy } from './place-over.ts';
import type { RepositoryRun, Run, StepRecord } from '../src/run.ts';
import type { World } from '../place/memory/world.ts';
import type { Stage } from './story.ts';

/** The tests' team (`team.ts`, which this file may not import: it loads the package before the file sets its environment). */
const TEAM = path.join(import.meta.dirname, 'fixtures', 'team');
const TEAM_DEV = path.join(TEAM, 'dev');

/** The closeout of a step that did its work. */
const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
/** The closeout of an ending whose check refused. */
const BLOCKED = { outcome: 'blocked', summary: 'the check refused', artifacts: [], needs: 'read the suite' };
/** The closeout of an ending that stopped on its base branch: the work does not hold on main as it is now. */
const STOPPED = {
  outcome: 'blocked',
  summary: 'main moved since the branch was cut: the trial merge conflicts in add.ts, so I aborted it',
  artifacts: [],
  needs: "the branch has to take main: add.ts conflicts with main's sub",
};
/** The message an ending signs off with, to commit its merge with. */
const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';
/** Why a person judged the loop's findings later work rather than this run's: what `nemia approve` carries to the shipper. */
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';
/** What the ship's check printed on the merged tree it refused, as turbo prefixes node's spec reporter: a test failed, listed twice. */
const FAILING = [
  '@x/add:test: ✔ add adds (1.2ms)',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
  '@x/add:test: ℹ fail 1',
  '@x/add:test: ✖ failing tests:',
  '@x/add:test: ✖ sub subtracts (2.1ms)',
].join('\n');

/**
 * That a verb's refusal is of `kind` (its `_tag`), exits 2, and names each of `fixes`: the command it says to type, the step, the word
 * a person acts on. For `assert.rejects`.
 */
const refusedAs =
  (kind: string, ...fixes: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, kind, err.message);
    assert.equal(err.exitCode, 2);
    for (const fix of fixes) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
    return true;
  };

/** That a verb's refusal exits 2 and names each of `fixes`, whatever its kind. For `assert.rejects`. */
const refusedNaming =
  (...fixes: string[]) =>
  (err: Error & { exitCode?: number }): true => {
    assert.equal(err.exitCode, 2, err.message);
    for (const fix of fixes) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
    return true;
  };

/** A step's record without the revisions every filing pins (`pinned`, `closeoutHash`), whose subject is `revisions.test.ts`. */
const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
  const { pinned: _, closeoutHash: __, ...rest } = record ?? { taskId: null };
  return rest;
};

/**
 * The helpers of the stories of a run's ending, told on `stage`, their store at `root`, every folder ending with the team's
 * `dev/ship.md`. Beside the folders and a person's hand on the checkout, the runs it brings to a point, each on the board's engine,
 * which every run of a story shares, and in a repository of its own unless it is given one:
 *
 * - `atTheGate`: `implement → ship` (or `dir`), implement done and committed on its branch: the run waiting at its ending's gate.
 * - `stagedAndSigned`: approved and filed, its shipper staged the merge in the checkout and signed off `done` with the message, and
 *   the pass after filed ship's check on that merge.
 * - `twoApproved`: two runs of one repository, each at its gate and approved, the SECOND's approval written older than the first's,
 *   since a rule about order that a fixture already has proves nothing.
 * - `workDone`: a run of `dir` whose implement signed off on its branch, and the pass after.
 * - `stoppedOnBase`: `implement ⇄ review → ship` (or `dir`), review done with `again: false`, ship approved at try 1, filed in the
 *   repository's own checkout, and signed off blocked: the work does not hold on main as it is now.
 * - `atTheCap`: that loop at `rounds: 1`, review done with `again: true`: out of rounds, so the ending never reaches its gate.
 * - `refusedOnBase`: work that merges cleanly onto main and whose landing check refused the merged tree, printing `FAILING`, its
 *   check settled `failed` with exit 1, or with none where it did not finish; the pass after aborts the merge.
 */
async function endings(stage: Stage, root: string) {
  const runner = await import('../src/runner.ts');
  const { advanceRun, approveRun, artifactFiles, artifactsDir, isRepositoryRun, startRun } = runner;
  const { readRun } = await import('../src/record/record.store.ts');
  const { runStore } = await import('../src/record/files.store.ts');
  const { headsNow, passStanding, standingLive } = await import('../src/standing/standing.verb.ts');
  fs.cpSync(path.join(TEAM, 'agents'), path.join(root, 'agents'), { recursive: true });
  fs.cpSync(path.join(TEAM, 'skills'), path.join(root, 'skills'), { recursive: true });
  const SHIP_MD = fs.readFileSync(path.join(TEAM_DEV, 'ship.md'), 'utf8');

  const world = (): World => stage.place().world;
  const run = (e: Engine, r: Run) => stage.runWith(e, advanceRun(r));

  const folderOf = (prefix: string, files: Record<string, string>): string => {
    const dir = fs.mkdtempSync(path.join(root, prefix));
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
    return dir;
  };
  const IMPLEMENT = '---\nplace: git\n---\nimplement it\n';
  const REVIEW_SCHEMA = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };

  const loopingFolder = (rounds = 3): string =>
    folderOf('wf-loop-', {
      'implement.md': IMPLEMENT,
      'review.md': `---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: ${rounds}\n---\nreview it\n`,
      'review.schema.json': JSON.stringify(REVIEW_SCHEMA, null, 2),
      'ship.md': SHIP_MD,
    });

  const at = {
    world,
    /** What `checkout` holds uncommitted, a path a line, and empty where it is clean. */
    uncommitted: (checkout: string): string => world().changes(checkout).join('\n'),
    /** `branch` merged into `repo`'s checkout and committed, as a person merges a result by hand. */
    mergedByHand: (repo: string, branch: string): void => {
      world().stage(repo, branch);
      world().commit(repo, `Merge branch '${branch}'`);
    },
    /** Whether a merge is staged in `repo`'s checkout and not committed. */
    mergeHead: (repo: string): boolean => world().staged(repo) !== null,
    /** A repository with one file committed on main. */
    aRepo: (): string => {
      const repo = fs.mkdtempSync(path.join(root, 'repo-'));
      world().repository(repo, { 'add.ts': 'export const add = (a, b) => a + b;\n' });
      return repo;
    },
    /** `implement → ship`, the team's `dev/ship.md` the ending, its `after:` the one key changed, since this folder has no review. */
    folder: (): string => {
      assert.match(SHIP_MD, /^after: review$/m);
      return folderOf('wf-', { 'implement.md': IMPLEMENT, 'ship.md': SHIP_MD.replace(/^after: review$/m, 'after: implement') });
    },
    loopingFolder,
    /** A folder whose ONE step merges: its ending is its root, the one way a run with nothing filed can want the checkout. */
    mergeOnly: (): string => folderOf('wf-merge-', { 'ship.md': SHIP_MD.replace(/^after: review\n/m, '') }),
    /** A folder of one step, for a run started `--after` another. */
    oneStep: (): string => folderOf('wf-one-', { 'implement.md': IMPLEMENT }),
    /** `implement → review (loop) → ship`, quick's shape: the ship's `gate: true` deleted, so the review's pass files the landing. */
    ungatedFolder: (): string => {
      const dir = loopingFolder();
      const file = path.join(dir, 'ship.md');
      const text = fs.readFileSync(file, 'utf8');
      assert.match(text, /^gate: true$/m);
      fs.writeFileSync(file, text.replace(/^gate: true\n/m, ''));
      return dir;
    },
    /** What implement does in its worktree, by default: add.ts gains `sub`. */
    addSub: (workspace: string) => fs.appendFileSync(path.join(workspace, 'add.ts'), 'export const sub = (a, b) => a - b;\n'),
    /** main moves under the run: a commit on the base branch giving add.ts a `sub` of its own, which the branch's conflicts with. */
    mainMoves: (repo: string): string => {
      fs.appendFileSync(path.join(repo, 'add.ts'), 'export const sub = (a, b) => b - a;\n');
      world().commit(repo, "main's sub");
      return world().head(repo);
    },
    /** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
    aPass: (e: Engine) => stage.runWith(e, passStanding(runStore.runs.list())),
    /** Whether `branch` of `r` is landed, its standing asked now, as a person's verb asks it (`standingLive`). */
    isLanded: async (r: RepositoryRun, branch: string) => (await stage.runPlaced(standingLive([r]))).landed(r, branch),
    /** Every branch of a run's repository and its commit, asked of this test's place now (`headsNow`). */
    liveHeads: (r: RepositoryRun) => headsNow(r, stage.place().place),
    /** A run this file started on a repository: a repository run. */
    repositoryRun: (r: Run): RepositoryRun => {
      assert.ok(isRepositoryRun(r), `${r.id} works on a repository`);
      return r;
    },
    /** What `nemia <argv>` prints, line by line, over the board's engine. */
    printedBy: async (t: TestContext, argv: string[]): Promise<string[]> => {
      const printed: string[] = [];
      const log = t.mock.method(console, 'log', (...args: unknown[]) => {
        printed.push(args.map(String).join(' '));
      });
      try {
        await stage.main(argv);
      } finally {
        log.mock.restore();
      }
      return printed;
    },
    /**
     * What the ship's check leaves in its files directory when its e2e runs on the merged tree: `count` pictures of `bytes` each, the
     * first `-failed`, and the bytes in the directory before.
     */
    photographed: (id: string, { count = 252, bytes = 194_000 } = {}) => {
      const dir = artifactsDir({ id }, 'ship');
      fs.mkdirSync(dir, { recursive: true });
      const pictures = Array.from({ length: count }, (_, i) => `page-${String(i).padStart(3, '0')}-${i % 2 ? 'dark' : 'light'}.png`);
      pictures[0] = 'answer-light-failed.png';
      for (const name of pictures) fs.writeFileSync(path.join(dir, name), Buffer.alloc(bytes, 1));
      return { dir, pictures, before: artifactFiles({ id }, 'ship').reduce((sum, f) => sum + f.bytes, 0) };
    },
    /** The pictures in `dir`, sorted, and none where it is gone. */
    pngsIn: (dir: string): string[] =>
      fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.png'))
            .sort()
        : [],
    /** Rewrite the record of run `id` through `edit`, as a record a nemia before this one wrote, or an odd one, reads. */
    rewritten: async (id: string, edit: (record: Record<string, unknown>) => void): Promise<void> => {
      const { runFile } = await import('../src/record/record.store.ts');
      const record = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Record<string, unknown>;
      edit(record);
      fs.writeFileSync(runFile(id), JSON.stringify(record, null, 2));
    },
    /** The asks written for run `id`, in its `.asks` directory. */
    asksOf: (id: string): string[] => {
      const dir = path.join(root, 'runs', `${id}.asks`);
      return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
    },
    /** A pass of the run `id` over the board's engine, read from disk now. */
    pass: (id: string, e: Engine = stage.board().e) => run(e, readRun(id)),
  };

  async function atTheGate(given: { repo?: string; dir?: string } = {}) {
    const b = stage.board();
    const repo = given.repo ?? at.aRepo();
    const started = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: given.dir ?? at.folder() }));
    await run(b.e, readRun(started.id));
    const work = readRun(started.id).steps.implement;
    at.addSub(work.workspace!);
    world().commit(work.workspace!, 'add sub');
    b.settle(`${started.id}-implement`, 'succeeded', SIGNED);
    const pass = await run(b.e, readRun(started.id));
    return { repo, id: started.id, branch: work.branch!, pass, base: world().head(repo) };
  }

  async function stagedAndSigned(given: { repo?: string } = {}) {
    const b = stage.board();
    const gate = await atTheGate(given);
    await stage.runWith(b.e, approveRun(gate.id, 'ship', 'Merge it.'));
    assert.deepEqual((await at.pass(gate.id)).filed, ['ship']);
    world().stage(gate.repo, gate.branch);
    b.settle(`${gate.id}-ship`, 'succeeded', { ...SIGNED, artifacts: [], message: MESSAGE });
    const signed = await at.pass(gate.id);
    return { ...gate, signed, checkId: `${gate.id}-ship-check` };
  }

  async function twoApproved() {
    const b = stage.board();
    const repo = at.aRepo();
    const first = await atTheGate({ repo });
    const second = await atTheGate({ repo });
    await stage.runWith(b.e, approveRun(first.id, 'ship'));
    const { file } = await stage.runWith(b.e, approveRun(second.id, 'ship'));
    fs.writeFileSync(file, JSON.stringify({ at: '2026-09-17T08:00:00.000Z' }));
    return { repo, first, second };
  }

  async function workDone(dir: string, repo = at.aRepo()) {
    const b = stage.board();
    const started = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir }));
    await run(b.e, readRun(started.id));
    const work = readRun(started.id).steps.implement;
    at.addSub(work.workspace!);
    world().commit(work.workspace!, 'add sub');
    b.settle(`${started.id}-implement`, 'succeeded', SIGNED);
    await run(b.e, readRun(started.id));
    return { repo, id: started.id, branch: work.branch! };
  }

  async function stoppedOnBase(dir = loopingFolder()) {
    const b = stage.board();
    const done = await workDone(dir);
    if (readRun(done.id).steps.review) {
      b.settle(`${done.id}-review`, 'succeeded', { ...SIGNED, again: false });
      await at.pass(done.id);
    }
    await stage.runWith(b.e, approveRun(done.id, 'ship', 'Merge it.'));
    assert.deepEqual((await at.pass(done.id)).filed, ['ship']);
    b.settle(`${done.id}-ship`, 'succeeded', STOPPED);
    await at.pass(done.id);
    return { ...done, base: world().head(done.repo) };
  }

  async function atTheCap() {
    const b = stage.board();
    const done = await workDone(loopingFolder(1));
    b.settle(`${done.id}-review`, 'succeeded', { ...SIGNED, again: true });
    assert.deepEqual((await at.pass(done.id)).filed, [], 'out of rounds, nothing after the loop is filed');
    return { ...done, base: world().head(done.repo) };
  }

  async function refusedOnBase(finished = true) {
    const b = stage.board();
    const done = await workDone(loopingFolder());
    b.settle(`${done.id}-review`, 'succeeded', { ...SIGNED, again: false });
    await at.pass(done.id);
    await stage.runWith(b.e, approveRun(done.id, 'ship', 'Merge it.'));
    assert.deepEqual((await at.pass(done.id)).filed, ['ship']);
    world().stage(done.repo, done.branch);
    b.settle(`${done.id}-ship`, 'succeeded', { ...SIGNED, message: MESSAGE });
    assert.deepEqual((await at.pass(done.id)).checked, ['ship']);
    const checkId = `${done.id}-ship-check`;
    b.settle(checkId, 'failed', undefined, finished ? 1 : undefined);
    b.tasks.get(checkId)!.printed = { stdout: FAILING };
    await at.pass(done.id);
    assert.equal(at.mergeHead(done.repo), false, 'the run aborted the merge its check refused');
    return { ...done, checkId, base: world().head(done.repo) };
  }

  return { ...at, atTheGate, stagedAndSigned, twoApproved, workDone, stoppedOnBase, atTheCap, refusedOnBase };
}

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  acceptRun,
  advanceRun,
  approveRun,
  artifactsDir,
  cancelRun,
  decideRun,
  forgetRun,
  list,
  mergeRun,
  retryRun,
  roundRun,
  startRun,
  toDecideWords,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { main: cli } = await import('../src/cli/main.ts');
/** Imported once the environment is set: the stage's engine client loads a module that pins the store's root as it loads. */
const { staged, story } = await import('./story.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stage = staged({ runWith: runEngine, main: cli, engineOf });
const at = await endings(stage, ROOT);
const { readRun, stepsOf } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { resumePause, putPause } = await import('../src/pause/pause.store.ts');
type Place = import('../src/place/place.store.ts').Place;
type PlaceAnswers = import('../src/place/place.ts').PlaceAnswers;
type PlaceRequests = import('../src/place/place.ts').PlaceRequests;
type PlaceOutcome<V extends import('../src/place/place.ts').PlaceVerb> = import('../src/place/place.ts').PlaceOutcome<V>;
const { PlaceService } = await import('../src/place/place.store.ts');
const { stagedHere, statusMemo, mergeStaged } = await import('../src/place/landing.store.ts');
const { landEnding, checkoutHold } = await import('../src/ending/ending.verb.ts');
const { heldRead } = await import('../src/list/list.verb.ts');
const { merging } = await import('../src/prune/prune.verb.ts');
const { taskPhasesRead, closeoutReader, closeoutAsked, spendReader, exitVerdicts } = await import('../src/views/views.verb.ts');
const { NOTHING_READ, standingNow, standingReader } = await import('../src/standing/standing.verb.ts');
const { roundOf } = await import('../src/run.ts');

const world = () => stage.place().world;
/** A screen with each time of day the engine's stand-in stamped put back as `<t>`: it files and settles on the wall clock. */
const timeless = (lines: string[]): string[] => lines.map((l) => l.replace(/\b\d\d:\d\d:\d\dZ\b/g, '<t>'));
const listed = (id: string) => stage.runWith(stage.board().e, list(stage.board().e, readRun(id)));
const shipOf = async (id: string) => (await listed(id)).steps.find((s) => s.name === 'ship')!;
const e = () => stage.board().e;
/** What a person reads of the ending held behind `holder`'s, in `nemia decide`. */
const waitLine = (holder: string) =>
  `  ship: waiting on the checkout (${holder}'s ship has it) — it works in the repository's own checkout, ` +
  `and two endings never do at once; the next tick files ship once ${holder}'s ship has settled`;
const statusOf = async (id: string, step: string) => (await listed(id)).steps.find((s) => s.name === step)!.status;
const asks = (id: string) => at.asksOf(id).filter((f) => f.startsWith('merge-'));
/** A refusal of `nemia refresh --base`: exit 2, naming `facts`, and no merge asked. For `assert.rejects`. */
const mergeRefused =
  (id: string, ...facts: string[]) =>
  (err: Error & { exitCode?: number }): true => {
    refusedNaming(...facts)(err);
    assert.deepEqual(asks(id), [], 'no merge is asked');
    return true;
  };

test("a run waits at its ending's gate, is approved, stages its merge, lands it on its check, and a run `--after` it is handed its work", async (t) => {
  const s = story(t);
  const { e, tasks, filings, settle } = stage.board();
  const repo = at.aRepo();
  let id = '';
  let branch = '';
  let base = '';

  await s.test('`nemia start` on a folder with an ending says so: nothing of that step runs until a person approves it', async (st) => {
    const printed = await at.printedBy(st, ['start', 'add sub', '--repo', repo, '--workflows', at.folder()]);
    id = printed[0].split(' ')[0];
    assert.equal(printed[0], `${id}  2 step(s): implement → ship (shipper)`, "the team's ship.md names its agent");
    assert.ok(
      printed.includes(`ends at: ship — nothing of it runs until nemia approve ${id} ship, which is what files it`),
      printed.join('\n'),
    );
    assert.ok(!printed.some((l) => l.startsWith('gated at:')), 'an ending is not a handoff waiting to be let through');
  });

  await s.test(
    'a run stops at its ending step: nothing of it is filed, the checkout is untouched, and `nemia ls` says what is to be decided',
    async () => {
      await at.pass(id);
      const work = readRun(id).steps.implement;
      branch = work.branch!;
      at.addSub(work.workspace!);
      world().commit(work.workspace!, 'add sub');
      settle(`${id}-implement`, 'succeeded', SIGNED);
      const pass = await at.pass(id);
      base = world().head(repo);
      assert.deepEqual([pass.filed, pass.status], [[], 'awaiting approval'], 'the ending is not filed, and the run waits on a person');
      assert.deepEqual(filings, [`${id}-implement`]);
      assert.equal(readRun(id).steps.ship.taskId, null);
      assert.equal(at.uncommitted(repo), '', 'the checkout is clean');
      const l = await listed(id);
      assert.equal(l.steps.find((x) => x.name === 'ship')?.status, 'awaiting approval');
      assert.deepEqual(l.toDecide, {
        kind: 'approve',
        step: 'ship',
        says: "Stage the merge of this run's result onto the base branch, and sign off with the message to commit it with.",
        filed: false,
      });
      assert.doesNotMatch(toDecideWords(readRun(id), l.toDecide), /You are/, "the gate says ship.md's note, not its agent's instructions");
      const again = await at.pass(id);
      assert.deepEqual([again.filed, again.checked, again.tried], [[], [], []], 'pass after pass, nothing is spent while the gate holds');
      assert.equal(await at.isLanded(at.repositoryRun(readRun(id)), branch), false);
    },
  );

  await s.test(
    "approved, the ending is filed in the checkout with a read of its run's artifacts through the rule it is filed with, and no `settings.local.json`; a step in a worktree is filed with no such rule",
    async () => {
      const notes = path.join(artifactsDir({ id }, 'implement'), 'notes.md');
      fs.mkdirSync(path.dirname(notes), { recursive: true });
      fs.writeFileSync(notes, 'what the implement step left for the ending\n');
      await stage.runWith(e, approveRun(id, 'ship', 'Merge it.'));
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      const runArtifacts = path.join(ROOT, 'runs', id, 'artifacts');
      const rule = `Read(/${runArtifacts}/**)`;
      const allows = (task: string) => (tasks.get(task)!.spec.config as { allowedTools?: string[] }).allowedTools ?? [];
      assert.ok(allows(`${id}-ship`).includes(rule), `the ending reads its own run's artifacts: ${allows(`${id}-ship`).join(', ')}`);
      assert.match(rule, /^Read\(\/\/.+\)$/, "an absolute path, in the rule's `//` form");
      assert.ok(path.relative(runArtifacts, notes).split(path.sep)[0] !== '..', 'and the file the implement step left lies under it');
      assert.equal(fs.existsSync(path.join(repo, '.claude', 'settings.local.json')), false, 'with no local settings in the checkout');
      assert.ok(!allows(`${id}-implement`).some((r) => /^Read\(.*\)$/.test(r)), 'a step in a worktree is filed with its own rules only');
      assert.deepEqual(
        (tasks.get(`${id}-ship`)!.spec.config as { mounts?: unknown }).mounts,
        [{ path: artifactsDir({ id }, 'implement'), readOnly: true }],
        'and the ending is filed the folder of the step it comes after, read-only, and not its own',
      );
    },
  );

  await s.test("its merge staged and signed off, the pass files ship's check on the merged tree", async () => {
    world().stage(repo, branch);
    settle(`${id}-ship`, 'succeeded', { ...SIGNED, artifacts: [], message: MESSAGE });
    assert.deepEqual((await at.pass(id)).checked, ['ship']);
  });

  await s.test(
    "its check passes and the merge lands: only the check's pictures are removed — a picture the closeout names, a file that is no picture, one in a folder and a link are kept, and nothing is removed through a link",
    async () => {
      const outside = path.join(fs.mkdtempSync(path.join(ROOT, 'outside-')), 'kept.png');
      fs.writeFileSync(outside, "not the run's");
      const dir = artifactsDir({ id }, 'ship');
      fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
      for (const name of ['named.png', 'also-named.png', 'page-light.png', 'trace.txt', 'shots/deep.png'])
        fs.writeFileSync(path.join(dir, name), name);
      fs.symlinkSync(outside, path.join(dir, 'link.png'));
      const account = 'SHIP-ACCOUNT: merged it onto main, the check passed';
      settle(`${id}-ship`, 'succeeded', {
        ...SIGNED,
        summary: account,
        artifacts: [path.join(dir, 'named.png'), 'also-named.png'],
        message: MESSAGE,
      });
      settle(`${id}-ship-check`, 'succeeded', undefined, 0);
      await at.pass(id);
      assert.ok('commit' in readRun(id).steps.ship.landed!, 'it landed');
      assert.notEqual(world().head(repo), base);
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
      assert.equal((await stage.runWith(e, decideRun(id))).decision.kind, 'landed');
    },
  );

  await s.test(
    "a run --after it is handed what its work said, not what its ending said: the ending's account is of the merge, and it declares nothing",
    async () => {
      const child = await stage.runPlaced(startRun({ brief: 'read the flag', repo, workflowDir: at.oneStep(), after: [id] }));
      assert.deepEqual((await at.pass(child.id)).filed, ['implement'], 'the parent landed, so the child is filed');
      const brief = tasks.get(`${child.id}-implement`)!.spec.brief;
      assert.match(brief, new RegExp(`## From run ${id}\\n`));
      assert.match(brief, /What implement said when it signed off, its `summary`:\n\n```text\ndid the work\n```/);
      assert.doesNotMatch(brief, /SHIP-ACCOUNT/, "the ending's account is of the merge, and says nothing of the work");
      assert.doesNotMatch(brief, /What ship said when it signed off/);
    },
  );
});

test('a landing a pass reads again — after a restart, under a pause, or with a hand on the checkout — does what the last pass would have', async (t) => {
  const s = story(t);
  const { settle } = stage.board();

  await s.test(
    'a merge committed before the run wrote it down is recorded as landed, never committed twice, and the pictures the pass that died left go',
    async () => {
      const { repo, id, checkId } = await at.stagedAndSigned();
      settle(checkId, 'succeeded', undefined, 0);
      world().commit(repo, 'the commit the pass made before it died');
      const head = world().head(repo);
      const shot = at.photographed(id, { count: 3, bytes: 10 });
      fs.writeFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'the note of the pass that died\n');
      await at.pass(id);
      assert.deepEqual(readRun(id).steps.ship.landed, { commit: head }, "the next pass reads the result on the checkout's HEAD");
      assert.deepEqual(at.pngsIn(shot.dir), [], 'the pass that died had removed some of the pictures, and the rest go');
      assert.equal(
        fs.readFileSync(path.join(shot.dir, 'e2e-pictures.txt'), 'utf8'),
        'the note of the pass that died\n',
        'its note is left',
      );
      assert.equal(world().head(repo), head, 'nothing committed again');
      assert.equal((await stage.runWith(stage.board().e, decideRun(id))).decision.kind, 'landed');
    },
  );

  await s.test('a refused merge aborted by hand is recorded as nothing landed, and every picture is kept', async () => {
    const { repo, id, base, checkId } = await at.stagedAndSigned();
    const shot = at.photographed(id, { count: 3, bytes: 10 });
    settle(checkId, 'failed', undefined, 1);
    world().takeBack(repo);
    await at.pass(id);
    assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'its check refused the merge (exit 1)' }, 'nothing is aborted again');
    assert.deepEqual(at.pngsIn(shot.dir), [...shot.pictures].sort(), 'nothing landed: every picture is kept');
    assert.equal(world().head(repo), base);
  });

  await s.test('a check that passed on a merge no longer staged commits nothing: the run does not merge again on its own', async () => {
    const { repo, id, base, checkId } = await at.stagedAndSigned();
    settle(checkId, 'succeeded', undefined, 0);
    world().takeBack(repo);
    await at.pass(id);
    assert.deepEqual(readRun(id).steps.ship.landed, {
      aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed',
    });
    assert.equal(world().head(repo), base);
  });

  await s.test(
    "REFUSED at shipped defaults: a merge in the checkout that is not the run's is never touched — committed nor aborted — with nothing of the ending running",
    async () => {
      const { repo, id, base, checkId } = await at.stagedAndSigned();
      settle(checkId, 'succeeded', undefined, 0);
      world().takeBack(repo);
      const theirs = world().branch(repo, 'theirs', { 'mul.ts': 'export const mul = (a, b) => a * b;\n' });
      world().stage(repo, 'theirs');
      for (let pass = 0; pass < 2; pass++) {
        await at.pass(id);
        assert.equal(world().staged(repo), theirs, "a person's own merge is still staged");
        assert.equal(world().head(repo), base);
        assert.equal(readRun(id).steps.ship.landed, undefined, 'and the run has written nothing of its own merge yet');
      }
      world().takeBack(repo);
      await at.pass(id);
      assert.match(
        String((readRun(id).steps.ship.landed as { aborted?: string }).aborted),
        /no longer staged/,
        "the run's merge is read as gone",
      );
      assert.equal(world().head(repo), base, 'and nothing of it is committed');
    },
  );

  await s.test(
    'while the store is paused, a landing whose check has ended commits on its exit 0, and one its check refused is aborted, as without it',
    async () => {
      for (const [exit, phase] of [
        [0, 'succeeded'],
        [1, 'failed'],
      ] as const) {
        const { repo, id, base, checkId } = await at.stagedAndSigned();
        putPause({ why: 'merging by hand', by: 'ann' });
        try {
          settle(checkId, phase, undefined, exit);
          const paused = runStore.runs.read(id);
          assert.ok(paused.pause, 'the run is read with the pause, as every pass reads it');
          assert.deepEqual((await stage.runWith(stage.board().e, advanceRun(paused))).filed, [], `exit ${exit}`);
          assert.equal(at.mergeHead(repo), false, `exit ${exit}: the merge is not left staged in the checkout`);
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
    },
  );
});

test('a record an older nemia wrote — no staged-merge file, a place skill named — lands, is removed and is aborted as any other', async (t) => {
  const s = story(t);
  const { settle } = stage.board();

  await s.test(
    'a run started before its place named a staged-merge file reads its checkout through `status`, and lands as any other',
    async () => {
      const { repo, id, checkId, base } = await at.stagedAndSigned();
      await at.rewritten(id, (record) => delete record.stagedFile);
      assert.equal(stagedHere(at.repositoryRun(readRun(id))), undefined, 'a record with no marker');
      const memo = () => statusMemo(at.liveHeads, stage.place().place);
      assert.equal(mergeStaged(readRun(id), stepsOf(readRun(id)), memo()), true, 'its merge read staged by the place');
      settle(checkId, 'succeeded', undefined, 0);
      await at.pass(id);
      const head = world().head(repo);
      assert.notEqual(head, base);
      assert.deepEqual(readRun(id).steps.ship.landed, { commit: head });
      assert.equal(at.uncommitted(repo), '');
      assert.equal(mergeStaged(readRun(id), stepsOf(readRun(id)), memo()), false, 'landed, nothing is read staged');
    },
  );

  await s.test(
    'a record that names a place skill, written when a run named one, lands through the place the pass is given, as any other',
    async () => {
      const named = await at.stagedAndSigned();
      await at.rewritten(named.id, (record) => {
        record.placeSkill = { skill: 'svn', version: '1' };
        delete record.stagedFile;
      });
      assert.deepEqual(readRun(named.id).placeSkill, { skill: 'svn', version: '1' }, 'the record still reads, its name kept');
      assert.equal(merging(readRun(named.id), stepsOf(readRun(named.id)), statusMemo(at.liveHeads, stage.place().place)), 'ours');
      settle(named.checkId, 'succeeded', undefined, 0);
      await at.pass(named.id);
      const landed = readRun(named.id).steps.ship.landed;
      assert.ok(landed && 'commit' in landed, JSON.stringify(landed));
      assert.equal(at.mergeHead(named.repo), false);
    },
  );

  await s.test(
    'a landed run started before its place named a staged-merge file is removed with no `status`, its checkout gone',
    async () => {
      const done = await at.stagedAndSigned();
      settle(done.checkId, 'succeeded', undefined, 0);
      await at.pass(done.id);
      await at.rewritten(done.id, (record) => {
        delete record.stagedFile;
      });
      fs.rmSync(done.repo, { recursive: true, force: true });
      const r = readRun(done.id);
      assert.ok(r.steps.ship.landed && 'commit' in r.steps.ship.landed);
      assert.equal(
        merging(r, stepsOf(r), statusMemo(at.liveHeads, stage.place().place)),
        'none',
        'a landing made owes no read of a checkout gone',
      );
    },
  );

  await s.test(
    'a run started before its place named a staged-merge file, its ending signed off blocked with its merge staged, has the merge aborted',
    async () => {
      const { repo, id, base } = await at.atTheGate();
      await stage.runWith(stage.board().e, approveRun(id, 'ship'));
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      world().stage(repo, readRun(id).steps.implement.branch!);
      await at.rewritten(id, (record) => {
        delete record.stagedFile;
      });
      assert.equal(stagedHere(at.repositoryRun(readRun(id))), undefined, 'a record with no marker');
      settle(`${id}-ship`, 'succeeded', BLOCKED);
      await at.pass(id);
      assert.equal(at.mergeHead(repo), false, 'the merge taken back');
      assert.equal(world().head(repo), base);
      assert.equal(at.uncommitted(repo), '');
      assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'ship ended blocked with its merge staged' });
    },
  );
});

/** This test's place, its `status` answered by `status`. */
const statusPlace = (status: (request: PlaceRequests['status']) => PlaceOutcome<'status'>): Place =>
  placeOver(stage.place().place, { status });

/** A place whose `status` gives every request `reply`. */
const answeringPlace = (reply: PlaceAnswers['status']): Place => statusPlace(() => ({ answer: reply }));

/** A place whose `status` reads no checkout: it is not heard, in its words. */
const failingPlace = (): Place => statusPlace(() => unreadBy('status', 'this place cannot read the checkout'));

/** What `landEnding` does with the run `id` as the board reads it now, through the place `place`. */
async function landedThrough(e: Engine, id: string, place: Place) {
  const r = readRun(id);
  const { views, phaseOf } = await stage.runWith(e, taskPhasesRead(r));
  const memo = statusMemo(at.liveHeads, place);
  return landEnding(
    r,
    stepsOf(r),
    phaseOf,
    closeoutReader(views, r),
    closeoutAsked(views),
    spendReader(views),
    exitVerdicts(views, r),
    memo,
  );
}

/** Which run holds the checkout the run `id` would file its ending into, its checkout read through `memo`. */
const holdOf = (e: Engine, id: string, memo: ReturnType<typeof statusMemo>) => {
  const r = readRun(id);
  const standing = standingNow(runStore.runs.list()).pipe(Effect.provide(stage.place().layer));
  return stage.runWith(e, checkoutHold(e, r, stepsOf(r), { standing }, process.env, memo));
};

/** Two runs of one repository, one whose ending is filed and has staged its merge, the other approved behind it. */
async function stagingAndWaiting() {
  const { e } = stage.board();
  const repo = at.aRepo();
  const waiting = await at.atTheGate({ repo });
  const staging = await at.atTheGate({ repo });
  await stage.runWith(e, approveRun(staging.id, 'ship'));
  assert.deepEqual((await at.pass(staging.id)).filed, ['ship']);
  world().stage(repo, staging.branch);
  await stage.runWith(e, approveRun(waiting.id, 'ship'));
  return { repo, waiting, staging };
}

test("a place that gives no reading of the checkout, or reads its merge as another's, is never a verdict, and is asked only where a landing needs it", async (t) => {
  const s = story(t);
  const { e, settle } = stage.board();

  await s.test(
    'REFUSED: a checkout its place gives no reading of is never a verdict — a check passed or refused, nothing is committed or aborted, the record stays unlanded, and the run says why',
    async () => {
      const place = failingPlace();
      for (const [phase, exitCode] of [
        ['succeeded', 0],
        ['failed', 1],
      ] as const) {
        const { repo, id, checkId, base } = await at.stagedAndSigned();
        settle(checkId, phase, undefined, exitCode);
        const out = await landedThrough(e, id, place);
        assert.equal(out.landed, false, `${phase}: nothing written`);
        assert.equal(out.notes.length, 1, out.notes.join('\n'));
        assert.match(out.notes[0], /^ship: the run read no state of its checkout, so it neither commits nor aborts its merge \(/);
        assert.match(out.notes[0], /this place cannot read the checkout\): the next tick tries again$/, out.notes[0]);
        assert.equal(at.mergeHead(repo), true, `${phase}: the merge stays staged`);
        assert.equal(world().head(repo), base);
        assert.equal(readRun(id).steps.ship.landed, undefined, `${phase}: the record unlanded`);
      }
      const { repo, id, checkId, base } = await at.stagedAndSigned();
      settle(checkId, 'succeeded', undefined, 0);
      assert.equal((await landedThrough(e, id, stage.place().place)).landed, true, "the same pass through the package's place lands");
      assert.notEqual(world().head(repo), base);
    },
  );

  await s.test(
    "REFUSED: a merge its place reads as another's (`merging: 'other'`) is left alone, its check passed or refused",
    async () => {
      for (const [phase, exitCode] of [
        ['succeeded', 0],
        ['failed', 1],
      ] as const) {
        const { repo, id, checkId, base } = await at.stagedAndSigned();
        settle(checkId, phase, undefined, exitCode);
        const place = answeringPlace({ merging: 'other', conflicted: false, missing: [], tip: base });
        assert.deepEqual(await landedThrough(e, id, place), { notes: [], landed: false }, phase);
        assert.equal(at.mergeHead(repo), true, `${phase}: neither committed nor aborted`);
        assert.equal(world().head(repo), base);
      }
    },
  );

  await s.test(
    "the place's `status` is asked only where a landing needs it: never of a landed run or a busy ending, once per checkout and run in a pass",
    async () => {
      let asked = 0;
      const counted = statusPlace((request) => {
        asked += 1;
        return stage.place().place.askNow('status', request);
      });
      const done = await at.stagedAndSigned();
      settle(done.checkId, 'succeeded', undefined, 0);
      await at.pass(done.id);
      const landed = readRun(done.id);
      assert.ok(landed.steps.ship.landed);
      const { stagedFile: _, ...unmarked } = at.repositoryRun(landed);
      const runs = Array.from({ length: 10 }, (_, i) => ({ ...(i % 2 ? landed : unmarked), id: `${landed.id}-${i}` }));
      const read = heldRead(e, runs, standingReader(NOTHING_READ)).pipe(Effect.provide(PlaceService.layer(counted)));
      assert.deepEqual(await stage.runWith(e, read), { staged: [], held: [] });
      assert.equal(asked, 0, 'a pause read over 10 landed runs, with the marker and without, asks nothing');

      const { repo, waiting, staging } = await stagingAndWaiting();
      for (const phase of ['pending', 'working'] as const) {
        settle(`${staging.id}-ship`, phase);
        const hold = await holdOf(e, waiting.id, statusMemo(at.liveHeads, counted));
        assert.deepEqual(hold, { run: staging.id, step: 'ship' }, `${phase}: held by the ending in it`);
        assert.deepEqual(await landedThrough(e, staging.id, counted), { notes: [], landed: false });
        assert.equal(asked, 0, `${phase}: a busy ending asks nothing`);
      }
      settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
      const memo = statusMemo(at.liveHeads, counted);
      for (let i = 0; i < 2; i++)
        assert.deepEqual(await holdOf(e, waiting.id, memo), { run: staging.id, step: 'ship' }, 'held by the merge staged and not landed');
      assert.equal(asked, 1, 'two runs on one checkout, asked twice in a pass, read it once');
      assert.equal(stagedHere(at.repositoryRun(readRun(staging.id))), true);
      assert.equal(at.mergeHead(repo), true);
    },
  );

  await s.test(
    "an ending settled with no merge staged holds nothing, and the place's `status` is not asked: its staged-merge file says none is in progress",
    async () => {
      let asked = 0;
      const counted = statusPlace((request) => {
        asked += 1;
        return stage.place().place.askNow('status', request);
      });
      const { repo, waiting, staging } = await stagingAndWaiting();
      world().takeBack(repo);
      settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
      assert.equal(stagedHere(at.repositoryRun(readRun(staging.id))), false, 'the merge taken back by hand');
      const hold = await holdOf(e, waiting.id, statusMemo(at.liveHeads, counted));
      assert.equal(hold, undefined, 'its session settled and nothing staged: the checkout is free for the run approved behind it');
      assert.equal(asked, 0, 'read off the file, with no process');
    },
  );

  await s.test(
    'REFUSED: a staged merge its place gives no reading of holds the checkout — another run approved on the same repository waits for it',
    async () => {
      const { repo, waiting, staging } = await stagingAndWaiting();
      settle(`${staging.id}-ship`, 'succeeded', BLOCKED);
      const held = await holdOf(e, waiting.id, statusMemo(at.liveHeads, failingPlace()));
      assert.deepEqual(held, { run: staging.id, step: 'ship' }, 'held by the run whose merge nobody can read');
      assert.equal(at.mergeHead(repo), true);
    },
  );
});

/** An ending that signed off blocked on a clean checkout, read by a pass; then a merge of its branch staged by hand in that checkout. */
const blockedClean = async () => {
  const gate = await at.atTheGate();
  await stage.runWith(stage.board().e, approveRun(gate.id, 'ship'));
  await at.pass(gate.id);
  stage.board().settle(`${gate.id}-ship`, 'succeeded', BLOCKED);
  const pass = await at.pass(gate.id);
  world().stage(gate.repo, gate.branch);
  return { ...gate, pass };
};

/**
 * The screen of an ending whose check on the staged merge settled with `exitCode`, its approval at `08:00Z`, two pictures in its
 * files: a check that exited printed nothing on its stdout, and one that did not finish kept no stream, so its log is read.
 */
const checkedScreen = async (st: import('node:test').TestContext, exitCode: number | undefined): Promise<string[]> => {
  const { repo, id, checkId } = await at.stagedAndSigned();
  const approval = path.join(ROOT, 'runs', `${id}.asks`, 'approve-ship-1');
  fs.writeFileSync(approval, JSON.stringify({ ...JSON.parse(fs.readFileSync(approval, 'utf8')), at: '2026-09-17T08:00:00.000Z' }));
  at.photographed(id, { count: 2, bytes: 10 });
  stage.board().settle(checkId, 'failed', undefined, exitCode);
  if (exitCode !== undefined) stage.board().tasks.get(checkId)!.printed = { stdout: '' };
  await at.pass(id);
  const base = world().head(repo).slice(0, 7);
  return timeless(
    await decideScreen(st, stage.board().e, [id], { '<id>': id, '<repo>': repo, '<root>': ROOT, '<base>': base }, stage.place().place),
  );
};

/** The part of the screens of a check on the merge below its verdict, the same for one that did not finish and one that refused. */
const shipBelow = [
  '    used  not measured',
  '    cost  not measured',
  '    timeline  try 1        filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
  '              try 1 check  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s',
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
  '  timeline  run  queued 0s  ran 0s  wall 0s',
  '',
  '  wf/<id>/run  — 1 file: +1 −0',
  '',
  '  branch    wf/<id>/run is ahead of main by 1 commit',
  '  merges    wf/<id>/run merges cleanly onto main',
  '  others    no other run is in flight on main',
];
const workAbove = (head: string, once: string) => [
  '<id>  add sub',
  '',
  head,
  '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
  '',
  '  once more, on the next tick:',
  once,
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
  '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
  '    did the work',
  '',
  '  ship',
  '    gate  approved 08:00Z — "Merge it."',
];

test('an ending that stops on its own word, or whose check refuses the merged tree, leaves the checkout as it found it and says what happened', async (t) => {
  const s = story(t);
  const { e, settle } = stage.board();

  await s.test(
    "a check that refuses leaves the checkout clean: the abort the ending's prose names takes the trial merge back, and the run says what happened",
    async (st) => {
      const { repo, id, branch, base } = await at.atTheGate();
      await stage.runWith(e, approveRun(id, 'ship'));
      await at.pass(id);
      world().stage(repo, branch);
      assert.notEqual(at.uncommitted(repo), '', 'the trial merge is staged and uncommitted, then aborted, as the prose says');
      world().takeBack(repo);
      assert.equal(at.uncommitted(repo), '', 'the checkout is as it was');
      assert.equal(world().head(repo), base, 'and the base branch has not moved');
      settle(`${id}-ship`, 'succeeded', BLOCKED);
      await at.pass(id);
      assert.equal(at.uncommitted(repo), '', 'nor does the run commit what a step left in that checkout');
      assert.equal(await at.isLanded(at.repositoryRun(readRun(id)), branch), false);
      const { decision } = await stage.runWith(e, decideRun(id));
      assert.equal(decision.kind, 'awaiting');
      if (decision.kind !== 'awaiting') return;
      assert.deepEqual([decision.outcome, decision.awaitingAnswer, decision.branches], ['waiting', ['ship'], [branch]]);
      const printed = await at.printedBy(st, ['decide', id]);
      assert.ok(
        printed.some((l) => l.startsWith(`  branch    ${branch}`)),
        printed.join('\n'),
      );
      assert.ok(
        !printed.some((l) => /^ {2}(merges|others) {4}/.test(l)),
        `an ending that ended blocked waits at no gate and had no landing refused: nothing reads what it merges onto\n${printed.join('\n')}`,
      );
    },
  );

  await s.test(
    'REFUSED at shipped defaults: an ending that stopped on its own word is written down once — its merge left staged is taken back',
    async () => {
      const { repo, id, branch, base } = await at.atTheGate();
      await stage.runWith(e, approveRun(id, 'ship'));
      await at.pass(id);
      world().stage(repo, branch);
      settle(`${id}-ship`, 'succeeded', BLOCKED);
      const pass = await at.pass(id);
      assert.equal(at.mergeHead(repo), false, 'blocked with its merge left staged: the pass takes it back');
      assert.equal(at.uncommitted(repo), '');
      assert.equal(world().head(repo), base);
      assert.deepEqual(readRun(id).steps.ship.landed, { aborted: 'ship ended blocked with its merge staged' });
      assert.ok(
        pass.notes.includes('ship: ship ended blocked with its merge staged, so the run aborted its merge; nothing landed on main'),
        pass.notes.join('\n'),
      );
    },
  );

  await s.test(
    'an ending that stopped clean is written down as untouched, and a merge a person stages after it is theirs, pass after pass',
    async () => {
      const { repo, id, base, pass } = await blockedClean();
      assert.deepEqual(readRun(id).steps.ship.landed, { untouched: 'ship ended blocked, and nothing of it was staged' });
      assert.ok(
        pass.notes.includes('ship: ship ended blocked, and nothing of it was staged: the run left the checkout as it found it'),
        pass.notes.join('\n'),
      );
      assert.equal(
        (await shipOf(id)).note,
        undefined,
        'nemia ls says the step as it stopped, and nothing of a landing the run did not make',
      );
      for (let i = 0; i < 2; i++) await at.pass(id);
      assert.equal(at.mergeHead(repo), true, "no pass after takes the person's merge back: it is still staged");
      assert.notEqual(at.uncommitted(repo), '');
      assert.equal(world().head(repo), base);
    },
  );

  await s.test("`nemia rm` of an ending that stopped clean does not wait on a person's merge staged after it", async () => {
    const { repo, id } = await blockedClean();
    const forgot = await stage.runWith(e, forgetRun(id));
    assert.notEqual(forgot.kind, 'refused', forgot.kind === 'refused' ? forgot.refusal : '');
    assert.equal(at.mergeHead(repo), true, "the run is forgotten with the person's merge left as it is");
  });

  await s.test("the whole screen of an ending whose check did not finish on the merge, with the check's files", async (st) => {
    assert.deepEqual(await checkedScreen(st, undefined), [
      ...workAbove(
        '  CHECK DID NOT FINISH: ship  — stopped, or killed before it exited: no verdict on the work, and no retry spent; nothing after it ran',
        '    ship: its check did not finish, so the run aborted the merge and nothing landed on main. Merge and check again:  nemia retry <id> ship',
      ),
      '    check  npm test && npm run typecheck && npm run lint  →  unfinished ✗',
      '      stdout:',
      '        (the test engine keeps no logs)',
      ...shipBelow,
    ]);
  });

  await s.test("the whole screen of an ending whose check refused the merge, with the check's files", async (st) => {
    assert.deepEqual(await checkedScreen(st, 1), [
      ...workAbove(
        '  FAILED CHECK: ship  — the run executed its check and it did not exit 0; nothing after it ran',
        '    ship: failed (check) — nothing landed on main: its check refused the merge (exit 1). Land again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <id> ship  (--fresh, or --model <m>, for a new session)',
      ),
      '    check  npm test && npm run typecheck && npm run lint  →  exit 1 ✗',
      ...shipBelow,
      "  semantic  merges cleanly onto main, and ship's landing check refused the merged tree at <base>: a conflict of meaning, not of text",
    ]);
  });
});

test('a result a person merged by hand before its ending ran: the run has landed as git reads it, a run `--after` it starts, and every screen agrees', async (t) => {
  const s = story(t);
  const { filings } = stage.board();
  let gate: Awaited<ReturnType<typeof at.atTheGate>>;
  let child = '';

  await s.test('at its gate, with the branch ahead, a decision to make, and a run --after it waits', async () => {
    gate = await at.atTheGate();
    assert.equal((await listed(gate.id)).toDecide?.kind, 'approve');
    const started = await stage.runPlaced(
      startRun({ brief: 'read the flag', repo: gate.repo, workflowDir: at.oneStep(), after: [gate.id] }),
    );
    child = started.id;
    assert.deepEqual((await at.pass(child)).filed, [], 'nothing of the child is filed while the result is off the base');
  });

  await s.test(
    "REFUSED at shipped defaults: merged by hand, nothing is to decide, nobody is waited on, and the ending's line in `nemia ls` says where the branch stands",
    async (st) => {
      const { repo, id, branch } = gate;
      at.mergedByHand(repo, branch);
      assert.equal(await at.isLanded(at.repositoryRun(readRun(id)), branch), true, 'a person merged the result, and nobody told the run');
      await at.aPass(e());
      const l = await listed(id);
      assert.equal(l.toDecide, undefined, 'nothing to decide: git already has the result');
      assert.deepEqual(l.waitingOnYou, [], 'and nobody is waited on for an approval that would be refused');
      const ship = l.steps.find((x) => x.name === 'ship')!;
      assert.deepEqual(
        [ship.status, ship.note],
        [
          'awaiting approval',
          `${branch} is on main — nothing is left for ship to merge: the run has landed as git reads it, and nothing waits on you; close the record if you want it closed: nemia cancel ${id}`,
        ],
      );
      const printed = await at.printedBy(st, ['ls', id]);
      assert.ok(!printed.some((x) => x.includes('→ to decide') || x.includes('→ waiting on you')), printed.join('\n'));
      assert.ok(
        printed.some((x) => x.includes(`${branch} is on main — nothing is left for ship to merge`)),
        printed.join('\n'),
      );
    },
  );

  await s.test(
    '`nemia decide` says the same before anybody closes the record: landed, and no AWAITING APPROVAL above a branch on main',
    async (st) => {
      const { id, branch } = gate;
      const { decision } = await stage.runWith(e(), decideRun(id));
      assert.deepEqual([decision.kind, decision.kind === 'landed' ? decision.branches : []], ['landed', [branch]]);
      const screen = await at.printedBy(st, ['decide', id]);
      assert.ok(
        screen.some((x) =>
          x.endsWith(
            `\n\n  landed — ${branch} is already on main\n  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel ${id}`,
          ),
        ),
        screen.join('\n'),
      );
      assert.ok(!screen.some((x) => x.includes('AWAITING APPROVAL') || x.includes('nemia approve')), screen.join('\n'));
    },
  );

  await s.test('the whole screen of a run whose result a person merged by hand, its ending never run', async (st) => {
    const { repo, id } = gate;
    assert.deepEqual(timeless(await decideScreen(st, e(), [id], { '<id>': id, '<repo>': repo, '<root>': ROOT }, stage.place().place)), [
      '<id>  add sub',
      '',
      '  landed — wf/<id>/run is already on main',
      '  ship never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel <id>',
    ]);
  });

  await s.test('REFUSED at shipped defaults: `nemia approve` names `nemia cancel` instead, and writes nothing', async () => {
    const { id, branch } = gate;
    await assert.rejects(
      stage.runWith(e(), approveRun(id, 'ship', 'Merge it.')),
      refusedNaming(`${branch} is on main`, 'nothing left for ship to merge', `nemia decide ${id}`, `nemia cancel ${id}.`),
    );
    assert.deepEqual(readRun(id).approvals ?? [], [], 'nothing was written');
  });

  await s.test("ship is never filed, pass after pass, and the child starts on git's word: its parent has landed", async () => {
    const { id } = gate;
    for (const pass of [1, 2]) assert.deepEqual((await at.pass(id)).filed, [], `pass ${pass}: ship is never filed`);
    assert.deepEqual(filings, [`${id}-implement`]);
    assert.equal(readRun(id).steps.ship.taskId, null);
    assert.deepEqual((await at.pass(child)).filed, ['implement']);
  });

  await s.test(
    'the command the refusal names is honoured once the child has started: the record is closed, with nothing to decide',
    async () => {
      await stage.runWith(e(), cancelRun(gate.id));
      assert.equal((await stage.runWith(e(), decideRun(gate.id))).decision.kind, 'cancelled');
    },
  );

  await s.test(
    '`nemia rm` of a run whose ending never ran and whose result a person merged by hand forgets it: the gate holds nothing, so the approval it named is not named',
    async () => {
      const { repo, id, branch } = await at.atTheGate();
      const held = await stage.runWith(e(), forgetRun(id));
      assert.equal(held.kind, 'refused', 'at its gate with the branch ahead, the run is held');
      assert.match(
        held.kind === 'refused' ? (held.refusal ?? '') : '',
        new RegExp(`ship waits at its gate for your approval, and it is filed once it is approved: nemia approve ${id} ship`),
      );
      at.mergedByHand(repo, branch);
      const forgot = await stage.runWith(e(), forgetRun(id));
      assert.equal(forgot.kind, 'forgotten', forgot.kind === 'refused' ? forgot.refusal : '');
      assert.equal(fs.existsSync(path.join(ROOT, 'runs', `${id}.json`)), false);
    },
  );

  await s.test(
    "an ending's gate is a decision again once the base branch no longer has the result: git is read each pass, and the approval is honoured",
    async () => {
      const { repo, id, branch, base } = await at.atTheGate();
      at.mergedByHand(repo, branch);
      await at.aPass(e());
      assert.equal((await listed(id)).toDecide, undefined);
      world().putBack(repo, base);
      await at.aPass(e());
      assert.equal((await listed(id)).toDecide?.kind, 'approve', 'the merge reset away before anybody pushed it: the gate is a word again');
      assert.match((await shipOf(id)).note ?? '', /^approve it: nemia approve /);
      assert.equal((await stage.runWith(e(), approveRun(id, 'ship'))).approval.step, 'ship');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
    },
  );
});

test('two runs of one repository at their endings: the oldest approval takes the checkout, the other waits for it — its first filing and its try — and every screen says which run has it', async (t) => {
  const s = story(t);
  const { settle } = stage.board();
  let two: Awaited<ReturnType<typeof at.twoApproved>>;

  await s.test(
    "two runs' ending steps never work in one checkout at once: the oldest approval takes it, and the other reads as waiting for it",
    async (st) => {
      two = await at.twoApproved();
      const { repo, first, second } = two;
      const one = await at.pass(first.id);
      const other = await at.pass(second.id);
      assert.deepEqual([one.filed, other.filed], [[], ['ship']], 'a pass over both, the first run first, files the older approval');
      assert.equal(one.inFlight, true, 'the run held back is in flight all the same: a directory is what it waits for');
      assert.equal(readRun(first.id).steps.ship.taskId, null);
      assert.equal(readRun(second.id).steps.ship.workspace, repo, "and the one filed is in the repository's own checkout");
      assert.deepEqual((await at.pass(first.id)).filed, [], 'pass after pass, while that step is in the checkout');
      assert.equal((await shipOf(first.id)).status, `waiting on the checkout (${second.id}'s ship has it)`);
      const { decision, checkout } = await stage.runWith(e(), decideRun(first.id));
      assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
      assert.deepEqual(checkout, { run: second.id, step: 'ship' });
      const holder = await stage.runWith(e(), decideRun(second.id));
      assert.deepEqual(
        [holder.decision.kind, holder.decision.kind === 'running' ? holder.decision.waiting : [], holder.checkout],
        ['running', ['ship'], undefined],
        'the run in the checkout waits on its own ship, and on no other run',
      );
      const printed = await at.printedBy(st, ['decide', first.id]);
      assert.ok(printed.includes(waitLine(second.id)), printed.join('\n'));
    },
  );

  const ids = () => ({ '<first>': two.first.id, '<second>': two.second.id, '<repo>': two.repo, '<root>': ROOT });
  const screenOf = async (st: import('node:test').TestContext, id: string) =>
    timeless(await decideScreen(st, e(), [id], ids(), stage.place().place));

  await s.test('the whole screen of a run whose ending waits for the checkout, first filed', async (st) => {
    assert.deepEqual(await screenOf(st, two.first.id), [
      '<first>  add sub',
      '',
      '  still running: ship',
      "  ship: waiting on the checkout (<second>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <second>'s ship has settled",
      '  nothing to decide yet',
    ]);
  });

  await s.test(
    "the older approval's ship signs off blocked, its trial merge aborted: the checkout is free, and the other run takes it",
    async () => {
      settle(`${two.second.id}-ship`, 'succeeded', BLOCKED);
      assert.deepEqual((await at.pass(two.first.id)).filed, ['ship']);
    },
  );

  await s.test('the whole screen of the run whose ending ended blocked, before it is sent back', async (st) => {
    assert.deepEqual(await screenOf(st, two.second.id), [
      '<second>  add sub',
      '',
      '  UNVERIFIED: implement  — no check: declared; only its own word says it worked',
      '  BLOCKED, waiting on you: ship',
      '',
      '  once more, on the next tick:',
      '    ship: blocked. Land again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <second> ship  (--fresh, or --model <m>, for a new session)',
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
      '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
      '    did the work',
      '',
      '  ship  BLOCKED',
      '    gate  approved 08:00Z',
      '    used  not measured',
      '    cost  not measured',
      '    timeline  try 1  filed <t>  spawned <t>  ended <t>  queued 0s  ran 0s  used not measured',
      '    the check refused',
      '    !! declared and not given: message',
      '    needs: read the suite',
      '    to answer it:  nemia retry <second> ship --message "<answer>"',
      '',
      '  cost  run not measured',
      '  timeline  run  queued 0s  ran 0s  wall 0s',
      '',
      '  wf/<second>/run  — 1 file: +1 −0',
      '',
      '  branch    wf/<second>/run is ahead of main by 1 commit',
    ]);
  });

  await s.test(
    "a try of an ending step waits for the checkout as its first filing does: a person's send-back of a ship that ended blocked files nothing while another run's ship is merging",
    async (st) => {
      const { first, second } = two;
      const { ask } = await stage.runWith(
        e(),
        retryRun(second.id, 'ship', { mode: 'continue', message: 'the check was green here; run it again' }),
      );
      assert.deepEqual([ask.step, ask.try], ['ship', 2], 'allowed, for a settled step that signed off blocked, and held');
      for (const pass of [1, 2]) {
        const held = await at.pass(second.id);
        assert.deepEqual([held.tried, held.filed], [[], []], `pass ${pass}: the try waits for the checkout`);
      }
      assert.deepEqual(readRun(second.id).steps.ship.tries, undefined, 'and no try was taken');
      assert.equal(world().head(two.repo), first.base, 'nothing merged while two endings wanted the same directory');
      const l = await listed(second.id);
      assert.deepEqual(
        [l.steps[1].status, l.steps[1].note],
        ['succeeded · BLOCKED', `try 2 asked (--continue) — waiting on the checkout (${first.id}'s ship has it)`],
      );
      const printed = await at.printedBy(st, ['decide', second.id]);
      assert.ok(
        printed.includes(waitLine(first.id)),
        `nemia decide says it on the screen of a run whose ending ended blocked\n${printed.join('\n')}`,
      );
      assert.ok(!printed.some((x) => x.includes('the next tick files it')), 'and not that the next tick files the try');
    },
  );

  await s.test(
    "a run whose ending's try the checkout holds is a run still running: `nemia ls`, `nemia decide` and the pass agree, and it still counts against the cap on runs in flight",
    async () => {
      const { first, second } = two;
      const pass = await at.pass(second.id);
      assert.deepEqual([pass.filed, pass.tried], [[], []], 'nothing of it is filed while the other run is in the checkout');
      assert.equal(pass.status, 'running', 'a try asked for and not yet filed is work in hand, not a run waiting on a person');
      assert.equal(pass.inFlight, true, 'so the cap on runs in flight still counts it');
      const l = await listed(second.id);
      assert.deepEqual(l.waitingOnYou, [], 'nobody is waited on — what holds it is a directory');
      assert.equal(l.toDecide, undefined, 'and there is nothing to decide');
      assert.deepEqual(
        [l.steps[1].status, l.steps[1].note],
        ['succeeded · BLOCKED', `try 2 asked (--continue) — waiting on the checkout (${first.id}'s ship has it)`],
      );
      const { decision } = await stage.runWith(e(), decideRun(second.id));
      assert.deepEqual([decision.kind, decision.kind === 'running' ? decision.waiting : []], ['running', ['ship']]);
    },
  );

  await s.test('the whole screen of a run whose ending waits for the checkout, sent back', async (st) => {
    assert.deepEqual(await screenOf(st, two.second.id), [
      '<second>  add sub',
      '',
      '  still running: ship',
      "  ship: waiting on the checkout (<first>'s ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once <first>'s ship has settled",
      '  nothing to decide yet',
    ]);
  });

  await s.test(
    'once the step in the checkout settles, the try is filed there on the first pass after, as any try of it would be',
    async () => {
      settle(`${two.first.id}-ship`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(two.second.id)).tried, ['ship']);
      assert.equal(readRun(two.second.id).steps.ship.workspace, two.repo);
    },
  );

  await s.test('a run whose ending waits for the checkout is filed once the step in it settles', async () => {
    const { repo, first, second } = await at.twoApproved();
    await at.pass(second.id);
    assert.deepEqual((await at.pass(first.id)).filed, [], 'held while the other run works in the checkout');
    settle(`${second.id}-ship`, 'succeeded', SIGNED);
    assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'and filed on the first pass after it settles');
    assert.equal(readRun(first.id).steps.ship.workspace, repo);
    assert.equal((await shipOf(first.id)).status, 'pending');
  });

  await s.test(
    "a cancelled run holds the checkout while its ending's session is still in it: `nemia cancel` asks the engine to stop it, and it is still merging until it has",
    async () => {
      const { repo, first, second } = await at.twoApproved();
      await at.pass(second.id);
      assert.equal(stage.board().tasks.get(`${second.id}-ship`)!.phase, 'pending', 'its session is in the checkout');
      const { plan } = await stage.runWith(e(), cancelRun(second.id));
      assert.deepEqual(plan.kind === 'cancel' ? plan.stop.map((x) => x.name) : [], ['ship'], 'called off: the engine is asked to stop it');
      assert.deepEqual(
        (await at.pass(first.id)).filed,
        [],
        'until it has settled that agent is still mid merge, so the other files nothing',
      );
      assert.equal((await shipOf(first.id)).status, `waiting on the checkout (${second.id}'s ship has it)`);
      settle(`${second.id}-ship`, 'stopped');
      assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'settled stopped: the checkout is free, and the next pass takes it');
      assert.equal(readRun(first.id).steps.ship.workspace, repo);
    },
  );

  await s.test(
    "a `workspace: base` task the engine has lost holds no checkout: a run nobody can stop does not hold every other run's ending for ever",
    async () => {
      const { first, second } = await at.twoApproved();
      await at.pass(second.id);
      assert.deepEqual((await at.pass(first.id)).filed, [], 'held while the engine has that step in flight');
      stage.board().tasks.delete(`${second.id}-ship`);
      assert.deepEqual((await at.pass(first.id)).filed, ['ship'], 'and filed once the engine no longer holds it');
    },
  );
});

test('a checkout held by a merge staged and not landed, and claimed by no run the pass will not file', async (t) => {
  const s = story(t);
  const { settle } = stage.board();

  await s.test(
    "REFUSED at shipped defaults: `nemia rm` of a run whose merge is staged and not landed, and another run's ending, wait until the run has landed it",
    async () => {
      const repo = at.aRepo();
      const { id, checkId } = await at.stagedAndSigned({ repo });
      const other = await at.atTheGate({ repo });
      await stage.runWith(e(), approveRun(other.id, 'ship'));
      assert.deepEqual((await at.pass(other.id)).filed, [], "while the check runs on the merge, the other run's ending is not filed");
      settle(checkId, 'succeeded', undefined, 0);
      assert.deepEqual(
        (await at.pass(other.id)).filed,
        [],
        'with the check settled and nothing landed yet, the merge still holds the checkout',
      );
      const refused = await stage.runWith(e(), forgetRun(id));
      assert.equal(refused.kind, 'refused', 'nor is the run forgotten before the pass that lands it');
      const refusal = refused.kind === 'refused' ? refused.refusal : undefined;
      for (const fact of ["ship's merge is staged", `(${repo})`, 'not yet committed or aborted', `nemia rm ${id} once nemia ls ${id}`])
        assert.ok(refusal?.includes(fact), `${refusal} names ${fact}`);
      assert.equal(at.mergeHead(repo), true, 'and nothing was touched');
      await at.pass(id);
      assert.equal(at.mergeHead(repo), false);
      assert.deepEqual((await at.pass(other.id)).filed, ['ship'], 'landed, the checkout is free');
      assert.notEqual((await stage.runWith(e(), forgetRun(id))).kind, 'refused');
    },
  );

  await s.test(
    'a run whose ending the pass will not file claims no checkout: one waiting on a run that has not landed, and one the cap on runs in flight holds, each hold nobody — however old their word',
    async () => {
      const repo = at.aRepo();
      const waiting = await at.atTheGate({ repo });
      const child = await stage.runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: at.mergeOnly(), after: [waiting.id] }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(child.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
      assert.deepEqual((await at.pass(child.id)).filed, [], 'a merge-only run approved oldest waits on a run at its own gate');
      await stage.runWith(e(), approveRun(waiting.id, 'ship'));
      assert.deepEqual((await at.pass(waiting.id)).filed, ['ship'], 'so the checkout goes to the run that would use it');
      assert.equal((await shipOf(waiting.id)).status, 'pending');

      const other = at.aRepo();
      const inFlight = await at.atTheGate({ repo: other });
      await stage.runWith(e(), approveRun(inFlight.id, 'ship'));
      const queued = await stage.runPlaced(startRun({ brief: 'ship the flag', repo: other, workflowDir: at.mergeOnly() }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(queued.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T05:00:00.000Z' }));
      process.env.WF_MAX_RUNS = '1';
      try {
        const capped = await stage.runWith(e(), advanceRun(readRun(queued.id), { inFlight: 1, cap: 1 }));
        assert.deepEqual(capped.filed, [], 'the cap on runs in flight holds its root while a run is in flight');
        assert.deepEqual((await at.pass(inFlight.id)).filed, ['ship'], "so its ending claims nothing, and holds no other run's");
      } finally {
        delete process.env.WF_MAX_RUNS;
      }
    },
  );

  await s.test(
    "a run with nothing filed is held by the checkout like any other: its ending is its root, and a root is not filed into a directory another run's ship is in",
    async () => {
      const repo = at.aRepo();
      const parent = await at.atTheGate({ repo });
      await stage.runWith(e(), approveRun(parent.id, 'ship'));
      await at.pass(parent.id);
      at.mergedByHand(repo, parent.branch);
      settle(`${parent.id}-ship`, 'succeeded', SIGNED);
      await at.pass(parent.id);
      assert.equal(await at.isLanded(at.repositoryRun(readRun(parent.id)), parent.branch), true, "the merge-only run's parent has landed");
      const other = await at.atTheGate({ repo });
      fs.writeFileSync((await stage.runWith(e(), approveRun(other.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T06:00:00.000Z' }));
      const child = await stage.runPlaced(startRun({ brief: 'ship the flag', repo, workflowDir: at.mergeOnly(), after: [parent.id] }));
      fs.writeFileSync((await stage.runWith(e(), approveRun(child.id, 'ship'))).file, JSON.stringify({ at: '2026-09-17T07:00:00.000Z' }));
      assert.deepEqual((await at.pass(other.id)).filed, ['ship'], 'the older word takes the checkout');
      assert.deepEqual((await at.pass(child.id)).filed, [], 'and the run with nothing filed waits for it');
      await at.aPass(e());
      assert.equal((await listed(child.id)).steps[0].status, `waiting on the checkout (${other.id}'s ship has it)`);
      settle(`${other.id}-ship`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(child.id)).filed, ['ship'], 'and is filed once that step settles');
      assert.equal(readRun(child.id).steps.ship.workspace, repo);
    },
  );
});

test("a send-back at the ending's gate goes to the work, merges nothing, and the gate holds again once the work signs off", async (t) => {
  const s = story(t);
  const { settle } = stage.board();
  let gate: Awaited<ReturnType<typeof at.atTheGate>>;

  await s.test(
    'REFUSED at shipped defaults: a try of the ending step itself, which has not run, names the approval that files it and the send-back to the work',
    async () => {
      gate = await at.atTheGate();
      const { id } = gate;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'ship', { mode: 'continue' })),
        refusedAs(
          'Conflict',
          'ship is at its gate',
          'nothing of it has run',
          'no try of it to replace',
          `nemia approve ${id} ship`,
          `nemia retry ${id} implement --message "<objection>".`,
        ),
      );
      assert.equal(readRun(id).steps.ship.taskId, null, 'and nothing was written');
    },
  );

  await s.test(
    "REFUSED at the ending's gate, at shipped defaults: a send-back with no words names the step at the gate — ship, not the work — and the send-back it names is honoured",
    async () => {
      const { id } = gate;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'continue' })),
        refusedAs(
          'Conflict',
          'ship is at its gate, not implement',
          'goes to implement',
          'no words',
          `nemia retry ${id} implement --message "<objection>"`,
          `nemia approve ${id} ship.`,
        ),
      );
      const { ask } = await stage.runWith(
        e(),
        retryRun(id, 'implement', { mode: 'continue', message: 'sub subtracts the wrong way round' }),
      );
      assert.deepEqual([ask.step, ask.try], ['implement', 2]);
    },
  );

  await s.test(
    'a sent-back ending merges nothing: the work is filed again, the checkout is untouched, and the gate holds again once it signs off',
    async () => {
      const { repo, id, branch, base } = gate;
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['implement'], []], 'the work goes again, and the ending is not filed');
      assert.equal(readRun(id).steps.ship.taskId, null);
      assert.equal(world().head(repo), base, 'nothing is merged');
      assert.equal(at.uncommitted(repo), '');
      assert.equal((await listed(id)).toDecide, undefined, 'while the work runs there is nothing to decide');
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming('ship is not at its gate yet'));
      settle(`${id}-implement-try2`, 'succeeded', SIGNED);
      assert.deepEqual((await at.pass(id)).filed, [], 'and the gate holds the ending again');
      assert.deepEqual((await listed(id)).toDecide?.kind, 'approve');
      assert.equal(await at.isLanded(at.repositoryRun(readRun(id)), branch), false);
    },
  );

  await s.test(
    'the approval the send-back refusal names is honoured too, on a run of its own, since one takes the other back',
    async () => {
      const other = await at.atTheGate();
      assert.equal((await stage.runWith(e(), approveRun(other.id, 'ship'))).approval.step, 'ship');
    },
  );

  await s.test(
    "REFUSED at shipped defaults: `nemia retry --round` at an ending's gate says the run is at that gate — not that what waits on the loop has been filed",
    async () => {
      const { id } = await at.workDone(at.loopingFolder());
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
      const pass = await at.pass(id);
      assert.deepEqual([pass.looped, pass.filed], [[], []], 'the loop has handed on, and the ending waits at its gate');
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      await assert.rejects(
        stage.runWith(e(), roundRun(id, 'review')),
        refusedAs(
          'Conflict',
          'review signed off',
          '(`again: false`)',
          'nothing waiting on it has been filed',
          "the run is at ship's gate",
          `nemia approve ${id} ship`,
          `nemia retry ${id} review --message "<objection>".`,
        ),
      );
      assert.ok(!at.asksOf(id).includes('round-review-2'), 'and no ask was written');
    },
  );
});

test('an ending that stopped on the base branch sends the work back through the loop: review hears the objection and what ship needs, implement gets a round, and ship waits at its gate for a new approval', async (t) => {
  const s = story(t);
  const { tasks, filings, settle } = stage.board();
  let stopped: Awaited<ReturnType<typeof at.stoppedOnBase>>;

  await s.test('`nemia decide` offers both ways on from an ending stopped on its base branch, each with when to take it', async (st) => {
    stopped = await at.stoppedOnBase();
    const { id } = stopped;
    assert.equal(readRun(id).steps.ship.taskId, `${id}-ship`, 'ship ran on its approval');
    const printed = await at.printedBy(st, ['decide', id]);
    assert.ok(
      printed.some((l) =>
        l.includes(
          `ship: blocked. Land again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry ${id} ship  (--fresh, or --model <m>, for a new session)`,
        ),
      ),
      printed.join('\n'),
    );
    assert.ok(
      printed.some((l) =>
        l.includes(
          `review: ship stopped on the base branch. Send the work back, when it does not hold on the base branch — review is filed again with your objection and what ship said, may ask for a round, and ship waits at its gate for a new approval:  nemia retry ${id} review --message "<objection>"`,
        ),
      ),
      printed.join('\n'),
    );
  });

  await s.test(
    'REFUSED at shipped defaults: a merge of an ending stopped on a base that merges cleanly says to land it again',
    async () => {
      const { id } = stopped;
      fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, 'nothing to merge', `land it again: nemia retry ${id} ship.`),
      );
    },
  );

  await s.test(
    '`nemia decide` offers no merge where the work merges cleanly onto the base: a base that merges cleanly is landed again, never merged',
    async () => {
      assert.deepEqual(
        (await stage.runWith(e(), decideRun(stopped.id))).commands.filter((c) => c.label === 'refresh'),
        [],
      );
    },
  );

  await s.test(
    'the send-back is filed: the reviewer again with the objection and what ship said, the ending not, and nothing merged',
    async () => {
      const { repo, id, base } = stopped;
      const { ask } = await stage.runWith(
        e(),
        retryRun(id, 'review', { mode: 'continue', message: 'take main, and keep both subs working' }),
      );
      assert.deepEqual([ask.step, ask.try], ['review', 2]);
      assert.equal(await statusOf(id, 'ship'), 'pending', 'between the ask and the pass, the ending reads as waiting for the work');
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['review'], []], 'the reviewer is filed again, and the ending is not');
      assert.deepEqual(filedAs(readRun(id).steps.ship), {
        taskId: null,
        workspace: repo,
        branch: 'main',
        tries: [{ taskId: `${id}-ship`, cause: 'back' }],
      });
      assert.equal(world().head(repo), base, 'nothing merged');
      const brief = tasks.get(`${id}-review-try2`)!.spec.brief;
      for (const said of [
        "the work went on to ship, which a person approved: it acts on main in the repository's own checkout, and it stopped there — `blocked` —",
        '## Your answer\n\n```text\ntake main, and keep both subs working\n```',
        '## What ship said\n\nIts summary:\n\n```text\nmain moved since the branch was cut',
        "What it needs:\n\n```text\nthe branch has to take main: add.ts conflicts with main's sub\n```",
        "sign off with `again: true` and say what — what ship needs among it: the work's next round is on the run's branch, where merging main into it is the work's to do.",
      ])
        assert.ok(brief.includes(said), brief);
      await assert.rejects(
        stage.runWith(e(), approveRun(id, 'ship')),
        refusedAs('Conflict', 'ship is not at its gate yet'),
        'try 1 does not carry over',
      );
    },
  );

  await s.test(
    'the reviewer asks for a round, implement goes on, and once the loop settles ship waits at its gate for a new approval of its try 2',
    async () => {
      const { repo, id } = stopped;
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      assert.deepEqual((await at.pass(id)).looped, ['review'], 'implement goes on, on its branch, and review reviews again');
      assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
      settle(`${id}-implement-try2`, 'succeeded', {
        ...SIGNED,
        replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch, and both subs are one' }],
      });
      await at.pass(id);
      settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
      assert.deepEqual((await at.pass(id)).filed, [], 'the loop has settled, and the ending holds at its gate');
      const l = await listed(id);
      assert.deepEqual([l.steps.find((x) => x.name === 'ship')!.status, l.toDecide?.kind], ['awaiting approval', 'approve']);
      const { approval } = await stage.runWith(e(), approveRun(id, 'ship', 'Merge it, now it takes main.'));
      assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try the ending is now on');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      assert.equal(tasks.get(`${id}-ship-try2`)!.spec.cwd, repo);
    },
  );

  await s.test(
    "REFUSED at shipped defaults: a send-back from a stopped ending with no words, to a step that is not the loop's, a round of the loop, or while the ending's own try is asked for — and the ending's try while a send-back is",
    async () => {
      stopped = await at.stoppedOnBase();
      const { id } = stopped;
      const back = `nemia retry ${id} review --message "<objection>"`;
      const again = `a dirty checkout, a flaky test: nemia retry ${id} ship.`;
      const halted = 'ship stopped on the base branch (blocked)';
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'review', { mode: 'continue' })),
        refusedAs('Conflict', "review's work went on to ship", halted, 'a try of review sends the work back', 'no words', back, again),
      );
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'continue', message: 'take main' })),
        refusedAs('Conflict', halted, "through the folder's loop, not to implement", 'send it back to review', back, again),
      );
      await assert.rejects(
        stage.runWith(e(), roundRun(id, 'review')),
        refusedAs('Conflict', 'review signed off', '(`again: false`)', halted, 'its `again: true` is the round', back, again),
      );
      assert.ok(!at.asksOf(id).includes('round-review-2'), 'and no ask was written');
      const { ask } = await stage.runWith(e(), retryRun(id, 'ship', { mode: 'continue', message: 'the checkout is clean now' }));
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'review', { mode: 'continue', message: 'take main' })),
        refusedNaming(`try 2 of ship is asked for (--continue, at ${ask.at})`, 'a send-back would take that try back'),
        'the two ways on take the same try of the ending: one asked refuses the other, each way round',
      );
      fs.rmSync(path.join(ROOT, 'runs', `${id}.asks`, 'retry-ship-2'));
      const sending = await stage.runWith(e(), retryRun(id, 'review', { mode: 'continue', message: 'take main' }));
      const sentBack = `the work is being sent back from ship (nemia retry ${id} review, at ${sending.ask.at})`;
      const wait = `Wait for it: nemia ls ${id}.`;
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'ship', { mode: 'continue' })),
        refusedAs('Conflict', sentBack, 'ship returns to its gate once it settles', wait),
      );
    },
  );

  await s.test(
    "REFUSED at shipped defaults: a step is handed off once — a person's edit in the reviewed worktree while the run waits at its ending's gate is not committed under review's name, pass after pass",
    async () => {
      const { id } = stopped;
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
      const tipsBefore = readRun(id).tips;
      const handing = await at.pass(id);
      assert.deepEqual([handing.filed, handing.looped, handing.tried], [[], [], []], 'the ending waits at its gate');
      assert.deepEqual(readRun(id).tips, tipsBefore, 'and no tip moved: review handed on with no commit of its own');
      const review = readRun(id).steps.review;
      assert.equal(review.handedOff, `${id}-review-try2`, 'the mark is written on the record on disk, not only in the pass that set it');
      const tip = world().head(review.workspace!);
      fs.writeFileSync(path.join(review.workspace!, 'NOTES.md'), "a person's notes\n");
      await at.pass(id);
      await at.pass(id);
      assert.equal(world().head(review.workspace!), tip, "no commit under review's name");
      assert.match(at.uncommitted(review.workspace!), /NOTES\.md/, "the edit is still the person's, uncommitted");
    },
  );

  await s.test(
    "a send-back composes with `nemia retry --round` in a loop out of rounds, as the incident's was: review's `again: true` reads exhausted, a round takes it once more, and ship waits at its gate for a new approval",
    async () => {
      const { id } = await at.stoppedOnBase(at.loopingFolder(1));
      await stage.runWith(e(), retryRun(id, 'review', { mode: 'continue', message: 'take main' }));
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      const spent = await at.pass(id);
      assert.deepEqual([spent.looped, spent.filed], [[], []], "at rounds: 1 the loop's only round was spent before ship ran");
      assert.deepEqual([await statusOf(id, 'review'), await statusOf(id, 'ship')], ['rounds exhausted', 'pending']);
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming(), 'and no approval is taken while the work is out');
      const { ask } = await stage.runWith(e(), roundRun(id, 'review'));
      assert.equal(ask.round, 2, 'a person takes the loop once more');
      assert.deepEqual((await at.pass(id)).looped, ['review'], 'the round goes to implement, and review hands on after it');
      assert.ok(filings.includes(`${id}-implement-try2`), filings.join(', '));
      settle(`${id}-implement-try2`, 'succeeded', {
        ...SIGNED,
        replies: [{ finding: 'take main', answer: 'fixed', why: 'merged main into the branch' }],
      });
      await at.pass(id);
      settle(`${id}-review-try3`, 'succeeded', { ...SIGNED, again: false });
      assert.deepEqual((await at.pass(id)).filed, [], 'the loop has settled, and nothing of ship runs');
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      const { approval } = await stage.runWith(e(), approveRun(id, 'ship', 'Merge it, now it takes main.'));
      assert.deepEqual([approval.step, approval.try], ['ship', 2], 'a new approval, of the try ship is now on');
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a folder with no loop before its ending has no way to send the work back from it, and says so — landing again is still there',
    async () => {
      const { id } = await at.stoppedOnBase(at.folder());
      await assert.rejects(
        stage.runWith(e(), retryRun(id, 'implement', { mode: 'continue', message: 'take main' })),
        refusedAs(
          'Conflict',
          'ship stopped on the base branch (blocked)',
          'this workflow has no loop before it',
          'implement does not loop',
          `nemia retry ${id} ship.`,
          `(nemia cancel ${id})`,
          '(nemia start)',
          'a `loop:` step',
        ),
      );
      assert.equal(readRun(id).steps.implement.tries, undefined, 'and nothing was asked');
      await stage.runWith(e(), retryRun(id, 'ship', { mode: 'continue', message: 'the checkout is clean now' }));
      assert.deepEqual((await at.pass(id)).tried, ['ship'], 'landing again is a try of the ending, filed without a new approval');
      assert.ok(tasks.get(`${id}-ship-try2`));
      const { repo, branch } = readRun(id) as unknown as { repo: string; branch: string };
      world().stage(repo, readRun(id).steps.implement.branch!);
      assert.equal(branch, 'main');
      settle(`${id}-ship-try2`, 'succeeded', { ...SIGNED, message: MESSAGE });
      assert.deepEqual((await at.pass(id)).checked, ['ship'], "the try's merge is checked as the first try's was");
      settle(`${id}-ship-try2-check`, 'succeeded', undefined, 0);
      assert.equal((await at.pass(id)).status, 'succeeded', 'once its merge lands the run is over');
      assert.notEqual(await statusOf(id, 'ship'), 'awaiting approval', 'not at its gate again');
    },
  );

  await s.test(
    '`nemia decide` offers the merge where the work conflicts with the base: the bare `nemia refresh --base`, labelled merge — and not once it is asked',
    async () => {
      stopped = await at.stoppedOnBase();
      const { repo, id } = stopped;
      const merges = async () => (await stage.runWith(e(), decideRun(id))).commands.filter((c) => c.label === 'refresh');
      assert.deepEqual(await merges(), [], 'a base that merges cleanly is landed again, never merged');
      at.mainMoves(repo);
      const decided = await stage.runWith(e(), decideRun(id));
      assert.deepEqual(
        decided.commands.filter((c) => c.label === 'refresh'),
        [
          {
            label: 'refresh',
            command: `nemia refresh ${id} review --base`,
            said: `review: implement's work conflicts with main. Merge main into it — implement continued, then a new review, on round 1, which the merge does not spend:  nemia refresh ${id} review --base`,
            step: 'review',
          },
        ],
      );
      assert.ok(decided.offers.includes(decided.commands.find((c) => c.label === 'refresh')!.said!), decided.offers.join('\n'));
      await stage.runWith(e(), mergeRun(id));
      assert.deepEqual(await merges(), [], 'nor once it is asked');
    },
  );

  await s.test(
    'a merge a pass filed and never wrote down is adopted as a merge: the round kept, the base moved to the commit merged, nothing filed twice',
    async () => {
      const { repo, id } = stopped;
      const sha = world().head(repo);
      await Effect.runPromise(e().file({ id: `${id}-implement-try2`, brief: '## Merge main', cwd: repo }));
      const before = filings.length;
      await at.pass(id);
      const r = readRun(id);
      assert.deepEqual(
        r.steps.implement.tries?.map((x) => x.cause),
        ['merge'],
      );
      assert.equal(r.steps.implement.taskId, `${id}-implement-try2`);
      assert.equal(roundOf(r, 'review'), 1);
      assert.equal(r.baseRef, sha);
      assert.ok(!filings.slice(before).includes(`${id}-implement-try2`), filings.join(', '));
    },
  );
});

test('a loop out of rounds before its ending: accepted as it stands, sent back after its acceptance, or sent to merge the base without a round', async (t) => {
  const s = story(t);
  const { tasks, settle } = stage.board();

  await s.test(
    "the incident's other ending: at rounds exhausted a person accepts the work as it stands, and ship reaches its gate on their word — approved, filed, and told why the findings are still open",
    async () => {
      const { repo, id } = await at.atTheCap();
      assert.deepEqual(
        [await statusOf(id, 'review'), await statusOf(id, 'ship')],
        ['rounds exhausted', 'pending'],
        'it never reaches its gate',
      );
      await assert.rejects(stage.runWith(e(), approveRun(id, 'ship')), refusedNaming('ship is not at its gate yet'));
      const { acceptance } = await stage.runWith(e(), acceptRun(id, 'review', ENOUGH));
      assert.deepEqual(
        (await at.pass(id)).filed,
        [],
        'accepted, the loop ends; the ending is approved before it is filed, so it goes to its gate',
      );
      const l = await listed(id);
      assert.deepEqual([l.steps.find((x) => x.name === 'ship')!.status, l.toDecide?.kind], ['awaiting approval', 'approve']);
      const { decision: d, offers, accepted } = await stage.runWith(e(), decideRun(id));
      assert.deepEqual(
        [d.kind === 'awaiting' && d.awaitingApproval, offers],
        [['ship'], []],
        'the gate is left to decide, and no round offered',
      );
      assert.deepEqual(accepted, { review: `accepted as it stands ${acceptance.at.slice(11, 16)}Z, its findings open — "${ENOUGH}"` });
      await stage.runWith(e(), approveRun(id, 'ship', 'Merge it; the findings are follow-up.'));
      assert.deepEqual((await at.pass(id)).filed, ['ship']);
      const brief = tasks.get(`${id}-ship`)!.spec.brief;
      assert.match(brief, /\n## Accepted\n/, 'approved, it is told why it is shipping work a reviewer had more to say about');
      assert.match(brief, /review judged this work and asked for another round after the 1 `rounds: 1` allows\./);
      assert.ok(brief.includes(ENOUGH), brief);
      assert.equal(tasks.get(`${id}-ship`)!.spec.cwd, repo, "and filed in the repository's own checkout as ever");
    },
  );

  await s.test(
    "a send-back at the ending's gate spends the acceptance: the loop is open again, its findings with it, and the work goes back to the reviewer",
    async () => {
      const { id } = await at.atTheCap();
      await stage.runWith(e(), acceptRun(id, 'review', ENOUGH));
      await at.pass(id);
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      const { ask } = await stage.runWith(
        e(),
        retryRun(id, 'review', { mode: 'continue', message: "the second finding is this run's after all" }),
      );
      assert.deepEqual([ask.step, ask.try], ['review', 2]);
      const sent = await at.pass(id);
      assert.deepEqual([sent.tried, sent.filed], [['review'], []]);
      assert.equal(readRun(id).acceptances, undefined, 'spent by the try after it, as an approval is');
      assert.ok(fs.existsSync(path.join(ROOT, 'runs', `${id}.asks`, 'done', 'accept-review-1')), 'and moved whole');
      assert.doesNotMatch(tasks.get(`${id}-review-try2`)!.spec.brief, /## Accepted/, 'the reviewer is not told its own loop was ended');
      await assert.rejects(
        stage.runWith(e(), acceptRun(id, 'review', ENOUGH)),
        refusedNaming("round 1 of review's loop is still running"),
        'on the new try, the acceptance that ended the old one opens nothing',
      );
    },
  );

  await s.test(
    'a loop out of rounds is sent to merge without `nemia retry --round`: the merge spends no round, a round or an acceptance is REFUSED while it is asked, and the reviewer after it hands on to the gate',
    async () => {
      const { repo, id } = await at.atTheCap();
      const sha = at.mainMoves(repo);
      const { ask } = await stage.runWith(e(), mergeRun(id, 'review'));
      assert.deepEqual([ask.round, ask.merge.sha], [1, sha]);
      const written = at.asksOf(id);
      const waits = (verb: string) => (err: Error & { exitCode?: number }) => {
        assert.equal(err.exitCode, 2);
        assert.match(err.message, /^a merge of main into implement's work is asked \(at \S+\)/);
        for (const fact of [
          'the next tick files it once, on round 1: ',
          " merge-implement-2, in the run's .asks directory",
          ` — then: ${verb}.`,
        ])
          assert.ok(err.message.includes(fact), `${err.message} names ${fact}`);
        assert.deepEqual(at.asksOf(id), written, 'nothing written');
        return true;
      };
      await assert.rejects(stage.runWith(e(), roundRun(id, 'review')), waits(`nemia retry ${id} review --round`));
      await assert.rejects(stage.runWith(e(), acceptRun(id, 'review', ENOUGH)), waits(`nemia approve ${id} review --message "<why>"`));
      assert.deepEqual((await at.pass(id)).looped, ['review']);
      assert.deepEqual(
        readRun(id).steps.implement.tries?.map((x) => x.cause),
        ['merge'],
        'the merge is filed, as asked',
      );
      assert.equal(roundOf(readRun(id), 'review'), 1);
      settle(`${id}-implement-try2`, 'succeeded', SIGNED);
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: false });
      await at.pass(id);
      assert.equal(await statusOf(id, 'ship'), 'awaiting approval');
      assert.equal(roundOf(readRun(id), 'review'), 1, 'still round 1 of 1');
    },
  );
});

test('`nemia refresh --base` of the base into the work: refused where nothing conflicts as text, asked where it does, and asked where the landing check refused the merged tree — the conflict is semantic', async (t) => {
  const s = story(t);
  const { tasks, settle } = stage.board();

  await s.test(
    "REFUSED: a merge asked of quick's shape — a review that passed and an ungated landing not yet filed — which the run files on the next tick",
    async () => {
      for (const base of ['moved', 'clean'] as const) {
        const { repo, id } = await at.workDone(at.ungatedFolder());
        if (base === 'moved') at.mainMoves(repo);
        settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
        assert.ok(!readRun(id).steps.ship?.taskId, 'the landing is not filed yet: the next pass files it');
        fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
        await assert.rejects(
          stage.runWith(e(), mergeRun(id)),
          mergeRefused(id, 'ship has no gate', 'the next tick', 'once review passes', `nemia refresh ${id} review --base.`),
          `the base ${base}`,
        );
      }
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work whose trial merge onto the base is clean — nothing to merge, and the refusal says to approve the landing',
    async () => {
      const { id, branch } = await at.workDone(at.loopingFolder());
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: false });
      await at.pass(id);
      fs.mkdirSync(path.join(ROOT, 'runs', `${id}.asks`), { recursive: true });
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `approve the landing: nemia approve ${id} ship.`),
      );
    },
  );

  await s.test('REFUSED at shipped defaults: a merge of a run with no loop says to send its result step back', async () => {
    const repo = at.aRepo();
    const run = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: at.folder() }));
    await at.pass(run.id);
    settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await at.pass(run.id);
    at.mainMoves(repo);
    fs.mkdirSync(path.join(ROOT, 'runs', `${run.id}.asks`), { recursive: true });
    await assert.rejects(
      stage.runWith(e(), mergeRun(run.id)),
      mergeRefused(run.id, 'implement closes no loop', `nemia retry ${run.id} implement --message "merge main, keeping both meanings".`),
    );
  });

  await s.test(
    "a merge past round 1 owes no replies: the target's merge try is handed no findings, and its empty list signs it off, so review is filed after it",
    async () => {
      const { repo, id } = await at.workDone(at.loopingFolder(2));
      settle(`${id}-review`, 'succeeded', { ...SIGNED, again: true });
      await at.pass(id);
      const unsigned = 'A closeout without it, or with an empty list, is unsigned.';
      assert.ok(tasks.get(`${id}-implement-try2`)!.spec.brief.includes(unsigned), 'round 2 of a round owes its replies');
      settle(`${id}-implement-try2`, 'succeeded', { ...SIGNED, replies: [{ finding: 'sub', answer: 'fixed', why: 'kept it' }] });
      await at.pass(id);
      settle(`${id}-review-try2`, 'succeeded', { ...SIGNED, again: true });
      assert.deepEqual((await at.pass(id)).filed, [], 'out of rounds at round 2 of 2');
      at.mainMoves(repo);
      await stage.runWith(e(), mergeRun(id, 'review'));
      assert.deepEqual((await at.pass(id)).looped, ['review']);
      assert.equal(roundOf(readRun(id), 'review'), 2);
      const brief = tasks.get(`${id}-implement-try3`)!.spec.brief;
      assert.ok(brief.includes('You were handed no findings this round.'), brief);
      assert.ok(!brief.includes(unsigned), brief);
      settle(`${id}-implement-try3`, 'succeeded', { ...SIGNED, replies: [] });
      await at.pass(id);
      assert.ok(tasks.has(`${id}-review-try3`), 'the merge try signed off with no replies, and review reads the merge');
    },
  );

  let refused: Awaited<ReturnType<typeof at.refusedOnBase>>;

  await s.test(
    'nemia decide reads the semantic conflict live at an ending whose landing check refused the merged tree: clean as text, refused on the base as it is',
    async () => {
      refused = await at.refusedOnBase();
      const { id, base, checkId } = refused;
      const { collisions, toDecide } = await stage.runWith(e(), decideRun(id));
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
    },
  );

  await s.test(
    'nemia decide offers the merge of work its landing check refused, saying the conflict is semantic, and `nemia refresh --base` says what it asked; the former `nemia merge` still runs as it, and plain `nemia refresh` asks no merge',
    async (st) => {
      const { id, base } = refused;
      assert.deepEqual(
        (await stage.runWith(e(), decideRun(id))).commands.filter((c) => c.label === 'refresh'),
        [
          {
            label: 'refresh',
            command: `nemia refresh ${id} review --base`,
            said: `review: implement's work merges cleanly onto main, but ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic. Merge main into it and fix what broke — implement continued, then a new review, on round 1, which the merge does not spend:  nemia refresh ${id} review --base`,
            step: 'review',
          },
        ],
      );
      const printed = await at.printedBy(st, ['refresh', id, '--base']);
      assert.ok(
        printed[0]?.includes(
          `asked: merge main at ${base.slice(0, 7)} into implement's work, where ship's check refused the merged tree at ${base.slice(0, 7)}: the conflict is semantic — the next tick files it`,
        ),
        printed.join('\n'),
      );
      assert.equal(asks(id).length, 1, 'the merge ask `nemia merge` wrote');
      assert.equal(printed[1]?.trim(), path.join(ROOT, 'runs', `${id}.asks`, asks(id)[0]), 'and the file it is in');
      await assert.rejects(
        at.printedBy(st, ['merge', id]),
        refusedNaming("into implement's work is already asked", `nemia ls ${id}`),
        'the former spelling, typed on purpose: `nemia merge` still runs, as `nemia refresh --base`, which waits on the merge just asked',
      );
      await assert.rejects(
        at.printedBy(st, ['refresh', id]),
        refusedNaming('already on the newest revision of every kind'),
        '`nemia refresh` without `--base` still takes the new revisions, of which this run has none',
      );
      assert.equal(asks(id).length, 1, 'no second merge is asked');
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work that merges cleanly onto a base moved since its landing check refused it is nothing to merge, in the words of any clean trial merge; a base that moves into a conflict is a merge as text',
    async () => {
      const { repo, id, branch } = await at.refusedOnBase();
      fs.writeFileSync(path.join(repo, 'mul.ts'), 'export const mul = (a, b) => a * b;\n');
      world().commit(repo, 'mul');
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `land it again: nemia retry ${id} ship.`),
      );
      const sha = at.mainMoves(repo);
      const { ask } = await stage.runWith(e(), mergeRun(id));
      const merge = { target: 'implement', try: 2, onto: 'main', sha };
      assert.deepEqual(ask.merge, merge, 'no landing: its check refused another commit of the base');
      assert.deepEqual(
        runStore.asks.read(id).rounds.map((a) => a.merge),
        [merge],
      );
    },
  );

  await s.test(
    'REFUSED at shipped defaults: a merge of work that merges cleanly whose landing check did not finish is nothing to merge',
    async () => {
      const { id, branch } = await at.refusedOnBase(false);
      const landed = readRun(id).steps.ship.landed;
      assert.ok(landed && 'aborted' in landed && !('refusedOn' in landed), JSON.stringify(landed));
      await assert.rejects(
        stage.runWith(e(), mergeRun(id)),
        mergeRefused(id, `${branch} merges cleanly onto main`, 'nothing to merge', `land it again: nemia retry ${id} ship.`),
      );
    },
  );
});
