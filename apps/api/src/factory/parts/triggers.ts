/**
 * The triggers group's handlers (`objects`' `Api`): a factory's triggers as objects, in its namespace — a page of them (`triggerList`),
 * one (`triggerObject`), a schedule's runs read through the app's memo (`ReadMemo.records.factories`) — written and taken back. A card
 * trigger is written by `nemia factory trigger` and taken back by `untrigger`; one of the time kind is the factory's schedule of the
 * workflow it names, written by `nemia factory schedule` and taken back by `unschedule`, so it is named by its target: a time write whose
 * name is not its target's is refused `Invalid` (a 422).
 */
import {
  FACTORY_SCHEDULE,
  FACTORY_TRIGGER,
  FACTORY_UNSCHEDULE,
  FACTORY_UNTRIGGER,
  Invalid as Refused,
  triggerList,
  triggerObject,
} from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../../layer.ts';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** The trigger `name` of `namespace`, read now, a schedule's runs through the app's memo. */
const triggerIn = (s: Served, namespace: string, name: string) =>
  s.inRequest(triggerObject(s.home, namespace, name, s.memo.records.factories));

export const triggersHandlers = readsBounded(Api, 'triggers', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/triggers`, namespace);
        return s.inRequest(triggerList(s.home, namespace, queryOf(query), s.memo.records.factories));
      }),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/triggers/${name}`, namespace);
        return triggerIn(s, namespace, name);
      }),
    )
    .handle('put', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        const route = `PUT /api/namespaces/${namespace}/triggers/${name}`;
        factoryNamed(route, namespace);
        const { when, target } = payload;
        if (when.kind === 'time') {
          if (target.name !== name)
            throw new Refused({
              message: `${route}: a trigger of the time kind is the factory's schedule of its workflow, named by it: PUT it as /api/namespaces/${namespace}/triggers/${target.name}. Nothing was scheduled.`,
            });
          const { file, replaced } = await s.inRequest(
            FACTORY_SCHEDULE.handler({
              factory: namespace,
              workflow: name,
              cron: when.cron,
              brief: when.brief,
              ...(when.tz === undefined ? {} : { tz: when.tz }),
            }),
          );
          return { ...(await triggerIn(s, namespace, name)), written: { file, was: replaced?.cron ?? null } };
        }
        const { file, replaced } = await s.inRequest(
          FACTORY_TRIGGER.handler({ factory: namespace, name, labelSelector: when.labelSelector, to: target.name }),
        );
        return { ...(await triggerIn(s, namespace, name)), written: { file, was: replaced?.selector ?? null } };
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`DELETE /api/namespaces/${namespace}/triggers/${name}`, namespace);
        const trigger = await triggerIn(s, namespace, name);
        const { file } =
          trigger.spec.when.kind === 'time'
            ? await s.inRequest(FACTORY_UNSCHEDULE.handler({ factory: namespace, workflow: name }))
            : await s.inRequest(FACTORY_UNTRIGGER.handler({ factory: namespace, name }));
        return { ...trigger, written: { file } };
      }),
    ),
);
