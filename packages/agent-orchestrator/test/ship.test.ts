/**
 * The end of a run, on disk: a workflow whose last step merges, in a repository of the test place, which starts no process. One run's
 * ending, told as stories: a run to its ending's gate, approved, merged and landed on its check, and a run `--after` it; a landing read
 * again after a restart, a pause or a person's hand; a record an older nemia wrote; a place that reads the checkout oddly; and an ending
 * that stops on its own word or whose check refuses the merged tree. Two runs of one repository and a result merged by hand are in
 * `ship-after.test.ts`, the send-back from an ending and `nemia merge` in `ship-back.test.ts`.
 *
 * What a gate means to `assess`, `listing` and `decision` is pure, and lives in `assess-endings.test.ts`. What the test place does not
 * model — git's own words to a landing session, a hook, an octopus, a linked worktree, a `git` planted on the PATH — is in
 * `ship-git.boundary.test.ts`, and an install in the checkout in `ship-install.boundary.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: the module reads it as it loads. A run on a repository no factory holds goes to the
 * default factory (`WF_DEFAULT_FACTORY_STARTS`), and a command that ticks starts no daemon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { placeOver, unreadBy } from './place-over.ts';
import { BLOCKED, endings, MESSAGE, SIGNED } from './endings.ts';

const ROOT = scratch('wf-ship-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  advanceRun,
  approveRun,
  artifactsDir,
  decideRun,
  forgetRun,
  list,
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

const world = () => stage.place().world;
/** A screen with each time of day the engine's stand-in stamped put back as `<t>`: it files and settles on the wall clock. */
const timeless = (lines: string[]): string[] => lines.map((l) => l.replace(/\b\d\d:\d\d:\d\dZ\b/g, '<t>'));
const listed = (id: string) => stage.runWith(stage.board().e, list(stage.board().e, readRun(id)));
const shipOf = async (id: string) => (await listed(id)).steps.find((s) => s.name === 'ship')!;

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
      assert.equal(await at.isShipped(at.repositoryRun(readRun(id)), branch), false);
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
      assert.equal((await stage.runWith(e, decideRun(id))).decision.kind, 'shipped');
    },
  );

  await s.test(
    "a run --after it is handed what its work said, not what its ending said: the ending's account is of the merge, and it declares nothing",
    async () => {
      const child = await stage.runPlaced(startRun({ brief: 'read the flag', repo, workflowDir: at.oneStep(), after: [id] }));
      assert.deepEqual((await at.pass(child.id)).filed, ['implement'], 'the parent shipped, so the child is filed');
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
      assert.equal((await stage.runWith(stage.board().e, decideRun(id))).decision.kind, 'shipped');
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
        const place = answeringPlace({ merging: 'other', conflicted: false, missing: [], head: base });
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
      for (const phase of ['pending', 'running'] as const) {
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
      assert.equal(await at.isShipped(at.repositoryRun(readRun(id)), branch), false);
      const { decision } = await stage.runWith(e, decideRun(id));
      assert.equal(decision.kind, 'awaiting');
      if (decision.kind !== 'awaiting') return;
      assert.deepEqual([decision.outcome, decision.stuck, decision.branches], ['blocked', ['ship'], [branch]]);
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
        '    ship: failed (check) — nothing landed on main: its check refused the merge (exit 1). Ship again, when what stopped it was not the work — a dirty checkout, a flaky test. Continue its session, told what happened:  nemia retry <id> ship  (--fresh, or --model <m>, for a new session)',
      ),
      '    check  npm test && npm run typecheck && npm run lint  →  exit 1 ✗',
      ...shipBelow,
      "  semantic  merges cleanly onto main, and ship's landing check refused the merged tree at <base>: a conflict of meaning, not of text",
    ]);
  });
});
