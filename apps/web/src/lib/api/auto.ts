/**
 * An agent's rules for Auto (`GET /api/policy/:name`, and `PUT` and `DELETE /api/policy/:name/rules/:id`, the routes the package's command
 * table generates): the rules in force, what the agent proposed from the custom instruction, the words it keeps as guidance, and the
 * custom instruction itself; a proposed rule confirmed, and a rule in force dropped, each the person's.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { pace } from '../feed.ts';
import { get, send } from './read.ts';

/** Mirrors the package's `Condition`: what must hold of a run's state for a rule to give its answer unasked. */
export type Condition = 'recommends' | 'checked' | 'accepted' | 'withinBudget' | 'nothingOpen';

/**
 * Mirrors the package's `WordedRule`: a rule's id, the answer it gives unasked (`approve`, `retry`), the steps it holds at (all where left
 * out), the conditions it asks of the run's state (`when`), the dollar line the run's spend stays under for any answer it gives (`under`,
 * none where left out), where it came from (`from`: the builtin rule, or one the agent proposed), and its words, generated from those
 * fields.
 */
export type AutoRule = {
  id: string;
  answer: 'approve' | 'retry';
  steps?: readonly string[];
  when: readonly Condition[];
  under?: number;
  from?: 'default' | 'proposed';
  words: string;
};

/**
 * Mirrors the package's `PolicyList`: the agent, the file of the person's list, whether the builtin rule is in force for want of one
 * they confirmed (`isDefault`), the rules in force, the builtin rule in its words (`builtin`), what the agent proposed (each rule saying
 * whether it is in force, the words kept as guidance, and whether the custom instruction changed since, `stale`) or null, and the custom
 * instruction or null.
 */
export type PolicyList = {
  agent: string;
  file: string;
  isDefault: boolean;
  rules: readonly AutoRule[];
  builtin: AutoRule;
  proposed: {
    file: string;
    at: string;
    rules: readonly (AutoRule & { confirmed: boolean })[];
    guidance: readonly string[];
    stale: boolean;
  } | null;
  instruction: string | null;
};

/** The fields of a rule, decoded. */
const RULE_FIELDS = {
  id: Schema.String,
  answer: Schema.Literals(['approve', 'retry']),
  steps: Schema.optionalKey(Schema.Array(Schema.String)),
  when: Schema.Array(Schema.Literals(['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'])),
  under: Schema.optionalKey(Schema.Number),
  from: Schema.optionalKey(Schema.Literals(['default', 'proposed'])),
  words: Schema.String,
};

/** Decodes an `PolicyList`. */
const PolicyListSchema = decodes<PolicyList>()(
  Schema.Struct({
    agent: Schema.String,
    file: Schema.String,
    isDefault: Schema.Boolean,
    rules: Schema.Array(Schema.Struct(RULE_FIELDS)),
    builtin: Schema.Struct(RULE_FIELDS),
    proposed: Schema.NullOr(
      Schema.Struct({
        file: Schema.String,
        at: Schema.String,
        rules: Schema.Array(Schema.Struct({ ...RULE_FIELDS, confirmed: Schema.Boolean })),
        guidance: Schema.Array(Schema.String),
        stale: Schema.Boolean,
      }),
    ),
    instruction: Schema.NullOr(Schema.String),
  }),
);

/** `agent`'s rules for Auto: polled slowly, since the agent proposes from its session. */
export const policyQuery = (agent: string) =>
  queryOptions({
    queryKey: ['policy', agent],
    queryFn: () => get(`/api/policy/${encodeURIComponent(agent)}`, PolicyListSchema),
    refetchInterval: () => pace(30_000),
  });

/** Where a rule of `agent`'s is written. */
const rulePath = (agent: string, id: string): string => `/api/policy/${encodeURIComponent(agent)}/rules/${encodeURIComponent(id)}`;

/**
 * Confirms the rule `id` that `agent` proposed, or the default again, as `words`, the words the person read: from then on, at Auto, its
 * answer is given unasked where it holds. Resolves with the rules after the write; rejects with the api's refusal: a rule not proposed,
 * one that reads otherwise since, or one in force already.
 */
export const confirmRule = (agent: string, id: string, words: string): Promise<PolicyList> =>
  send('PUT', rulePath(agent, id), PolicyListSchema, {
    body: { words },
    may: 'The rule may be in force, or read otherwise: read the rules again before confirming it again.',
  });

/** Drops the rule `id` of `agent`'s from force, the default among them. Rejects with the api's refusal: a rule not in force. */
export const dropRule = (agent: string, id: string): Promise<PolicyList> =>
  send('DELETE', rulePath(agent, id), PolicyListSchema, {
    body: {},
    may: 'The rule may be out of force: read the rules again before dropping it again.',
  });
