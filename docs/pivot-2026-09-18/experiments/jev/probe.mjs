import { readFileSync, writeFileSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
const MODEL = 'jev-1.13.0';
const ASKINGS = 3;
const { findings, briefs } = JSON.parse(readFileSync('dataset.json', 'utf8'));
const LEFT = ['five-leftovers-from-the-revi-c0tl', 'six-findings-the-last-review-6no7', 'four-leftovers-in-agent-work-3uyy', 'four-leftovers-on-the-board-fmk9', 'two-findings-the-apps-lane-s-1qur'];
const decoys = briefs.filter((b) => !LEFT.includes(b.run)).slice(-10);
const chosen = [...briefs.filter((b) => LEFT.includes(b.run)), ...decoys];
const client = new TypeSafeClient();
const question = (f) => ({
  type: 'noul',
  instructions: `Does \`request\` ask for the following problem to be fixed? Problem, in file ${f.file}: ${f.what}`,
  criteria: {
    true: 'The request asks, in its own words, for this specific problem to be fixed.',
    false: 'The request does not ask for this problem to be fixed: it is about other problems, it only touches the same files or names, or it mentions this problem and says to leave it alone.',
  },
});
const ask = async (state, batch) => {
  const questions = Object.fromEntries(batch.map((f) => [f.id, question(f)]));
  const t = performance.now();
  const r = await client.systemOne({ model: MODEL, state, questions }, { timeout: 120000 });
  return { ms: performance.now() - t, usage: r.usage, model: r.model, answers: Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, v.noul])) };
};
// How is fan-out billed? One question against all of them, same state.
const one = await ask({ request: chosen[0].brief }, findings.slice(0, 1));
console.log(`billing check: 1 question → ${one.usage.input_tokens} input tokens`);
const out = { model: MODEL, askings: ASKINGS, requests: [], pairs: {} };
let batches = [findings];
for (const b of chosen) {
  const state = { request: b.brief };
  for (let k = 0; k < ASKINGS; k++) {
    let answers = {}; let tokens = 0; let ms = 0;
    for (let tries = 0; ; tries++) {
      try {
        answers = {}; tokens = 0; ms = 0;
        for (const batch of batches) { const r = await ask(state, batch); Object.assign(answers, r.answers); tokens += r.usage.input_tokens; ms += r.ms; }
        break;
      } catch (err) {
        if (tries === 0 && batches.length === 1) { console.log(`  one request of ${findings.length} questions was refused (${String(err.message).slice(0, 140)}); splitting in three`); const n = Math.ceil(findings.length / 3); batches = [findings.slice(0, n), findings.slice(n, 2 * n), findings.slice(2 * n)]; continue; }
        throw err;
      }
    }
    out.requests.push({ brief: b.run, asking: k, tokens, ms: Math.round(ms), batches: batches.length });
    for (const [id, p] of Object.entries(answers)) (out.pairs[`${b.run}|${id}`] ??= []).push(p);
  }
  const last = out.requests.at(-1);
  console.log(`${b.run.padEnd(40)} ${LEFT.includes(b.run) ? 'leftovers' : 'decoy    '} ${last.tokens} tokens/asking  ${last.ms} ms`);
}
out.briefs = chosen.map((b) => ({ run: b.run, createdAt: b.createdAt, leftovers: LEFT.includes(b.run), chars: b.brief.length }));
writeFileSync('probe-result.json', JSON.stringify(out, null, 1));
const total = out.requests.reduce((t, r) => t + r.tokens, 0);
console.log(`\n${out.requests.length} askings, ${Object.keys(out.pairs).length} pairs, ${total} input tokens = $${(total * 0.042 / 1e6).toFixed(4)}`);
