/**
 * The Agent door's memory stand-in, held to the door's walks (`test/agent-walks.ts`), each on a stand-in of its own: what the files say
 * (`agent-door.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { agentDoorMemory, MEMORY_ROOT } from './agent-memory.store.ts';
import { AgentDoor } from './agent-door.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { AGENT_WALKS } from '../../test/agent-walks.ts';

for (const [name, body] of walksOn(AGENT_WALKS, () => ({
  door: doorFrom(AgentDoor, agentDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
