/**
 * One component a schema: the api's document (`OpenApi.fromApi(Api)`) holds no second component of a schema, `<Name>_<n>`, but the ones
 * the `httpApiStatus: 201` pipes make today (`MADE_BY_201`). A schema with an `identifier` annotated again where it is used becomes such
 * a second component, whose every field is owed again (`packages/objects/CLAUDE.md`, *Traps*): describe it where it is defined. The
 * list only shrinks: a name it holds that the document no longer makes is refused too, so it is taken off in the same commit.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { OpenApi } from 'effect/http-api';
import { Api } from 'objects';

/** The second components the `httpApiStatus: 201` pipes of `api.ts` and `proposal-api.ts` make today, by name. */
const MADE_BY_201: readonly string[] = ['Agent_1', 'Card_1', 'Proposal_1', 'Skill_1', 'Workflow_1'];

/** A component's name as the document gives a second one of a schema: its name, `_`, and a number. */
const SECOND = /^.+_\d+$/;

/**
 * What the document's component names and the list disagree on, each a sentence naming the fix.
 *
 * @param names The names of the document's components.
 * @param kept The second components the list allows, by name.
 */
export const breaks = (names: readonly string[], kept: readonly string[]) => [
  ...names
    .filter((name) => SECOND.test(name) && !kept.includes(name))
    .map(
      (name) =>
        `the document holds ${name}, a second component of ${name.replace(/_\d+$/, '')}: a schema with an identifier was annotated ` +
        'where it is used; refer to it bare, and describe it where it is defined',
    ),
  ...kept
    .filter((name) => !names.includes(name))
    .map((name) => `the document no longer holds ${name}: take it off MADE_BY_201 in test/one-component.test.ts, which only shrinks`),
];

test('the document holds no second component of a schema but those the 201 pipes make', () => {
  const names = Object.keys(OpenApi.fromApi(Api).components?.schemas ?? {});
  assert.deepEqual(breaks(names, MADE_BY_201), []);
});

test('REFUSED: a second component the list does not name, and a name on the list the document no longer makes', () => {
  assert.equal(breaks(['Actor', 'Actor_1', 'Labels', 'Labels_2'], []).length, 2, 'Actor_1 and Labels_2, made by a use-site annotation');
  assert.equal(breaks(['Card', 'Card_1'], ['Card_1']).length, 0, 'one the list names');
  assert.equal(breaks(['Card'], ['Card_1']).length, 1, 'a name on the list the document no longer makes');
  assert.equal(breaks(['Run', 'RunList', 'StepTry'], []).length, 0, 'no second component');
});
