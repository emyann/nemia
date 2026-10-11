/**
 * The test place's side of the place's contract: every walk of `WALKS` (`place-walks.ts`) asked of a new test place, with no process,
 * which must say what the git place says (`git-place.boundary.test.ts` runs the same walks on git). Then that the contract bites: a
 * test place that lies about one verb fails a walk of that verb, for every verb, and a verb with no walk is named.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testPlace } from '../place/memory/index.ts';
import { PLACE_VERBS, type PlaceAnswers, type PlaceVerb } from '../src/place/place.ts';
import { placeOver, type OwnVerbs } from './place-over.ts';
import { failing, unwalked, walksOn, WALKS, type Side } from './place-walks.ts';

walksOn(testPlace);

/** A commit no walk makes. */
const NO_COMMIT = 'f'.repeat(40);

/** For each verb, an answer the git place would not give, made of the true one. */
const LIES: { readonly [V in PlaceVerb]: (answer: PlaceAnswers[V]) => PlaceAnswers[V] } = {
  open: (answer) => ({ ...answer, staged: `${answer.staged}.elsewhere` }),
  make: (answer) => ({ ...answer, conflicts: [] }),
  handoff: () => ({ commit: null }),
  report: (answer) => ({ ...answer, files: Object.fromEntries(Object.keys(answer.files).map((branch) => [branch, []])) }),
  standing: (answer) => ({ ...answer, heads: Object.fromEntries(Object.entries(answer.heads).slice(1)) }),
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
