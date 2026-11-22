/**
 * The names a text uses as an image's or a link's target (`namedInText`, `inputs.ts`), `name` or `./name`: what a card's text names
 * of its files, and what a run's brief names of its inputs.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { namedInText } from './inputs.ts';

test('the names a text uses as an image or a link target are found, bare or after ./, and no other', () => {
  const body = 'See ![a](shot.png) and [the log](./run.log "title"), not notes.pdf, nor ![x](https://example.com/shot.png).';
  assert.deepEqual(namedInText(body, ['shot.png', 'run.log', 'notes.pdf']), ['shot.png', 'run.log']);
});
