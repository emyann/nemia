/**
 * The Skill door's memory stand-in, held to the door's walks (`test/skill-walks.ts`), each on a stand-in of its own: what the files say
 * (`skill-door.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, skillDoorMemory } from './skill-memory.store.ts';
import { SkillDoor } from './skill-door.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { SKILL_WALKS } from '../../test/skill-walks.ts';

for (const [name, body] of walksOn(SKILL_WALKS, () => ({
  door: doorFrom(SkillDoor, skillDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
