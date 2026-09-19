/**
 * The error channel, and "a failure is a fact too".
 *   node --env-file=/home/yrnd1/projects/hkb-v2/.env exp3-errors.ts
 */
import { Effect, Layer } from 'effect';
import fs from 'node:fs';
import { JudgeLog, live, recorded, decide, decideAll, orUnsure, noul, type JudgeError } from './judge.ts';
import { MODEL, LOG, HERE, chosen, findings, questionsFor, counting } from './data.ts';

const q = noul('Is `request` about the web app?', { true: 'The request asks for a change under apps/web.', false: 'It does not.' });
const state = { request: chosen[0]!.brief };
const T = { yes: 0.8, no: 0.3 };
const out: Record<string, unknown> = {};
const show = (name: string, v: unknown) => { out[name] = v; console.log(name.padEnd(34), JSON.stringify(v)); };
const tagOf = <A>(r: { _tag: 'Success'; success: A } | { _tag: 'Failure'; failure: JudgeError }) => (r._tag === 'Failure' ? { error: r.failure._tag, ...JSON.parse(JSON.stringify(r.failure)) } : { ok: r.success });
const time = async <A>(f: () => Promise<A>) => { const t = performance.now(); const v = await f(); return [v, Math.round(performance.now() - t)] as const; };

// 1. A forced timeout, through the recorded layer, asked twice.
{
  const net = counting();
  const errLog = `${HERE}/errors.jsonl`; fs.rmSync(errLog, { force: true });
  const layer = recorded().pipe(Layer.provide(Layer.mergeAll(live({ model: MODEL, fetch: net.fetch, attemptMs: 5, budgetMs: 2_000, retries: 2 }), JudgeLog.file(errLog))));
  const [first, ms1] = await time(() => Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(layer))));
  show('timeout: first ask', { ...tagOf(first as never), networkCalls: net.seen.calls, ms: ms1 });
  const before = net.seen.calls;
  const [second, ms2] = await time(() => Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(layer))));
  show('timeout: asked again', { ...tagOf(second as never), newNetworkCalls: net.seen.calls - before, ms: ms2 });
  const fact = JSON.parse(fs.readFileSync(errLog, 'utf8').trim().split('\n').at(-1)!);
  show('timeout: the fact on record', { key: fact.key, error: fact.error, model: fact.model });
  const third = await Effect.runPromise(orUnsure(decide(q, T)(state), { verdict: 'unsure' as const, p: NaN }).pipe(Effect.provide(layer)));
  show('timeout: through orUnsure', third.verdict);
  // A person asks again: a new asking number is a new key, the old fact stays.
  const again = recorded({ asking: 2 }).pipe(Layer.provide(Layer.mergeAll(live({ model: MODEL, fetch: net.fetch }), JudgeLog.file(errLog))));
  const fourth = await Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(again)));
  show('timeout: asking 2 (a person\'s)', { ...tagOf(fourth as never), factsOnRecord: fs.readFileSync(errLog, 'utf8').trim().split('\n').length });
}
// 2. A total budget the SDK does not have: attempts that each fit, a budget that does not.
{
  const net = counting(() => new Promise<Response>((_, reject) => setTimeout(() => reject(new TypeError('fetch failed')), 150)));
  const layer = live({ model: MODEL, fetch: net.fetch, budgetMs: 400, retries: 10 });
  const [r, ms] = await time(() => Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(layer))));
  show('budget: 10 retries, 400 ms budget', { ...tagOf(r as never), networkCalls: net.seen.calls, ms });
}
// 3. A bad key: refused, and not retried.
{
  const net = counting();
  const [r, ms] = await time(() => Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(live({ model: MODEL, fetch: net.fetch, apiKey: 'not-a-key' })))));
  show('bad key', { ...tagOf(r as never), networkCalls: net.seen.calls, ms });
}
// 4. A request the service refuses for its shape: a model that does not exist.
{
  const net = counting();
  const r = await Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(live({ model: 'jev-0.0.0-nope', fetch: net.fetch }))));
  show('unknown model', { ...tagOf(r as never), networkCalls: net.seen.calls });
}
// 5. A rate limit (stubbed: two 429s, then the real service), retried by the Schedule.
{
  let n = 0;
  const net = counting((input, init) => (++n <= 2 ? Promise.resolve(new Response('{"error":"slow down"}', { status: 429, headers: { 'content-type': 'application/json' } })) : fetch(input, init)));
  const [r, ms] = await time(() => Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(live({ model: MODEL, fetch: net.fetch })))));
  show('429 twice, then live', { ...tagOf(r as never), networkCalls: net.seen.calls, ms });
  const net2 = counting(() => Promise.resolve(new Response('{"error":"slow down"}', { status: 429 })));
  const r2 = await Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(live({ model: MODEL, fetch: net2.fetch, retries: 2 }))));
  show('429 for ever', { ...tagOf(r2 as never), networkCalls: net2.seen.calls });
}
// 6. The network is down (stubbed).
{
  const net = counting(() => Promise.reject(new TypeError('fetch failed')));
  const r = await Effect.runPromise(Effect.result(decide(q, T)(state)).pipe(Effect.provide(live({ model: MODEL, fetch: net.fetch, retries: 3 }))));
  show('network down', { ...tagOf(r as never), networkCalls: net.seen.calls });
}
// 7. Fan-out, partly on record: 77 recorded + 1 new question over the same state sends ONE question.
{
  const net = counting();
  const copy = `${HERE}/partial.jsonl`; fs.copyFileSync(LOG, copy);
  const layer = recorded().pipe(Layer.provide(Layer.mergeAll(live({ model: MODEL, fetch: net.fetch, attemptMs: 60_000 }), JudgeLog.file(copy))));
  const r = await Effect.runPromise(decideAll({ ...questionsFor(), 'about-web': q }, T)(state).pipe(Effect.provide(layer)));
  show('partial fan-out', { questions: findings.length + 1, sent: r.asked, networkCalls: net.seen.calls, inputTokens: r.usage.input_tokens, newAnswer: r.decisions['about-web'] });
  out.tokens = r.usage.input_tokens;
  fs.rmSync(copy);
}
fs.writeFileSync(`${HERE}/exp3-result.json`, JSON.stringify(out, null, 1));
