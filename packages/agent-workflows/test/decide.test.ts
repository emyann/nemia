/**
 * `wf decide`'s screen, end to end: a real repository, a run started for real, and a board settled by
 * hand. What the branch touched, the lesson line and the check-affecting files in full sit between the
 * verdicts and the closeouts; what each step consumed sits beside its check; the commands are unchanged.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';
import type { Run, TaskPhase } from '../src/run.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-decide-'));
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

/** A board a test settles by hand. A settled attempt carries the usage it is given, as the engine records it. */
const board = () => {
  type Filed = { id: string; closeoutSchema?: object };
  const tasks = new Map<string, { spec: Filed; phase: TaskPhase; closeout?: unknown; usage?: object }>();
  const logs = new Map<string, string>();
  /** How many times each task was viewed: every view is a harness observe. */
  const viewed = new Map<string, number>();
  const e = {
    view: async (id: string) => {
      viewed.set(id, (viewed.get(id) ?? 0) + 1);
      const t = tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      return {
        id, phase: t?.phase ?? 'pending', sessionId: t ? 's' : null,
        state: {
          brief: t ? 'filed' : '', closeoutSchema: t?.spec.closeoutSchema, settled, stopRequested: false,
          attempts: !t || t.phase === 'pending' ? [] : [{
            n: 1, endedAt: settled ? '2026-09-13T00:00:00Z' : null, reason: settled ? 'harness' : null,
            nativeId: `native-${id}`, closeout: t.closeout, usage: t.usage ?? null, exitCode: null,
          }],
        },
      };
    },
    file: async (spec: Filed) => { tasks.set(spec.id, { spec, phase: 'pending' }); return spec.id; },
    stop: async () => {},
    logs: async (id: string) => logs.get(id) ?? '(no output yet)',
  } as unknown as Engine;
  const settle = (id: string, phase: TaskPhase, closeout?: unknown, usage?: object) => Object.assign(tasks.get(id)!, { phase, closeout, usage });
  return { e, settle, logs, viewed };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const USAGE = { turns: 29, toolCalls: 93, inputTokens: 6_350_000, outputTokens: 112_000 };

/** `implement`, checked by `npm test`, then `review`, with no check. */
const folder = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\ncheck: npm test\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\n---\nreview it\n');
  return dir;
};

/**
 * A run waiting on you: implement verified, with usage; review unverified, with none. Its branch weakened
 * a test, added to a source file, wrote a lesson in CLAUDE.md and added a binary file.
 */
const awaiting = async () => {
  const repo = aRepo();
  const run = start({ brief: 'add sub', repo, workflowDir: folder(), isolate: false });
  const branch = `wf/${run.id}`;
  branchOff(repo, branch, () => {
    fs.appendFileSync(path.join(repo, 'packages/x/src/add.ts'), 'export const sub = (a, b) => a - b;\n');
    write(repo, 'packages/x/test/add.test.ts', "import assert from 'node:assert';\nassert.ok(true);\n");
    write(repo, 'CLAUDE.md', 'lesson one\nlesson two\n');
    write(repo, 'logo.png', new Uint8Array([0, 1, 2, 0, 255]));
  });

  const { e, settle, logs, viewed } = board();
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
  return { run: record, repo, branch, e, viewed };
};

/** What `wf decide` prints, line by line. */
const screen = async (t: TestContext, e: Engine, ...argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { out.push(args.map(String).join(' ')); });
  try { await main(['decide', ...argv], e); } finally { log.mock.restore(); }
  return out.join('\n').split('\n');
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

  // The commands stay as they are, and none is run.
  assert.deepEqual(lines.slice(-2), [`  ship it   git -C ${repo} merge --no-ff ${branch}`, `  drop it   git -C ${repo} branch -D ${branch}`]);
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');
  assert.ok(git(repo, 'branch', '--list', branch).trim(), 'the branch is still there');
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
