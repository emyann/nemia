/**
 * The pair and pairings groups' handlers (`objects`' `PairGroup`, `PairingsGroup`): a pairing asked, claimed, listed and approved, and a
 * first-visit link made and claimed. Not served yet: each answers that it is not, until the orchestrator's tickets are handed to it.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { Api, Failed } from 'objects';

/** The refusal of a route not served yet. */
const notYet = (route: string) => Effect.fail(new Failed({ error: `${route} is not served by this api yet: upgrade Nemia.` }));

export const pairHandlers = HttpApiBuilder.group(Api, 'pair', (handlers) =>
  handlers
    .handle('ask', () => notYet('POST /api/pair'))
    .handle('claim', () => notYet('POST /api/pair/:id/claim'))
    .handle('claimLink', () => notYet('POST /api/pair/link')),
);

export const pairingsHandlers = HttpApiBuilder.group(Api, 'pairings', (handlers) =>
  handlers
    .handle('list', () => notYet('GET /api/pairings'))
    .handle('approve', () => notYet('POST /api/pairings/:code/approve'))
    .handle('link', () => notYet('POST /api/links')),
);
