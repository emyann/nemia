// Which of hkb-v2's large files should be broken into modules? Asked of Jev, one request per file.
// State: the file's outline, never its source — each top-level declaration's name, kind, size, whether it is exported
// and the first sentence of its doc comment (a test file: each top-level test's title and size), what it imports from
// the workspace, how many workspace files import it, and the repository's rules about that file.
// Run from the repository root: node <this> [record|show]. `record` asks; `show` prints the last answers.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = '/home/yrnd1/projects/hkb-v2';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const req = createRequire(path.join(ROOT, 'package.json'));
const ts = req('typescript');
const MODEL = 'jev-1.13.0';

const PARTS = {
  'packages/agent-engine': 'runs one agent session to completion, durably; the pure judgement is `decide` in src/domain.ts',
  'packages/agent-workflows': 'sequences engine tasks into runs of steps; the wf command line',
  'packages/agent-judge': 'asks TypeSafe a typed question once and records the answer; the judge command',
  'apps/api': 'a Hono server that puts the workflows behind HTTP for the web app',
  'apps/web': 'the React web app: the Factory canvas, a run\'s page, the inbox, workflows and agents pages',
};
const RULES = {
  'packages/agent-workflows/src/run.ts': 'Pure: reads no disk and calls no engine. `assess` is pure. Everything the tick decides is judged here, from data passed in.',
  'packages/agent-workflows/src/runner.ts': 'The only file in the package that imports the engine. Effectful: reads and writes the store, runs git, files engine tasks, applies what run.ts decides.',
  'packages/agent-workflows/src/cli.ts': 'Parses arguments, calls, prints. No judgement of its own.',
  'packages/agent-engine/src/domain.ts': '`decide` is pure and stays a screen long; the whole judgement of the engine lives here.',
  'packages/agent-engine/src/engine.ts': 'Applies one decision; no `if` that belongs in `decide`.',
};
const partOf = (f) => Object.entries(PARTS).find(([p]) => f.startsWith(p + '/'))?.[1] ?? 'other';

const tracked = execFileSync('git', ['ls-files', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' }).split('\n')
  .filter((f) => f && !/routeTree\.gen|\.d\.ts$/.test(f));
const lines = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length;
const big = tracked.filter((f) => lines(f) >= 600);
const CONTROLS = ['packages/agent-engine/src/domain.ts', 'packages/agent-workflows/src/deps.ts', 'packages/agent-workflows/src/check.ts'];
const FILES = [...big, ...CONTROLS.filter((f) => !big.includes(f) && tracked.includes(f))];

// Who imports whom, inside the workspace, by resolved path.
const importsOf = (f, sf) => sf.statements.filter(ts.isImportDeclaration).map((s) => s.moduleSpecifier.text);
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(from), spec));
  for (const c of [base, base.replace(/\.js$/, '.ts'), base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (tracked.includes(c)) return c;
  return null;
};
const parsed = new Map(tracked.map((f) => [f, ts.createSourceFile(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
const fanIn = new Map();
for (const [f, sf] of parsed) for (const spec of importsOf(f, sf)) { const r = resolve(f, spec); if (r) fanIn.set(r, (fanIn.get(r) ?? 0) + 1); }

const firstSentence = (s) => { const t = s.replace(/\s+/g, ' ').trim(); const m = t.match(/^(.{20,}?\.)\s/); const one = m ? m[1] : t; return one.length > 220 ? one.slice(0, 217) + '…' : one; };
const docOf = (node, sf) => {
  const jsdoc = ts.getJSDocCommentsAndTags(node).find(ts.isJSDoc);
  const c = jsdoc?.comment; const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.text ?? '').join('') : '';
  return text ? firstSentence(text) : undefined;
};
const span = (node, sf) => sf.getLineAndCharacterOfPosition(node.getEnd()).line - sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const exported = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const outline = (f) => {
  const sf = parsed.get(f); const out = [];
  const isTest = /\/test\//.test(f) || /\.test\.tsx?$/.test(f);
  for (const s of sf.statements) {
    if (isTest && ts.isExpressionStatement(s) && ts.isCallExpression(s.expression)) {
      const callee = s.expression.expression.getText(sf);
      const title = s.expression.arguments[0];
      if (/^(test|it|describe)(\.\w+)?$/.test(callee) && title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title)))
        { out.push({ name: title.text.slice(0, 160), kind: callee, lines: span(s, sf) }); continue; }
    }
    let name, kind;
    if (ts.isFunctionDeclaration(s)) { name = s.name?.text; kind = 'function'; }
    else if (ts.isClassDeclaration(s)) { name = s.name?.text; kind = 'class'; }
    else if (ts.isTypeAliasDeclaration(s)) { name = s.name.text; kind = 'type'; }
    else if (ts.isInterfaceDeclaration(s)) { name = s.name.text; kind = 'interface'; }
    else if (ts.isEnumDeclaration(s)) { name = s.name.text; kind = 'enum'; }
    else if (ts.isVariableStatement(s)) {
      const d = s.declarationList.declarations[0]; name = d.name.getText(sf);
      const init = d.initializer; kind = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? 'function' : 'const';
    } else continue;
    if (!name) continue;
    const decl = { name, kind, lines: span(s, sf), ...(exported(s) ? { exported: true } : {}) };
    const doc = docOf(s, sf); if (doc) decl.doc = doc;
    out.push(decl);
  }
  return { isTest, decls: out };
};

const stateOf = (f) => {
  const { isTest, decls } = outline(f);
  const workspaceImports = [...new Set(importsOf(f, parsed.get(f)).map((s) => resolve(f, s) ?? (s.startsWith('.') ? s : null)).filter(Boolean))];
  return {
    file: { path: f, lines: lines(f), kind: isTest ? 'test file' : 'source file', partOfTheSystem: partOf(f), importedByWorkspaceFiles: fanIn.get(f) ?? 0 },
    ...(RULES[f] ? { rules: RULES[f] } : {}),
    importsFromTheWorkspace: workspaceImports,
    declarations: decls,
  };
};

const QUESTIONS = (sdk) => ({
  split: sdk.noul({
    instructions: 'Would breaking the file described in `file` into several smaller modules make it easier to change one part of it without reading the rest — for a person, or for a coding agent that reads files into a limited context? Judge from `declarations`: what each says it does, how large each is, and whether they fall into groups. Any split must keep `rules`, when there are rules.',
    criteria: {
      true: 'The declarations fall into groups with separate purposes that could each live in a module of their own, and a change to one group rarely needs the others.',
      false: 'The declarations serve one purpose tightly together, or the file is a list of like entries (a table, the tests of one unit) that splitting would only scatter.',
    },
  }),
  purposes: sdk.score('How many separate purposes do the `declarations` of the file described in `file` serve?', [
    'One purpose: every declaration serves the same job',
    'Two closely related purposes that belong together',
    'Three or four purposes that could each stand alone',
    'Many unrelated purposes mixed together in one file',
  ]),
  navigate: sdk.score('How hard is it to find the part of the file described in `file` that one change needs, from its `declarations` alone?', [
    'Easy: few declarations, each clearly named for what it does',
    'Manageable: many declarations, but named and grouped so the right one is found quickly',
    'Hard: many declarations of mixed purposes, where finding the right ones means reading around',
    'Very hard: hundreds of declarations or a few enormous ones, where a change needs much of the file read first',
  ]),
});

const mode = process.argv[2] ?? 'show';
const OUT = path.join(HERE, 'answers.json');
if (mode === 'states') {
  const states = Object.fromEntries(FILES.map((f) => [f, stateOf(f)]));
  fs.writeFileSync(path.join(HERE, 'states.json'), JSON.stringify(states, null, 1));
  for (const [f, s] of Object.entries(states)) console.log(`${String(s.file.lines).padStart(5)} lines  ${String(s.declarations.length).padStart(4)} decls  ${String(JSON.stringify(s).length).padStart(6)} chars  ${f}`);
  process.exit(0);
}
if (mode === 'record') {
  process.loadEnvFile(path.join(ROOT, '.env'));
  const sdk = req('@typesafe-ai/sdk');
  const client = new sdk.TypeSafeClient();
  const questions = QUESTIONS(sdk);
  const states = Object.fromEntries(FILES.map((f) => [f, stateOf(f)]));
  fs.writeFileSync(path.join(HERE, 'states.json'), JSON.stringify(states, null, 1));
  const results = [];
  const queue = [...FILES];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let f; (f = queue.shift()); ) {
      const t = performance.now();
      try {
        const r = await client.systemOne({ model: MODEL, state: states[f], questions });
        results.push({ file: f, lines: states[f].file.lines, decls: states[f].declarations.length, ms: Math.round(performance.now() - t), inputTokens: r.usage.input_tokens, model: r.model, answers: r.answers });
      } catch (e) { results.push({ file: f, error: String(e?.message ?? e) }); }
    }
  }));
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
}
const results = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const ok = results.filter((r) => !r.error);
ok.sort((a, b) => b.answers.split.noul - a.answers.split.noul);
console.log('P(split)  purposes/3  navigate/3  lines  decls  tokens  file');
for (const r of ok) console.log(`${r.answers.split.noul.toFixed(2).padStart(8)}  ${r.answers.purposes.score.toFixed(2).padStart(10)}  ${r.answers.navigate.score.toFixed(2).padStart(10)}  ${String(r.lines).padStart(5)}  ${String(r.decls).padStart(5)}  ${String(r.inputTokens).padStart(6)}  ${r.file}`);
for (const r of results.filter((r) => r.error)) console.log('FAILED', r.file, r.error);
const tokens = ok.reduce((n, r) => n + r.inputTokens, 0);
console.log(`\n${ok.length} answered, ${results.length - ok.length} failed · ${tokens} input tokens · model ${ok[0]?.model}`);
