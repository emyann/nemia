/**
 * What the daemon's quota ask traces (`askedQuota`), over the runtime itself: every harness is asked, and one that reports no quota is
 * refused without a word on a trace — no span of the runtime's ends in error — while the ask of one that reports a quota is its span.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from 'agent-runtime';
import { Effect, Exit, Tracer } from 'effect';
import { asyncOps, plainEngine, type AsyncRunner } from '../../test/promised.ts';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-quota-spans-');
const { askedQuota } = await import('./up.verb.ts');

/** A harness that runs nothing and reports no quota. */
const idle: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};

const WINDOWS = { kind: 'windows' as const, limits: [{ key: 'week', usedPercentage: 40, resetsAt: null }], subscription: null };

test("a pass's quota ask makes no error span for a harness that reports no quota, and one span for the ask of one that does", async () => {
  const e = plainEngine(
    Engine.layer({
      root: scratch('wf-quota-spans-engine-'),
      harnesses: { claude: { ...asyncOps(idle), quota: Effect.succeed(WINDOWS) }, codex: asyncOps(idle), check: asyncOps(idle) },
      defaultHarness: 'claude',
    }),
  );
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const reading = await Effect.runPromise(askedQuota(e, {}, ['codex', 'check', 'claude']).pipe(Effect.withTracer(tracer)));
  assert.deepEqual(reading, { claude: { week: 40 } }, 'the harness that reports a quota is read');
  const failed = spans.filter((s) => s.status._tag === 'Ended' && Exit.isFailure(s.status.exit)).map((s) => s.name);
  assert.deepEqual(failed, [], 'no span ends in error for a harness that reports no quota');
  assert.deepEqual(
    spans.filter((s) => s.name === 'Engine.quota').map((s) => s.attributes.get('harness')),
    ['claude'],
    'the ask of the harness that reports a quota is traced',
  );
});
