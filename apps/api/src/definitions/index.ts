/**
 * The definitions — the Workflows, Agents and Skills a namespace resolves — served through `objects`' Api: each kind's handlers
 * (`workflows.ts`, `agents.ts`, `skills.ts`), what they share (`served.ts`), and the routes that hand each path on with the words their
 * writes are guarded in (`routes.ts`), as objects/serve.ts provides and mounts them.
 */
export { agentsHandlers } from './agents.ts';
export { DEFINITION_WRITES, definitionsRoutes } from './routes.ts';
export { skillsHandlers } from './skills.ts';
export { workflowsHandlers } from './workflows.ts';
