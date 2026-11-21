/**
 * Whether a trigger can spend quota (agent-orchestrator, src/factory/trigger/quota.ts, `triggerQuota`): whether anything its target can
 * reach runs an agent. Read off the steps of the workflows it reaches — its target's, and each one a card node of a reached workflow files
 * a card for, resolved through the factory (`reachedWorkflows`, which walks them once each, its tests holding the walk) — never off what it
 * matches now or when it next fires, which are facts of their own. A step runs an agent where it is a session (an agent hired, its own, a
 * remote one, or a plain session) or a judge; a table or a script condition and a card node run none. A trigger whose target reaches only
 * those costs no quota however many cards it queues.
 *
 * Where a reached workflow cannot be read (not offered, gone, or its folder does not load), whether it runs an agent is not known: the
 * trigger reads `unknown`, unless another reached workflow already runs one, which settles it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a step is, as far as quota goes: a session or a judge runs an agent; a table, a script and a card node run none. */
export type ReachStepKind = 'session' | 'judge' | 'table' | 'script' | 'node';

/** A workflow the trigger reaches: its steps' kinds, where it reads; `unknown` where it cannot be read. */
export type ReachedWorkflow =
  | { readonly name: string; readonly read: 'known'; readonly steps: readonly ReachStepKind[] }
  | { readonly name: string; readonly read: 'unknown' };

/** Whether a trigger can spend quota: something it reaches runs an agent, nothing does, or that cannot be known. */
export type TriggerQuota = 'spends' | 'free' | 'unknown';

/** Whether a step of this kind runs an agent. */
const runsAgent = (kind: ReachStepKind) => kind === 'session' || kind === 'judge';

/** Whether a reached workflow reads, and one of its steps runs an agent. */
const agentIn = (w: ReachedWorkflow) => w.read === 'known' && w.steps.some((kind) => runsAgent(kind));

const triggerQuotaSpec = spec<(reached: readonly ReachedWorkflow[]) => TriggerQuota>({
  /** Its caller always hands the target first, `unknown` where it cannot be read: a trigger reaches its target at least. */
  requires: ({ input: [reached] }) => reached.length > 0,
  ensures: {
    anAgentSpends: {
      description: 'A trigger that reaches a workflow with a session or a judge in it can spend quota',
      condition: ({ input: [reached], output }) => !reached.some((w) => agentIn(w)) || output === 'spends',
    },
    spendsOnlyByAnAgent: {
      description: 'A trigger spends only where a workflow it reaches runs an agent, however many cards it queues',
      condition: ({ input: [reached], output }) => output !== 'spends' || reached.some((w) => agentIn(w)),
    },
    unknownWhenNotReadable: {
      description: 'A trigger that reaches a workflow that cannot be read, and no agent elsewhere, cannot be said to be free',
      condition: ({ input: [reached], output }) =>
        reached.some((w) => agentIn(w)) || !reached.some((w) => w.read === 'unknown') || output === 'unknown',
    },
    freeWhenAllReadAndNoAgent: {
      description: 'A trigger whose reached workflows all read, with no session or judge among their steps, costs no quota',
      condition: ({ input: [reached], output }) =>
        !reached.every((w) => w.read === 'known' && !agentIn(w)) || output === 'free',
    },
  },
});

/** `triggerQuota`'s type, which src/factory/trigger/quota.ts takes: whether what a trigger reaches runs an agent. */
export type TriggerQuotaOf = Implementation<typeof triggerQuotaSpec>;
