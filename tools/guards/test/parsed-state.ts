/**
 * The count `no-parsed-state.test.ts` holds: each place a shipped source reads a state out of a string — a `.startsWith`, `.endsWith`,
 * `.split`, `.match`, `.replace` or `.includes` applied to a name that ends in status, phase, verdict or word, and a pattern's `.test` of
 * such a name. Read by TypeScript's parser rather than a pattern over the text, so a line break, a formatter's layout or a comment hides
 * no call and invents none.
 *
 * Run as a program it prints today's counts as the baseline's entries, for the card that lowers them:
 * `node tools/guards/test/parsed-state.ts` from the root.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { files, REPO } from './repo-files.ts';

/** The string methods that take a state apart. */
export const PARSING = new Set(['startsWith', 'endsWith', 'split', 'match', 'replace', 'includes']);

/**
 * Whether `name` names a state: it is status, phase, verdict or word in any case, or ends in one at a word's edge — rowStatus,
 * ROW_PHASE, step_verdict — and not inside one, so password and keyword are no state.
 */
export const namesState = (name: string): boolean =>
  /(?:^|_)(?:status|phase|verdict|word)$/i.test(name) || /[a-z0-9](?:Status|Phase|Verdict|Word)$/.test(name);

/** `node` with what changes no value taken off: parentheses, a `!`, an `as` and a `satisfies`. */
const bare = (node: ts.Expression): ts.Expression => {
  let at = node;
  while (ts.isParenthesizedExpression(at) || ts.isNonNullExpression(at) || ts.isAsExpression(at) || ts.isSatisfiesExpression(at))
    at = at.expression;
  return at;
};

/** The name `node` reads by, where it is a name or a member (`status`, `row.status`, `row?.status`), else undefined. */
const nameOf = (node: ts.Expression): string | undefined => {
  const at = bare(node);
  if (ts.isIdentifier(at)) return at.text;
  if (ts.isPropertyAccessExpression(at)) return at.name.text;
  return undefined;
};

/**
 * Each place `text`, the source of `file`, parses a state out of a string, by its line and what it reads: a parsing method called on a
 * state's name, or any `.test` whose argument is one — a pattern literal's or a pattern kept in a name.
 */
export const parsedStates = (text: string, file = 'source.tsx'): string[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(bare(node.expression))) {
      const callee = bare(node.expression) as ts.PropertyAccessExpression;
      const method = callee.name.text;
      const of = PARSING.has(method) ? nameOf(callee.expression) : undefined;
      const tested = method === 'test' && node.arguments.length === 1 ? nameOf(node.arguments[0]) : undefined;
      const state = of !== undefined && namesState(of) ? of : tested !== undefined && namesState(tested) ? tested : undefined;
      if (state !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push(`${line}: .${method} of ${state}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** Where shipped sources are read: each package's `src`, the api's and the board's. */
const SCOPES = [/^packages\/[^/]+\/src\//, /^apps\/api\/src\//, /^apps\/web\/src\//];

/** Whether `file`, a path from the root, is a shipped source the count reads: a `.ts` or `.tsx` in scope, no test and no story. */
export const counted = (file: string): boolean =>
  SCOPES.some((scope) => scope.test(file)) &&
  /\.tsx?$/.test(file) &&
  !file.endsWith('.d.ts') &&
  !/\.test\.tsx?$/.test(file) &&
  !file.endsWith('.stories.tsx');

/** Each file of `listed` the count reads that parses a state, by its path from `root`, with how many times it does. */
export const measure = (listed: readonly string[], root = REPO): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const file of listed.filter(counted).sort()) {
    const at = path.join(root, file);
    if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) continue;
    const count = parsedStates(fs.readFileSync(at, 'utf8'), file).length;
    if (count > 0) counts[file] = count;
  }
  return counts;
};

/** The repository's counts today, from git's list of its files. */
export const repositoryCounts = (): Record<string, number> => measure(files());

if (import.meta.main) {
  const card = "A step's state crosses the wire as a code, not a sentence";
  for (const [file, count] of Object.entries(repositoryCounts()))
    console.log(`  '${file}': { count: ${count}, card: ${JSON.stringify(card)} },`);
}
