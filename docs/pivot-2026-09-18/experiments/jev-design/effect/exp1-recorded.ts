/**
 * Live, through the recorded layer. Run it twice: the second run must make no network call.
 *   node --env-file=/home/yrnd1/projects/hkb-v2/.env exp1-recorded.ts
 */
import { Effect, Layer } from 'effect';
import fs from 'node:fs';
import { Judge, JudgeLog, live, recorded, decideAll } from './judge.ts';
import { MODEL, LOG, HERE, chosen, questionsFor, counting } from './data.ts';

const net = counting();
const layer = recorded().pipe(Layer.provide(Layer.mergeAll(live({ model: MODEL, fetch: net.fetch, attemptMs: 60_000, budgetMs: 120_000 }), JudgeLog.file(LOG))));

const program = Effect.gen(function* () {
  const rows = [];
  for (const b of chosen) {
    const t = performance.now();
    // 77 questions over one state, ONE request.
    const r = yield* decideAll(questionsFor(), { yes: 0.8, no: 0.3 })({ request: b.brief });
    const ms = Math.round(performance.now() - t);
    const n = { yes: 0, no: 0, unsure: 0 };
    for (const d of Object.values(r.decisions)) n[d.verdict]++;
    rows.push({ brief: b.run, asked: r.asked, tokens: r.usage.input_tokens, ms, ...n });
    console.log(`${b.run.padEnd(42)} asked ${String(r.asked).padStart(2)}  ${String(r.usage.input_tokens).padStart(6)} tok ${String(ms).padStart(5)} ms   yes ${n.yes} unsure ${n.unsure} no ${n.no}`);
  }
  return rows;
});

const rows = await Effect.runPromise(program.pipe(Effect.provide(layer)));
const tokens = rows.reduce((t, r) => t + r.tokens, 0);
const summary = { at: new Date().toISOString(), networkCalls: net.seen.calls, questionsAsked: rows.reduce((t, r) => t + r.asked, 0), inputTokens: tokens, usd: +(tokens * 0.042 / 1e6).toFixed(5), rows };
console.log(`\nnetwork calls ${summary.networkCalls}, questions sent ${summary.questionsAsked}, input tokens ${tokens}, $${summary.usd}`);
fs.appendFileSync(`${HERE}/exp1-runs.jsonl`, JSON.stringify(summary) + '\n');
