/**
 * The approved pictures are the stories' (`.storybook/approved.ts`, `unapprovedOf`): every story Storybook finds has its dark picture in
 * `test/approved/`, every light canary its light one in `test/approved/light/`, every canary names a story, and no picture is of a
 * story that is gone or of a story that is no canary, since Vitest writes a reference and never prunes one. The story ids are read off
 * the story files as Storybook makes them (`knownIds`, `e2e/stories/changed.ts`). Needs no browser.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { APPROVED, LIGHT, LIGHT_CANARIES, unapprovedOf } from '../.storybook/approved.ts';
import { knownIds } from './e2e/stories/changed.ts';

/** The board's folder. */
const WEB = path.resolve(import.meta.dirname, '..');

/** The ids the pictures of `folder` are named by: each `<id>.png` there, no folder below it. */
const namedIn = (folder: string): string[] =>
  fs.existsSync(folder)
    ? fs
        .readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.png'))
        .map((entry) => entry.name.slice(0, -'.png'.length))
        .sort()
    : [];

test('every story has its approved picture, each canary its light one, and no picture is astray', () => {
  const stories = knownIds(path.resolve(WEB, '..', '..'));
  assert.ok(stories.length > 0, 'the story ids are read off the story files');
  const folder = path.join(WEB, APPROVED);
  const owed = unapprovedOf(stories, namedIn(folder), namedIn(path.join(folder, LIGHT)), LIGHT_CANARIES);
  const said = [
    owed.unpictured.length
      ? `no approved picture: ${owed.unpictured.join(', ')} (draw them: npm run stories -- --update, from apps/web)`
      : '',
    owed.stray.length ? `no story's: ${owed.stray.map((id) => `${APPROVED}/${id}.png`).join(', ')} (git rm them)` : '',
    owed.lightUnpictured.length
      ? `no light picture: ${owed.lightUnpictured.join(', ')} (draw them: npm run stories -- --update, from apps/web)`
      : '',
    owed.lightStray.length ? `no canary's: ${owed.lightStray.map((id) => `${APPROVED}/${LIGHT}/${id}.png`).join(', ')} (git rm them)` : '',
    owed.notAStory.length ? `canaries naming no story: ${owed.notAStory.join(', ')} (LIGHT_CANARIES, .storybook/approved.ts)` : '',
  ].filter(Boolean);
  assert.deepEqual(said, [], said.join('\n'));
});
