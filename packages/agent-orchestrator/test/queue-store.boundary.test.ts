/**
 * The queue on real git, in a store of its own: a queued card whose start the place cannot read, or whose `repo:` is no git repository.
 *
 * - a queued card whose start fails without a refusal (`.worktreeinclude` a link to itself): the test place has no link.
 * - a queued card whose `repo:` is no git repository, in the place's words: the test place words its refusals its own way.
 * - a `nemia up` at a cap of 1 names the card its queue is stuck on: the same link.
 *
 * `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../src/runtime-client.ts';
import type { Run, TaskPhase } from '../src/run.ts';
import { queueLine } from '../src/inbox/inbox.ts';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';
import { Effect } from 'effect';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-queue-');
const RUNS = path.join(ROOT, 'runs');
const INBOX = path.join(ROOT, 'inbox');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { startRun, tickRun, runWith: runEngine, gitPlaceLayer } = await import('../src/runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const runPlaced = runGiven(gitPlaceLayer);
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/**
 * An engine board a test settles by hand, as the engine would: a task filed is `pending`, and one asked to stop before it settled is
 * settled `stopped` by the next engine tick. Its feed has every filing, at the time the test's clock says, and `later` moves that clock on,
 * in minutes. `list` views the tasks it is handed that were filed.
 */
/** Hands `e` a tick of its own, which the verbs of the engine then read. */
const retick = (e: Engine, tick: Engine['tick']): void => void Object.assign(e, { tick });

const board = () => {
  const tasks = new Map<
    string,
    { spec: { id: string; brief: string; cwd: string; closeoutSchema?: object }; phase: TaskPhase; closeout?: unknown; filedAt: string }
  >();
  const filings: string[] = [];
  const feed: Array<{ taskId: string; event: { kind: 'filed'; at: string } }> = [];
  const stopping = new Set<string>();
  const settledPhase = (p: TaskPhase) => ['succeeded', 'failed', 'stopped'].includes(p);
  let now = Date.parse('2026-09-16T10:00:00.000Z');
  const e = promised({
    tick: async () => {
      for (const id of stopping) {
        const t = tasks.get(id);
        if (t && !settledPhase(t.phase)) t.phase = 'stopped';
      }
      stopping.clear();
      return { tasks: 0, actions: [], running: {}, views: [] };
    },
    admit: async () => [],
    view: async (id: string) => {
      const t = tasks.get(id);
      return {
        id,
        phase: t?.phase ?? 'pending',
        sessionId: t ? 's' : null,
        state: {
          brief: t?.spec.brief ?? '',
          ...(t ? { filedAt: t.filedAt } : {}),
          closeoutSchema: t?.spec.closeoutSchema,
          settled: t && settledPhase(t.phase) ? t.phase : null,
          stopRequested: stopping.has(id),
          said: [],
          attempts:
            !t || t.phase === 'pending'
              ? []
              : [
                  {
                    n: 1,
                    ended: null,
                    nativeId: `native-${id}`,
                    closeout: t.closeout,
                    exitCode: null,
                    usage: null,
                    startedAt: new Date(now).toISOString(),
                    spawnedAt: new Date(now).toISOString(),
                    endedAt: null,
                    reason: null,
                  },
                ],
        },
      };
    },
    file: async (spec: { id: string; brief: string; cwd: string }) => {
      filings.push(spec.id);
      tasks.set(spec.id, { spec, phase: 'pending', filedAt: new Date(now).toISOString() });
      feed.push({ taskId: spec.id, event: { kind: 'filed', at: new Date(now).toISOString() } });
      return spec.id;
    },
    stop: async (id: string) => {
      stopping.add(id);
    },
    logs: async () => '(no output yet)',
    feed: async (after = 0) => ({ entries: feed.slice(after), cursor: feed.length }),
    list: async (ids?: readonly string[]) => ({
      views: await Promise.all((ids ?? [...tasks.keys()]).filter((id) => tasks.has(id)).map((id) => Effect.runPromise(e.view(id)))),
      unreadable: [],
    }),
  });
  const settle = (id: string, phase: TaskPhase, closeout?: unknown) => Object.assign(tasks.get(id)!, { phase, closeout });
  const later = (minutes: number) => {
    now += minutes * 60_000;
  };
  return { e, tasks, filings, settle, later };
};

/**
 * A store with no runs, no cards, no tries of the queue and no ceilings of a last pass in it, and the cap as given: `undefined` unsets it.
 */
const emptyStore = (cap: string | undefined) => {
  for (const dir of [RUNS, INBOX, path.join(ROOT, 'queue'), path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  if (cap === undefined) delete process.env.WF_MAX_RUNS;
  else process.env.WF_MAX_RUNS = cap;
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
})();

/**
 * `nemia start`, for real, of a one-step run over a repository of its own unless given one — created at `createdAt`, written over the
 * record as the test's to say.
 */
const started = async (
  brief: string,
  createdAt: string,
  opts: { isolate?: boolean; after?: string[]; repo?: string } = {},
): Promise<Run> => {
  const run = await runPlaced(
    startRun({
      brief,
      repo: opts.repo ?? aRepo(),
      workflowDir: oneStep,
      isolate: opts.isolate ?? false,
      ...(opts.after ? { after: opts.after } : {}),
    }),
  );
  const file = path.join(RUNS, `${run.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), createdAt }, null, 2));
  return readRun(run.id);
};
const at = (minute: number) => `2026-09-16T09:${String(minute).padStart(2, '0')}:00.000Z`;

/** What `main` printed, line by line, for one verb. */
const printedBy = async (
  t: { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } },
  e: Engine,
  ...argv: string[]
): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** A repository with one commit and a one-step workflow under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = aRepo();
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

/** A card written by hand, under a name of the test's: its keys as given, then its body. */
const aCard = (name: string, keys: Record<string, string>, body: string): string => {
  fs.mkdirSync(INBOX, { recursive: true });
  const file = path.join(INBOX, `${name}.md`);
  fs.writeFileSync(
    file,
    `---\n${Object.entries(keys)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n---\n${body}\n`,
  );
  return file;
};

const fromCard = (card: string) => listRuns().filter((r) => r.from?.inbox === card);

test('a queued card whose start fails without a refusal — its `.worktreeinclude` a link to itself, which its place cannot read, say — is not written off: tried again on every pass, where it keeps its place and the card behind it waits, said once on `nemia up`, and started once the failure clears', async (t) => {
  emptyStore(undefined);
  const b = board();
  const repo = aRepoWith('dev');
  const broken = aRepoWith('dev');
  fs.symlinkSync('.worktreeinclude', path.join(broken, '.worktreeinclude'));
  aCard('odd-include-a1b2', { workflow: 'dev', repo: broken, queued: '2026-09-16T09:00:00.000Z' }, 'Its include file is a link to itself');
  aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');

  const first = await runWith(b.e, tickRun());
  assert.ok(first.queue && 'failed' in first.queue, JSON.stringify(first.queue));
  assert.deepEqual([first.queue.card, first.queue.again], ['odd-include-a1b2', false]);
  assert.match(
    first.queue.failed,
    /^the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered, stat '.*\.worktreeinclude'\. Nothing was started: start it again$/,
    "a repository whose `.worktreeinclude` is a link to itself: the place's open cannot read it, and an open not heard is no refusal",
  );
  const written = JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'odd-include-a1b2.json'), 'utf8'));
  assert.deepEqual([written.refused, written.repo, written.why], [false, broken, first.queue.failed]);
  const listed = (await printedBy(t, b.e, 'inbox')).find((l) => l.startsWith('odd-include-a1b2'))!;
  assert.match(
    listed,
    / {2}queued 1 of 2 — failed at \S+: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered.* — not a refusal: the tick tries it again on every pass, where it keeps its place$/,
  );

  const up = board();
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = up.e.tick;
  retick(up.e, () => {
    if (++passes > 2) return Effect.die(stop);
    return inner();
  });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up', '1'], up.e), (err) => err === stop);
  } finally {
    log.mock.restore();
  }
  const named = printed.filter((l) => l.includes('odd-include-a1b2'));
  assert.equal(
    named.length,
    1,
    `\`nemia up\` over two passes says the failure once, on its first pass, though it is \`again\`: the \`tick\` above wrote it down and this daemon never printed its line, and a person restarting \`nemia up\` to see why cards stopped starting is told by it:\n${printed.join('\n')}`,
  );
  assert.match(
    named[0],
    /^\d\d:\d\d:\d\d  odd-include-a1b2 not started: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links encountered.* — not a refusal: tried again on the next pass, where it keeps its place, and said again only if it fails otherwise$/,
  );
  const again = await runWith(b.e, tickRun());
  assert.deepEqual(
    [again.queue && 'failed' in again.queue && again.queue.again, listRuns()],
    [true, []],
    'tried again, and nothing started behind it',
  );
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', 'odd-include-a1b2.json'), 'utf8')).at, written.at, 'not written again');

  fs.rmSync(path.join(broken, '.worktreeinclude'));
  const cleared = await runWith(b.e, tickRun());
  const [run] = fromCard('odd-include-a1b2');
  assert.deepEqual(cleared.queue, { card: 'odd-include-a1b2', run: run.id, removed: true }, 'the link gone: the next pass starts it');
  const behind = await runWith(b.e, tickRun());
  assert.deepEqual(
    [behind.queue && 'run' in behind.queue && behind.queue.card, fs.readdirSync(path.join(ROOT, 'queue'))],
    ['behind-c3d4', []],
    'and the pass after removes its try, then starts the card behind it',
  );
});

test("REFUSED at shipped defaults: a queued card whose `repo:` is no git repository, in the place's words, left queued; and the daemon's own stderr is left alone: git's words are not passed through", async (t) => {
  emptyStore(undefined);
  const b = board();
  const bare = fs.mkdtempSync(path.join(ROOT, 'bare-'));
  fs.mkdirSync(path.join(bare, 'workflows', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(bare, 'workflows', 'dev', 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  aCard('no-git-a1b2', { workflow: 'dev', repo: bare, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository has no git');

  const said: string[] = [];
  const stderr = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    said.push(String(chunk));
    return true;
  });
  let pass: Effect.Success<ReturnType<typeof tickRun>>;
  try {
    pass = await runWith(b.e, tickRun());
  } finally {
    stderr.mock.restore();
  }
  assert.deepEqual(
    said,
    [],
    "git writes `fatal:` on its stderr, and that stderr is not the daemon's: a pass every four seconds would print it every four seconds",
  );

  assert.ok(pass.queue && 'refused' in pass.queue, JSON.stringify(pass.queue));
  assert.ok(
    queueLine(pass.queue).startsWith(
      `no-git-a1b2 not started: ${bare} is not a git repository: run git init there and commit once, or name a repository with --repo — left queued as it is`,
    ),
    `the place's open refuses it, and the card is said once with its name on it: ${queueLine(pass.queue)}`,
  );
  assert.deepEqual(listRuns(), [], 'and no run');
});

test('a `nemia up` at a cap of 1 names the card its queue is stuck on once a slot frees, though its first pass read no queue at all: a daemon says what it has not said, not what the store has not written', async (t) => {
  emptyStore('1');
  const b = board();
  const broken = aRepoWith('dev');
  fs.symlinkSync('.worktreeinclude', path.join(broken, '.worktreeinclude'));
  aCard('odd-include-a1b2', { workflow: 'dev', repo: broken, queued: '2026-09-16T09:00:00.000Z' }, 'Its include file is a link to itself');
  const before = await runWith(b.e, tickRun());
  assert.ok(
    before.queue && 'failed' in before.queue && !before.queue.again,
    `a card whose start fails without a refusal, tried and written down by a pass of its own, the daemon that is gone: ${JSON.stringify(before.queue)}`,
  );

  const busy = await started('holds the slot', at(1));
  let passes = 0;
  const stop = new Error('the test stops the daemon');
  const inner = b.e.tick;
  retick(b.e, () => {
    if (++passes > 2) return Effect.die(stop);
    if (passes === 2) b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
    return inner();
  });
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await assert.rejects(main(['up', '1'], b.e), (err) => err === stop);
  } finally {
    log.mock.restore();
  }

  const named = printed.filter((l) => l.includes('odd-include-a1b2'));
  assert.equal(
    named.length,
    1,
    `a run holds the one slot, so the daemon's first pass reads no queue, and its second tries the card and fails as the pass above did, \`again\`, never said by this daemon:\n${printed.join('\n')}`,
  );
  assert.match(
    named[0],
    /^\d\d:\d\d:\d\d  odd-include-a1b2 not started: the place's open was not heard: open threw before it answered: ELOOP: too many symbolic links/,
  );
  const filed = printed.findIndex((l) => l.includes(`${busy.id}  filed implement`));
  assert.ok(filed >= 0 && filed < printed.indexOf(named[0]), `the pass that held the slot came first: ${printed.join('\n')}`);
});
