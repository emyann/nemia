/**
 * The store's cordon, as the tick honours it: while `$WF_ROOT/cordon` stands no pass starts new work — no step, try or check filed, no
 * queued task admitted, no queued card started, nothing of a run `wf start` wrote meanwhile — and what runs finishes; a person's retry and
 * approval written meanwhile wait on their files; and the pass after the lift files what waits. Every pass judges afresh what the memo of
 * runs at rest answers (`verifyRest`), and one in the middle starts with no memo at all, as a restarted daemon does.
 *
 * Walked through the runtime itself over an in-memory journal and a harness the test signs by hand, as rest-store.test.ts does, and every
 * filing `queued` as the store's own engine files it (`engineOf`), under the store's own admission (`storeAdmission`), so admission is
 * the runtime's: a task filed waits until a pass admits it, and none is admitted while the cordon stands. A store of its own, since `tick` reads every run under `WF_ROOT`, which is read as the module loads and so set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { PromiseJournal, PromiseRunner, PromiseSighting } from 'agent-runtime';
import { Engine } from 'agent-runtime/effect';
import type { Run } from '../run.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-cordon-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10000';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { addToInbox, approve, queueInInbox, readInbox, retry, start } = await import('../runner.ts');
const { approvalFile, asksDir, readRun } = await import('../record/record.store.ts');
const { tick, freshRestMemo } = await import('./tick.verb.ts');
const { engineOf, storeAdmission } = await import('../runtime-client.ts');
const { liftCordon, putCordon } = await import('../cordon/cordon.store.ts');
const { cordonRead, runsListed } = await import('../list/list.verb.ts');
const { COMMANDS } = await import('../command/commands.verb.ts');
const { cordonLines } = await import('../cordon/cordon.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** A repository with one commit, so `wf start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  git(repo, 'init', '-q');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/**
 * A workflow folder of the steps given, each `after` the one before it, with the frontmatter lines `more` gives each: on codex, unless
 * they name a harness.
 */
const folder = (steps: readonly string[], more: (name: string) => string = () => '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\n${more(name).includes('harness:') ? '' : 'harness: codex\n'}${k ? `after: ${steps[k - 1]}\n` : ''}${more(name)}---\n${name} it\n`,
    ),
  );
  return dir;
};

/** The engine's store, in memory, noting in `starts` when each attempt began, by its session's name. */
const memoryJournal = (starts: Map<string, number>): PromiseJournal => {
  const tasks = new Map<string, Parameters<PromiseJournal['append']>[1][]>();
  const feed: Awaited<ReturnType<PromiseJournal['feed']>>['entries'] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
      if (event.kind === 'starting') starts.set(`ae/${taskId}-${event.attempt}`, Date.parse(event.at));
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const BLOCKED = { outcome: 'blocked', summary: 'two flags could be meant', artifacts: [], needs: 'which flag?' };

/**
 * The runtime, with a harness whose sessions work until `signAll` ends them, and the sessions it was asked to start, by name. `signAll`
 * signs every session at work but those of the runs `keep` names, with `BLOCKED` for those of the runs `blocking` names.
 */
const engine = () => {
  const sessions = new Map<string, PromiseSighting>();
  const spawned: string[] = [];
  const runner: PromiseRunner = {
    async spawn(r) {
      spawned.push(r.name);
      sessions.set(r.name, { sessionId: `s-${spawned.length}`, nativeId: `native-${spawned.length}`, state: 'working', busy: true });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(id) {
      for (const [name, s] of sessions) if (s.sessionId === id) sessions.set(name, { ...s, state: 'stopped', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const starts = new Map<string, number>();
  const e = engineOf(
    Engine.layer({
      root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
      journal: memoryJournal(starts),
      harnesses: { claude: runner, codex: runner, check: runner },
      defaultHarness: 'claude',
      ...storeAdmission(),
    }),
  );
  const of = (name: string, runs: readonly Run[]) => runs.some((r) => name.startsWith(`ae/${r.id}-`));
  const signAll = (keep: readonly Run[] = [], blocking: readonly Run[] = []) => {
    for (const [name, s] of sessions) {
      if (s.state !== 'working' || of(name, keep)) continue;
      const payload = of(name, blocking) ? BLOCKED : SIGNED;
      sessions.set(name, { ...s, state: 'done', busy: false, closeout: { payload, at: (starts.get(name) ?? Date.now()) + 1 } });
    }
  };
  return { e, spawned, signAll };
};

const h = engine();
const REPO = aRepo();
const MEMO = freshRestMemo();
/** A pass as the daemon makes one, with the memo it keeps — or with none, as a restarted daemon's first pass. */
const pass = (memo = MEMO) => tick(h.e, { repo: ROOT, memo, verifyRest: true });
const begun = (workflowDir: string, more: Partial<Parameters<typeof start>[0]> = {}) =>
  start({ brief: 'cordoned', repo: REPO, workflowDir, isolate: false, ...more });
const taskOf = (run: Run, step: string): string | undefined => readRun(run.id).steps[step]?.taskId ?? undefined;

const TWO = folder(['plan', 'work']);
const ONE = folder(['work']);
const CHECKED = folder(['work'], () => 'check: "true"\n');
const SHIP = folder(['work', 'ship'], (name) => (name === 'ship' ? 'harness: claude\ngate: true\nworkspace: main\ncheck: "true"\n' : ''));
const LANDS = aRepo();

/** A file left in the worktree of `branch` of `repo`, for the step at work there to hand off, as a session leaves its work. */
const worked = (repo: string, branch: string) => {
  const lines = git(repo, 'worktree', 'list', '--porcelain').split('\n');
  const at = lines.indexOf(`branch refs/heads/${branch}`);
  assert.ok(at > 0, `${branch} has a worktree`);
  fs.writeFileSync(path.join(lines[at - 2].replace(/^worktree /, ''), 'work.txt'), 'work\n');
};

/** The merge staged in `repo`'s checkout, uncommitted, as a landing's session leaves it for its check. */
const staged = (repo: string) => {
  git(repo, 'checkout', '-q', '-b', 'side');
  fs.writeFileSync(path.join(repo, 'side.txt'), 'side\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'side');
  git(repo, 'checkout', '-q', '-');
  git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'side');
};

test('while the store is cordoned nothing new starts and what runs finishes; the pass after the lift files what waits', async () => {
  const running = begun(TWO);
  const checked = begun(CHECKED);
  const refused = begun(ONE);
  const gated = begun(TWO, { gates: ['plan'] });
  const landing = begun(SHIP, { repo: LANDS, isolate: true });
  for (let k = 0; k < 6; k++) {
    await pass();
    if (k === 0) worked(LANDS, readRun(landing.id).steps.work.branch!);
    h.signAll([running, checked], [refused]);
  }
  await approve(h.e, landing.id, 'ship');
  for (let k = 0; k < 3; k++) await pass();
  assert.ok(taskOf(landing, 'ship'), "landing's ship at work as the cordon is put");
  assert.ok(taskOf(running, 'plan') && taskOf(checked, 'work'), "running's plan and checked's work at work as the cordon is put");
  assert.ok(taskOf(gated, 'plan') && !taskOf(gated, 'work'), "gated's plan signed, its work waiting at the gate");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's work signed blocked, on its first try");
  const queued = begun(ONE);
  await pass();
  const queuedTask = taskOf(queued, 'work')!;
  assert.equal((await h.e.view(queuedTask)).admission, 'queued', 'a task filed and not yet admitted');

  const cordon = putCordon({ why: 'merging by hand', by: 'ann' });
  const born = begun(ONE);
  await retry(h.e, refused.id, 'work', { mode: 'fresh' });
  await approve(h.e, gated.id, 'plan');
  const { card } = addToInbox({ text: 'an idea queued meanwhile', workflow: ONE, repo: REPO });
  queueInInbox(card.name);
  const before = h.spawned.length;
  staged(LANDS);

  const first = await pass();
  assert.deepEqual(first.cordon, cordon, 'the pass says the cordon it read');
  assert.equal(first.queue, undefined, 'and started no queued card');
  h.signAll();
  await pass(freshRestMemo());
  await pass();
  const last = await pass();

  assert.deepEqual(h.spawned.slice(before), [], 'no session started while the store is cordoned');
  assert.equal((await h.e.view(queuedTask)).admission, 'queued', 'the queued task not admitted');
  assert.equal((await h.e.view(taskOf(running, 'plan')!)).phase, 'succeeded', "running's plan finished");
  assert.equal(taskOf(running, 'work'), undefined, "running's work, ready, not filed");
  assert.equal(readRun(checked.id).steps.work?.check, undefined, "checked's work signed, its check not filed");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work`, "refused's try asked, not filed");
  assert.deepEqual(
    fs.readdirSync(asksDir(refused.id)).filter((f) => f !== 'done'),
    ['retry-work-2'],
    'and the ask kept',
  );
  assert.ok(fs.existsSync(approvalFile(gated.id, 'plan', 1)), "gated's approval kept");
  assert.equal(taskOf(gated, 'work'), undefined, "gated's work not filed on it");
  assert.equal(taskOf(born, 'work'), undefined, 'nothing filed of the run started while cordoned');
  assert.equal(last.queue, undefined, 'no queued card started');
  assert.equal(readInbox().find((l) => l.name === card.name)?.tried, undefined, 'nor tried');
  assert.ok(
    !('cordon' in JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${running.id}.json`), 'utf8'))),
    'no record holds the cordon',
  );

  const listed = await runsListed(h.e);
  const repo = readRun(landing.id).repo!;
  assert.deepEqual(
    listed.cordoned,
    { cordon, staged: [{ run: landing.id, step: 'ship', repo }] },
    'wf ls names the cordon, and the landing whose merge it holds staged in the checkout, its check not filed',
  );
  assert.equal(readRun(landing.id).steps.ship?.check, undefined);
  assert.deepEqual(await cordonRead(h.e), listed.cordoned, 'and the api reads the same');
  const ls = COMMANDS.find((c) => c.name === 'ls')!;
  assert.deepEqual(ls.print(listed, {}).slice(0, 2), cordonLines(listed.cordoned), 'wf ls says it first');

  liftCordon();
  const lifted = await pass();
  assert.equal(lifted.cordon, undefined, 'the pass after the lift says no cordon');
  assert.ok(taskOf(running, 'work'), "running's work filed");
  assert.ok(readRun(checked.id).steps.work?.check, "checked's check filed");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work-try2`, "refused's try filed");
  assert.ok(taskOf(gated, 'work'), "gated's work filed on the approval");
  assert.ok(taskOf(born, 'work'), 'the run started while cordoned filed');
  assert.ok(lifted.queue, 'the queued card tried');
  assert.ok(readRun(landing.id).steps.ship?.check, "landing's check filed");
  assert.equal((await runsListed(h.e)).cordoned, undefined, 'and wf ls says no cordon');
  assert.deepEqual(await cordonRead(h.e), { cordon: null, staged: [] });
  await pass();
  assert.ok(h.spawned.length > before, 'and sessions started again');
  assert.notEqual((await h.e.view(queuedTask)).admission, 'queued', 'the queued task admitted');
});
