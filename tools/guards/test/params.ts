/**
 * The count `params.test.ts` holds: each exported function of a shipped source whose doc and signature disagree on its parameters — a
 * parameter it names with no `@param` of that name, or a `@param` naming none it has. Read by TypeScript's parser: a function is a
 * declaration, or a `const` given an arrow or a function expression, exported from its file; a parameter taken apart where it is
 * declared (`{ a, b }`) has no name to say and asks for none. A function with no parameter owes nothing, and neither does `@returns`,
 * which the signature's type says.
 *
 * Run as a program it prints today's counts as the baseline's text, for the change that lowers them:
 * `node tools/guards/test/params.ts` from the root.
 */
import ts from 'typescript';
import { files, notOurs, textOf } from 'test-kit/repo';

/** A shipped source: a package's or an app's `src`, its tests and its stories aside. */
const SHIPPED = /^(?:packages|apps)\/[\w-]+\/src\/.+\.tsx?$/;
const ASIDE = /\.(?:test|stories)\.tsx?$/;

/** The function a statement exports, where it exports one: the declaration itself, or the arrow or function a `const` is given. */
const exportedFunctions = (statement: ts.Statement) => {
  const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  if (!exported) {
    const made: ts.SignatureDeclaration[] = [];
    return made;
  }
  if (ts.isFunctionDeclaration(statement)) {
    const made: ts.SignatureDeclaration[] = [statement];
    return made;
  }
  if (!ts.isVariableStatement(statement)) {
    const made: ts.SignatureDeclaration[] = [];
    return made;
  }
  {
    const made: ts.SignatureDeclaration[] = statement.declarationList.declarations.flatMap((declaration) => {
      const given = declaration.initializer;
      return given !== undefined && (ts.isArrowFunction(given) || ts.isFunctionExpression(given)) ? [given] : [];
    });
    return made;
  }
};

/** Whether `fn`'s doc and its signature disagree: a named parameter with no `@param` of its name, or a `@param` that names none. */
const disagrees = (fn: ts.SignatureDeclaration) => {
  const named = fn.parameters.flatMap((p) => (ts.isIdentifier(p.name) && p.name.text !== 'this' ? [p.name.text] : []));
  const tagged = ts.getAllJSDocTags(fn, ts.isJSDocParameterTag).flatMap((tag) => (ts.isIdentifier(tag.name) ? [tag.name.text] : []));
  return named.some((name) => !tagged.includes(name)) || tagged.some((name) => !named.includes(name));
};

/** How many exported functions of `text`, the source at `file`, have a doc that disagrees with their parameters. */
export const owedIn = (file: string, text: string) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return source.statements.flatMap(exportedFunctions).filter((fn) => fn.parameters.length > 0 && disagrees(fn)).length;
};

/** Today's counts over `sources`, each a path and its text: every shipped source that owes, by its path, in order. */
export const counted = (sources: ReadonlyMap<string, string>) =>
  Object.fromEntries(
    [...sources]
      .filter(([file]) => SHIPPED.test(file) && !ASIDE.test(file))
      .map(([file, text]) => [file, owedIn(file, text)] as const)
      .filter(([, owed]) => owed > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  ) satisfies Record<string, number>;

/** The repository's shipped sources that are ours, each with its text. */
export const shipped = () => {
  const ours = files().filter((file) => SHIPPED.test(file) && !ASIDE.test(file));
  const vendored = notOurs(ours);
  return new Map(ours.filter((file) => !vendored.has(file)).flatMap((file) => [[file, textOf(file) ?? ''] as const])) satisfies Map<
    string,
    string
  >;
};

if (import.meta.main) process.stdout.write(`${JSON.stringify(counted(shipped()), null, 2)}\n`);
