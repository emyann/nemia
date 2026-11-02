/**
 * Every file of `src` that still calls the stores the Agent and Skill doors are over — agents found, loaded or versioned (`agentsFor`,
 * `loadAgents`, `agentVersion`), skills found, read, versioned or listed (`skillsFor`, `skillRead`, `skillVersion`, `skillFolders`), a
 * definition written, removed or copied (`writeAgent`, `removeAgent`, `writeSkill`, `copySkill`), or a person's custom instructions read,
 * written or cleared — rather than yielding the doors (`AgentDoor`, `src/agents/agent-door.store.ts`; `SkillDoor`,
 * `src/skills/skill-door.store.ts`), with how many calls do (`src/agents/agent-door.store.test.ts`). A debt, and nothing else: a call left
 * on the seam is a synchronous caller not yet converted, and none is left. S5c moved the board's agent and skill writers and readers
 * (`library.verb.ts`, `custom.verb.ts`, `skills.verb.ts`, `copy.verb.ts`); the Workflow door's read and write then found a workflow's
 * agents and skills through the doors, taking `write.store.ts` off; the workflow's version, the revisions pinned and the start then read
 * through them too, taking `version.store.ts`, `pin.verb.ts` and `start.verb.ts` off; and the tick's told, the policy verbs and Nemia's
 * keeper (custom instructions read with no repository), the sources, the copy's judgement, the template export and the roster then did,
 * taking `told.verb.ts`, `auto.verb.ts`, `level.store.ts`, `sources.store.ts`, `copy.store.ts`, `template.store.ts` and `roster.store.ts`
 * off. Last, the folder's own load found a folder's agents and skills off their stores (`foundAt`); it is gone, and the synchronous
 * `loadWorkflows` reads through the doors' files layers in the Workflow door's file, taking `folder.store.ts` off. The api's `src` is
 * counted by the same test with no debt at all.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the stores the doors are over, comments left out. */
export const AGENT_DOOR_DEBT: Readonly<Record<string, number>> = {};
