/**
 * A run's record, a person's files beside it and the inbox are read and written through `runStore` (`src/record/files.store.ts`): over
 * the orchestrator's `src` and the api's, tests left out (`sourcesOf`), a call that hands `fs` a path from `runsDir()` or `inboxDir()`,
 * or one built from them, is refused outside the store's own two files (`OWN`), read off each file's syntax tree, so a call oxfmt splits
 * over lines is the same call. Each of `RULES` is a part of the matcher, and each is proven by a fixture that only it refuses:
 *
 * - **`aliases`**: a call of `runsDir` or `inboxDir` (`ROOTS`) is a root, and so is a call of a name an import binds either to;
 * - **`propagation`**: a variable, or a variable assigned, whose value holds a root or a name that does is tainted, by its symbol, so a
 *   `run` declared in one function is not the `run` of another;
 * - **`returns`**: a function whose `return` holds one is tainted too, an arrow's body and a function declaration's alike;
 * - **`named`**: a name imported from `node:fs` or `node:fs/promises` is called as `fs` is, a default, a namespace or a named import;
 * - **`wrappers`**: a call of one of `record.store.ts`'s `fs` wrappers (`WRAPPERS`) hands its first argument to `fs`;
 * - **`targets`**: an `fs` call that takes two paths (`TWO_PATHS`), a copy, a move or a link, hands `fs` its second argument too.
 *
 * A path is an `fs` call's first argument, and its second under `targets`: what is written is no path, so a text that names the inbox
 * passes. A file whose path reaches `fs` on purpose is named in `EXCEPTIONS`, through the declarations whose paths
 * may reach it, and why; any other root of that file is still refused, and so is an exception with no why, one whose `through` names no
 * declaration of its file, and one its file is clean without.
 *
 * Not followed: a path handed to a local function whose parameter reaches `fs`, a path built from `HOME` and `'runs'`, and the exported
 * path helpers of a run's own folders (`artifactsDir`, `inputsDir`, `agentFilesDir`) used with `fs` in another file: the run's
 * `artifacts`, `inputs`, `agents`, the decision's and the api's detail read those, each a later card's.
 *
 * The test reads the api's sources: `turbo.json` makes `apps/*\/src` an input of this package's tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The sources the guard reads, from the repository's root. */
const SOURCES = ['packages/agent-orchestrator/src', 'apps/api/src'];

/** The store's own files: the run store's (`runsDir`) and the inbox's (`inboxDir`). */
const OWN = ['packages/agent-orchestrator/src/record/record.store.ts', 'packages/agent-orchestrator/src/record/files.store.ts'];

/** The functions whose call names a folder of the store. */
const ROOTS = ['runsDir', 'inboxDir'];

/** The modules whose calls are `fs`'s. */
const FS_MODULES = ['node:fs', 'node:fs/promises', 'fs', 'fs/promises'];

/** `record.store.ts`'s wrappers of `fs`: each hands its first argument to `fs`. */
const WRAPPERS = ['lstatOf', 'isDirectory', 'fileNames'];

/** The `fs` calls whose second argument is a path too. */
const TWO_PATHS = ['copyFile', 'cp', 'rename', 'link', 'symlink'].flatMap((name) => [name, `${name}Sync`]);

type Rule = 'aliases' | 'propagation' | 'returns' | 'named' | 'wrappers' | 'targets';

/** The parts of the matcher, each of which a fixture proves. */
const RULES: readonly Rule[] = ['aliases', 'propagation', 'returns', 'named', 'wrappers', 'targets'];

type Exception = { through: readonly string[]; why: string };

/** Each file whose paths from the store's folders reach `fs` on purpose, through the declarations named, and why. */
const EXCEPTIONS: Readonly<Record<string, Exception>> = {
  'packages/agent-orchestrator/src/agents/agents.store.ts': {
    through: ['agentFilesDir'],
    why:
      "a run's rendered agents, runs/<id>/agents/<step>, are written once at nemia start and read by the tick: neither its record, a " +
      "person's file nor the inbox, which are runStore's",
  },
};

/** `node` without the parentheses, `as`, `satisfies` and `!` around it. */
function unwrapped(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at))
    at = at.expression;
  return at;
}

/** The identifier a callee is rooted in: `fs` of `fs.promises.stat`, `list` of `list`. */
function calleeRoot(call: ts.CallExpression): ts.Identifier | undefined {
  let at = unwrapped(call.expression);
  while (ts.isPropertyAccessExpression(at)) at = unwrapped(at.expression);
  return ts.isIdentifier(at) ? at : undefined;
}

/** What a file's imports bind: the names of the store's roots, and each name bound to `fs` with the function it names, if one. */
type Bindings = { roots: ReadonlySet<string>; fsNames: ReadonlyMap<string, string | undefined> };

/** The bindings of a file's imports, each kind of `fs` import under `named` but the default and the namespace, which are `fs` itself. */
function bindingsOf(source: ts.SourceFile, rules: readonly Rule[]): Bindings {
  const roots = new Set(ROOTS);
  const fsNames = new Map<string, string | undefined>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    const fromFs = FS_MODULES.includes(statement.moduleSpecifier.text);
    if (fromFs && clause?.name) fsNames.set(clause.name.text, undefined);
    if (fromFs && bindings && ts.isNamespaceImport(bindings)) fsNames.set(bindings.name.text, undefined);
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (fromFs && rules.includes('named')) fsNames.set(element.name.text, imported);
      if (ROOTS.includes(imported) && rules.includes('aliases')) roots.add(element.name.text);
    }
  }
  return { roots, fsNames };
}

/** The expressions a function returns: an arrow's expression body, else each `return`'s, a nested function's left out. */
function returnsOf(fn: ts.SignatureDeclaration): ts.Expression[] {
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];
  const out: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

type Site = { line: number; callee: string };

/**
 * Each call of `source` that hands `fs` a path from the store's folders, by its line and its callee, under `rules`; a declaration
 * named in `through` taints nothing.
 */
function sitesIn(source: ts.SourceFile, checker: ts.TypeChecker, through: readonly string[], rules: readonly Rule[]): Site[] {
  const { roots, fsNames } = bindingsOf(source, rules);
  const tainted = new Set<ts.Symbol>();
  const symbolOf = (id: ts.Identifier): ts.Symbol | undefined =>
    ts.isShorthandPropertyAssignment(id.parent) ? checker.getShorthandAssignmentValueSymbol(id.parent) : checker.getSymbolAtLocation(id);
  const isRoot = (call: ts.CallExpression): boolean => {
    const callee = unwrapped(call.expression);
    return ts.isIdentifier(callee) && roots.has(callee.text);
  };
  const holds = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node) && isRoot(node)) return true;
    if (ts.isIdentifier(node)) {
      const symbol = symbolOf(node);
      return symbol !== undefined && tainted.has(symbol);
    }
    if (ts.isFunctionLike(node)) return rules.includes('returns') && returnsOf(node).some(holds);
    return ts.forEachChild(node, (child) => holds(child) || undefined) ?? false;
  };
  const seeds: Array<{ name: ts.Identifier; value: () => ts.Node[] }> = [];
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      seeds.push({ name: node.name, value: () => [init] });
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      const right = node.right;
      seeds.push({ name: node.left, value: () => [right] });
    }
    if (ts.isFunctionDeclaration(node) && node.name) seeds.push({ name: node.name, value: () => [node] });
    ts.forEachChild(node, collect);
  };
  collect(source);
  const live = seeds.filter((s) => !through.includes(s.name.text));
  for (let grew = rules.includes('propagation') || rules.includes('returns'); grew;) {
    grew = false;
    for (const seed of live) {
      const symbol = symbolOf(seed.name);
      if (!symbol || tainted.has(symbol)) continue;
      const isFunction = seed.value().some((v) => ts.isFunctionLike(unwrappedNode(v)));
      if (!rules.includes(isFunction ? 'returns' : 'propagation')) continue;
      if (seed.value().some(holds)) {
        tainted.add(symbol);
        grew = true;
      }
    }
  }
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const paths = pathArguments(node, fsNames, rules);
      if (paths.some(holds))
        sites.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          callee: node.expression.getText(source).replace(/\s+/g, ''),
        });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

/** `node` unwrapped when it is an expression. */
const unwrappedNode = (node: ts.Node): ts.Node => (ts.isExpression(node) ? unwrapped(node) : node);

/** The arguments a call hands `fs` as paths: none for a call that is no `fs` call nor a wrapper's. */
function pathArguments(call: ts.CallExpression, fsNames: Bindings['fsNames'], rules: readonly Rule[]): ts.Expression[] {
  const root = calleeRoot(call);
  const callee = unwrapped(call.expression);
  const [first, second] = call.arguments;
  if (!first) return [];
  if (root && fsNames.has(root.text)) {
    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : fsNames.get(root.text);
    return rules.includes('targets') && name !== undefined && TWO_PATHS.includes(name) && second ? [first, second] : [first];
  }
  if (rules.includes('wrappers') && ts.isIdentifier(callee) && WRAPPERS.includes(callee.text)) return [first];
  return [];
}

/** Every name a file declares: a variable's, a function's, a parameter's. */
function declaredIn(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isParameter(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    )
      names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

/** One program over `texts`, each file alone: no import resolved and no library read, so a symbol is the file's own. */
function programOf(texts: ReadonlyMap<string, string>): { sources: Map<string, ts.SourceFile>; checker: ts.TypeChecker } {
  const sources = new Map(
    [...texts].map(([file, text]) => [file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)]),
  );
  const options: ts.CompilerOptions = { noResolve: true, noLib: true, types: [], allowImportingTsExtensions: true, noEmit: true };
  const host: ts.CompilerHost = {
    getSourceFile: (file) => sources.get(file),
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (file) => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (file) => sources.has(file),
    readFile: (file) => texts.get(file),
  };
  return { sources, checker: ts.createProgram([...sources.keys()], options, host).getTypeChecker() };
}

const FIX =
  'read and write it through runStore, adding the method to RunStore (src/record/record.ts), or name the file in EXCEPTIONS ' +
  '(test/store-paths.test.ts) with the declarations it goes through and why';

/** What `texts` break of the rule under `exceptions` and `rules`, each a sentence naming the file, the line and the fix. */
function breaks(
  texts: ReadonlyMap<string, string>,
  exceptions: Readonly<Record<string, Exception>> = EXCEPTIONS,
  rules: readonly Rule[] = RULES,
): string[] {
  const { sources, checker } = programOf(texts);
  const out: string[] = [];
  for (const [file, source] of sources) {
    if (OWN.includes(file)) continue;
    for (const site of sitesIn(source, checker, exceptions[file]?.through ?? [], rules))
      out.push(`${file}:${site.line} hands ${site.callee} a path under runsDir() or inboxDir(): ${FIX}`);
  }
  for (const [file, exception] of Object.entries(exceptions)) {
    const source = sources.get(file);
    if (!exception.why.trim()) out.push(`${file}'s exception says no why: say why its paths reach fs outside runStore`);
    if (!source) {
      out.push(`${file} is excepted but is not read: where it moved, rename its entry; else take it off`);
      continue;
    }
    const declared = declaredIn(source);
    const unknown = exception.through.filter((name) => !declared.has(name));
    if (unknown.length) out.push(`${file}'s exception goes through ${unknown.join(', ')}, which it does not declare: name a declaration`);
    else if (!sitesIn(source, checker, [], rules).length) out.push(`${file} hands fs no path of the store's: take its exception off`);
  }
  return out;
}

/** Whether a file of a `src` is left out: a test, beside its code or in a `test` folder. */
const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file) || file.split('/').includes('test');

/** Every `.ts` under each of `SOURCES` in `root`, by its path from `root`, but the tests. */
function sourcesOf(root: string): string[] {
  return SOURCES.filter((src) => fs.existsSync(path.join(root, src)))
    .flatMap((src) =>
      fs.readdirSync(path.join(root, src), { recursive: true, encoding: 'utf8' }).map((f) => `${src}/${f.split(path.sep).join('/')}`),
    )
    .filter((f) => /\.tsx?$/.test(f) && !isTest(f))
    .sort();
}

const AT = 'packages/agent-orchestrator/src/new/new.verb.ts';

const one = (text: string, file = AT): Map<string, string> => new Map([[file, text]]);

const HEAD = "import fs from 'node:fs';\nimport path from 'node:path';\nimport { inboxDir, runsDir } from '../record/record.store.ts';\n";

/** The fixtures the matcher refuses with no rule but its `ROOTS` and `FS_MODULES`'s default import. */
const PLAIN = [
  `${HEAD}fs.readdirSync(runsDir());\n`,
  `${HEAD}export const card = (x: string) => fs.readFileSync(path.join(inboxDir(), x), 'utf8');\n`,
];

/** The fixtures each rule alone refuses: each is one site with every rule on, and none with its rule taken out. */
const FIXTURES: Readonly<Record<Rule, readonly string[]>> = {
  aliases: [
    "import fs from 'node:fs';\nimport { runsDir as runs } from '../record/record.store.ts';\nfs.readdirSync(runs());\n",
    "import fs from 'node:fs';\nimport { inboxDir as cards } from '../record/files.store.ts';\nfs.rmSync(cards(), { recursive: true });\n",
  ],
  propagation: [
    `${HEAD}export function gone(id: string) {\n  const at = path.join(\n    runsDir(),\n    id,\n  );\n  fs.rmSync(at, { force: true });\n}\n`,
    `${HEAD}export function seen(id: string) {\n  const dir = path.join(runsDir(), id);\n  const file = path.join(dir, 'x');\n  return fs.statSync(file);\n}\n`,
    `${HEAD}export function later(id: string) {\n  let at = '';\n  at = path.join(inboxDir(), id);\n  fs.rmSync(at);\n}\n`,
  ],
  returns: [
    `${HEAD}const dirOf = (id: string) => path.join(runsDir(), id);\nexport const make = (id: string) => fs.mkdirSync(dirOf(id));\n`,
    `${HEAD}function dirOf(id: string) {\n  return path.join(inboxDir(), id);\n}\nexport const has = (id: string) => fs.existsSync(dirOf(id));\n`,
  ],
  named: [
    "import { readdirSync as list } from 'node:fs';\nimport { runsDir } from '../record/record.store.ts';\nlist(runsDir());\n",
    "import { rmSync } from 'node:fs';\nimport { inboxDir } from '../record/files.store.ts';\nrmSync(inboxDir());\n",
  ],
  wrappers: [
    "import path from 'node:path';\nimport { lstatOf, runsDir } from '../record/record.store.ts';\nlstatOf(path.join(runsDir(), id, 'artifacts'));\n",
  ],
  targets: [
    `${HEAD}fs.copyFileSync(given, path.join(runsDir(), id, 'inputs', 'notes.md'), fs.constants.COPYFILE_EXCL);\n`,
    "import fsp from 'node:fs/promises';\nimport { inboxDir } from '../record/files.store.ts';\nawait fsp.rename(draft, inboxDir());\n",
  ],
};

/** Texts that name the store's folders and hand `fs` none of them: each passes. */
const PASSING = [
  `${HEAD}throw new Error(\`no run under \${runsDir()}\`);\n`,
  `${HEAD}fs.writeFileSync(file, \`the inbox is \${inboxDir()}\`);\n`,
  `${HEAD}import { workRoot } from '../record/places.store.ts';\n` +
    'export function started(id: string) {\n  const run = { id, workspace: workRoot(runsDir(), id) };\n  return run;\n}\n' +
    "export function copied(run: { id: string }) {\n  fs.mkdirSync(path.join('/elsewhere', run.id));\n}\n",
  `${HEAD}import { folderPlace } from '../record/places.store.ts';\nfolderPlace(runsDir()).make(run, plan, step);\n`,
  "import fsp from 'node:fs/promises';\nimport { runsDir } from './x.ts';\nconst dir = path.join(runsDir(), id);\nawait fsp.writeFile(file, dir);\n",
];

test('a fixture of each rule is one site with every rule on, over several lines too, naming its file, line and fix', () => {
  for (const fixture of [...PLAIN, ...Object.values(FIXTURES).flat()]) assert.equal(breaks(one(fixture), {}).length, 1, fixture);
  for (const fixture of PLAIN) assert.equal(breaks(one(fixture), {}, []).length, 1, `${fixture} with no rule`);
  assert.deepEqual(breaks(one(PLAIN[0]), {}), [`${AT}:4 hands fs.readdirSync a path under runsDir() or inboxDir(): ${FIX}`]);
  assert.match(breaks(one(FIXTURES.propagation[0]), {})[0], /^packages\/agent-orchestrator\/src\/new\/new\.verb\.ts:9 hands fs\.rmSync /);
});

test("texts that name the store's folders and hand fs none of them pass: a message, a content, another function's run, a place", () => {
  for (const text of PASSING) assert.deepEqual(breaks(one(text), {}), [], text);
});

test("the store's own two files may hand fs its folders", () => {
  for (const file of OWN) assert.deepEqual(breaks(one(PLAIN[0], file), {}), [], file);
  assert.equal(breaks(one(PLAIN[0], 'packages/agent-orchestrator/src/record/pause.store.ts'), {}).length, 1);
});

test('REFUSED: each rule does work — its fixtures are refused with it, and pass with it taken out', () => {
  for (const rule of RULES) {
    const others = RULES.filter((r) => r !== rule);
    for (const fixture of FIXTURES[rule]) {
      assert.equal(breaks(one(fixture), {}).length, 1, `${fixture} is refused with every rule on`);
      assert.deepEqual(breaks(one(fixture), {}, others), [], `${fixture} passes without ${rule}`);
    }
  }
});

const AGENTS = 'packages/agent-orchestrator/src/agents/agents.store.ts';
const AGENTS_TEXT =
  `${HEAD}export const agentFilesDir = (run: { id: string }, step: string) => path.join(runsDir(), run.id, 'agents', step);\n` +
  'export function render(run: { id: string }, step: string) {\n  const dir = agentFilesDir(run, step);\n  fs.mkdirSync(dir);\n}\n';

test('an exception lets its declarations through, and no other root of its file', () => {
  const excepted = { [AGENTS]: { through: ['agentFilesDir'], why: 'its own' } };
  assert.equal(breaks(one(AGENTS_TEXT, AGENTS), {}).length, 1, 'refused without the exception');
  assert.deepEqual(breaks(one(AGENTS_TEXT, AGENTS), excepted), []);
  assert.deepEqual(breaks(one(`${AGENTS_TEXT}fs.readdirSync(runsDir());\n`, AGENTS), excepted), [
    `${AGENTS}:9 hands fs.readdirSync a path under runsDir() or inboxDir(): ${FIX}`,
  ]);
});

test('REFUSED: an exception with no why, one through a name its file does not declare, one not needed, one for no file', () => {
  const texts = one(AGENTS_TEXT, AGENTS);
  assert.deepEqual(breaks(texts, { [AGENTS]: { through: ['agentFilesDir'], why: ' ' } }), [
    `${AGENTS}'s exception says no why: say why its paths reach fs outside runStore`,
  ]);
  assert.deepEqual(breaks(texts, { [AGENTS]: { through: ['agentFilesDir', 'nowhere'], why: 'its own' } }), [
    `${AGENTS}'s exception goes through nowhere, which it does not declare: name a declaration`,
  ]);
  const clean = `${HEAD}export const agentFilesDir = (run: { id: string }, step: string) => path.join(runsDir(), run.id, step);\n`;
  assert.deepEqual(breaks(one(clean, AGENTS), { [AGENTS]: { through: ['agentFilesDir'], why: 'its own' } }), [
    `${AGENTS} hands fs no path of the store's: take its exception off`,
  ]);
  assert.deepEqual(breaks(new Map(), { [AGENTS]: { through: [], why: 'its own' } }), [
    `${AGENTS} is excepted but is not read: where it moved, rename its entry; else take it off`,
  ]);
});

test("the scan reads the orchestrator's and the api's src, and no test nor file outside them", () => {
  const root = scratch('store-paths-');
  const files = [
    'packages/agent-orchestrator/src/a.ts',
    'packages/agent-orchestrator/src/a.test.ts',
    'packages/agent-orchestrator/test/t.ts',
    'packages/agent-runtime/src/r.ts',
    'apps/api/src/b.ts',
    'apps/api/src/test/c.ts',
    'apps/web/src/w.ts',
  ];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '');
  }
  assert.deepEqual(sourcesOf(root), ['apps/api/src/b.ts', 'packages/agent-orchestrator/src/a.ts']);
});

test("no file of the orchestrator's or the api's src hands fs a path of the store's folders, but its own and the exceptions", () => {
  const files = sourcesOf(ROOT);
  for (const file of [...OWN, 'packages/agent-orchestrator/src/forget/forget.verb.ts', 'apps/api/src/app.ts'])
    assert.ok(files.includes(file), `the scan reads ${file}, and a misrooted scan passes for nothing`);
  assert.deepEqual(breaks(new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]))), []);
});
