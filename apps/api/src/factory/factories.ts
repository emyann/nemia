/**
 * The factories group's handlers (`objects`' `Api`): the factories as objects, cluster-scoped — a page of them (`factoryList`), the
 * default first on the api's own repository, and one (`factoryObject`) — and a factory's sub-resources over the package's entries the
 * command line runs, each entry called by its `input` through `inRequest`: its rules (`nemia factory rules`), read, written and cleared;
 * its instruction, where it is kept (`nemia factory instruction`) and the words the store keeps (`nemia factory instruct`); its command
 * lines (`factoryCommandsOf`), built off the command table; its cost line per workflow, set and taken back (`nemia factory
 * cost-line`), its revisions policy (`nemia factory revisions`), a workflow attached and detached (`nemia factory attach`, `detach`) and
 * a harness setting set and taken off (`nemia factory setting`), each answered with the factory as it then reads; its places trusted
 * again where the store runs (`nemia factory trust`), answered with what was asked of each; and the factory removed (`nemia factory rm`),
 * answered with what was removed.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  factoryTable,
  factoryCommandsOf,
  factoryList,
  factoryObject,
  FACTORY_ATTACH,
  FACTORY_COST_LINE_RM,
  FACTORY_COST_LINE_SET,
  FACTORY_DETACH,
  FACTORY_INSTRUCT,
  FACTORY_INSTRUCTION,
  FACTORY_REVISIONS,
  FACTORY_RM,
  FACTORY_RULES,
  FACTORY_SETTING_RM,
  FACTORY_SETTING_SET,
  FACTORY_TRUST,
} from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts/index.ts';
import { answered, answeredWrite } from '../objects/refused.ts';
import { wantsTable } from '../objects/table.ts';

/** The rules of the factory `name`, read, written (`words`) or cleared, as `nemia factory rules` does it. */
const rules = (method: string, name: string, args: { words?: string; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/rules`, name);
    return s.inRequest(FACTORY_RULES.handler({ factory: name, ...args }));
  });

/** The instruction of the factory `name`, read or placed (`path`, `store`, `clear`), as `nemia factory instruction` does it. */
const instruction = (method: string, name: string, args: { path?: string; store?: boolean; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/instruction`, name);
    return s.inRequest(FACTORY_INSTRUCTION.handler({ factory: name, ...args }));
  });

/** The words the store keeps as the factory `name`'s instruction, written or cleared, as `nemia factory instruct` does it. */
const instruct = (method: string, name: string, args: { words?: string; clear?: boolean }) =>
  answered(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/instruction/words`, name);
    return s.inRequest(FACTORY_INSTRUCT.handler({ factory: name, ...args }));
  });

/**
 * The cost line of `workflow` in the factory `name`, set (`usd`) or taken back, as `nemia factory cost-line` does it, answering
 * the factory after.
 */
const costLine = (method: string, name: string, workflow: string, usd?: number) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(`${method} /api/factories/${name}/costlines/${workflow}`, name);
    await s.inRequest(
      usd === undefined
        ? FACTORY_COST_LINE_RM.handler({ factory: name, workflow })
        : FACTORY_COST_LINE_SET.handler({ factory: name, workflow, usd }),
    );
    return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
  });

/**
 * `write`, one of the package's writes of the factory `name` (`route` the request, named in a refusal of the name), run in the request,
 * then the factory as it reads after it.
 */
const writtenThen = (route: string, name: string, write: (s: Served) => Promise<unknown>) =>
  answeredWrite(async (s: Served) => {
    factoryNamed(route, name);
    await write(s);
    return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
  });

export const factoriesHandlers = HttpApiBuilder.group(Api, 'factories', (handlers) =>
  handlers
    .handle('listAll', ({ query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answered(async (s) => {
          const list = await s.inRequest(factoryList(s.home, defaultRepo(s), queryOf(query)));
          return table ? factoryTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/factories/${name}`, name);
        return s.inRequest(factoryObject(s.home, defaultRepo(s), name));
      }),
    )
    .handle('rules', ({ params: { name } }) => rules('GET', name, {}))
    .handle('putRules', ({ params: { name }, payload }) => rules('PUT', name, { words: payload.words, clear: false }))
    .handle('deleteRules', ({ params: { name } }) => rules('DELETE', name, { clear: true }))
    .handle('instruction', ({ params: { name } }) => instruction('GET', name, {}))
    .handle('putInstruction', ({ params: { name }, payload }) =>
      instruction('PUT', name, 'path' in payload ? { path: payload.path, clear: false } : { store: true, clear: false }),
    )
    .handle('deleteInstruction', ({ params: { name } }) => instruction('DELETE', name, { clear: true }))
    .handle('putInstructionWords', ({ params: { name }, payload }) => instruct('PUT', name, { words: payload.words, clear: false }))
    .handle('deleteInstructionWords', ({ params: { name } }) => instruct('DELETE', name, { clear: true }))
    .handle('putCostLine', ({ params: { name, workflow }, payload }) => costLine('PUT', name, workflow, payload.usd))
    .handle('deleteCostLine', ({ params: { name, workflow } }) => costLine('DELETE', name, workflow))
    .handle('delete', ({ params: { name } }) =>
      answeredWrite(async (s: Served) => {
        factoryNamed(`DELETE /api/factories/${name}`, name);
        const { file, instruction } = await s.inRequest(FACTORY_RM.handler({ factory: name }));
        return { name, file, instruction };
      }),
    )
    .handle('setRevisions', ({ params: { name }, payload: { revisions } }) =>
      writtenThen(`PUT /api/factories/${name}/revisions`, name, (s) =>
        s.inRequest(FACTORY_REVISIONS.handler({ factory: name, revisions })),
      ),
    )
    .handle('trust', ({ params: { name } }) =>
      answeredWrite(async (s: Served) => {
        factoryNamed(`POST /api/factories/${name}/trust`, name);
        return s.inRequest(FACTORY_TRUST.handler({ factory: name }));
      }),
    )
    .handle('attach', ({ params: { name, workflow } }) =>
      writtenThen(`PUT /api/factories/${name}/workflows/${workflow}`, name, (s) =>
        s.inRequest(FACTORY_ATTACH.handler({ factory: name, workflow })),
      ),
    )
    .handle('detach', ({ params: { name, workflow } }) =>
      writtenThen(`DELETE /api/factories/${name}/workflows/${workflow}`, name, (s) =>
        s.inRequest(FACTORY_DETACH.handler({ factory: name, workflow })),
      ),
    )
    .handle('putSetting', ({ params: { name, setting }, payload: { value } }) =>
      writtenThen(`PUT /api/factories/${name}/settings/${setting}`, name, (s) =>
        s.inRequest(FACTORY_SETTING_SET.handler({ factory: name, setting, value })),
      ),
    )
    .handle('deleteSetting', ({ params: { name, setting } }) =>
      writtenThen(`DELETE /api/factories/${name}/settings/${setting}`, name, (s) =>
        s.inRequest(FACTORY_SETTING_RM.handler({ factory: name, setting })),
      ),
    )
    .handle('commands', ({ params: { name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/factories/${name}/commands`, name);
        return s.inRequest(factoryCommandsOf(s.home, defaultRepo(s), name));
      }),
    ),
);
