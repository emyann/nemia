/**
 * What the stories of a run's ending share (`ship.test.ts`, `ship-after.test.ts`, `ship-back.test.ts`): a repository of the test place,
 * the folders whose last step merges, a run brought to its ending's gate, to its merge staged and signed, to an ending stopped on its
 * base branch or a loop out of rounds — each on the stage of the story telling it. A test file may not import another, so they live here.
 *
 * `endings(stage, root)` imports the runner, so a file calls it once it has set its environment: `WF_ROOT` at `root`, which the runner
 * reads as it loads. The team's agents and skills are copied beside every folder made under `root`, since the team's `ship.md` names
 * `agent: shipper`.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { RepositoryRun, Run, StepRecord } from '../src/run.ts';
import type { Engine } from '../src/runtime-client.ts';
import type { World } from '../place/memory/world.ts';
import type { Stage } from './story.ts';

/** The tests' team (`team.ts`, which this module may not import: it loads the package before a file sets its environment). */
const TEAM = path.join(import.meta.dirname, 'fixtures', 'team');
const TEAM_DEV = path.join(TEAM, 'dev');

/** The closeout of a step that did its work. */
export const SIGNED = { outcome: 'done', summary: 'did the work', artifacts: [], needs: null };
/** The closeout of an ending whose check refused. */
export const BLOCKED = { outcome: 'blocked', summary: 'the check refused', artifacts: [], needs: 'read the suite' };
/** The closeout of an ending that stopped on its base branch: the work does not hold on main as it is now. */
export const STOPPED = {
  outcome: 'blocked',
  summary: 'main moved since the branch was cut: the trial merge conflicts in add.ts, so I aborted it',
  artifacts: [],
  needs: "the branch has to take main: add.ts conflicts with main's sub",
};
/** The message an ending signs off with, to commit its merge with. */
export const MESSAGE = 'Add sub\n\nadd.ts exports sub beside add.\nThe run, its branch: 1 commit; the check on the merged tree.\n';
/** Why a person judged the loop's findings later work rather than this run's: what `nemia accept` carries to the shipper. */
export const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';
/** What the ship's check printed on the merged tree it refused, as turbo prefixes node's spec reporter: a test failed, listed twice. */
export const FAILING = [
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
export const refusedAs =
  (kind: string, ...fixes: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, kind, err.message);
    assert.equal(err.exitCode, 2);
    for (const fix of fixes) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
    return true;
  };

/** That a verb's refusal exits 2 and names each of `fixes`, whatever its kind. For `assert.rejects`. */
export const refusedNaming =
  (...fixes: string[]) =>
  (err: Error & { exitCode?: number }): true => {
    assert.equal(err.exitCode, 2, err.message);
    for (const fix of fixes) assert.ok(err.message.includes(fix), `${err.message} names ${fix}`);
    return true;
  };

/** A step's record without the revisions every filing pins (`pinned`, `closeoutHash`), whose subject is `revisions.test.ts`. */
export const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
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
export async function endings(stage: Stage, root: string) {
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
    /** Whether `branch` of `r` is shipped, its standing asked now, as a person's verb asks it (`standingLive`). */
    isShipped: async (r: RepositoryRun, branch: string) => (await stage.runPlaced(standingLive([r]))).shipped(r, branch),
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
