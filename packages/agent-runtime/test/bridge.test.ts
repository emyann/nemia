/**
 * A bridged session's link, at shipped defaults — registrations as Claude Code writes them, `<config>/sessions/<pid>.json`, read
 * by `claudeBridge`, and a fake `claude` that keeps a registry, read through the real `observe` and the real `view`.
 *
 * The link is `https://claude.ai/code/<bridgeSessionId>`, off the registration of the process `claude agents` lists for the
 * session. A registration outlives its process, so one that is not the session's gives no link, whatever it holds; an id not of
 * the form `session_…` is refused by name. The view tells three cases apart: asked and up, asked and not up, not asked; an absent
 * link is never read as not bridged.
 *
 * Where Claude Code keeps registrations is read when a runner is made, and transcripts when it is loaded, so `CLAUDE_CONFIG_DIR`
 * is set before the import.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const tmp = (label: string) => scratch(`ae-bridge-${label}-`);

const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const sessions = path.join(config, 'sessions');
fs.mkdirSync(sessions);
const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
const { claudeBridge } = await import('../src/harness/claude/bridge.ts');
const { processStart } = await import('../src/harness/claude/inbox.ts');

const ID = 'session_01NYqGawdujhLBF4BVDFzd74';
const LINK = `https://claude.ai/code/${ID}`;
const PID = 4242;
const SESSION = '7d0c2a8e-0000-4000-8000-000000000001';
const START = '14479780';

/** The registration Claude Code writes for a bridged `--bg` session, with `change` over it, under `dir` as `<pid>.json`. */
const register = (dir: string, change: Record<string, unknown> = {}, pid = PID) => {
  const r = { pid, sessionId: SESSION, kind: 'bg', procStart: START, bridgeSessionId: ID, ...change };
  for (const [k, v] of Object.entries(r)) if (v === undefined) delete (r as Record<string, unknown>)[k];
  fs.writeFileSync(path.join(dir, `${pid}.json`), JSON.stringify(r));
};

/** `claudeBridge` of `PID` and `SESSION` under `dir`, its process started at `START`. */
const bridgeIn = (dir: string, by: { uid?: number } = {}) => claudeBridge(dir, PID, SESSION, { startOf: () => START, ...by });

test('claudeBridge: the link a registration of the session gives, or why it gives none', async (t) => {
  await t.test(
    "a registration of the session, with a `bridgeSessionId`, gives the link that opens it: Claude Code's form, measured live",
    async () => {
      const dir = tmp('up');
      register(dir);
      assert.deepEqual(await bridgeIn(dir), { url: LINK });
    },
  );

  await t.test('a registration of the session with no `bridgeSessionId` yet gives no link, and says why by naming the field', async () => {
    const dir = tmp('down');
    register(dir, { bridgeSessionId: undefined });
    const got = await bridgeIn(dir);
    assert.equal(got.url, null);
    assert.match('why' in got ? got.why : '', /`bridgeSessionId` yet/);
    register(dir, { bridgeSessionId: null });
    assert.equal((await bridgeIn(dir)).url, null, 'a null is no id either');
  });

  const stale: [string, (dir: string) => void, RegExp][] = [
    ['none for the pid', () => {}, /cannot be read/],
    ['another pid inside', (dir) => register(dir, { pid: PID + 1 }), /registers pid 4243, not 4242/],
    ['another session', (dir) => register(dir, { sessionId: 'another' }), /registers session "another" now/],
    ['an interactive session', (dir) => register(dir, { kind: 'interactive' }), /kind "interactive"/],
    ['an earlier process under the pid', (dir) => register(dir, { procStart: '1' }), /an earlier process under pid 4242/],
    ['no session id', (dir) => register(dir, { sessionId: '' }), /registers no session id/],
    ['a folder in its place', (dir) => fs.mkdirSync(path.join(dir, `${PID}.json`)), /is not a file/],
    ['no JSON', (dir) => fs.writeFileSync(path.join(dir, `${PID}.json`), '{'), /cannot be read/],
    ['JSON but no registration', (dir) => fs.writeFileSync(path.join(dir, `${PID}.json`), 'null'), /holds no registration/],
  ];
  for (const [name, make, why] of stale)
    await t.test(`a registration that is not the session gives no link, whatever bridgeSessionId it holds: ${name}`, async () => {
      const dir = tmp('stale');
      make(dir);
      const got = await bridgeIn(dir);
      assert.equal(got.url, null, `${name}: no link`);
      assert.match('why' in got ? got.why : '', why, name);
    });

  await t.test('a registration that is not the session gives no link: a file another user owns', async () => {
    const dir = tmp('theirs');
    register(dir);
    const theirs = await bridgeIn(dir, { uid: (process.getuid?.() ?? 0) + 1 });
    assert.equal(theirs.url, null, 'a file another user owns: no link');
    assert.match('why' in theirs ? theirs.why : '', /is owned by uid \d+, not by you/);
  });

  for (const id of ['sess-xyz', 'session_../evil', 'session_', 42, `session_${'x'.repeat(500)}!`])
    await t.test(
      `a \`bridgeSessionId\` not of the form \`session_…\` is refused by name and quoted: ${JSON.stringify(id).slice(0, 20)}`,
      async () => {
        const dir = tmp('malformed');
        register(dir, { bridgeSessionId: id });
        const got = await bridgeIn(dir);
        assert.equal(got.url, null, `${JSON.stringify(id).slice(0, 20)}: no link`);
        const why = 'why' in got ? got.why : '';
        assert.match(why, /`bridgeSessionId` is /);
        assert.ok(why.includes(JSON.stringify(id).slice(0, 40)), `the value is quoted: ${why}`);
        assert.ok(why.length < 400, 'and cut: another party wrote it');
      },
    );
});

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number; pid?: number };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, idle and blocked, held by this test's process; `stop` stops
 * it.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop') { for (const r of rows) if (r.sessionId.split('-')[0] === args[1]) { r.state = 'stopped'; delete r.pid; } save(); process.exit(0); }
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'blocked', status: 'idle', kind: 'background', startedAt: Date.now(), pid: ${process.pid} });
  save();
}
`,
    { mode: 0o755 },
  );
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (change: Partial<Row>) => fs.writeFileSync(registry, JSON.stringify(rows().map((r) => ({ ...r, ...change })))),
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

/**
 * A long-lived background task filed with Claude Code's flags `claudeFlags`, its first pass run, and `write`, which writes the
 * registration Claude Code keeps for its session, held by this test's own process, with `change` over it.
 */
const running = async (claudeFlags: { remoteControl: true } | undefined, rows: () => Row[]) => {
  const engine = builtEngine(Engine.layer({ root: tmp('root') }));
  const id = await Effect.runPromise(
    engine.file({
      config: { background: true, ...(claudeFlags ? { claude: claudeFlags } : {}) },
      restartPolicy: 'Always',
      brief: 'the prompt',
      cwd: tmp('cwd'),
    }),
  );
  await Effect.runPromise(engine.tick());
  const [row] = rows();
  const write = (change: Record<string, unknown> = {}) =>
    register(sessions, { sessionId: row.sessionId, procStart: processStart(process.pid), ...change }, process.pid);
  return { engine, id, write };
};

test("a task's view: its session's link while it is up, why not while it is not, and no bridge where none was asked", async (t) => {
  await t.test(
    "a task filed bridged carries its session's link on its view while it is up, and says why not, never nothing, while it is not",
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const { engine, id, write } = await running({ remoteControl: true }, claude.rows);
        const view = () => Effect.runPromise(engine.view(id));

        write();
        assert.deepEqual((await view()).bridge, { url: LINK }, 'asked and up: the link');

        write({ bridgeSessionId: undefined });
        const down = (await view()).bridge;
        assert.equal(down?.url, null, 'asked and not up: no link');
        assert.match(down && 'why' in down ? down.why : '', /`bridgeSessionId` yet/, 'and why, from the registration');

        write({ sessionId: 'another' });
        assert.equal((await view()).bridge?.url, null, "another session's registration under the pid gives none");

        write();
        claude.set({ pid: undefined });
        const respawning = (await view()).bridge;
        assert.equal(respawning?.url, null, 'a session listed with no process is not read');
        assert.match(respawning && 'why' in respawning ? respawning.why : '', /no process of its session is seen/);

        claude.set({ pid: process.pid });
        assert.deepEqual((await view()).bridge, { url: LINK }, 'read afresh: the process back, the link back');

        await Effect.runPromise(engine.stop(id));
        for (let i = 0; i < 5 && !(await view()).state.settled; i++) await Effect.runPromise(engine.tick());
        const ended = await view();
        assert.ok(ended.state.settled, 'the task settled');
        const gone = ended.bridge;
        assert.equal(gone?.url, null, 'ended: no link');
        assert.match(gone && 'why' in gone ? gone.why : '', /its session has ended/);
      });
    },
  );

  await t.test(
    'a task not filed bridged carries no bridge on its view, whatever its registration holds: only it is not bridged',
    async () => {
      const claude = fakeClaude();
      await onPath(claude.bin, async () => {
        const { engine, id, write } = await running(undefined, claude.rows);
        write();
        assert.equal(Object.hasOwn(await Effect.runPromise(engine.view(id)), 'bridge'), false);
      });
    },
  );
});
