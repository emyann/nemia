/**
 * The readiness group's handlers (`objects`' `ReadinessGroup`): the readiness read, a fix started, read and its output followed. Not
 * served yet: each answers that it is not, until the orchestrator's read and fixes are handed to it.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { Api, Failed, Missing } from 'objects';

/** The refusal of a route not served yet. */
const notYet = (route: string) => Effect.fail(new Failed({ error: `${route} is not served by this api yet: upgrade Nemia.` }));

export const readinessHandlers = HttpApiBuilder.group(Api, 'readiness', (handlers) =>
  handlers
    .handle('read', () => notYet('GET /api/readiness'))
    .handle('fix', () => notYet('POST /api/readiness/fixes'))
    .handle('fixOf', () => notYet('GET /api/readiness/fixes/:id'))
    .handle('fixOutput', ({ params }) =>
      Effect.fail(new Missing({ error: `no fix ${params.id} is kept: this api runs no fix yet. Upgrade Nemia.` })),
    ),
);
