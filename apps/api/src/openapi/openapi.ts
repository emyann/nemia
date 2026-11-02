/**
 * The api's OpenAPI 3.1 document of the run object (`GET /openapi/v3/nemia/v1`): the package's Schema of a run (`RunObject.Run`) exported
 * in the OpenAPI dialect by Effect's own JSON Schema (`RunObject.runDocument`), its definitions under `components.schemas`, and the
 * api's routes of its sub-resources under `paths`. Built from the Schema, never from Hono's routes, so a client generated from it reads
 * what the package declares.
 */
import { Hono } from 'hono';
import { RunObject, routeList } from 'agent-orchestrator';
import { commandNamed } from '../store.ts';
import type { ApiEnv } from '../layer.ts';

/** The path the document is served on, as Kubernetes serves a group's: `/openapi/v3/<group>/<version>`. */
export const OPENAPI_PATH = '/openapi/v3/nemia/v1';

/** The run object's sub-resources, by their entries in the package's table: the document's paths are the routes the table gives. */
export const SUB_RESOURCES = ['tries', 'try', 'closeout', 'told'] as const;

/** A route's path in OpenAPI's spelling, each `:param` a `{param}`, and its parameters, each a string of the path. */
const pathOf = (path: string) => ({
  path: path.replace(/:(\w+)/g, '{$1}'),
  parameters: [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
});

/** Each sub-resource's GET route, from its entry's own `route`: its path, its operation and what its help says it answers. */
const paths = () =>
  Object.fromEntries(
    SUB_RESOURCES.flatMap((name) => {
      const command = commandNamed(name);
      return routeList(command)
        .filter((r) => r.method === 'GET')
        .map((r) => {
          const { path, parameters } = pathOf(r.path);
          return [path, { get: { operationId: name, parameters, responses: { '200': { description: command.help[0] ?? name } } } }];
        });
    }),
  );

/**
 * The document: the run object's Schema (`components.schemas.Run`) and the routes of its sub-resources, read off their entries. `GET
 * /api/runs/:id` answers the run page, not the object, so it is not among `paths`. A sub-resource's answer has no Schema of its own yet,
 * so its response names none.
 */
export function openapiDocument() {
  const { definitions } = RunObject.runDocument();
  return { openapi: '3.1.0', info: { title: 'Nemia', version: 'nemia/v1' }, paths: paths(), components: { schemas: definitions } };
}

export const openapi = new Hono<ApiEnv>().get(OPENAPI_PATH, (c) => c.json(openapiDocument()));
