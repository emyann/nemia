/**
 * The test place's side of the place's contract: every walk of `WALKS` (`place-walks.ts`) asked of a new test place, with no process,
 * which must say what the git place says (`git-place.boundary.test.ts` runs the same walks on git). Then that the contract bites: a
 * test place that lies about one verb fails a walk of that verb, for every verb, and a verb with no walk is named. And that the contract
 * speaks the place's words: no name it exports, and no property of a type it exports, says one of git's (`REFUSED_WORDS`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { testPlace } from '../place/memory/index.ts';
import { PLACE_VERBS, type PlaceAnswers, type PlaceVerb } from '../src/place/place.ts';
import { placeOver, type OwnVerbs } from './place-over.ts';
import { scratch } from './scratch.ts';
import { failing, unwalked, walksOn, WALKS, type Side } from './place-walks.ts';

for (const [name, walk] of walksOn(testPlace)) test(name, walk);

/** A commit no walk makes. */
const NO_COMMIT = 'f'.repeat(40);

/** For each verb, an answer the git place would not give, made of the true one. */
const LIES: { readonly [V in PlaceVerb]: (answer: PlaceAnswers[V]) => PlaceAnswers[V] } = {
  root: (answer) => ({ root: answer.root === null ? '/elsewhere' : null }),
  open: (answer) => ({ ...answer, inProgressFile: `${answer.inProgressFile}.elsewhere` }),
  make: (answer) => ({ ...answer, conflicts: [] }),
  handoff: () => ({ commit: null }),
  report: (answer) => ({ ...answer, files: Object.fromEntries(Object.keys(answer.files).map((branch) => [branch, []])) }),
  standing: (answer) => ({ ...answer, tips: Object.fromEntries(Object.entries(answer.tips).slice(1)) }),
  trial: (answer) => ({ ...answer, trials: answer.trials.map(() => ({ clean: true })) }),
  status: (answer) => ({ ...answer, merging: 'none' }),
  land: (answer) => ('commit' in answer ? { commit: NO_COMMIT } : answer),
  inventory: (answer) => ({ ...answer, workspaces: answer.workspaces.map(({ changes: _changes, ...w }) => ({ ...w, clean: true })) }),
  remove: (answer) => ({ ...answer, removed: [...answer.removed, ...answer.left.map((l) => l.path)], left: [] }),
  export: () => ({ commit: NO_COMMIT }),
  seal: (answer) => ({ removed: !answer.removed }),
};

/** A new test place whose `verb` does what it does and answers `lie` of its true answer; a refusal and an unread outcome as they are. */
function lying<V extends PlaceVerb>(verb: V, lie: (answer: PlaceAnswers[V]) => PlaceAnswers[V]): Side {
  const { place, world } = testPlace();
  const own: OwnVerbs = {
    [verb]: (request: never) => {
      const outcome = place.askNow(verb, request);
      return 'answer' in outcome ? { answer: lie(outcome.answer) } : outcome;
    },
  };
  return { place: placeOver(place, own), world };
}

/** The side that lies about `verb` as `LIES` says. */
const liar =
  <V extends PlaceVerb>(verb: V): (() => Side) =>
  () =>
    lying(verb, LIES[verb]);

for (const verb of PLACE_VERBS)
  test(`REFUSED: a stand-in that lies about ${verb} fails a walk of ${verb}, which the true one passes`, () => {
    assert.deepEqual(failing(verb, testPlace), [], 'the test place says every walk');
    const failed = failing(verb, liar(verb));
    assert.ok(failed.length > 0, `no walk of ${verb} caught the lie`);
    assert.deepEqual(
      failing(verb, () => lying(verb, (answer) => answer)),
      [],
      'and a wrapped place that tells the truth passes them all',
    );
  });

test('REFUSED: a verb with no walk — one added to the place, and one whose walks were taken away — is named', () => {
  assert.deepEqual(unwalked(PLACE_VERBS, WALKS), [], 'every verb of the place is walked');
  assert.deepEqual(unwalked([...PLACE_VERBS, 'mirror'], WALKS), ['mirror']);
  assert.deepEqual(unwalked(PLACE_VERBS, { ...WALKS, land: [] }), ['land']);
});

test("the test place's commits are told apart by their first seven characters, as a screen that shortens an id tells git's", () => {
  const { world } = testPlace();
  const root = scratch('wf-place-ids-');
  const ids = [world.repository(root, { 'a.txt': 'one\n' })];
  for (let n = 0; n < 40; n++) ids.push(world.branch(root, 'main', { 'a.txt': `${n}\n` }));
  assert.equal(new Set(ids.map((id) => id.slice(0, 7))).size, ids.length);
  assert.ok(ids.every((id) => /^[0-9a-f]{40}$/.test(id)));
});

/** The words of git's that the contract does not say: the place speaks its own, and git's stay in the adapter (`place/git`). */
const REFUSED_WORDS = ['head', 'heads', 'checkout', 'staged', 'worktree', 'worktrees', 'prunable', 'detached', 'locked'];

/** A word of version control the contract says on purpose, with why: no refused word is allowed, and each allowed one is said. */
const ALLOWED: Readonly<Record<string, string>> = { branch: 'a generic version-control word' };

/** The words of a name: camelCase, PascalCase and SNAKE_CASE split apart, each lower case. */
const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/**
 * Every name `file` exports and every property name reachable from the types it exports, read by the TypeScript checker, so a member of a
 * nested type or of a type reached through an alias is read and a word in prose is not. The walk stops at a type declared in another
 * file, Effect's and the language's own among them, but for a mapped utility (`Readonly`, `Record`), whose properties are the file's.
 */
export function contractNames(file: string): string[] {
  const program = ts.createProgram([file], {
    allowImportingTsExtensions: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(file);
  const module = source && checker.getSymbolAtLocation(source);
  assert.ok(module, `${file} is a module the checker reads`);
  const here = (declaration: ts.Declaration): boolean => path.resolve(declaration.getSourceFile().fileName) === path.resolve(file);
  const names = new Set<string>();
  const entered = new Set<ts.Type>();
  const elsewhere = (type: ts.Type): boolean => {
    const symbol = type.aliasSymbol ?? (type.flags & ts.TypeFlags.Object ? type.symbol : undefined);
    if (!symbol?.declarations?.length || symbol.declarations.some(here)) return false;
    const mapped =
      (type.flags & ts.TypeFlags.Object && (type as ts.ObjectType).objectFlags & ts.ObjectFlags.Mapped) ||
      type.aliasSymbol?.declarations?.some((d) => ts.isTypeAliasDeclaration(d) && ts.isMappedTypeNode(d.type));
    return !mapped;
  };
  const walk = (type: ts.Type): void => {
    if (entered.has(type)) return;
    entered.add(type);
    if (type.isUnion() || type.isIntersection()) return type.types.forEach(walk);
    if (!(type.flags & ts.TypeFlags.Object)) return;
    if (checker.isArrayType(type) || checker.isTupleType(type)) return checker.getTypeArguments(type as ts.TypeReference).forEach(walk);
    if (type.getCallSignatures().length || type.getConstructSignatures().length || elsewhere(type)) return;
    for (const info of checker.getIndexInfosOfType(type)) walk(info.type);
    for (const property of checker.getPropertiesOfType(type)) {
      if (property.declarations?.length && !property.declarations.some(here)) continue;
      names.add(property.name);
      walk(checker.getTypeOfSymbol(property));
    }
  };
  for (const exported of checker.getExportsOfModule(module)) {
    names.add(exported.name);
    if (exported.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface)) walk(checker.getDeclaredTypeOfSymbol(exported));
  }
  return [...names].sort();
}

/** Each name of `names` that says a refused word, with the word. */
const gitWords = (names: readonly string[]): string[] =>
  names.flatMap((name) =>
    wordsOf(name)
      .filter((word) => REFUSED_WORDS.includes(word) && !(word in ALLOWED))
      .map((word) => `${name} (${word})`),
  );

/** The names a fixture `door.ts` of `text` says, read as the contract is. */
const namesIn = (text: string): string[] => {
  const file = path.join(scratch('wf-place-words-'), 'door.ts');
  fs.writeFileSync(file, text);
  return contractNames(file);
};

const CONTRACT = path.join(import.meta.dirname, '..', 'src', 'place', 'place.ts');

test("the contract says the place's words: no name it exports and no property of its types says one of git's", () => {
  const names = contractNames(CONTRACT);
  assert.ok(names.includes('PlaceRequests') && names.includes('workspaces'), 'the walk read the exports and their nested properties');
  assert.deepEqual(gitWords(names), []);
  for (const word of Object.keys(ALLOWED)) {
    assert.ok(!REFUSED_WORDS.includes(word), `${word} is one of git's words the contract refuses: it cannot also be allowed`);
    assert.ok(
      names.some((name) => wordsOf(name).includes(word)),
      `${word} is allowed and said: where the contract no longer says it, take it off`,
    );
  }
});

test('REFUSED: a git word in a nested property of an exported type, and an allowed word let through', () => {
  const door = [
    'type Inner = { lineHead: string };',
    'export type X = { head: string; inner: Inner; list: readonly { isDetached: boolean }[] };',
    'export type Y = { branch: string };',
  ].join('\n');
  assert.deepEqual(gitWords(namesIn(door)), ['head (head)', 'isDetached (detached)', 'lineHead (head)']);
  assert.deepEqual(wordsOf('PLACE_VERBS'), ['place', 'verbs']);
  assert.deepEqual(wordsOf('inProgressFile'), ['in', 'progress', 'file']);
});
