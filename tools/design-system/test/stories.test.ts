/**
 * What a story declares, read as Storybook reads it (`src/stories/declared.ts`), and the fate the producer gives it before anything is
 * drawn (`storyFate`): a meta's tags apply to every story, `!<tag>` takes one off, and handlers named with no tag are refused. And every
 * story file of the board reads as a card the build can name (`boardStories`), so a title the build cannot read is refused by
 * `npm run rules`, not first by `ci`'s design-system job.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { storyFate } from '../src/decide.ts';
import { declaredOf, mergedTags } from '../src/stories/declared.ts';
import { boardStories, storyNames } from '../src/stories/stories.ts';

test("a meta's tags reach every story, a story's add to them, and !<tag> takes one back off", () => {
  assert.deepEqual(mergedTags([['network', 'a'], ['b']]), ['network', 'a', 'b']);
  assert.deepEqual(mergedTags([['network'], ['!network', 'overlay']]), ['overlay']);
  assert.deepEqual(declaredOf({ tags: ['network'] }, { tags: ['!network'] }), { tags: [], msw: false });
});

test("handlers named on the meta or the story count, the story's over the meta's", () => {
  assert.equal(declaredOf({ parameters: { msw: [] } }, {}).msw, true);
  assert.equal(declaredOf({}, { parameters: { msw: { handlers: [] } } }).msw, true);
  assert.equal(declaredOf({ parameters: { layout: 'padded' } }, { parameters: {} }).msw, false);
});

test('a tagged story is left out, a plain one drawn, and REFUSED: one that names handlers and no tag', () => {
  assert.equal(storyFate(declaredOf({ tags: ['network'], parameters: { msw: [] } }, {})), 'network');
  assert.equal(storyFate(declaredOf({}, { tags: ['overlay'] })), 'overlay');
  assert.equal(storyFate(declaredOf({}, {})), 'card');
  assert.equal(storyFate(declaredOf({ parameters: { msw: [] } }, {})), 'undeclared');
  assert.equal(storyFate(declaredOf({ tags: ['network'], parameters: { msw: [] } }, { tags: ['!network'] })), 'undeclared');
});

test('a story file exports its stories in the order it writes them', () => {
  assert.deepEqual(storyNames('const meta = {};\nexport default meta;\nexport const B: Story = {};\nexport const A = () => null;\n'), [
    'B',
    'A',
  ]);
});

test('every story file of the board reads as a card: its title opens with a group, and no two share a base name', () => {
  assert.ok(boardStories().length > 0);
});
