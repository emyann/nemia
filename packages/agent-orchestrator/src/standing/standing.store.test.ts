/**
 * `standing.json` read back (`readStanding`): an answer a former nemia kept, its tips written `heads`, reads as the same answer written
 * `tips`, since the file outlives the rename of the place's words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readStanding, standingFile } from './standing.store.ts';

/** `standing.json` holding one read of `repo` whose answer's tips are under `key`. */
const kept = (key: 'heads' | 'tips') => ({
  v: 1,
  at: '2026-10-01T00:00:00.000Z',
  places: [
    {
      repo: '/repo',
      base: 'main',
      at: '2026-10-01T00:00:00.000Z',
      answer: {
        [key]: { main: 'a'.repeat(40), 'wf/r-1/run': 'b'.repeat(40) },
        branches: [{ branch: 'wf/r-1/run', tip: 'b'.repeat(40), onBase: 'no', pastBase: null, ahead: 1 }],
      },
    },
  ],
});

/** What `readStanding` reads of `file`, written as the store's own. */
const readOf = (file: object) => {
  fs.mkdirSync(path.dirname(standingFile()), { recursive: true });
  fs.writeFileSync(standingFile(), JSON.stringify(file));
  return readStanding();
};

test("a kept answer written with a former nemia's `heads` reads as its `tips`, the same as one written `tips`", () => {
  const now = readOf(kept('tips'));
  assert.deepEqual(readOf(kept('heads')), now);
  const [place] = now?.places ?? [];
  assert.ok(place && 'answer' in place, 'the place answered');
  assert.deepEqual(Object.keys(place.answer.tips), ['main', 'wf/r-1/run']);
  assert.ok(!('heads' in place.answer), 'and no `heads` is left on it');
});
