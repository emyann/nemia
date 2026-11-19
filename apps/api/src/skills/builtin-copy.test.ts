/**
 * A copy of a builtin skill into the user library (`POST /api/skills/<name>/copy`, skills/handlers.ts): the builtin's digest recorded at
 * the copy, the copy served `builtinChanged: false` while the builtin is as copied, and `true` once the two differ. The builtin's folder
 * is the package's own, so its change is stood in for by the digest the copy recorded, which is what the comparison reads.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';

type Skill = import('objects').Skill;

const COPIES = path.join(root, 'workflows', 'copies.json');
const json = { 'content-type': 'application/json' };

/** The library's skill `name`, read at the store's level. */
const read = async (name: string) => {
  const res = await app.request(`/api/skills/${name}`);
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Skill;
};

test("a builtin skill copied to the user library records the builtin's digest, and is flagged once the builtin differs", async () => {
  const copy = await app.request('/api/skills/grilling/copy', { method: 'POST', headers: json, body: '{}' });
  assert.ok(copy.status < 300, await copy.clone().text());
  const copies = JSON.parse(fs.readFileSync(COPIES, 'utf8')) as { copies: Record<string, string> };
  assert.equal(typeof copies.copies['Skill/grilling'], 'string', 'the digest at the copy is recorded');
  const now = await read('grilling');
  assert.deepEqual([now.status.origin, now.status.builtinChanged], ['user', false], 'as copied, nothing changed');
  fs.writeFileSync(COPIES, `${JSON.stringify({ copies: { 'Skill/grilling': 'v-before-the-builtin-moved' } })}\n`);
  assert.equal((await read('grilling')).status.builtinChanged, true, 'the builtin differs from what was copied');
});
