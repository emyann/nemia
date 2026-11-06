/**
 * The routes that hand the objects' handler each path of a factory's Proposals and Delegations, and the words each write is guarded in
 * (`PROPOSAL_WRITES`), in the shape of the definitions' (`DEFINITION_WRITES`, definitions/routes.ts): a write is refused 403 for another
 * site and 415 for a body that is not JSON before its body is read (`refusedBeforeReading`, guard.ts). This is the factory's way to change
 * its definitions and its wiring: one proposal, whoever calls.
 */
import type { Context as RequestContext, Hono } from 'hono';
import type { Guarded } from '../guard.ts';
import type { ApiEnv } from '../layer.ts';
import type { Handing } from '../factory-parts/parts.ts';

const PROPOSAL_SHAPE =
  '`{ "objects": [{ "kind", "metadata": { "name", "resourceVersion"? }, "spec"?, "verb"? }], "applyAt"?: "approval" | "run-end", "why"? }`';
const DELEGATION_SHAPE = '`{ "rules": [{ "resources": [...], "resourceNames": [...], "verbs": ["create" | "update" | "delete"] }] }`';
const NAMED = 'no body, or `{}`: the proposal is named in the path';

/** A write of a proposal, as the guard's refusals say it. */
const proposalWrite = (route: string, does: string, forAnother: string, shape: string): Guarded => ({
  route,
  does,
  forAnother,
  why: "a proposal changes what a factory's agents are told and may do, once it is applied",
  reach: "make it from the board's factory page",
  instead: "Make it from the board's factory page, or with `nemia propose` and `nemia proposals`",
  shape,
});

/** A write of a delegation, as the guard's refusals say it. */
const delegationWrite = (route: string, does: string, forAnother: string, shape: string): Guarded => ({
  route,
  does,
  forAnother,
  why: "a delegation is what an agent may approve of its factory's proposals with no person asked",
  reach: "write it from the board's factory page",
  instead: "Write it from the board's factory page",
  shape,
});

/** Each write of a proposal or a delegation, as the guard says it, by its namespace and its name. */
export const PROPOSAL_WRITES = {
  createProposal: (ns: string) => proposalWrite(`POST /api/namespaces/${ns}/proposals`, 'files a proposal', 'file one', PROPOSAL_SHAPE),
  approveProposal: (ns: string, name: string) =>
    proposalWrite(`POST /api/namespaces/${ns}/proposals/${name}/approve`, 'approves a proposal', 'approve one', NAMED),
  declineProposal: (ns: string, name: string) =>
    proposalWrite(`POST /api/namespaces/${ns}/proposals/${name}/decline`, 'declines a proposal', 'decline one', NAMED),
  putDelegation: (ns: string, name: string) =>
    delegationWrite(`PUT /api/namespaces/${ns}/delegations/${name}`, 'writes a delegation', 'write one', DELEGATION_SHAPE),
  deleteDelegation: (ns: string, name: string) =>
    delegationWrite(
      `DELETE /api/namespaces/${ns}/delegations/${name}`,
      'removes a delegation',
      'remove one',
      'no body, or `{}`: the delegation is named in the path, by its agent',
    ),
} as const satisfies Record<string, (ns: string, name: string) => Guarded>;

/** The namespace and the name a path names. */
const at = (c: RequestContext<ApiEnv>) => [c.req.param('namespace') ?? '', c.req.param('name') ?? ''] as const;

/** `app` with each path of the two kinds handed on: reads forwarded, lists as lists, writes guarded first. */
export function proposalsRoutes(app: Hono<ApiEnv>, h: Handing): Hono<ApiEnv> {
  const ns = '/api/namespaces/:namespace';
  const w = PROPOSAL_WRITES;
  for (const plural of ['proposals', 'delegations'] as const) {
    app.get(`${ns}/${plural}`, h.listed);
    app.get(`${ns}/${plural}/:name`, h.forward);
  }
  app.post(
    `${ns}/proposals`,
    h.guarded((c) => w.createProposal(at(c)[0])),
  );
  app.post(
    `${ns}/proposals/:name/approve`,
    h.guarded((c) => w.approveProposal(...at(c))),
  );
  app.post(
    `${ns}/proposals/:name/decline`,
    h.guarded((c) => w.declineProposal(...at(c))),
  );
  app.put(
    `${ns}/delegations/:name`,
    h.guarded((c) => w.putDelegation(...at(c))),
  );
  app.delete(
    `${ns}/delegations/:name`,
    h.guarded((c) => w.deleteDelegation(...at(c))),
  );
  return app;
}
