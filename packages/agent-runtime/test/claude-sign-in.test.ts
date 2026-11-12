/**
 * A Claude Code job does not start while this machine's Claude Code is signed out: its `prepare` asks `claude auth status` of the Claude
 * Code the session would run (`src/harness/claude/sign-in.ts`), and a signed-out answer, or none within the bound, refuses the spawn
 * before anything runs, the attempt `unstartable` in words naming how to sign in. Signed in, the session runs as before.
 *
 * The real engine, the real worker and `bin/ae-claude-job.ts`, on the stand-in Claude Code (`fixtures/stand-in-claude.ts`), which
 * answers `auth status` as `STANDIN_AUTH` says and records each ask in `auth.jsonl`. The bound is shortened through the runner
 * (`signInMs`); the shipped one is `CLAUDE_SIGN_IN_MS`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

/** Where Claude Code keeps its transcripts, for the stand-in and the runtime's reader alike: set before `src` is imported. */
process.env.CLAUDE_CONFIG_DIR = scratch('ae-sign-in-config-');

const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
const { STAND_IN } = await import('./attached-held.ts');
const { claudeCodeOps } = await import('../src/harness/claude/code.ts');
const { authStatusOf, claudeLaunch } = await import('../src/harness/claude/sign-in.ts');

/** The lines of `file` in `dir`, each parsed; none where it is absent. */
const lines = (dir: string, file: string): unknown[] => {
  const at = path.join(dir, file);
  return fs.existsSync(at)
    ? fs
        .readFileSync(at, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];
};

test(
  'a Claude Code job does not start while this machine is signed out: its spawn is refused before anything runs, in words naming `claude setup-token`; signed in it runs, and a check that does not answer in time says so',
  WAITED,
  async (t) => {
    const s = story(t);
    const engineOf = (signInMs?: number) => {
      const root = scratch('ae-sign-in-');
      const ops = claudeCodeOps({ root, claudeExecutable: STAND_IN, ...(signInMs !== undefined ? { signInMs } : {}) });
      return builtEngine(Engine.layer({ root, harnesses: { claude: ops } }));
    };
    const shipped = engineOf();
    const run = async (c: Waiter, auth: string | undefined, on = shipped) => {
      const dir = scratch('ae-sign-in-work-');
      const plan = JSON.stringify({ id: '5e551011-0000-4000-8000-00000000a0e1' });
      const env = { STANDIN_DIR: dir, STANDIN_PLAN: plan, STANDIN_NO_BRIDGE: '1', ...(auth !== undefined ? { STANDIN_AUTH: auth } : {}) };
      const id = await Effect.runPromise(on.file({ brief: 'work', cwd: dir, harness: 'claude', config: { env } }));
      t.after(() => Effect.runPromise(Effect.ignore(on.stop(id))));
      await until(
        c,
        async () => {
          await Effect.runPromise(on.tick());
          return (await Effect.runPromise(on.view(id))).state.settled !== null;
        },
        `${id} settled`,
        { everyMs: 50 },
      );
      return { state: (await Effect.runPromise(on.view(id))).state, dir };
    };

    await s.test('signed out, the attempt ends unstartable, in words naming the sign-in, and no session ran', async (c) => {
      const { state, dir } = await run(c, 'out');
      assert.equal(state.settled, 'failed');
      const [attempt] = state.attempts;
      assert.equal(attempt?.reason, 'unstartable');
      assert.ok(attempt?.error?.includes('claude setup-token'), 'the words name the command that makes a token');
      assert.ok(attempt?.error?.includes('CLAUDE_CODE_OAUTH_TOKEN'), 'and where the token goes');
      assert.deepEqual(lines(dir, 'auth.jsonl'), [['auth', 'status']], 'Claude Code was asked whether it is signed in');
      assert.deepEqual(lines(dir, 'argv.jsonl'), [], 'and no session started');
    });

    await s.test('signed in, the job tried again runs as before', async (c) => {
      const { state, dir } = await run(c, undefined);
      assert.equal(state.settled, 'succeeded');
      assert.deepEqual(lines(dir, 'auth.jsonl'), [['auth', 'status']], 'asked once');
      assert.equal(lines(dir, 'argv.jsonl').length, 1, 'and one session started');
    });

    await s.test('a check that does not answer within its bound refuses the spawn, saying so, and no session ran', async (c) => {
      const { state, dir } = await run(c, 'hang', engineOf(300));
      assert.equal(state.settled, 'failed');
      const [attempt] = state.attempts;
      assert.equal(attempt?.reason, 'unstartable');
      assert.ok(attempt?.error?.includes('did not answer'), 'the words say the check did not answer');
      assert.deepEqual(lines(dir, 'auth.jsonl'), [['auth', 'status']]);
      assert.deepEqual(lines(dir, 'argv.jsonl'), [], 'and no session started');
    });
  },
);

test('what `claude auth status` prints is read through its schema, and what is not its shape is unread', async (t) => {
  const rows: [string, string, boolean | undefined][] = [
    ['signed in', '{"loggedIn":true,"authMethod":"oauth_token"}', true],
    ['signed out', '{"loggedIn":false,"authMethod":"none"}', false],
    ['not JSON', 'not json', undefined],
    ['a loggedIn that is no boolean', '{"loggedIn":"yes"}', undefined],
  ];
  for (const [name, stdout, loggedIn] of rows) {
    await t.test(name, () => assert.equal(authStatusOf(stdout)?.loggedIn, loggedIn));
  }
});

test('the Claude Code asked is started as the Agent SDK starts it: a script under node, a binary as it is', async (t) => {
  await t.test('a script', () => assert.deepEqual(claudeLaunch('/x/stand-in.ts'), { cmd: process.execPath, args: ['/x/stand-in.ts'] }));
  await t.test('a binary', () => assert.deepEqual(claudeLaunch('/x/claude'), { cmd: '/x/claude', args: [] }));
});
