/**
 * The factories group's handlers (`objects`' `Api`): the factories as objects, cluster-scoped — a page of them (`factoryList`), the
 * default first on the api's own repository, and one (`factoryObject`) — and a factory's sub-resources over the package's entries the
 * command line runs, each entry called by its `input` through `inRequest`: its rules (`nemia factory rules`), read, written and cleared;
 * its instruction, where it is kept (`nemia factory instruction`) and the words the store keeps (`nemia factory instruct`); its command
 * lines (`factoryCommandsOf`), built off the command table; and its cost line per workflow, set and taken back (`nemia factory
 * cost-line`), each answered with the factory as it then reads.
 */
import { HttpApiBuilder } from 'effect/http-api';
import {
  factoryCommandsOf,
  factoryList,
  factoryObject,
  FACTORY_COST_LINE_RM,
  FACTORY_COST_LINE_SET,
  FACTORY_INSTRUCT,
  FACTORY_INSTRUCTION,
  FACTORY_RULES,
} from 'agent-orchestrator';
import { Api } from 'objects';
import type { Served } from '../layer.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts/index.ts';
import { answered, answeredWrite } from '../objects/refused.ts';

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
 * the factory after. */
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

export const factoriesHandlers = HttpApiBuilder.group(Api, 'factories', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => s.inRequest(factoryList(s.home, defaultRepo(s), queryOf(query)))))
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
    .handle('commands', ({ params: { name } }) =>
      answered((s) => {
        factoryNamed(`GET /api/factories/${name}/commands`, name);
        return s.inRequest(factoryCommandsOf(s.home, defaultRepo(s), name));
      }),
    ),
);
