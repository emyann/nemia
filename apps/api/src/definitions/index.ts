/**
 * The definitions — the Workflows, Agents and Skills a namespace resolves — served through `objects`' Api: each kind's handlers
 * (`workflows.ts`, `agents.ts`, `skills.ts`) and what they share (`served.ts`), as objects/serve.ts provides them to the mount.
 */
export { agentsHandlers } from './agents.ts';
export { skillsHandlers } from './skills.ts';
export { workflowsHandlers } from './workflows.ts';
