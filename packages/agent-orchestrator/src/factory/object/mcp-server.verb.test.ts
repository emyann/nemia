/**
 * A factory's MCP servers as objects (mcp-server.verb.ts): headers masked, the state carried or why it is unread; the builtin with no
 * namespace.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Schema } from 'effect';
import { HEADER_MASK, McpServer, McpServerList } from 'objects';
import { builtinServerList, mcpServerOf } from './mcp-server.verb.ts';

test("a server's headers are masked, its state carried, and why the states are unread is its error", () => {
  const s = mcpServerOf(
    { name: 'docs', type: 'http', url: 'https://docs.example', headers: { authorization: 'Bearer secret' }, state: 'connected', tools: 3 },
    'mill',
    '2026-11-01T00:00:00.000Z',
    null,
  );
  assert.ok(Schema.is(McpServer)(s));
  assert.deepEqual(s.spec.headers, { authorization: HEADER_MASK });
  assert.deepEqual(s.status, { state: 'connected', tools: 3 });
  assert.equal(s.metadata.namespace, 'mill');
  const unread = mcpServerOf({ name: 'docs', type: 'sse', url: 'https://d', state: null }, 'mill', '2026-11-01T00:00:00.000Z', 'no engine');
  assert.deepEqual(unread.status, { error: 'no engine' });
});

test('the builtin servers are a McpServerList whose items carry a spec alone and no namespace', () => {
  const list = Effect.runSync(builtinServerList({}));
  assert.ok(Schema.is(McpServerList)(list));
  assert.ok(list.items.length > 0, 'the package holds builtin servers');
  for (const s of list.items) {
    assert.equal(s.metadata.namespace, undefined);
    assert.equal(s.status, undefined);
  }
});

test('the builtin servers are sorted by name and paged by limit and continue, each once', () => {
  const whole = Effect.runSync(builtinServerList({}));
  const names = whole.items.map((s) => s.metadata.name);
  assert.deepEqual(names, [...names].sort());
  const walked: string[] = [];
  let next: string | undefined;
  do {
    const page = Effect.runSync(builtinServerList({ limit: 1, ...(next === undefined ? {} : { continue: next }) }));
    assert.ok(page.items.length <= 1);
    walked.push(...page.items.map((s) => s.metadata.name));
    next = page.metadata.continue;
  } while (next !== undefined);
  assert.deepEqual(walked, names);
  assert.equal(Effect.runSync(Effect.result(builtinServerList({ limit: 0 })))._tag, 'Failure', 'a limit of 0 is refused');
});
