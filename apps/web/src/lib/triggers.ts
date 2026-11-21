/** The words of a factory's triggers on its settings page (`FactoryTriggers`). Pure. */
import type { Trigger } from 'objects';

/**
 * Whether a trigger can spend quota, in words: what its target reaches runs an agent, nothing it reaches does however many cards it
 * queues, or a workflow it reaches does not read. Said apart from what it does now.
 * @param trigger The trigger as the api answered it.
 */
export const quotaWords = (trigger: Pick<Trigger, 'spec' | 'status'>) => {
  const target = trigger.spec.target.name;
  const by = trigger.status.quotaBy ?? target;
  if (trigger.status.quota === 'spends') return `Spends quota: ${by} runs an agent`;
  if (trigger.status.quota === 'free') return `No quota: nothing ${target} reaches runs an agent`;
  return `Quota unknown: ${by} does not read`;
};

/**
 * When a trigger fires, in words: the cards its selector selects, or its cron and the zone it is read in.
 * @param trigger The trigger as the api answered it.
 */
export const firesWhen = (trigger: Pick<Trigger, 'spec'>) => {
  const when = trigger.spec.when;
  return when.kind === 'cards' ? `cards labelled ${when.labelSelector}` : `at ${when.cron}${when.tz ? ` (${when.tz})` : ''}`;
};

/**
 * What a card trigger does now, in words: the cards it queues and those that wait on a clash.
 * @param trigger The trigger as the api answered it.
 */
export const queuesWords = (trigger: Pick<Trigger, 'status'>) => {
  const queued = trigger.status.queued ?? [];
  const clashes = trigger.status.clashes ?? [];
  const head = queued.length ? `queues ${queued.length} card${queued.length === 1 ? '' : 's'} now` : 'queues no card now';
  return clashes.length ? `${head}; ${clashes.length} waiting on a clash` : head;
};
