/**
 * Every file of `src` that still calls the stores the Agent and Skill doors are over — agents found, loaded or versioned (`agentsFor`,
 * `loadAgents`, `agentVersion`), skills found, read, versioned or listed (`skillsFor`, `skillRead`, `skillVersion`, `skillFolders`), a
 * definition written, removed or copied (`writeAgent`, `removeAgent`, `writeSkill`, `copySkill`), or a person's custom instructions
 * read, written or cleared — rather than yielding the doors (`AgentDoor`, `src/agents/agent-door.store.ts`; `SkillDoor`,
 * `src/skills/skill-door.store.ts`), with how many calls do (`src/agents/agent-door.store.test.ts`). A debt, and nothing else: a call left
 * on the seam is a synchronous caller not yet converted, named for a follow-up — the folder's load for its synchronous readers
 * (`foundAt`, `loadWorkflows`), the workflow's version with the revisions pinned, the roster, a start, the tick's told, a template, the
 * store's own agent, the sources and the copy's judgement. S5c moved the board's agent and skill writers and readers (`library.verb.ts`,
 * `custom.verb.ts`, `skills.verb.ts`, `copy.verb.ts`); the Workflow door's read and write then found a workflow's agents and skills
 * through the doors, taking `write.store.ts` off. The api's `src` is counted by the same test with no debt at all.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the stores the doors are over, comments left out. */
export const AGENT_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/auto/auto.verb.ts': 2,
  'src/folder/folder.store.ts': 2,
  'src/folder/version.store.ts': 3,
  'src/nemia/level.store.ts': 1,
  'src/revisions/pin.verb.ts': 4,
  'src/roster/roster.store.ts': 5,
  'src/sources/copy.store.ts': 2,
  'src/sources/sources.store.ts': 1,
  'src/start/start.verb.ts': 2,
  'src/template/template.store.ts': 2,
  'src/tick/told.verb.ts': 1,
};
