/**
 * The Workflow door's memory stand-in, held to the door's walks (`test/workflow-walks.ts`), each on a stand-in of its own, given the
 * Agent and Skill doors' own stand-ins to find a workflow's agents and skills through: what the files say (`workflows.store.test.ts` runs
 * the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, workflowDoorMemory } from './memory.store.ts';
import { WorkflowDoor } from './workflows.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { agentDoorMemory } from '../agents/agent-memory.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { skillDoorMemory } from '../skills/skill-memory.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { WORKFLOW_WALKS, type WorkflowSide } from '../../test/workflow-walks.ts';

for (const [name, body] of walksOn(WORKFLOW_WALKS, (): WorkflowSide => {
  const defs = { agents: doorFrom(AgentDoor, agentDoorMemory()), skills: doorFrom(SkillDoor, skillDoorMemory()) };
  return { door: doorFrom(WorkflowDoor, workflowDoorMemory(defs)), root: MEMORY_ROOT, layer: 'memory', defs };
}))
  test(name, body);
