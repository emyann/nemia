/**
 * The routes that hand the objects' handler each path of the Workflows, Agents and Skills, and the words each write is guarded in
 * (`DEFINITION_WRITES`), moved from the routes they replace: a write is refused 403 for another site and 415 for a body that is not JSON
 * before its body is read (`refusedBeforeReading`, guard.ts), as the Card's and the factory's parts' are.
 */
import type { Context as RequestContext, Hono } from 'hono';
import type { Guarded } from '../guard.ts';
import type { ApiEnv } from '../layer.ts';
import { agentGuard, tryGuard } from '../agents/agents.ts';
import { skillGuard } from '../agents/skills.ts';
import { buildGuard } from '../workflows/builder.ts';
import type { Handing } from '../factory-parts/parts.ts';

const WORKFLOW_SHAPE =
  '`{ "metadata": { "name" | "resourceVersion" }, "spec": { "steps": [{ "name", "keys", "body" }], "readme"? }, "schemas"?: [{ "file", "text" }] }`';
const AGENT_SHAPE =
  '`{ "metadata": { "name"?, "resourceVersion"? }, "spec": { "role"?, "description"?, "keys"?, "skills"?, "harnessPrompt"?, "mcp"?, "output"?, "instructions"? } }`';
const SKILL_SHAPE =
  '`{ "metadata": { "name"?, "resourceVersion"? }, "spec": { "body", "title"?, "description"?, "tags"?, "examples"?, "preload"? } }`, or `{ "metadata": { "resourceVersion" }, "preload": true | false }`';
const NO_BODY = 'no body, or `{}`: the definition is named in the path, its `resourceVersion` in the query';

/** Each write of a definition, as the guard says it, by its namespace and its name. */
export const DEFINITION_WRITES = {
  createWorkflow: (ns: string) => buildGuard(`POST /api/namespaces/${ns}/workflows`, 'writes a workflow', WORKFLOW_SHAPE),
  replaceWorkflow: (ns: string, name: string) =>
    buildGuard(`PUT /api/namespaces/${ns}/workflows/${name}`, 'writes a workflow', WORKFLOW_SHAPE),
  deleteWorkflow: (ns: string, name: string) => buildGuard(`DELETE /api/namespaces/${ns}/workflows/${name}`, 'removes a workflow', NO_BODY),
  createAgent: (ns: string) => agentGuard(`POST /api/namespaces/${ns}/agents`, AGENT_SHAPE),
  replaceAgent: (ns: string, name: string) => agentGuard(`PUT /api/namespaces/${ns}/agents/${name}`, AGENT_SHAPE),
  deleteAgent: (ns: string, name: string) => agentGuard(`DELETE /api/namespaces/${ns}/agents/${name}`, NO_BODY),
  tryAgent: (ns: string, name: string) => tryGuard(`POST /api/namespaces/${ns}/agents/${name}/try`),
  createSkill: (ns: string) => skillGuard(`POST /api/namespaces/${ns}/skills`, 'POST', SKILL_SHAPE),
  replaceSkill: (ns: string, name: string) => skillGuard(`PUT /api/namespaces/${ns}/skills/${name}`, 'PUT', SKILL_SHAPE),
  copySkill: (ns: string, name: string) =>
    skillGuard(`POST /api/namespaces/${ns}/skills/${name}/copy`, 'POST', 'no body, or `{}`: the builtin skill is named in the path'),
} as const satisfies Record<string, (ns: string, name: string) => Guarded>;

/** The namespace and the name a path names. */
const at = (c: RequestContext<ApiEnv>) => [c.req.param('namespace') ?? '', c.req.param('name') ?? ''] as const;

/** `app` with each path of the three kinds handed on: reads forwarded, lists as lists, writes guarded first. */
export function definitionsRoutes(app: Hono<ApiEnv>, h: Handing): Hono<ApiEnv> {
  const ns = '/api/namespaces/:namespace';
  const w = DEFINITION_WRITES;
  for (const plural of ['workflows', 'agents', 'skills'] as const) {
    app.get(`${ns}/${plural}`, h.listed);
    app.get(`${ns}/${plural}/:name`, h.forward);
  }
  app.post(
    `${ns}/workflows`,
    h.guarded((c) => w.createWorkflow(at(c)[0])),
  );
  app.put(
    `${ns}/workflows/:name`,
    h.guarded((c) => w.replaceWorkflow(...at(c))),
  );
  app.delete(
    `${ns}/workflows/:name`,
    h.guarded((c) => w.deleteWorkflow(...at(c))),
  );
  app.post(
    `${ns}/agents`,
    h.guarded((c) => w.createAgent(at(c)[0])),
  );
  app.put(
    `${ns}/agents/:name`,
    h.guarded((c) => w.replaceAgent(...at(c))),
  );
  app.delete(
    `${ns}/agents/:name`,
    h.guarded((c) => w.deleteAgent(...at(c))),
  );
  app.post(
    `${ns}/agents/:name/try`,
    h.guarded((c) => w.tryAgent(...at(c))),
  );
  app.get(`${ns}/agents/:name/card`, h.forward);
  app.post(
    `${ns}/skills`,
    h.guarded((c) => w.createSkill(at(c)[0])),
  );
  app.put(
    `${ns}/skills/:name`,
    h.guarded((c) => w.replaceSkill(...at(c))),
  );
  app.post(
    `${ns}/skills/:name/copy`,
    h.guarded((c) => w.copySkill(...at(c))),
  );
  app.get(`${ns}/skills/:name/files`, h.forward);
  return app;
}
