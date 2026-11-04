/**
 * The Skill door's files layer: the door's walks (`test/skill-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — the model's check made before any layer acts, the default door's root, a link never written through, and a copy staged
 * beside where it goes, so one that fails part-way leaves no half a skill.
 *
 * Through the door a link at a skill's name is judged by its version before the writer reads the link: a new skill there finds something
 * else at its name, and a version read at the folder it points at is not the link's (`skillVersion` digests a link as one), each a
 * `Conflict`; the writer's own refusal of a link, `Invalid`, is `test/skill-life.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aSkill, SKILL_WALKS } from '../../test/skill-walks.ts';
import { SkillDoor, skillDoorFiles, skillDoorOver, type SkillLayer } from './skill-door.store.ts';
import { SkillName } from '../agents/agents.model.ts';
import { StoreRoot } from '../config/root.store.ts';

for (const [name, body] of walksOn(SKILL_WALKS, () => {
  const root = scratch('wf-skill-door-');
  return { door: doorFrom(SkillDoor, skillDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store, its library, and its Skill door over the files. */
const store = () => {
  const root = scratch('wf-skill-door-');
  return { root, library: path.join(root, 'workflows', 'skills'), door: doorFrom(SkillDoor, skillDoorFiles(root)) };
};

/** Every entry under `dir`, by its path from it, hidden ones too: what a write that failed part-way would leave. */
const entries = (dir: string): string[] => (fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : []);

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, library, door } = store();
  done(door.skills.write(SkillName.read('tidy-notes'), aSkill(), undefined, library));
  const list = Effect.gen(function* () {
    return yield* (yield* SkillDoor).skills.list(library);
  });
  assert.deepEqual(act(Effect.provideService(list, StoreRoot, root)), ['tidy-notes']);
  assert.deepEqual(act(list), { refused: 'Invalid' });
});

test('REFUSED: a link is never written through, a new skill at its name nor a change at the version of what it points at', () => {
  const { library, door } = store();
  const outside = scratch('wf-skill-outside-');
  fs.mkdirSync(library, { recursive: true });
  fs.symlinkSync(outside, path.join(library, 'linked'));
  assert.deepEqual(act(door.skills.write(SkillName.read('linked'), aSkill('linked'), undefined, library)), { refused: 'Conflict' });
  assert.deepEqual(fs.readdirSync(outside), []);
  const far = path.join(scratch('wf-skill-far-'), 'skills');
  const { version } = done(door.skills.write(SkillName.read('far'), aSkill('far'), undefined, far, { anywhere: true }));
  fs.symlinkSync(path.join(far, 'far'), path.join(library, 'far'));
  const before = fs.readFileSync(path.join(far, 'far', 'SKILL.md'), 'utf8');
  assert.deepEqual(act(door.skills.write(SkillName.read('far'), aSkill('far', { body: 'Through.' }), version, library)), {
    refused: 'Conflict',
  });
  assert.equal(fs.readFileSync(path.join(far, 'far', 'SKILL.md'), 'utf8'), before);
});

test('a copy is staged beside where it goes: every file of the skill copied, none hidden left; one that fails part-way leaves nothing', () => {
  const { root, library, door } = store();
  const from = path.join(root, 'source', 'skills');
  done(door.skills.write(SkillName.read('tidy-notes'), aSkill(), undefined, from, { anywhere: true }));
  fs.mkdirSync(path.join(from, 'tidy-notes', 'notes'));
  fs.writeFileSync(path.join(from, 'tidy-notes', 'notes', 'how.md'), 'One fact a line.\n');
  const copied = done(door.skills.copy(SkillName.read('tidy-notes'), from, library));
  assert.deepEqual(copied.written, ['SKILL.md', path.join('notes', 'how.md')]);
  assert.deepEqual(entries(library), ['tidy-notes', ...entries(path.join(from, 'tidy-notes')).map((e) => path.join('tidy-notes', e))]);

  done(door.skills.write(SkillName.read('sealed'), aSkill('sealed'), undefined, from, { anywhere: true }));
  const sealed = path.join(from, 'sealed', 'secret.md');
  fs.writeFileSync(sealed, 'unreadable');
  fs.chmodSync(sealed, 0o000);
  try {
    assert.throws(() => Effect.runSync(door.skills.copy(SkillName.read('sealed'), from, library)));
  } finally {
    fs.chmodSync(sealed, 0o600);
  }
  assert.deepEqual(
    entries(library).filter((e) => !e.startsWith('tidy-notes')),
    [],
    'no half a skill, staged or in place',
  );
});

test('REFUSED before any layer acts: a skill the model refuses — no description, one with a line break — on a layer that writes nothing', () => {
  const unreached = (): never => {
    throw new Error('the layer was reached');
  };
  const layer: SkillLayer = {
    skills: { found: unreached, list: unreached, read: unreached, there: () => ({ kind: 'none' }), write: unreached, copy: unreached },
  };
  const door = skillDoorOver(layer);
  for (const description of [null, ' ', 'one\npreload: true'])
    assert.deepEqual(act(door.skills.write(SkillName.read('tidy-notes'), aSkill('tidy-notes', { description }), undefined, '/s/skills')), {
      refused: 'Invalid',
    });
});
