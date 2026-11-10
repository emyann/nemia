/**
 * The keys a step has are listed once, in objects (`STEP_KEYS`, with each key's Schema in `StepKeys` and its form in `STEP_KEY_FORM`,
 * `packages/objects/src/workflow.ts`), and every other list of them reads that one. The orchestrator's parser holds the one copy, typed by
 * objects' list (`STEP_KEYS` in `packages/agent-orchestrator/src/step/step.ts`), since the entries a pure reader loads must not load
 * objects; its other per-key tables are typed by that copy's `StepKey`, so a key added to objects without them does not compile.
 *
 * Everywhere else — the api, the board, the client, their source and not their tests — a list of the keys written again is refused: an
 * array naming six of them or more as strings, or an object or a type naming twenty of them or more as its members (a form's kind per
 * key, a spec type with a member per key). Such a list drifts from the format the day a key is added. A file whose list is still to go
 * is counted in `DEBT`, which only shrinks.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { STEP_KEYS } from 'agent-orchestrator/workflow';
import { files, textOf } from 'test-kit/repo';

/** The step keys, as objects lists them (the orchestrator's copy is typed by that list). */
const KEYS: ReadonlySet<string> = new Set(STEP_KEYS);

/** The fewest keys an array names, and an object or a type, for it to be a list of the keys written again. */
const AT_LEAST = { array: 6, members: 20 } as const;

/**
 * Where the keys may be listed: objects, which holds the one list, and the parser, whose lists are typed by its copy of it. And the
 * runtime, which knows no step: its harness knobs (`model`, `effort`, `permissionMode`, …) are what a step's keys are passed on as, by the
 * same names, as a Pod spec's fields are.
 */
const OWNERS = ['packages/objects/src/', 'packages/agent-orchestrator/src/', 'packages/agent-runtime/src/'];

/**
 * The lists still to go, by file, each the count of them there, cleared by the part that moves the board's reads onto objects' Schemas:
 * its step form's unset values per key (`UNSET`), its mirror of the api's step spec with its schema and the schema of a key, and its two
 * lists of an agent's role keys.
 */
const DEBT: Readonly<Record<string, number>> = {
  'apps/web/src/lib/builder.ts': 1,
  'apps/web/src/lib/agents.ts': 1,
  'apps/web/src/lib/api/agents.ts': 1,
};

/** The name a member is written under, where it is written as a name or a string. */
const memberName = (name: ts.PropertyName | undefined): string | undefined =>
  name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;

/** How many step keys `node` lists, where it is an array of strings, an object or a type; zero for anything else. */
const keysListed = (node: ts.Node): { count: number; at: number } => {
  if (ts.isArrayLiteralExpression(node)) {
    const named = node.elements.filter((e) => ts.isStringLiteralLike(e) && KEYS.has(e.text)).length;
    return { count: named, at: AT_LEAST.array };
  }
  const members: readonly ts.Node[] | undefined = ts.isObjectLiteralExpression(node)
    ? node.properties
    : ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)
      ? node.members
      : undefined;
  if (members === undefined) return { count: 0, at: Infinity };
  const named = members.filter((m) => {
    const name = 'name' in m ? memberName(m.name as ts.PropertyName | undefined) : undefined;
    return name !== undefined && KEYS.has(name);
  }).length;
  return { count: named, at: AT_LEAST.members };
};

/** Each list of the step keys `text` writes, as `<line>: <how many keys>`. */
const listsIn = (file: string, text: string): string[] => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const { count, at } = keysListed(node);
    if (count >= at) found.push(`${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${count} step keys`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
};

/** Whether `file` is source a layer ships: under a package's or an app's `src`, no test, outside the two that own the keys. */
const shipped = (file: string): boolean =>
  /^(apps|packages)\/[^/]+\/src\/.*\.tsx?$/.test(file) &&
  !/\.test\.tsx?$/.test(file) &&
  !file.includes('/test/') &&
  !OWNERS.some((owner) => file.startsWith(owner));

/** Each file that lists the step keys again, with how many lists it holds and where. */
const listed = (read: (file: string) => string | undefined = textOf): Record<string, string[]> =>
  Object.fromEntries(
    files()
      .filter(shipped)
      .flatMap((file) => {
        const text = read(file);
        const lists = text === undefined ? [] : listsIn(file, text);
        return lists.length > 0 ? [[file, lists] as const] : [];
      }),
  );

test('no source outside objects and the parser lists the step keys again, but the debt counted', () => {
  const found = listed();
  const over = Object.entries(found).filter(([file, lists]) => lists.length > (DEBT[file] ?? 0));
  assert.deepEqual(
    over.map(([file, lists]) => `${file}: ${lists.join(', ')}`),
    [],
    "read objects' STEP_KEYS, StepKeys or STEP_KEY_FORM (from 'objects') rather than listing the keys again",
  );
  const paid = Object.entries(DEBT).filter(([file, count]) => (found[file]?.length ?? 0) < count);
  assert.deepEqual(paid, [], 'a list counted in DEBT is gone: lower its count, or take its file out of DEBT');
});

test('REFUSED: a list of the keys as an array, an object per key, and a type per key; a few keys named are no list', () => {
  const keys = [...STEP_KEYS];
  const array = `export const ORDER = [${keys
    .slice(0, AT_LEAST.array)
    .map((k) => `'${k}'`)
    .join(', ')}];`;
  const object = `export const KINDS = { ${keys.map((k) => `${k}: 'text'`).join(', ')} };`;
  const type = `export type Spec = { ${keys.map((k) => `${k}: string | null;`).join(' ')} };`;
  const few = `export const FLAGS = { remote: ['true', 'false'], gate: ['true'] }; const SOME = ['tools', 'routes', 'when', 'ends'];`;
  assert.equal(listsIn('a.ts', array).length, 1, 'an array of six keys');
  assert.equal(listsIn('a.ts', object).length, 1, 'an object with a member per key');
  assert.equal(listsIn('a.ts', type).length, 1, 'a type with a member per key');
  assert.deepEqual(listsIn('a.ts', few), [], 'a few keys named for what they say');
});

test("the parser's copy of the list is typed by objects' list, so the two cannot differ", () => {
  const file = 'packages/agent-orchestrator/src/step/step.ts';
  const text = textOf(file);
  assert.ok(text !== undefined, `${file} is read`);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const fromObjects = new Set(
    source.statements.flatMap((s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === 'objects' &&
      s.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(s.importClause.namedBindings)
        ? s.importClause.namedBindings.elements.filter((e) => (e.propertyName ?? e.name).text === 'STEP_KEYS').map((e) => e.name.text)
        : [],
    ),
  );
  const declared = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations])
    .find((d) => ts.isIdentifier(d.name) && d.name.text === 'STEP_KEYS');
  const typed = declared?.type;
  assert.ok(
    typed !== undefined && ts.isTypeQueryNode(typed) && ts.isIdentifier(typed.exprName) && fromObjects.has(typed.exprName.text),
    `${file}'s STEP_KEYS is typed \`typeof\` objects' STEP_KEYS, imported from 'objects': type it so, as \`STEP_KEYS: typeof SERVED_STEP_KEYS\``,
  );
});
