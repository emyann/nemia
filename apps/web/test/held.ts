/**
 * How a test holds what it finds to the baseline's lists (`baseline.ts`), the stories test's and the rulebook's alike: what it finds
 * that the list does not hold is refused, and what the list holds that it no longer finds is refused too, naming the file to cut it
 * from, so a list only shrinks.
 */
import assert from 'node:assert/strict';
import { REPO } from 'test-kit/repo';
import type { BaselineList } from '../contracts/baseline-shard.contract.ts';
import { FOLDER, readBaseline, shardOf } from './baseline.ts';

/**
 * What `found` holds that `listed` does not (`added`), and what `listed` holds that `found` no longer does (`stale`).
 * @param found What a rule finds in the tree.
 * @param listed What the baseline lists.
 */
export const against = (found: readonly string[], listed: readonly string[]) => ({
  added: found.filter((one) => !listed.includes(one)),
  stale: listed.filter((one) => !found.includes(one)),
});

/**
 * The entries the tree's baseline lists on `list`, every file's lines together.
 * @param list The list read.
 */
export const listed = (list: BaselineList) => readBaseline(REPO).lists[list].flatMap(({ entries }) => entries);

/**
 * Asserts `found` is the baseline's `list` exactly, naming what to mend, and for each mended entry the file it is cut from: the line,
 * or the whole file where it is the last.
 * @param found What the rule finds in the tree.
 * @param list The list it is held to.
 * @param instead What to write in place of a new entry, said with the refusal.
 */
export const heldTo = (found: readonly string[], list: BaselineList, instead = 'mend each of these') => {
  const { added, stale } = against(found, listed(list));
  assert.deepEqual(added, [], `${instead}: never add one to ${FOLDER}${list}/`);
  assert.deepEqual(
    stale.map((entry) => `${shardOf(list, entry)}: ${entry}`),
    [],
    'each of these is mended: cut its line from the file named, and delete the file where it is the last line (git rm <file>)',
  );
};
