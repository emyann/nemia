/**
 * The one definition of what the api serves of the objects (`Api`): the handlers the api builds from it, the clients that read through
 * it and the OpenAPI document it writes (`OpenApi.fromApi(Api)`) are all made from this, so no layer keeps a shape of its own.
 *
 * Group `runs`: the run object and its four sub-resources, at the paths the api has always answered them on. Group `cards`: the inbox's
 * cards as objects, listed across namespaces or in one (a card's namespace is its factory, `default` for one that names none), read,
 * filed, dropped, started, queued and taken off the queue, and their labels edited. Every refusal is an object with one key, `error`, the
 * sentence that says what to do next, as the api's other routes answer one; a Conflict carries the `users` that hold the thing too.
 *
 * Group `factories`: the factories, which no namespace holds, listed and read, and each one's sub-resources — its rules and its
 * instruction, read, written and cleared, and the lines a person types for it (`commands`). The factory's parts are each in the
 * factory's namespace: group `mcpservers`, its MCP servers, read, recorded and taken off, and signed in to; group `builtin`, the servers
 * Nemia offers, in no namespace; groups `schedules` and `hires`, read, written and taken back; and group `volumes`, read alone.
 *
 * The definitions, each in a factory's namespace as the factory resolves it: groups `workflows`, `agents` and `skills`, each listed with
 * `?origin=` for one origin's, shadowed or not, read, and yours written in `default` alone; an agent tried and read as a card, a builtin
 * skill copied to yours and a skill's files listed by path.
 */
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Card, CardFile, CardList, CardStart } from './card.ts';
import {
  Factory,
  FactoryCommands,
  FactoryInstruction,
  FactoryInstructionWords,
  FactoryInstructionWrite,
  FactoryList,
  FactoryRules,
  FactoryRulesWrite,
} from './factory.ts';
import { Hire, HireList, HireWrite } from './hire.ts';
import { McpServer, McpServerList, McpServerWrite, SignInStarted, SignInState, SignedOut } from './mcp-server.ts';
import { Schedule, ScheduleList, ScheduleWrite } from './schedule.ts';
import { Volume, VolumeList } from './volume.ts';
import { Workflow, WorkflowCreate, WorkflowList, WorkflowWrite } from './workflow.ts';
import { Agent, AgentCard, AgentList, AgentTried, AgentTry, AgentWrite } from './agent.ts';
import { Skill, SkillFiles, SkillList, SkillWrite } from './skill.ts';
import { LabelEdit, Labelled, Run, StepTold, StepTries, StepTry, TryCloseout } from './run.ts';

/** The kinds the api serves as objects, each with its object Schema, its `<Kind>List` and its get endpoint here. */
export const KINDS = ['Run', 'Card', 'Factory', 'McpServer', 'Schedule', 'Hire', 'Volume', 'Workflow', 'Agent', 'Skill'] as const;
export type Kind = (typeof KINDS)[number];

/** Nothing by that name, or not in that namespace: a 404. */
export class Missing extends Schema.Class<Missing>('Missing')({ error: Schema.String }, { httpApiStatus: 404 }) {}

/** The thing is held by something else, named in `users` where the package names them: a 409. */
export class Conflict extends Schema.Class<Conflict>('Conflict')(
  { error: Schema.String, users: Schema.optionalKey(Schema.Array(Schema.String)) },
  { httpApiStatus: 409 },
) {}

/** A request the package refuses as it is said — a label query, a limit, a token, a name: a 422. */
export class Invalid extends Schema.Class<Invalid>('Invalid')({ error: Schema.String }, { httpApiStatus: 422 }) {}

/** A run one of whose tasks does not read, so it is not judged: a 502, in the words the list says it with. */
export class Unjudged extends Schema.Class<Unjudged>('Unjudged')({ error: Schema.String }, { httpApiStatus: 502 }) {}

/** The Card and a page of them, named so that the document holds each as a component, as it holds the Run. */
const CardObject = Card.annotate({ identifier: 'Card' });
const CardListObject = CardList.annotate({ identifier: 'CardList' });

/** The factory's kinds and a page of each, named so that the document holds each as a component. */
const FactoryObject = Factory.annotate({ identifier: 'Factory' });
const FactoryListObject = FactoryList.annotate({ identifier: 'FactoryList' });
const FactoryCommandsObject = FactoryCommands.annotate({ identifier: 'FactoryCommands' });
const McpServerObject = McpServer.annotate({ identifier: 'McpServer' });
const McpServerListObject = McpServerList.annotate({ identifier: 'McpServerList' });
const ScheduleObject = Schedule.annotate({ identifier: 'Schedule' });
const ScheduleListObject = ScheduleList.annotate({ identifier: 'ScheduleList' });
const HireObject = Hire.annotate({ identifier: 'Hire' });
const HireListObject = HireList.annotate({ identifier: 'HireList' });
const VolumeObject = Volume.annotate({ identifier: 'Volume' });
const VolumeListObject = VolumeList.annotate({ identifier: 'VolumeList' });

/** The definitions and a page of each, named so that the document holds each as a component. */
const WorkflowObject = Workflow.annotate({ identifier: 'Workflow' });
const WorkflowListObject = WorkflowList.annotate({ identifier: 'WorkflowList' });
const AgentObject = Agent.annotate({ identifier: 'Agent' });
const AgentListObject = AgentList.annotate({ identifier: 'AgentList' });
const SkillObject = Skill.annotate({ identifier: 'Skill' });
const SkillListObject = SkillList.annotate({ identifier: 'SkillList' });

/** A run's step, named in the path. */
const stepParams = { runId: Schema.String, step: Schema.String };

/** A step's try, by its number as the path says it. */
const tryParams = { ...stepParams, try: Schema.String };

/** One label query, or several given again, OR'd. */
const LabelQuery = Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)]));

/**
 * The query of a list: `limit` (a whole number from 1), `continue` (the token the page before answered), `labelSelector`, and `selector`,
 * its retired spelling, read the same. Each kept as the text it was sent as, so a wrong one is refused in the package's words, a 422.
 */
const listQuery = {
  limit: Schema.optionalKey(Schema.String),
  continue: Schema.optionalKey(Schema.String),
  labelSelector: LabelQuery,
  selector: LabelQuery,
};

/** A card, or any object a namespace holds, by its namespace and its name. */
const cardParams = { namespace: Schema.String, name: Schema.String };

/** A namespace, for a list in it. */
const namespaceParams = { namespace: Schema.String };

/** A factory, by its name. */
const factoryParams = { name: Schema.String };

/** The run object and its sub-resources. */
export class RunsGroup extends HttpApiGroup.make('runs').add(
  HttpApiEndpoint.get('show', '/api/runs/:runId', { params: { runId: Schema.String }, success: Run, error: [Missing, Invalid, Unjudged] }),
  HttpApiEndpoint.get('tries', '/api/runs/:runId/steps/:step/tries', {
    params: stepParams,
    success: StepTries,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('try', '/api/runs/:runId/steps/:step/tries/:try', {
    params: tryParams,
    success: StepTry,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('closeout', '/api/runs/:runId/steps/:step/tries/:try/closeout', {
    params: tryParams,
    success: TryCloseout,
    error: [Missing, Invalid, Unjudged],
  }),
  HttpApiEndpoint.get('told', '/api/runs/:runId/steps/:step/told', {
    params: stepParams,
    success: StepTold,
    error: [Missing, Invalid, Unjudged],
  }),
) {}

/** What a card's verbs refuse with. */
const cardErrors = [Missing, Conflict, Invalid];

/** The inbox's cards as objects. */
export class CardsGroup extends HttpApiGroup.make('cards').add(
  HttpApiEndpoint.get('listAll', '/api/cards', { query: listQuery, success: CardListObject, error: cardErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: { namespace: Schema.String },
    query: listQuery,
    success: CardListObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', { params: cardParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/cards', {
    params: { namespace: Schema.String },
    payload: CardFile,
    success: CardObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: cardErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('start', '/api/namespaces/:namespace/cards/:name/start', {
    params: cardParams,
    payload: CardStart,
    success: Schema.Struct({ id: Schema.String, card: Schema.String }).pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: cardErrors,
  }),
  HttpApiEndpoint.post('queue', '/api/namespaces/:namespace/cards/:name/queue', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('unqueue', '/api/namespaces/:namespace/cards/:name/unqueue', {
    params: cardParams,
    success: CardObject,
    error: cardErrors,
  }),
  HttpApiEndpoint.post('labels', '/api/namespaces/:namespace/cards/:name/labels', {
    params: cardParams,
    payload: LabelEdit,
    success: Labelled,
    error: cardErrors,
  }),
) {}

/** What every verb of a factory and of its parts refuses with, as a card's do. */
const objectErrors = cardErrors;

/** The factories, which no namespace holds, and each one's rules, instruction and command lines. */
export class FactoriesGroup extends HttpApiGroup.make('factories').add(
  HttpApiEndpoint.get('listAll', '/api/factories', { query: listQuery, success: FactoryListObject, error: objectErrors }),
  HttpApiEndpoint.get('get', '/api/factories/:name', { params: factoryParams, success: FactoryObject, error: objectErrors }),
  HttpApiEndpoint.get('rules', '/api/factories/:name/rules', { params: factoryParams, success: FactoryRules, error: objectErrors }),
  HttpApiEndpoint.put('putRules', '/api/factories/:name/rules', {
    params: factoryParams,
    payload: FactoryRulesWrite,
    success: FactoryRules,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteRules', '/api/factories/:name/rules', {
    params: factoryParams,
    success: FactoryRules,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('instruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    payload: FactoryInstructionWrite,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteInstruction', '/api/factories/:name/instruction', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    payload: FactoryInstructionWords,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteInstructionWords', '/api/factories/:name/instruction/words', {
    params: factoryParams,
    success: FactoryInstruction,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('commands', '/api/factories/:name/commands', {
    params: factoryParams,
    success: FactoryCommandsObject,
    error: objectErrors,
  }),
) {}

/** A factory's MCP servers, in its namespace, and their sign-in. */
export class McpServersGroup extends HttpApiGroup.make('mcpservers').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/mcpservers', {
    params: namespaceParams,
    query: listQuery,
    success: McpServerListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    payload: McpServerWrite,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/mcpservers/:name', {
    params: cardParams,
    success: McpServerObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('signIn', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInStarted,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('signInState', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignInState,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('signOut', '/api/namespaces/:namespace/mcpservers/:name/sign-in', {
    params: cardParams,
    success: SignedOut,
    error: objectErrors,
  }),
) {}

/** The MCP servers Nemia offers a factory: a page whose items carry their spec alone, in no namespace. */
export class BuiltinGroup extends HttpApiGroup.make('builtin').add(
  HttpApiEndpoint.get('mcpservers', '/api/builtin/mcpservers', { success: McpServerListObject, error: objectErrors }),
) {}

/** A factory's schedules, in its namespace, each named by its workflow. */
export class SchedulesGroup extends HttpApiGroup.make('schedules').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/schedules', {
    params: namespaceParams,
    query: listQuery,
    success: ScheduleListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    payload: ScheduleWrite,
    success: ScheduleObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/schedules/:name', {
    params: cardParams,
    success: ScheduleObject,
    error: objectErrors,
  }),
) {}

/** A factory's hires, in its namespace, one per step it offers, each named `<workflow>.<step>`. */
export class HiresGroup extends HttpApiGroup.make('hires').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/hires', {
    params: namespaceParams,
    query: listQuery,
    success: HireListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/hires/:name', { params: cardParams, success: HireObject, error: objectErrors }),
  HttpApiEndpoint.put('put', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    payload: HireWrite,
    success: HireObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/hires/:name', {
    params: cardParams,
    success: HireObject,
    error: objectErrors,
  }),
) {}

/** A factory's volumes, in its namespace, by their stored names: read alone over the api. */
export class VolumesGroup extends HttpApiGroup.make('volumes').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/volumes', {
    params: namespaceParams,
    query: listQuery,
    success: VolumeListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/volumes/:name', {
    params: cardParams,
    success: VolumeObject,
    error: objectErrors,
  }),
) {}

/**
 * The query of a definition's read: `origin`, the one origin asked for (`DEFINITION_ORIGINS`), whose definitions are served shadowed or
 * not, each saying what shadows it; kept as the text it was sent as, so a wrong word is refused in the package's words, a 422.
 */
const originQuery = { origin: Schema.optionalKey(Schema.String) };

/** The query of a removal: the `resourceVersion` it was read at, refused where the files now hold another. */
const removeQuery = { resourceVersion: Schema.optionalKey(Schema.String) };

/**
 * A namespace's workflows: the factory's resolved view of each name (`default`: the api's repository and your library), listed, read,
 * and — yours, in `default` alone — made, written whole and removed.
 */
export class WorkflowsGroup extends HttpApiGroup.make('workflows').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: WorkflowListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: originQuery,
    success: WorkflowObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/workflows', {
    params: namespaceParams,
    payload: WorkflowCreate,
    success: WorkflowObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    payload: WorkflowWrite,
    success: WorkflowObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/workflows/:name', {
    params: cardParams,
    query: removeQuery,
    success: WorkflowObject,
    error: objectErrors,
  }),
) {}

/** A namespace's agents, as the workflows: listed, read, yours made, written and removed in `default`, tried, and read as a card. */
export class AgentsGroup extends HttpApiGroup.make('agents').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: AgentListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: originQuery,
    success: AgentObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/agents', {
    params: namespaceParams,
    payload: AgentWrite,
    success: AgentObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    payload: AgentWrite,
    success: AgentObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/namespaces/:namespace/agents/:name', {
    params: cardParams,
    query: removeQuery,
    success: AgentObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('try', '/api/namespaces/:namespace/agents/:name/try', {
    params: cardParams,
    payload: AgentTry,
    success: AgentTried.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.get('card', '/api/namespaces/:namespace/agents/:name/card', {
    params: cardParams,
    query: originQuery,
    success: AgentCard,
    error: objectErrors,
  }),
) {}

/** A namespace's skills: listed, read, yours made and written in `default`, a builtin one copied to yours, and a folder's files by path. */
export class SkillsGroup extends HttpApiGroup.make('skills').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    query: { ...listQuery, ...originQuery },
    success: SkillListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    query: originQuery,
    success: SkillObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/namespaces/:namespace/skills', {
    params: namespaceParams,
    payload: SkillWrite,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.put('replace', '/api/namespaces/:namespace/skills/:name', {
    params: cardParams,
    payload: SkillWrite,
    success: SkillObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('copy', '/api/namespaces/:namespace/skills/:name/copy', {
    params: cardParams,
    success: SkillObject.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: objectErrors,
  }),
  HttpApiEndpoint.get('files', '/api/namespaces/:namespace/skills/:name/files', {
    params: cardParams,
    query: originQuery,
    success: SkillFiles,
    error: objectErrors,
  }),
) {}

/** Everything the api serves as objects. */
export const Api = HttpApi.make('nemia')
  .add(RunsGroup)
  .add(CardsGroup)
  .add(FactoriesGroup)
  .add(McpServersGroup)
  .add(BuiltinGroup)
  .add(SchedulesGroup)
  .add(HiresGroup)
  .add(VolumesGroup)
  .add(WorkflowsGroup)
  .add(AgentsGroup)
  .add(SkillsGroup);
