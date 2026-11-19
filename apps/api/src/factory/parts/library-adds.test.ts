/**
 * What a factory adds from the store's library (`/api/namespaces/<factory>/libraryadds/<kind>.<name>`, factory/parts/library-adds.ts),
 * beside the library itself (`/api/skills`): a skill made in the library, added to a factory, listed with the factories that add it, its
 * removal refused naming them, its add shown `missing` once the library loses it, and the add taken off — in a scratch store whose
 * factory is filed with the package's own verb. Every add is read back from the factory's record of its adds.
 */
import { root } from '../../../test/harness.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { addFactory } from 'agent-orchestrator/testing';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { app } from '../../app.ts';

type LibraryAdd = import('objects').LibraryAdd;
type LibraryAddList = import('objects').LibraryAddList;
type Skill = import('objects').Skill;
type SkillList = import('objects').SkillList;

addFactory({ name: 'shop', volumes: [scratch('nemia-api-adds-repo-')].map((r) => `${r}:rw`) });

const ADDS = '/api/namespaces/shop/libraryadds';
const RECORD = path.join(root, 'factories', 'shop', 'library.json');
const json = { 'content-type': 'application/json' };
const send = (method: string, url: string, body?: unknown) => app.request(url, { method, headers: json, body: JSON.stringify(body ?? {}) });

/** The body `res` answered, which must be `status`. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

const tidy = { title: 'Tidy notes', description: 'Rewrites notes.', tags: ['notes'], examples: ['tidy my notes'], body: 'Tidy.' };

describe('a person adds a skill of the library to a factory: listed with it, served in its namespace, its removal refused naming it, missing once the library loses it, and the add taken off, no longer served there', () => {
  const s = story(test);
  s.test('a skill is made at the library, in no namespace, with no factory adding it', async () => {
    const made = await answered<Skill>(send('POST', '/api/skills', { metadata: { name: 'tidy' }, spec: tidy }), 201);
    assert.deepEqual([made.metadata.namespace, made.status.origin], [undefined, 'user']);
    const listed = await answered<SkillList>(app.request('/api/skills'));
    assert.deepEqual(listed.items.find((one) => one.metadata.name === 'tidy')?.status.factories, []);
    assert.ok(
      listed.items.every((one) => one.status.origin === 'user' || one.status.origin === 'builtin'),
      'the library lists the user library and the builtins alone',
    );
  });
  s.test('added to the factory, the add is recorded and resolved, and the library says the factory adds it', async () => {
    const add = await answered<LibraryAdd>(send('PUT', `${ADDS}/Skill.tidy`));
    assert.deepEqual([add.spec, add.status.state, add.status.recorded], [{ kind: 'Skill', name: 'tidy' }, 'resolved', true]);
    assert.ok(fs.existsSync(RECORD), 'the adds are recorded in the factory own file');
    const list = await answered<LibraryAddList>(app.request(ADDS));
    assert.ok(list.items.some((one) => one.metadata.name === 'Skill.tidy'));
    const skill = await answered<Skill>(app.request('/api/skills/tidy'));
    assert.deepEqual(skill.status.factories, ['shop']);
    const served = await answered<SkillList>(app.request('/api/namespaces/shop/skills'));
    assert.ok(
      served.items.some((one) => one.metadata.name === 'tidy'),
      'the factory serves what it added',
    );
  });
  s.test('REFUSED: the removal of a skill a factory adds is a 409 naming each factory, and the skill is kept', async () => {
    const skill = await answered<Skill>(app.request('/api/skills/tidy'));
    const res = await app.request(`/api/skills/tidy?resourceVersion=${skill.metadata.resourceVersion}`, {
      method: 'DELETE',
      headers: json,
    });
    assert.equal(res.status, 409);
    assert.deepEqual(((await res.json()) as { users?: string[] }).users, ['shop']);
    assert.ok(fs.existsSync(path.join(root, 'workflows', 'skills', 'tidy', 'SKILL.md')));
  });
  s.test("REFUSED: a skill made in a factory's namespace is a 422 naming the factory's way, a proposal", async () => {
    const res = await send('POST', '/api/namespaces/shop/skills', { metadata: { name: 'other' }, spec: tidy });
    assert.equal(res.status, 422);
    assert.equal(((await res.json()) as { way?: string }).way, 'factory');
  });
  s.test('the skill gone from the library by hand, its add shows missing, with the fix', async () => {
    const kept = path.join(scratch('nemia-api-adds-kept-'), 'tidy');
    fs.renameSync(path.join(root, 'workflows', 'skills', 'tidy'), kept);
    const add = await answered<LibraryAdd>(app.request(`${ADDS}/Skill.tidy`));
    assert.equal(add.status.state, 'missing');
    assert.ok(add.status.message, 'a missing add says what to do');
    fs.renameSync(kept, path.join(root, 'workflows', 'skills', 'tidy'));
  });
  s.test('the add taken off, the skill is removed from the library', async () => {
    await answered<LibraryAdd>(send('DELETE', `${ADDS}/Skill.tidy`));
    assert.equal((await app.request(`${ADDS}/Skill.tidy`)).status, 404, 'no add of that name now');
    const served = await answered<SkillList>(app.request('/api/namespaces/shop/skills'));
    assert.ok(!served.items.some((one) => one.metadata.name === 'tidy'), 'its record without tidy, the factory serves it no more');
    assert.equal((await app.request('/api/namespaces/shop/skills/tidy')).status, 404, 'nor reads it by name');
    const skill = await answered<Skill>(app.request('/api/skills/tidy'));
    const res = await app.request(`/api/skills/tidy?resourceVersion=${skill.metadata.resourceVersion}`, {
      method: 'DELETE',
      headers: json,
    });
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(fs.existsSync(path.join(root, 'workflows', 'skills', 'tidy')), false);
  });
});

test('REFUSED: an add of a name the library does not hold, and of a name that is no add', async () => {
  assert.equal((await send('PUT', `${ADDS}/Skill.nowhere`)).status, 404);
  assert.equal((await send('PUT', `${ADDS}/Gadget.x`)).status, 404);
});
