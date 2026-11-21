/**
 * A factory's triggers as objects (`Trigger`, `TriggerList`, from `objects`), in the factory's namespace: its schedules as the time kind,
 * each named by its workflow, with its next fire, last run and refusal as the Schedule reads them (`schedulesOf`); and its card triggers
 * (`cardTriggersOf`), its own and its template's, each with the cards it queues now and those it clashes on, off the inbox as the queue
 * reads it (`readInbox`). Every trigger says whether it can spend quota (`triggerQuota`), off the steps of each workflow its target reaches
 * (`reachedWorkflows`), read through the Workflow door where a start would find its folder: the factory's tree, else the repository its
 * wiring names for it. Read now, every time: nothing is kept between reads.
 */
import path from 'node:path';
import { Effect, Exit } from 'effect';
import { API_VERSION, type Trigger, type TriggerList } from 'objects';
import { wiredRepo, type Factory } from '../factory.ts';
import { Missing, type Invalid } from '../../refusal/refusal.ts';
import { factoryFiled } from './factory.verb.ts';
import { schedulesOf } from './schedule.verb.ts';
import { objectsListed, versionOf, type ObjectQuery } from '../../object/listed.verb.ts';
import type { ScheduleRuns } from '../schedule/listed.store.ts';
import { cardTriggersOf, type TriggerDefined } from '../trigger/listed.store.ts';
import { quotaSettledBy, reachedWorkflows, triggerQuota, type ReachStep } from '../trigger/quota.ts';
import { readInbox } from '../../inbox/inbox.store.ts';
import type { CardListing } from '../../inbox/inbox.ts';
import { WorkflowDoor } from '../../workflows/workflows.store.ts';
import { workflowFolder } from '../../folder/folder.store.ts';
import { fromThrow } from '../../door/door.store.ts';
import { StoreRoot } from '../../config/root.store.ts';

/**
 * The steps of the workflow `workflow` of `factory`, read where a start finds its folder; undefined where it cannot be read.
 * @param factory The factory, its tree and wiring.
 * @param workflow The workflow's name.
 */
const stepsOf = Effect.fnUntraced(function* (factory: Factory, workflow: string) {
  const home = yield* StoreRoot;
  const of = wiredRepo(factory, workflow);
  const repo = 'repo' in of ? of.repo : undefined;
  const from = factory.tree ?? repo;
  if (from === undefined) return undefined;
  const read = yield* Effect.exit(
    Effect.gen(function* () {
      const dir = yield* fromThrow(() => workflowFolder(workflow, path.join(from, 'workflows'), repo ?? from, factory.tree));
      return yield* (yield* WorkflowDoor).workflows.read(dir, { home, ...(repo === undefined ? {} : { repo }) });
    }),
  );
  return Exit.isSuccess(read) ? (read.value satisfies readonly ReachStep[]) : undefined;
});

/**
 * The steps of every workflow `factory` offers, by name, each read once; one that cannot be read is left out, which reads `unknown`.
 * @param factory The factory.
 */
const offeredSteps = Effect.fnUntraced(function* (factory: Factory) {
  const steps = new Map<string, readonly ReachStep[]>();
  for (const workflow of factory.workflows) {
    const read = yield* stepsOf(factory, workflow);
    if (read !== undefined) steps.set(workflow, read);
  }
  return steps;
});

/**
 * Whether a trigger targeting `target` can spend quota, and the workflow that settles it, off `steps`.
 * @param target The workflow the trigger targets.
 * @param steps The steps of each workflow the factory offers that reads, by name.
 */
const quotaOf = (target: string, steps: ReadonlyMap<string, readonly ReachStep[]>) => {
  const reached = reachedWorkflows(target, (name) => steps.get(name));
  const by = quotaSettledBy(reached);
  return { quota: triggerQuota(reached), ...(by === undefined ? {} : { quotaBy: by }) } satisfies Pick<
    Trigger['status'],
    'quota' | 'quotaBy'
  >;
};

/**
 * The object of the card trigger `t`, with the cards of its factory it queues now and those it clashes on.
 * @param t The trigger as defined.
 * @param cards The inbox's cards as the queue lists them.
 * @param quota Whether it can spend quota, and what settles it.
 */
const cardTriggerOf = (t: TriggerDefined, cards: readonly CardListing[], quota: Pick<Trigger['status'], 'quota' | 'quotaBy'>) => {
  const own = cards.filter((c) => c.factory === t.factory);
  const queued = own.filter((c) => c.queued?.by?.includes(t.name) && !c.startedAs.length).map((c) => c.name);
  const clashes = own.flatMap((c) => (c.clash?.includes(t.name) ? [{ card: c.name, with: [...c.clash] }] : []));
  const spec: Trigger['spec'] = { when: { kind: 'cards', selector: t.selector }, target: { ...t.target } };
  const status: Trigger['status'] = { since: t.since, from: t.from, ...quota, queued, ...(clashes.length ? { clashes } : {}) };
  return {
    apiVersion: API_VERSION,
    kind: 'Trigger',
    metadata: { name: t.name, namespace: t.factory, creationTimestamp: t.since, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  } satisfies Trigger;
};

/**
 * The triggers of the factory `namespace`, read now: none for the default factory or a file that does not read; `Missing` where no
 * factory has the name (`factoryFiled`).
 */
const triggersOf = Effect.fn('triggersOf')(function* (home: string, namespace: string, memo: ScheduleRuns | undefined) {
  const { listing } = yield* factoryFiled(home, namespace);
  if (listing === undefined || 'error' in listing) return [];
  const steps = yield* offeredSteps(listing);
  const timed = (yield* schedulesOf(home, namespace, memo)).map((s) => {
    const spec: Trigger['spec'] = {
      when: { kind: 'time', cron: s.spec.cron, brief: s.spec.brief, ...(s.spec.tz === undefined ? {} : { tz: s.spec.tz }) },
      target: { kind: 'Workflow', name: s.metadata.name },
    };
    const status: Trigger['status'] = { ...s.status, from: 'factory', ...quotaOf(s.metadata.name, steps) };
    return {
      apiVersion: API_VERSION,
      kind: 'Trigger',
      metadata: { ...s.metadata, resourceVersion: versionOf(spec, status) },
      spec,
      status,
    } satisfies Trigger;
  });
  const defined = cardTriggersOf(home, listing);
  const cards = defined.length ? yield* readInbox() : [];
  const onCards = defined.map((t) => cardTriggerOf(t, cards, quotaOf(t.target.name, steps)));
  return [...timed, ...onCards];
});

/**
 * A page of the triggers of the factory `namespace` (`TriggerList`), read now at the store `home`, a schedule's runs through `memo`.
 * @param home The store's root.
 * @param namespace The factory's name.
 * @param query The page asked for.
 * @param memo The run memo a caller that polls hands in; undefined to read every record.
 */
export const triggerList = Effect.fn('triggerList')(function* (
  home: string,
  namespace: string,
  query: ObjectQuery,
  memo: ScheduleRuns | undefined,
) {
  const listed: TriggerList = yield* objectsListed('Trigger', yield* triggersOf(home, namespace, memo), query, 'trigger');
  return listed;
});

/**
 * The trigger `name` of the factory `namespace`, a schedule's runs read through `memo`; `Missing` where it has none by that name.
 * @param home The store's root.
 * @param namespace The factory's name.
 * @param name The trigger's name: a card trigger's own, or the workflow a schedule starts.
 * @param memo The run memo a caller that polls hands in; undefined to read every record.
 */
export const triggerObject = Effect.fn('triggerObject')(function* (
  home: string,
  namespace: string,
  name: string,
  memo: ScheduleRuns | undefined,
) {
  const found = (yield* triggersOf(home, namespace, memo)).find((t) => t.metadata.name === name);
  if (found === undefined)
    return yield* Effect.fail<Missing | Invalid>(
      new Missing({
        message: `the factory ${namespace} has no trigger ${name}: set one with nemia factory trigger ${namespace} ${name} --selector <selector> --to <workflow>`,
      }),
    );
  return found;
});
