/**
 * No export of the board's `src` is dead: each name a file of `src` exports — a value, a type or an interface — is imported by another
 * file of `src`, `test`, `.storybook` or `contracts` (or `vite.config.ts`), else it is refused (`deadExports`). A name used only in its
 * own file is unexported there, and one used nowhere is deleted.
 *
 * What counts as an import of a name: a named import (`import { a as b }`, its original name), a default import, a namespace import
 * (`import * as ns`, each `ns.name` it reads, or every name when `ns` is passed whole), a dynamic `import()` (the names an object
 * pattern takes from it, each `ns.name` of the binding it is awaited into, or every name when it is read whole) and an import type
 * (`import('…').Name`, or every name for `typeof import('…')`). A door re-exports: `export { a } from` is an export of the door, judged
 * as one, whose use is a use of the name where it is declared; `export *` and `export type *` hand every name of their module on and
 * are not judged at the door, so a name reached through one is used when some file imports it through the door or from its own file. A
 * module read whole through `export type *` (`Object.keys` of the api's door, say) has its types read and none of its values. The doors
 * of `OFFERED` are read whole.
 *
 * Exempt (`exempt`): the vendored folders `components/ui/` (shadcn's, with the kit under `ui/ds/`) and `components/ai-elements/`, kept
 * as shipped, whose unused parts are the vendor's; a story's exports, which Storybook reads by its glob; `main.tsx`, the page's entry
 * that nothing imports; `routeTree.gen.ts`, written by TanStack's plugin; a route file's `Route`, which the plugin reads by name; and a
 * type the board's glossary table names (`glossary.json`), which the docs' tests require its workspace to export.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolved } from 'test-kit/imports';
import ts from 'typescript';

const WEB = path.join(import.meta.dirname, '..');

/** The folders whose files import the source, as named from `apps/web`, and the one file beside them that does. */
const IMPORTERS = ['src', 'test', '.storybook', 'contracts'];
const CONFIG = 'vite.config.ts';

/**
 * The doors read whole, as if a file imported every name they hand on: the look's door offers each part of the look, used yet or not,
 * as change-the-board's item 9 names them for a page to take.
 */
const OFFERED = ['src/components/look/index.ts'];

/** The types the board's glossary table names, each of which the docs' tests require `src` to export. */
const GLOSSARY_TYPES = new Set(
  (JSON.parse(fs.readFileSync(path.join(WEB, 'glossary.json'), 'utf8')) as { terms: Array<{ type?: string }> }).terms.flatMap((t) =>
    t.type ? [t.type] : [],
  ),
);

/** Whether an export of `file` named `name` is spared the guard (the module's comment says why for each). */
const exempt = (file: string, name: string): boolean =>
  GLOSSARY_TYPES.has(name) ||
  file.startsWith('src/components/ui/') ||
  file.startsWith('src/components/ai-elements/') ||
  file.endsWith('.stories.tsx') ||
  file === 'src/main.tsx' ||
  file === 'src/routeTree.gen.ts' ||
  (file.startsWith('src/routes/') && name === 'Route');

/** Every `.ts` and `.tsx` file under the importers, by its path from `apps/web`, with its text. */
function treeTexts(): Map<string, string> {
  const files = IMPORTERS.flatMap((dir) =>
    fs.readdirSync(path.join(WEB, dir), { recursive: true, encoding: 'utf8' }).map((f) => `${dir}/${f.split(path.sep).join('/')}`),
  )
    .filter((f) => /\.tsx?$/.test(f))
    .concat(CONFIG)
    .sort();
  return new Map(files.map((f) => [f, fs.readFileSync(path.join(WEB, f), 'utf8')]));
}

/** The file of `texts` a specifier in `file` names: `@/` is `src/`, a relative path is read from `file`, an extension may be left off. */
function target(texts: ReadonlyMap<string, string>, file: string, spec: string): string | undefined {
  const base = spec.startsWith('@/') ? `src/${spec.slice(2)}` : resolved(file, spec);
  if (base === undefined) return undefined;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((f) => texts.has(f));
}

/** Whether a node carries the `export` keyword. */
const exported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** A name read off a module: `'*'` stands for every name it has, `'*type'` for every type it declares. */
type Use = { file: string; name: string };

/**
 * What one file says about modules: the names it declares as exports (those of a type or an interface again under `types`), the names it
 * re-exports, the modules it re-exports every name of (`typeOnly` for `export type *`), and the names it reads off other modules.
 */
type Facts = {
  declared: string[];
  types: string[];
  forwarded: { name: string; from: string; as: string }[];
  stars: { from: string; typeOnly: boolean }[];
  uses: Use[];
};

/** Every name bound by a declaration's name, a destructured `const` included. */
const boundNames = (name: ts.BindingName): string[] =>
  ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : boundNames(e.name)));

/** The names `binding` reads off a namespace in `sf`: each `binding.name`, or every name when the binding is read whole. */
function namespaceReads(sf: ts.SourceFile, binding: ts.Identifier): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node !== binding && node.text === binding.text) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) names.push(parent.name.text);
      else if (ts.isQualifiedName(parent) && parent.left === node) names.push(parent.right.text);
      else if (!(ts.isPropertyAccessExpression(parent) && parent.name === node)) names.push('*');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** What `file` declares, re-exports and imports, read by TypeScript's parser; a specifier outside `texts` is a package and is let be. */
function factsOf(texts: ReadonlyMap<string, string>, file: string): Facts {
  const sf = ts.createSourceFile(
    file,
    texts.get(file) ?? '',
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const facts: Facts = { declared: [], types: [], forwarded: [], stars: [], uses: [] };
  const to = (spec: ts.Expression | undefined): string | undefined =>
    spec !== undefined && ts.isStringLiteral(spec) ? target(texts, file, spec.text) : undefined;
  const use = (from: string | undefined, names: string[]): void => {
    if (from !== undefined) for (const name of names) facts.uses.push({ file: from, name });
  };
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = to(statement.moduleSpecifier);
      const clause = statement.importClause;
      if (clause?.name) use(from, ['default']);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) use(from, namespaceReads(sf, bindings.name));
      if (bindings && ts.isNamedImports(bindings))
        use(
          from,
          bindings.elements.map((e) => (e.propertyName ?? e.name).text),
        );
    } else if (ts.isExportDeclaration(statement)) {
      const from = to(statement.moduleSpecifier);
      const clause = statement.exportClause;
      if (statement.moduleSpecifier === undefined && clause && ts.isNamedExports(clause))
        facts.declared.push(...clause.elements.map((e) => e.name.text));
      else if (from !== undefined && clause === undefined) facts.stars.push({ from, typeOnly: statement.isTypeOnly });
      else if (from !== undefined && clause && ts.isNamedExports(clause))
        facts.forwarded.push(...clause.elements.map((e) => ({ name: (e.propertyName ?? e.name).text, from, as: e.name.text })));
      else if (from !== undefined) use(from, ['*']);
    } else if (ts.isExportAssignment(statement)) facts.declared.push('default');
    else if (exported(statement)) {
      const isDefault = (ts.getModifiers(statement as ts.HasModifiers) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (isDefault) facts.declared.push('default');
      else if (ts.isVariableStatement(statement))
        facts.declared.push(...statement.declarationList.declarations.flatMap((d) => boundNames(d.name)));
      else if ('name' in statement && statement.name && ts.isIdentifier(statement.name as ts.Node)) {
        facts.declared.push((statement.name as ts.Identifier).text);
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) facts.types.push(statement.name.text);
      }
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const from = to(node.argument.literal);
      const qualifier = node.qualifier;
      use(from, [qualifier === undefined ? '*' : ts.isIdentifier(qualifier) ? qualifier.text : leftmost(qualifier)]);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      use(to(node.arguments[0]), dynamicReads(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return facts;
}

/** The first name of a qualified name: `A` of `A.B.C`. */
const leftmost = (name: ts.QualifiedName): string => (ts.isIdentifier(name.left) ? name.left.text : leftmost(name.left));

/** The names a dynamic `import()` is read for: an object pattern's, a binding's reads, a member read at once, else every name. */
function dynamicReads(sf: ts.SourceFile, call: ts.CallExpression): string[] {
  const awaited = ts.isAwaitExpression(call.parent) ? call.parent : undefined;
  const holder = awaited?.parent;
  if (holder && ts.isVariableDeclaration(holder)) {
    if (ts.isObjectBindingPattern(holder.name))
      return holder.name.elements
        .map((e) => (e.propertyName && ts.isIdentifier(e.propertyName) ? e.propertyName : e.name))
        .map((n) => (ts.isIdentifier(n) ? n.text : '*'));
    if (ts.isIdentifier(holder.name)) return namespaceReads(sf, holder.name);
  }
  const paren = awaited && ts.isParenthesizedExpression(awaited.parent) ? awaited.parent : undefined;
  if (paren && ts.isPropertyAccessExpression(paren.parent)) return [paren.parent.name.text];
  return ['*'];
}

/** Each export of `src` that no other file imports, as `<file>: <name>`, read from `texts` (paths from `apps/web`). */
function deadExports(texts: ReadonlyMap<string, string>): string[] {
  const facts = new Map([...texts.keys()].map((file) => [file, factsOf(texts, file)]));
  const key = (file: string, name: string): string => `${file}\0${name}`;
  const used = new Set<string>();
  const pending: Use[] = [...facts].flatMap(([file, f]) => f.uses.filter((u) => u.file !== file));
  pending.push(...OFFERED.filter((door) => facts.has(door)).map((door) => ({ file: door, name: '*' })));
  while (pending.length > 0) {
    const { file, name } = pending.pop() as Use;
    if (used.has(key(file, name))) continue;
    used.add(key(file, name));
    const f = facts.get(file);
    if (f === undefined) continue;
    if (name === '*type') {
      pending.push(...f.types.map((type) => ({ file, name: type })));
      pending.push(...f.stars.map((star) => ({ file: star.from, name })));
      continue;
    }
    for (const fwd of f.forwarded) if (name === '*' || fwd.as === name) pending.push({ file: fwd.from, name: fwd.name });
    for (const star of f.stars) pending.push({ file: star.from, name: name === '*' && star.typeOnly ? '*type' : name });
  }
  return [...facts]
    .filter(([file]) => file.startsWith('src/'))
    .flatMap(([file, f]) =>
      [...f.declared, ...f.forwarded.map((fwd) => fwd.as)]
        .filter((name) => !exempt(file, name) && !used.has(key(file, '*')) && !used.has(key(file, name)))
        .map((name) => `${file}: ${name}`),
    )
    .sort();
}

test('every export of src is imported by another file of src, test, .storybook or contracts', () => {
  assert.deepEqual(
    deadExports(treeTexts()),
    [],
    'unexport each name used only in its own file, and delete each used nowhere; an export a framework reads by name goes in exempt, with why',
  );
});

test('REFUSED: an export no file imports, one only its own file reads, a door re-export not taken through it, a value behind a type door', () => {
  const plant = new Map([
    [
      'src/lib/a.ts',
      'export const used = 1;\nexport const dead = 2;\nexport type Kept = 1;\nexport type Lost = 2;\nconst own = (x: Lost) => x;',
    ],
    ['src/lib/door.ts', "export * from './a.ts';\nexport { b, c } from './b.ts';"],
    ['src/lib/b.ts', 'export const b = 1;\nexport const c = 2;'],
    ['src/lib/types.ts', "export type * from './c.ts';"],
    ['src/lib/c.ts', 'export type Read = 1;\nexport const unread = 2;'],
    ['src/routes/x.tsx', 'export const Route = 1;\nexport const helper = 2;'],
    ['test/a.test.ts', "import { used, type Kept } from '../src/lib/door.ts';\nconst m = await import('../src/lib/b.ts');\nm.c;"],
    ['test/b.test.ts', "import * as types from '../src/lib/types.ts';\nObject.keys(types);"],
  ]);
  assert.deepEqual(deadExports(plant), [
    'src/lib/a.ts: Lost',
    'src/lib/a.ts: dead',
    'src/lib/b.ts: b',
    'src/lib/c.ts: unread',
    'src/lib/door.ts: b',
    'src/lib/door.ts: c',
    'src/routes/x.tsx: helper',
  ]);
});
