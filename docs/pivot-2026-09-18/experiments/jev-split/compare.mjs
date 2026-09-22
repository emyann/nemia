// Round 2: one comparative Choice over every source file at once — which should be split first — asked twice for stability.
// State per file: path, lines, part, rules, and each top-level declaration as "name (N lines)", no doc comments.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = '/home/yrnd1/projects/hkb-v2'; const HERE = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(path.join(ROOT, 'package.json'));
process.loadEnvFile(path.join(ROOT, '.env'));
const sdk = req('@typesafe-ai/sdk'); const client = new sdk.TypeSafeClient();
const states = JSON.parse(fs.readFileSync(path.join(HERE, 'states.json'), 'utf8'));
const sources = Object.entries(states).filter(([, s]) => s.file.kind === 'source file');
const files = Object.fromEntries(sources.map(([f, s]) => [f, {
  lines: s.file.lines, part: s.file.partOfTheSystem, importedByWorkspaceFiles: s.file.importedByWorkspaceFiles,
  ...(s.rules ? { rules: s.rules } : {}),
  declarations: s.declarations.map((d) => `${d.name} (${d.lines} lines${d.exported ? ', exported' : ''})`),
}]));
const options = Object.fromEntries(sources.map(([f]) => [f, null]));
const questions = {
  first: sdk.choice('Of the source files in `files`, which one would gain most from being broken into several smaller modules, so that one change needs only one of them read — for a person, or a coding agent reading into a limited context? Weigh how many separate purposes its declarations serve and how much of it one change would have to read; any split must keep that file\'s `rules`.', options),
};
const out = [];
for (let i = 0; i < 2; i++) {
  const r = await client.systemOne({ model: 'jev-1.13.0', state: { files }, questions });
  out.push({ tokens: r.usage.input_tokens, choice: r.answers.first.choice, confidence: r.answers.first.confidence, probabilities: r.answers.first.probabilities });
}
fs.writeFileSync(path.join(HERE, 'compare.json'), JSON.stringify(out, null, 1));
for (const [i, o] of out.entries()) {
  console.log(`\nask ${i + 1}: ${o.tokens} input tokens · choice ${o.choice} · confidence ${o.confidence.toFixed(3)}`);
  for (const [f, p] of Object.entries(o.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${p.toFixed(3)}  ${String(files[f].lines).padStart(5)}  ${f}`);
}
