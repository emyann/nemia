/**
 * The api's OpenAPI 3.1 document of the run object (`GET /openapi/v3/nemia/v1`): the package's Schema of a run (`RunObject.Run`) exported
 * in the OpenAPI dialect by Effect's own JSON Schema (`RunObject.runDocument`), its definitions under `components.schemas`, and the
 * api's routes of its sub-resources under `paths`. Built from the Schema, never from Hono's routes, so a client generated from it reads what
 * the package declares.
 */
import { Hono } from 'hono';
import { RunObject } from 'agent-orchestrator';
import type { ApiEnv } from '../layer.ts';

/** The path the document is served on, as Kubernetes serves a group's: `/openapi/v3/<group>/<version>`. */
export const OPENAPI_PATH = '/openapi/v3/nemia/v1';

/** A step's path in the run, as its sub-resources are addressed. */
const stepParams = [
  { name: 'runId', in: 'path', required: true, schema: { type: 'string' } },
  { name: 'step', in: 'path', required: true, schema: { type: 'string' } },
];

/**
 * The document: the run object's Schema (`components.schemas.Run`) and the routes of its sub-resources. `GET /api/runs/:id` answers the
 * run page, not the object, so it is not among `paths`.
 */
export function openapiDocument() {
  const { definitions } = RunObject.runDocument();
  return {
    openapi: '3.1.0',
    info: { title: 'Nemia', version: 'nemia/v1' },
    paths: {
      '/api/runs/{runId}/steps/{step}/tries': {
        get: { operationId: 'readTries', parameters: stepParams, responses: { '200': { description: "A step's tries." } } },
      },
      '/api/runs/{runId}/steps/{step}/tries/{try}': {
        get: {
          operationId: 'readTry',
          parameters: [...stepParams, { name: 'try', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'One try of a step.' } },
        },
      },
      '/api/runs/{runId}/steps/{step}/tries/{try}/closeout': {
        get: {
          operationId: 'readCloseout',
          parameters: [...stepParams, { name: 'try', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: "A try's closeout." } },
        },
      },
      '/api/runs/{runId}/steps/{step}/told': {
        get: { operationId: 'readTold', parameters: stepParams, responses: { '200': { description: 'What a step was told.' } } },
      },
    },
    components: { schemas: definitions },
  };
}

export const openapi = new Hono<ApiEnv>().get(OPENAPI_PATH, (c) => c.json(openapiDocument()));
