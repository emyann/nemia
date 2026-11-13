/**
 * A run's decision (`decisionRead`, what `GET /api/runs/:runId/decision` serves and the client's `nemia decide` prints), told as a
 * person's stories on the test place (`story.ts`): a run waiting on you read and landed, with the endings and gates that decide what
 * approving it does; a step retried, answered, over its budget and nudged; and a run on two branches read side by side. Each fact is read
 * off the read model — what the branch touched, the lesson, the check-affecting files in full, what each step consumed and where its time
 * went — never off a screen: the lines a person reads of it are the client's (`apps/cli/test/decide.test.ts`). The test place says a
 * branch's commands in words of its own; a rename and a binary file, a lint config's diff and the git processes `nemia ls` costs are read
 * on git in `screens-git.boundary.test.ts`. A program's answer equal to its plain face is in `faces.test.ts`.
 *
 * The test's store is its own, at `ROOT`, given as `ENV`.
 */
import type { StoreRoot } from '../src/config/root.store.ts';
import type { StoreConfig } from '../src/config/config.store.ts';
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryRun, Run } from '../src/run.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Decided } from '../src/decide/decide.verb.ts';
import type { DecisionRead } from '../src/decide/decision.verb.ts';
import type { Decidable } from 'objects';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService } from '../src/runtime-client.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import type { EnginePhase } from '../src/views/views-words.ts';
import { scratch } from 'test-kit/scratch';
import { decidedOn, decisionOf, decisionOn } from './screens.ts';
import { placeOver, unreadBy } from './place-over.ts';
import { staged, story } from './story.ts';
import {
  advanceRun,
  changesOf,
  consumption,
  countsLine,
  decideRun,
  dueNote,
  isRepositoryRun,
  lessonLine,
  retryRun,
  signoffsSpent,
  startRun,
  runWith,
  tryNote,
} from '../src/runner.ts';
import { listRuns, runRecord } from '../src/record/record.store.ts';
import { passStanding } from '../src/standing/standing.verb.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import { lsLines, type RunsListed } from '../src/list/list.ts';
import { typed } from './typed.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-decide-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };

const stage = staged({ runWith, main, engineOf, env: ENV });

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = () => stage.runWith(stage.board().e, passStanding(listRuns(ROOT)));

/** A run this file started on a repository, as `changesOf` reads one: a repository run. */
const repositoryRun = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

const ADD = 'export const add = (a, b) => a + b;\n';
const TEST = "import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n";

/** A repository on the test place with a workspace package that has a source file and a test. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {
    'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
    'packages/x/src/add.ts': ADD,
    'packages/x/test/add.test.ts': TEST,
  });
  return repo;
};

/** `files` written into the step's workspace and committed there, as its session commits its work. */
const commitIn = (dir: string, files: Record<string, string>, message = 'the work') => {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  stage.place().world.commit(dir, message);
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const USAGE = { responses: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 };
const blocked = (needs: string, summary = 'two readings') => ({ outcome: 'blocked', summary, artifacts: [], needs });

const T0 = Date.parse('2026-09-13T00:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
/**
 * The task `id` settled in `phase`, its clock laid as a board's: the n-th task its run filed is filed 10n minutes after the board's
 * midnight, its attempt started 5 s and spawned 12 s after that, and ended 5 minutes after filing; `end` is laid over the attempt.
 */
const settle = (
  id: string,
  phase: EnginePhase,
  end: { closeout?: unknown; usage?: object; exitCode?: number; closedOut?: boolean } = {},
) => {
  const run = id.replace(/-(implement|review|ship|land|docs|supervise|work).*$/, '');
  const n = stage
    .board()
    .filings.filter((f) => f.startsWith(`${run}-`))
    .indexOf(id);
  const at = T0 + n * 600_000;
  stage.board().tasks.get(id)!.filedAt = iso(at);
  stage.board().end(id, phase, {
    startedAt: iso(at + 5_000),
    spawnedAt: iso(at + 12_000),
    endedAt: iso(at + 300_000),
    ...(end.closeout === undefined ? {} : { closeout: end.closeout }),
    ...(end.usage === undefined ? {} : { usage: end.usage }),
    ...(end.exitCode === undefined ? {} : { exitCode: end.exitCode }),
    ...(end.closedOut === undefined ? {} : { closedOut: end.closedOut }),
  });
};

/**
 * `implement`, checked by `npm test` and with whatever other keys it is given, each ending with a newline, then `review`, with no
 * check.
 */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** A folder of `implement`, then `last`, its ending, gated and on the base branch, its body `body`, led by `agent` where one is named. */
const ending = (last: string, body: string, agent?: string, under = ROOT): string => {
  const dir = fs.mkdtempSync(path.join(under, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const keys = ['after: implement', 'place: git', 'workspace: base', 'gate: true', ...(agent ? [`agent: ${agent}`] : [])];
  fs.writeFileSync(path.join(dir, `${last}.md`), `---\n${keys.join('\n')}\n---\n${body}`);
  return dir;
};

/**
 * A run waiting on you: implement verified, with usage; review unverified, with none. Its implement weakened a test, added to a source
 * file and wrote a lesson in CLAUDE.md, committed in its own workspace, on the branch the place cut for it.
 */
const awaiting = async (implementKeys = '') => {
  const repo = aRepo();
  const run = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder(implementKeys) }));
  await tick(run.id);
  const work = runRecord(ROOT, run.id).steps.implement;
  commitIn(work.workspace!, {
    'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n`,
    'packages/x/test/add.test.ts': "import assert from 'node:assert';\nassert.ok(true);\n",
    'CLAUDE.md': 'lesson one\nlesson two\n',
  });
  settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED, usage: USAGE });
  await tick(run.id);
  settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
  await tick(run.id);
  settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED });
  const record = runRecord(ROOT, run.id);
  return { run: repositoryRun(record), repo, branch: record.steps.review.branch! };
};

/** The ending's own words, as the folder writes them: what `nemia decide` echoes as what approving it does. */
const SHIP_IT = "Ship it: trial merge this run's result branch onto main, run the check, and commit.";

/** The run's own verdicts, as its reading judged them: refused where the run awaits no person. */
type Awaiting = Extract<Decided['decision'], { kind: 'awaiting' }>;

/**
 * Run `id`'s decision on this file's stage (`decisionOn`), the globs `sensitive` names read in full: what there is to decide (`Decidable`),
 * the read it came of, and the package's whole reading of the run — refused where it is not a decision a person makes.
 */
const decidable = async (id: string, sensitive?: readonly string[]): Promise<{ d: Decidable; read: DecisionRead; decided: Decided }> => {
  const read = await decisionOn(stage, id, sensitive);
  assert.ok('touched' in read.decision && read.decided !== undefined, JSON.stringify(read.decision));
  return { d: read.decision, read, decided: read.decided };
};

/** The verdicts of `decided`, a run waiting on a person. */
const awaitingOf = (decided: Decided): Awaiting => {
  assert.equal(decided.decision.kind, 'awaiting', JSON.stringify(decided.decision));
  return decided.decision;
};

/** The command of `d` labelled `label`, refused where it offers none. */
const offered = (d: Decidable, label: Decidable['commands'][number]['label']): string => {
  const command = d.commands.find((c) => c.label === label)?.command;
  assert.ok(command !== undefined, `${label} is offered: ${JSON.stringify(d.commands)}`);
  return command;
};
/** What `nemia ls <id>` reads of the run, in the lines the list's own words make of it (`lsLines`). */
const listed = async (_t: TestContext, id: string): Promise<string[]> =>
  lsLines((await typed(['ls', id], stage.board().e, undefined, stage.place().place, ENV)) as RunsListed, Date.now());

/** An approval as `nemia approve` writes one: a file of a person's beside the retry asks. */
const approveByHand = (id: string, step: string, n: number) => {
  const dir = path.join(ROOT, 'runs', `${id}.asks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `approve-${step}-${n}`),
    `${JSON.stringify({ step, try: n, at: '2026-09-17T10:00:00.000Z' }, null, 2)}\n`,
  );
};

const indexOf = (lines: string[], want: string | RegExp): number => {
  const i = lines.findIndex((l) => (typeof want === 'string' ? l === want : want.test(l)));
  assert.ok(i >= 0, `${want} is on the screen:\n${lines.join('\n')}`);
  return i;
};

test('a run waiting on you, read and landed: its screens, and what approving its ending does', async (t) => {
  const s = story(t);
  let a = { run: undefined as unknown as RepositoryRun, repo: '', branch: '' };

  await s.test('a run of implement, checked, then review is filed with its momentum and its Remote Control', async () => {
    a = await awaiting('remote: true\n');
    const id = a.run.id;
    const spec = (task: string) => stage.board().tasks.get(task)!.spec;
    assert.deepEqual(
      [`${id}-implement`, `${id}-implement-check`, `${id}-review`].map((task) => [
        spec(task).priority,
        spec(task).config?.claude?.remoteControl,
      ]),
      [
        [0, true],
        [1, undefined],
        [1, undefined],
      ],
      'filed with their Remote Control, and each with its momentum as `priority`: a first step 0, its check and the step after it 1',
    );
  });

  await s.test(
    'the awaiting decision: what the branch touched, the lesson, the check files in full, what each step used and where its time went',
    async () => {
      const { d, decided } = await decidable(a.run.id);
      assert.deepEqual(awaitingOf(decided).unverified, ['review'], 'review declared no check: its own word alone');
      const [touched] = d.touched;
      assert.equal(touched?.branch, a.branch);
      assert.ok(touched && !('error' in touched.radius), JSON.stringify(touched));
      assert.deepEqual(
        touched.radius.groups.map((g) => [g.name, g.files, g.added, g.removed]),
        [
          ['(root)', 1, 2, 0],
          ['packages/x', 2, 2, 1],
        ],
      );
      assert.deepEqual([touched.radius.agentFacing, touched.radius.checkAffecting], [['CLAUDE.md'], ['packages/x/test/add.test.ts']]);
      assert.deepEqual(d.lesson, { said: 'CLAUDE.md +2 −0', state: 'written' });
      const inFull = d.sensitive.flatMap((b) => b.files);
      assert.deepEqual(
        inFull.map((f) => f.path),
        ['packages/x/test/add.test.ts'],
        'the source change decides nothing about the check: it is not in full',
      );
      assert.ok(
        inFull[0]?.lines.includes('-assert.equal(add(1, 1), 2);') && inFull[0].lines.includes('+assert.ok(true);'),
        `the weakened assertion, whole: ${JSON.stringify(inFull)}`,
      );

      assert.deepEqual(
        [d.used.implement?.used, d.used.implement?.cost],
        ['29 responses · 93 tool calls · 6.35M in · 112k out', 'not measured'],
        'what each step consumed',
      );
      assert.deepEqual([d.used.review?.used, d.used.review?.cost], ['not measured', 'not measured'], 'a step with no usage says so');
      assert.ok(!/\$\d/.test(JSON.stringify([d.used, d.total, d.cost])), 'cost never says a number no runner measured');

      const span = (s: { filedAt: string | null; spawnedAt: string | null; endedAt: string | null; queued: string; ran: string } | null) =>
        s && [s.filedAt, s.spawnedAt, s.endedAt, s.queued, s.ran];
      const [implement] = decided.timeline.steps.implement ?? [];
      assert.deepEqual(
        [span(implement?.session ?? null), span(implement?.check ?? null), implement?.used],
        [
          [iso(T0), iso(T0 + 12_000), iso(T0 + 300_000), '12s', '4m48s'],
          [iso(T0 + 600_000), iso(T0 + 612_000), iso(T0 + 900_000), '12s', '4m48s'],
          USAGE,
        ],
        'where the time went, beside what each step used: its session and its check, each filed, spawned and ended, queued and ran',
      );
      const [review] = decided.timeline.steps.review ?? [];
      assert.deepEqual(
        [span(review?.session ?? null), review?.check, review?.used],
        [[iso(T0 + 1_200_000), iso(T0 + 1_212_000), iso(T0 + 1_500_000), '12s', '4m48s'], null, undefined],
      );
      const { queued, ran, wall } = decided.timeline.run;
      assert.deepEqual([queued, ran, wall], ['36s', '14m24s', '25m00s'], "the run's timeline");
      assert.deepEqual(decided.timeline.rounds, [], "no loop, so no round: the run's total alone");

      const [land, drop] = [offered(d, 'land it'), offered(d, 'drop it')];
      assert.ok(land.includes(a.branch) && land.includes(a.repo), land);
      assert.ok(drop.includes(a.branch) && drop.includes(a.repo), drop);
      assert.notEqual(stage.place().world.tip(a.repo, a.branch), null, 'none of the commands is run: the branch is still there');
      assert.equal(stage.place().world.tip(a.repo, 'main'), a.run.baseRef, 'and main is where the run started it');
    },
  );

  await s.test(
    "the decision and `nemia ls` say nothing of a run's momentum, its admission or a step's Remote Control, whether the engine's record carries them or not",
    async (c) => {
      const screens = async () => ({ decide: JSON.stringify((await decisionOn(stage, a.run.id)).decision), ls: await listed(c, a.run.id) });
      const carried = await screens();
      for (const task of stage.board().tasks.values()) task.spec = { ...task.spec, queued: false, config: undefined, priority: undefined };
      assert.deepEqual(await screens(), carried);
      assert.ok(![carried.decide, ...carried.ls].some((l) => /priority|momentum|remote|bridge/i.test(l)), JSON.stringify(carried));
    },
  );

  await s.test('--sensitive with a glob that matches nothing reads no file in full', async () => {
    const { d } = await decidable(a.run.id, ['nothing/**']);
    assert.deepEqual(
      d.sensitive.map((b) => [b.branch, b.files, b.error]),
      [[a.branch, [], null]],
      'the default list is replaced, not added to',
    );
    const [touched] = d.touched;
    assert.ok(
      touched && !('error' in touched.radius) && touched.radius.checkAffecting.includes('packages/x/test/add.test.ts'),
      'the globs choose what is read whole, not what is true: the radius still names the check file',
    );
  });

  await s.test("the lesson line reads the base's workspaces: a package's docs/ is a lesson, a docs/ in its source is not", async () => {
    const world = stage.place().world;
    world.branch(a.repo, 'wf/source-docs', { 'packages/x/src/docs/strings.ts': 'export const title = "Docs";\n' });
    world.branch(a.repo, 'wf/package-docs', {
      'packages/x/src/docs/strings.ts': 'export const title = "Docs";\n',
      'packages/x/docs/features.md': 'what is left\n',
    });
    const read = (branch: string) => lessonLine(changesOf(stage.place().place, a.run, [branch]));
    assert.equal(read('wf/source-docs'), 'lesson  nothing written where the next agent reads');
    assert.equal(read('wf/package-docs'), 'lesson  packages/x/docs/features.md +1 −0');
    const [gone] = changesOf(stage.place().place, a.run, ['wf/never']);
    assert.ok('error' in gone.radius && /wf\/never/.test(gone.radius.error), 'a branch that is gone is not read as nothing');
    assert.equal(lessonLine([gone]), 'lesson  not known — wf/never could not be read');
  });

  await s.test(
    "a measured cost on both reads: the decision's beside what each step used, with the api and tool time, and the run's; `nemia ls` beside each step's word and on the run's line — and a run nobody measured says no dollar",
    async (c) => {
      const run = await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
      await tick(run.id);
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED, usage: { ...USAGE, costUsd: 3.012, apiMs: 486_000, toolMs: 2_400 } });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED, usage: { costUsd: 0.5 } });

      const { d, decided } = await decidable(run.id);
      assert.deepEqual(
        [d.used.implement?.used, d.used.implement?.cost],
        ['29 responses · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s', '$3.01'],
      );
      assert.deepEqual(decided.timeline.steps.implement?.[0]?.used, { ...USAGE, costUsd: 3.012, apiMs: 486_000, toolMs: 2_400 });
      assert.deepEqual(
        [d.used.review?.used, d.used.review?.cost],
        ['responses not measured · tool calls not measured · tokens in not measured · tokens out not measured', '$0.50'],
      );
      assert.equal(d.cost, 'run $3.51', "the run's cost, every step's tries together");

      const ls = await listed(c, run.id);
      assert.equal(ls[0], `${run.id}  add sub  $3.51`);
      assert.match(ls[1], /^ {3}implement {6}verified ✓ {2}\$3\.01 +\S/);
      assert.match(ls[2], /^ {3}review {9}unverified · done {2}\$0\.50 +\S/);

      assert.ok(!(await listed(c, a.run.id)).some((l) => l.includes('$')), 'the awaiting run measured no cost: no dollar on `nemia ls`');
      const { d: bare } = await decidable(a.run.id);
      assert.equal(bare.cost, 'run not measured', "nor on the decision, where the run's cost says not measured");
      assert.ok(!JSON.stringify([bare.used, bare.total, bare.cost]).includes('$'), JSON.stringify(bare.used));
    },
  );

  await s.test(
    'a place whose report is not heard: the decision says what the run changed is not known — touched, the lesson, in full and the branch — never that it changed nothing',
    async () => {
      const deaf = placeOver(stage.place().place, { report: () => unreadBy('report', 'the place exited 1') });
      const read = await decisionOf(stage.board().e, a.run.id, { place: deaf, env: ENV });
      assert.ok('touched' in read.decision, JSON.stringify(read.decision));
      const d = read.decision;
      const unknown = "what this run changed is not known: the place's report was not heard: ";
      const errorOf = (radius: object) => ('error' in radius ? String(radius.error) : `read: ${JSON.stringify(radius)}`);
      assert.deepEqual(
        d.touched.map((t) => [t.branch, errorOf(t.radius).startsWith(unknown)]),
        [[a.branch, true]],
        `the place's report not heard: ${JSON.stringify(d.touched)}`,
      );
      assert.deepEqual(
        read.results.map((r) => [r.branch, errorOf(r.radius).startsWith(unknown)]),
        [[a.branch, true]],
        "the branch's counts are not known, never none",
      );
      assert.deepEqual(d.lesson, { said: `not known — ${a.branch} could not be read`, state: 'unknown' });
      assert.deepEqual(
        d.sensitive.map((b) => [b.branch, b.files, b.error?.startsWith(unknown)]),
        [[a.branch, [], true]],
        'its files in full are not known either',
      );
    },
  );

  await s.test(
    "the branch's standing against the base is a fact of every decision, once a pass has read it — ahead by N, landed by hand, gone",
    async () => {
      await aPass();
      const standing = async (id: string, branch: string) =>
        (await decidable(id)).d.standings.find((x) => x.branch === branch) ?? assert.fail(`${branch} stands nowhere`);
      const ahead = await standing(a.run.id, a.branch);
      assert.deepEqual(
        [ahead.where, 'commits' in ahead ? ahead.commits : null, ahead.said],
        ['ahead', 1, `${a.branch} is ahead of main by 1 commit`],
      );

      const other = await awaiting();
      const world = stage.place().world;
      world.stage(a.repo, a.branch);
      world.commit(a.repo, 'land it by hand');
      await aPass();
      assert.deepEqual(
        (await decisionOn(stage, a.run.id)).decision,
        { nothing: `landed — ${a.branch} is already on main` },
        'merged by hand, as a person lands a run with no ending step: the run reads landed, and there is nothing left to decide',
      );

      const workspaces = Object.values(runRecord(ROOT, other.run.id).steps).flatMap((step) => (step.workspace ? [step.workspace] : []));
      const removed = stage
        .place()
        .place.askNow('remove', { repo: other.repo, workspaces: [...new Set(workspaces)], branches: [other.branch] });
      assert.ok('answer' in removed && removed.answer.deleted.includes(other.branch), JSON.stringify(removed));
      await aPass();
      assert.equal((await standing(other.run.id, other.branch)).where, 'gone', 'a branch deleted with no tip recorded for it is gone');
    },
  );

  await s.test(
    "a folder whose last step is an ending: the decision, once a pass has read where its branch stands, says what that step would do in the folder's words, and the word that runs it — and offers no command of the branch, since the step is the one that merges",
    async (c) => {
      const run = await stage.runPlaced(
        startRun({ brief: 'add sub', repo: aRepo(), workflowDir: ending('ship', `${SHIP_IT}\n\nAbort on any failure.\n`) }),
      );
      await tick(run.id);
      const work = runRecord(ROOT, run.id).steps.implement;
      commitIn(work.workspace!, { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` }, 'add sub');
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      assert.equal(runRecord(ROOT, run.id).steps.ship.taskId, null, 'nothing of the ending is filed without a person');

      await aPass();
      const { d, decided } = await decidable(run.id);
      assert.deepEqual(awaitingOf(decided).awaitingApproval, ['ship'], 'the ending, at its gate: nothing of it has run');
      const standing = d.standings.find((x) => x.branch === work.branch);
      assert.deepEqual([standing?.where, standing?.said], ['ahead', `${work.branch} is ahead of main by 1 commit`]);
      assert.deepEqual(decided.toDecide, { kind: 'approve', step: 'ship', says: SHIP_IT, filed: false });
      assert.deepEqual(
        d.commands.filter((x) => x.label === 'approve' || x.label === 'send back').map((x) => x.command),
        [`nemia approve ${run.id} ship`, `nemia retry ${run.id} implement --message "<objection>"`],
      );
      assert.ok(
        !d.commands.some((x) => x.label === 'land it' || x.label === 'drop it'),
        'the folder says what landing is, so nobody is told to type it',
      );

      const said = await listed(c, run.id);
      indexOf(said, `   → to decide: ${SHIP_IT} — nemia approve ${run.id} ship`);
      assert.ok(
        !said.some((l) => l.includes('waiting on you')),
        '`nemia ls` says it in one line, where it says who the run waits on: the ending is not said twice',
      );
      indexOf(said, /^ {3}ship {11}awaiting approval/);
    },
  );

  await s.test(
    "at an ending's gate, the decision, after a pass, says which runs in flight on the base its branch collides with, and in which files; REFUSED: a run still running reads none",
    async () => {
      const repo = aRepo();
      const dir = ending('ship', 'Ship it.\n');
      const add = 'packages/x/src/add.ts';
      const working = async (file: string, text: string, settled: boolean) => {
        const run = await stage.runPlaced(startRun({ brief: `write ${file}`, repo, workflowDir: dir }));
        await tick(run.id);
        const work = runRecord(ROOT, run.id).steps.implement;
        commitIn(work.workspace!, { [file]: text }, `write ${file}`);
        if (settled) {
          settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
          await tick(run.id);
        }
        return { id: run.id, branch: work.branch! };
      };
      const ours = await working(add, 'export const add = (a, b) => b + a;\n', true);
      const theirs = await working(add, 'export const add = (a, b) => a + b + 0;\n', false);
      const apart = await working('packages/x/src/sub.ts', 'export const sub = (a, b) => a - b;\n', false);

      await aPass();
      const { collisions } = await stage.runWith(stage.board().e, decideRun(ours.id));
      assert.deepEqual([...(collisions?.inFlight ?? [])].sort(), [theirs.id, apart.id].sort());
      assert.deepEqual(
        collisions?.colliding.map((x) => [x.run, x.branch, x.ours, x.merge]),
        [[theirs.id, theirs.branch, ours.branch, { clean: false, conflicts: [add] }]],
      );
      const { d } = await decidable(ours.id);
      assert.deepEqual(d.standings.find((x) => x.branch === ours.branch)?.said, `${ours.branch} is ahead of main by 1 commit`);
      assert.deepEqual(
        [d.collisions?.base.map((b) => [b.branch, b.said]), d.collisions?.said, d.collisions?.colliding.map((x) => [x.ours, x.said])],
        [
          [[ours.branch, 'merges cleanly onto main']],
          `collides with 1 of the 2 runs in flight on main: ${theirs.id}`,
          [[ours.branch, `conflicts with ${theirs.id}'s ${theirs.branch} in 1 file: ${add}`]],
        ],
        'the decision the api serves carries them, each in its words',
      );

      const running = await stage.runWith(stage.board().e, decideRun(theirs.id));
      assert.equal(running.decision.kind, 'running');
      assert.equal(running.collisions, undefined, 'a run still running is at no ending, and no trial merge is asked for it');
    },
  );

  await s.test(
    "REFUSED: an ending led by an agent that says `You are …` — the decision and `nemia ls` say the step's own note, or with none, that approving runs it, and never quote the agent",
    async (c) => {
      const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
      fs.mkdirSync(path.join(team, 'agents'));
      fs.writeFileSync(
        path.join(team, 'agents', 'otto.md'),
        "---\nmodel: opus\n---\nYou are Otto, a release engineer. You land a run's result in the repository's own checkout.\n\nNever push.\n",
      );
      const LANDS = "Land this run's result on main: stage the merge of its branch, and sign off with the commit message.";
      const atGate = async (note: string) => {
        const run = await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: ending('land', note, 'otto', team) }));
        await tick(run.id);
        commitIn(
          runRecord(ROOT, run.id).steps.implement.workspace!,
          { 'packages/x/src/add.ts': 'export const sub = (a, b) => a - b;\n' },
          'add sub',
        );
        settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
        await tick(run.id);
        const { d, decided } = await decidable(run.id);
        return { id: run.id, d, toDecide: decided.toDecide, said: await listed(c, run.id) };
      };
      const approving = (d: Decidable) => d.commands.filter((x) => x.label === 'approve').map((x) => x.command);

      const noted = await atGate(`${LANDS}\n\nAbort on a conflict.\n`);
      assert.deepEqual(
        noted.toDecide,
        { kind: 'approve', step: 'land', says: LANDS, filed: false },
        "the step's own note, its first paragraph",
      );
      assert.deepEqual(approving(noted.d), [`nemia approve ${noted.id} land`]);
      indexOf(noted.said, `   → to decide: ${LANDS} — nemia approve ${noted.id} land`);

      const bare = await atGate('');
      assert.deepEqual(bare.toDecide, { kind: 'approve', step: 'land', says: null, filed: false }, 'with none, nothing is quoted');
      assert.deepEqual(approving(bare.d), [`nemia approve ${bare.id} land`]);
      indexOf(bare.said, `   → to decide: land has not run: approving runs it — nemia approve ${bare.id} land`);

      for (const shown of [
        JSON.stringify([noted.d, noted.toDecide]),
        ...noted.said,
        JSON.stringify([bare.d, bare.toDecide]),
        ...bare.said,
      ]) {
        assert.ok(!shown.includes('You are'), shown);
      }
    },
  );

  await s.test(
    'a gate on the last step of a folder that merges nothing: approving accepts what the step did — its own prose is not offered as what happens next — and the branch keeps its commands',
    async (c) => {
      const repo = aRepo();
      const run = await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder(), gates: ['review'] }));
      await tick(run.id);
      commitIn(
        runRecord(ROOT, run.id).steps.implement.workspace!,
        { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` },
        'add sub',
      );
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED });
      const branch = runRecord(ROOT, run.id).steps.review.branch!;

      const held = await decidable(run.id);
      assert.deepEqual(
        held.decided.toDecide,
        { kind: 'approve', step: 'review', says: null, filed: true },
        'signed off, waiting for your word',
      );
      assert.ok(
        held.d.commands.some((x) => x.label === 'approve' && x.command === `nemia approve ${run.id} review`),
        JSON.stringify(held.d),
      );
      assert.ok(!JSON.stringify(held.d).includes('Review the change in this workspace'), "the step's brief is not what happens next");
      assert.deepEqual(
        held.d.commands.slice(0, 2).map((x) => x.label),
        ['approve', 'send back'],
        'the gate is offered first; the branch commands the read model lists beside it come after',
      );
      indexOf(await listed(c, run.id), `   → to decide: review has signed off at its gate — nemia approve ${run.id} review`);

      approveByHand(run.id, 'review', 1);
      const { d } = await decidable(run.id);
      const [land, drop] = [offered(d, 'land it'), offered(d, 'drop it')];
      assert.ok(
        land.includes(branch) && drop.includes(branch),
        "review, a terminal gated step, approved: the run is over, and the branch nobody has merged is still a person's, with the commands, since no step of this folder merges",
      );
      await aPass();
      indexOf(await listed(c, run.id), `   → to decide: ${branch} is ahead of main, and nothing has merged it — nemia decide ${run.id}`);
    },
  );

  await s.test(
    'a run that worked on the base branch itself says so, and still says what is to be decided: the screen that used to return before it',
    async () => {
      const run = await stage.runPlaced(
        startRun({ brief: 'add sub, directly', repo: aRepo(), workflowDir: folder(), isolate: false, gates: ['review'] }),
      );
      await tick(run.id);
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED });

      const { d, decided } = await decidable(run.id);
      assert.deepEqual(d.awaiting, { branches: ['main'], direct: true }, 'it worked directly on main: nothing to merge');
      assert.deepEqual(decided.toDecide, { kind: 'approve', step: 'review', says: null, filed: true }, 'and still what to decide');
      assert.ok(
        d.commands.some((x) => x.label === 'approve' && x.command === `nemia approve ${run.id} review`),
        JSON.stringify(d),
      );
      assert.deepEqual(d.standings, [], 'no standing: it would read `main is on main`');
      assert.ok(!d.commands.some((x) => x.label === 'land it' || x.label === 'drop it'), 'nor a merge of the branch it is already on');
    },
  );

  await s.test(
    "a run whose one step works in the checkout is not shown the base branch's diff: its work is not on it, and the base moves under it",
    async () => {
      const repo = aRepo();
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'supervise.md'), '---\nplace: git\nworkspace: base\nslot: none\n---\nWatch the runs.\n');
      const run = await stage.runPlaced(startRun({ brief: 'supervise this repository', repo, workflowDir: dir }));
      await tick(run.id);
      settle(`${run.id}-supervise`, 'succeeded', { closeout: blocked('Merge add-sub, or hold it?', 'add-sub is ready to merge.') });
      await tick(run.id);
      assert.equal(
        runRecord(ROOT, run.id).steps.supervise?.branch,
        'main',
        "the step worked in the repository's own checkout, so the record names the base branch, not a branch of the run's",
      );

      stage.place().world.branch(repo, 'main', {
        'packages/x/test/add.test.ts': "import assert from 'node:assert';\nassert.ok(true);\n",
        'CLAUDE.md': 'a lesson somebody else wrote\n',
      });
      const [{ radius: moved }] = changesOf(stage.place().place, repositoryRun(runRecord(ROOT, run.id)), ['main']);
      assert.ok(
        !('error' in moved) && moved.changes.length === 2,
        `another run's merge moved main under the run, and that diff reads; what is refused is reading it as this run's work: ${JSON.stringify(moved)}`,
      );

      const { d, decided } = await decidable(run.id);
      assert.deepEqual(d.touched, [], 'no branch to read');
      assert.notEqual(d.lesson.state, 'written', 'nor a lesson credited to it for what another run merged');
      assert.deepEqual(d.sensitive, [], 'nor every check-affecting file merged since, above the question');
      const closeout = decided.closeouts.supervise;
      assert.ok(closeout && !('error' in closeout), JSON.stringify(closeout));
      assert.deepEqual(
        [closeout.summary, closeout.needs],
        ['add-sub is ready to merge.', 'Merge add-sub, or hold it?'],
        'what the person came for: the summary, and the question',
      );
      assert.equal(decided.answering.supervise, `to answer it:  nemia retry ${run.id} supervise --message "<answer>"`);

      const direct = await stage.runPlaced(startRun({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false }));
      stage.place().world.branch(repo, 'main', { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` });
      await tick(direct.id);
      settle(`${direct.id}-implement`, 'failed');
      const { d: worked } = await decidable(direct.id);
      assert.equal(
        runRecord(ROOT, direct.id).steps.review?.branch,
        undefined,
        'the terminal step has no branch: the fallback is what answers',
      );
      const groups = worked.touched.map((x) => ({ branch: x.branch, groups: 'error' in x.radius ? null : x.radius.groups }));
      assert.deepEqual(
        groups.map((x) => [x.branch, x.groups?.map((g) => [g.name, g.files, g.added, g.removed])]),
        [['main', [['packages/x', 1, 1, 0]]]],
        'a run that worked on main itself (--no-worktree) reads every branch a step worked on, main, where its work is',
      );
    },
  );

  await s.test(
    'REFUSED at `nemia start`: --no-worktree on a workflow whose last step merges, before a run is written — such a run has no result branch',
    async () => {
      const repo = aRepo();
      const dir = ending('ship', 'Ship it.\n');
      const before = fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;
      await assert.rejects(
        stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir, isolate: false })),
        (err: Error & { exitCode?: number; _tag?: string }) => {
          assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
          assert.match(err.message, /workspace: base/);
          assert.match(err.message, /--no-worktree/, 'and names the flag to drop');
          return true;
        },
      );
      assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length, before, 'nothing written');
      assert.ok(await stage.runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir })), 'with worktrees, it starts');
    },
  );
});

test('a step retried, answered, over its budget and nudged: what `nemia decide` and `nemia ls` say of each try', async (t) => {
  const s = story(t);
  let id = '';

  await s.test('a blocked step is told the nemia retry --message that answers it, and nothing is answered yet', async () => {
    id = (await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }))).id;
    await tick(id);
    settle(`${id}-implement`, 'succeeded', { closeout: blocked('Rename --flag, or keep it?') });
    await tick(id);
    const asking = await decidedOn(stage, id);
    const closeout = asking.closeouts.implement;
    assert.equal(closeout && !('error' in closeout) ? closeout.needs : closeout, 'Rename --flag, or keep it?');
    assert.equal(
      asking.answering.implement,
      `to answer it:  nemia retry ${id} implement --message "<answer>"`,
      'the question, and the command that answers it',
    );
    assert.ok(
      asking.offers.includes(
        `implement: blocked. Continue its session, told what happened:  nemia retry ${id} implement  (--fresh, or --model <m>, for a new session)`,
      ),
      asking.offers.join('\n'),
    );
    assert.deepEqual(asking.answers, {}, 'nothing answered yet');
  });

  await s.test('the try a person answered is asked, and the next tick files it', async () => {
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'continue', message: 'Keep it.\nThe flag is public.' }));
    const d = await decidedOn(stage, id);
    const step = d.steps.find((x) => x.name === 'implement');
    assert.ok(step, 'implement is a step of the run');
    assert.deepEqual(
      d.retrying.filter((r) => r.step === 'implement').map((r) => dueNote(step, d.run, r)),
      ['try 2 asked (--continue, with your answer) — the next tick files it'],
    );
  });

  await s.test(
    'on the answered try its note says so, and beside it what the try before needed and your answer, read off the ask',
    async () => {
      await tick(id);
      settle(`${id}-implement-try2`, 'succeeded', { closeout: blocked('And the README, too?') });
      await tick(id);
      const d = await decidedOn(stage, id);
      const step = d.steps.find((x) => x.name === 'implement');
      assert.ok(step, 'implement is a step of the run');
      assert.equal(tryNote(step, d.run.steps.implement, d.steps, Boolean(d.answers.implement)), 'try 2, continued on your word, answered');
      assert.deepEqual(d.answers.implement, { try: 2, message: 'Keep it.\nThe flag is public.', needs: 'Rename --flag, or keep it?' });
      const closeout = d.closeouts.implement;
      assert.deepEqual(
        closeout && !('error' in closeout) ? [closeout.outcome, closeout.needs] : closeout,
        ['blocked', 'And the README, too?'],
        'and what the try made of them',
      );
      assert.ok(
        !fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8').includes('The flag is public'),
        'composed on read: the record keeps no message',
      );
    },
  );

  await s.test(
    'what a step consumed is summed over its attempts — one that never started left out, the one in flight read off the view',
    () => {
      const views: Record<string, unknown> = {
        t1: {
          usage: { responses: 1, toolCalls: 1, inputTokens: 5, outputTokens: 1 },
          state: {
            attempts: [
              { reason: 'unstartable', endedAt: '2026-09-13T00:00:00Z', usage: null },
              {
                reason: 'harness',
                endedAt: '2026-09-13T00:01:00Z',
                usage: { responses: 2, toolCalls: 3, inputTokens: 10, outputTokens: 1 },
              },
              { reason: null, endedAt: null, usage: null },
            ],
          },
        },
        t2: { state: { attempts: [{ reason: 'lost', endedAt: '2026-09-13T00:00:00Z', usage: null }] } },
      };
      const run = { steps: { implement: { taskId: 't1' }, review: { taskId: 't2' }, respond: {} } } as unknown as Run;
      assert.deepEqual(
        consumption(new Map(Object.entries(views)) as unknown as Parameters<typeof consumption>[0], run),
        { implement: { responses: 3, toolCalls: 4, inputTokens: 15, outputTokens: 2 }, review: undefined },
        'review, whose session was lost before its runner measured anything, sums nothing: nobody counted',
      );
    },
  );

  await s.test(
    'REFUSED to hide why a step stopped past its budget: a session that failed after spending its budget is failed, and one that ended unsigned is unsigned, each beside the OVER BUDGET line — and the offer names both',
    async () => {
      const budgeted = () => {
        const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
        fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nbudget: 3\n---\nimplement it\n');
        fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
        return dir;
      };
      const cases = [
        ['failed', 'failed', (a: Awaiting) => a.failed],
        ['unsigned', 'succeeded', (a: Awaiting) => a.unsigned],
      ] as const;
      for (const [own, phase, banner] of cases) {
        const run = await stage.runPlaced(startRun({ brief: `add sub, ${own}`, repo: aRepo(), workflowDir: budgeted(), isolate: false }));
        await tick(run.id);
        settle(`${run.id}-implement`, phase, { usage: { costUsd: 3.4 } });
        const { d, decided } = await decidable(run.id);
        assert.deepEqual(banner(awaitingOf(decided)), ['implement'], `${own}, with no closeout: why it stopped`);
        assert.match(d.overBudget ?? '', /^OVER BUDGET, waiting on you: implement \(\$3\.40 of \$3\)/, 'and why nothing more is filed');
        const offer = decided.offers.find((l) => l.startsWith(`implement: over budget (${own}), $3.40 of $3.`));
        assert.ok(offer?.includes(`nemia retry ${run.id} implement --budget <amount>`), decided.offers.join('\n'));
        assert.equal(decided.costs.implement, 'cost  $3.40 · budget $3');
        assert.ok(
          !JSON.stringify([d.overBudget, decided.offers]).includes('its tries have cost its budget: or more'),
          'the shared reason is gone',
        );
      }
    },
  );

  await s.test(
    "UNSIGNED after the run's own nudge: the decision and `nemia ls` say the run nudged it to sign off once, and that it ended unsigned again — the nudge spent, the step yours",
    async (c) => {
      const run = await stage.runPlaced(startRun({ brief: 'add sub, unsigned', repo: aRepo(), workflowDir: folder(), isolate: false }));
      await tick(run.id);
      settle(`${run.id}-implement`, 'succeeded', { closedOut: false });
      assert.deepEqual(
        (await tick(run.id)).notes.filter((n) => n.startsWith('implement:')),
        ['implement: try 2 — an ask to sign off, once a round'],
        'a session its harness let go without calling StructuredOutput, as the engine records it: succeeded, `closedOut: false`',
      );
      settle(`${run.id}-implement-try2`, 'succeeded', { closedOut: false });
      await tick(run.id);
      const decided = await decidedOn(stage, run.id);
      assert.deepEqual(awaitingOf(decided).unsigned, ['implement']);
      assert.equal(signoffsSpent(decided.run.steps.implement), 1, 'asked to sign off once by the run, and unsigned again');
      const ls = await listed(c, run.id);
      assert.ok(
        ls.some((l) => /^ {3}implement +unsigned .*try 2, asked to sign off by the run/.test(l)),
        ls.join('\n'),
      );
    },
  );
});

test('a run on two branches, side by side: each read, each in full, the longer note kept whole, and both dropped together', async (t) => {
  const s = story(t);
  let id = '';
  let read = undefined as unknown as Awaited<ReturnType<typeof decidable>>;

  await s.test('implement and docs work side by side, each committing on the branch the place cut for it', async () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
    fs.writeFileSync(path.join(dir, 'docs.md'), '---\nplace: git\n---\nwrite it down\n');
    id = (await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: dir }))).id;
    assert.deepEqual((await tick(id)).filed.sort(), ['docs', 'implement']);
    commitIn(runRecord(ROOT, id).steps.implement.workspace!, { 'sub.ts': 'export const sub = (a, b) => a - b;\n' }, 'add sub.ts');
    commitIn(
      runRecord(ROOT, id).steps.docs.workspace!,
      { 'NOTES.md': Array.from({ length: 123 }, (_, i) => `note ${i + 1}\n`).join('') },
      'add NOTES.md',
    );
    settle(`${id}-implement`, 'succeeded', { closeout: SIGNED });
    settle(`${id}-docs`, 'succeeded', { closeout: SIGNED });
    await tick(id);
  });

  await s.test(
    'the decision, once a pass has read where the branches stand, reads what each branch touched, and the check files in full on each',
    async () => {
      await aPass();
      read = await decidable(id);
      assert.deepEqual(awaitingOf(read.decided).unverified, ['docs', 'implement'], 'no check: declared; only its own word says it worked');
      assert.deepEqual(
        read.d.touched.map((x) => [
          x.branch,
          'error' in x.radius ? x.radius.error : x.radius.groups.map((g) => [g.name, g.files, g.added, g.removed]),
        ]),
        [
          [`wf/${id}/run`, [['(root)', 1, 123, 0]]],
          [`wf/${id}/implement`, [['(root)', 1, 1, 0]]],
        ],
      );
      assert.deepEqual(
        read.d.sensitive.map((b) => [b.branch, b.files, b.error]),
        [
          [`wf/${id}/run`, [], null],
          [`wf/${id}/implement`, [], null],
        ],
        'no check-affecting file on either',
      );
    },
  );

  await s.test('a note a branch added is read whole, beside its counts, for a reader to cut', () => {
    const results = read.read.results.map((r) => [
      r.branch,
      'error' in r.radius ? r.radius.error : countsLine(r.radius),
      'error' in r.notes ? r.notes.error : r.notes.map((n) => [n.file, n.text.split('\n').filter((l) => /^note \d+$/.test(l)).length]),
    ]);
    assert.deepEqual(results, [
      [`wf/${id}/run`, '1 file: +123 −0', [['NOTES.md', 123]]],
      [`wf/${id}/implement`, '1 file: +1 −0', []],
    ]);
  });

  await s.test('both branches stand ahead of main; the run branch is landed, and both are dropped together', () => {
    assert.deepEqual(
      read.d.standings.map((x) => [x.branch, x.said]),
      [
        [`wf/${id}/run`, `wf/${id}/run is ahead of main by 1 commit`],
        [`wf/${id}/implement`, `wf/${id}/implement is ahead of main by 1 commit`],
      ],
    );
    const [land, drop] = [offered(read.d, 'land it'), offered(read.d, 'drop it')];
    assert.ok(land.includes(`wf/${id}/run`) && !land.includes(`wf/${id}/implement`), land);
    assert.ok(drop.includes(`wf/${id}/run`) && drop.includes(`wf/${id}/implement`), drop);
  });
});

/**
 * `nemia decide`'s program says in its type what it needs and what it refuses: run without the engine, it does not typecheck, and a
 * refusal is its failure. Nothing calls this: the typecheck reads its lines, and an `@ts-expect-error` over code that stops erring is
 * the failure.
 */
async function _decideProgramTypes() {
  const { Effect } = await import('effect');
  void (decideRun('x') satisfies EffectOf<Decided, Refusal, EngineService | PlaceService | StoreRoot | StoreConfig>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (decideRun('x') satisfies EffectOf<Decided, never, EngineService>);
  // @ts-expect-error -- decideRun requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(decideRun('x'));
}
