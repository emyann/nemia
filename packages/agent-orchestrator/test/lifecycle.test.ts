/**
 * A run's life on disk, told as a person's stories: a chain that runs to success, a diamond that fans out and in, and a step that fails
 * before a run is cancelled. Each story is one test on the stage (`story.ts`): `nemia start` writes the record, the tick files and hands
 * off each step on the engine's stand-in and the test place, and the verbs read what is there. What `assess`, `cancelPlan`, a brief,
 * `workspacePlan`, `cutName` and `handOffDue` decide is pure, in `assess-lifecycle.test.ts`; the order of a record's steps and a run's id
 * in `src/record/record.test.ts`. The races of a cancel with a tick and the crash windows of a pass stay focused in `store.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in repositories no factory holds.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { Run } from '../src/run.ts';
import type { PlaceOutcome } from '../src/place/place.ts';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { namesFor } from './assessed.ts';
import { placeOver, unreadBy } from './place-over.ts';

const ROOT = scratch('wf-lifecycle-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { advanceRun, cancelRun, decideRun, list, startRun, stepsOf, runWith } = await import('../src/runner.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { LINE_NAME } = await import('../src/run.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const world = () => stage.place().world;
/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));
/** The brief the engine was filed with for the task `id`. */
const briefOf = (id: string): string => stage.board().tasks.get(id)!.spec.brief;
/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  world().repository(repo, {});
  return repo;
};
/** A workflow folder of `steps`, each its file's frontmatter lines past `place: git`, and its body `<name> it`. */
const folderOf = (steps: Record<string, string[]>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, lines] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${['place: git', ...lines].join('\n')}\n---\n${name} it\n`);
  return dir;
};
/** The paths `checkout` holds uncommitted, a line each. */
const uncommitted = (checkout: string): string => world().changes(checkout).join('\n');
/** The first line of the message of each commit the checkout's head follows, itself first, a merge's first parent first. */
const subjects = (checkout: string): string[] => {
  const seen: string[] = [];
  const next = [world().head(checkout)];
  while (next.length) {
    const at = next.shift()!;
    if (seen.includes(at)) continue;
    seen.push(at);
    next.push(...world().read(checkout, at).parents);
  }
  return seen.map((id) => world().read(checkout, id).message.split('\n')[0]);
};
/** What `console.log` printed while `run` ran, a line each. */
const printedBy = async (t: TestContext, run: () => Promise<unknown>): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await run();
  } finally {
    log.mock.restore();
  }
  return out.join('\n').split('\n');
};
/** The step names `nemia ls <id>` prints, in its order. */
const lsNames = async (t: TestContext, id: string): Promise<string[]> =>
  (await printedBy(t, () => stage.main(['ls', id])))
    .slice(1)
    .map((line) => /^ {3}([a-z][\w-]*) /.exec(line)?.[1])
    .filter((name): name is string => Boolean(name));
/** The step sections `nemia decide <id>` prints, in its order. */
const decideNames = async (t: TestContext, id: string, steps: readonly string[]): Promise<string[]> =>
  (await printedBy(t, () => stage.main(['decide', id]))).filter((l) => steps.includes(l.trim()) && /^ {2}\S/.test(l)).map((l) => l.trim());
/** The test place, its `verb` answering `outcome`, each call counted, as the layer a pass is given it by. */
const placeAnswering = <V extends 'make' | 'handoff'>(verb: V, outcome: PlaceOutcome<V>) => {
  let asked = 0;
  const answer = () => {
    asked += 1;
    return outcome;
  };
  return { layer: PlaceService.layer(placeOver(stage.place().place, { [verb]: answer })), asked: () => asked };
};

test('a chain runs to success: plan → implement → review, on one line of work', async (t) => {
  const s = story(t);
  let id = '';
  let line = '';
  const ORDER = ['plan', 'implement', 'review'];
  await s.test('`nemia start` says the steps in the order they run, and keys the record so, whose files sort another way', async () => {
    const dir = folderOf({ implement: ['after: plan'], plan: [], review: ['after: implement', 'check: npm test'] });
    const printed = await printedBy(t, () => stage.main(['start', 'plan the flag', '--workflows', dir, '--repo', aRepo()]));
    const [started, said] = printed[0].split('  ');
    id = started;
    assert.equal(said, '3 step(s): plan → implement → review');
    const run = readRun(id);
    assert.deepEqual([Object.keys(run.steps), run.workflow?.map((x) => x.name)], [ORDER, ORDER]);
  });
  await s.test("the first pass files only the root, cut under the run's own name, told its prose and the request", async () => {
    const pass = await tick(id);
    assert.deepEqual([pass.filed, pass.status], [['plan'], 'running']);
    const plan = readRun(id).steps.plan;
    line = path.join(ROOT, 'worktrees', id, LINE_NAME);
    assert.equal(plan.workspace, line, 'one worktree per card, named for the run');
    assert.equal(plan.branch, `wf/${id}/${LINE_NAME}`, 'and one branch, which is what a pull request on GitHub reads');
    const brief = briefOf(`${id}-plan`);
    assert.match(brief, /plan it/);
    assert.match(brief, /plan the flag/, 'the request travels to every step');
    assert.doesNotMatch(brief, /Where to look/, 'nothing is said of a workspace nobody has touched');
  });
  await s.test('while the root works, a pass files nothing, however many times it looks', async () => {
    stage.board().settle(`${id}-plan`, 'running');
    for (const _ of [1, 2]) assert.deepEqual([(await tick(id)).filed, (await tick(id)).status], [[], 'running']);
    assert.deepEqual(stage.board().filings, [`${id}-plan`]);
  });
  await s.test('the root signs off: its work is handed off, and the next step filed on its line, pointed at the work', async () => {
    fs.writeFileSync(path.join(line, 'plan.txt'), 'the plan\n');
    stage.board().settle(`${id}-plan`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).filed, ['implement'], 'filed once the step before it SUCCEEDED');
    assert.match(subjects(line)[0], /^plan: hand off/);
    assert.equal(uncommitted(line), '');
    const implement = readRun(id).steps.implement;
    assert.deepEqual([implement.workspace, implement.branch], [line, `wf/${id}/${LINE_NAME}`], 'the line, inherited');
    const brief = briefOf(`${id}-implement`);
    assert.match(brief, /Where to look/);
    assert.match(brief, /plan/, 'told who was here before it');
    assert.match(brief, /not an account of it/, 'and that it judges the change, not a claim');
  });
  await s.test(
    "implement signs off: handed off, review filed in the same checkout, and review's work in progress is review's",
    async () => {
      fs.writeFileSync(path.join(line, 'feature.txt'), 'work\n');
      stage.board().settle(`${id}-implement`, 'succeeded', SIGNED);
      assert.deepEqual((await tick(id)).filed, ['review']);
      assert.match(subjects(line)[0], /^implement: hand off/);
      fs.writeFileSync(path.join(line, 'half-reviewed.txt'), 'wip\n');
      await tick(id);
      assert.match(uncommitted(line), /half-reviewed\.txt/, "not committed under implement's name");
    },
  );
  await s.test("review signs off: handed off, then its check filed — the suite's litter stays off the branch, by either step", async () => {
    stage.board().settle(`${id}-review`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).checked, ['review']);
    assert.match(subjects(line)[0], /^review: hand off/, 'the pass hands review off, then files its check on that tree');
    assert.match(world().changed(line, world().head(line)).join('\n'), /half-reviewed\.txt/);
    fs.writeFileSync(path.join(line, 'coverage.out'), 'litter\n');
    stage.board().settle(`${id}-review-check`, 'running');
    await tick(id);
    await tick(id);
    assert.match(uncommitted(line), /coverage\.out/, 'left untracked');
  });
  await s.test('`nemia ls` names the steps in the order they run', async () => {
    assert.deepEqual(await lsNames(t, id), ORDER);
  });
  await s.test('the check passes: the run succeeded, each step handed off once, and `nemia decide` reads in order', async () => {
    stage.board().settle(`${id}-review-check`, 'succeeded', undefined, 0);
    const last = await tick(id);
    assert.equal(last.status, 'succeeded');
    const handed = subjects(line)
      .filter((x) => / hand off/.test(x))
      .map((x) => x.split(':')[0]);
    assert.deepEqual(handed, ['review', 'implement', 'plan'], 'one hand-off per finished step');
    const { decision: d } = await stage.runWith(stage.board().e, decideRun(id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed], ['succeeded', []]);
    assert.deepEqual(await decideNames(t, id, ORDER), ORDER);
  });
  await s.test(
    "a record keyed in the folder's order, its workflow frozen so or not at all, reads, lists and decides in the steps' order",
    async () => {
      const folderOrder = ['implement', 'plan', 'review'];
      const run = readRun(id);
      for (const frozen of [true, false]) {
        const legacyId = `${id}-${frozen ? 'frozen' : 'unfrozen'}`;
        const { workflow, steps, ...rest } = run;
        fs.writeFileSync(
          path.join(ROOT, 'runs', `${legacyId}.json`),
          JSON.stringify({
            ...rest,
            id: legacyId,
            ...(frozen ? { workflow: folderOrder.map((name) => workflow!.find((x) => x.name === name)) } : {}),
            steps: Object.fromEntries(folderOrder.map((name) => [name, steps[name]])),
          }),
        );
        const legacy = readRun(legacyId);
        assert.deepEqual([Object.keys(legacy.steps), legacy.workflow?.map((x) => x.name)], [folderOrder, frozen ? folderOrder : undefined]);
        assert.deepEqual(
          stepsOf(legacy).map((x) => x.name),
          ORDER,
          legacyId,
        );
        assert.deepEqual(
          (await stage.runWith(stage.board().e, list(stage.board().e, legacy))).steps.map((x) => x.name),
          ORDER,
          legacyId,
        );
        assert.deepEqual(await lsNames(t, legacyId), ORDER, legacyId);
        if (frozen) assert.deepEqual(await decideNames(t, legacyId, ORDER), ORDER, legacyId);
      }
    },
  );
});

test('a diamond fans out and in: two roots side by side, and a step after both that holds their merged work', async (t) => {
  const s = story(t);
  let id = '';
  await s.test('the two roots are filed together, each in a directory of its own', async () => {
    const dir = folderOf({ a: [], b: [], join: ['after: a, b'] });
    id = (await stage.runPlaced(startRun({ brief: 'split the work', repo: aRepo(), workflowDir: dir }))).id;
    assert.deepEqual([...(await tick(id)).filed].sort(), ['a', 'b'], 'a DAG, not a queue');
    const { a, b } = readRun(id).steps;
    assert.deepEqual(
      [a.workspace, a.branch, b.workspace, b.branch],
      [path.join(ROOT, 'worktrees', id, LINE_NAME), `wf/${id}/${LINE_NAME}`, path.join(ROOT, 'worktrees', id, 'b'), `wf/${id}/b`],
      "the first root is the run's line; the second another line, under its own step name: two sessions never share a directory",
    );
  });
  await s.test('the fan-in waits while one root still works', async () => {
    const { a, b } = readRun(id).steps;
    fs.writeFileSync(path.join(a.workspace!, 'shared.txt'), 'from a\n');
    fs.writeFileSync(path.join(b.workspace!, 'shared.txt'), 'from b\n');
    fs.writeFileSync(path.join(b.workspace!, 'only-b.txt'), 'b alone\n');
    stage.board().settle(`${id}-a`, 'succeeded', SIGNED);
    stage.board().settle(`${id}-b`, 'running');
    assert.deepEqual((await tick(id)).filed, [], 'join waits for BOTH');
  });
  await s.test(
    "both done: the fan-in is cut on its own, merging both, and told the merged work and the conflicts in the place's words",
    async () => {
      stage.board().settle(`${id}-b`, 'succeeded', SIGNED);
      assert.deepEqual((await tick(id)).filed, ['join']);
      const join = readRun(id).steps.join;
      assert.deepEqual([join.workspace, join.branch], [path.join(ROOT, 'worktrees', id, 'join'), `wf/${id}/join`]);
      assert.match(subjects(join.workspace!)[0], /^a: hand off/, 'cut from a, the first of its `after` in order');
      assert.equal(world().staged(join.workspace!), world().tip(join.workspace!, `wf/${id}/b`), "b's work merged into it, left staged");
      assert.equal(fs.readFileSync(path.join(join.workspace!, 'only-b.txt'), 'utf8'), 'b alone\n');
      const brief = briefOf(`${id}-join`);
      assert.match(brief, /work of a and b has been merged/);
      assert.match(brief, /- shared\.txt\n/);
      assert.ok(brief.includes(stage.place().place.declared.say.conflicts), "the place's words for seeing them");
    },
  );
  await s.test('REFUSED at shipped defaults: a make that answers a workspace other than the one asked is read as not heard', async () => {
    const elsewhere = scratch('wf-lifecycle-elsewhere-');
    const run = await stage.runPlaced(startRun({ brief: 'split the work', repo: aRepo(), workflowDir: folderOf({ a: [] }) }));
    const place = placeAnswering('make', { answer: { workspace: elsewhere, branch: 'b', conflicts: [], notes: [] } });
    const at = path.join(ROOT, 'worktrees', run.id, LINE_NAME);
    for (const pass of [1, 2]) {
      const ticked = await stage.runWith(stage.board().e, advanceRun(readRun(run.id)).pipe(Effect.provide(place.layer)));
      assert.equal(ticked.notes.length, 1);
      namesFor(`pass ${pass}`, ticked.notes[0], 'a: not cut', elsewhere, at, 'asked again on the next pass');
      assert.deepEqual(ticked.filed, [], `pass ${pass}: nothing filed`);
      assert.ok(!('workspace' in readRun(run.id).steps.a), `pass ${pass}: the record holds no workspace, not even undefined`);
      assert.equal(place.asked(), pass, `pass ${pass}: the place was asked again`);
    }
    assert.deepEqual((await tick(run.id)).filed, ['a'], 'a place that answers where it was asked files the step');
    assert.equal(readRun(run.id).steps.a.workspace, at);
  });
  await s.test(
    'REFUSED by the place: a make it refuses, or that is not heard, files nothing and leaves no workspace or branch on the record',
    async () => {
      const run = await stage.runPlaced(startRun({ brief: 'split the work', repo: aRepo(), workflowDir: folderOf({ a: [] }) }));
      const outcomes: Array<[PlaceOutcome<'make'>, string[]]> = [
        [{ refused: 'no room' }, ['the place refused', 'no room']],
        [unreadBy('make', 'fatal: broke'), ["the place's make was not heard", 'fatal: broke', 'asked again on the next pass']],
      ];
      for (const [outcome, said] of outcomes) {
        const ticked = await stage.runWith(
          stage.board().e,
          advanceRun(readRun(run.id)).pipe(Effect.provide(placeAnswering('make', outcome).layer)),
        );
        assert.deepEqual([ticked.notes.length, ticked.filed], [1, []]);
        namesFor(said[0], ticked.notes[0], 'a: not cut', ...said);
        const a = readRun(run.id).steps.a;
        assert.ok(!('workspace' in a) && !('branch' in a), JSON.stringify(a));
      }
      assert.ok(!stage.board().filings.includes(`${run.id}-a`), 'nothing filed');
    },
  );
});

test('a failed step, then a cancelled run', async (t) => {
  const s = story(t);
  let failed = '';
  let workspace = '';
  await s.test('implement fails, leaving work in its checkout', async () => {
    const dir = folderOf({ implement: [], review: ['after: implement'] });
    const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false }));
    failed = run.id;
    workspace = run.workspace;
    await tick(failed);
    fs.writeFileSync(path.join(workspace, 'half-done.txt'), 'work\n');
    stage.board().settle(`${failed}-implement`, 'failed');
  });
  await s.test(
    'REFUSED by the place: a hand-off it refuses is not marked done — the notes say why, and the next pass asks again',
    async () => {
      const place = placeAnswering('handoff', { refused: 'a hook said no' });
      for (const pass of [1, 2]) {
        const ticked = await stage.runWith(stage.board().e, advanceRun(readRun(failed)).pipe(Effect.provide(place.layer)));
        assert.equal(ticked.notes.length, 1);
        namesFor(`pass ${pass}`, ticked.notes[0], 'implement: not handed off', 'a hook said no', 'asked again on the next pass');
        assert.equal(readRun(failed).steps.implement.handedOff, undefined, `pass ${pass}: not marked`);
        assert.equal(place.asked(), pass, `pass ${pass}: the place was asked`);
      }
      assert.match(uncommitted(workspace), /half-done\.txt/, 'the work is where the step left it');
    },
  );
  await s.test('the failed step is handed off, and blocks what waits on it: the run failed, and `nemia decide` names it', async () => {
    const pass = await tick(failed);
    assert.deepEqual([pass.filed, pass.status], [[], 'failed']);
    assert.equal(readRun(failed).steps.implement.handedOff, `${failed}-implement`);
    assert.equal(uncommitted(workspace), '');
    assert.match(subjects(workspace)[0], /^implement: hand off/);
    const { decision: d } = await stage.runWith(stage.board().e, decideRun(failed));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed], ['failed', ['implement']]);
  });
  await s.test('cancelling the failed run is no error, and does not relabel it', async () => {
    const { plan } = await stage.runWith(stage.board().e, cancelRun(failed));
    assert.deepEqual(plan, { kind: 'finished', status: 'failed' });
    assert.equal(readRun(failed).cancelledAt, undefined, 'nothing is written');
  });

  let id = '';
  let check = '';
  await s.test('a second run: one root signs off and its check runs, the other still queued', async () => {
    const dir = folderOf({ a: ['check: npm test'], b: [], join: ['after: a, b'] });
    id = (await stage.runPlaced(startRun({ brief: 'call it off', repo: aRepo(), workflowDir: dir }))).id;
    await tick(id);
    stage.board().settle(`${id}-a`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(id)).checked, ['a']);
    check = `${id}-a-check`;
    stage.board().settle(check, 'running');
  });
  await s.test("`nemia cancel` stops both — the running check and the queued step — and the mark outlives the pass's write", async () => {
    const file = path.join(ROOT, 'runs', `${id}.json`);
    const before = fs.readFileSync(file, 'utf8');
    const { plan } = await stage.runWith(stage.board().e, cancelRun(id));
    assert.deepEqual(plan, {
      kind: 'cancel',
      stop: [
        { name: 'a (check)', taskId: check },
        { name: 'b', taskId: `${id}-b` },
      ],
    });
    assert.deepEqual(stage.board().stopped, [check, `${id}-b`]);
    fs.writeFileSync(file, before);
    assert.ok(readRun(id).cancelledAt, 'the daemon wrote back the copy it read before the cancel, and the mark is in its own file');
  });
  await s.test('the next pass files nothing, and asks the engine to stop nothing it was asked to stop already', async () => {
    const pass = await tick(id);
    assert.deepEqual([pass.filed, pass.checked, pass.status], [[], [], 'cancelled']);
    assert.deepEqual(stage.board().stopped, [check, `${id}-b`], "the engine's record says the stop request is already on each task");
  });
  await s.test('cancelling again keeps the first time, and asks the engine nothing again', async () => {
    const first = readRun(id).cancelledAt;
    const { plan } = await stage.runWith(stage.board().e, cancelRun(id));
    assert.deepEqual(plan, {
      kind: 'already-cancelled',
      at: first,
      stop: [
        { name: 'a (check)', taskId: check },
        { name: 'b', taskId: `${id}-b` },
      ],
    });
    assert.equal(readRun(id).cancelledAt, first);
    assert.deepEqual(stage.board().stopped, [check, `${id}-b`], 'the engine would refuse the second ask');
  });
  await s.test('a step whose task the engine no longer has is unknown, not queued: cancelling stops nobody', async () => {
    const amnesia: Run = {
      ...readRun(failed),
      id: `${failed}-amnesia`,
      steps: { implement: { taskId: 't-forgotten' }, review: { taskId: null } },
    };
    fs.writeFileSync(path.join(ROOT, 'runs', `${amnesia.id}.json`), JSON.stringify(amnesia));
    const { plan } = await stage.runWith(stage.board().e, cancelRun(amnesia.id));
    assert.ok(plan.kind === 'finished' || plan.stop.length === 0, 'nothing reported as stopped');
    assert.deepEqual(stage.board().stopped, [check, `${id}-b`]);
  });
});
