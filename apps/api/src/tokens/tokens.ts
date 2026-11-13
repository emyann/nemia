/**
 * The tokens group's handlers (`objects`' `TokensGroup`): the standing tokens listed, minted and retired, each by the person alone
 * (`personOnly`), through the package's entries (`TOKEN_LS`, `TOKEN_ADD`, `TOKEN_RM`) run with `inRequest`, each refusal answered by the
 * one map (`answeredWrite`, objects/refused.ts).
 * - `GET /api/tokens` — the standing tokens the store keeps, by name and holder, never a token or its digest.
 * - `POST /api/tokens` — a token minted under `name`, the person's, or with `agent` the agent's, bound to `factory` (store-wide where
 *   left out) and narrowed by `narrowed`; answered 201 with the token, this once. 409 for a name already kept, 422 for a name that is
 *   none or a factory or narrowing with no agent.
 * - `DELETE /api/tokens/:name` — the token named retired: a request presenting it is refused from then on. 404 for none of that name.
 *
 * Each 403 (`Forbidden`, reason `person-only`) unless the caller is the person: a token an agent holds never mints another, lists the
 * others or retires one.
 */
import { TOKEN_ADD, TOKEN_LS, TOKEN_RM } from 'agent-orchestrator';
import { Api } from 'objects';
import { personOnly } from '../caller/index.ts';
import { readsBounded } from '../objects/answer-bound.ts';
import { answeredWrite } from '../objects/refused.ts';

export const tokensHandlers = readsBounded(Api, 'tokens', (handlers) =>
  handlers
    .handle('list', () =>
      answeredWrite((s) => {
        personOnly(s, 'GET /api/tokens', '`nemia token ls`');
        return s.inRequest(TOKEN_LS.handler({}));
      }),
    )
    .handle('mint', ({ payload }) =>
      answeredWrite((s) => {
        personOnly(s, 'POST /api/tokens', `\`nemia token add ${payload.name}\``);
        return s.inRequest(TOKEN_ADD.handler({ ...payload }));
      }),
    )
    .handle('retire', ({ params }) =>
      answeredWrite((s) => {
        personOnly(s, `DELETE /api/tokens/${params.name}`, `\`nemia token rm ${params.name}\``);
        return s.inRequest(TOKEN_RM.handler({ name: params.name }));
      }),
    ),
);
