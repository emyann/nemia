/**
 * The Workflow door's memory stand-in, held to the door's walks (`test/workflow-walks.ts`), each on a stand-in of its own: what the files
 * say (`workflows.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, workflowDoorMemory } from './memory.store.ts';
import { WorkflowDoor } from './workflows.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { WORKFLOW_WALKS } from '../../test/workflow-walks.ts';

for (const [name, body] of walksOn(WORKFLOW_WALKS, () => ({
  door: doorFrom(WorkflowDoor, workflowDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
