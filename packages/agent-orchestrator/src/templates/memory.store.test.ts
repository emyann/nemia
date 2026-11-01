/**
 * The Template door's memory stand-in, held to the door's walks (`test/template-walks.ts`), each on a stand-in of its own: what the
 * files say (`templates.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, templateDoorMemory } from './memory.store.ts';
import { TemplateDoor } from './templates.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { TEMPLATE_WALKS } from '../../test/template-walks.ts';

for (const [name, body] of walksOn(TEMPLATE_WALKS, () => ({
  door: doorFrom(TemplateDoor, templateDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
