/**
 * The templates group's handlers (`objects`' `Api`): the templates Nemia builds in, which no namespace holds, listed and read as objects
 * (`templateList`, `templateObject`), and each one's documents — its workflows, agents and skills — served in the Schemas a namespace
 * serves them in.
 */
import { HttpApiBuilder } from 'effect/http-api';
import { templateList, templateObject } from 'agent-orchestrator';
import { Api, Missing } from 'objects';
import { queryOf } from '../factory-parts/parts.ts';
import { runPlaced } from '../store.ts';
import { answered, answeredWrite } from './refused.ts';

/** A document read not built yet. */
const notYet = () => answeredWrite<never>(() => Promise.reject(new Missing({ error: 'not yet' })));

export const templatesHandlers = HttpApiBuilder.group(Api, 'templates', (handlers) =>
  handlers
    .handle('listAll', ({ query }) => answered((s) => runPlaced(s, s.e, templateList(queryOf(query)))))
    .handle('get', ({ params: { name } }) => answered((s) => runPlaced(s, s.e, templateObject(name))))
    .handle('workflows', notYet)
    .handle('workflow', notYet)
    .handle('agents', notYet)
    .handle('agent', notYet)
    .handle('skills', notYet)
    .handle('skill', notYet),
);
