/**
 * `nemia decide`'s screen, end to end: a real repository, a run started for real, and a board settled by
 * hand. What the branch touched, the lesson line and the check-affecting files in full sit between the
 * verdicts and the closeouts; what each step consumed sits beside its check; the commands are unchanged.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, TaskPhase } from '../src/run.ts';
import type { Effect as EffectOf } from 'effect/Effect';
import type { Decided } from '../src/decide/decide.verb.ts';
import type { Refusal } from '../src/refusal/refusal.ts';
import type { EngineService } from '../src/runtime-client.ts';
import { scratch } from './scratch.ts';
import { decideScreen } from './screens.ts';
import { promised } from './promised.ts';
import { runGiven, runOver } from './placed.ts';
import type { PlaceService } from '../src/place/place.store.ts';

const ROOT = scratch('wf-decide-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
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
  touchedLines,
  runWith: runEngine,
  gitPlaceLayer,
  builtinGitPlace,
} = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { passStanding } = await import('../src/standing/standing.verb.ts');
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(listRuns()));
const { metered } = await import('../src/meter/tally.store.ts');
const { main } = await import('../src/cli/main.ts');

/** A run this file started on a repository, as `changesOf` reads one: a repository run. */
const repositoryRun = (run: Run): RepositoryRun => {
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' });
const write = (repo: string, file: string, text: string | Uint8Array) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
};

/** A repository with a workspace package that has a source file and a test. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  write(repo, 'package.json', JSON.stringify({ workspaces: ['packages/*'] }));
  write(repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\n');
  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.equal(add(1, 1), 2);\n");
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'base');
  return repo;
};

/** A branch off the repository's HEAD with `change` committed on it; the checkout is left where it was. */
const branchOff = (repo: string, branch: string, change: () => void) => {
  git(repo, 'checkout', '-q', '-b', branch);
  change();
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'the work');
  git(repo, 'checkout', '-q', 'main');
};

/** How a settled attempt ended, beside `harness`: the reason it ended for, and the facts the runtime records with it. */
type Ended = { reason?: string; closedOut?: boolean; former?: 'unsigned' };

/** An end an old journal wrote `failed`, `unsigned`, as the runtime reads it back. */
const FORMER_UNSIGNED: Ended = { reason: 'harness', closedOut: false, former: 'unsigned' };

/**
 * A board a test settles by hand. A settled attempt carries the usage it is given, as the engine records it. The n-th task filed is filed
 * 10n minutes after the board's midnight, its attempt started 5 s and spawned 12 s after that, and ended 5 minutes after filing once it
 * settled; each view and the feed carry its filing. `fed` counts the reads of the feed, and `viewed` how many times each task was viewed:
 * every view is a harness observe. While `carries.on`, a view carries what no screen reads, as the engine's does: the task's admission
 * (`queued`, `admitted`, and the view's `admission` while it waits) and the `claude.remoteControl` it was filed with.
 */
const board = () => {
  type Filed = { id: string; priority?: number; closeoutSchema?: object; config?: { claude?: { remoteControl?: true | string } } };
  const tasks = new Map<
    string,
    { spec: Filed; phase: TaskPhase; closeout?: unknown; usage?: object; end?: Ended; exitCode?: number; filedAt: number }
  >();
  const T0 = Date.parse('2026-09-13T00:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const logs = new Map<string, string>();
  const viewed = new Map<string, number>();
  const carries = { on: true };
  const fed = { reads: 0 };
  const e = promised({
    view: async (id: string) => {
      viewed.set(id, (viewed.get(id) ?? 0) + 1);
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        ...(t && carries.on && t.phase === 'pending' ? { admission: 'queued' } : {}),
        state: {
          brief: t ? 'filed' : '',
          ...(t ? { filedAt: iso(t.filedAt) } : {}),
          closeoutSchema: t?.spec.closeoutSchema,
          settled,
          stopRequested: false,
          ...(t && carries.on ? { queued: true, ...(t.phase === 'pending' ? {} : { admitted: 0 }), config: t.spec.config } : {}),
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    startedAt: iso(t.filedAt + 5_000),
                    spawnedAt: iso(t.filedAt + 12_000),
                    endedAt: settled ? iso(t.filedAt + 300_000) : null,
                    ...(settled ? { reason: 'harness', ...t.end } : { reason: null }),
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    usage: t.usage ?? null,
                    exitCode: t.exitCode ?? null,
                  },
                ],
        },
      };
    },
    file: async (spec: Filed) => {
      tasks.set(spec.id, { spec, phase: 'pending', filedAt: T0 + tasks.size * 600_000 });
      return spec.id;
    },
    feed: async () => (
      fed.reads++,
      { entries: [...tasks].map(([taskId, t]) => ({ taskId, event: { kind: 'filed', at: iso(t.filedAt) } })), cursor: tasks.size }
    ),
    stop: async () => {},
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
    output: async () => undefined,
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object, end?: Ended, exitCode?: number) =>
    Object.assign(tasks.get(id)!, { phase, closeout, usage, end, exitCode });
  const filed = (id: string): Filed | undefined => tasks.get(id)?.spec;
  return { e, settle, logs, viewed, carries, filed, fed };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const USAGE = { responses: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 };

/**
 * `implement`, checked by `npm test` and with whatever other keys it is given, each ending with a newline, then `review`, with no check.
 */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\nplace: git\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/**
 * A run waiting on you: implement verified, with usage; review unverified, with none. Its branch weakened
 * a test, added to a source file, wrote a lesson in CLAUDE.md and added a binary file. Its steps worked on
 * a branch of their own, as a run with worktrees does, and the record says where.
 */
const awaiting = async (implementKeys = '') => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder(implementKeys), isolate: false }));
  const branch = `wf/${run.id}`;
  branchOff(repo, branch, () => {
    fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
    write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
    write(repo, 'CLAUDE.md', 'lesson one\nlesson two\n');
    write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
  });

  const { e, settle, logs, viewed, carries, filed, fed } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED, USAGE);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-check`, 'succeeded', undefined, undefined, undefined, 0);
  logs.set(`${run.id}-implement-check`, '# pass 1\n');
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', SIGNED);

  const record = readRun(run.id);
  for (const s of Object.values(record.steps)) s.branch = branch;
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  return { run: record, repo, branch, e, settle, viewed, carries, filed, fed };
};

/** What `nemia decide` prints, line by line. */
const screen = async (t: TestContext, e: Engine, ...argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await main(['decide', ...argv], e);
  } finally {
    log.mock.restore();
  }
  return out.join('\n').split('\n');
};

/** What `nemia ls <run>` prints, line by line. */
const listed = async (t: TestContext, e: Engine, id: string): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await main(['ls', id], e);
  } finally {
    log.mock.restore();
  }
  return out.join('\n').split('\n');
};

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

test('the awaiting screen: what the branch touched, the lesson, and the check files in full — between the verdicts and the closeouts', async (t) => {
  const { run, repo, branch, e, viewed, fed } = await awaiting();
  viewed.clear();
  fed.reads = 0;
  const lines = await screen(t, e, run.id);
  assert.deepEqual(
    Object.fromEntries(viewed),
    { [`${run.id}-implement`]: 1, [`${run.id}-implement-check`]: 1, [`${run.id}-review`]: 1 },
    'each task viewed once for the whole screen, usage included: every view is a harness observe',
  );

  const verdict = indexOf(lines, /^  UNVERIFIED: review/);
  const touched = indexOf(lines, `  touched  ${branch}`);
  assert.deepEqual(lines.slice(touched + 1, touched + 5), [
    '    (root)      2 files  +2 −0 · 1 binary',
    '    packages/x  2 files  +2 −1',
    '    agent-facing     CLAUDE.md',
    '    check-affecting  packages/x/test/add.test.ts',
  ]);
  const lesson = indexOf(lines, '  lesson  CLAUDE.md +2 −0');
  const inFull = indexOf(lines, /^  ── in full: the check-affecting files — what a change could edit to make its check pass/);
  assert.ok(
    lines.includes('  -assert.equal(add(1, 1), 2);') && lines.includes('  +assert.ok(true);'),
    `the weakened assertion, whole:\n${lines.join('\n')}`,
  );
  assert.ok(!lines.some((l) => l.includes('export const sub')), 'the source change decides nothing about the check: it is not in full');
  const implement = indexOf(lines, '  implement');
  assert.ok(verdict < touched && touched < lesson && lesson < inFull && inFull < implement, 'in that order, before the closeouts');

  const check = indexOf(lines, /^    check  npm test  →/);
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

  assert.equal(
    fed.reads,
    0,
    "the feed, which holds every task the engine ever filed, is not read for one run: the times come off the engine's attempts and each task's filing time on its view",
  );
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
    review < total && total < indexOf(lines, new RegExp(`^  ${branch}`)),
    "the run's timeline, after the steps, before the branches: one round, so the run's line alone",
  );

  assert.deepEqual(
    lines.slice(-2),
    [`  land it   git -C ${repo} merge --no-ff ${branch}`, `  drop it   git -C ${repo} branch -D ${branch}`],
    'the commands stay as they are',
  );
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main', 'none of the commands is run');
  assert.ok(git(repo, 'branch', '--list', branch).trim(), 'the branch is still there');
});

test('a place whose report is not heard: `nemia decide` says what the run changed is not known — touched, the lesson, in full and the branch — never that it changed nothing', async (t) => {
  const { run, branch, e } = await awaiting();
  const before = process.env.PATH;
  process.env.PATH = scratch('wf-decide-no-git-');
  let lines: string[];
  try {
    lines = await screen(t, e, run.id);
  } finally {
    process.env.PATH = before;
  }
  const unknown = "what this run changed is not known: the place's report was not heard: ";
  const said = (prefix: string) => lines.filter((l) => l.startsWith(`${prefix}${unknown}`));
  assert.equal(said(`  touched  ${branch}  —  `).length, 1, `with no git to run, the place's report exits 1:\n${lines.join('\n')}`);
  assert.equal(said(`  ${branch}  — `).length, 1, "the branch's counts are not known, never none");
  assert.ok(lines.includes(`  lesson  not known — ${branch} could not be read`), lines.join('\n'));
  assert.ok(!lines.some((l) => /touched nothing|^\s+\(root\)/.test(l)), 'nothing is said as changed or unchanged');
  const inFull = indexOf(lines, /^  ── in full: the check-affecting files/);
  assert.ok(lines[inFull + 1]?.startsWith(`  ${unknown}`), `its files in full are not known either: ${lines[inFull + 1]}`);
});

test("`nemia decide` and `nemia ls` say nothing of a run's momentum, its admission or a step's Remote Control: the same screens, line for line, whether the engine's record carries the admission and the `claude.remoteControl` the run's filings were made with or not", async (t) => {
  const { run, e, carries, filed } = await awaiting('remote: true\n');
  const ids = [`${run.id}-implement`, `${run.id}-implement-check`, `${run.id}-review`];
  assert.deepEqual(
    ids.map((id) => [filed(id)?.priority, filed(id)?.config?.claude?.remoteControl]),
    [
      [0, true],
      [1, undefined],
      [1, undefined],
    ],
    'filed with their Remote Control, and each with its momentum as `priority`: a first step 0, its check and the step after it 1',
  );
  const screens = async () => ({ decide: await screen(t, e, run.id), ls: await listed(t, e, run.id) });
  const carried = await screens();
  carries.on = false;
  assert.deepEqual(await screens(), carried);
  assert.ok(
    !Object.values(carried)
      .flat()
      .some((l) => /priority|momentum|remote|bridge/i.test(l)),
    [...carried.decide, ...carried.ls].join('\n'),
  );
});

test('--sensitive with a glob that matches nothing prints the heading, and none', async (t) => {
  const { run, e } = await awaiting();
  const lines = await screen(t, e, run.id, '--sensitive', 'nothing/**');
  const heading = indexOf(lines, /^  ── in full: the files --sensitive names \(nothing\/\*\*\)/);
  assert.equal(lines[heading + 1], '  none');
  assert.ok(!lines.includes('  +assert.ok(true);'), 'the default list is replaced, not added to');
  assert.ok(
    lines.includes('    check-affecting  packages/x/test/add.test.ts'),
    'the flag chooses what is read whole, not what is true: the radius still names the check file',
  );
});

test('`nemia decide` refuses a flag it does not take, and --sensitive without globs or twice — before a run is read', async () => {
  const refused = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);
  for (const [flags, pattern] of [
    [['--sensitve', 'src/**'], /^nemia decide does not take --sensitve\./],
    [['--sensitive'], /^--sensitive takes the globs/],
    [['--sensitive', '--sensitive', 'src/**'], /^--sensitive takes the globs/],
    [['--sensitive', ' , '], /^--sensitive takes the globs/],
    [['--sensitive', 'a', '--sensitive', 'b'], /^nemia decide takes --sensitive once/],
  ] as const) {
    await assert.rejects(main(['decide', 'no-such-run', ...flags]), refused(pattern), flags.join(' '));
  }
  for (const argv of [['--sensitive', 'src/**', 'no-such-run'], ['--sensitive']]) {
    await assert.rejects(
      main(['decide', ...argv]),
      (err: Error & { exitCode?: number; _tag?: string }) =>
        err._tag === 'Invalid' &&
        err.exitCode === 2 &&
        err.message.startsWith('nemia decide takes the run first') &&
        err.message.includes('nemia decide <runId> [--sensitive <globs>]'),
      `${argv.join(' ')}: a flag before the run is refused, not answered with the general help, which exits 0 and says nothing of the order`,
    );
  }
  await assert.rejects(
    main(['decide', 'no-such-run', '--sensitive', 'src/**']),
    (err: Error) => !/sensitive/.test(err.message),
    'the flag it takes gets as far as reading the run, which is not there',
  );
});

test('`nemia decide --help` prints the lists the screen uses, from the one place they are written', async (t) => {
  const out: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  await main(['decide', '--help']);
  const text = out.join('\n');
  assert.match(text, /^nemia decide <runId> \[--sensitive <globs>\]/);
  for (const list of [CHECK_AFFECTING, AGENT_FACING, LESSON]) assert.ok(text.includes(list.join(', ')), list.join(', '));
});

test("what a branch touched is the place's report: a rename at both ends, a binary file, a file in no directory, today's lines — and a branch that is gone is not read as nothing", async () => {
  const repo = aRepo();
  const run = repositoryRun(await runPlaced(startRun({ brief: 'move the test', repo, workflowDir: folder(), isolate: false })));
  branchOff(repo, 'wf/moved', () => {
    fs.mkdirSync(path.join(repo, 'packages/x/spec'));
    git(repo, 'mv', 'packages/x/test/add.test.ts', 'packages/x/spec/add.test.ts');
    write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
    write(repo, 'NOTES', 'one\n');
  });

  const [moved] = changesOf(builtinGitPlace, run, ['wf/moved']);
  const r = moved.radius;
  assert.ok(!('error' in r), JSON.stringify(r));
  assert.deepEqual(
    [...r.changes].sort((a, b) => a.path.localeCompare(b.path)),
    [
      { path: 'logo.png', status: 'A', added: null, removed: null },
      { path: 'NOTES', status: 'A', added: 1, removed: 0 },
      { from: 'packages/x/test/add.test.ts', path: 'packages/x/spec/add.test.ts', status: 'R', added: 0, removed: 0 },
    ],
  );
  assert.deepEqual(
    touchedLines([moved]),
    [
      'touched  wf/moved',
      '  (root)      2 files  +1 −0 · 1 binary',
      '  packages/x  1 file   +0 −0',
      '  check-affecting  packages/x/test/add.test.ts → packages/x/spec/add.test.ts',
    ],
    "grouped by the base's workspaces, a binary file counted with no lines and a rename at both ends, as the lines were",
  );
  assert.equal(typeof moved.inFull, 'string');
  assert.match(moved.inFull as string, /^rename from packages\/x\/test\/add\.test\.ts$/m, 'asked by its path, the place shows a rename');
  assert.match(moved.inFull as string, /^rename to packages\/x\/spec\/add\.test\.ts$/m);

  const [gone] = changesOf(builtinGitPlace, run, ['wf/never']);
  const notKnown = `what this run changed is not known: the place has no branch wf/never in ${repo}`;
  assert.deepEqual(gone, { branch: 'wf/never', radius: { error: notKnown }, inFull: { error: notKnown }, notes: { error: notKnown } });
  assert.equal(lessonLine([gone]), 'lesson  not known — wf/never could not be read');
});

test("a branch that touched a lint config lists it as check-affecting, with its whole diff from the place's diffs", async () => {
  const repo = aRepo();
  const run = repositoryRun(await runPlaced(startRun({ brief: 'quiet a rule', repo, workflowDir: folder(), isolate: false })));
  branchOff(repo, 'wf/lint', () => {
    write(repo, '.oxlintrc.json', '{ "rules": { "no-console": "off" } }\n');
    write(repo, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b + 0;\n');
  });
  const [lint] = changesOf(builtinGitPlace, run, ['wf/lint']);
  assert.ok(!('error' in lint.radius), JSON.stringify(lint.radius));
  assert.deepEqual(lint.radius.checkAffecting, ['.oxlintrc.json']);
  assert.match(lint.inFull as string, /^\+\{ "rules": \{ "no-console": "off" \} \}$/m);
  assert.doesNotMatch(lint.inFull as string, /add\.ts/, 'a file no glob names is not printed in full');
});

test("the lesson line reads the base's workspaces: a package's docs/ is a lesson, a docs/ in its source is not", async () => {
  const repo = aRepo();
  const run = repositoryRun(await runPlaced(startRun({ brief: 'document it', repo, workflowDir: folder(), isolate: false })));
  branchOff(repo, 'wf/source-docs', () => write(repo, 'packages/x/src/docs/strings.ts', 'export const title = "Docs";\n'));
  branchOff(repo, 'wf/package-docs', () => {
    write(repo, 'packages/x/src/docs/strings.ts', 'export const title = "Docs";\n');
    write(repo, 'packages/x/docs/features.md', 'what is left\n');
  });
  const read = (branch: string) => lessonLine(changesOf(builtinGitPlace, run, [branch]));
  assert.equal(read('wf/source-docs'), 'lesson  nothing written where the next agent reads');
  assert.equal(read('wf/package-docs'), 'lesson  packages/x/docs/features.md +1 −0');
});

test('what a step consumed is summed over its attempts — one that never started left out, the one in flight read off the view', () => {
  const views: Record<string, unknown> = {
    t1: {
      usage: { responses: 1, toolCalls: 1, inputTokens: 5, outputTokens: 1 },
      state: {
        attempts: [
          { reason: 'unstartable', endedAt: '2026-09-13T00:00:00Z', usage: null },
          { reason: 'harness', endedAt: '2026-09-13T00:01:00Z', usage: { responses: 2, toolCalls: 3, inputTokens: 10, outputTokens: 1 } },
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
});

test('`nemia decide` on a try a person answered: its line says so, and under it what the try before needed and your answer, read off the ask; a blocked step is told the nemia retry --message that answers it', async (t) => {
  const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
  const { e, settle } = board();
  const blocked = (needs: string) => ({ outcome: 'blocked', summary: 'two readings', artifacts: [], needs });
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', blocked('Rename --flag, or keep it?'));
  await runWith(e, advanceRun(readRun(run.id)));

  const asking = await screen(t, e, run.id);
  const needs = indexOf(asking, '    needs: Rename --flag, or keep it?');
  assert.equal(
    asking[needs + 1],
    `    to answer it:  nemia retry ${run.id} implement --message "<answer>"`,
    'the question, then the command that answers it',
  );
  indexOf(
    asking,
    `    implement: blocked. Continue its session, told what happened:  nemia retry ${run.id} implement  (--fresh, or --model <m>, for a new session)`,
  );
  assert.ok(!asking.some((l) => /^ {4}your answer: |^ {4}try \d+ needs: |answered\)$/.test(l)), 'nothing answered yet');

  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: 'Keep it.\nThe flag is public.' }));
  indexOf(await screen(t, e, run.id), '  implement: try 2 asked (--continue, with your answer) — the next tick files it');

  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-try2`, 'succeeded', blocked('And the README, too?'));
  await runWith(e, advanceRun(readRun(run.id)));
  const lines = await screen(t, e, run.id);
  const head = indexOf(lines, '  implement  BLOCKED  (try 2, nudged on your word, answered)');
  const question = indexOf(lines, '    try 1 needs: Rename --flag, or keep it?');
  assert.deepEqual(lines.slice(question + 1, question + 3), ['    your answer: Keep it.', '    The flag is public.']);
  assert.ok(
    head < question && question < indexOf(lines, '    needs: And the README, too?'),
    'the question and its answer, then what the try made of them',
  );
  assert.ok(
    !fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8').includes('The flag is public'),
    'composed on read: the record keeps no message',
  );
});

test("a measured cost on both screens: `nemia decide` prints each step's beside what it used, with the api and tool time, and the run's after the steps; `nemia ls` puts each step's beside its word and the run's on its line — and a run nobody measured prints no dollar", async (t) => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder(), isolate: false }));
  const { e, settle, logs } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED, { ...USAGE, costUsd: 3.012, apiMs: 486_000, toolMs: 2_400 });
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-check`, 'succeeded', undefined, undefined, undefined, 0);
  logs.set(`${run.id}-implement-check`, '# pass 1\n');
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', SIGNED, { costUsd: 0.5 });

  const lines = await screen(t, e, run.id);
  const check = indexOf(lines, /^    check  npm test  →/);
  assert.deepEqual(lines.slice(check + 1, check + 3), [
    '    used  29 responses · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s',
    '    cost  $3.01',
  ]);
  assert.match(
    lines[check + 3],
    /^    timeline  try 1 .*  used 29 responses · 93 tool calls · 6\.35M in · 112k out · api 8m06s · tools 2s  cost \$3\.01$/,
  );
  const review = indexOf(lines, '  review');
  assert.deepEqual(lines.slice(review + 1, review + 3), [
    '    used  responses not measured · tool calls not measured · tokens in not measured · tokens out not measured',
    '    cost  $0.50',
  ]);
  const total = indexOf(lines, '  cost  run $3.51');
  assert.ok(review < total && total < indexOf(lines, /^  timeline  run /), "after the steps, beside the run's time");

  const ls = async (id: string): Promise<string[]> => {
    const out: string[] = [];
    const log = t.mock.method(console, 'log', (...args: unknown[]) => {
      out.push(args.map(String).join(' '));
    });
    try {
      await main(['ls', id], e);
    } finally {
      log.mock.restore();
    }
    return out;
  };
  const listed = await ls(run.id);
  assert.equal(listed[0], `${run.id}  add sub  $3.51`);
  assert.match(listed[1], /^   implement      verified ✓  \$3\.01 +\S/);
  assert.match(listed[2], /^   review         unverified · done  \$0\.50 +\S/);

  const unmeasured = await awaiting();
  assert.ok(
    !(await ls(unmeasured.run.id)).some((l) => l.includes('$')),
    'the run the other screen tests read measured no cost: no dollar on `nemia ls`',
  );
  const bare = await screen(t, unmeasured.e, unmeasured.run.id);
  assert.ok(
    bare.includes('  cost  run not measured') && !bare.some((l) => l.includes('$')),
    `nor on \`nemia decide\`, where the run's cost says not measured:\n${bare.join('\n')}`,
  );
});

test('REFUSED to hide why a step stopped past its budget: `nemia decide` on a step whose session failed after spending its budget says FAILED with its logs, and one that ended unsigned says UNSIGNED, each beside the OVER BUDGET line — and the offer names both', async (t) => {
  const budgeted = () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nbudget: 3\n---\nimplement it\n');
    fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
    return dir;
  };
  const cases = [
    ['failed', 'failed', (id: string) => `  FAILED: implement  (nemia logs ${id} <step>)`],
    [
      'unsigned',
      'succeeded',
      () =>
        '  UNSIGNED: implement  — ended without the closeout it was asked for, or without a field its output: declares, or its closeout named a file the run does not have; nothing after it ran',
    ],
  ] as const;
  for (const [own, phase, banner] of cases) {
    const run = await runPlaced(startRun({ brief: `add sub, ${own}`, repo: aRepo(), workflowDir: budgeted(), isolate: false }));
    const { e, settle } = board();
    await runWith(e, advanceRun(readRun(run.id)));
    settle(`${run.id}-implement`, phase, undefined, { costUsd: 3.4 });
    const lines = await screen(t, e, run.id);
    const said = indexOf(lines, banner(run.id));
    const over = indexOf(
      lines,
      '  OVER BUDGET, waiting on you: implement ($3.40 of $3)  — the run files nothing more for it on its own; nothing after it ran',
    );
    assert.ok(said < over, `${own}, with no closeout: why it stopped, then why nothing more is filed`);
    indexOf(
      lines,
      `    implement: over budget (${own}), $3.40 of $3. Raise its cap above $3.40 and continue its session:  nemia retry ${run.id} implement --budget <amount>  (--fresh, or --model <m>, for a new session)`,
    );
    indexOf(lines, '    cost  $3.40 · budget $3');
    assert.ok(!lines.some((l) => /its tries have cost its budget: or more/.test(l)), 'the shared reason is gone');
  }
});

test("UNSIGNED after the run's own nudge: `nemia decide` and `nemia ls` say the run nudged it to sign off once, and that it ended unsigned again — the nudge spent, the step yours", async (t) => {
  const run = await runPlaced(startRun({ brief: 'add sub, unsigned', repo: aRepo(), workflowDir: folder(), isolate: false }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'failed', undefined, undefined, FORMER_UNSIGNED);
  assert.deepEqual(
    (await runWith(e, advanceRun(readRun(run.id)))).notes.filter((n) => n.startsWith('implement:')),
    ['implement: try 2 — a nudge to sign off, once a round'],
    'a session that ended without calling StructuredOutput, as the engine records it: failed, its last attempt unsigned',
  );
  settle(`${run.id}-implement-try2`, 'failed', undefined, undefined, FORMER_UNSIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const lines = await screen(t, e, run.id);
  indexOf(
    lines,
    '  UNSIGNED: implement (nudged to sign off once by the run, and unsigned again)  — ended without the closeout it was asked for, or without a field its output: declares, or its closeout named a file the run does not have; nothing after it ran',
  );
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.map(String).join(' '));
  });
  try {
    await main(['ls', run.id], e);
  } finally {
    log.mock.restore();
  }
  assert.ok(
    out.some((l) => /^ {3}implement +unsigned .*try 2, nudged to sign off by the run/.test(l)),
    out.join('\n'),
  );
});

test("the branch's standing against the base is a fact on every screen — on it, ahead by N, gone", async (t) => {
  const { run, repo, branch, e } = await awaiting();
  assert.ok((await screen(t, e, run.id)).includes(`  branch    ${branch} is ahead of main by 1 commit`));

  git(repo, 'merge', '-q', '--no-ff', '--no-edit', branch);
  assert.deepEqual(
    await screen(t, e, run.id),
    [`${run.id}  add sub`, '', `  landed — ${branch} is already on main`],
    'merged by hand, as a person lands a run with no ending step: the run reads landed, and there is nothing left to decide',
  );

  const { run: other, repo: otherRepo, branch: otherBranch, e: otherEngine } = await awaiting();
  git(otherRepo, 'branch', '-D', otherBranch);
  assert.ok(
    (await screen(t, otherEngine, other.id)).includes(`  branch    ${otherBranch} is gone: git no longer has it`),
    'a branch deleted with no tip recorded for it is gone',
  );
});

/** The ending's own words, as the folder below writes them: what `nemia decide` echoes as what approving it does. */
const SHIP_IT = "Ship it: trial merge this run's result branch onto main, run the check, and commit.";

test("a folder whose last step is an ending: `nemia decide` says what that step would do in the folder's words, and the word that runs it — and prints no git command, since the step is the one that merges", async (t) => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(
    path.join(dir, 'ship.md'),
    `---\nafter: implement\nplace: git\nworkspace: main\ngate: true\n---\n${SHIP_IT}\n\nAbort on any failure.\n`,
  );
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  write(work.workspace!, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  const branch = work.branch!;
  assert.equal(readRun(run.id).steps.ship.taskId, null, 'nothing of the ending is filed without a person');

  const lines = await screen(t, e, run.id);
  indexOf(
    lines,
    "  AWAITING APPROVAL, waiting on you: ship  — this workflow's ending, at its gate: nothing of it has run, and your approval is what runs it",
  );
  indexOf(lines, `  branch    ${branch} is ahead of main by 1 commit`);
  const decide = indexOf(lines, "  to decide  ship has not run: this workflow's ending, and your approval is what runs it:");
  assert.deepEqual(lines.slice(decide + 1, decide + 5), [
    `    ${SHIP_IT}`,
    '',
    `  approve it    nemia approve ${run.id} ship [--message "<words>"]`,
    `  send it back  nemia retry ${run.id} implement --message "<objection>"`,
  ]);
  assert.ok(!lines.some((l) => /land it   git|drop it   git/.test(l)), 'the folder says what landing is, so nobody is told to type it');

  const said = await listed(t, e, run.id);
  indexOf(said, `   → to decide: ${SHIP_IT} — nemia approve ${run.id} ship`);
  assert.ok(
    !said.some((l) => l.includes('waiting on you')),
    '`nemia ls` says it in one line, where it says who the run waits on: the ending is not said twice',
  );
  indexOf(said, /^   ship {11}awaiting approval/);
});

/** A folder of `implement`, then `ship`, its ending, gated and merging on the base branch. */
const shipping = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nplace: git\nworkspace: main\ngate: true\n---\nShip it.\n');
  return dir;
};

/** A run of `dir` on `repo` whose implement committed `file` as `text` on its branch, left running or settled as `settled` says. */
const working = async (repo: string, dir: string, file: string, text: string, settled: boolean) => {
  const run = await runPlaced(startRun({ brief: `write ${file}`, repo, workflowDir: dir }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  write(work.workspace!, file, text);
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', `write ${file}`);
  if (settled) {
    settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await runWith(e, advanceRun(readRun(run.id)));
  }
  return { id: run.id, branch: work.branch!, e };
};

test("at an ending's gate, `nemia decide` says which runs in flight on the base its branch collides with, and in which files; REFUSED: a run still running reads none", async (t) => {
  const repo = aRepo();
  const dir = shipping();
  const add = 'packages/x/src/add.ts';
  const ours = await working(repo, dir, add, 'export const add = (a, b) => b + a;\n', true);
  const theirs = await working(repo, dir, add, 'export const add = (a, b) => a + b + 0;\n', false);
  const apart = await working(repo, dir, 'packages/x/src/sub.ts', 'export const sub = (a, b) => a - b;\n', false);

  const { collisions } = await runWith(ours.e, decideRun(ours.id));
  assert.deepEqual([...(collisions?.inFlight ?? [])].sort(), [theirs.id, apart.id].sort());
  assert.deepEqual(
    collisions?.colliding.map((c) => [c.run, c.branch, c.ours, c.merge]),
    [[theirs.id, theirs.branch, ours.branch, { clean: false, conflicts: [add] }]],
  );
  const lines = await screen(t, ours.e, ours.id);
  const at = indexOf(lines, `  branch    ${ours.branch} is ahead of main by 1 commit`);
  assert.deepEqual(lines.slice(at + 1, at + 4), [
    `  merges    ${ours.branch} merges cleanly onto main`,
    `  others    collides with 1 of the 2 runs in flight on main: ${theirs.id}`,
    `  collides  ${ours.branch} conflicts with ${theirs.id}'s ${theirs.branch} in 1 file: ${add}`,
  ]);

  const running = await runWith(theirs.e, decideRun(theirs.id));
  assert.equal(running.decision.kind, 'running');
  assert.equal(running.collisions, undefined, 'a run still running is at no ending, and no trial merge is asked for it');
});

test("REFUSED: an ending led by an agent that says `You are …` — `nemia decide` and `nemia ls` say the step's own note, or with none, that approving runs it, and never quote the agent", async (t) => {
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  fs.mkdirSync(path.join(team, 'agents'));
  fs.writeFileSync(
    path.join(team, 'agents', 'otto.md'),
    "---\nmodel: opus\n---\nYou are Otto, a release engineer. You land a run's result in the repository's own checkout.\n\nNever push.\n",
  );
  const LANDS = "Land this run's result on main: stage the merge of its branch, and sign off with the commit message.";
  const atGate = async (note: string) => {
    const dir = fs.mkdtempSync(path.join(team, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
    fs.writeFileSync(
      path.join(dir, 'land.md'),
      `---\nafter: implement\nplace: git\nworkspace: main\ngate: true\nagent: otto\n---\n${note}`,
    );
    const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: dir }));
    const { e, settle } = board();
    await runWith(e, advanceRun(readRun(run.id)));
    const work = readRun(run.id).steps.implement;
    write(work.workspace!, 'packages/x/src/add.ts', 'export const sub = (a, b) => a - b;\n');
    git(work.workspace!, 'commit', '-qam', 'add sub');
    settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await runWith(e, advanceRun(readRun(run.id)));
    return { id: run.id, lines: await screen(t, e, run.id), said: await listed(t, e, run.id) };
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
  assert.deepEqual(bare.lines.slice(heading + 1, heading + 3), ['', `  approve it    nemia approve ${bare.id} land [--message "<words>"]`]);
  indexOf(bare.said, `   → to decide: land has not run: approving runs it — nemia approve ${bare.id} land`);

  for (const shown of [noted.lines, noted.said, bare.lines, bare.said]) {
    assert.ok(!shown.some((l) => l.includes('You are')), shown.join('\n'));
  }
});

test('a gate on the last step of a folder that merges nothing: approving accepts what the step did — its own prose is not offered as what happens next — and the branch keeps its git commands', async (t) => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: folder(), gates: ['review'] }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const work = readRun(run.id).steps.implement;
  fs.appendFileSync(path.join(work.workspace!, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-check`, 'succeeded');
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', SIGNED);
  const branch = readRun(run.id).steps.review.branch!;

  const held = await screen(t, e, run.id);
  indexOf(held, '  to decide  review has signed off and waits for your word:');
  indexOf(held, `  approve it    nemia approve ${run.id} review [--message "<words>"]`);
  assert.ok(!held.some((l) => l.includes('Review the change in this workspace')), "the step's brief is not what happens next");
  assert.ok(!held.some((l) => /land it   git/.test(l)), 'the branch is not offered while the gate holds');
  indexOf(await listed(t, e, run.id), `   → to decide: review has signed off at its gate — nemia approve ${run.id} review`);

  approveByHand(run.id, 'review', 1);
  const after = await screen(t, e, run.id);
  assert.deepEqual(
    after.slice(-2),
    [`  land it   git -C ${repo} merge --no-ff ${branch}`, `  drop it   git -C ${repo} branch -D ${branch}`],
    "review, a terminal gated step, approved: the run is over, and the branch nobody has merged is still a person's, with the commands, since no step of this folder merges",
  );
  await aPass(e);
  indexOf(await listed(t, e, run.id), `   → to decide: ${branch} is ahead of main, and nothing has merged it — nemia decide ${run.id}`);
});

test('a run that worked on the base branch itself says so, and still says what is to be decided: the screen that used to return before it', async (t) => {
  const repo = aRepo();
  const run = await runPlaced(startRun({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false, gates: ['review'] }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-check`, 'succeeded');
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-review`, 'succeeded', SIGNED);

  const direct = await screen(t, e, run.id);
  const worked = indexOf(direct, /^  worked directly on main; nothing to merge; the base was /);
  const said = indexOf(direct, '  to decide  review has signed off and waits for your word:');
  assert.ok(worked < said, 'the branch facts, then what to decide');
  indexOf(direct, `  approve it    nemia approve ${run.id} review [--message "<words>"]`);
  assert.ok(!direct.some((l) => l.startsWith('  branch    ')), 'no standing: it would read `main is on main`');
  assert.ok(!direct.some((l) => /land it   git|drop it   git/.test(l)), 'nor a merge of the branch it is already on');
});

test("a run whose one step works in the checkout is not shown the base branch's diff: its work is not on it, and the base moves under it", async (t) => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'supervise.md'), '---\nplace: git\nworkspace: main\nslot: none\n---\nWatch the runs.\n');
  const run = await runPlaced(startRun({ brief: 'supervise this repository', repo, workflowDir: dir }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-supervise`, 'succeeded', {
    outcome: 'blocked',
    summary: 'add-sub is ready to merge.',
    artifacts: [],
    needs: 'Merge add-sub, or hold it?',
  });
  await runWith(e, advanceRun(readRun(run.id)));
  assert.equal(
    readRun(run.id).steps.supervise?.branch,
    'main',
    "the step worked in the repository's own checkout, so the record names the base branch, not a branch of the run's",
  );

  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
  write(repo, 'CLAUDE.md', 'a lesson somebody else wrote\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'another run, merged');
  const [{ radius: moved }] = changesOf(builtinGitPlace, repositoryRun(readRun(run.id)), ['main']);
  assert.ok(
    !('error' in moved) && moved.changes.length === 2,
    `another run's merge moved main under the run, and that diff reads; what is refused is reading it as this run's work: ${JSON.stringify(moved)}`,
  );

  const lines = await screen(t, e, run.id);
  assert.ok(!lines.some((l) => l.startsWith('  touched ')), `no branch to read:\n${lines.join('\n')}`);
  assert.ok(!lines.some((l) => l.startsWith('  lesson ')), 'nor a lesson credited to it for what another run merged');
  assert.ok(
    !lines.some((l) => /in full: the check-affecting files/.test(l)),
    'nor every check-affecting file merged since, above the question',
  );
  const said = indexOf(lines, '    add-sub is ready to merge.');
  assert.ok(indexOf(lines, '    needs: Merge add-sub, or hold it?') > said, 'what the person came for: the summary, then the question');
  indexOf(lines, `    to answer it:  nemia retry ${run.id} supervise --message "<answer>"`);

  const direct = await runPlaced(startRun({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false }));
  fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(repo, 'commit', '-q', '-am', 'the work, on the base branch itself');
  await runWith(e, advanceRun(readRun(direct.id)));
  settle(`${direct.id}-implement`, 'failed');
  const worked = await screen(t, e, direct.id);
  assert.equal(readRun(direct.id).steps.review?.branch, undefined, 'the terminal step has no branch: the fallback is what answers');
  const where = indexOf(worked, '  touched  main');
  assert.match(
    worked[where + 1],
    /^ {4}packages\/x\s+1 file\s+\+1 −0$/,
    `a run that worked on main itself (--no-worktree) reads every branch a step worked on, main, where its work is:\n${worked.slice(where, where + 3).join('\n')}`,
  );
});

test('REFUSED at `nemia start`: --no-worktree on a workflow whose last step merges, before a run is written — such a run has no result branch', async () => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nplace: git\nworkspace: main\ngate: true\n---\nShip it.\n');
  const before = fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir, isolate: false })),
    (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2]);
      assert.ok(err.message.startsWith('ship: `workspace: main` ends this workflow'), err.message);
      assert.ok(err.message.includes('--no-worktree gives the run no result branch'), err.message);
      assert.ok(err.message.includes('Either drop --no-worktree'), 'and names the flag to drop');
      assert.ok(err.message.includes('whose last step is not an ending'), 'or the workflow to start');
      return true;
    },
  );
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length, before, 'nothing written');
  assert.ok(await runPlaced(startRun({ brief: 'add sub', repo, workflowDir: dir })), 'with worktrees, it starts');
});

test('`nemia ls` views each task once, and runs added in a repository it already reads add no git process', async (t) => {
  const { e, viewed, settle, run } = await awaiting();
  const repo = run.repo!;
  const ls = async () => {
    viewed.clear();
    const log = t.mock.method(console, 'log', () => {});
    try {
      return (await metered(() => main(['ls'], e))).tallies!.kinds.place.spawned;
    } finally {
      log.mock.restore();
    }
  };
  const oneStep = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(oneStep, 'work.md'), '---\nplace: git\n---\nwork it\n');
  const first = (await runPlaced(startRun({ brief: 'first', repo, workflowDir: oneStep, isolate: true }))).id;
  await runWith(e, advanceRun(readRun(first)));
  settle(`${first}-work`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(first)));
  const before = await ls();
  for (let k = 1; k < 4; k++) {
    const more = await runPlaced(
      startRun({ brief: `more ${k}`, repo, workflowDir: folder(), isolate: false, ...(k === 1 ? { after: [first] } : {}) }),
    );
    branchOff(repo, `wf/${more.id}`, () => write(repo, `more-${k}.txt`, 'x\n'));
    const record = readRun(more.id);
    record.steps.implement = { ...record.steps.implement, branch: `wf/${more.id}` };
    fs.writeFileSync(path.join(ROOT, 'runs', `${more.id}.json`), JSON.stringify(record, null, 2));
  }
  const after = await ls();
  assert.ok(viewed.has(`${first}-work`), 'the run of one step, finished in a worktree and waited on by the next, was read');
  assert.ok(
    [...viewed.values()].every((n) => n === 1),
    `every task viewed once: ${JSON.stringify(Object.fromEntries(viewed))}`,
  );
  assert.equal(
    after,
    before,
    "three more runs, each with a result branch, in a repository already read, add no git process: the store holds the other tests' runs too, so what is counted is what they add",
  );
});

test("`nemia decide`'s program, given the engine as a service, answers what its plain face answers: the face runs the program and adds nothing", async () => {
  const { Effect } = await import('effect');
  const { decideRun } = await import('../src/decide/decide.verb.ts');
  const { EngineService } = await import('../src/runtime-client.ts');
  const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement`, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
  await runWith(e, advanceRun(readRun(run.id)));
  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: 'Keep it.' }));
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));

  const face = await runWith(e, decideRun(run.id));
  const program = await runPlaced(decideRun(run.id).pipe(Effect.provide(EngineService.layer(e))));
  assert.deepEqual(
    face.answers.implement,
    { try: 2, message: 'Keep it.', needs: 'Rename --flag?' },
    'a try answered, and the try before read',
  );
  assert.deepStrictEqual(program, face);
});

test('`nemia decide` of a run that is not there rejects with the refusal itself: a `Missing`, exit code 2, in its words', async () => {
  const { decideRun } = await import('../src/decide/decide.verb.ts');
  const { Missing } = await import('../src/refusal/refusal.ts');
  const err = await runWith(board().e, decideRun('no-such-run')).then(
    () => assert.fail('decide of no run resolved'),
    (x: unknown) => x,
  );
  assert.ok(err instanceof Missing, `a Missing, not ${String(err)}`);
  assert.equal(err.exitCode, 2);
  assert.match(err.message, /^no such run: no-such-run/);
});

test("`nemia decide`'s refusal is its program's typed failure: a `Missing`, picked out by its tag", async () => {
  const { Effect } = await import('effect');
  const { decideRun } = await import('../src/decide/decide.verb.ts');
  const { EngineService } = await import('../src/runtime-client.ts');
  const recovered = await runPlaced(
    decideRun('no-such-run').pipe(
      Effect.catchTag('Missing', (r) => Effect.succeed(r.message)),
      Effect.provide(EngineService.layer(board().e)),
    ),
  );
  assert.match(String(recovered), /^no such run: no-such-run/);
});

/**
 * `nemia decide`'s program says in its type what it needs and what it refuses: run without the engine, it does not typecheck, and a
 * refusal is its failure. Nothing calls this: the typecheck reads its lines, and an `@ts-expect-error` over code that stops erring is
 * the failure.
 */
async function _decideProgramTypes() {
  const { Effect } = await import('effect');
  const { decideRun } = await import('../src/decide/decide.verb.ts');
  void (decideRun('x') satisfies EffectOf<Decided, Refusal, EngineService | PlaceService>);
  // @ts-expect-error -- a refusal is its failure, so it is not an Effect that cannot fail
  void (decideRun('x') satisfies EffectOf<Decided, never, EngineService>);
  // @ts-expect-error -- decideRun requires EngineService, and runPromise takes no requirement
  void Effect.runPromise(decideRun('x'));
}

/**
 * `nemia decide`'s whole screen for `id`, with the run id, its repository, its base commit and the store as `<id>`, `<repo>`, `<base>` and
 * `<root>`.
 */
const whole = (t: TestContext, e: Engine, id: string, ...flags: string[]): Promise<string[]> => {
  const run = repositoryRun(readRun(id));
  return decideScreen(t, e, [id, ...flags], { '<id>': id, '<root>': ROOT, '<repo>': run.repo, '<base>': run.baseRef });
};

test('the whole screen of a run waiting on you: verdicts, touched, lesson, in full, each step, the totals, the branch and its notes, and ship and drop', async (t) => {
  const { run, e } = await awaiting();
  assert.deepEqual(await whole(t, e, run.id), [
    '<id>  add sub',
    '',
    '  UNVERIFIED: review  — no check: declared; only its own word says it worked',
    '',
    '  touched  wf/<id>',
    '    (root)      2 files  +2 −0 · 1 binary',
    '    packages/x  2 files  +2 −1',
    '    agent-facing     CLAUDE.md',
    '    check-affecting  packages/x/test/add.test.ts',
    '  lesson  CLAUDE.md +2 −0',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  diff --git a/packages/x/test/add.test.ts b/packages/x/test/add.test.ts',
    '  index ae00847..2dc14f5 100644',
    '  --- a/packages/x/test/add.test.ts',
    '  +++ b/packages/x/test/add.test.ts',
    '  @@ -1,2 +1,2 @@',
    "   import assert from 'node:assert';",
    '  -assert.equal(add(1, 1), 2);',
    '  +assert.ok(true);',
    '',
    '  implement',
    '    check  npm test  →  exit 0 ✓',
    '    used  29 responses · 93 tool calls · 6.35M in · 112k out',
    '    cost  not measured',
    '    timeline  try 1        filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used 29 responses · 93 tool calls · 6.35M in · 112k out',
    '              try 1 check  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s',
    '    did it',
    '',
    '  review',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed 00:20:00Z  spawned 00:20:12Z  ended 00:25:00Z  queued 12s  ran 4m48s  used not measured',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued 36s  ran 14m24s  wall 25m00s',
    '',
    '  wf/<id>  — 4 files: +4 −1, 1 binary',
    '',
    '  ── CLAUDE.md ───────────────────────────────────────────────────────',
    '  lesson one',
    '  lesson two',
    '',
    '  branch    wf/<id> is ahead of main by 1 commit',
    '',
    '  land it   git -C <repo> merge --no-ff wf/<id>',
    '  drop it   git -C <repo> branch -D wf/<id>',
  ]);
  assert.deepEqual(await whole(t, e, run.id, '--sensitive', 'nothing/**'), [
    '<id>  add sub',
    '',
    '  UNVERIFIED: review  — no check: declared; only its own word says it worked',
    '',
    '  touched  wf/<id>',
    '    (root)      2 files  +2 −0 · 1 binary',
    '    packages/x  2 files  +2 −1',
    '    agent-facing     CLAUDE.md',
    '    check-affecting  packages/x/test/add.test.ts',
    '  lesson  CLAUDE.md +2 −0',
    '',
    '  ── in full: the files --sensitive names (nothing/**), in place of what decides a check ───',
    '  none',
    '',
    '  implement',
    '    check  npm test  →  exit 0 ✓',
    '    used  29 responses · 93 tool calls · 6.35M in · 112k out',
    '    cost  not measured',
    '    timeline  try 1        filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used 29 responses · 93 tool calls · 6.35M in · 112k out',
    '              try 1 check  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s',
    '    did it',
    '',
    '  review',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed 00:20:00Z  spawned 00:20:12Z  ended 00:25:00Z  queued 12s  ran 4m48s  used not measured',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued 36s  ran 14m24s  wall 25m00s',
    '',
    '  wf/<id>  — 4 files: +4 −1, 1 binary',
    '',
    '  ── CLAUDE.md ───────────────────────────────────────────────────────',
    '  lesson one',
    '  lesson two',
    '',
    '  branch    wf/<id> is ahead of main by 1 commit',
    '',
    '  land it   git -C <repo> merge --no-ff wf/<id>',
    '  drop it   git -C <repo> branch -D wf/<id>',
  ]);
});

test('the whole screen of a running run, of a try asked for, of a step blocked with its question, and of a try a person answered', async (t) => {
  const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, e, run.id), ['<id>  add sub', '', '  still running: implement', '  nothing to decide yet']);
  settle(`${run.id}-implement`, 'succeeded', { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag?' });
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, e, run.id), [
    '<id>  add sub',
    '',
    '  BLOCKED, waiting on you: implement',
    '',
    '  once more, on the next tick:',
    '    implement: blocked. Continue its session, told what happened:  nemia retry <id> implement  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  main',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement  BLOCKED',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used not measured',
    '    two readings',
    '    needs: Rename --flag?',
    '    to answer it:  nemia retry <id> implement --message "<answer>"',
    '',
    '  cost  run not measured',
    '  timeline  run  queued 12s  ran 4m48s  wall 5m00s',
    '',
  ]);
  await runWith(e, retryRun(run.id, 'implement', { mode: 'nudge', message: 'Keep it.\nThe flag is public.' }));
  assert.deepEqual(await whole(t, e, run.id), [
    '<id>  add sub',
    '',
    '  still running: implement',
    '  implement: try 2 asked (--continue, with your answer) — the next tick files it',
    '  nothing to decide yet',
  ]);
  await runWith(e, advanceRun(readRun(run.id)));
  settle(`${run.id}-implement-try2`, 'succeeded', { outcome: 'blocked', summary: 'one reading', artifacts: [], needs: 'And the README?' });
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, e, run.id), [
    '<id>  add sub',
    '',
    '  BLOCKED, waiting on you: implement',
    '',
    '  once more, on the next tick:',
    '    implement: blocked. Continue its session, told what happened:  nemia retry <id> implement  (--fresh, or --model <m>, for a new session)',
    '',
    '  touched  main',
    '    nothing — the branch changed no file against the base',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass ───',
    '  none',
    '',
    '  implement  BLOCKED  (try 2, nudged on your word, answered)',
    '    used  not measured',
    '    cost  this try not measured · not measured over 2 tries',
    '    timeline  try 1  filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used not measured',
    '              try 2  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s  used not measured',
    '    try 1 needs: Rename --flag?',
    '    your answer: Keep it.',
    '    The flag is public.',
    '    one reading',
    '    needs: And the README?',
    '    to answer it:  nemia retry <id> implement --message "<answer>"',
    '',
    '  cost  run not measured',
    '  timeline  run  queued 24s  ran 9m36s  wall 15m00s',
    '',
  ]);
});

test('the whole screen of `nemia decide --help`, and of `nemia decide` with no run', async (t) => {
  const { DECIDE_HELP } = await import('../src/cli/decide/decide.ts');
  const { HELP } = await import('../src/cli/flags.ts');
  const { e } = board();
  assert.deepEqual(await decideScreen(t, e, ['some-run', '--help'], {}), DECIDE_HELP.split('\n'));
  assert.deepEqual(await decideScreen(t, e, [], {}), HELP.split('\n'));
});

test('the whole screen of a run on two branches, one with a note longer than the screen shows', async (t) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'docs.md'), '---\nplace: git\n---\nwrite it down\n');
  const run = await runPlaced(startRun({ brief: 'add sub', repo: aRepo(), workflowDir: dir }));
  const { e, settle } = board();
  await runWith(e, advanceRun(readRun(run.id)));
  const committed = (step: string, file: string, text: string) => {
    const wt = readRun(run.id).steps[step].workspace!;
    write(wt, file, text);
    git(wt, 'add', '-A');
    git(wt, 'commit', '-q', '-m', `add ${file}`);
  };
  committed('implement', 'sub.ts', 'export const sub = (a, b) => a - b;\n');
  committed('docs', 'NOTES.md', Array.from({ length: 123 }, (_, i) => `note ${i + 1}\n`).join(''));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  settle(`${run.id}-docs`, 'succeeded', SIGNED);
  await runWith(e, advanceRun(readRun(run.id)));
  assert.deepEqual(await whole(t, e, run.id), [
    '<id>  add sub',
    '',
    '  UNVERIFIED: docs, implement  — no check: declared; only its own word says it worked',
    '',
    '  touched  wf/<id>/run',
    '    (root)  1 file   +123 −0',
    '  touched  wf/<id>/implement',
    '    (root)  1 file   +1 −0',
    '  lesson  nothing written where the next agent reads',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass, on wf/<id>/run ───',
    '  none',
    '',
    '  ── in full: the check-affecting files — what a change could edit to make its check pass, on wf/<id>/implement ───',
    '  none',
    '',
    '  docs',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used not measured',
    '    did it',
    '',
    '  implement',
    '    used  not measured',
    '    cost  not measured',
    '    timeline  try 1  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s  used not measured',
    '    did it',
    '',
    '  cost  run not measured',
    '  timeline  run  queued 24s  ran 9m36s  wall 15m00s',
    '',
    '  wf/<id>/run  — 1 file: +123 −0',
    '',
    '  ── NOTES.md ────────────────────────────────────────────────────────',
    ...Array.from({ length: 120 }, (_, i) => `  note ${i + 1}`),
    '  … 3 more lines — git show wf/<id>/run:NOTES.md',
    '  wf/<id>/implement  — 1 file: +1 −0',
    '',
    '  branch    wf/<id>/run is ahead of main by 1 commit',
    '  branch    wf/<id>/implement is ahead of main by 1 commit',
    '',
    '  land it   git -C <repo> merge --no-ff wf/<id>/run',
    '  drop it   git -C <repo> branch -D wf/<id>/run wf/<id>/implement',
  ]);
});
