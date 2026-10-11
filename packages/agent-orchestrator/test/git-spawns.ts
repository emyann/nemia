/**
 * How a git spawn reads in a file's syntax tree, for the guards that refuse one: `runsGit` says whether a call starts git, by one of
 * `SPAWNS` whose command is `'git'` or one of `SHELLS` whose line starts with it, the command written there or held by a `const` of the
 * same file (`factsOf`). `git-calls.test.ts` holds it out of every `src`, and `stand-ins.ts` out of a test that is no boundary test.
 */
import ts from 'typescript';

/** The calls that start a process, by the name they are called by: their first argument is the command. */
export const SPAWNS = ['execFileSync', 'execFile', 'spawn', 'spawnSync', 'execCounted'];

/** The calls that run a shell line: their first argument is the whole line, which runs git when its first word is git. */
export const SHELLS = ['exec', 'execSync'];

/** The modules whose calls take a path. */
export const PATH_MODULES = ['node:path', 'node:fs', 'node:fs/promises', 'path', 'fs', 'fs/promises'];

/** What a matcher reads of a file beside a call: the `const`s that hold a string, and the names bound to a path module. */
export type FileFacts = { consts: ReadonlyMap<string, string>; pathNames: ReadonlySet<string> };

/** `node` without the parentheses, `as`, `satisfies` and `!` around it. */
export function unwrapped(node: ts.Expression): ts.Expression {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at) || ts.isNonNullExpression(at))
    at = at.expression;
  return at;
}

/** The string `node` is: a literal, a template with no substitution, or a `const` of the file that holds one; else `undefined`. */
export function stringOf(node: ts.Expression | undefined, facts: FileFacts): string | undefined {
  if (!node) return undefined;
  const at = unwrapped(node);
  if (ts.isStringLiteral(at) || ts.isNoSubstitutionTemplateLiteral(at)) return at.text;
  if (ts.isIdentifier(at)) return facts.consts.get(at.text);
  return undefined;
}

/** The literal parts of `node`: its string, or a template's text around its substitutions. */
export function literalParts(node: ts.Expression, facts: FileFacts): string[] {
  const at = unwrapped(node);
  if (ts.isTemplateExpression(at)) return [at.head.text, ...at.templateSpans.map((s) => s.literal.text)];
  const said = stringOf(at, facts);
  return said === undefined ? [] : [said];
}

/** The name a call is called by: an identifier's, or the last name of a property access. */
export function calleeName(call: ts.CallExpression): string | undefined {
  const callee = unwrapped(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** The identifier a callee is rooted in: `fs` of `fs.promises.stat`, `join` of `join`. */
export function calleeRoot(call: ts.CallExpression): string | undefined {
  let at = unwrapped(call.expression);
  while (ts.isPropertyAccessExpression(at)) at = unwrapped(at.expression);
  return ts.isIdentifier(at) ? at.text : undefined;
}

/** Whether a shell line runs git: its first word is git. */
export const shellRunsGit = (parts: readonly string[]): boolean => /^\s*git(\s|$)/.test(parts[0] ?? '');

/** The arguments of `call`, a list among them given as its elements. */
export const argumentsOf = (call: ts.CallExpression): ts.Expression[] =>
  call.arguments.flatMap((arg) => {
    const at = unwrapped(arg);
    return ts.isArrayLiteralExpression(at) ? [...at.elements] : [arg];
  });

/** Whether `call` starts git: a spawn whose command is `'git'`, or a shell line whose first word is git. */
export function runsGit(call: ts.CallExpression, facts: FileFacts): boolean {
  const name = calleeName(call);
  const first = call.arguments[0];
  if (!name || !first) return false;
  if (SPAWNS.includes(name)) return stringOf(first, facts) === 'git';
  return SHELLS.includes(name) && shellRunsGit(literalParts(first, facts));
}

/** The facts of a file a matcher reads: each `const` that holds a string, and each name imported from a path module. */
export function factsOf(source: ts.SourceFile): FileFacts {
  const consts = new Map<string, string>();
  const pathNames = new Set<string>();
  const facts = { consts, pathNames };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && PATH_MODULES.includes(node.moduleSpecifier.text)) {
      const clause = node.importClause;
      if (clause?.name) pathNames.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) pathNames.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) pathNames.add(element.name.text);
    }
    if (ts.isVariableDeclarationList(node) && node.flags & ts.NodeFlags.Const)
      for (const declaration of node.declarations) {
        const held = declaration.initializer && stringOf(declaration.initializer, facts);
        if (ts.isIdentifier(declaration.name) && held !== undefined) consts.set(declaration.name.text, held);
      }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return facts;
}
