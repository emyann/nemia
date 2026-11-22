/**
 * `components/index.d.ts`: for each component the entry exports, the props its code declares itself, as an interface `<Comp>Props`
 * with the comment written on each; then the board's icons as a namespace, and the helper types the entry exports or a listed prop
 * names. Documentation for a person and an agent, never compiled: a prop a component takes from React Aria or the DOM is left out.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO, SRC, WEB, WORK, requireOfTheBoard } from '../paths.ts';

/** The largest type written out whole; a longer one is written as its declaration says it. */
const LONGEST = 420;

/** The cap of the types' file, in bytes. */
const TYPES_CAP = 1.5 * 1024 * 1024;

const WIDE = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

/** The program over the entry, resolving as the board does. */
const programOf = (entry: string) => {
  const roots = [path.join(WEB, 'node_modules'), path.join(REPO, 'node_modules')];
  return ts.createProgram([entry], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    types: [],
    paths: { '@/*': [`${SRC}/*`], '*': [...roots.map((root) => `${root}/@types/*`), ...roots.map((root) => `${root}/*`)] },
  });
};

/** Whether a declaration is the board's own or the producer's generated code, never a package's. */
const ours = (declaration: ts.Node) => {
  const file = path.resolve(declaration.getSourceFile().fileName);
  if (file.startsWith(`${WORK}${path.sep}`)) return true;
  return file.startsWith(`${SRC}${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`);
};

/** The doc comment's lines of `symbol`, indented as a member's. */
const commentOf = (checker: ts.TypeChecker, symbol: ts.Symbol) => {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  if (!text) return [];
  const lines = text.split('\n').map((line) => line.trimEnd());
  return lines.length === 1 ? [`  /** ${lines[0]} */`] : ['  /**', ...lines.map((line) => `   * ${line}`.trimEnd()), '   */'];
};

/** A prop's type as written, or its declaration's text where the resolved type runs past `LONGEST`. */
const writtenType = (checker: ts.TypeChecker, symbol: ts.Symbol, at: ts.Node) => {
  const type = checker.getTypeOfSymbolAtLocation(symbol, at);
  const shown = type.isTypeParameter() ? (type.getConstraint() ?? type) : type;
  const resolved = checker
    .typeToString(shown, at, WIDE)
    .replace(/ \| undefined$/, '')
    .replace(/\bm\d+\./g, '');
  if (resolved.length <= LONGEST) return resolved;
  const declaration = symbol.declarations?.find(ours);
  const typed = declaration && 'type' in declaration ? (declaration.type as ts.Node | undefined) : undefined;
  return typed ? typed.getText().replace(/\s+/g, ' ') : `${resolved.slice(0, LONGEST)} …`;
};

/** A component's own props: each with the symbols that declare it across the shapes of its props, and whether every shape has it. */
const propsOf = (checker: ts.TypeChecker, symbol: ts.Symbol, at: ts.Node) => {
  const [signature] = checker.getTypeOfSymbolAtLocation(symbol, at).getCallSignatures();
  const [given] = signature?.getParameters() ?? [];
  if (!given) return undefined;
  const props = checker.getTypeOfSymbolAtLocation(given, at);
  const shapes = (props.isUnion() ? props.types : [props]).map((one) => checker.getPropertiesOfType(checker.getApparentType(one)));
  const own = new Map<string, ts.Symbol[]>();
  for (const member of shapes.flat()) {
    if (member.declarations?.length && !member.declarations.some(ours)) continue;
    own.set(member.getName(), [...(own.get(member.getName()) ?? []), member]);
  }
  return [...own.entries()].map(([name, symbols]) => ({ name, symbols, everywhere: symbols.length === shapes.length }));
};

/** One prop's type across the shapes that have it, a pair of `true` and `false` said as `boolean`. */
const unionOf = (checker: ts.TypeChecker, symbols: readonly ts.Symbol[], at: ts.Node) => {
  const written = [...new Set(symbols.map((symbol) => writtenType(checker, symbol, at)))];
  const told = written.length > 1 ? written.filter((one) => one !== 'undefined') : written;
  const both = told.includes('true') && told.includes('false');
  return (both ? ['boolean', ...told.filter((one) => one !== 'true' && one !== 'false' && one !== 'boolean')] : told).join(' | ');
};

/** The interface of one component, or undefined for an export that is no component. */
const interfaceOf = (checker: ts.TypeChecker, name: string, target: ts.Symbol, at: ts.Node) => {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || !(target.flags & ts.SymbolFlags.Value) || name.endsWith('Icon')) return undefined;
  const props = propsOf(checker, target, at);
  if (!props) return undefined;
  const lines = props.flatMap(({ name: prop, symbols, everywhere }) => {
    const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prop) ? prop : JSON.stringify(prop);
    const optional = !everywhere || symbols.some((one) => one.flags & ts.SymbolFlags.Optional);
    const comment = symbols.map((one) => commentOf(checker, one)).find((found) => found.length > 0) ?? [];
    return [...comment, `  ${key}${optional ? '?' : ''}: ${unionOf(checker, symbols, at)};`];
  });
  const about = ts.displayPartsToString(target.getDocumentationComment(checker)).trim();
  const head = about ? ['/**', ...about.split('\n').map((line) => ` * ${line}`.trimEnd()), ' */'] : [];
  return [
    ...head,
    `export interface ${name}Props {`,
    ...lines,
    '}',
    `export declare const ${name}: (props: ${name}Props) => unknown;`,
  ].join('\n');
};

/** The type aliases and interfaces of the board's own files, by name, for a prop that names one. */
const localTypes = (program: ts.Program) => {
  const local = new Map<string, string>();
  for (const file of program.getSourceFiles().filter(ours))
    for (const statement of file.statements)
      if ((ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && !local.has(statement.name.text))
        local.set(statement.name.text, statement.getText().replace(/^export\s+/, ''));
  return local;
};

/** The helper types: the ones the entry exports, then, three rounds deep, the board's own types a written line names. */
const helpersOf = (program: ts.Program, exported: readonly ts.Symbol[], resolved: (symbol: ts.Symbol) => ts.Symbol, interfaces: string) => {
  const helpers = exported
    .map(resolved)
    .filter((target) => !(target.flags & ts.SymbolFlags.Value) && !target.getName().endsWith('Props'))
    .flatMap(
      (target) => target.declarations?.find((one) => ours(one) && (ts.isTypeAliasDeclaration(one) || ts.isInterfaceDeclaration(one))) ?? [],
    )
    .map((declaration) => declaration.getText());
  const local = localTypes(program);
  for (let round = 0; round < 3; round += 1) {
    const body = `${interfaces}\n${helpers.join('\n')}`;
    for (const [name, written] of local) {
      const defined = new RegExp(`\\b(?:type|interface) ${name}\\b`).test(body);
      if (!defined && name.length >= 3 && new RegExp(`[:|<(\\[] ?${name}\\b`).test(body)) helpers.push(`export ${written}`);
    }
  }
  return helpers;
};

/** The icons' namespace, each a lucide icon by its name. */
const iconsBlock = (icons: readonly string[]) => {
  const lucide = (JSON.parse(fs.readFileSync(requireOfTheBoard.resolve('lucide-react/package.json'), 'utf8')) as { version: string })
    .version;
  return [
    '/**',
    ` * The lucide icons the board's own code imports (lucide-react ${lucide}), as one namespace, \`Nemia.Icons\`: the board's sidebar, header,`,
    ' * chips and controls draw these. Each is an icon component that a kit part takes where it asks for an `icon` (an `IconComponent`).',
    ' */',
    'export declare namespace Icons {',
    ...icons.map((name) => `  const ${name}: LucideIcon;`),
    '}',
    "/** lucide's icon: an SVG drawn at `size` (24 by default) in `color` (currentColor by default), which also takes the SVG element's props. */",
    'export type LucideIcon = (props: { size?: number | string; color?: string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean; className?: string }) => unknown;',
  ].join('\n');
};

/** Each line not of a comment, with a type the entry reaches through a module import (`m71.FrameHue`) written by its own name. */
const plainNames = (text: string) => {
  const comment = (line: string) => /^\s*(\/\*\*|\*)/.test(line);
  const plain = text
    .split('\n')
    .map((line) => (comment(line) ? line : line.replace(/(?<![\w.])m\d+\.(?=[A-Za-z_$])/g, '')))
    .join('\n');
  const code = plain
    .split('\n')
    .filter((line) => !comment(line))
    .join('\n');
  if (/(?<![\w.*] ?)\bm\d+\.[A-Z]/.test(code))
    throw new Error("a type of index.d.ts is still named through the entry's module aliases: read plainNames");
  return plain;
};

/**
 * index.d.ts's text; refused past its cap.
 * @param entry the generated entry.
 * @param icons the board's icons.
 */
export const typesOf = (entry: string, icons: readonly string[]) => {
  const program = programOf(entry);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const module = source ? checker.getSymbolAtLocation(source) : undefined;
  if (!source || !module) throw new Error(`TypeScript could not read the generated entry ${entry}: read the errors esbuild gave for it`);
  const exported = checker.getExportsOfModule(module);
  const resolved = (symbol: ts.Symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const interfaces = exported.flatMap((symbol) => interfaceOf(checker, symbol.getName(), resolved(symbol), source) ?? []);
  const helpers = helpersOf(program, exported, resolved, interfaces.join('\n'));
  const text = [
    '/**',
    " * Nemia's components (the kit's, the look's parts, the board's components that have stories, and NemiaRoot) and the board's icons, as",
    " * documentation: each component's props are the ones the code declares itself. A component also takes the props of the React Aria",
    " * component it is built on, and the DOM's, which are not listed. Never compiled.",
    ' */',
    '',
    interfaces.join('\n\n'),
    '',
    iconsBlock(icons),
    '',
    '/** Helper types. */',
    '',
    helpers.join('\n\n'),
    '',
  ].join('\n');
  if (Buffer.byteLength(text) > TYPES_CAP)
    throw new Error(`index.d.ts is ${Buffer.byteLength(text)} bytes, over its 1.5 MB cap: list fewer helpers`);
  return plainNames(text);
};
