/**
 * A journal that does not read is a check's, or an earlier try's: `nemia ls` says the run it belongs to is unreadable, in the words the
 * board's list says it with (`unjudgedWords`), marks `unreadable` the step whose check or try it is, and lists every other run — a run
 * waiting on it among them, and with a cap on runs in flight (`runSlots`) — while `nemia decide` of such a run refuses in those words.
 * Walked through the runtime itself, `plainEngine` over an in-memory journal that hands back what was put in it, as a store does.
 *
 * `WF_ROOT` is set before the command line is imported, which reads it as the module loads; `WF_MAX_RUNS` caps the runs, so `nemia ls`
 * reads the slots. A pass has read where the runs' branches stand (`passStanding`), which `nemia ls` reads off `standing.json`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { plainEngine } from './promised.ts';
import { runGiven } from './placed.ts';

const ROOT = scratch('wf-unreadable-list-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_MAX_RUNS = '4';
const { main } = await import('../src/cli/main.ts');
const { gitPlaceLayer } = await import('../src/place/builtin.store.ts');
const runPlaced = runGiven(gitPlaceLayer);
const { passStanding } = await import('../src/standing/standing.verb.ts');
const { listRuns } = await import('../src/record/record.store.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const REPO = fs.mkdtempSync(path.join(ROOT, 'repo-'));
git(REPO, 'init', '-q', '-b', 'main');
git(REPO, 'commit', '-q', '--allow-empty', '-m', 'base');
const BASE = git(REPO, 'rev-parse', 'HEAD');

/** A branch off main with one commit of work on it, merged into main when the run it is the result of has `landed`. */
function worked(branch: string, landed = false) {
  git(REPO, 'checkout', '-q', '-b', branch);
  git(REPO, 'commit', '-q', '--allow-empty', '-m', `the work of ${branch}`);
  git(REPO, 'checkout', '-q', 'main');
  if (landed) git(REPO, 'merge', '-q', '--no-ff', '-m', `merge ${branch}`, branch);
}

const at = '2026-09-28T09:00:00.000Z';
/** What no runtime writes: a `measured` whose responses are a word. */
const MISWRITTEN = { kind: 'measured', at, attempt: 1, usage: { responses: 'three' } };

const tasks = new Map<string, unknown[]>();
const signedOff = (taskId: string) =>
  tasks.set(taskId, [
    { kind: 'filed', at, brief: 'Do it.', cwd: REPO, maxAttempts: 1, harness: 'codex' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);
const spoil = (taskId: string) => tasks.get(taskId)!.push(MISWRITTEN);

const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};
const runner: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), codex: asyncOps(runner), check: asyncOps(runner) },
    defaultHarness: 'claude',
  }),
);

function writeRun(id: string, steps: Record<string, object>, more: object = {}) {
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: REPO,
      baseRef: BASE,
      workspace: REPO,
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at,
      workflowDir: path.join(ROOT, 'no-such-workflow'),
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
      steps,
      ...more,
    }),
  );
}

worked('wf/r-good/implement');
signedOff('r-good-implement');
writeRun('r-good', { implement: { taskId: 'r-good-implement', branch: 'wf/r-good/implement' } });

worked('wf/r-check/implement', true);
signedOff('r-check-implement');
signedOff('r-check-implement-check');
spoil('r-check-implement-check');
writeRun('r-check', {
  implement: { taskId: 'r-check-implement', branch: 'wf/r-check/implement', check: { taskId: 'r-check-implement-check' } },
});

worked('wf/r-try/implement');
signedOff('r-try-implement');
spoil('r-try-implement');
signedOff('r-try-implement-2');
writeRun('r-try', {
  implement: { taskId: 'r-try-implement-2', branch: 'wf/r-try/implement', tries: [{ taskId: 'r-try-implement', cause: 'retries' }] },
});

writeRun('r-waiting', {}, { after: ['r-check'] });
await runPlaced(passStanding(listRuns()));

const printedBy = async (t: TestContext, argv: string[]) => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  const error = t.mock.method(console, 'error', () => {});
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return out.join('\n').split('\n');
};

/** The lines `nemia ls` printed for one run: its own line and those under it, up to the next run's. */
const blockOf = (lines: readonly string[], id: string): string[] => {
  const from = lines.findIndex((l) => l.startsWith(`${id}  `));
  assert.ok(from >= 0, `nemia ls lists ${id}:\n${lines.join('\n')}`);
  const to = lines.findIndex((l, i) => i > from && !l.startsWith(' '));
  return lines.slice(from, to < 0 ? undefined : to);
};

const unreadableLine = (block: readonly string[]) =>
  block.find((l) => l.startsWith('   → unreadable: '))?.slice('   → unreadable: '.length);

test("nemia ls says a run whose check's journal, or an earlier try's, does not read is unreadable, on that step, and lists every other run", async (t) => {
  const lines = await printedBy(t, ['ls']);
  for (const [id, task] of [
    ['r-check', 'r-check-implement-check'],
    ['r-try', 'r-try-implement'],
  ]) {
    const block = blockOf(lines, id);
    const said = unreadableLine(block);
    assert.ok(
      said?.startsWith(
        `${id}'s record reads, but the journal of its task ${task} does not: ${task}'s journal, entry 6 is a \`measured\` event`,
      ),
      block.join('\n'),
    );
    assert.ok(said?.includes('So nemia ls does not judge the run, and the tick does not advance it'), said);
    assert.match(
      block.find((l) => l.startsWith('   implement'))!,
      /^ {3}implement\s+unreadable\s/,
      block.join('\n'),
    );
  }
  const waiting = unreadableLine(blockOf(lines, 'r-waiting'));
  assert.ok(
    waiting?.startsWith(
      `r-waiting's record reads, but the journal of a task of a run it waits on does not: r-check-implement-check's journal, entry 6`,
    ),
    waiting,
  );
  const good = blockOf(lines, 'r-good');
  assert.equal(unreadableLine(good), undefined, good.join('\n'));
  assert.doesNotMatch(good.join('\n'), /unreadable/);
});

test('nemia ls of one such run says it, as the list does', async (t) => {
  const said = unreadableLine(blockOf(await printedBy(t, ['ls', 'r-try']), 'r-try'));
  assert.ok(said?.startsWith(`r-try's record reads, but the journal of its task r-try-implement does not: `), said);
});

test("nemia decide of such a run refuses in the list's words, and decides a run whose tasks read", async (t) => {
  const listed = await printedBy(t, ['ls']);
  for (const id of ['r-check', 'r-try']) {
    const err = await main(['decide', id], e).then(
      () => assert.fail(`nemia decide ${id} decided`),
      (thrown: unknown) => thrown as Error,
    );
    assert.equal(err.message, unreadableLine(blockOf(listed, id))!.replace('So nemia ls does not', 'So nemia decide does not'));
  }
  const good = await printedBy(t, ['decide', 'r-good']);
  assert.ok(good[0].startsWith('r-good  The brief of r-good'), good.join('\n'));
});
