/**
 * `nemia decide`'s screen, told as a person's stories on the test place (`story.ts`): a run waiting on you read and landed, with the
 * endings and gates that decide what approving it does; a step retried, answered, over its budget and nudged; and a run on two branches
 * read side by side. What the branch touched, the lesson line and the check-affecting files in full sit between the verdicts and the
 * closeouts; what each step consumed sits beside its check. The test place says a branch's commands in words of its own, so each fact is
 * read as a fact: the whole screens, a rename and a binary file, a lint config's diff and the git processes `nemia ls` costs are read on
 * git in `screens-git.boundary.test.ts`. A program's answer equal to its plain face is in `faces.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryRun, Run } from '../src/run.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Decided } from '../src/decide/decide.verb.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService } from '../src/runtime-client.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import type { EnginePhase } from '../src/views/views-words.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { placeOver, unreadBy } from './place-over.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-decide-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const {
  AGENT_FACING,
  CHECK_AFFECTING,
  LESSON,
  advanceRun,
  changesOf,
  consumption,
  decideRun,
  isRepositoryRun,
  lessonLine,
  retryRun,
  startRun,
  runWith,
} = await import('../src/runner.ts');
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = () => stage.runWith(stage.board().e, passStanding(listRuns()));

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
  const work = readRun(run.id).steps.implement;
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
  const record = readRun(run.id);
  return { run: repositoryRun(record), repo, branch: record.steps.review.branch! };
};

/** The ending's own words, as the folder writes them: what `nemia decide` echoes as what approving it does. */
const SHIP_IT = "Ship it: trial merge this run's result branch onto main, run the check, and commit.";

/** What `nemia <argv>` prints, line by line. */
const printed = async (t: TestContext, ...argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await stage.main(argv);
  } finally {
    log.mock.restore();
  }
  return out.join('\n').split('\n');
};
/** What `nemia decide <argv>` prints, line by line. */
const screen = (t: TestContext, ...argv: string[]) => printed(t, 'decide', ...argv);
/** What `nemia ls <id>` prints, line by line. */
const listed = (t: TestContext, id: string) => printed(t, 'ls', id);

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

/** That `err` is a refusal of kind `tag` with exit 2, its message naming `fragment`. */
const refusedAs =
  (tag: string, fragment: RegExp) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    assert.match(err.message, fragment);
    return true;
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
    'the awaiting screen: what the branch touched, the lesson, and the check files in full — between the verdicts and the closeouts',
    async (c) => {
      const lines = await screen(c, a.run.id);
      const verdict = indexOf(lines, /^ {2}UNVERIFIED: review/);
      const touched = indexOf(lines, `  touched  ${a.branch}`);
      assert.deepEqual(lines.slice(touched + 1, touched + 5), [
        '    (root)      1 file   +2 −0',
        '    packages/x  2 files  +2 −1',
        '    agent-facing     CLAUDE.md',
        '    check-affecting  packages/x/test/add.test.ts',
      ]);
      const lesson = indexOf(lines, '  lesson  CLAUDE.md +2 −0');
      const inFull = indexOf(lines, /^ {2}── in full: the check-affecting files — what a change could edit to make its check pass/);
      assert.ok(
        lines.includes('  -assert.equal(add(1, 1), 2);') && lines.includes('  +assert.ok(true);'),
        `the weakened assertion, whole:\n${lines.join('\n')}`,
      );
      assert.ok(!lines.some((l) => l.includes('export const sub')), 'the source change decides nothing about the check: it is not in full');
      const implement = indexOf(lines, '  implement');
      assert.ok(verdict < touched && touched < lesson && lesson < inFull && inFull < implement, 'in that order, before the closeouts');

      const check = indexOf(lines, /^ {4}check {2}npm test {2}→/);
      assert.deepEqual(
        lines.slice(check + 1, check + 3),
        ['    used  29 responses · 93 tool calls · 6.35M in · 112k out', '    cost  not measured'],
        'what each step consumed, beside its check',
      );
      const review = indexOf(lines, '  review');
      assert.deepEqual(
        lines.slice(review + 1, review + 3),
        ['    used  not measured', '    cost  not measured'],
        'a step with no usage says so',
      );
      assert.ok(!lines.some((l) => /^\s+cost .*\d/.test(l)), 'cost never prints a number no runner measured');
      assert.deepEqual(
        lines.slice(check + 3, check + 5),
        [
          '    timeline  try 1        filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used 29 responses · 93 tool calls · 6.35M in · 112k out',
          '              try 1 check  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s',
        ],
        'where the time went, after what each step used: its session and its check, each filed, spawned and ended, queued and ran',
      );
      assert.deepEqual(lines.slice(review + 3, review + 4), [
        '    timeline  try 1  filed 00:20:00Z  spawned 00:20:12Z  ended 00:25:00Z  queued 12s  ran 4m48s  used not measured',
      ]);
      const total = indexOf(lines, '  timeline  run  queued 36s  ran 14m24s  wall 25m00s');
      assert.ok(
        review < total && total < indexOf(lines, new RegExp(`^ {2}${a.branch}`)),
        "the run's timeline, after the steps, before the branches: one round, so the run's line alone",
      );
      const [land, drop] = lines.slice(-2);
      assert.ok(land?.startsWith('  land it   ') && land.includes(a.branch) && land.includes(a.repo), land);
      assert.ok(drop?.startsWith('  drop it   ') && drop.includes(a.branch) && drop.includes(a.repo), drop);
      assert.notEqual(stage.place().world.tip(a.repo, a.branch), null, 'none of the commands is run: the branch is still there');
      assert.equal(stage.place().world.tip(a.repo, 'main'), a.run.baseRef, 'and main is where the run started it');
    },
  );

  await s.test(
    "`nemia decide` and `nemia ls` say nothing of a run's momentum, its admission or a step's Remote Control, whether the engine's record carries them or not",
    async (c) => {
      const screens = async () => ({ decide: await screen(c, a.run.id), ls: await listed(c, a.run.id) });
      const carried = await screens();
      for (const task of stage.board().tasks.values()) task.spec = { ...task.spec, queued: false, config: undefined, priority: undefined };
      assert.deepEqual(await screens(), carried);
      assert.ok(
        !Object.values(carried)
          .flat()
          .some((l) => /priority|momentum|remote|bridge/i.test(l)),
        [...carried.decide, ...carried.ls].join('\n'),
      );
    },
  );

  await s.test('--sensitive with a glob that matches nothing prints the heading, and none', async (c) => {
    const lines = await screen(c, a.run.id, '--sensitive', 'nothing/**');
    const heading = indexOf(lines, /^ {2}── in full: the files --sensitive names \(nothing\/\*\*\)/);
    assert.equal(lines[heading + 1], '  none');
    assert.ok(!lines.includes('  +assert.ok(true);'), 'the default list is replaced, not added to');
    assert.ok(
      lines.includes('    check-affecting  packages/x/test/add.test.ts'),
      'the flag chooses what is read whole, not what is true: the radius still names the check file',
    );
  });

  await s.test(
    '`nemia decide` refuses a flag it does not take, --sensitive without globs or twice, and a flag before the run — before a run is read',
    async () => {
      for (const [flags, fragment] of [
        [['--sensitve', 'src/**'], /--sensitve/],
        [['--sensitive'], /--sensitive/],
        [['--sensitive', '--sensitive', 'src/**'], /--sensitive/],
        [['--sensitive', ' , '], /--sensitive/],
        [['--sensitive', 'a', '--sensitive', 'b'], /--sensitive/],
      ] as const) {
        await assert.rejects(stage.main(['decide', 'no-such-run', ...flags]), refusedAs('Invalid', fragment), flags.join(' '));
      }
      for (const argv of [['--sensitive', 'src/**', 'no-such-run'], ['--sensitive']]) {
        await assert.rejects(
          stage.main(['decide', ...argv]),
          refusedAs('Invalid', /nemia decide <runId> \[--sensitive <globs>\]/),
          `${argv.join(' ')}: a flag before the run is refused with the order, not answered with the general help, which exits 0`,
        );
      }
      await assert.rejects(
        stage.main(['decide', 'no-such-run', '--sensitive', 'src/**']),
        (err: Error) => !/sensitive/.test(err.message),
        'the flag it takes gets as far as reading the run, which is not there',
      );
    },
  );

  await s.test('`nemia decide --help` prints the lists the screen uses, from the one place they are written', async (c) => {
    const text = (await printed(c, 'decide', '--help')).join('\n');
    assert.match(text, /^nemia decide <runId> \[--sensitive <globs>\]/);
    for (const list of [CHECK_AFFECTING, AGENT_FACING, LESSON]) assert.ok(text.includes(list.join(', ')), list.join(', '));
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
    "a measured cost on both screens: `nemia decide` beside what each step used, with the api and tool time, and the run's after the steps; `nemia ls` beside each step's word and on the run's line — and a run nobody measured prints no dollar",
    async (c) => {
      const run = await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
      await tick(run.id);
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED, usage: { ...USAGE, costUsd: 3.012, apiMs: 486_000, toolMs: 2_400 } });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED, usage: { costUsd: 0.5 } });

      const lines = await screen(c, run.id);
      const check = indexOf(lines, /^ {4}check {2}npm test {2}→/);
      assert.deepEqual(lines.slice(check + 1, check + 3), [
        '    used  29 responses · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s',
        '    cost  $3.01',
      ]);
      assert.match(
        lines[check + 3],
        /^ {4}timeline {2}try 1 .* {2}used 29 responses · 93 tool calls · 6\.35M in · 112k out · api 8m06s · tools 2s {2}cost \$3\.01$/,
      );
      const review = indexOf(lines, '  review');
      assert.deepEqual(lines.slice(review + 1, review + 3), [
        '    used  responses not measured · tool calls not measured · tokens in not measured · tokens out not measured',
        '    cost  $0.50',
      ]);
      const total = indexOf(lines, '  cost  run $3.51');
      assert.ok(review < total && total < indexOf(lines, /^ {2}timeline {2}run /), "after the steps, beside the run's time");

      const ls = await listed(c, run.id);
      assert.equal(ls[0], `${run.id}  add sub  $3.51`);
      assert.match(ls[1], /^ {3}implement {6}verified ✓ {2}\$3\.01 +\S/);
      assert.match(ls[2], /^ {3}review {9}unverified · done {2}\$0\.50 +\S/);

      assert.ok(!(await listed(c, a.run.id)).some((l) => l.includes('$')), 'the awaiting run measured no cost: no dollar on `nemia ls`');
      const bare = await screen(c, a.run.id);
      assert.ok(
        bare.includes('  cost  run not measured') && !bare.some((l) => l.includes('$')),
        `nor on \`nemia decide\`, where the run's cost says not measured:\n${bare.join('\n')}`,
      );
    },
  );

  await s.test(
    'a place whose report is not heard: `nemia decide` says what the run changed is not known — touched, the lesson, in full and the branch — never that it changed nothing',
    async (c) => {
      const deaf = placeOver(stage.place().place, { report: () => unreadBy('report', 'the place exited 1') });
      const lines = await decideScreen(c, stage.board().e, [a.run.id], {}, deaf);
      const unknown = "what this run changed is not known: the place's report was not heard: ";
      const said = (prefix: string) => lines.filter((l) => l.startsWith(`${prefix}${unknown}`));
      assert.equal(said(`  touched  ${a.branch}  —  `).length, 1, `the place's report not heard:\n${lines.join('\n')}`);
      assert.equal(said(`  ${a.branch}  — `).length, 1, "the branch's counts are not known, never none");
      assert.ok(lines.includes(`  lesson  not known — ${a.branch} could not be read`), lines.join('\n'));
      assert.ok(!lines.some((l) => /touched nothing|^\s+\(root\)/.test(l)), 'nothing is said as changed or unchanged');
      const inFull = indexOf(lines, /^ {2}── in full: the check-affecting files/);
      assert.ok(lines[inFull + 1]?.startsWith(`  ${unknown}`), `its files in full are not known either: ${lines[inFull + 1]}`);
    },
  );

  await s.test("the branch's standing against the base is a fact on every screen — ahead by N, landed by hand, gone", async (c) => {
    assert.ok((await screen(c, a.run.id)).includes(`  branch    ${a.branch} is ahead of main by 1 commit`));

    const other = await awaiting();
    const world = stage.place().world;
    world.stage(a.repo, a.branch);
    world.commit(a.repo, 'land it by hand');
    assert.deepEqual(
      await screen(c, a.run.id),
      [`${a.run.id}  add sub`, '', `  landed — ${a.branch} is already on main`],
      'merged by hand, as a person lands a run with no ending step: the run reads landed, and there is nothing left to decide',
    );

    const workspaces = Object.values(readRun(other.run.id).steps).flatMap((step) => (step.workspace ? [step.workspace] : []));
    const removed = stage
      .place()
      .place.askNow('remove', { repo: other.repo, workspaces: [...new Set(workspaces)], branches: [other.branch] });
    assert.ok('answer' in removed && removed.answer.deleted.includes(other.branch), JSON.stringify(removed));
    assert.ok(
      (await screen(c, other.run.id)).some((l) => l.startsWith(`  branch    ${other.branch} is gone`)),
      'a branch deleted with no tip recorded for it is gone',
    );
  });

  await s.test(
    "a folder whose last step is an ending: `nemia decide` says what that step would do in the folder's words, and the word that runs it — and offers no command of the branch, since the step is the one that merges",
    async (c) => {
      const run = await stage.runPlaced(
        startRun({ brief: 'add sub', repo: aRepo(), workflowDir: ending('ship', `${SHIP_IT}\n\nAbort on any failure.\n`) }),
      );
      await tick(run.id);
      const work = readRun(run.id).steps.implement;
      commitIn(work.workspace!, { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` }, 'add sub');
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      assert.equal(readRun(run.id).steps.ship.taskId, null, 'nothing of the ending is filed without a person');

      const lines = await screen(c, run.id);
      indexOf(
        lines,
        "  AWAITING APPROVAL, waiting on you: ship  — this workflow's ending, at its gate: nothing of it has run, and your approval is what runs it",
      );
      indexOf(lines, `  branch    ${work.branch!} is ahead of main by 1 commit`);
      const decide = indexOf(lines, "  to decide  ship has not run: this workflow's ending, and your approval is what runs it:");
      assert.deepEqual(lines.slice(decide + 1, decide + 5), [
        `    ${SHIP_IT}`,
        '',
        `  approve it    nemia approve ${run.id} ship [--message "<words>"]`,
        `  send it back  nemia retry ${run.id} implement --message "<objection>"`,
      ]);
      assert.ok(!lines.some((l) => /land it {3}|drop it {3}/.test(l)), 'the folder says what landing is, so nobody is told to type it');

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
    "at an ending's gate, `nemia decide` says which runs in flight on the base its branch collides with, and in which files; REFUSED: a run still running reads none",
    async (c) => {
      const repo = aRepo();
      const dir = ending('ship', 'Ship it.\n');
      const add = 'packages/x/src/add.ts';
      const working = async (file: string, text: string, settled: boolean) => {
        const run = await stage.runPlaced(startRun({ brief: `write ${file}`, repo, workflowDir: dir }));
        await tick(run.id);
        const work = readRun(run.id).steps.implement;
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

      const { collisions } = await stage.runWith(stage.board().e, decideRun(ours.id));
      assert.deepEqual([...(collisions?.inFlight ?? [])].sort(), [theirs.id, apart.id].sort());
      assert.deepEqual(
        collisions?.colliding.map((x) => [x.run, x.branch, x.ours, x.merge]),
        [[theirs.id, theirs.branch, ours.branch, { clean: false, conflicts: [add] }]],
      );
      const lines = await screen(c, ours.id);
      const at = indexOf(lines, `  branch    ${ours.branch} is ahead of main by 1 commit`);
      assert.deepEqual(lines.slice(at + 1, at + 4), [
        `  merges    ${ours.branch} merges cleanly onto main`,
        `  others    collides with 1 of the 2 runs in flight on main: ${theirs.id}`,
        `  collides  ${ours.branch} conflicts with ${theirs.id}'s ${theirs.branch} in 1 file: ${add}`,
      ]);

      const running = await stage.runWith(stage.board().e, decideRun(theirs.id));
      assert.equal(running.decision.kind, 'running');
      assert.equal(running.collisions, undefined, 'a run still running is at no ending, and no trial merge is asked for it');
    },
  );

  await s.test(
    "REFUSED: an ending led by an agent that says `You are …` — `nemia decide` and `nemia ls` say the step's own note, or with none, that approving runs it, and never quote the agent",
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
          readRun(run.id).steps.implement.workspace!,
          { 'packages/x/src/add.ts': 'export const sub = (a, b) => a - b;\n' },
          'add sub',
        );
        settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
        await tick(run.id);
        return { id: run.id, lines: await screen(c, run.id), said: await listed(c, run.id) };
      };

      const noted = await atGate(`${LANDS}\n\nAbort on a conflict.\n`);
      const decide = indexOf(noted.lines, "  to decide  land has not run: this workflow's ending, and your approval is what runs it:");
      assert.deepEqual(noted.lines.slice(decide + 1, decide + 4), [
        `    ${LANDS}`,
        '',
        `  approve it    nemia approve ${noted.id} land [--message "<words>"]`,
      ]);
      indexOf(noted.said, `   → to decide: ${LANDS} — nemia approve ${noted.id} land`);

      const bare = await atGate('');
      const heading = indexOf(bare.lines, "  to decide  land has not run: this workflow's ending, and your approval is what runs it");
      assert.deepEqual(bare.lines.slice(heading + 1, heading + 3), [
        '',
        `  approve it    nemia approve ${bare.id} land [--message "<words>"]`,
      ]);
      indexOf(bare.said, `   → to decide: land has not run: approving runs it — nemia approve ${bare.id} land`);

      for (const shown of [noted.lines, noted.said, bare.lines, bare.said]) {
        assert.ok(!shown.some((l) => l.includes('You are')), shown.join('\n'));
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
        readRun(run.id).steps.implement.workspace!,
        { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` },
        'add sub',
      );
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED });
      const branch = readRun(run.id).steps.review.branch!;

      const held = await screen(c, run.id);
      indexOf(held, '  to decide  review has signed off and waits for your word:');
      indexOf(held, `  approve it    nemia approve ${run.id} review [--message "<words>"]`);
      assert.ok(!held.some((l) => l.includes('Review the change in this workspace')), "the step's brief is not what happens next");
      assert.ok(!held.some((l) => /land it {3}/.test(l)), 'the branch is not offered while the gate holds');
      indexOf(await listed(c, run.id), `   → to decide: review has signed off at its gate — nemia approve ${run.id} review`);

      approveByHand(run.id, 'review', 1);
      const [land, drop] = (await screen(c, run.id)).slice(-2);
      assert.ok(
        land?.startsWith('  land it   ') && land.includes(branch) && drop?.startsWith('  drop it   ') && drop.includes(branch),
        "review, a terminal gated step, approved: the run is over, and the branch nobody has merged is still a person's, with the commands, since no step of this folder merges",
      );
      await aPass();
      indexOf(await listed(c, run.id), `   → to decide: ${branch} is ahead of main, and nothing has merged it — nemia decide ${run.id}`);
    },
  );

  await s.test(
    'a run that worked on the base branch itself says so, and still says what is to be decided: the screen that used to return before it',
    async (c) => {
      const run = await stage.runPlaced(
        startRun({ brief: 'add sub, directly', repo: aRepo(), workflowDir: folder(), isolate: false, gates: ['review'] }),
      );
      await tick(run.id);
      settle(`${run.id}-implement`, 'succeeded', { closeout: SIGNED });
      await tick(run.id);
      settle(`${run.id}-implement-check`, 'succeeded', { exitCode: 0 });
      await tick(run.id);
      settle(`${run.id}-review`, 'succeeded', { closeout: SIGNED });

      const direct = await screen(c, run.id);
      const worked = indexOf(direct, /^ {2}worked directly on main; nothing to merge; the base was /);
      const said = indexOf(direct, '  to decide  review has signed off and waits for your word:');
      assert.ok(worked < said, 'the branch facts, then what to decide');
      indexOf(direct, `  approve it    nemia approve ${run.id} review [--message "<words>"]`);
      assert.ok(!direct.some((l) => l.startsWith('  branch    ')), 'no standing: it would read `main is on main`');
      assert.ok(!direct.some((l) => /land it {3}|drop it {3}/.test(l)), 'nor a merge of the branch it is already on');
    },
  );

  await s.test(
    "a run whose one step works in the checkout is not shown the base branch's diff: its work is not on it, and the base moves under it",
    async (c) => {
      const repo = aRepo();
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'supervise.md'), '---\nplace: git\nworkspace: base\nslot: none\n---\nWatch the runs.\n');
      const run = await stage.runPlaced(startRun({ brief: 'supervise this repository', repo, workflowDir: dir }));
      await tick(run.id);
      settle(`${run.id}-supervise`, 'succeeded', { closeout: blocked('Merge add-sub, or hold it?', 'add-sub is ready to merge.') });
      await tick(run.id);
      assert.equal(
        readRun(run.id).steps.supervise?.branch,
        'main',
        "the step worked in the repository's own checkout, so the record names the base branch, not a branch of the run's",
      );

      stage.place().world.branch(repo, 'main', {
        'packages/x/test/add.test.ts': "import assert from 'node:assert';\nassert.ok(true);\n",
        'CLAUDE.md': 'a lesson somebody else wrote\n',
      });
      const [{ radius: moved }] = changesOf(stage.place().place, repositoryRun(readRun(run.id)), ['main']);
      assert.ok(
        !('error' in moved) && moved.changes.length === 2,
        `another run's merge moved main under the run, and that diff reads; what is refused is reading it as this run's work: ${JSON.stringify(moved)}`,
      );

      const lines = await screen(c, run.id);
      assert.ok(!lines.some((l) => l.startsWith('  touched ')), `no branch to read:\n${lines.join('\n')}`);
      assert.ok(!lines.some((l) => l.startsWith('  lesson ')), 'nor a lesson credited to it for what another run merged');
      assert.ok(
        !lines.some((l) => /in full: the check-affecting files/.test(l)),
        'nor every check-affecting file merged since, above the question',
      );
      const said = indexOf(lines, '    add-sub is ready to merge.');
      assert.ok(indexOf(lines, '    needs: Merge add-sub, or hold it?') > said, 'what the person came for: the summary, then the question');
      indexOf(lines, `    to answer it:  nemia retry ${run.id} supervise --message "<answer>"`);

      const direct = await stage.runPlaced(startRun({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false }));
      stage.place().world.branch(repo, 'main', { 'packages/x/src/add.ts': `${ADD}export const sub = (a, b) => a - b;\n` });
      await tick(direct.id);
      settle(`${direct.id}-implement`, 'failed');
      const worked = await screen(c, direct.id);
      assert.equal(readRun(direct.id).steps.review?.branch, undefined, 'the terminal step has no branch: the fallback is what answers');
      const where = indexOf(worked, '  touched  main');
      assert.match(
        worked[where + 1],
        /^ {4}packages\/x\s+1 file\s+\+1 −0$/,
        `a run that worked on main itself (--no-worktree) reads every branch a step worked on, main, where its work is:\n${worked.slice(where, where + 3).join('\n')}`,
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

  await s.test('a blocked step is told the nemia retry --message that answers it, and nothing is answered yet', async (c) => {
    id = (await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }))).id;
    await tick(id);
    settle(`${id}-implement`, 'succeeded', { closeout: blocked('Rename --flag, or keep it?') });
    await tick(id);
    const asking = await screen(c, id);
    const needs = indexOf(asking, '    needs: Rename --flag, or keep it?');
    assert.equal(
      asking[needs + 1],
      `    to answer it:  nemia retry ${id} implement --message "<answer>"`,
      'the question, then the command that answers it',
    );
    indexOf(
      asking,
      `    implement: blocked. Continue its session, told what happened:  nemia retry ${id} implement  (--fresh, or --model <m>, for a new session)`,
    );
    assert.ok(!asking.some((l) => /^ {4}your answer: |^ {4}try \d+ needs: |answered\)$/.test(l)), 'nothing answered yet');
  });

  await s.test('the try a person answered is asked, and the next tick files it', async (c) => {
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'continue', message: 'Keep it.\nThe flag is public.' }));
    indexOf(await screen(c, id), '  implement: try 2 asked (--continue, with your answer) — the next tick files it');
  });

  await s.test(
    'on the answered try its line says so, and under it what the try before needed and your answer, read off the ask',
    async (c) => {
      await tick(id);
      settle(`${id}-implement-try2`, 'succeeded', { closeout: blocked('And the README, too?') });
      await tick(id);
      const lines = await screen(c, id);
      const head = indexOf(lines, '  implement  BLOCKED  (try 2, continued on your word, answered)');
      const question = indexOf(lines, '    try 1 needs: Rename --flag, or keep it?');
      assert.deepEqual(lines.slice(question + 1, question + 3), ['    your answer: Keep it.', '    The flag is public.']);
      assert.ok(
        head < question && question < indexOf(lines, '    needs: And the README, too?'),
        'the question and its answer, then what the try made of them',
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
    'REFUSED to hide why a step stopped past its budget: a session that failed after spending its budget says FAILED with its logs, and one that ended unsigned says UNSIGNED, each beside the OVER BUDGET line — and the offer names both',
    async (c) => {
      const budgeted = () => {
        const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
        fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nbudget: 3\n---\nimplement it\n');
        fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
        return dir;
      };
      const cases = [
        ['failed', 'failed', (run: string) => `  FAILED: implement  (nemia logs ${run} <step>)`],
        ['unsigned', 'succeeded', () => /^ {2}UNSIGNED: implement {2}— ended without the closeout it was asked for/],
      ] as const;
      for (const [own, phase, banner] of cases) {
        const run = await stage.runPlaced(startRun({ brief: `add sub, ${own}`, repo: aRepo(), workflowDir: budgeted(), isolate: false }));
        await tick(run.id);
        settle(`${run.id}-implement`, phase, { usage: { costUsd: 3.4 } });
        const lines = await screen(c, run.id);
        const said = indexOf(lines, banner(run.id));
        const over = indexOf(lines, /^ {2}OVER BUDGET, waiting on you: implement \(\$3\.40 of \$3\)/);
        assert.ok(said < over, `${own}, with no closeout: why it stopped, then why nothing more is filed`);
        const offer = lines.find((l) => l.startsWith(`    implement: over budget (${own}), $3.40 of $3.`));
        assert.ok(offer?.includes(`nemia retry ${run.id} implement --budget <amount>`), lines.join('\n'));
        indexOf(lines, '    cost  $3.40 · budget $3');
        assert.ok(!lines.some((l) => /its tries have cost its budget: or more/.test(l)), 'the shared reason is gone');
      }
    },
  );

  await s.test(
    "UNSIGNED after the run's own nudge: `nemia decide` and `nemia ls` say the run nudged it to sign off once, and that it ended unsigned again — the nudge spent, the step yours",
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
      indexOf(await screen(c, run.id), /^ {2}UNSIGNED: implement \(asked to sign off once by the run, and unsigned again\)/);
      const ls = await listed(c, run.id);
      assert.ok(
        ls.some((l) => /^ {3}implement +unsigned .*try 2, asked to sign off by the run/.test(l)),
        ls.join('\n'),
      );
    },
  );
});

test('a run on two branches, side by side: each read, each in full, the longer note cut, and both dropped together', async (t) => {
  const s = story(t);
  let id = '';
  let lines: string[] = [];

  await s.test('implement and docs work side by side, each committing on the branch the place cut for it', async () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
    fs.writeFileSync(path.join(dir, 'docs.md'), '---\nplace: git\n---\nwrite it down\n');
    id = (await stage.runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: dir }))).id;
    assert.deepEqual((await tick(id)).filed.sort(), ['docs', 'implement']);
    commitIn(readRun(id).steps.implement.workspace!, { 'sub.ts': 'export const sub = (a, b) => a - b;\n' }, 'add sub.ts');
    commitIn(
      readRun(id).steps.docs.workspace!,
      { 'NOTES.md': Array.from({ length: 123 }, (_, i) => `note ${i + 1}\n`).join('') },
      'add NOTES.md',
    );
    settle(`${id}-implement`, 'succeeded', { closeout: SIGNED });
    settle(`${id}-docs`, 'succeeded', { closeout: SIGNED });
    await tick(id);
  });

  await s.test('`nemia decide` reads what each branch touched, and the check files in full on each', async (c) => {
    lines = await screen(c, id);
    indexOf(lines, '  UNVERIFIED: docs, implement  — no check: declared; only its own word says it worked');
    const run = indexOf(lines, `  touched  wf/${id}/run`);
    assert.equal(lines[run + 1], '    (root)  1 file   +123 −0');
    const implement = indexOf(lines, `  touched  wf/${id}/implement`);
    assert.equal(lines[implement + 1], '    (root)  1 file   +1 −0');
    for (const branch of [`wf/${id}/run`, `wf/${id}/implement`]) {
      const heading = indexOf(
        lines,
        `  ── in full: the check-affecting files — what a change could edit to make its check pass, on ${branch} ───`,
      );
      assert.equal(lines[heading + 1], '  none');
    }
  });

  await s.test('a note longer than the screen shows is cut, saying how many more lines there are and where to read them', async () => {
    const at = indexOf(lines, `  wf/${id}/run  — 1 file: +123 −0`);
    const heading = indexOf(lines, /^ {2}── NOTES\.md ─+$/);
    const more = indexOf(lines, new RegExp(`^ {2}… \\d+ more lines — .*wf/${id}/run:NOTES\\.md$`));
    assert.ok(at < heading && heading < more && lines.slice(heading, more).includes('  note 1'), lines.join('\n'));
    assert.ok(!lines.includes('  note 121'), 'cut before its end: the whole of it is read off its branch');
    assert.equal(lines[more + 1], `  wf/${id}/implement  — 1 file: +1 −0`);
  });

  await s.test('both branches stand ahead of main; the run branch is landed, and both are dropped together', async () => {
    indexOf(lines, `  branch    wf/${id}/run is ahead of main by 1 commit`);
    indexOf(lines, `  branch    wf/${id}/implement is ahead of main by 1 commit`);
    const [land, drop] = lines.slice(-2);
    assert.ok(land?.startsWith('  land it   ') && land.includes(`wf/${id}/run`) && !land.includes(`wf/${id}/implement`), land);
    assert.ok(drop?.startsWith('  drop it   ') && drop.includes(`wf/${id}/run`) && drop.includes(`wf/${id}/implement`), drop);
  });
});

/**
 * `nemia decide`'s program says in its type what it needs and what it refuses: run without the engine, it does not typecheck, and a
 * refusal is its failure. Nothing calls this: the typecheck reads its lines, and an `@ts-expect-error` over code that stops erring is
 * the failure.
 */
async function _decideProgramTypes() {
  const { Effect } = await import('effect');
  void (decideRun('x') satisfies EffectOf<Decided, Refusal, EngineService | PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (decideRun('x') satisfies EffectOf<Decided, never, EngineService>);
  // @ts-expect-error -- decideRun requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(decideRun('x'));
}
