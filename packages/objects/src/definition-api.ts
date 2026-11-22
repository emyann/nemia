/**
 * The definitions as groups of the `Api` (`api.ts`): workflows, agents and skills, each in a factory's namespace as the factory resolves
 * it, and the store's library of each, in no namespace, where the person's are written.
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
import {
  stepName,
  cardParams,
  namespaceParams,
  originQuery,
  instructionsQuery,
  removeQuery,
  repoQuery,
  draftReadQuery,
  libraryParams,
} from './api-params.ts';
import { definitionErrors, listQuery } from './api-errors.ts';

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
/** What a make answers, a 201 of the definition made: one schema each, shared by the namespace's and the library's endpoints alike. */
const WorkflowMade = WorkflowObject.pipe(Schema.annotate({ httpApiStatus: 201 }));
const AgentMade = AgentObject.pipe(Schema.annotate({ httpApiStatus: 201 }));
const SkillMade = SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 }));

/**
 * A namespace's workflows: the factory's resolved view of each name, listed and read; a step of one read for its page, in the
 * namespace's factory; a write sent there refused, naming its way. The store's library, in no namespace: the person's workflows beside
 * the builtins, listed with the factories that attach each, read, and the person's made, written whole and removed. And the builder's
 * form (`/api/workflow-keys`), in no namespace and out of the library's paths, where it would read as a workflow's name.
 */
export class WorkflowsGroup extends HttpApiGroup.make('workflows').add(
  HttpApiEndpoint.get('listLibrary', '/api/workflows', {
    query: { ...listQuery, ...originQuery },
    success: [WorkflowListObject, Table],
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "The store's library of workflows: the person's beside the builtins, each with the factories that attach it and what shadows it.",
  ),
  HttpApiEndpoint.get('getLibrary', '/api/workflows/:name', {
    params: libraryParams,
    query: originQuery,
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "One workflow of the store's library by its name, the person's first, with the factories that attach it.",
  ),
  HttpApiEndpoint.post('createLibrary', '/api/workflows', {
    payload: WorkflowCreate,
    success: WorkflowMade,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Makes a workflow in the person's library, whatever builtin holds its name; a factory attaches it to run it.",
  ),
  HttpApiEndpoint.put('replaceLibrary', '/api/workflows/:name', {
    params: libraryParams,
    payload: WorkflowWrite,
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a workflow of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy.",
  ),
  HttpApiEndpoint.delete('deleteLibrary', '/api/workflows/:name', {
    params: libraryParams,
    query: { ...removeQuery, ...repoQuery },
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Removes a workflow of the person's library; refused with a 409 naming each factory that attaches it, and a builtin is never removed.",
  ),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: [WorkflowListObject, Table],
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's workflows, a page at a time: in default, the api's repository and your library; in a factory's, the workflows attached to it. Each name is served once, the first origin that holds it, unless ?origin= reads one origin's. Answers a WorkflowList, or the same page as a Table where the request asks for one.",
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
    success: WorkflowMade,
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
  HttpApiEndpoint.get('keys', '/api/workflow-keys', { success: KeyForm, error: definitionErrors }).annotate(
    OpenApi.Description,
    "The builder's form: every key a step takes, with its kind and what it means.",
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
 * A namespace's agents, as the workflows: listed, read and read as a card, a write sent there refused, naming its way; and an agent's
 * custom instructions, one record per agent's name, read in any namespace. The store's library, in no namespace: the person's agents
 * beside the builtins, listed with who uses each, read, the person's made, written and removed, tried, an agent file copied into it, and
 * the custom instructions written and cleared. And where agent files are looked for (`/api/agent-sources`), out of the library's paths,
 * where it would read as an agent's name.
 */
export class AgentsGroup extends HttpApiGroup.make('agents').add(
  HttpApiEndpoint.get('listLibrary', '/api/agents', {
    query: { ...listQuery, ...originQuery },
    success: AgentListOrTable,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "The store's library of agents: the person's beside the builtins, each with the factories that use it and what shadows it.",
  ),
  HttpApiEndpoint.get('getLibrary', '/api/agents/:name', {
    params: libraryParams,
    query: originQuery,
    success: AgentObject,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "One agent of the store's library by its name, the person's first, with the factories that use it."),
  HttpApiEndpoint.post('createLibrary', '/api/agents', {
    payload: AgentWrite,
    success: AgentMade,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Makes an agent in the person's library; a factory resolves it once it adds it."),
  HttpApiEndpoint.put('replaceLibrary', '/api/agents/:name', {
    params: libraryParams,
    payload: AgentWrite,
    success: AgentObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes an agent of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy, which shadows it.",
  ),
  HttpApiEndpoint.delete('deleteLibrary', '/api/agents/:name', {
    params: libraryParams,
    query: { ...removeQuery, ...repoQuery },
    success: AgentObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Removes an agent of the person's library; refused with a 409 naming each factory that uses it, and a builtin is never removed.",
  ),
  HttpApiEndpoint.post('tryLibrary', '/api/agents/:name/try', {
    params: libraryParams,
    payload: AgentTry,
    success: AgentTried.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Tries an agent of the person's library on a short brief, in a folder of its own, under a small cap."),
  HttpApiEndpoint.post('copyLibrary', '/api/agents/copy', {
    payload: AgentCopy,
    success: AgentCopied,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Copies an agent file the store knows of into the person's library."),
  HttpApiEndpoint.put('putInstructions', '/api/agents/:name/instructions', {
    params: libraryParams,
    query: instructionsQuery,
    payload: AgentInstructionsWrite,
    success: AgentInstructions,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes the person's custom instructions for an agent's name, which every factory's steps on it are told.",
  ),
  HttpApiEndpoint.delete('deleteInstructions', '/api/agents/:name/instructions', {
    params: libraryParams,
    query: instructionsQuery,
    success: AgentInstructionsCleared,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Clears the person's custom instructions for an agent's name."),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery, ...repoQuery },
    success: AgentListOrTable,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's agents, a page at a time: the repository's, the user library's added to it and, in a factory made from a template, its tree's, each with the steps that name it and the hires that fill a step with it. ?origin= reads one origin's. Answers an AgentList, or the same page as a Table where the request asks for one.",
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
    success: AgentMade,
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
  HttpApiEndpoint.get('card', '/api/namespaces/:namespace/agents/:name/card', {
    params: cardParams,
    query: { ...originQuery, ...repoQuery },
    success: AgentCard,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    'Reads an agent as an A2A Agent Card, with the truth about it: it is not served over A2A, and why says what the card leaves out. Answers AgentCard.',
  ),
  HttpApiEndpoint.get('sources', '/api/agent-sources', {
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
    "The agent files the store knows of, to copy into the person's library: each repository's, the library's, and those of a folder named.",
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
  HttpApiEndpoint.post('read', '/api/agents/read', { payload: DefinitionFiles, success: AgentDrafted, error: definitionErrors }).annotate(
    OpenApi.Description,
    "Reads an agent's file as a person keeps it into the spec a create or a replace would send, in no namespace; nothing is written. Answers AgentDrafted.",
  ),
) {}

/**
 * A namespace's skills: listed and read, a write sent there refused, naming its way. The store's library, in no namespace: the person's
 * skills beside the builtins, listed with who uses each, read, the person's made, written and removed, a builtin one copied to the
 * person's, and a folder's files by path.
 */
export class SkillsGroup extends HttpApiGroup.make('skills').add(
  HttpApiEndpoint.get('listLibrary', '/api/skills', {
    query: { ...listQuery, ...originQuery },
    success: SkillListOrTable,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "The store's library of skills: the person's beside the builtins, each with the factories that use it and what shadows it.",
  ),
  HttpApiEndpoint.get('getLibrary', '/api/skills/:name', {
    params: libraryParams,
    query: originQuery,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "One skill of the store's library by its name, the person's first, with the factories that use it."),
  HttpApiEndpoint.post('createLibrary', '/api/skills', {
    payload: SkillWrite,
    success: SkillMade,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Makes a skill in the person's library; a factory resolves it once it adds it."),
  HttpApiEndpoint.put('replaceLibrary', '/api/skills/:name', {
    params: libraryParams,
    payload: SkillWrite,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Writes a skill of the person's library whole, at the resourceVersion it was read at; a builtin's is written as the person's copy, which shadows it.",
  ),
  HttpApiEndpoint.delete('deleteLibrary', '/api/skills/:name', {
    params: libraryParams,
    query: removeQuery,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Removes a skill of the person's library; refused with a 409 naming each factory that uses it, and a builtin is never removed.",
  ),
  HttpApiEndpoint.post('copyLibrary', '/api/skills/:name/copy', {
    params: libraryParams,
    success: SkillMade,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Copies a builtin skill into the person's library, recording the builtin's digest so a later change is flagged.",
  ),
  HttpApiEndpoint.get('filesLibrary', '/api/skills/:name/files', {
    params: libraryParams,
    query: originQuery,
    success: SkillFiles,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "The files of a skill of the store's library, by path."),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: SkillListOrTable,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a namespace's skills, a page at a time: the factory's tree's, the repository's, the user library's and Nemia's builtin it has added, each name served once, the first origin that holds it, unless ?origin= reads one origin's. Answers a SkillList, or the same page as a Table where the request asks for one.",
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
    success: SkillMade,
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
