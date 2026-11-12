/**
 * The names a template's check knows the builtin places' needs by (`SHIPPED_PLACE_NEEDS`, which `template.store.ts` reads in place of
 * the place's code) are the git place's own: read off the real place, its whole subject.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIPPED_PLACE_NEEDS } from './place.ts';
import { builtinGitPlace } from './builtin.store.ts';

test("the needs the template's check knows the shipped places by are the git place's own, by name", () => {
  assert.deepEqual(
    (builtinGitPlace.declared.needs ?? []).map((need) => need.name),
    SHIPPED_PLACE_NEEDS,
  );
});
