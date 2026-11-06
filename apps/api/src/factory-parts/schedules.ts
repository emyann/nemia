/**
 * The schedules group's handlers (`objects`' `Api`): a factory's schedules as objects, in its namespace, each named by its workflow — a
 * page of them (`scheduleList`), one (`scheduleObject`), the runs they fired read through the app's memo (`ReadMemo.records.factories`),
 * so a warm read reads no finished run's record — written (`nemia factory schedule`) and taken back (`factory unschedule`).
 */
import { HttpApiBuilder } from 'effect/http-api';
import { scheduleList, scheduleObject } from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts.ts';
import { answered } from '../objects/refused.ts';

const SCHEDULE = commandNamed('factory schedule');
const UNSCHEDULE = commandNamed('factory unschedule');

/** The schedule `name` of `namespace`, read now, the runs it fired through the app's memo. */
const scheduleIn = (s: Served, namespace: string, name: string) =>
  runPlaced(s, s.e, scheduleObject(s.home, defaultRepo(s), namespace, name, s.memo.records.factories));

export const schedulesHandlers = HttpApiBuilder.group(Api, 'schedules', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/schedules`, namespace);
        return runPlaced(s, s.e, scheduleList(s.home, defaultRepo(s), namespace, queryOf(query), s.memo.records.factories));
      }),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/schedules/${name}`, namespace);
        return scheduleIn(s, namespace, name);
      }),
    )
    .handle('put', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        factoryNamed(`PUT /api/namespaces/${namespace}/schedules/${name}`, namespace);
        await runPlaced(s, s.e, SCHEDULE.handler({ factory: namespace, workflow: name, ...payload }, s.env, s.home));
        return scheduleIn(s, namespace, name);
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        factoryNamed(`DELETE /api/namespaces/${namespace}/schedules/${name}`, namespace);
        const schedule = await scheduleIn(s, namespace, name);
        await runPlaced(s, s.e, UNSCHEDULE.handler({ factory: namespace, workflow: name }, s.env, s.home));
        return schedule;
      }),
    ),
);
