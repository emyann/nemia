/**
 * A session's sweep, run once and deleted: it takes the declared return type off every function with a body, as
 * `landmines-types/no-explicit-return-types` asks, and lists each function whose inferred type now holds an `any` the declared one
 * did not.
 *
 * `node tools/infer-returns.ts strip <record.json> <folder>…` edits every git-listed `.ts`/`.tsx` file under the folders, outside
 * oxlint's `ignorePatterns`: it leaves a type predicate, `asserts`, `never`, and a function under a disable of the rule, and drops
 * each import the removal left unnamed. `node tools/infer-returns.ts anys <record.json> <tsconfig>…` builds each program and prints
 * `file:line name declared -> inferred` for each stripped function whose inferred type holds an `any`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const RULE = 'landmines-types/no-explicit-return-types';
const IGNORED = ['apps/web/src/components/ui/ds/', 'apps/web/.claude/', 'apps/web/src/routeTree.gen.ts', 'apps/web/.storybook/public/'];

type Stripped = { file: string; ordinal: number; name: string; declared: string };

const isFunctionWithBody = (node: ts.Node) =>
  (ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node)) &&
  node.body !== undefined;

const functionsOf = (source: ts.SourceFile) => {
  const found: ts.SignatureDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (isFunctionWithBody(node)) found.push(node as ts.SignatureDeclaration);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

const nameOf = (node: ts.SignatureDeclaration) => {
  if (node.name !== undefined) return node.name.getText();
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText();
  return '<anonymous>';
};

const exempt = (node: ts.SignatureDeclaration, source: ts.SourceFile, lines: string[]) => {
  const type = node.type;
  if (type === undefined) return true;
  if (ts.isTypePredicateNode(type) || type.kind === ts.SyntaxKind.NeverKeyword) return true;
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
  const typeLine = source.getLineAndCharacterOfPosition(type.getStart(source)).line;
  return [line, typeLine].some((at) => at > 0 && (lines[at - 1] ?? '').includes(RULE) && lines[at - 1]!.includes('disable'));
};

const identifierCounts = (source: ts.SourceFile) => {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts;
};

const kindOf = (file: string) => (file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindOf(file));

type Edit = { start: number; end: number; text: string };

const apply = (text: string, edits: Edit[]) =>
  [...edits].sort((a, b) => b.start - a.start).reduce((at, edit) => at.slice(0, edit.start) + edit.text + at.slice(edit.end), text);

const closeParenOf = (node: ts.SignatureDeclaration, source: ts.SourceFile) =>
  node.getChildren(source).find((child) => child.kind === ts.SyntaxKind.CloseParenToken);

const unusedImportEdits = (before: ts.SourceFile, after: ts.SourceFile) => {
  const was = identifierCounts(before);
  const now = identifierCounts(after);
  const gone = (name: string) => (was.get(name) ?? 0) > 0 && (now.get(name) ?? 0) === 0;
  const edits: Edit[] = [];
  for (const statement of after.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) continue;
    const clause = statement.importClause;
    const bindings = clause.namedBindings;
    const named = bindings !== undefined && ts.isNamedImports(bindings) ? [...bindings.elements] : [];
    const dropped = named.filter((element) => gone(element.name.text));
    const defaultGone = clause.name !== undefined && gone(clause.name.text);
    const namespaceGone = bindings !== undefined && ts.isNamespaceImport(bindings) && gone(bindings.name.text);
    if (dropped.length === 0 && !defaultGone && !namespaceGone) continue;
    const keepsDefault = clause.name !== undefined && !defaultGone;
    const keptNamed = named.filter((element) => !dropped.includes(element));
    const keepsNamespace = bindings !== undefined && ts.isNamespaceImport(bindings) && !namespaceGone;
    if (!keepsDefault && keptNamed.length === 0 && !keepsNamespace) {
      let end = statement.getEnd();
      if (after.text[end] === '\n') end += 1;
      edits.push({ start: statement.getStart(after), end, text: '' });
      continue;
    }
    const parts: string[] = [];
    if (keepsDefault) parts.push(clause.name!.text);
    if (keepsNamespace) parts.push(bindings.getText(after));
    if (keptNamed.length > 0) parts.push(`{ ${keptNamed.map((element) => element.getText(after)).join(', ')} }`);
    const typePrefix = clause.isTypeOnly ? 'type ' : '';
    edits.push({ start: clause.getStart(after), end: clause.getEnd(), text: `${typePrefix}${parts.join(', ')}` });
  }
  return edits;
};

const strip = (record: string, folders: string[]) => {
  const files = execFileSync('git', ['ls-files', '--', ...folders], { encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !IGNORED.some((ignored) => file.startsWith(ignored)));
  const stripped: Stripped[] = existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : [];
  let count = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const source = parse(file, text);
    const lines = text.split('\n');
    const edits: Edit[] = [];
    functionsOf(source).forEach((node, ordinal) => {
      if (exempt(node, source, lines)) return;
      const from = closeParenOf(node, source);
      if (from === undefined) throw new Error(`${file}: no closing parenthesis before the return type of ${nameOf(node)}`);
      stripped.push({ file, ordinal, name: nameOf(node), declared: node.type!.getText(source) });
      edits.push({ start: from.getEnd(), end: node.type!.getEnd(), text: '' });
    });
    if (edits.length === 0) continue;
    count += edits.length;
    const edited = apply(text, edits);
    const final = apply(edited, unusedImportEdits(source, parse(file, edited)));
    writeFileSync(file, final);
  }
  writeFileSync(record, JSON.stringify(stripped, null, 1));
  console.log(`${count} return types taken out`);
};

const anys = (record: string, configs: string[]) => {
  const stripped: Stripped[] = JSON.parse(readFileSync(record, 'utf8'));
  const byFile = new Map<string, Stripped[]>();
  for (const entry of stripped) byFile.set(path.resolve(entry.file), [...(byFile.get(path.resolve(entry.file)) ?? []), entry]);
  const seen = new Set<string>();
  for (const config of configs) {
    const read = ts.readConfigFile(config, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config));
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
    const checker = program.getTypeChecker();
    for (const source of program.getSourceFiles()) {
      const entries = byFile.get(path.resolve(source.fileName));
      if (entries === undefined || seen.has(source.fileName)) continue;
      seen.add(source.fileName);
      const functions = functionsOf(source);
      for (const entry of entries) {
        const node = functions[entry.ordinal];
        if (node === undefined) continue;
        const signature = checker.getSignatureFromDeclaration(node);
        if (signature === undefined) continue;
        const inferred = checker.typeToString(checker.getReturnTypeOfSignature(signature), undefined, ts.TypeFormatFlags.NoTruncation);
        if (/\bany\b/.test(inferred) && !/\bany\b/.test(entry.declared)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          console.log(`${entry.file}:${line} ${entry.name} ${entry.declared} -> ${inferred}`);
        }
      }
    }
  }
};

const [mode, record, ...rest] = process.argv.slice(2);
if (mode === 'strip' && record !== undefined) strip(record, rest);
else if (mode === 'anys' && record !== undefined) anys(record, rest);
else {
  console.error('usage: node tools/infer-returns.ts strip <record.json> <folder>… | anys <record.json> <tsconfig>…');
  process.exit(2);
}
