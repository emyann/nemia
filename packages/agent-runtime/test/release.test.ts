/**
 * Letting a finished session go, at shipped defaults — a fake `claude` on PATH that keeps a registry.
 *
 * Claude Code keeps every `--bg` session in `claude agents` until something removes it, and one that has given its closeout
 * stays `working/idle` there for good. So once an attempt's end is on the record, the engine releases its session. What is
 * checked is what the engine really runs: the fake writes down every call, and keeps its rows the way `claude agents
 * --all --json` prints them.
 *
 * Claude Code writes a session's cost into its transcript only as its process exits. A session that gave its closeout keeps
 * its process, and its transcript no cost, until it is stopped, which is after its end is on the record; a `--bg` session
 * that ended its turn is listed `done`, idle, with its pid, and has no cost until `claude stop`. A release therefore stops a
 * session whose process runs before it removes it: removed unstopped, nothing would read what it cost.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Event } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { seenFor } from './sighting.ts';
import type { AsyncJournal } from './promise-runner.ts';

const tmp = (label: string) => scratch(`ae-release-${label}-`);

/** Where Claude Code keeps transcripts: read when the runner is loaded, so set before the runner's import. */
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { Engine } = await import('../src/index.ts');
const { asyncStore } = await import('./promise-runner.ts');

const { builtEngine } = await import('./engine.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and idle; `stop <short>`
 * marks one stopped and `rm <short>` deletes it, each refusing an id it does not have as Claude Code does
 * ("No job matching"). While `<bin>/rm-fails` exists, `rm` fails. Every call is written down.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const calls = path.join(bin, 'calls.jsonl');
  const rmFails = path.join(bin, 'rm-fails');
  const costOnStop = path.join(bin, 'cost-on-stop');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'rm' && fs.existsSync(${JSON.stringify(rmFails)})) { process.stderr.write('could not remove\\n'); process.exit(1); }
  // As Claude Code does as a session's process exits, before \`stop\` returns: its cost, twice, into its transcript.
  if (args[0] === 'stop' && fs.existsSync(${JSON.stringify(costOnStop)})) {
    const cost = { type: 'cost-state', sessionId: rows[at].sessionId, ...JSON.parse(fs.readFileSync(${JSON.stringify(costOnStop)}, 'utf8')), startTime: rows[at].startedAt };
    fs.appendFileSync(${JSON.stringify(path.join(config, 'projects', 'fake-project'))} + '/' + rows[at].sessionId + '.jsonl', JSON.stringify(cost) + '\\n' + JSON.stringify(cost) + '\\n');
  }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'idle', kind: 'background', startedAt: Date.now(), cwd: process.cwd() });
  save();
}
`,
    { mode: 0o755 },
  );
  return {
    bin,
    rows: () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[],
    setRows: (rows: Row[]) => fs.writeFileSync(registry, JSON.stringify(rows)),
    /** The calls that let a session go, in order, with the short id each was given. */
    releases: () =>
      fs
        .readFileSync(calls, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as string[])
        .filter((a) => a[0] === 'stop' || a[0] === 'rm'),
    rmFails: (fails: boolean) => (fails ? fs.writeFileSync(rmFails, '') : fs.rmSync(rmFails, { force: true })),
    /** Makes every later `stop` write these totals into the session's transcript as a `cost-state` pair. */
    costOnStop: (totals: object) => fs.writeFileSync(costOnStop, JSON.stringify(totals)),
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    return await f();
  } finally {
    process.env.PATH = prev;
  }
};

/** When the journal says the task's first attempt began, in milliseconds since the epoch. */
const begun = async (engine: ReturnType<typeof builtEngine>, id: string) =>
  Date.parse((await Effect.runPromise(engine.view(id))).state.attempts[0]?.startedAt ?? '');

/**
 * The session's transcript, in which it called StructuredOutput: where the runner reads a statement. A statement counts only
 * when made after its attempt began (`began`, off the journal), and a line is counted as used only after its session's own
 * start (the row's `startedAt`): it is stamped a moment after the later of the two.
 */
const said = (row: Row, began: number, payload: object) => {
  const dir = path.join(config, 'projects', 'fake-project');
  fs.mkdirSync(dir, { recursive: true });
  const at = new Date(Math.max(began, row.startedAt) + 1).toISOString();
  fs.writeFileSync(
    path.join(dir, `${row.sessionId}.jsonl`),
    [
      {
        type: 'user',
        uuid: 'u-1',
        parentUuid: null,
        sessionId: row.sessionId,
        timestamp: at,
        message: { role: 'user', content: 'the prompt' },
      },
      {
        type: 'assistant',
        uuid: 'a-1',
        parentUuid: 'u-1',
        sessionId: row.sessionId,
        timestamp: at,
        message: { id: 'msg_1', role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'StructuredOutput', input: payload }] },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n') + '\n',
  );
};

const short = (row: Row) => row.sessionId.split('-')[0];

/** A journal held in `tasks`, each task's entries in order, whose feed names nothing. */
const inMemory = (tasks: Record<string, Event[]>): AsyncJournal => ({
  async append(id, e) {
    (tasks[id] ??= []).push(e);
  },
  async read(id) {
    return [...(tasks[id] ?? [])];
  },
  async list() {
    return Object.keys(tasks);
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
});

/**
 * A transcript with no statement in it, last written `ago` milliseconds ago, its line stamped a moment after its session's own
 * start (the row's `startedAt`), where its usage is counted from. Quiet is counted from the later of a session's last write and
 * its own start, so a test that wants it quiet dates its start back too.
 */
const wrote = (row: Row, ago: number) => {
  const dir = path.join(config, 'projects', 'fake-project');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${row.sessionId}.jsonl`);
  const entry = {
    type: 'user',
    uuid: 'u-1',
    parentUuid: null,
    sessionId: row.sessionId,
    timestamp: new Date(row.startedAt + 1).toISOString(),
    message: { role: 'user', content: 'the prompt' },
  };
  fs.writeFileSync(file, `${JSON.stringify(entry)}\n`);
  const at = new Date(Date.now() - ago);
  fs.utimesSync(file, at, at);
};

test('release at shipped defaults: a finished Claude Code session is stopped if it runs, removed unless a worktree holds its work, and what it cost read once stopped', async (t) => {
  await t.test(
    'a task that gave its closeout settles, and its session is stopped and removed in that pass — the next tick does not see it',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const id = await Effect.runPromise(
          engine.file({
            config: { background: true },
            brief: 'the prompt',
            cwd: tmp('cwd'),
            closeoutSchema: { type: 'object' },
          }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        assert.equal(row?.name, `ae/${id}/1`, 'spawned');
        said(row, await begun(engine, id), { outcome: 'done' });

        await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
        assert.deepEqual(
          claude.releases(),
          [
            ['stop', short(row)],
            ['rm', short(row)],
          ],
          'stopped, since it still ran, then removed',
        );
        assert.deepEqual(claude.rows(), [], 'gone from claude agents');

        await Effect.runPromise(engine.tick());
        assert.equal(claude.releases().length, 2, 'the next tick does not see it, and asks nothing more');
        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.phase, 'succeeded');
        assert.equal(v.sessionId, row.sessionId, 'its id, as recorded when its attempt ended');
        assert.match(
          await Effect.runPromise(engine.logs(id)),
          /the prompt/,
          "and its transcript still read, through the task's own harness",
        );
      });
    },
  );

  await t.test(
    "a session's cost, which Claude Code writes only as its process exits, is read once its release has stopped it — and put on the attempt once",
    async () => {
      for (const worktree of [false, true]) {
        const claude = fakeClaude();
        claude.costOnStop({ totalCostUSD: 0.25, totalAPIDuration: 4000, totalToolDuration: 300, hasUnknownModelCost: false });
        await onPath(claude.bin, async () => {
          const engine = builtEngine(Engine.layer({ root: tmp('root') }));
          const id = await Effect.runPromise(
            engine.file({
              brief: 'the prompt',
              cwd: tmp('cwd'),
              closeoutSchema: { type: 'object' },
              config: { background: true, ...(worktree ? { worktree: true } : {}) },
            }),
          );
          await Effect.runPromise(engine.tick());
          const [row] = claude.rows();
          said(row, await begun(engine, id), { outcome: 'done' });

          for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
          const at = `worktree: ${worktree}`;
          const { state } = await Effect.runPromise(engine.view(id));
          assert.equal(state.settled, 'succeeded', at);
          const entries = (await Effect.runPromise(engine.feed(0))).entries.filter((e) => e.taskId === id).map((e) => e.event);
          const ended = entries.find((e) => e.kind === 'ended');
          assert.equal(
            ended?.kind === 'ended' ? ended.usage?.costUsd : 'no end',
            undefined,
            `${at}: its end was read while its process ran, with no cost in it`,
          );
          assert.equal(
            entries.filter((e) => e.kind === 'measured').length,
            1,
            `${at}: measured once over three passes, though a worktree task's session stays listed`,
          );
          assert.deepEqual(
            state.attempts[0]?.usage,
            { turns: 1, toolCalls: 1, costUsd: 0.25, apiMs: 4000, toolMs: 300 },
            `${at}: on the attempt`,
          );
          assert.deepEqual(
            claude.releases().map((c) => c[0]),
            worktree ? ['stop'] : ['stop', 'rm'],
            `${at}: released as before`,
          );
        });
      }
    },
  );

  await t.test('a session listed done whose process still runs is stopped before it goes — its cost is written only then', async () => {
    const claude = fakeClaude();
    claude.costOnStop({ totalCostUSD: 0.0143, totalAPIDuration: 1081, totalToolDuration: 0, hasUnknownModelCost: false });
    await onPath(claude.bin, async () => {
      const engine = builtEngine(Engine.layer({ root: tmp('root') }));
      const id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      const [row] = claude.rows();
      wrote(row, 0);
      claude.setRows(claude.rows().map((r) => ({ ...r, state: 'done', pid: 424242 })));

      await Effect.runPromise(engine.tick());
      const { state } = await Effect.runPromise(engine.view(id));
      assert.equal(state.settled, 'succeeded');
      assert.deepEqual(
        claude.releases(),
        [
          ['stop', short(row)],
          ['rm', short(row)],
        ],
        'stopped, since its process ran, then removed',
      );
      assert.equal(state.attempts[0]?.usage?.costUsd, 0.0143, 'and what it cost read in between');
    });
  });

  await t.test(
    'a task that asked for a worktree has its session stopped and never removed — claude rm deletes the worktree, with the work in it',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const id = await Effect.runPromise(
          engine.file({
            brief: 'the prompt',
            cwd: tmp('cwd'),
            config: { background: true, worktree: true },
            closeoutSchema: { type: 'object' },
          }),
        );
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        said(row, await begun(engine, id), { outcome: 'done' });

        for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
        assert.deepEqual(claude.releases(), [['stop', short(row)]], 'stopped once, and no rm on any pass');
        assert.deepEqual(
          claude.rows().map((r) => r.state),
          ['stopped'],
          'still listed',
        );
      });
    },
  );

  await t.test(
    'a session ended by quiet is stopped before it goes — its end is on the record, and claude agents still has it working',
    async () => {
      for (const worktree of [false, true]) {
        const claude = fakeClaude();
        await onPath(claude.bin, async () => {
          const root = tmp('root');
          const engine = builtEngine(Engine.layer({ root }));
          const id = await Effect.runPromise(
            engine.file({
              brief: 'the prompt',
              cwd: tmp('cwd'),
              config: { background: true, ...(worktree ? { worktree: true } : {}) },
            }),
          );
          await Effect.runPromise(engine.tick());
          const [row] = claude.rows();
          wrote(row, 10 * 60_000);
          await seenFor(root, row.name, row.sessionId, 10 * 60_000);
          claude.setRows(claude.rows().map((r) => ({ ...r, startedAt: Date.now() - 20 * 60_000 })));

          for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
          const at = `worktree: ${worktree}`;
          assert.equal(
            (await Effect.runPromise(engine.view(id))).state.attempts[0]?.ended,
            'done',
            `${at}: ended by quiet, with no statement`,
          );
          assert.deepEqual(
            claude.releases(),
            worktree
              ? [['stop', short(row)]]
              : [
                  ['stop', short(row)],
                  ['rm', short(row)],
                ],
            `${at}: stopped first`,
          );
          assert.deepEqual(
            claude.rows().map((r) => r.state),
            worktree ? ['stopped'] : [],
            at,
          );
        });
      }
    },
  );

  await t.test(
    'no session is released while its attempt runs; one a person stopped is released once its task settles, its id recorded for logs',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root') }));
        const id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
        await Effect.runPromise(engine.tick());
        const [row] = claude.rows();
        wrote(row, 0);
        for (let i = 0; i < 2; i++) await Effect.runPromise(engine.tick());
        assert.equal((await Effect.runPromise(engine.view(id))).phase, 'working (quiescent)');
        assert.deepEqual(claude.releases(), [], 'running: nothing stopped, nothing removed');

        await Effect.runPromise(engine.stop(id));
        for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(id));
        assert.equal(v.state.settled, 'stopped');
        assert.deepEqual(
          [v.state.attempts[0]?.ended, v.state.attempts[0]?.reason],
          ['stopped', 'operator'],
          'ended, saying why it has no statement',
        );
        assert.equal(v.state.attempts[0]?.nativeId, row.sessionId, 'its session id, recorded as it ended');
        assert.deepEqual(
          claude.releases(),
          [
            ['stop', short(row)],
            ['rm', short(row)],
          ],
          "the person's stop, then — stopped by then — only rm",
        );
        assert.deepEqual(claude.rows(), []);
        assert.equal(v.sessionId, row.sessionId);
        assert.match(await Effect.runPromise(engine.logs(id)), /the prompt/, 'and ae logs still reads it');
      });
    },
  );

  await t.test('a session stopped at its deadline is released once its task settles, as one a person stopped is', async () => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const tasks: Record<string, Event[]> = {};
      const engine = builtEngine(Engine.layer({ root: tmp('root'), journal: asyncStore(inMemory(tasks)) }));
      const deadlineSeconds = 600;
      const id = await Effect.runPromise(
        engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), deadlineSeconds }),
      );
      const longAgo = Date.now() - 2 * deadlineSeconds * 1000;
      const at = new Date(longAgo).toISOString();
      tasks[id].push({ kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 });
      const row = { name: `ae/${id}/1`, sessionId: randomUUID(), state: 'working', status: 'idle', startedAt: longAgo };
      claude.setRows([row]);
      for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
      const v = await Effect.runPromise(engine.view(id));
      assert.equal(v.state.settled, 'failed');
      assert.deepEqual(
        [v.state.attempts[0]?.ended, v.state.attempts[0]?.reason],
        ['failed', 'deadline'],
        'ended, saying why it has no statement',
      );
      assert.deepEqual(
        claude.releases(),
        [
          ['stop', short(row)],
          ['rm', short(row)],
        ],
        'stopped by the deadline, then removed',
      );
    });
  });

  await t.test(
    "a task settled before its session's id was recorded keeps that session listed — removed, ae logs could not read it",
    async () => {
      const claude = fakeClaude();
      const unrecorded = randomUUID();
      const recorded = randomUUID();
      claude.setRows([
        { name: 'ae/before/1', sessionId: unrecorded, state: 'stopped', status: 'idle', startedAt: Date.now() },
        { name: 'ae/after/1', sessionId: recorded, state: 'stopped', status: 'idle', startedAt: Date.now() },
      ]);
      const at = new Date().toISOString();
      const stopped = (settled: Event): Event[] => [
        { kind: 'filed', at, brief: 'the prompt', cwd: '/r', harness: 'claude' },
        { kind: 'starting', at, attempt: 1 },
        { kind: 'spawned', at, attempt: 1 },
        { kind: 'stop-requested', at },
        settled,
      ];
      const tasks: Record<string, Event[]> = {
        before: stopped({ kind: 'settled', at, outcome: 'stopped', note: 'operator' }),
        after: stopped({ kind: 'settled', at, outcome: 'stopped', note: 'operator', nativeId: recorded }),
      };
      await onPath(claude.bin, async () => {
        const engine = builtEngine(Engine.layer({ root: tmp('root'), journal: asyncStore(inMemory(tasks)) }));
        for (let i = 0; i < 2; i++) await Effect.runPromise(engine.tick());
        assert.deepEqual(claude.releases(), [['rm', recorded.split('-')[0]]], 'the session whose id is on the record, and only it');
        assert.deepEqual(
          claude.rows().map((r) => r.name),
          ['ae/before/1'],
          'a journal an older engine wrote settles a stopped task with no session id: that session stays listed',
        );
      });
    },
  );

  await t.test('a release the harness refuses fails nothing else in the pass, and is asked again until it succeeds', async () => {
    const claude = fakeClaude();
    await onPath(claude.bin, async () => {
      const engine = builtEngine(Engine.layer({ root: tmp('root') }));
      const done = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'exits on its own', cwd: tmp('cwd') }));
      await Effect.runPromise(engine.tick());
      claude.setRows(claude.rows().map((r) => ({ ...r, state: 'done' })));
      claude.rmFails(true);
      const next = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'filed after', cwd: tmp('cwd') }));

      await Effect.runPromise(engine.tick());
      assert.equal((await Effect.runPromise(engine.view(done))).state.settled, 'succeeded');
      assert.equal((await Effect.runPromise(engine.view(next))).state.attempts.length, 1, 'the other task was still started');
      await Effect.runPromise(engine.tick());
      const row = claude.rows().find((r) => r.name === `ae/${done}/1`)!;
      assert.deepEqual(
        claude.releases(),
        [
          ['rm', short(row)],
          ['rm', short(row)],
        ],
        'it had exited, so no stop; removal asked on each pass',
      );

      claude.rmFails(false);
      await Effect.runPromise(engine.tick());
      assert.equal(
        claude.rows().some((r) => r.name === `ae/${done}/1`),
        false,
        'and removed once the harness allows it',
      );
    });
  });
});
