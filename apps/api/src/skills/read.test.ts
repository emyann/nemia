/**
 * `POST /api/skills/read`: a skill's SKILL.md, read into its spec by the package's own reader (`skillDraftOf`), writing nothing, in no
 * namespace. Its answer is the spec a GET of the same file written to your library answers, named by its `name:`, else by the name sent;
 * a SKILL.md that does not read is refused naming the file, and one that names no skill with no name sent is refused.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Skill, SkillDrafted } from 'objects';
import { app } from '../app.ts';

const SKILLS = path.join(root, 'workflows', 'skills');
const TIDY = '---\nname: tidy\ndescription: Tidy a folder.\ntags: [chores]\n---\nTidy it.\n';

const read = (body: unknown) =>
  app.request('/api/skills/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Every file under the store, by its path there: what a read must leave as it was. */
const storeNow = (): string[] => (fs.existsSync(root) ? (fs.readdirSync(root, { recursive: true }) as string[]).sort() : []);

test('a SKILL.md reads as the spec a GET of the same file in your library answers, named by its name:, and writes nothing', async () => {
  fs.mkdirSync(path.join(SKILLS, 'tidy'), { recursive: true });
  fs.writeFileSync(path.join(SKILLS, 'tidy', 'SKILL.md'), TIDY);
  const got = await app.request('/api/namespaces/default/skills/tidy?origin=yours');
  const skill = (await got.json()) as Skill;
  assert.equal(got.status, 200, JSON.stringify(skill));
  assert.equal(skill.status.error, null, 'the file written to yours reads');
  fs.rmSync(path.join(SKILLS, 'tidy'), { recursive: true });

  const before = storeNow();
  const res = await read({ name: 'other', files: [{ path: 'SKILL.md', text: TIDY }] });
  const answer = (await res.json()) as SkillDrafted;
  assert.equal(res.status, 200, JSON.stringify(answer));
  assert.deepEqual(answer, { metadata: { name: 'tidy' }, spec: skill.spec }, 'its name: wins over the name sent');
  const unnamed = TIDY.replace('name: tidy\n', '');
  const named = (await (await read({ name: 'sweep', files: [{ path: 'SKILL.md', text: unnamed }] })).json()) as SkillDrafted;
  assert.equal(named.metadata.name, 'sweep', 'one that says no name: is read under the name sent');
  assert.deepEqual(storeNow(), before, 'a read writes nothing');
});

test('REFUSED: a SKILL.md that does not read, naming the file; one that names no skill, with no name sent; no file at all', async () => {
  for (const [what, body, names] of [
    ['a file that does not read', { files: [{ path: 'SKILL.md', text: '---\nname: tidy\n---\nNo description.\n' }] }, 'SKILL.md'],
    ['no name anywhere', { files: [{ path: 'SKILL.md', text: TIDY.replace('name: tidy\n', '') }] }, 'name'],
    ['no file', { files: [] }, 'files'],
  ] as const) {
    const before = storeNow();
    const res = await read(body);
    const { error } = (await res.json()) as { error: string };
    assert.ok([400, 422].includes(res.status), `${what}: ${res.status} ${error}`);
    assert.ok(error.includes(names), `${what}: ${JSON.stringify(error)} names ${names}`);
    assert.deepEqual(storeNow(), before, `${what}: a refused read writes nothing`);
  }
});
