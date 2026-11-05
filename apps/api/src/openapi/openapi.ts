/**
 * The api's OpenAPI 3.1 document of the objects it serves (`GET /openapi/v3/nemia/v1`): written by Effect from the one definition of them
 * (`OpenApi.fromApi(Api)`, the `objects` package's `Api`), so the paths, the bodies, the answers and the refusals it says are the ones the
 * handlers are built from (`src/objects/`), and a client generated from it reads what they answer.
 */
import { Hono } from 'hono';
import { OpenApi } from 'effect/http-api';
import { Api } from 'objects';
import type { ApiEnv } from '../layer.ts';

/** The path the document is served on, as Kubernetes serves a group's: `/openapi/v3/<group>/<version>`. */
export const OPENAPI_PATH = '/openapi/v3/nemia/v1';

/** The document: every group of the `Api`, its paths, and the Schemas of its objects and refusals under `components.schemas`. */
export const openapiDocument = () => OpenApi.fromApi(Api);

export const openapi = new Hono<ApiEnv>().get(OPENAPI_PATH, (c) => c.json(openapiDocument()));
