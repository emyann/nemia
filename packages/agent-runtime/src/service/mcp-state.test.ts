/**
 * The engine's `mcpState` verb (`mcpStateVerbOf`), over an ask of a test's own: where it opens its session, and what it refuses
 * before it opens one.
 *
 * The cwd is the thing to pin. The probe lists the servers of the folder its session runs in, and the engine's `root` is required
 * with no default since the store's root became a given: a verb that handed `process.cwd()`, or anything but the root it was built
 * with, would list another checkout's servers and nothing would say so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { mcpStateVerbOf } from './mcp-state.ts';
import type { HarnessConfig } from './options.ts';
import type { McpStatusAsk } from '../harness/mcp-state.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';

const CLAUDE: Record<string, HarnessConfig> = { claude: 'claude' };
const RECORD: Record<string, RemoteMcpServer> = { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } };

/** An ask that answers one connected server and writes down the cwd each session was opened in. */
const asking = () => {
  const at: string[] = [];
  const ask: McpStatusAsk = async (_servers, cwd) => {
    at.push(cwd);
    return [{ name: 'github', status: 'connected', tools: [] }] as readonly McpServerStatus[];
  };
  return { ask, at };
};

/** The refusal `effect` fails with: a verb that succeeds fails the test. */
const refusalOf = <A, E>(effect: Effect.Effect<A, E>): Promise<{ _tag?: string; message: string }> =>
  Effect.runPromise(Effect.flip(effect)) as Promise<{ _tag?: string; message: string }>;

test('mcpStateVerbOf: where the verb opens its session, and what it refuses before it opens one', async (t) => {
  await t.test("the verb opens its session in the engine's root, which it was built with, and never in the process's own cwd", async () => {
    const { ask, at } = asking();
    const read = await Effect.runPromise(mcpStateVerbOf(CLAUDE, '/var/empty/engine-root', undefined, ask)(RECORD));
    assert.deepEqual(at, ['/var/empty/engine-root'], 'the root the verb was built with is the folder the servers are read in');
    assert.notEqual(at[0], process.cwd(), "and not the process's, which is what a dropped root would leave");
    assert.equal(read.read, true);
  });

  await t.test(
    'a second engine, a second root: each verb reads under its own, so two engines of one process do not share a checkout',
    async () => {
      const a = asking();
      const b = asking();
      await Effect.runPromise(mcpStateVerbOf(CLAUDE, '/var/empty/one', undefined, a.ask)(RECORD));
      await Effect.runPromise(mcpStateVerbOf(CLAUDE, '/var/empty/two', undefined, b.ask)(RECORD));
      assert.deepEqual([a.at, b.at], [['/var/empty/one'], ['/var/empty/two']]);
    },
  );

  await t.test('REFUSED: an empty record asks nothing: there is no state to read, and no session is opened', async () => {
    const { ask, at } = asking();
    const err = await refusalOf(mcpStateVerbOf(CLAUDE, '/var/empty/engine-root', undefined, ask)({}));
    assert.equal(err._tag, 'McpStateRefused');
    assert.ok(err.message.includes('at least one server'), err.message);
    assert.deepEqual(at, [], 'a refusal opens no session at all');
  });

  await t.test(
    'REFUSED: an engine that runs no Claude Code harness has nothing to read a state through, and opens no session',
    async () => {
      const { ask, at } = asking();
      const err = await refusalOf(mcpStateVerbOf({ codex: 'claude-bg' }, '/var/empty/engine-root', undefined, ask)(RECORD));
      assert.equal(err._tag, 'McpStateRefused');
      for (const name of ['no Claude Code harness', 'Its harnesses are: codex']) assert.ok(err.message.includes(name), err.message);
      assert.deepEqual(at, [], 'a refusal opens no session at all');
    },
  );
});
