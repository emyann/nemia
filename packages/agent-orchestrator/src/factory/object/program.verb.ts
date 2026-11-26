/**
 * A factory's programs as objects (`Program`, `ProgramList`, from `objects`), in the factory's namespace, each by the name its template
 * declares: its spec the line it runs and the conditions it writes, its status where its task runs now (`programStatus`, read off the
 * engine's task under the id the controller files it by, `programTaskId`): Pending, Running with its restarts and since when, or Down
 * with what to type. The default factory declares none. A program is no record of the keyspace, its status the engine's task as read now,
 * so its `resourceVersion` is a digest of both (`valueVersion`).
 */
import { Effect } from 'effect';
import { API_VERSION, type Program as ProgramObject, type ProgramList } from 'objects';
import { asked, type Engine } from '../../runtime-client.ts';
import { Missing, type Invalid } from '../../refusal/refusal.ts';
import { objectsListed, type ObjectQuery } from '../../object/listed.verb.ts';
import { valueVersion } from '../../digest/digest.ts';
import { declaredPrograms } from '../../program/program.verb.ts';
import { programStatus } from '../../program/program.ts';
import { factoryFiled } from './factory.verb.ts';

/** The programs of the factory `namespace` as objects, each read against the engine; none where the factory declares none. */
const programsNow = Effect.fn('programsNow')(function* (e: Engine, home: string, namespace: string) {
  const { factory, listing } = yield* factoryFiled(home, namespace);
  if (listing === undefined) return [];
  const objects: ProgramObject[] = [];
  for (const d of declaredPrograms([listing])) {
    const { state } = yield* asked('view', e.view(d.id));
    const status = programStatus(state, d.id);
    const spec = { run: d.program.run, writes: [...d.program.writes] };
    objects.push({
      apiVersion: API_VERSION,
      kind: 'Program',
      metadata: {
        name: d.name,
        namespace,
        creationTimestamp: factory.metadata.creationTimestamp,
        resourceVersion: valueVersion({ spec, status }),
      },
      spec,
      status,
    });
  }
  return objects;
});

/**
 * A page of the programs of the factory `namespace` (`ProgramList`), read now.
 * @param e The engine the programs' tasks are read from.
 * @param home The store's root folder.
 * @param namespace The factory's name.
 * @param query The list's query: its limit, its continue token and its label selectors.
 */
export const programList = Effect.fn('programList')(function* (e: Engine, home: string, namespace: string, query: ObjectQuery) {
  const listed: ProgramList = yield* objectsListed('Program', yield* programsNow(e, home, namespace), query, 'program');
  return listed;
});

/**
 * The program `name` of the factory `namespace` as an object; `Missing` where its template declares none of that name.
 * @param e The engine the program's task is read from.
 * @param home The store's root folder.
 * @param namespace The factory's name.
 * @param name The program's name.
 */
export const programObject = Effect.fn('programObject')(function* (e: Engine, home: string, namespace: string, name: string) {
  const found = (yield* programsNow(e, home, namespace)).find((p) => p.metadata.name === name);
  if (found === undefined)
    return yield* Effect.fail<Missing | Invalid>(
      new Missing({
        message: `the factory ${namespace} declares no program ${name}: list them with GET /api/namespaces/${namespace}/programs.`,
      }),
    );
  return found;
});
