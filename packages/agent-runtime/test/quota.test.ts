/**
 * A harness's quota through the runtime: the usage the Agent SDK answers read (`quotaOfUsage`), how a refusal of it reads
 * (`quotaOfRefusal`), the options an ask opens its query with (`usageOptions`), the ask itself (`claudeQuota`), here over a stand-in for
 * the SDK's call, and the engine's `quota` verb, which answers for a harness that has one and refuses in words for one that has none.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Tracer } from 'effect';
import { claudeQuota, type OpenUsage, quotaOfRefusal, quotaOfUsage, usageEnv, usageOptions } from '../src/harness/claude/index.ts';
import { Engine, type EngineShape } from '../src/index.ts';
import { machineTempDir, scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

/** Claude Code 2.1.278's answers to `get_usage`, recorded by hand (`fixtures/get-usage-*.json`): the control response it printed. */
const recorded = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered'): { response?: unknown; error?: string } =>
  (
    JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `get-usage-${name === 'plan' ? '' : `${name}-`}2.1.278.json`), 'utf8'),
    ) as { response: { response?: unknown; error?: string } }
  ).response;

/** The usage of a recorded answer, as the SDK resolves it and `quotaOfUsage` is handed it. */
const usageOf = (name: 'plan' | 'no-plan' | 'unanswered'): unknown => recorded(name).response;

/** An error the SDK throws, as it carries how it went: the class it names it, and a child's exit code where it read one. */
const thrown = (message: string, more: { errorClass?: string; exitCode?: number } = {}): Error => Object.assign(new Error(message), more);

/** A stand-in for the SDK's usage call: what `answer` says, what it was asked, and that the ask closed its query. */
const standIn = (answer: () => Promise<unknown>) => {
  const seen = { asks: 0, closes: 0, command: undefined as string | undefined, skipBehaviors: undefined as boolean | undefined };
  const ask: OpenUsage = (command) => {
    seen.command = command;
    return {
      usage: (opts) => {
        seen.asks += 1;
        seen.skipBehaviors = opts.skipBehaviors;
        return answer();
      },
      close: async () => {
        seen.closes += 1;
      },
    };
  };
  return { ask, seen };
};

/** A harness in Promises, which reports no quota. */
const fake: AsyncRunner = {
  spawn: async () => {},
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

/** The engine over a `claude` whose quota is asked through `ask`, and `fake`, which reports none. */
const engineOver = (ask: OpenUsage) =>
  builtEngine(
    Engine.layer({
      root: scratch('ae-quota-'),
      harnesses: { claude: { ...asyncOps(fake), quota: claudeQuota({ ask }) }, fake: asyncOps(fake) },
    }),
  );

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

test("Claude Code 2.1.278's recorded answers read as what they were: the plan's limits, no plan, nothing from the usage service", () => {
  assert.deepEqual(quotaOfUsage(usageOf('plan')), PLAN);
  assert.deepEqual(quotaOfUsage(usageOf('no-plan')), { kind: 'no-plan' });
  assert.deepEqual(quotaOfUsage(usageOf('unanswered')), { kind: 'unanswered', subscription: 'max' });
});

test('REFUSED: an answer in a shape this code does not read is unknown, and says what it found; a limit with no number is left out', () => {
  assert.deepEqual(quotaOfUsage('nope'), { kind: 'unknown', what: 'its response is not an object' });
  assert.deepEqual(quotaOfUsage({}), { kind: 'unknown', what: 'it has no rate_limits_available' });
  assert.deepEqual(quotaOfUsage({ rate_limits_available: true, rate_limits: [] }), {
    kind: 'unknown',
    what: 'its rate_limits are not an object',
  });
  const limits = { five_hour: { utilization: null }, seven_day: { utilization: Infinity }, day: { utilization: 7, resets_at: 'soon' } };
  assert.deepEqual(quotaOfUsage({ rate_limits_available: true, rate_limits: limits }), {
    kind: 'windows',
    limits: [{ key: 'day', usedPercentage: 7, resetsAt: null }],
    subscription: null,
  });
});

test('REFUSED: a refusal reads by what the SDK named it: the question refused, no Claude Code to ask, or how the process went', () => {
  const refused = recorded('unsupported').error!;
  assert.deepEqual(quotaOfRefusal(thrown(refused, { errorClass: 'control_request_failed' })), {
    kind: 'unknown',
    what: 'it refused the request (Unsupported control request subtype: get_usage_nope)',
  });
  assert.deepEqual(quotaOfRefusal(thrown('Claude Code executable not found at /nope.', { errorClass: 'executable_not_found' })), {
    kind: 'missing',
  });
  assert.deepEqual(
    quotaOfRefusal(
      thrown('Claude Code process exited with code 3\nclaude: the harness was told to fail', {
        errorClass: 'process_exited_nonzero',
        exitCode: 3,
      }),
    ),
    { kind: 'failed', code: 3, signal: null, said: 'claude: the harness was told to fail' },
  );
  assert.deepEqual(quotaOfRefusal('nope'), { kind: 'failed', code: null, signal: null, said: 'nope' });
});

test("REFUSED: an ask's query is opened for the question alone: in the temporary directory, without the user's settings, writing no session", () => {
  const session = { CLAUDECODE: '1', CLAUDE_PID: '1', CLAUDE_CODE_SESSION_ID: 's', AI_AGENT: 'claude-code' };
  const signIn = { CLAUDE_CONFIG_DIR: scratch('ae-quota-config-'), CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test' };
  const telemetry = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:9/the-engine-own', CLAUDE_CODE_ENABLE_TELEMETRY: '1' };
  assert.deepEqual(usageEnv({ ...session, ...signIn }), signIn, "usageEnv drops a session's keys and keeps how it signs in");
  const before = { ...process.env };
  Object.assign(process.env, session, signIn, telemetry);
  let given: ReturnType<typeof usageOptions>;
  try {
    given = usageOptions();
  } finally {
    for (const key of Object.keys({ ...session, ...signIn, ...telemetry })) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
  const env = given.env!;
  assert.deepEqual(
    [env.CLAUDECODE, env.CLAUDE_PID, env.OTEL_EXPORTER_OTLP_ENDPOINT, env.CLAUDE_CODE_ENABLE_TELEMETRY],
    [undefined, undefined, undefined, undefined],
    "the ask's claude inherits none of a session's keys, and none of the engine's telemetry, so it exports nothing as the engine's process",
  );
  assert.deepEqual(
    [env.CLAUDE_CONFIG_DIR, env.CLAUDE_CODE_OAUTH_TOKEN],
    [signIn.CLAUDE_CONFIG_DIR, signIn.CLAUDE_CODE_OAUTH_TOKEN],
    'and signs in as this process does',
  );
  assert.equal(given.cwd, machineTempDir(), 'an ask runs its claude in the temp directory');
  assert.deepEqual(
    [given.persistSession, given.strictMcpConfig, given.settingSources, given.pathToClaudeCodeExecutable],
    [false, true, [], undefined],
    "no session written, no MCP server but one named here, none of the user's settings, and the SDK's own entrypoint",
  );
  assert.equal(usageOptions('/bin/claude').pathToClaudeCodeExecutable, '/bin/claude', 'the Claude Code named is the one asked');
});

test("an ask puts the question once, skipping the behaviours scan, and closes its query on the answer; the command it was given is the query's", async () => {
  const stand = standIn(async () => usageOf('plan'));
  assert.deepEqual(await Effect.runPromise(claudeQuota({ command: '/bin/claude', ask: stand.ask })), PLAN);
  assert.deepEqual(stand.seen, { asks: 1, closes: 1, command: '/bin/claude', skipBehaviors: true });
});

test('REFUSED: an ask that threw, timed out or was interrupted closes its query all the same', async () => {
  const refused = standIn(() => Promise.reject(thrown('no claude', { errorClass: 'executable_not_found' })));
  assert.deepEqual(await Effect.runPromise(claudeQuota({ ask: refused.ask })), { kind: 'missing' });
  assert.deepEqual([refused.seen.asks, refused.seen.closes], [1, 1], 'a refusal closes its query');

  const silent = standIn(() => new Promise<unknown>(() => {}));
  assert.deepEqual(await Effect.runPromise(claudeQuota({ timeoutMs: 20, ask: silent.ask })), { kind: 'timeout', ms: 20 });
  assert.deepEqual([silent.seen.asks, silent.seen.closes], [1, 1], 'an ask that timed out closed its query by the time it resolved');

  const held = standIn(() => new Promise<unknown>(() => {}));
  const stop = new AbortController();
  const exit = Effect.runPromiseExit(claudeQuota({ ask: held.ask }), { signal: stop.signal });
  stop.abort();
  assert.ok(Exit.hasInterrupts(await exit), 'the ask was interrupted, not answered');
  assert.deepEqual(held.seen.closes, 1, 'an interrupted ask closed its query before the interruption returned');
});

test("the engine's quota asks its default harness, or the one named, and answers the same either way", async () => {
  const engine = engineOver(standIn(async () => usageOf('plan')).ask);
  assert.deepEqual(await Effect.runPromise(engine.quota()), PLAN);
  assert.deepEqual(await Effect.runPromise(engine.quota('claude')), PLAN);
  const asking = engineOver(standIn(async () => usageOf('unanswered')).ask);
  assert.deepEqual(await Effect.runPromise(asking.quota('claude')), await Effect.runPromise(asking.quota()));
});

test('REFUSED: a quota asked of a harness that has none, of one the engine has not, or with other arguments', async () => {
  const stand = standIn(async () => usageOf('plan'));
  const engine = engineOver(stand.ask);
  const untyped = <F>(f: F) => f as (...args: unknown[]) => EngineShape['quota'] extends (...a: never[]) => infer R ? R : never;
  const cases: Array<[() => ReturnType<EngineShape['quota']>, string]> = [
    [() => engine.quota('fake'), 'the `fake` harness reports no quota. Ask one that does: claude.'],
    [() => engine.quota('nope'), '`nope` is not a harness this engine has. Its harnesses are: claude, fake.'],
    [() => untyped(engine.quota)(42), "takes one harness's name, or nothing for the default harness (`claude`); it was handed 42."],
    [
      () => untyped(engine.quota)('claude', 'fake'),
      'takes one harness\'s name, or nothing for the default harness (`claude`); it was handed "claude", "fake".',
    ],
  ];
  for (const [asked, words] of cases) {
    const refused = await Effect.runPromise(Effect.flip(asked()));
    assert.deepEqual([refused._tag, refused.message], ['QuotaRefused', words]);
  }
  assert.equal(stand.seen.asks, 0, 'no refused quota asked anything');
});

test('a quota refused for a harness that reports none makes no span, and no error on a trace; an ask is one span, with its harness', async () => {
  const engine = engineOver(standIn(async () => usageOf('plan')).ask);
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const traced = <A, E>(asked: Effect.Effect<A, E>) => Effect.runPromise(Effect.exit(asked).pipe(Effect.withTracer(tracer)));
  assert.equal(Exit.isFailure(await traced(engine.quota('fake'))), true, 'still refused');
  assert.deepEqual(
    spans.map((s) => s.name),
    [],
    'a refusal asks nothing, and traces nothing',
  );
  assert.equal(Exit.isSuccess(await traced(engine.quota('claude'))), true);
  assert.deepEqual(
    spans.map((s) => [s.name, s.attributes.get('harness'), s.status._tag === 'Ended' && Exit.isSuccess(s.status.exit)]),
    [['Engine.quota', 'claude', true]],
    'the ask of a harness that reports a quota is one span, ended well',
  );
});
