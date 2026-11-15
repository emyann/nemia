/**
 * The definitions, each in a factory's namespace as the factory resolves it: groups `workflows`, `agents` and `skills`, each listed with
 * `?origin=` for one origin's, shadowed or not, read, and yours written in `default` alone; an agent tried and read as a card, a builtin
 * skill copied to yours and a skill's files listed by path; and, in no namespace, each kind's files as a person keeps them read into its
 * spec (`read`), which writes nothing — a Kubernetes `*Review`'s way: the client reads a person's files, the api reads them by the
 * orchestrator's readers, and the client writes the spec through `create` or `replace`, the board's one write path. Cut from `api.ts`,
 * which adds them to `Api`, and whose templates serve their documents in the named Schemas exported here.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Table } from './table.ts';
import { DefinitionFiles, KeyForm, Workflow, WorkflowCreate, WorkflowList, WorkflowStepPage, WorkflowWrite } from './workflow.ts';
import {
  Agent,
  AgentCard,
  AgentCopied,
  AgentCopy,
  AgentDrafted,
  AgentInstructions,
  AgentInstructionsCleared,
  AgentInstructionsWrite,
  AgentList,
  AgentSources,
  AgentTried,
  AgentTry,
  AgentWrite,
} from './agent.ts';
import { Skill, SkillDrafted, SkillFiles, SkillList, SkillWrite } from './skill.ts';
import { definitionErrors, listQuery } from './api-errors.ts';
import {
  stepName,
  cardParams,
  namespaceParams,
  originQuery,
  instructionsQuery,
  removeQuery,
  repoQuery,
  draftReadQuery,
} from './api-params.ts';

/** The definitions and a page of each, named so that the document holds each as a component. */
export const WorkflowObject = Workflow.annotate({ identifier: 'Workflow' });
export const WorkflowListObject = WorkflowList.annotate({ identifier: 'WorkflowList' });
export const AgentObject = Agent.annotate({ identifier: 'Agent' });
export const AgentListObject = AgentList.annotate({ identifier: 'AgentList' });
export const SkillObject = Skill.annotate({ identifier: 'Skill' });
export const SkillListObject = SkillList.annotate({ identifier: 'SkillList' });
/** A namespace's agents and skills, each a page or the same page as a `Table` where the request asks for one, as the cards. */
const AgentListOrTable = [AgentListObject, Table] as const;
const SkillListOrTable = [SkillListObject, Table] as const;

/**
 * A namespace's workflows: the factory's resolved view of each name (`default`: the api's repository and your library), listed, read,
 * and — yours, in `default` alone — made, written whole and removed; a step of one read for its page, in the namespace's factory. And
 * the builder's form (`keys`), in no namespace: under one, `keys` would read as a workflow's name.
 */
export class WorkflowsGroup extends HttpApiGroup.make('workflows').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: WorkflowListObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: originQuery,
    success: WorkflowObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    payload: WorkflowCreate,
    success: WorkflowObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    payload: WorkflowWrite,
    success: WorkflowObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: { ...removeQuery, ...repoQuery },
    success: WorkflowObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('step', '/api/namespaces/:namespace/workflows/:name/steps/:step', {
    params: { ...cardParams, step: stepName },
    query: originQuery,
    success: WorkflowStepPage,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('keys', '/api/workflows/keys', { success: KeyForm, error: definitionErrors }),
  HttpApiEndpoint.post('read', '/api/workflows/read', {
    query: draftReadQuery,
    payload: DefinitionFiles,
    success: WorkflowCreate,
    error: definitionErrors,
  }),
) {}

/**
 * A namespace's agents, as the workflows: listed, read, yours made, written and removed in `default`, tried, and read as a card; an agent
 * file copied into yours, in `default` alone; and an agent's custom instructions, one record per agent's name, read in any namespace and
 * written and cleared in `default` alone. And where agent files are looked for (`sources`), in no namespace: under one, `sources` would
 * read as an agent's name.
 */
export class AgentsGroup extends HttpApiGroup.make('agents').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery, ...repoQuery },
    success: AgentListOrTable,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: originQuery,
    success: AgentObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    payload: AgentWrite,
    success: AgentObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    payload: AgentWrite,
    success: AgentObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: { ...removeQuery, ...repoQuery },
    success: AgentObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('try', '/api/namespaces/:namespace/agents/:name/try', {
    params: cardParams,
    payload: AgentTry,
    success: AgentTried.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('card', '/api/namespaces/:namespace/agents/:name/card', {
    params: cardParams,
    query: { ...originQuery, ...repoQuery },
    success: AgentCard,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('sources', '/api/agents/sources', {
    query: {
      path: Schema.optionalKey(
        Schema.String.annotate({
          description: "A folder of agent files on the api's machine, listed besides those the store knows of; absent, the store's alone.",
        }),
      ),
    },
    success: AgentSources,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('copy', '/api/namespaces/:namespace/agents/copy', {
    params: namespaceParams,
    payload: AgentCopy,
    success: AgentCopied,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('instructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    success: AgentInstructions,
    error: definitionErrors,
  }),
  HttpApiEndpoint.put('putInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    payload: AgentInstructionsWrite,
    success: AgentInstructions,
    error: definitionErrors,
  }),
  HttpApiEndpoint.delete('deleteInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    success: AgentInstructionsCleared,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('read', '/api/agents/read', { payload: DefinitionFiles, success: AgentDrafted, error: definitionErrors }),
) {}

/** A namespace's skills: listed, read, yours made and written in `default`, a builtin one copied to yours, and a folder's files by path. */
export class SkillsGroup extends HttpApiGroup.make('skills').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: SkillListOrTable,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    query: originQuery,
    success: SkillObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    payload: SkillWrite,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    payload: SkillWrite,
    success: SkillObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('copy', '/api/namespaces/:namespace/skills/:name/copy', {
    params: cardParams,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('files', '/api/namespaces/:namespace/skills/:name/files', {
    params: cardParams,
    query: originQuery,
    success: SkillFiles,
    error: definitionErrors,
  }),
  HttpApiEndpoint.post('read', '/api/skills/read', { payload: DefinitionFiles, success: SkillDrafted, error: definitionErrors }),
) {}
