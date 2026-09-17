/**
 * A gate on disk: a step's handoff that waits for a person, as `wf start --gate`, a card's `gate:` and a step's `gate: true` freeze it on a
 * run, and as the tick holds it. What a gate means to `assess`, `listing`, `decision` and a brief is pure, and lives in run.test.ts. This is
 * the part that is not: the record `wf start` writes, the files a person writes beside it, and a tick that reads both on every pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-engine';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-gate-'));
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { inboxDir, readRun, start, startFromInbox } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** A repository with one commit, so `wf start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow folder of `plan → implement → review`, each step with the frontmatter lines it is given. */
const planned = (keys: { plan?: string; implement?: string; review?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = '') => {
    const front = [...(after ? [`after: ${after}`] : []), ...(lines ? [lines] : [])];
    fs.writeFileSync(path.join(dir, `${name}.md`), `${front.length ? `---\n${front.join('\n')}\n---\n` : ''}${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  write('review', 'implement', keys.review);
  return dir;
};

const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

/** What `main` printed, line by line. */
const printedBy = async (t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } }, argv: string[], e?: Engine): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.join(' ')); });
  try { await main(argv, e ?? ({} as Engine)); } finally { log.mock.restore(); }
  return printed.join('\n').split('\n');
};

// ─── a gate frozen at start ─────────────────────────────────────────────────

test("`wf start --gate <step>` freezes `gates` on the record, once per step; a step's own `gate: true` is frozen with its workflow; a run given none has no `gates`", async (t) => {
  const repo = aRepo();
  const run = start({ brief: 'plan the flag', repo, workflowDir: planned({ review: 'gate: true' }), isolate: false, gates: ['plan'] });
  assert.deepEqual(readRun(run.id).gates, ['plan']);
  assert.equal(readRun(run.id).workflow?.find((s) => s.name === 'review')?.gate, true, 'the folder\'s own gate, frozen with the step');
  const bare = start({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false });
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${bare.id}.json`), 'utf8')), 'gates'), false);

  const printed = await printedBy(t, ['start', 'plan the flag', '--workflows', planned({ review: 'gate: true' }), '--repo', repo, '--no-worktree', '--gate', 'plan', '--gate=implement']);
  const id = printed[0]!.split(' ')[0]!;
  assert.deepEqual(readRun(id).gates, ['plan', 'implement']);
  assert.ok(printed.includes(`gated at: plan, implement, review — nothing after each is filed until wf approve ${id} <step>, once it has signed off`), printed.join('\n'));
});

test('REFUSED at `wf start`, before a run is written: a --gate naming a step the workflow does not have — naming the steps it has — and one given twice; the CLI refuses --gate with no step, and `wf plan --gate` by name', async () => {
  const repo = aRepo();
  const before = runsWritten();
  const starting = (...gates: string[]) => () => start({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false, gates });
  assert.throws(starting('plan', 'desing'),
    refusedWith(/^--gate desing: the workflow has no step "desing", so nothing would ever wait at it\. Its steps are: plan, implement, review — gate one of them by its name\.$/));
  assert.throws(starting('plan', 'plan'), refusedWith(/^--gate plan is given twice, and a run is gated at a step once\. Give each step one --gate\.$/));
  assert.equal(runsWritten(), before, 'no run written');

  const typed = (...flags: string[]) => main(['start', 'plan the flag', '--workflows', planned(), '--repo', repo, '--no-worktree', ...flags]);
  await assert.rejects(typed('--gate'), refusedWith(/^--gate takes the step whose closeout waits for a person before anything after it is filed/));
  await assert.rejects(typed('--gate', '--no-worktree'), refusedWith(/^--gate takes the step/));
  await assert.rejects(typed('--gate', 'reveiw'), refusedWith(/^--gate reveiw: the workflow has no step "reveiw"/));
  await assert.rejects(main(['plan', ROOT, '--gate', 'plan']), refusedWith(/^wf plan does not take --gate: a plan's cards are gated by their workflows' own gate: true\./));
  assert.equal(runsWritten(), before, 'nor by the CLI');
});

test("an inbox card's `gate:` is frozen on the run it starts, beside a start's --gate — a step both name once — and REFUSED in the card's words when it names no step of the workflow, with nothing written and the card left in the inbox", async () => {
  const repo = aRepo();
  const card = (name: string, gate: string) => {
    fs.mkdirSync(inboxDir(), { recursive: true });
    fs.writeFileSync(path.join(inboxDir(), `${name}.md`), `---\nworkflow: ${planned()}\ngate: ${gate}\n---\nPlan the flag.\n`);
  };
  card('plan-the-flag-a1b2', 'plan');
  const { run } = startFromInbox({ name: 'plan-the-flag-a1b2', callerRepo: repo, isolate: false, gates: ['review', 'plan'] });
  assert.deepEqual(readRun(run.id).gates, ['review', 'plan'], 'the card\'s gate and the start\'s, plan once');
  const { run: alone } = (card('plan-the-flag-c3d4', 'implement'), startFromInbox({ name: 'plan-the-flag-c3d4', callerRepo: repo, isolate: false }));
  assert.deepEqual(readRun(alone.id).gates, ['implement']);

  card('plan-the-flag-e5f6', 'desing');
  const before = runsWritten();
  assert.throws(() => startFromInbox({ name: 'plan-the-flag-e5f6', callerRepo: repo, isolate: false }),
    refusedWith(/^plan-the-flag-e5f6\.md: `gate: desing`: the workflow has no step "desing", so nothing would ever wait at it\. Its steps are: plan, implement, review — gate one of them by its name\. Correct the line, or delete it\.$/));
  card('plan-the-flag-g7h8', 'plan');
  assert.throws(() => startFromInbox({ name: 'plan-the-flag-g7h8', callerRepo: repo, isolate: false, gates: ['desing'] }), refusedWith(/^--gate desing: the workflow has no step "desing"/));
  assert.equal(runsWritten(), before, 'no run written');
  assert.ok(fs.existsSync(path.join(inboxDir(), 'plan-the-flag-e5f6.md')) && fs.existsSync(path.join(inboxDir(), 'plan-the-flag-g7h8.md')), 'the cards are where they were');
});
