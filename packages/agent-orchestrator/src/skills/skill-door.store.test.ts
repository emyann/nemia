/**
 * The Skill door's files layer: the door's walks (`test/skill-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — the model's check made before any layer acts, the default door's root, a link never written through, a copy staged
 * beside where it goes, so one that fails part-way leaves no half a skill, and a file of a skill that is not text — a picture — never
 * read among its other files nor touched by a write that gives them, nor a link among them written through.
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
import { scratch } from 'test-kit/scratch';
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
    skills: {
      found: unreached,
      list: unreached,
      read: unreached,
      there: () => ({ kind: 'none' }),
      write: unreached,
      copy: unreached,
      others: unreached,
    },
  };
  const door = skillDoorOver(layer);
  for (const description of [null, ' ', 'one\npreload: true'])
    assert.deepEqual(act(door.skills.write(SkillName.read('tidy-notes'), aSkill('tidy-notes', { description }), undefined, '/s/skills')), {
      refused: 'Invalid',
    });
});

test("a picture in a skill's folder is not among its other files, and a write that gives them leaves it as it was", () => {
  const { library, door } = store();
  const files = [{ path: 'notes/how.md', text: 'One fact a line.\n' }];
  const { version } = done(door.skills.write(SkillName.read('tidy-notes'), { ...aSkill(), files }, undefined, library));
  const picture = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1]);
  fs.mkdirSync(path.join(library, 'tidy-notes', 'img'));
  fs.writeFileSync(path.join(library, 'tidy-notes', 'img', 'logo.png'), picture);
  assert.deepEqual(done(door.skills.others(SkillName.read('tidy-notes'), library)), files);
  const moved = done(door.skills.there(SkillName.read('tidy-notes'), library));
  assert.ok(moved.kind === 'held' && moved.version !== version, 'the picture is counted in the version all the same');
  done(door.skills.write(SkillName.read('tidy-notes'), { ...aSkill(), files: [] }, moved.kind === 'held' ? moved.version : '', library));
  assert.deepEqual(done(door.skills.others(SkillName.read('tidy-notes'), library)), []);
  assert.equal(fs.existsSync(path.join(library, 'tidy-notes', 'notes', 'how.md')), false);
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(library, 'tidy-notes', 'img', 'logo.png'))), picture);
});

test('REFUSED: a file a write gives at a link in the skill is never written through, Invalid, what it points at as it was', () => {
  const { library, door } = store();
  done(door.skills.write(SkillName.read('tidy-notes'), aSkill(), undefined, library));
  const outside = scratch('wf-skill-outside-');
  fs.symlinkSync(outside, path.join(library, 'tidy-notes', 'notes'));
  const files = [{ path: 'notes/how.md', text: 'Through.\n' }];
  const now = done(door.skills.there(SkillName.read('tidy-notes'), library));
  assert.deepEqual(
    act(door.skills.write(SkillName.read('tidy-notes'), { ...aSkill(), files }, now.kind === 'held' ? now.version : '', library)),
    { refused: 'Invalid' },
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});
