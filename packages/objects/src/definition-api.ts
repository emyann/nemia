/**
 * The definitions, each in a factory's namespace as the factory resolves it: groups `workflows`, `agents` and `skills`, each listed with
 * `?origin=` for one origin's, shadowed or not, read, and yours written in `default` alone; an agent tried and read as a card, a builtin
 * skill copied to yours and a skill's files listed by path; and, in no namespace, each kind's files as a person keeps them read into its
 * spec (`read`), which writes nothing — a Kubernetes `*Review`'s way: the client reads a person's files, the api reads them by the
 * orchestrator's readers, and the client writes the spec through `create` or `replace`, the board's one write path. Cut from `api.ts`,
 * which adds them to `Api`, and whose templates serve their documents in the named Schemas exported here.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
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
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's workflows, a page at a time: in default, the api's repository and your library; in a factory's, the workflows attached to it. Each name is served once, the first origin that holds it, unless ?origin= reads one origin's. Answers a WorkflowList.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: originQuery,
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a namespace's workflows by its name: its steps as their files write them, the steps resolved, its typed graph and the revision a run started on it pins. Answers the Workflow.",
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    payload: WorkflowCreate,
    success: WorkflowObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Makes a workflow in your library, in default alone, with its steps, from the WorkflowCreate body. Answers the Workflow with a 201; a step the builder refuses is Invalid, naming the steps.',
  ),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    payload: WorkflowWrite,
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Writes one of your workflows whole, in default alone, at the resourceVersion it was read at: its steps, its other files (one left out is removed) and its needs. Answers the Workflow as it is now; a stale write is a Conflict.',
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: { ...removeQuery, ...repoQuery },
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Removes one of your workflows, in default alone, at the ?resourceVersion= it was read at. Answers the Workflow as it was.',
  ),
  HttpApiEndpoint.get('step', '/api/namespaces/:namespace/workflows/:name/steps/:step', {
    params: { ...cardParams, step: stepName },
    query: originQuery,
    success: WorkflowStepPage,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one step of a workflow for its page, in the namespace's factory: what it would be told by layer, the agent hired into it and the factories that hire into it, where each of its skills is found, and its newest runs. Answers WorkflowStepPage.",
  ),
  HttpApiEndpoint.get('keys', '/api/workflows/keys', { success: KeyForm, error: definitionErrors }).annotate(
    OpenApi.Description,
    "Reads the workflow builder's form, in no namespace: the keys a step and an agent may set, the values each of your agents gives a step it is attached to, and how a step names a remote agent. Answers KeyForm.",
  ),
  HttpApiEndpoint.post('read', '/api/workflows/read', {
    query: draftReadQuery,
    payload: DefinitionFiles,
    success: WorkflowCreate,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads a workflow's files as a person keeps them into the spec a create or a replace would send, its steps filled as a run in the ?factory= named would read them; nothing is written. Answers WorkflowCreate.",
  ),
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
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's agents, a page at a time: the repository's, yours and, in a factory made from a template, its tree's, each with the steps that name it and the hires that fill a step with it. ?origin= reads one origin's. Answers an AgentList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: originQuery,
    success: AgentObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a namespace's agents by its name, with the steps that name it, the hires and factories that use it, and the revision its file holds now. Answers the Agent.",
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    payload: AgentWrite,
    success: AgentObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Makes an agent in your library, in default alone, from the AgentWrite body. Answers the Agent with a 201.',
  ),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    payload: AgentWrite,
    success: AgentObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes one of your agents, in default alone, at the resourceVersion it was read at; a metadata.name other than the path's renames it. Answers the Agent as it is now.",
  ),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: { ...removeQuery, ...repoQuery },
    success: AgentObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Removes one of your agents, in default alone, at the ?resourceVersion= it was read at; one a step still names is a Conflict, naming the steps. Answers the Agent as it was.',
  ),
  HttpApiEndpoint.post('try', '/api/namespaces/:namespace/agents/:name/try', {
    params: cardParams,
    payload: AgentTry,
    success: AgentTried.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Starts a run of one of your agents on the brief the body gives; the repository's agent is refused, naming the copy that makes it yours. Answers AgentTried with a 201, the run it started.",
  ),
  HttpApiEndpoint.get('card', '/api/namespaces/:namespace/agents/:name/card', {
    params: cardParams,
    query: { ...originQuery, ...repoQuery },
    success: AgentCard,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Reads an agent as an A2A Agent Card, with the truth about it: it is not served over A2A, and why says what the card leaves out. Answers AgentCard.',
  ),
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
  }).annotate(
    OpenApi.Description,
    'Lists every agent file the store knows of, in no namespace, and those of the folder ?path= names: where each was found and its name, description and version, or why it does not read. Answers AgentSources.',
  ),
  HttpApiEndpoint.post('copy', '/api/namespaces/:namespace/agents/copy', {
    params: namespaceParams,
    payload: AgentCopy,
    success: AgentCopied,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Copies an agent file into your library, in default alone, with the skills and schemas it uses, under the name the body gives. Answers AgentCopied: the parts it wrote and reused, and the copy's record.",
  ),
  HttpApiEndpoint.get('instructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    success: AgentInstructions,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads a person's custom instructions for an agent's name, told to whichever agent of that name a run finds: its file, its words, and why the file does not read where it does not. Answers AgentInstructions.",
  ),
  HttpApiEndpoint.put('putInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    payload: AgentInstructionsWrite,
    success: AgentInstructions,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a person's custom instructions for an agent's name, in default alone; a run reads them at its start, so only runs started after the write take them. Answers AgentInstructions as they are now.",
  ),
  HttpApiEndpoint.delete('deleteInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    query: instructionsQuery,
    success: AgentInstructionsCleared,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Clears a person's custom instructions for an agent's name, in default alone. Answers AgentInstructionsCleared, with whether there were words to remove.",
  ),
  HttpApiEndpoint.post('read', '/api/agents/read', { payload: DefinitionFiles, success: AgentDrafted, error: definitionErrors }).annotate(
    OpenApi.Description,
    "Reads an agent's file as a person keeps it into the spec a create or a replace would send, in no namespace; nothing is written. Answers AgentDrafted.",
  ),
) {}

/** A namespace's skills: listed, read, yours made and written in `default`, a builtin one copied to yours, and a folder's files by path. */
export class SkillsGroup extends HttpApiGroup.make('skills').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: SkillListOrTable,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's skills, a page at a time: the factory's tree's, the repository's, yours and Nemia's builtin, each name served once, the first origin that holds it, unless ?origin= reads one origin's. Answers a SkillList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    query: originQuery,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of a namespace's skills by its name: its SKILL.md as a draft and the folder's other text files. Answers the Skill.",
  ),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    payload: SkillWrite,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Makes a skill in your library, in default alone, from the SkillWrite body. Answers the Skill with a 201.',
  ),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    payload: SkillWrite,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Writes one of your skills whole, or its preload alone, in default alone, at the resourceVersion it was read at; a file of the folder the body leaves out is removed. Answers the Skill as it is now.',
  ),
  HttpApiEndpoint.post('copy', '/api/namespaces/:namespace/skills/:name/copy', {
    params: cardParams,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Copies one of Nemia's builtin skills into your library, in default alone. Answers the Skill copied with a 201.",
  ),
  HttpApiEndpoint.get('files', '/api/namespaces/:namespace/skills/:name/files', {
    params: cardParams,
    query: originQuery,
    success: SkillFiles,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Lists the files of a skill's folder by their path in it, SKILL.md among them. Answers SkillFiles."),
  HttpApiEndpoint.post('read', '/api/skills/read', { payload: DefinitionFiles, success: SkillDrafted, error: definitionErrors }).annotate(
    OpenApi.Description,
    "Reads a skill's files as a person keeps them into the spec a create or a replace would send, in no namespace; nothing is written. Answers SkillDrafted.",
  ),
) {}
