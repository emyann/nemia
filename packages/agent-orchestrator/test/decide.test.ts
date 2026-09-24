/**
 * `wf decide`'s screen, end to end: a real repository, a run started for real, and a board settled by
 * hand. What the branch touched, the lesson line and the check-affecting files in full sit between the
 * verdicts and the closeouts; what each step consumed sits beside its check; the commands are unchanged.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import type { Run, TaskPhase } from '../src/run.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-decide-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { AGENT_FACING, CHECK_AFFECTING, LESSON, advance, consumption, lessonLine, readRun, retry, sensitiveDiff, start, touchedBy } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const git = (repo: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, encoding: 'utf8' });
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

/**
 * A board a test settles by hand. A settled attempt carries the usage it is given, as the engine records it. The n-th task filed is filed
 * 10n minutes after midnight on 2026-09-13, its attempt started 5 s and spawned 12 s after that, and ended 5 minutes after filing once it
 * settled; the feed has each filing.
 */
const board = () => {
  type Filed = { id: string; closeoutSchema?: object; priority?: number; config?: { remoteControl?: boolean } };
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; usage?: object; reason?: string; filedAt: number }>();
  const T0 = Date.parse('2026-09-13T00:00:00Z');
  const iso = (ms: number) => new Date(ms).toISOString();
  const logs = new Map<string, string>();
  /** How many times each task was viewed: every view is a harness observe. */
  const viewed = new Map<string, number>();
  /** Whether a view's record carries the fields the task was filed with that no screen reads — `priority`, `remoteControl` — as the engine's does. */
  const carries = { on: true };
  const e = {
    view: async (id: string) => {
      viewed.set(id, (viewed.get(id) ?? 0) + 1);
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false,
          ...(t && carries.on ? { priority: t.spec.priority, config: t.spec.config } : {}),
          attempts: !t || t.phase === 'pending' ? [] : [{
            n: 1, startedAt: iso(t.filedAt + 5_000), spawnedAt: iso(t.filedAt + 12_000),
            endedAt: settled ? iso(t.filedAt + 300_000) : null, reason: settled ? t.reason ?? 'harness' : null,
            nativeId: `native-${id}`, closeout: t.closeout, usage: t.usage ?? null, exitCode: null,
          }],
        },
      };
    },
    file: async (spec: Filed) => { tasks.set(spec.id, { spec, phase: 'pending', filedAt: T0 + tasks.size * 600_000 }); return spec.id; },
    feed: async () => ({ entries: [...tasks].map(([taskId, t]) => ({ taskId, event: { kind: 'filed', at: iso(t.filedAt) } })), cursor: tasks.size }),
    stop: async () => {},
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object, reason?: string) => Object.assign(tasks.get(id)!, { phase, closeout, usage, reason });
  const filed = (id: string): Filed | undefined => tasks.get(id)?.spec;
  return { e, settle, logs, viewed, carries, filed };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const USAGE = { turns: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 };

/** `implement`, checked by `npm test` and with whatever other keys it is given, each ending with a newline, then `review`, with no check. */
const folder = (implementKeys = '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\ncheck: npm test\n${implementKeys}---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  return dir;
};

/**
 * A run waiting on you: implement verified, with usage; review unverified, with none. Its branch weakened
 * a test, added to a source file, wrote a lesson in CLAUDE.md and added a binary file.
 */
const awaiting = async (implementKeys = '') => {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder(implementKeys), isolate: false });
  const branch = `wf/${run.id}`;
  branchOff(repo, branch, () => {
    fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
    write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
    write(repo, 'CLAUDE.md', 'lesson one\nlesson two\n');
    write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
  });

  const { e, settle, logs, viewed, carries, filed } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED, USAGE);
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-check`, 'succeeded');
  logs.set(`${run.id}-implement-check`, '# pass 1\n\n[wf check] exit 0\n');
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', SIGNED);

  // The steps worked on a branch of their own, as a run with worktrees does: the record says where.
  const record = readRun(run.id);
  for (const s of Object.values(record.steps)) s.branch = branch;
  fs.writeFileSync(path.join(ROOT, 'runs', `${run.id}.json`), JSON.stringify(record, null, 2));
  return { run: record, repo, branch, e, viewed, carries, filed };
};

/** What `wf decide` prints, line by line. */
const screen = async (t: TestContext, e: Engine, ...argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  try { await main(['decide', ...argv], e); } finally { log.mock.restore(); }
  return out.join('\n').split('\n');
};

/** What `wf ls <run>` prints, line by line. */
const listed = async (t: TestContext, e: Engine, id: string): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  try { await main(['ls', id], e); } finally { log.mock.restore(); }
  return out.join('\n').split('\n');
};

/** An approval as `wf approve` writes one: a file of a person's beside the retry asks. */
const approveByHand = (id: string, step: string, n: number) => {
  const dir = path.join(ROOT, 'runs', `${id}.asks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `approve-${step}-${n}`), `${JSON.stringify({ step, try: n, at: '2026-09-17T10:00:00.000Z' }, null, 2)}\n`);
};

const indexOf = (lines: string[], want: string | RegExp): number => {
  const i = lines.findIndex((l) => (typeof want === 'string' ? l === want : want.test(l)));
  assert.ok(i >= 0, `${want} is on the screen:\n${lines.join('\n')}`);
  return i;
};

test('the awaiting screen: what the branch touched, the lesson, and the check files in full — between the verdicts and the closeouts', async (t) => {
  const { run, repo, branch, e, viewed } = await awaiting();
  viewed.clear();
  const lines = await screen(t, e, run.id);
  // Each task viewed once for the whole screen, usage included: every view is a harness observe (plan §4b).
  assert.deepEqual(Object.fromEntries(viewed), { [`${run.id}-implement`]: 1, [`${run.id}-implement-check`]: 1, [`${run.id}-review`]: 1 });

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
  // The weakened assertion, whole — and the source change, which decides nothing about the check, not.
  assert.ok(lines.includes('  -assert.equal(add(1, 1), 2);') && lines.includes('  +assert.ok(true);'), lines.join('\n'));
  assert.ok(!lines.some((l) => l.includes('export const sub')));
  const implement = indexOf(lines, '  implement');
  assert.ok(verdict < touched && touched < lesson && lesson < inFull && inFull < implement, 'in that order, before the closeouts');

  // What each step consumed, beside its check — and a step with no usage says so.
  const check = indexOf(lines, /^    check  npm test  →/);
  assert.deepEqual(lines.slice(check + 1, check + 3), ['    used  29 turns · 93 tool calls · 6.35M in · 112k out', '    cost  not measured']);
  const review = indexOf(lines, '  review');
  assert.deepEqual(lines.slice(review + 1, review + 3), ['    used  not measured', '    cost  not measured']);
  assert.ok(!lines.some((l) => /^\s+cost .*\d/.test(l)), 'cost never prints a number no runner measured');

  // Where the time went, after what each step used: its session and its check, each filed, spawned and ended, queued and ran — off the
  // engine's attempts, and the filing times on its feed.
  assert.deepEqual(lines.slice(check + 3, check + 5), [
    '    timeline  try 1        filed 00:00:00Z  spawned 00:00:12Z  ended 00:05:00Z  queued 12s  ran 4m48s  used 29 turns · 93 tool calls · 6.35M in · 112k out',
    '              try 1 check  filed 00:10:00Z  spawned 00:10:12Z  ended 00:15:00Z  queued 12s  ran 4m48s',
  ]);
  assert.deepEqual(lines.slice(review + 3, review + 4), ['    timeline  try 1  filed 00:20:00Z  spawned 00:20:12Z  ended 00:25:00Z  queued 12s  ran 4m48s  used not measured']);
  // And the run's, after every step and before the branches: one round, so the run's line alone.
  const total = indexOf(lines, '  timeline  run  queued 36s  ran 14m24s  wall 25m00s');
  assert.ok(review < total && total < indexOf(lines, new RegExp(`^  ${branch}`)), 'after the steps, before the branches');

  // The commands stay as they are, and none is run.
  assert.deepEqual(lines.slice(-2), [`  ship it   git -C ${repo} merge --no-ff ${branch}`, `  drop it   git -C ${repo} branch -D ${branch}`]);
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');
  assert.ok(git(repo, 'branch', '--list', branch).trim(), 'the branch is still there');
});

test("`wf decide` and `wf ls` say nothing of a run's momentum or a step's Remote Control: the same screens, line for line, whether the engine's record carries the `priority` and `remoteControl` the run's filings were made with or not", async (t) => {
  const { run, e, carries, filed } = await awaiting('background: true\nremote: true\n');
  const ids = [`${run.id}-implement`, `${run.id}-implement-check`, `${run.id}-review`];
  assert.deepEqual(ids.map((id) => [filed(id)?.priority, filed(id)?.config?.remoteControl]), [[undefined, true], [1, undefined], [1, undefined]], 'filed with them');
  const screens = async () => ({ decide: await screen(t, e, run.id), ls: await listed(t, e, run.id) });
  const carried = await screens();
  carries.on = false;
  assert.deepEqual(await screens(), carried);
  assert.ok(!Object.values(carried).flat().some((l) => /priority|momentum|remote|bridge/i.test(l)), [...carried.decide, ...carried.ls].join('\n'));
});

test('--sensitive with a glob that matches nothing prints the heading, and none', async (t) => {
  const { run, e } = await awaiting();
  const lines = await screen(t, e, run.id, '--sensitive', 'nothing/**');
  const heading = indexOf(lines, /^  ── in full: the files --sensitive names \(nothing\/\*\*\)/);
  assert.equal(lines[heading + 1], '  none');
  assert.ok(!lines.includes('  +assert.ok(true);'), 'the default list is replaced, not added to');
  // The flag chooses what is read whole, not what is true: the radius still names the check file.
  assert.ok(lines.includes('    check-affecting  packages/x/test/add.test.ts'));
});

test('`wf decide` refuses a flag it does not take, and --sensitive without globs or twice — before a run is read', async () => {
  const refused = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);
  for (const [flags, pattern] of [
    [['--sensitve', 'src/**'], /^wf decide does not take --sensitve\./],
    [['--sensitive'], /^--sensitive takes the globs/],
    [['--sensitive', '--sensitive', 'src/**'], /^--sensitive takes the globs/],
    [['--sensitive', ' , '], /^--sensitive takes the globs/],
    [['--sensitive', 'a', '--sensitive', 'b'], /^wf decide takes --sensitive once/],
  ] as const) {
    await assert.rejects(main(['decide', 'no-such-run', ...flags]), refused(pattern), flags.join(' '));
  }
  // A flag before the run is refused too — not the general help, which exits 0 and says nothing of the order.
  for (const argv of [['--sensitive', 'src/**', 'no-such-run'], ['--sensitive']]) {
    await assert.rejects(main(['decide', ...argv]), refused(/^wf decide takes the run first: wf decide <runId> \[--sensitive <globs>\]/), argv.join(' '));
  }
  // The flag it takes gets as far as reading the run, which is not there.
  await assert.rejects(main(['decide', 'no-such-run', '--sensitive', 'src/**']), (err: Error) => !/sensitive/.test(err.message));
});

test('`wf decide --help` prints the lists the screen uses, from the one place they are written', async (t) => {
  const out: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  await main(['decide', '--help']);
  const text = out.join('\n');
  assert.match(text, /^wf decide <runId> \[--sensitive <globs>\]/);
  for (const list of [CHECK_AFFECTING, AGENT_FACING, LESSON]) assert.ok(text.includes(list.join(', ')), list.join(', '));
});

test('what a branch touched is read out of git: a rename at both ends, a binary file, a file in no directory — and a branch that is gone is not read as nothing', () => {
  const repo = aRepo();
  const run = start({ brief: 'move the test', repo, workflowDir: folder(), isolate: false });
  branchOff(repo, 'wf/moved', () => {
    fs.mkdirSync(path.join(repo, 'packages/x/spec'));
    git(repo, 'mv', 'packages/x/test/add.test.ts', 'packages/x/spec/add.test.ts');
    write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
    write(repo, 'NOTES', 'one\n');
  });

  const r = touchedBy(run, 'wf/moved');
  assert.ok(!('error' in r), JSON.stringify(r));
  assert.deepEqual([...r.changes].sort((a, b) => a.path.localeCompare(b.path)), [
    { path: 'logo.png', added: null, removed: null },
    { path: 'NOTES', added: 1, removed: 0 },
    { from: 'packages/x/test/add.test.ts', path: 'packages/x/spec/add.test.ts', added: 0, removed: 0 },
  ]);
  assert.deepEqual(r.groups.map((g) => [g.name, g.files, g.binary]), [['(root)', 2, 1], ['packages/x', 1, 0]], 'grouped by the base\'s workspaces');
  assert.deepEqual(r.checkAffecting, ['packages/x/test/add.test.ts → packages/x/spec/add.test.ts']);
  const diff = sensitiveDiff(run, { branch: 'wf/moved', radius: r }, CHECK_AFFECTING)!;
  assert.match(diff, /^rename from packages\/x\/test\/add\.test\.ts$/m, 'both ends asked for, so git shows a rename');
  assert.match(diff, /^rename to packages\/x\/spec\/add\.test\.ts$/m);

  const gone = { branch: 'wf/never', radius: touchedBy(run, 'wf/never') };
  assert.match('error' in gone.radius ? gone.radius.error : '', /^git could not diff [0-9a-f]{12}\.\.\.wf\/never$/);
  assert.equal(sensitiveDiff(run, gone, CHECK_AFFECTING), undefined);
  assert.equal(lessonLine([gone]), 'lesson  not known — wf/never could not be read');
});

test("the lesson line reads the base's workspaces: a package's docs/ is a lesson, a docs/ in its source is not", () => {
  const repo = aRepo();
  const run = start({ brief: 'document it', repo, workflowDir: folder(), isolate: false });
  branchOff(repo, 'wf/source-docs', () => write(repo, 'packages/x/src/docs/strings.ts', 'export const title = "Docs";\n'));
  branchOff(repo, 'wf/package-docs', () => {
    write(repo, 'packages/x/src/docs/strings.ts', 'export const title = "Docs";\n');
    write(repo, 'packages/x/docs/features.md', 'what is left\n');
  });
  const read = (branch: string) => lessonLine([{ branch, radius: touchedBy(run, branch) }]);
  assert.equal(read('wf/source-docs'), 'lesson  nothing written where the next agent reads');
  assert.equal(read('wf/package-docs'), 'lesson  packages/x/docs/features.md +1 −0');
});

test('what a step consumed is summed over its attempts — one that never started left out, the one in flight read off the view', () => {
  const views: Record<string, unknown> = {
    t1: {
      usage: { turns: 1, toolCalls: 1, inputTokens: 5, outputTokens: 1 },
      state: { attempts: [
        { reason: 'unstartable', endedAt: '2026-09-13T00:00:00Z', usage: null },
        { reason: 'harness', endedAt: '2026-09-13T00:01:00Z', usage: { turns: 2, toolCalls: 3, inputTokens: 10, outputTokens: 1 } },
        { reason: null, endedAt: null, usage: null },
      ] },
    },
    // A session lost before its runner measured anything: nobody counted, so nothing is summed.
    t2: { state: { attempts: [{ reason: 'lost', endedAt: '2026-09-13T00:00:00Z', usage: null }] } },
  };
  const run = { steps: { implement: { taskId: 't1' }, review: { taskId: 't2' }, respond: {} } } as unknown as Run;
  assert.deepEqual(consumption(new Map(Object.entries(views)) as unknown as Parameters<typeof consumption>[0], run), {
    implement: { turns: 3, toolCalls: 4, inputTokens: 15, outputTokens: 2 },
    review: undefined,
  });
});

test("`wf decide` on a try a person answered: its line says so, and under it what the try before needed and your answer, read off the ask; a blocked step is told the wf retry --message that answers it", async (t) => {
  const run = start({ brief: 'add sub', repo: aRepo(), workflowDir: folder(), isolate: false });
  const { e, settle } = board();
  const blocked = (needs: string) => ({ outcome: 'blocked', summary: 'two readings', artifacts: [], needs });
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', blocked('Rename --flag, or keep it?'));
  await advance(e, readRun(run.id));

  const asking = await screen(t, e, run.id);
  const needs = indexOf(asking, '    needs: Rename --flag, or keep it?');
  assert.equal(asking[needs + 1], `    to answer it:  wf retry ${run.id} implement --message "<answer>"`, 'the question, then the command that answers it');
  indexOf(asking, `    implement: blocked. Continue its session, told what happened:  wf retry ${run.id} implement  (--fresh, or --model <m>, for a new session)`);
  assert.ok(!asking.some((l) => /^ {4}your answer: |^ {4}try \d+ needs: |answered\)$/.test(l)), 'nothing answered yet');

  await retry(e, run.id, 'implement', { mode: 'nudge', message: 'Keep it.\nThe flag is public.' });
  indexOf(await screen(t, e, run.id), '  implement: try 2 asked (--nudge, with your answer) — the next tick files it');

  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-try2`, 'succeeded', blocked('And the README, too?'));
  await advance(e, readRun(run.id));
  const lines = await screen(t, e, run.id);
  const head = indexOf(lines, '  implement  BLOCKED  (try 2, nudged on your word, answered)');
  const question = indexOf(lines, '    try 1 needs: Rename --flag, or keep it?');
  assert.deepEqual(lines.slice(question + 1, question + 3), ['    your answer: Keep it.', '    The flag is public.']);
  assert.ok(head < question && question < indexOf(lines, '    needs: And the README, too?'), 'the question and its answer, then what the try made of them');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8').includes('The flag is public'), 'composed on read: the record keeps no message');
});

test("a measured cost on both screens: `wf decide` prints each step's beside what it used, with the api and tool time, and the run's after the steps; `wf ls` puts each step's beside its word and the run's on its line — and a run nobody measured prints no dollar", async (t) => {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder(), isolate: false });
  const { e, settle, logs } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED, { ...USAGE, costUsd: 3.012, apiMs: 486_000, toolMs: 2_400 });
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-check`, 'succeeded');
  logs.set(`${run.id}-implement-check`, '# pass 1\n\n[wf check] exit 0\n');
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', SIGNED, { costUsd: 0.5 });

  const lines = await screen(t, e, run.id);
  const check = indexOf(lines, /^    check  npm test  →/);
  assert.deepEqual(lines.slice(check + 1, check + 3), ['    used  29 turns · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s', '    cost  $3.01']);
  assert.match(lines[check + 3]!, /^    timeline  try 1 .*  used 29 turns · 93 tool calls · 6\.35M in · 112k out · api 8m06s · tools 2s  cost \$3\.01$/);
  const review = indexOf(lines, '  review');
  assert.deepEqual(lines.slice(review + 1, review + 3), ['    used  turns not measured · tool calls not measured · tokens in not measured · tokens out not measured', '    cost  $0.50']);
  const total = indexOf(lines, '  cost  run $3.51');
  assert.ok(review < total && total < indexOf(lines, /^  timeline  run /), 'after the steps, beside the run\'s time');

  const ls = async (id: string): Promise<string[]> => {
    const out: string[] = [];
    const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
    try { await main(['ls', id], e); } finally { log.mock.restore(); }
    return out;
  };
  const listed = await ls(run.id);
  assert.equal(listed[0], `${run.id}  add sub  $3.51`);
  assert.match(listed[1]!, /^   implement      verified ✓  \$3\.01 +\S/);
  assert.match(listed[2]!, /^   review         unverified · done  \$0\.50 +\S/);

  // The run the other screen tests read measured no cost: no dollar on either screen, and the run's cost says not measured.
  const unmeasured = await awaiting();
  assert.ok(!(await ls(unmeasured.run.id)).some((l) => l.includes('$')));
  const bare = await screen(t, unmeasured.e, unmeasured.run.id);
  assert.ok(bare.includes('  cost  run not measured') && !bare.some((l) => l.includes('$')), bare.join('\n'));
});

test("REFUSED to hide why a step stopped past its budget: `wf decide` on a step whose session failed after spending its budget says FAILED with its logs, and one that ended unsigned says UNSIGNED, each beside the OVER BUDGET line — and the offer names both", async (t) => {
  const budgeted = () => {
    const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nbudget: 3\n---\nimplement it\n');
    fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
    return dir;
  };
  const cases = [
    ['failed', 'failed', (id: string) => `  FAILED: implement  (wf logs ${id} <step>)`],
    ['unsigned', 'succeeded', () => '  UNSIGNED: implement  — ended without the closeout it was asked for, or without a field its output: declares; nothing after it ran'],
  ] as const;
  for (const [own, phase, banner] of cases) {
    const run = start({ brief: `add sub, ${own}`, repo: aRepo(), workflowDir: budgeted(), isolate: false });
    const { e, settle } = board();
    await advance(e, readRun(run.id));
    // No closeout either way: the one session failed, the other ended without it.
    settle(`${run.id}-implement`, phase, undefined, { costUsd: 3.4 });
    const lines = await screen(t, e, run.id);
    const said = indexOf(lines, banner(run.id));
    const over = indexOf(lines, '  OVER BUDGET, waiting on you: implement ($3.40 of $3)  — the run files nothing more for it on its own; nothing after it ran');
    assert.ok(said < over, `${own}: why it stopped, then why nothing more is filed`);
    indexOf(lines, `    implement: over budget (${own}), $3.40 of $3. Raise its cap above $3.40 and continue its session:  wf retry ${run.id} implement --budget <amount>  (--fresh, or --model <m>, for a new session)`);
    indexOf(lines, '    cost  $3.40 · budget $3');
    assert.ok(!lines.some((l) => /its tries have cost its budget: or more/.test(l)), 'the shared reason is gone');
  }
});

test("UNSIGNED after the run's own nudge: `wf decide` and `wf ls` say the run nudged it to sign off once, and that it ended unsigned again — the nudge spent, the step yours", async (t) => {
  const run = start({ brief: 'add sub, unsigned', repo: aRepo(), workflowDir: folder(), isolate: false });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  // As the engine records a session that ended without calling StructuredOutput: failed, its last attempt `unsigned`.
  settle(`${run.id}-implement`, 'failed', undefined, undefined, 'unsigned');
  assert.deepEqual((await advance(e, readRun(run.id))).notes.filter((n) => n.startsWith('implement:')), ['implement: try 2 — a nudge to sign off, once a round']);
  settle(`${run.id}-implement-try2`, 'failed', undefined, undefined, 'unsigned');
  await advance(e, readRun(run.id));
  const lines = await screen(t, e, run.id);
  indexOf(lines, '  UNSIGNED: implement (nudged to sign off once by the run, and unsigned again)  — ended without the closeout it was asked for, or without a field its output: declares; nothing after it ran');
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  try { await main(['ls', run.id], e); } finally { log.mock.restore(); }
  assert.ok(out.some((l) => /^ {3}implement +unsigned .*try 2, nudged to sign off by the run/.test(l)), out.join('\n'));
});

test("the branch's standing against the base is a fact on every screen — on it, ahead by N, gone", async (t) => {
  const { run, repo, branch, e } = await awaiting();
  assert.ok((await screen(t, e, run.id)).includes(`  branch    ${branch} is ahead of main by 1 commit`));

  // Merged by hand, as a person ships a run with no ending step: the run reads shipped, and there is nothing left to decide.
  git(repo, 'merge', '-q', '--no-ff', '--no-edit', branch);
  assert.deepEqual(await screen(t, e, run.id), [`${run.id}  add sub`, '', `  shipped — ${branch} is already on main`]);

  // And once the branch is deleted after the merge, git still says where it went, by the tip the run's own tick recorded.
  const { run: other, repo: otherRepo, branch: otherBranch, e: otherEngine } = await awaiting();
  git(otherRepo, 'branch', '-D', otherBranch);
  assert.ok((await screen(t, otherEngine, other.id)).includes(`  branch    ${otherBranch} is gone: git no longer has it`), 'no tip was recorded for it');
});

test("a folder whose last step is an ending: `wf decide` says what that step would do in the folder's words, and the word that runs it — and prints no git command, since the step is the one that merges", async (t) => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nworkspace: main\ngate: true\n---\nShip it: trial merge this run\'s result branch onto main, run the check, and commit.\n\nAbort on any failure.\n');
  // Worktrees, as a folder with an ending is started: `--no-worktree` is refused for one, since such a run has no branch to merge.
  const run = start({ brief: 'add sub', repo, workflowDir: dir });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  const work = readRun(run.id).steps.implement!;
  write(work.workspace!, 'packages/x/src/add.ts', 'export const add = (a, b) => a + b;\nexport const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  const branch = work.branch!;
  assert.equal(readRun(run.id).steps.ship!.taskId, null, 'nothing of the ending is filed without a person');

  const lines = await screen(t, e, run.id);
  indexOf(lines, "  AWAITING APPROVAL, waiting on you: ship  — this workflow's ending, at its gate: nothing of it has run, and your approval is what runs it");
  indexOf(lines, `  branch    ${branch} is ahead of main by 1 commit`);
  const decide = indexOf(lines, "  to decide  ship has not run: this workflow's ending, and your approval is what runs it:");
  assert.deepEqual(lines.slice(decide + 1, decide + 5), [
    "    Ship it: trial merge this run's result branch onto main, run the check, and commit.",
    '',
    `  approve it    wf approve ${run.id} ship [--message "<words>"]`,
    `  send it back  wf retry ${run.id} implement --message "<objection>"`,
  ]);
  assert.ok(!lines.some((l) => /ship it   git|drop it   git/.test(l)), 'the folder says what shipping is, so nobody is told to type it');

  // And `wf ls` says the same, in one line, where it says who the run waits on.
  const said = await listed(t, e, run.id);
  indexOf(said, `   → to decide: Ship it: trial merge this run's result branch onto main, run the check, and commit. — wf approve ${run.id} ship`);
  assert.ok(!said.some((l) => l.includes('waiting on you')), 'the ending is not said twice');
  indexOf(said, /^   ship {11}awaiting approval/);
});

test("a gate on the last step of a folder that merges nothing: approving accepts what the step did — its own prose is not offered as what happens next — and the branch keeps its git commands", async (t) => {
  // `wf start --gate review` on a chain: review is a terminal gated step, so a person's word ends the run, but nothing merges its branch.
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder(), gates: ['review'] });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  const work = readRun(run.id).steps.implement!;
  fs.appendFileSync(path.join(work.workspace!, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(work.workspace!, 'add', '-A');
  git(work.workspace!, 'commit', '-q', '-m', 'add sub');
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-check`, 'succeeded');
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', SIGNED);
  const branch = readRun(run.id).steps.review!.branch!;

  // At the gate: the word is asked for, and the step's own instructions are not read back as what happens next.
  const held = await screen(t, e, run.id);
  indexOf(held, "  to decide  review has signed off and waits for your word:");
  indexOf(held, `  approve it    wf approve ${run.id} review [--message "<words>"]`);
  assert.ok(!held.some((l) => l.includes('Review the change in this workspace')), "the step's brief is not what happens next");
  assert.ok(!held.some((l) => /ship it   git/.test(l)), 'the branch is not offered while the gate holds');
  indexOf(await listed(t, e, run.id), `   → to decide: review has signed off at its gate — wf approve ${run.id} review`);

  // Approved: the run is over, and the branch nobody has merged is still a person's — with the commands, since no step of this folder merges.
  approveByHand(run.id, 'review', 1);
  const after = await screen(t, e, run.id);
  assert.deepEqual(after.slice(-2), [`  ship it   git -C ${repo} merge --no-ff ${branch}`, `  drop it   git -C ${repo} branch -D ${branch}`]);
  indexOf(await listed(t, e, run.id), `   → to decide: ${branch} is ahead of main, and nothing has merged it — wf decide ${run.id}`);
});

test("a run that worked on the base branch itself says so, and still says what is to be decided: the screen that used to return before it", async (t) => {
  const repo = aRepo();
  const run = start({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false, gates: ['review'] });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement`, 'succeeded', SIGNED);
  await advance(e, readRun(run.id));
  settle(`${run.id}-implement-check`, 'succeeded');
  await advance(e, readRun(run.id));
  settle(`${run.id}-review`, 'succeeded', SIGNED);

  const direct = await screen(t, e, run.id);
  const worked = indexOf(direct, /^  worked directly on main; nothing to merge; the base was /);
  const said = indexOf(direct, '  to decide  review has signed off and waits for your word:');
  assert.ok(worked < said, 'the branch facts, then what to decide');
  indexOf(direct, `  approve it    wf approve ${run.id} review [--message "<words>"]`);
  assert.ok(!direct.some((l) => /^  branch    /.test(l)), 'no standing: it would read `main is on main`');
  assert.ok(!direct.some((l) => /ship it   git|drop it   git/.test(l)), 'nor a merge of the branch it is already on');
});

test("a run whose one step works in the checkout is not shown the base branch's diff: its work is not on it, and the base moves under it", async (t) => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'supervise.md'), '---\nworkspace: main\nslot: none\n---\nWatch the runs.\n');
  const run = start({ brief: 'supervise this repository', repo, workflowDir: dir });
  const { e, settle } = board();
  await advance(e, readRun(run.id));
  settle(`${run.id}-supervise`, 'succeeded', { outcome: 'blocked', summary: 'add-sub is ready to merge.', artifacts: [], needs: 'Merge add-sub, or hold it?' });
  await advance(e, readRun(run.id));
  // The step worked in the repository's own checkout, so the record names the base branch, not a branch of the run's.
  assert.equal(readRun(run.id).steps.supervise?.branch, 'main');

  // And main moves on while the run watches: another run's merge, which touches a test and CLAUDE.md.
  write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
  write(repo, 'CLAUDE.md', 'a lesson somebody else wrote\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'another run, merged');
  // That diff is there to be read: what is refused is reading it AS this run's work.
  const moved = touchedBy(readRun(run.id), 'main');
  assert.ok(!('error' in moved) && moved.changes.length === 2, JSON.stringify(moved));

  const lines = await screen(t, e, run.id);
  assert.ok(!lines.some((l) => /^  touched /.test(l)), `no branch to read:\n${lines.join('\n')}`);
  assert.ok(!lines.some((l) => /^  lesson /.test(l)), 'nor a lesson credited to it for what another run merged');
  assert.ok(!lines.some((l) => /in full: the check-affecting files/.test(l)), 'nor every check-affecting file merged since, above the question');
  // What the person came for is what they get.
  const said = indexOf(lines, '    add-sub is ready to merge.');
  assert.ok(indexOf(lines, '    needs: Merge add-sub, or hold it?') > said);
  indexOf(lines, `    to answer it:  wf retry ${run.id} supervise --message "<answer>"`);

  // A run that worked on the base branch ITSELF (--no-worktree) is unchanged, on the same fallback: its implement failed, so the
  // terminal step has no branch and the screen reads every branch a step worked on — which is main, where that run's work really is.
  const direct = start({ brief: 'add sub, directly', repo, workflowDir: folder(), isolate: false });
  fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
  git(repo, 'commit', '-q', '-am', 'the work, on the base branch itself');
  await advance(e, readRun(direct.id));
  settle(`${direct.id}-implement`, 'failed');
  const worked = await screen(t, e, direct.id);
  assert.equal(readRun(direct.id).steps.review?.branch, undefined, 'the terminal step has no branch: the fallback is what answers');
  const where = indexOf(worked, '  touched  main');
  assert.match(worked[where + 1]!, /^ {4}packages\/x\s+1 file\s+\+1 −0$/, worked.slice(where, where + 3).join('\n'));
});

test('REFUSED at `wf start`: --no-worktree on a workflow whose last step merges, before a run is written — such a run has no result branch', () => {
  const repo = aRepo();
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), '---\nafter: implement\nworkspace: main\ngate: true\n---\nShip it.\n');
  const before = fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;
  assert.throws(() => start({ brief: 'add sub', repo, workflowDir: dir, isolate: false }), (err: Error & { exitCode?: number }) => {
    assert.equal(err.exitCode, 2);
    assert.match(err.message, /^ship: `workspace: main` ends this workflow by merging the run's result branch onto the base branch, and --no-worktree gives the run no result branch/);
    assert.match(err.message, /Either drop --no-worktree, or start a workflow whose last step is not an ending\.$/);
    return true;
  });
  assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length, before, 'nothing written');
  assert.ok(start({ brief: 'add sub', repo, workflowDir: dir }), 'with worktrees, it starts');
});
