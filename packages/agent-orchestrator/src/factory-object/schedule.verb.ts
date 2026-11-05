/**
 * A factory's schedules as objects (`Schedule`, `ScheduleList`, from `objects`), in the factory's namespace, each named by its workflow:
 * its spec what the factory's file holds (its cron, brief, repository and zone), its status the package's listing of it
 * (`schedulesListed`, as `nemia factory` reads it) — when it was filed (`since`), its next fire, its last scheduled run and a kept
 * refusal of its latest fire. The default factory schedules nothing.
 */
import { Effect } from 'effect';
import { API_VERSION, type Schedule, type ScheduleList } from 'objects';
import type { FactoryListing } from '../factory/factory.ts';
import { Missing, type Invalid } from '../refusal/refusal.ts';
import type { ScheduleListed } from '../schedule/schedule.ts';
import { factoriesListed, factoryObject, objectsListed, versionOf, type ObjectQuery } from './factory.verb.ts';

/** The object of the schedule `s`, which the factory `listing`'s file holds. */
export const scheduleOf = (s: ScheduleListed, listing: Exclude<FactoryListing, { error: string }>): Schedule => {
  const since = listing.schedules[s.workflow]?.since ?? '';
  const spec: Schedule['spec'] = {
    cron: s.cron,
    brief: s.brief,
    ...(s.repo === null ? {} : { repo: s.repo }),
    ...(s.tz === null ? {} : { tz: s.tz }),
  };
  const status: Schedule['status'] = {
    since,
    ...(s.next === null ? {} : { next: s.next }),
    ...(s.last === null ? {} : { last: { ...s.last } }),
    ...(s.refused === null ? {} : { refused: s.refused }),
  };
  return {
    apiVersion: API_VERSION,
    kind: 'Schedule',
    metadata: { name: s.workflow, namespace: s.factory, creationTimestamp: since, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  };
};

/** The schedules of the factory `namespace`, read now; none for the default factory; `Missing` where no factory has the name. */
const schedulesOf = Effect.fn('schedulesOf')(function* (home: string, repo: string, namespace: string) {
  yield* factoryObject(home, repo, namespace);
  const listed = yield* factoriesListed(home);
  const listing = listed.factories.find((l) => l.name === namespace);
  if (listing === undefined || 'error' in listing) return [];
  return listed.schedules.filter((s) => s.factory === namespace).map((s) => scheduleOf(s, listing));
});

/** A page of the schedules of the factory `namespace` (`ScheduleList`), read now at the store `home`. */
export const scheduleList = Effect.fn('scheduleList')(function* (home: string, repo: string, namespace: string, query: ObjectQuery) {
  const listed: ScheduleList = yield* objectsListed('Schedule', yield* schedulesOf(home, repo, namespace), query, 'schedule');
  return listed;
});

/** The schedule of the workflow `name` in the factory `namespace`; `Missing` where it schedules none. */
export const scheduleObject = Effect.fn('scheduleObject')(function* (home: string, repo: string, namespace: string, name: string) {
  const found = (yield* schedulesOf(home, repo, namespace)).find((s) => s.metadata.name === name);
  if (found === undefined)
    return yield* Effect.fail<Missing | Invalid>(
      new Missing({
        message: `the factory ${namespace} schedules no workflow ${name}: schedule it with nemia factory schedule ${namespace} ${name} --cron <expr> --brief <text>`,
      }),
    );
  return found;
});
