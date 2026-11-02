/**
 * The api's OpenAPI 3.1 document of the run object (`GET /openapi/v3/nemia/v1`): the package's Schema of a run (`RunObject.Run`) exported
 * in the OpenAPI dialect by Effect's own JSON Schema (`RunObject.runDocument`), its definitions under `components.schemas`, and the
 * api's routes of the run and its sub-resources under `paths`. Built from the Schema, never from Hono's routes, so a client generated from
 * it reads what the package declares.
 */
import { Hono } from 'hono';
import { RunObject, routeList } from 'agent-orchestrator';
import { commandNamed } from '../store.ts';
import type { ApiEnv } from '../layer.ts';

/** The path the document is served on, as Kubernetes serves a group's: `/openapi/v3/<group>/<version>`. */
export const OPENAPI_PATH = '/openapi/v3/nemia/v1';

/**
 * The run object (`show`) and its sub-resources, by their entries in the package's table: the document's paths are the routes the table
 * gives.
 */
export const RUN_READS = ['show', 'tries', 'try', 'closeout', 'told'] as const;

/** The component each read answers with (`RunObject.Run`, `RunObject.StepTries`, …), a root of the package's document (`runDocument`). */
export const ANSWERS = {
  show: 'Run',
  tries: 'StepTries',
  try: 'StepTry',
  closeout: 'TryCloseout',
  told: 'StepTold',
} as const satisfies Record<(typeof RUN_READS)[number], string>;

/** A route's path in OpenAPI's spelling, each `:param` a `{param}`, and its parameters, each a string of the path. */
const pathOf = (path: string) => ({
  path: path.replace(/:(\w+)/g, '{$1}'),
  parameters: [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
});

/**
 * Each read's GET route, from its entry's own `route`: its path, its operation, and what it answers — its help's words and its
 * component.
 */
const paths = () =>
  Object.fromEntries(
    RUN_READS.flatMap((name) => {
      const command = commandNamed(name);
      return routeList(command)
        .filter((r) => r.method === 'GET')
        .map((r) => {
          const { path, parameters } = pathOf(r.path);
          const answer = { $ref: `#/components/schemas/${ANSWERS[name]}` };
          const ok = { description: command.help[0] ?? name, content: { 'application/json': { schema: answer } } };
          return [path, { get: { operationId: name, parameters, responses: { '200': ok } } }];
        });
    }),
  );

/**
 * The document: the run object's Schema (`components.schemas.Run`) and each sub-resource's answer's beside it, and the routes of the run
 * and its sub-resources, read off their entries, each naming its answer's component. `GET /api/runs/:runId/lines`, the lines read beside
 * the object (`RunLinesAnswer`), is not documented: an api address type and command text, no answer of an entry of the command table,
 * which the board mirrors by hand (`apps/web/src/lib/api/run.ts`); the generated mirror is the object's alone.
 */
export function openapiDocument() {
  const { definitions } = RunObject.runDocument();
  return { openapi: '3.1.0', info: { title: 'Nemia', version: 'nemia/v1' }, paths: paths(), components: { schemas: definitions } };
}

export const openapi = new Hono<ApiEnv>().get(OPENAPI_PATH, (c) => c.json(openapiDocument()));
