/**
 * A harness's quota through the runtime: Claude Code's answer to `get_usage` read (`quotaOfResponse`), the ask that starts a `claude` for
 * it (`claudeQuota`), here a fake on PATH that answers as 2.1.278 did, and the engine's `quota` verb through both doors, which answers
 * for a harness that has one and refuses in words for one that has none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { claudeQuota, quotaOfResponse, USAGE_ARGS, usageEnv } from '../src/harness/claude/index.ts';
import { Engine, promiseEngine, type EngineShape } from '../src/index.ts';
import type { PromiseRunner } from '../src/facade.ts';
import { machineTempDir, scratch } from './scratch.ts';

const bin = scratch('ae-quota-bin-');
/** Every ask the fake took: its arguments, then what it ran in, then that it ended, each with its pid. */
const calls = path.join(bin, 'calls');
/** What the fake prints to a `get_usage` request: lines of stream-json, `@ID@` in them replaced by the request's own id. */
const answer = path.join(bin, 'usage-answer');
/** How the fake takes a request: `answer`, `silent` — it never answers — or `exit`, 3 before it reads it. */
const mode = path.join(bin, 'usage-mode');

/** Claude Code 2.1.278's answers to `get_usage`, recorded by hand (`fixtures/get-usage-*.json`), their request id made `@ID@`. */
const recorded = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered'): string =>
  fs
    .readFileSync(path.join(import.meta.dirname, 'fixtures', `get-usage-${name === 'plan' ? '' : `${name}-`}2.1.278.json`), 'utf8')
    .replace('"request_id":"usage-1"', '"request_id":"@ID@"');

/** The control_response of a recorded answer, as `quotaOfResponse` is handed it. */
const responseOf = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered'): unknown =>
  (JSON.parse(recorded(name).split('\n')[0]) as { response: unknown }).response;

fs.writeFileSync(calls, '');
fs.writeFileSync(
  path.join(bin, 'claude'),
  [
    '#!/bin/sh',
    `echo "args $*" >> '${calls}'`,
    `echo "env CLAUDECODE=\${CLAUDECODE-unset} CLAUDE_PID=\${CLAUDE_PID-unset} CLAUDE_CONFIG_DIR=\${CLAUDE_CONFIG_DIR-unset} CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN-unset} cwd=$(pwd -P) pid=$$" >> '${calls}'`,
    `case "$(cat '${mode}')" in`,
    '  silent) exec sleep 30 ;;',
    "  exit) echo 'claude: the harness was told to fail' >&2; exit 3 ;;",
    'esac',
    'read -r line',
    `id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\\([^"]*\\)".*/\\1/p')`,
    `sed "s/@ID@/$id/g" '${answer}'`,
    'cat > /dev/null',
    `echo "ended pid=$$" >> '${calls}'`,
    '',
  ].join('\n'),
  { mode: 0o755 },
);
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;

/** What the next asks are answered, and how. */
const usageAnswer = (text: string, how: 'answer' | 'silent' | 'exit' = 'answer'): void => {
  fs.writeFileSync(answer, text);
  fs.writeFileSync(mode, how);
};
usageAnswer(recorded('plan'));

/** The last line the fake wrote that starts with `kind`, its words after it. */
const last = (kind: 'args' | 'env'): string =>
  (
    fs
      .readFileSync(calls, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith(`${kind} `))
      .pop() ?? ''
  ).slice(kind.length + 1);

/** What the last ask ran in: each variable the fake reports, `unset` for one it did not have, its `cwd` and its `pid`. */
const lastEnv = (): Record<string, string> =>
  Object.fromEntries(
    last('env')
      .split(' ')
      .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]),
  );

/** Whether the process `pid` is gone. */
const gone = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ESRCH';
  }
};

/** A harness in Promises, which reports no quota. */
const fake: PromiseRunner = {
  spawn: async () => {},
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

/** The engine over `claude`, its default, and `fake`, through each door. */
const doors = () => {
  const options = { root: scratch('ae-quota-'), harnesses: { claude: 'claude' as const, fake } };
  const effect = <A, E>(f: (e: EngineShape) => Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(Engine.use(f).pipe(Effect.provide(Engine.layer(options))));
  return { effect, promise: promiseEngine(Engine.layer(options)) };
};

const PLAN = {
  kind: 'windows',
  limits: [
    { key: 'five_hour', usedPercentage: 3, resetsAt: '2026-09-19T15:10:00.048Z' },
    { key: 'seven_day', usedPercentage: 50, resetsAt: '2026-09-23T11:00:00.048Z' },
    { key: 'extra_usage', usedPercentage: 0, resetsAt: null },
    { key: 'nimbus_quill', usedPercentage: 0, resetsAt: null },
  ],
  subscription: 'max',
};

test("Claude Code 2.1.278's recorded answers read as what they were: the plan's limits, no plan, nothing from the usage service, a refusal", () => {
  assert.deepEqual(quotaOfResponse(responseOf('plan')), PLAN);
  assert.deepEqual(quotaOfResponse(responseOf('no-plan')), { kind: 'no-plan' });
  assert.deepEqual(quotaOfResponse(responseOf('unanswered')), { kind: 'unanswered', subscription: 'max' });
  assert.deepEqual(quotaOfResponse(responseOf('unsupported')), {
    kind: 'unknown',
    what: 'it refused the request (Unsupported control request subtype: get_usage_nope)',
  });
});

test('REFUSED: an answer in a shape this code does not read is unknown, and says what it found; a limit with no number is left out', () => {
  const ok = (usage: Record<string, unknown>) => ({ subtype: 'success', response: usage });
  assert.deepEqual(quotaOfResponse('nope'), { kind: 'unknown', what: 'its response is not an object' });
  assert.deepEqual(quotaOfResponse({ subtype: 'pending' }), { kind: 'unknown', what: 'its response is neither a success nor an error' });
  assert.deepEqual(quotaOfResponse(ok({})), { kind: 'unknown', what: 'it has no rate_limits_available' });
  assert.deepEqual(quotaOfResponse(ok({ rate_limits_available: true, rate_limits: [] })), {
    kind: 'unknown',
    what: 'its rate_limits are not an object',
  });
  const limits = { five_hour: { utilization: null }, seven_day: { utilization: Infinity }, day: { utilization: 7, resets_at: 'soon' } };
  assert.deepEqual(quotaOfResponse(ok({ rate_limits_available: true, rate_limits: limits })), {
    kind: 'windows',
    limits: [{ key: 'day', usedPercentage: 7, resetsAt: null }],
    subscription: null,
  });
});

test("REFUSED: the ask starts claude in print mode without the user's settings, without a session's keys but with how it signs in, in the temporary directory", async () => {
  const session = { CLAUDECODE: '1', CLAUDE_PID: '1', CLAUDE_CODE_SESSION_ID: 's', AI_AGENT: 'claude-code' };
  const signIn = { CLAUDE_CONFIG_DIR: bin, CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test' };
  const kept = usageEnv({ ...session, ...signIn });
  assert.deepEqual(kept, signIn, "usageEnv drops a session's keys and keeps how it signs in");
  const before = { ...process.env };
  Object.assign(process.env, session, signIn);
  try {
    assert.deepEqual(await Effect.runPromise(claudeQuota()), PLAN);
  } finally {
    for (const key of Object.keys({ ...session, ...signIn })) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
  const ran = lastEnv();
  assert.deepEqual([ran.CLAUDECODE, ran.CLAUDE_PID], ['unset', 'unset'], "the ask's claude has none of a session's keys");
  assert.deepEqual([ran.CLAUDE_CONFIG_DIR, ran.CLAUDE_CODE_OAUTH_TOKEN], [bin, 'sk-ant-oat-test'], 'and signs in as this process does');
  assert.equal(ran.cwd, fs.realpathSync(machineTempDir()), 'claudeQuota runs its claude in the temp directory');
  assert.equal(last('args'), USAGE_ARGS.join(' '));
  assert.equal(
    last('args'),
    '-p --input-format stream-json --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources ',
    "started without the user's settings, their plugins, hooks and skills' sync, without MCP servers, and writing no session",
  );
});

test('REFUSED: an answer to another request — or a line that is not one — is not taken for this one', async () => {
  const theirs = JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: 'not-yours', error: 'wrong one' } });
  usageAnswer(`not json\n{"type":"system","subtype":"init"}\n${theirs}\n${recorded('plan')}`);
  try {
    assert.deepEqual(await Effect.runPromise(claudeQuota()), PLAN);
  } finally {
    usageAnswer(recorded('plan'));
  }
});

test('an answered ask closes its stdin, and the process ends of its own', async () => {
  assert.equal((await Effect.runPromise(claudeQuota())).kind, 'windows');
  const pid = Number(lastEnv().pid);
  const ended = () => fs.readFileSync(calls, 'utf8').split('\n').includes(`ended pid=${pid}`);
  for (const bound = Date.now() + 5_000; !ended() && Date.now() < bound;) await new Promise((r) => setTimeout(r, 20));
  assert.ok(ended(), `the ask's claude (pid ${pid}) ended of its own once its stdin was closed`);
});

test('REFUSED: no claude on PATH is missing; one that ends before it answers is failed, with its exit code and the last line on stderr', async () => {
  assert.deepEqual(await Effect.runPromise(claudeQuota({ command: path.join(bin, 'no-such-claude') })), { kind: 'missing' });
  usageAnswer('', 'exit');
  try {
    assert.deepEqual(await Effect.runPromise(claudeQuota()), {
      kind: 'failed',
      code: 3,
      signal: null,
      said: 'claude: the harness was told to fail',
    });
  } finally {
    usageAnswer(recorded('plan'));
  }
});

test('REFUSED: an ask that times out has ended its claude by the time it resolves', async () => {
  usageAnswer('', 'silent');
  try {
    const earlier = lastEnv().pid;
    assert.deepEqual(await Effect.runPromise(claudeQuota({ timeoutMs: 1_000 })), { kind: 'timeout', ms: 1_000 });
    const pid = Number(lastEnv().pid);
    assert.notEqual(String(pid), earlier, 'the ask started its claude, which wrote its pid before it went silent');
    assert.ok(gone(pid), `the silent claude (pid ${pid}) was sent SIGTERM and waited for, not left to end after the answer`);
  } finally {
    usageAnswer(recorded('plan'));
  }
});

test('REFUSED: an ask interrupted before it has an outcome ends its claude before the interruption returns', async () => {
  usageAnswer('', 'silent');
  try {
    const earlier = lastEnv().pid;
    const stop = new AbortController();
    const exit = Effect.runPromiseExit(claudeQuota(), { signal: stop.signal });
    for (const bound = Date.now() + 5_000; lastEnv().pid === earlier && Date.now() < bound;) await new Promise((r) => setTimeout(r, 20));
    const pid = Number(lastEnv().pid);
    assert.notEqual(String(pid), earlier, 'the ask started its claude');
    stop.abort();
    assert.ok(Exit.hasInterrupts(await exit), 'the ask was interrupted, not answered');
    assert.ok(gone(pid), `the silent claude (pid ${pid}) is gone`);
  } finally {
    usageAnswer(recorded('plan'));
  }
});

test("the engine's quota asks its default harness, or the one named, and answers the same through either door", async () => {
  const { effect, promise } = doors();
  assert.deepEqual(await effect((e) => e.quota()), PLAN);
  assert.deepEqual(await promise.quota(), PLAN);
  assert.deepEqual(await promise.quota('claude'), PLAN);
  usageAnswer(recorded('unanswered'));
  try {
    assert.deepEqual(await effect((e) => e.quota('claude')), await promise.quota());
  } finally {
    usageAnswer(recorded('plan'));
  }
});

test('REFUSED: a quota asked of a harness that has none, of one the engine has not, or with other arguments, at both doors', async () => {
  const { effect, promise } = doors();
  const untyped = <F>(f: F) => f as (...args: unknown[]) => never;
  const asks = (fs.readFileSync(calls, 'utf8').match(/^args /gm) ?? []).length;
  const cases: Array<[() => Promise<unknown>, () => Promise<unknown>, string]> = [
    [() => effect((e) => e.quota('fake')), () => promise.quota('fake'), 'the `fake` harness reports no quota. Ask one that does: claude.'],
    [
      () => effect((e) => e.quota('nope')),
      () => promise.quota('nope'),
      '`nope` is not a harness this engine has. Its harnesses are: claude, fake.',
    ],
    [
      () => effect((e) => untyped(e.quota)(42)),
      () => untyped(promise.quota)(42),
      "takes one harness's name, or nothing for the default harness (`claude`); it was handed 42.",
    ],
    [
      () => effect((e) => untyped(e.quota)('claude', 'fake')),
      () => untyped(promise.quota)('claude', 'fake'),
      'takes one harness\'s name, or nothing for the default harness (`claude`); it was handed "claude", "fake".',
    ],
  ];
  for (const [viaService, viaPromise, words] of cases) {
    const tagged = await viaService().then(
      (v) => assert.fail(`resolved with ${JSON.stringify(v)}`),
      (e: Error & { _tag?: string }) => e,
    );
    assert.deepEqual([tagged._tag, tagged.message], ['QuotaRefused', words]);
    const plain = await Promise.resolve()
      .then(viaPromise)
      .then(
        (v) => assert.fail(`resolved with ${JSON.stringify(v)}`),
        (e: Error & { exitCode?: number }) => e,
      );
    assert.deepEqual([plain.message, plain.exitCode], [`quota: ${words}`, 2]);
  }
  assert.equal((fs.readFileSync(calls, 'utf8').match(/^args /gm) ?? []).length, asks, 'no refused quota started a claude');
});
