// Round 3: for each top-level declaration of run.ts, which module should it live in? One Choice per declaration over the
// file's own section headings (and "the run record and assess" for the unmarked top). The section it sits in today is
// NOT sent; it is the reference the answers are scored against. State: every declaration's outline — name, kind, size,
// exported, first doc sentence, which run.ts declarations it uses and which use it.
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = '/home/yrnd1/projects/hkb-v2'; const HERE = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(path.join(ROOT, 'package.json')); const ts = req('typescript');
const F = 'packages/agent-workflows/src/run.ts';
const src = fs.readFileSync(path.join(ROOT, F), 'utf8'); const sf = ts.createSourceFile(F, src, ts.ScriptTarget.Latest, true);
const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const TOP = 'the run record and assess';
const markers = [...src.split('\n').entries()].filter(([, l]) => l.startsWith('// ─── ')).map(([i, l]) => ({ line: i + 1, title: l.replace(/^\/\/ ─── /, '').replace(/ ─+$/, '').trim() }));
const sectionAt = (line) => [...markers].reverse().find((m) => m.line < line)?.title ?? TOP;
const first = (s) => { const t = s.replace(/\s+/g, ' ').trim(); const m = t.match(/^(.{20,}?\.)\s/); const o = m ? m[1] : t; return o.length > 200 ? o.slice(0, 197) + '…' : o; };
const decls = [];
for (const s of sf.statements) {
  let name, kind;
  if (ts.isFunctionDeclaration(s)) { name = s.name?.text; kind = 'function'; }
  else if (ts.isTypeAliasDeclaration(s)) { name = s.name.text; kind = 'type'; }
  else if (ts.isInterfaceDeclaration(s)) { name = s.name.text; kind = 'interface'; }
  else if (ts.isClassDeclaration(s)) { name = s.name?.text; kind = 'class'; }
  else if (ts.isVariableStatement(s)) { const d = s.declarationList.declarations[0]; name = d.name.getText(sf); kind = d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? 'function' : 'const'; }
  if (!name || decls.some((d) => d.name === name)) continue;
  const jsdoc = ts.getJSDocCommentsAndTags(s).find(ts.isJSDoc); const c = jsdoc?.comment;
  const doc = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join('') : '';
  decls.push({ name, kind, node: s, start: lineOf(s.getStart(sf)), lines: lineOf(s.getEnd()) - lineOf(s.getStart(sf)) + 1, exported: !!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword), doc: doc ? first(doc) : undefined });
}
const names = new Set(decls.map((d) => d.name));
for (const d of decls) {
  const used = new Set();
  const walk = (n) => { if (ts.isIdentifier(n) && names.has(n.text) && n.text !== d.name) used.add(n.text); ts.forEachChild(n, walk); };
  walk(d.node); d.uses = [...used];
}
for (const d of decls) d.usedBy = decls.filter((o) => o.uses.includes(d.name)).map((o) => o.name);
const truth = Object.fromEntries(decls.map((d) => [d.name, sectionAt(d.start)]));
const MODULES = [TOP, ...markers.map((m) => m.title)];
const cap = (a) => (a.length > 12 ? [...a.slice(0, 12), `…and ${a.length - 12} more`] : a);
const outline = Object.fromEntries(decls.map((d) => [d.name, { kind: d.kind, lines: d.lines, ...(d.exported ? { exported: true } : {}), ...(d.doc ? { doc: d.doc } : {}), uses: cap(d.uses), usedBy: cap(d.usedBy) }]));
const state = {
  file: `${F}: the pure judgement of the workflow layer — it reads no disk and calls no engine; everything the tick decides about a run is decided here from data passed in.`,
  modules: MODULES,
  declarations: outline,
};
const mode = process.argv[2] ?? 'show';
const OUT = path.join(HERE, 'group.json');
if (mode === 'record') {
  process.loadEnvFile(path.join(ROOT, '.env'));
  const sdk = req('@typesafe-ai/sdk'); const client = new sdk.TypeSafeClient();
  const options = Object.fromEntries(MODULES.map((m) => [m, null]));
  const q = (n) => sdk.choice(`If \`file\` were broken into the modules listed in \`modules\`, which module should the declaration \`declarations.${n}\` live in? Judge by what it does (its name, kind and doc) and by what it works with (\`uses\` and \`usedBy\`): it belongs with the part of the system whose job it serves.`, options);
  const batches = []; for (let i = 0; i < decls.length; i += 25) batches.push(decls.slice(i, i + 25));
  const answers = {}; let tokens = 0;
  await Promise.all(batches.map(async (b) => {
    const r = await client.systemOne({ model: 'jev-1.13.0', state, questions: Object.fromEntries(b.map((d) => [d.name, q(d.name)])) });
    tokens += r.usage.input_tokens;
    for (const d of b) answers[d.name] = { choice: r.answers[d.name].choice, confidence: r.answers[d.name].confidence, p: r.answers[d.name].probabilities };
  }));
  fs.writeFileSync(OUT, JSON.stringify({ tokens, requests: batches.length, truth, answers, decls: decls.map(({ node, ...d }) => d) }, null, 1));
}
const { tokens, requests, answers } = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const rows = decls.map((d) => ({ ...d, truth: truth[d.name], ...answers[d.name] }));
const agree = rows.filter((r) => r.choice === r.truth);
const linesAgree = agree.reduce((n, r) => n + r.lines, 0), linesAll = rows.reduce((n, r) => n + r.lines, 0);
console.log(`${rows.length} declarations · ${requests} requests · ${tokens} input tokens`);
console.log(`agrees with today's section: ${agree.length}/${rows.length} declarations (${(100 * agree.length / rows.length).toFixed(0)}%), ${(100 * linesAgree / linesAll).toFixed(0)}% of the lines`);
const conf = (xs) => xs.length ? (xs.reduce((n, r) => n + r.confidence, 0) / xs.length).toFixed(2) : '-';
console.log(`mean confidence: agreeing ${conf(agree)}, disagreeing ${conf(rows.filter((r) => r.choice !== r.truth))}`);
console.log('\nper section today: size, agreement');
for (const m of MODULES) { const in_ = rows.filter((r) => r.truth === m); if (!in_.length) continue; console.log(`  ${String(in_.reduce((n, r) => n + r.lines, 0)).padStart(5)} lines  ${String(in_.filter((r) => r.choice === m).length).padStart(3)}/${String(in_.length).padEnd(3)} ${m}`); }
console.log('\nconfident disagreements (confidence >= 0.6), the candidates for a move:');
for (const r of rows.filter((r) => r.choice !== r.truth && r.confidence >= 0.6).sort((a, b) => b.confidence - a.confidence)) console.log(`  ${r.confidence.toFixed(2)}  ${r.name} (${r.lines} lines): today "${r.truth}" → Jev "${r.choice}"`);
