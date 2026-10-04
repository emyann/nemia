/**
 * The store's cordon, as the tick honours it: while `$WF_ROOT/cordon` stands no pass starts new work — no step, try or check filed, no
 * queued task admitted, no queued card started, nothing of a run `wf start` wrote meanwhile — and what runs finishes; a person's retry and
 * approval written meanwhile wait on their files; and the pass after the lift files what waits. Every pass judges afresh what the memo of
 * runs at rest answers (`verifyRest`), and one in the middle starts with no memo at all, as a restarted daemon does.
 *
 * Walked through the runtime itself over an in-memory journal and a harness the test signs by hand, as rest-store.test.ts does, and every
 * filing `queued` as the store's own engine files it (`engineOf`), so admission is the runtime's: a task filed waits until a pass admits
 * it. A store of its own, since `tick` reads every run under `WF_ROOT`, which is read as the module loads and so set before the import.
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
const { engineOf } = await import('../runtime-client.ts');
const { liftCordon, putCordon } = await import('../cordon/cordon.store.ts');

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

/** A workflow folder of the steps given, each `after` the one before it, on codex, with the frontmatter lines `more` gives each. */
const folder = (steps: readonly string[], more: (name: string) => string = () => '') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  steps.forEach((name, k) =>
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\nharness: codex\n${k ? `after: ${steps[k - 1]}\n` : ''}${more(name)}---\n${name} it\n`,
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

test('while the store is cordoned nothing new starts and what runs finishes; the pass after the lift files what waits', async () => {
  const running = begun(TWO);
  const checked = begun(CHECKED);
  const refused = begun(ONE);
  const gated = begun(TWO, { gates: ['plan'] });
  for (let k = 0; k < 6; k++) {
    await pass();
    h.signAll([running, checked], [refused]);
  }
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

  liftCordon();
  const lifted = await pass();
  assert.equal(lifted.cordon, undefined, 'the pass after the lift says no cordon');
  assert.ok(taskOf(running, 'work'), "running's work filed");
  assert.ok(readRun(checked.id).steps.work?.check, "checked's check filed");
  assert.equal(taskOf(refused, 'work'), `${refused.id}-work-try2`, "refused's try filed");
  assert.ok(taskOf(gated, 'work'), "gated's work filed on the approval");
  assert.ok(taskOf(born, 'work'), 'the run started while cordoned filed');
  assert.ok(lifted.queue, 'the queued card tried');
  await pass();
  assert.ok(h.spawned.length > before, 'and sessions started again');
  assert.notEqual((await h.e.view(queuedTask)).admission, 'queued', 'the queued task admitted');
});
