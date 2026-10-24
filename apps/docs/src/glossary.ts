/**
 * The Glossary page, drawn at build from each context's glossary table: the `glossary.json` at a context's door, read by path from the
 * repository's root, never imported. The page holds a fence ```glossary whose lines are the contexts' ids in the map's order; the
 * plugin replaces it by one section per context, its title, what it is about, and one line per term. A table the fence omits, or an
 * id no table has, fails the page's build, naming it; `typeFaults` names each term's type that its workspace does not export.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { Heading, List, ListItem, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';

/** A spelling a term no longer has, and the card that retires it. */
type Retired = { spelling: string; card: string };

/** One row of a table: the word, what it means, the code's type for it, and the page that explains it. */
export type Term = { term: string; meaning: string; type?: string; see?: { label: string; href: string }; retired?: Retired[] };

/** A context's glossary table, with the file it is read from, by path from the repository's root. */
export type Table = { context: string; title: string; about: string; paths: string[]; terms: Term[]; file: string };

/**
 * What is wrong with the tables or the fence: a table the fence omits, an id of the fence no table has, a term's type no file of its
 * workspace exports. `says` is the fault in words, with its fix.
 */
export type Fault = { kind: 'omitted' | 'no-table' | 'no-export'; context: string; type?: string; says: string };

/** The files git knows of under `root`, tracked or not ignored, that match `specs`, by path from `root`. */
const filesOf = (root: string, specs: string[]): string[] =>
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...specs], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split('\n')
    .filter((f) => f && fs.existsSync(path.join(root, f)));

/** Every glossary table of the repository at `root`: each file named `glossary.json` git knows of, parsed, sorted by its path. */
export const tablesIn = (root: string): Table[] =>
  filesOf(root, ['*glossary.json'])
    .filter((f) => path.posix.basename(f) === 'glossary.json')
    .sort()
    .map((file) => ({ ...(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as Omit<Table, 'file'>), file }));

/** The ids a ```glossary fence lists, one a line, in its order. */
export const idsOf = (fence: string): string[] =>
  fence
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** A table the fence omits and an id of the fence no table has, each a fault naming the fix. */
export const fenceFaults = (tables: Table[], order: string[]): Fault[] => [
  ...tables
    .filter((t) => !order.includes(t.context))
    .map((t): Fault => ({
      kind: 'omitted',
      context: t.context,
      says: `${t.file} is the table of ${t.context}, which the glossary fence omits: add ${t.context} to the fence of apps/docs/src/content/docs/glossary.mdx, in the map's order`,
    })),
  ...order
    .filter((id) => !tables.some((t) => t.context === id))
    .map((id): Fault => ({
      kind: 'no-table',
      context: id,
      says: `the glossary fence lists ${id}, which no glossary.json names as its context: take it off the fence, or give that context its table`,
    })),
];

/** Text that may hold backticked names, as phrasing: each backticked span inline code, the rest text. */
const phrasing = (text: string): PhrasingContent[] =>
  text
    .split(/`([^`\n]+)`/)
    .flatMap((part, i): PhrasingContent[] =>
      i % 2 === 1 ? [{ type: 'inlineCode', value: part }] : part ? [{ type: 'text', value: part }] : [],
    );

/**
 * One term's line: **term**: its meaning, its type in code where it has one, the spellings it retired, which the code says no more,
 * and the link to the page that explains it.
 */
const itemOf = (term: Term): ListItem => {
  const children: PhrasingContent[] = [
    { type: 'strong', children: [{ type: 'text', value: term.term }] },
    { type: 'text', value: ': ' },
    ...phrasing(term.meaning),
  ];
  if (term.type)
    children.push({ type: 'text', value: ' Its type: ' }, { type: 'inlineCode', value: term.type }, { type: 'text', value: '.' });
  if (term.retired?.length)
    children.push(
      { type: 'text', value: ' Retired: ' },
      ...term.retired.flatMap((r, i): PhrasingContent[] => [
        ...(i > 0 ? [{ type: 'text', value: ', ' } as const] : []),
        { type: 'inlineCode', value: r.spelling },
      ]),
      { type: 'text', value: '.' },
    );
  if (term.see)
    children.push({ type: 'text', value: ' ' }, { type: 'link', url: term.see.href, children: [{ type: 'text', value: term.see.label }] });
  return { type: 'listItem', spread: false, children: [{ type: 'paragraph', children }] };
};

/** The page's sections, one per context in `order`: its title as a heading, what it is about, and a list of its terms. */
export const glossarySections = (tables: Table[], order: string[]): RootContent[] =>
  order.flatMap((id) => {
    const table = tables.find((t) => t.context === id);
    if (!table) return [];
    const heading: Heading = { type: 'heading', depth: 2, children: [{ type: 'text', value: table.title }] };
    const about: Paragraph = { type: 'paragraph', children: phrasing(table.about) };
    const list: List = { type: 'list', ordered: false, spread: false, children: table.terms.map(itemOf) };
    return [heading, about, list];
  });

/** The workspace a table sits in, by path from the root: `packages/<x>` or `apps/<x>`. */
const workspaceOf = (file: string): string => file.split('/').slice(0, 2).join('/');

/** A source file of a workspace that is no test: a `.ts` or `.tsx`, outside any `test/` folder and not named `*.test.*`. */
const isSource = (file: string): boolean =>
  /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !/\.test\.tsx?$/.test(file) && !file.split('/').includes('test');

/** The names a source file exports: a type, an interface, a class, a const or let, a function, an enum, and a named re-export. */
const exportsOf = (file: string, text: string): string[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const exported = (node: ts.Node) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  return source.statements.flatMap((node): string[] => {
    if (ts.isExportDeclaration(node))
      return node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map((e) => e.name.text) : [];
    if (!exported(node)) return [];
    if (ts.isVariableStatement(node))
      return node.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
    if (
      ts.isTypeAliasDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isEnumDeclaration(node)
    )
      return node.name ? [node.name.text] : [];
    return [];
  });
};

/** Each term's type that no source file of its table's workspace exports, a fault naming the table, the type and the fix. */
export const typeFaults = (root: string, tables: Table[]): Fault[] => {
  const exports = new Map<string, Set<string>>();
  const exportedBy = (workspace: string): Set<string> => {
    let names = exports.get(workspace);
    if (!names) {
      names = new Set(
        filesOf(root, [workspace])
          .filter(isSource)
          .flatMap((f) => exportsOf(f, fs.readFileSync(path.join(root, f), 'utf8'))),
      );
      exports.set(workspace, names);
    }
    return names;
  };
  return tables.flatMap((table) =>
    table.terms.flatMap((term): Fault[] =>
      term.type && !exportedBy(workspaceOf(table.file)).has(term.type)
        ? [
            {
              kind: 'no-export',
              context: table.context,
              type: term.type,
              says: `${table.file}: the term ${term.term} names the type ${term.type}, which no source of ${workspaceOf(table.file)} exports: name a type it exports, or take the type off`,
            },
          ]
        : [],
    ),
  );
};

/**
 * The remark plugin that draws a page's ```glossary fence as one section per context, from the tables under `root`, before the
 * headings are given their slugs; a table the fence omits or an id with no table fails the page's build, naming it.
 * @param options.root The repository's root, where the glossary tables are.
 */
export const remarkGlossary =
  ({ root }: { root: string }) =>
  (tree: Root, file: { path?: string }): void => {
    const at = tree.children.findIndex((node) => node.type === 'code' && node.lang === 'glossary');
    if (at < 0) return;
    const fence = tree.children[at];
    if (fence.type !== 'code') return;
    const tables = tablesIn(root);
    const order = idsOf(fence.value);
    const faults = fenceFaults(tables, order);
    if (faults.length > 0) throw new Error(`${path.relative(root, file.path ?? 'a page')}: ${faults.map((f) => f.says).join('; ')}`);
    tree.children.splice(at, 1, ...glossarySections(tables, order));
  };
