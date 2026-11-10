/**
 * An agent's rules for Auto (`GET /api/policy/:name`, and `PUT` and `DELETE /api/policy/:name/rules/:id`, the routes the package's command
 * table generates): the rules in force, what the agent proposed from the custom instruction, the words it keeps as guidance, and the
 * custom instruction itself; a proposed rule confirmed, and a rule in force dropped, each the person's. Her rules for approving a
 * factory's proposals (`approve-proposal`) are said apart, in `proposalRules` beside each `rules`.
 */
import { queryOptions } from '@tanstack/react-query';
import { PolicyList as PolicyListAnswer } from 'objects';
import { pace } from '../feed.ts';
import { call, read, write } from './objects.ts';

/** An agent's rules for Auto, as `objects` says them (`PolicyList`). */
export type PolicyList = typeof PolicyListAnswer.Type;

/** A rule at a gate with its words. */
export type PolicyRule = PolicyList['builtin'];

/** `agent`'s rules for Auto: polled slowly, since the agent proposes from its session. */
export const policyQuery = (agent: string) =>
  queryOptions({
    queryKey: ['policy', agent],
    queryFn: () => call((c) => c.nemia.policy({ params: { name: agent } }), read(PolicyListAnswer)),
    refetchInterval: () => pace(30_000),
  });

/**
 * Confirms the rule `id` that `agent` proposed, or the default again, as `words`, the words the person read: from then on, at Auto, its
 * answer is given unasked where it holds. Resolves with the rules after the write; rejects with the api's refusal: a rule not proposed,
 * one that reads otherwise since, or one in force already.
 */
export const confirmRule = (agent: string, id: string, words: string): Promise<PolicyList> =>
  call(
    (c) => c.nemia.confirmRule({ params: { name: agent, id }, payload: { words } }),
    write(PolicyListAnswer, 'The rule may be in force, or read otherwise: read the rules again before confirming it again.'),
  );

/** Drops the rule `id` of `agent`'s from force, the default among them. Rejects with the api's refusal: a rule not in force. */
export const dropRule = (agent: string, id: string): Promise<PolicyList> =>
  call(
    (c) => c.nemia.dropRule({ params: { name: agent, id } }),
    write(PolicyListAnswer, 'The rule may be out of force: read the rules again before dropping it again.'),
  );
