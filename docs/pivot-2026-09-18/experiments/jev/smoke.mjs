import { TypeSafeClient, choice, noul, score } from '@typesafe-ai/sdk';
const client = new TypeSafeClient();
// Synthetic input: nothing from the repository or the store.
const base = { report: 'The build finished. Two tests fail in the payments module: a timeout in refund.test and an assertion in ledger.test. I did not look into them. Everything else passes.' };
const questions = {
  finished: choice('Does the author of `report` say the work is finished, unfinished, or do they not say?', { finished: null, unfinished: null, 'does not say': null }),
  failing: noul('Does `report` say that at least one test is failing?'),
  care: score('How thoroughly did the author of `report` investigate the failures they mention?', ['They did not investigate at all', 'They looked briefly and gave a guess', 'They found and explained the cause']),
};
const models = await client.models?.list?.().catch(() => null);
if (models) console.log('models:', JSON.stringify(models).slice(0, 300));
const pad = (n) => Array.from({ length: n }, (_, i) => `Note ${i}: the warehouse in district ${i % 17} reported ordinary stock levels and nothing unusual.`).join(' ');
for (const [label, state] of [['small', base], ['~8k tokens', { ...base, notes: pad(420) }], ['~28k tokens', { ...base, notes: pad(1500) }]]) {
  const ms = []; const seen = new Set(); let usage, model, first;
  for (let i = 0; i < 8; i++) {
    const t = performance.now();
    const r = await client.systemOne({ state, questions });
    ms.push(performance.now() - t);
    usage = r.usage; model = r.model; first ??= r.answers;
    seen.add(JSON.stringify(r.answers));
  }
  ms.sort((a, b) => a - b);
  console.log(`\n[${label}] model ${model} · input ${usage.input_tokens} tokens · output ${usage.output_tokens}`);
  console.log(`  latency ms: min ${ms[0].toFixed(0)} · median ${ms[4].toFixed(0)} · max ${ms.at(-1).toFixed(0)}`);
  console.log(`  distinct answer sets over 8 identical requests: ${seen.size}`);
  console.log('  finished:', first.finished.choice, JSON.stringify(first.finished.probabilities), 'conf', first.finished.confidence.toFixed(3));
  console.log('  failing (P yes):', first.failing.noul.toFixed(4), '· care score:', first.care.score.toFixed(3), JSON.stringify(first.care.probabilities));
  if (seen.size > 1) console.log('  variants:', [...seen].map((s) => s.slice(0, 160)).join('\n            '));
}
