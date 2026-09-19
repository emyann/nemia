import { readFileSync, writeFileSync } from 'node:fs';
import { TypeSafeClient } from '@typesafe-ai/sdk';
const { findings, briefs } = JSON.parse(readFileSync('dataset.json', 'utf8'));
const prior = JSON.parse(readFileSync('probe-result.json', 'utf8'));
const done = new Set(prior.briefs.map((b) => b.run));
const client = new TypeSafeClient();
const question = (f) => ({ type: 'noul',
  instructions: `Does \`request\` ask for the following problem to be fixed? Problem, in file ${f.file}: ${f.what}`,
  criteria: { true: 'The request asks, in its own words, for this specific problem to be fixed.',
    false: 'The request does not ask for this problem to be fixed: it is about other problems, it only touches the same files or names, or it mentions this problem and says to leave it alone.' } });
const p = {}; for (const [k, v] of Object.entries(prior.pairs)) p[k] = v[0];
let tokens = 0; const todo = briefs.filter((b) => !done.has(b.run));
const work = async (b) => {
  const r = await client.systemOne({ model: 'jev-1.13.0', state: { request: b.brief }, questions: Object.fromEntries(findings.map((f) => [f.id, question(f)])) }, { timeout: 120000 });
  tokens += r.usage.input_tokens; for (const [id, a] of Object.entries(r.answers)) p[`${b.run}|${id}`] = a.noul;
};
for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(work));
writeFileSync('fates-raw.json', JSON.stringify(p));
console.log(`${todo.length} more briefs asked once, ${tokens} tokens = $${(tokens * 0.042 / 1e6).toFixed(4)}; ${Object.keys(p).length} pairs in all`);
