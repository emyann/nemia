/**
 * The measure of what a test file reaches outside its process, read by `stand-ins.test.ts`: a test is given a stand-in, and the real
 * thing is asked by name, in a file whose name ends `.boundary.test.ts` (`isBoundary`). Five kinds (`KINDS`), each read on the file's
 * syntax tree by the clauses of `CLAUSES`, so a call or an import split over lines is the same one and a word in a string is none:
 *
 * - **`git`**: a spawn whose command is git, or a shell line that runs it (`runsGit` of `git-spawns.ts`);
 * - **`process`**: an import, static, dynamic or bare, of a module of `STARTS`;
 * - **`place`**: the real place named, a value of `REAL_PLACE` bound from one of its modules, or any value from `place/git`;
 * - **`engine`**: the real engine named, `engine` of `REAL_ENGINE`, or `layer` called on the runtime's `Engine`;
 * - **`hand`**: an engine made by hand, `promised`, a tag of `ENGINE_TAGS` asked `of` or handed to a layer of `GIVERS` or to
 *   `provideService`, or an object literal said to be of a type of `ENGINE_TYPES`, by an assertion, an annotation or the return type
 *   of the function that returns it.
 *
 * A name is read through its binding (`bindingsOf`), never as a bare word: a static import, an `export … from`, and a dynamic import
 * destructured or kept whole. A module is named by its package or by its path from the repository root (`moduleOf`).
 *
 * A test inherits what its helpers reach (`reachOver`): each `.ts` file under a package's `test/` that is no test, reached by a
 * relative value import, and theirs in turn. No file of a `src`, of `place/` or of another package is followed. One helper is left
 * out by name (`EXEMPT`): `test/scratch.ts`, which every test imports and which imports `node:child_process` for the `ps` its reaper
 * falls back on, and for nothing a test asks of it.
 *
 * `JUDGED` says the kinds refused in each package: all five above the runtime, `git` and `process` in it, where the engine is the
 * package's own code. A boundary test earns its name by any of the five, judged in its package or not (`Reach.named`), so the
 * runtime's walk of its real engine is one. `reachBreaks` holds a measure to a baseline that only shrinks, `contractBreaks` holds each
 * stand-in of `STAND_INS` to the file that walks its contract on the real thing, and `takenBreaks` keeps a stand-in out of the tests
 * of the package that builds the real one. Run as a program, `node test/stand-ins.ts`, it prints the
 * baseline the repository measures.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { calleeName, calleeRoot, factsOf, runsGit, unwrapped, type FileFacts } from './git-spawns.ts';

const O = 'packages/agent-orchestrator';

/** The packages whose tests are read, each by its folder from the repository root. */
export const PACKAGES = ['packages/agent-runtime', O, 'apps/api'] as const;

/** What a test may reach outside its process, by kind. */
export const KINDS = ['git', 'process', 'place', 'engine', 'hand'] as const;
export type Kind = (typeof KINDS)[number];

/** The kinds refused in each package's tests. */
export const JUDGED: Readonly<Record<(typeof PACKAGES)[number], readonly Kind[]>> = {
  'packages/agent-runtime': ['git', 'process'],
  [O]: KINDS,
  'apps/api': KINDS,
};

/** How a test file's name ends when the real thing is its subject. */
export const BOUNDARY = '.boundary.test.ts';

/** Whether `file` says by its name that it is a boundary test: `<what>.boundary.test.ts`. */
export const isBoundary = (file: string): boolean => {
  const name = path.posix.basename(file);
  return name.endsWith(BOUNDARY) && name.length > BOUNDARY.length;
};

/** The package of `PACKAGES` a file is in. */
export const packageOf = (file: string): (typeof PACKAGES)[number] | undefined => PACKAGES.find((p) => file.startsWith(`${p}/`));

/** The modules that start a process or a thread. */
export const STARTS = ['node:child_process', 'child_process', 'node:worker_threads', 'worker_threads', 'node:cluster', 'cluster'];

/** Names watched in the modules that export them. */
type Names = { readonly modules: readonly string[]; readonly names: readonly string[] };

/** The orchestrator's public entry, by its package name and by its file. */
const ENTRY = ['agent-orchestrator', `${O}/src/runner.ts`];

/** The real place, as the package ships it. */
const REAL_PLACE: Names = {
  modules: [...ENTRY, `${O}/src/place/builtin.store.ts`],
  names: ['gitPlaceLayer', 'builtinGitPlace', 'builtin'],
};

/** The folder of the git place's code: any value of it is the real place. */
const GIT_PLACE = `${O}/place/git/`;

/** The real engine, as the client builds it. */
const REAL_ENGINE: Names = { modules: [...ENTRY, `${O}/src/runtime-client.ts`], names: ['engine'] };

const R = 'packages/agent-runtime';

/** The runtime's engine service, whose `layer` builds the real engine: by the package's name, and by its files for its own tests. */
const RUNTIME_ENGINE: Names = {
  modules: ['agent-runtime', `${R}/src/index.ts`, `${R}/src/service/index.ts`, `${R}/src/service/engine.ts`],
  names: ['Engine'],
};

/** The services an engine is given by: the runtime's, the orchestrator's and the api's. */
const ENGINE_TAGS: readonly Names[] = [
  RUNTIME_ENGINE,
  { modules: [...ENTRY, `${O}/src/runtime-client.ts`], names: ['EngineService'] },
  { modules: ['apps/api/src/store.ts'], names: ['Engine'] },
];

/** The engine's type, wherever it is exported. */
const ENGINE_TYPES: Names = {
  modules: ['agent-runtime', 'agent-runtime/vocabulary', ...ENTRY, `${O}/src/runtime-client.ts`],
  names: ['Engine', 'EngineShape'],
};

/** The helper that turns a test's hand fake into an engine. */
const PROMISED: Names = { modules: [`${O}/test/promised.ts`], names: ['promised'] };

/** The layer constructors that give a service an implementation. */
const GIVERS = ['succeed', 'sync', 'effect'];

/** The modules `Layer` is imported from. */
const LAYER: Names = { modules: ['effect', 'effect/Layer'], names: ['Layer', '*'] };

/** The helper no test inherits from, in each package: see the file's head. */
const EXEMPT = /^(?:packages|apps)\/[^/]+\/test\/scratch\.ts$/;

/** A helper of a package's tests: a `.ts` file under its `test/` that is no test. */
const HELPER = /^(?:packages|apps)\/[^/]+\/test\/.+\.ts$/;

/** One name an import binds: the module's name for it (`*` for the whole module), and the local name where it has one. */
type Named = { readonly name: string; readonly local: string | undefined; readonly typeOnly: boolean };

/** One import of a file, static, dynamic, bare or an `export … from`: its module, and the names it binds, none where it is bare. */
export type Import = { readonly module: string; readonly names: readonly Named[]; readonly typeOnly: boolean };

/** What a local name of a file is bound to. */
export type Bound = { readonly module: string; readonly name: string; readonly typeOnly: boolean };

/** `spec` as imported by `file`: a package's name as it is, a relative path as a path from the repository root. */
export const moduleOf = (file: string, spec: string): string =>
  spec.startsWith('.') ? path.posix.join(path.posix.dirname(file), spec) : spec;

/** The name of a binding or specifier element, where it is a plain one. */
const textOf = (node: ts.Node | undefined): string | undefined =>
  node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : undefined;

/** The names an import clause binds. */
function clauseNames(clause: ts.ImportClause | undefined): Named[] {
  if (!clause) return [];
  const names: Named[] = clause.name ? [{ name: 'default', local: clause.name.text, typeOnly: false }] : [];
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push({ name: '*', local: bindings.name.text, typeOnly: false });
  if (bindings && ts.isNamedImports(bindings))
    for (const e of bindings.elements)
      names.push({ name: textOf(e.propertyName) ?? e.name.text, local: e.name.text, typeOnly: e.isTypeOnly });
  return names;
}

/** The names an `export … from` hands on: none of them local. */
function exportNames(clause: ts.NamedExportBindings | undefined): Named[] {
  if (!clause) return [];
  if (ts.isNamespaceExport(clause)) return [{ name: '*', local: undefined, typeOnly: false }];
  return clause.elements.map((e) => ({ name: textOf(e.propertyName) ?? textOf(e.name) ?? '', local: undefined, typeOnly: e.isTypeOnly }));
}

/** The names a dynamic import binds where its answer is declared: a destructuring's, or the whole module under one name. */
function dynamicNames(call: ts.CallExpression): Named[] {
  let at: ts.Node = call;
  while (ts.isAwaitExpression(at.parent) || ts.isParenthesizedExpression(at.parent)) at = at.parent;
  const declared = at.parent;
  if (!ts.isVariableDeclaration(declared) || declared.initializer !== at) return [];
  if (ts.isIdentifier(declared.name)) return [{ name: '*', local: declared.name.text, typeOnly: false }];
  if (!ts.isObjectBindingPattern(declared.name)) return [];
  return declared.name.elements.map((e) => ({
    name: textOf(e.propertyName) ?? textOf(e.name) ?? '',
    local: textOf(e.name),
    typeOnly: false,
  }));
}

/** The import `node` is, in `file`: a static one, an `export … from`, or a dynamic one of a module written there. */
function importOf(node: ts.Node, file: string): Import | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const clause = node.importClause;
    return { module: moduleOf(file, node.moduleSpecifier.text), names: clauseNames(clause), typeOnly: clause?.isTypeOnly ?? false };
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
    return { module: moduleOf(file, node.moduleSpecifier.text), names: exportNames(node.exportClause), typeOnly: node.isTypeOnly };
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const spec = node.arguments[0];
    if (spec && ts.isStringLiteralLike(spec)) return { module: moduleOf(file, spec.text), names: dynamicNames(node), typeOnly: false };
  }
  return undefined;
}

/** Whether an import loads its module when the file runs: it is no type's alone. */
const loads = (one: Import): boolean => !one.typeOnly && (one.names.length === 0 || one.names.some((n) => !n.typeOnly));

/** What a clause reads of a file beside a node: its imports by their node, its bindings, and its string `const`s. */
export type Read = {
  readonly file: string;
  readonly imports: ReadonlyMap<ts.Node, Import>;
  readonly bindings: ReadonlyMap<string, Bound>;
  readonly facts: FileFacts;
};

/** `text` parsed as the TypeScript of `file`. */
const parsed = (file: string, text: string): ts.SourceFile =>
  ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Every import of `source`, by its node. */
function importsOf(file: string, source: ts.SourceFile): Map<ts.Node, Import> {
  const imports = new Map<ts.Node, Import>();
  const visit = (node: ts.Node): void => {
    const one = importOf(node, file);
    if (one) imports.set(node, one);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

/** What each local name `text` imports is bound to, in `file`. */
export function bindingsOf(file: string, text: string): Map<string, Bound> {
  return boundBy(importsOf(file, parsed(file, text)).values());
}

/** The bindings `imports` make. */
function boundBy(imports: Iterable<Import>): Map<string, Bound> {
  const bindings = new Map<string, Bound>();
  for (const one of imports)
    for (const n of one.names)
      if (n.local !== undefined) bindings.set(n.local, { module: one.module, name: n.name, typeOnly: one.typeOnly || n.typeOnly });
  return bindings;
}

/** What a value expression names: an identifier's binding, or a member of a module bound whole. */
function refOf(node: ts.Expression, read: Read): Bound | undefined {
  const at = unwrapped(node);
  if (ts.isIdentifier(at)) return read.bindings.get(at.text);
  if (!ts.isPropertyAccessExpression(at)) return undefined;
  const whole = unwrapped(at.expression);
  const bound = ts.isIdentifier(whole) ? read.bindings.get(whole.text) : undefined;
  return bound?.name === '*' ? { ...bound, name: at.name.text } : undefined;
}

/** What a type names: a reference's binding, or a member of a module bound whole. */
function typeRefOf(node: ts.TypeNode | undefined, read: Read): Bound | undefined {
  if (!node || !ts.isTypeReferenceNode(node)) return undefined;
  const name = node.typeName;
  if (ts.isIdentifier(name)) return read.bindings.get(name.text);
  const bound = ts.isIdentifier(name.left) ? read.bindings.get(name.left.text) : undefined;
  return bound?.name === '*' ? { ...bound, name: name.right.text } : undefined;
}

/** Whether `bound` is one of `watched`'s names from one of its modules. */
const isOf = (bound: Bound | undefined, watched: Names): boolean =>
  bound !== undefined && watched.modules.includes(bound.module) && watched.names.includes(bound.name);

/** Whether `bound` is a value of `watched`. */
const valueOf = (bound: Bound | undefined, watched: Names): boolean => isOf(bound, watched) && !bound?.typeOnly;

/** Whether `node` binds a value of `watched`: an import that names one, or a member read of its module bound whole. */
function bindsValue(node: ts.Node, read: Read, watched: Names): boolean {
  const one = read.imports.get(node);
  if (one)
    return !one.typeOnly && watched.modules.includes(one.module) && one.names.some((n) => !n.typeOnly && watched.names.includes(n.name));
  return ts.isPropertyAccessExpression(node) && valueOf(refOf(node, read), watched);
}

/** The service `call` is called on by the member `member`: `X` of `X.member(…)`. */
function calledOn(call: ts.Node, member: string, read: Read): Bound | undefined {
  if (!ts.isCallExpression(call)) return undefined;
  const callee = unwrapped(call.expression);
  return ts.isPropertyAccessExpression(callee) && callee.name.text === member ? refOf(callee.expression, read) : undefined;
}

/** Whether `call` gives a service its implementation: a layer of `GIVERS`, or `provideService`. */
function gives(call: ts.CallExpression, read: Read): boolean {
  const name = calleeName(call) ?? '';
  if (name === 'provideService') return true;
  const root = calleeRoot(call);
  return GIVERS.includes(name) && root !== undefined && isOf(read.bindings.get(root), LAYER);
}

/** A value said to be of a type. */
type Typed = { readonly value: ts.Expression; readonly type: ts.TypeNode };

/** What a function's body returns: an arrow's expression, or the value of each `return` of its block, a function inside it left out. */
function returnedBy(body: ts.Node): ts.Expression[] {
  if (!ts.isBlock(body)) return ts.isExpression(body) ? [body] : [];
  const values: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) values.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return values;
}

/**
 * The values `node` says are of a type, each with that type: an assertion's, a declaration's under its annotation, and what a function
 * returns under its return type.
 */
function typed(node: ts.Node): Typed[] {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return [{ value: node.expression, type: node.type }];
  if (ts.isVariableDeclaration(node) && node.type && node.initializer) return [{ value: node.initializer, type: node.type }];
  const type = ts.isFunctionLike(node) ? node.type : undefined;
  const body = ts.isFunctionLike(node) && 'body' in node ? node.body : undefined;
  return type && body ? returnedBy(body).map((value) => ({ value, type })) : [];
}

/** The argument of a call that gives a service which names the service: the first, or the second where the program comes first. */
const tagGiven = (call: ts.CallExpression): ts.Expression | undefined =>
  calleeName(call) === 'provideService' && call.arguments.length === 3 ? call.arguments[1] : call.arguments[0];

/** One clause of the rule: its name, the kind it measures, and whether a node of a file is a site of it. */
export type Clause = { readonly name: string; readonly kind: Kind; readonly matches: (node: ts.Node, read: Read) => boolean };

/** The clauses of the rule, each of which a test takes out to show it does work. */
export const CLAUSES: readonly Clause[] = [
  { name: 'git-spawn', kind: 'git', matches: (node, read) => ts.isCallExpression(node) && runsGit(node, read.facts) },
  {
    name: 'starts',
    kind: 'process',
    matches: (node, read) => {
      const one = read.imports.get(node);
      return one !== undefined && STARTS.includes(one.module) && loads(one);
    },
  },
  { name: 'real-place', kind: 'place', matches: (node, read) => bindsValue(node, read, REAL_PLACE) },
  {
    name: 'git-place',
    kind: 'place',
    matches: (node, read) => {
      const one = read.imports.get(node);
      return one !== undefined && one.module.startsWith(GIT_PLACE) && loads(one);
    },
  },
  { name: 'real-engine', kind: 'engine', matches: (node, read) => bindsValue(node, read, REAL_ENGINE) },
  { name: 'engine-layer', kind: 'engine', matches: (node, read) => valueOf(calledOn(node, 'layer', read), RUNTIME_ENGINE) },
  { name: 'promised', kind: 'hand', matches: (node, read) => bindsValue(node, read, PROMISED) },
  {
    name: 'engine-of',
    kind: 'hand',
    matches: (node, read) => ENGINE_TAGS.some((tag) => valueOf(calledOn(node, 'of', read), tag)),
  },
  {
    name: 'engine-given',
    kind: 'hand',
    matches: (node, read) => {
      const named = ts.isCallExpression(node) && gives(node, read) ? tagGiven(node) : undefined;
      const given = named && refOf(named, read);
      return ENGINE_TAGS.some((tag) => valueOf(given || undefined, tag));
    },
  },
  {
    name: 'engine-literal',
    kind: 'hand',
    matches: (node, read) => {
      return typed(node).some(
        (said) => ts.isObjectLiteralExpression(unwrapped(said.value)) && isOf(typeRefOf(said.type, read), ENGINE_TYPES),
      );
    },
  },
];

/** One site of a clause in a file. */
export type Site = { readonly kind: Kind; readonly clause: string; readonly line: number };

/** What `reachIn` reads of one file: its own sites, and the modules it loads. */
type Own = { readonly sites: readonly Site[]; readonly loaded: readonly string[] };

/** A file's own sites under `clauses`, and the modules it loads when it runs. */
function ownOf(file: string, text: string, clauses: readonly Clause[]): Own {
  const source = parsed(file, text);
  const imports = importsOf(file, source);
  const read: Read = { file, imports, bindings: boundBy(imports.values()), facts: factsOf(source) };
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    for (const clause of clauses)
      if (clause.matches(node, read))
        sites.push({ kind: clause.kind, clause: clause.name, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { sites, loaded: [...imports.values()].filter(loads).map((one) => one.module) };
}

/** Each site of `text` itself, the file `file`, under `clauses`: its helpers are not read. */
export const reachIn = (file: string, text: string, clauses: readonly Clause[] = CLAUSES): Site[] => [...ownOf(file, text, clauses).sites];

/** Whether a module is a helper a test inherits from. */
const isHelper = (module: string): boolean => HELPER.test(module) && !module.endsWith('.test.ts') && !EXEMPT.test(module);

/** A site, with the file that holds it. */
export type Located = Site & { readonly file: string };

/**
 * What a test file reaches: the kinds judged in its package, in the order of `KINDS`, each site of them, its own or a helper's, and
 * every kind it names, judged there or not (`named`).
 */
export type Reach = { readonly kinds: readonly Kind[]; readonly sites: readonly Located[]; readonly named: readonly Kind[] };

/** How a measure is taken: under which clauses, and whether helpers are followed. */
export type Measuring = { readonly clauses?: readonly Clause[]; readonly follow?: boolean };

/**
 * The measure of any file over `read`, which answers a file's text by its path from the repository root, or `undefined` where there
 * is none: the file's own sites and those of every helper it reaches, each file read once, kept to the kinds judged in its package.
 */
export function reachOver(read: (file: string) => string | undefined, { clauses = CLAUSES, follow = true }: Measuring = {}) {
  const known = new Map<string, Own | undefined>();
  const own = (file: string): Own | undefined => {
    if (!known.has(file)) {
      const text = read(file);
      known.set(file, text === undefined ? undefined : ownOf(file, text, clauses));
    }
    return known.get(file);
  };
  return (file: string): Reach => {
    const judged = JUDGED[packageOf(file) ?? O];
    const seen = new Set<string>();
    const every: Located[] = [];
    const visit = (at: string): void => {
      if (seen.has(at)) return;
      seen.add(at);
      const one = own(at);
      if (!one) return;
      every.push(...one.sites.map((s) => ({ ...s, file: at })));
      if (follow) one.loaded.filter(isHelper).forEach(visit);
    };
    visit(file);
    const sites = every.filter((s) => judged.includes(s.kind));
    const kindsIn = (found: readonly Located[]): Kind[] => KINDS.filter((kind) => found.some((s) => s.kind === kind));
    return { kinds: kindsIn(sites), sites, named: kindsIn(every) };
  };
}

/** What `file` reaches, its helpers followed: see `reachOver`. */
export const reachOf = (file: string, read: (file: string) => string | undefined, how: Measuring = {}): Reach => reachOver(read, how)(file);

/** The `.test.ts` files under `dir` of `root`, in its folders too where `deep`, by their path from `root`. */
function testsIn(root: string, dir: string, deep: boolean): string[] {
  const at = path.join(root, dir);
  if (!fs.existsSync(at)) return [];
  return fs
    .readdirSync(at, { recursive: deep, encoding: 'utf8' })
    .map((f) => `${dir}/${f.split(path.sep).join('/')}`)
    .filter((f) => f.endsWith('.test.ts'));
}

/** Every test file the three packages' `test` scripts load, under `root`: `test/*.test.ts` and `src/**\/*.test.ts`, by path, sorted. */
export const testFilesOf = (root: string): string[] =>
  PACKAGES.flatMap((pkg) => [...testsIn(root, `${pkg}/test`, false), ...testsIn(root, `${pkg}/src`, true)]).sort();

/** Each listed test file, by its path from the repository root, with the kinds it reaches. */
export type Baseline = Readonly<Record<string, readonly Kind[]>>;

/** What a test file that reaches the real thing is told to do. */
export const FIX =
  'give the test a stand-in, by the line `const stand = eachTest(testPlace);` for a place and `const engine = eachTest(testEngine);` ' +
  'for an engine (test/placed.ts; testEngine of agent-runtime/testing); where the real thing is its whole ' +
  'subject, or the stand-in does not model what it needs, write it in a file named <what>.boundary.test.ts; never add it to ' +
  'test/stand-ins.baseline.ts, which only shrinks';

/** Where `reach` reaches `kind` first, as `file:line`. */
const whereOf = (reach: Reach, kind: Kind): string => {
  const site = reach.sites.find((s) => s.kind === kind);
  return site ? `${site.file}:${site.line}` : 'nowhere';
};

/** What a file that is no boundary test reaches past its entry, each a sentence. */
function newReach(file: string, reach: Reach, listed: readonly Kind[] | undefined): string[] {
  return reach.kinds
    .filter((kind) => !listed?.includes(kind))
    .map((kind) =>
      listed
        ? `${file} reaches ${kind} (${whereOf(reach, kind)}), which its entry does not list: an entry gains no kind; ${FIX}`
        : `${file} reaches ${kind} (${whereOf(reach, kind)}) and is no boundary test: ${FIX}`,
    );
}

/** What an entry of the baseline holds that the measure does not, as a sentence naming the fix. */
function looseEntry(file: string, listed: readonly Kind[], reach: Reach | undefined, exists: (file: string) => boolean): string[] {
  if (!reach || !exists(file)) return [`${file} is on the baseline but is not on disk: where it moved, rename its entry; else take it off`];
  if (isBoundary(file)) return [`${file} is a boundary test, which is refused nothing: delete its entry from the baseline`];
  if (!reach.kinds.length) return [`${file} reaches nothing real any more: delete its entry from the baseline`];
  const unknown = listed.filter((kind) => !KINDS.includes(kind));
  const gone = listed.filter((kind) => KINDS.includes(kind) && !reach.kinds.includes(kind));
  return [
    ...unknown.map((kind) => `${file}'s entry lists ${kind}, which is no kind: one of ${KINDS.join(', ')}`),
    ...gone.map((kind) => `${file} no longer reaches ${kind}: take ${kind} off its entry`),
  ];
}

/**
 * What a measure and its baseline disagree on, each a sentence naming the fix: a file that reaches the real thing with no entry, a
 * kind its entry lacks, a listed kind no longer measured, an entry for a file gone, clean or carrying the boundary name, and a
 * boundary test that reaches nothing real.
 */
export function reachBreaks(measured: ReadonlyMap<string, Reach>, baseline: Baseline, exists: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const [file, reach] of measured) {
    if (!isBoundary(file)) out.push(...newReach(file, reach, baseline[file]));
    else if (!reach.named.length)
      out.push(`${file} is named a boundary test and reaches nothing real: drop ${BOUNDARY.slice(0, -8)} from its name`);
  }
  for (const [file, listed] of Object.entries(baseline)) out.push(...looseEntry(file, listed, measured.get(file), exists));
  return out;
}

/** How many entries and kinds a baseline holds, by package and by kind. */
export type Sizes = {
  readonly entries: number;
  readonly kinds: number;
  readonly byPackage: Readonly<Record<string, number>>;
  readonly byKind: Readonly<Record<string, number>>;
  readonly byPackageAndKind: Readonly<Record<string, Readonly<Record<string, number>>>>;
};

/** The sizes of `baseline`: its entries by package, its listed kinds by kind, and both together. */
export function sizes(baseline: Baseline): Sizes {
  const count = <A>(items: readonly A[], keyOf: (item: A) => string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1;
    return counts;
  };
  const entries = Object.entries(baseline);
  const listed = entries.flatMap(([file, kinds]) => kinds.map((kind) => ({ pkg: packageOf(file) ?? 'elsewhere', kind })));
  return {
    entries: entries.length,
    kinds: listed.length,
    byPackage: count(entries, ([file]) => packageOf(file) ?? 'elsewhere'),
    byKind: count(listed, (one) => one.kind),
    byPackageAndKind: Object.fromEntries(
      [...new Set(listed.map((one) => one.pkg))].map((pkg) => [
        pkg,
        count(
          listed.filter((one) => one.pkg === pkg),
          (one) => one.kind,
        ),
      ]),
    ),
  };
}

/** The baseline a measure writes: each file that is no boundary test and reaches a kind, sorted by path. */
export const baselineOf = (measured: ReadonlyMap<string, Reach>): Baseline =>
  Object.fromEntries(
    [...measured]
      .filter(([file, reach]) => !isBoundary(file) && reach.kinds.length)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, reach]) => [file, reach.kinds]),
  );

/**
 * A stand-in the packages hold, and the contract it owes: the folder of its code, the name that makes one and the modules a test
 * imports it from, the table of walks both sides run with the function that tells them, the test file that runs them on the
 * stand-in, the boundary test that runs them on the real thing, and the kind that real thing is. `home`, where it has one, is the
 * package whose own tests build the real thing (`build`), and name the stand-in in its contract's files alone.
 */
export type StandIn = {
  readonly name: string;
  readonly folder: string;
  readonly made: string;
  readonly from: readonly string[];
  readonly home?: { readonly package: string; readonly build: string };
  readonly walks: { readonly file: string; readonly told: string };
  readonly own: string;
  readonly real: string;
  readonly kind: Kind;
};

/** Each stand-in the packages hold. */
export const STAND_INS: readonly StandIn[] = [
  {
    name: 'the test place',
    folder: `${O}/place/memory`,
    made: 'testPlace',
    from: ['agent-orchestrator/testing', `${O}/place/memory`, `${O}/place/memory/index.ts`],
    walks: { file: `${O}/test/place-walks.ts`, told: 'walksOn' },
    own: `${O}/test/place-contract.test.ts`,
    real: `${O}/test/git-place.boundary.test.ts`,
    kind: 'place',
  },
  {
    name: 'the test engine',
    folder: `${R}/src/service`,
    made: 'testEngine',
    from: ['agent-runtime/testing', `${R}/src/testing.ts`, `${R}/src/service/index.ts`, `${R}/src/service/test-engine.ts`],
    home: { package: R, build: 'Engine.layer(…)' },
    walks: { file: `${R}/test/engine-walks.ts`, told: 'walksOn' },
    own: `${R}/test/engine-contract.test.ts`,
    real: `${R}/test/engine-contract.boundary.test.ts`,
    kind: 'engine',
  },
];

/** The folder that holds the places, and the one of them that is the real thing. */
export const PLACES = { folder: `${O}/place`, real: 'git' };

/** The folders of `folders`, each a place's under `PLACES.folder`, that are neither the real one nor a stand-in of `standIns`. */
export const unlisted = (folders: readonly string[], standIns: readonly StandIn[] = STAND_INS): string[] =>
  folders.filter((name) => name !== PLACES.real && !standIns.some((s) => s.folder === `${PLACES.folder}/${name}`));

/** Whether a statement declares one test for every walk told: `for (const [name, walk] of told(…)) test(name, walk);`. */
function walksAll(statement: ts.Statement, told: ts.CallExpression, read: Read): boolean {
  if (!ts.isForOfStatement(statement) || unwrapped(statement.expression) !== told) return false;
  const declared = ts.isVariableDeclarationList(statement.initializer) ? statement.initializer.declarations[0]?.name : undefined;
  if (!declared || !ts.isArrayBindingPattern(declared) || declared.elements.length !== 2) return false;
  const names = declared.elements.map((e) => (ts.isBindingElement(e) ? textOf(e.name) : undefined));
  const body =
    ts.isBlock(statement.statement) && statement.statement.statements.length === 1
      ? statement.statement.statements[0]
      : statement.statement;
  if (!ts.isExpressionStatement(body) || !ts.isCallExpression(body.expression)) return false;
  const call = body.expression;
  const test = refOf(call.expression, read);
  return (
    test?.module === 'node:test' &&
    test.name === 'test' &&
    call.arguments.length === 2 &&
    call.arguments.every((arg, i) => ts.isIdentifier(arg) && arg.text === names[i])
  );
}

/** Why the file `file` does not run every walk of `standIn`, as a sentence; `undefined` where it does. */
function sideBreak(standIn: StandIn, file: string, text: string): string | undefined {
  const source = parsed(file, text);
  const imports = importsOf(file, source);
  const read: Read = { file, imports, bindings: boundBy(imports.values()), facts: factsOf(source) };
  const walks: Names = { modules: [standIn.walks.file], names: [standIn.walks.told] };
  const tellings: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && valueOf(refOf(node.expression, read), walks)) tellings.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const how = `for (const [name, walk] of ${standIn.walks.told}(…)) test(name, walk);`;
  if (tellings.length !== 1)
    return `${file} asks ${standIn.walks.told} of ${standIn.walks.file} ${tellings.length} times, not once: ${how}`;
  if (!source.statements.some((statement) => walksAll(statement, tellings[0], read)))
    return `${file} walks a subset of ${standIn.walks.file}: every walk is a test, declared at the file's top by \`${how}\``;
  return undefined;
}

/**
 * What `standIn` owes and does not hold, each a sentence naming the fix, over `read`, which answers a file's text or `undefined`: a
 * side that is missing, a real side whose name is no boundary name or that does not reach the real thing, a side of its own that
 * does not make the stand-in, and a side that walks a subset.
 */
export function contractBreaks(standIn: StandIn, read: (file: string) => string | undefined): string[] {
  const out: string[] = [];
  const side = (file: string, what: string): string | undefined => {
    const text = read(file);
    if (text === undefined) out.push(`${standIn.name} has no ${what}: ${file} is missing, and a stand-in without its contract is refused`);
    else out.push(...[sideBreak(standIn, file, text)].filter((said) => said !== undefined));
    return text;
  };
  const own = side(standIn.own, 'walk of its contract on the stand-in');
  const real = side(standIn.real, 'walk of its contract on the real thing');
  if (!isBoundary(standIn.real)) out.push(`${standIn.real} walks the real thing and is no boundary test: name it <what>${BOUNDARY}`);
  if (real !== undefined && !reachIn(standIn.real, real).some((site) => site.kind === standIn.kind))
    out.push(`${standIn.real} is ${standIn.name}'s real side and names no real ${standIn.kind}: walk the real thing there`);
  if (own !== undefined && !takes(standIn, standIn.own, own))
    out.push(
      `${standIn.own} is ${standIn.name}'s own side and does not import ${standIn.made} of ${standIn.folder}: walk the stand-in there`,
    );
  return out;
}

/** Whether the text `text` of `file` binds the value that makes `standIn`, from one of the modules a test imports it from. */
const takes = (standIn: StandIn, file: string, text: string): boolean =>
  [...bindingsOf(file, text).values()].some((bound) => valueOf(bound, { modules: standIn.from, names: [standIn.made] }));

/**
 * Why `file`, a test or a helper of tests, may not take a stand-in it takes, each a sentence naming the fix: a file of the package
 * that builds the real thing (`home`) tests the real one, and only the files of the stand-in's contract name it there.
 */
export function takenBreaks(file: string, text: string, standIns: readonly StandIn[] = STAND_INS): string[] {
  return standIns
    .filter((s) => s.home !== undefined && file.startsWith(`${s.home.package}/`) && ![s.own, s.real, s.walks.file].includes(file))
    .filter((s) => takes(s, file, text))
    .map(
      (s) =>
        `${file} takes ${s.made}, the stand-in of what ${s.home?.package} builds itself: build the real one there, ${s.home?.build}; ` +
        `only its contract names ${s.made} (${s.own}, ${s.real})`,
    );
}

/** Every file of tests under `root` that `takenBreaks` reads: each test file, and each helper flat in a package's `test/`. */
export const testAndHelperFilesOf = (root: string): string[] =>
  [
    ...testFilesOf(root),
    ...PACKAGES.flatMap((pkg) =>
      fs.existsSync(path.join(root, pkg, 'test'))
        ? fs
            .readdirSync(path.join(root, pkg, 'test'))
            .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
            .map((f) => `${pkg}/test/${f}`)
        : [],
    ),
  ].sort();

/** The measure of every test file under `root`, by its path. */
export function measureOf(root: string): Map<string, Reach> {
  const texts = new Map<string, string | undefined>();
  const read = (file: string): string | undefined => {
    if (!texts.has(file))
      texts.set(file, fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : undefined);
    return texts.get(file);
  };
  const reach = reachOver(read);
  return new Map(testFilesOf(root).map((file) => [file, reach(file)]));
}

/** The source of the baseline file a measure writes, one line a test file. */
export const baselineSource = (baseline: Baseline): string =>
  [
    '/**',
    ' * The test files that reach the real thing and are no boundary test, each by its path from the repository root with the kinds it',
    ' * reaches (`stand-ins.ts`): what was there when the rule landed, held by `stand-ins.test.ts`. It only shrinks: a test moved onto a',
    ' * stand-in, or into a boundary file, takes its line away. Written by the measure, `node test/stand-ins.ts`, never typed.',
    ' */',
    "import type { Baseline } from './stand-ins.ts';",
    '',
    '/** Each listed test file and the kinds it reaches. */',
    'export const REAL_REACH: Baseline = {',
    ...Object.entries(baseline).map(([file, kinds]) => `  '${file}': [${kinds.map((kind) => `'${kind}'`).join(', ')}],`),
    '};',
    '',
  ].join('\n');

if (process.argv[1] === import.meta.filename) {
  const baseline = baselineOf(measureOf(path.join(import.meta.dirname, '..', '..', '..')));
  process.stdout.write(baselineSource(baseline));
  process.stderr.write(`${JSON.stringify(sizes(baseline), null, 2)}\n`);
}
