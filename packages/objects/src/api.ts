/**
 * The one definition of what the api serves of the objects (`Api`): the handlers the api builds from it, the clients that read through
 * it and the OpenAPI document it writes (`OpenApi.fromApi(Api)`) are all made from this, so no layer keeps a shape of its own.
 *
 * Group `runs`: the run object, listed across namespaces and in one (a run's namespace is its factory, `default` for one that names none),
 * read in its namespace and across all by its id, its four sub-resources at the paths the api has always answered them on, and its named
 * actions, each in its namespace alone: started, removed, refreshed, pruned, labelled, held and lifted, and a step of it tried again,
 * approved and said words to. Group `cards`: the inbox's
 * cards as objects, listed across namespaces or in one (a card's namespace is its factory, `default` for one that names none), read in
 * its namespace and across all by its name (each read of one carrying the card's file as written), filed, written whole, dropped,
 * started, queued and taken off the queue, and their labels edited. Every refusal is an object with one key, `error`, the
 * sentence that says what to do next, as the api's other routes answer one; a Conflict carries the `users` that hold the thing too.
 *
 * Group `factories`: the factories, which no namespace holds, listed, read and removed, and each one's sub-resources — its rules and its
 * instruction, read, written and cleared, the lines a person types for it (`commands`), its cost line per workflow, its revisions
 * policy, its places trusted again, a workflow attached and detached, and a harness setting set and taken off; and the writes that name a
 * template or a folder: a factory filed, a volume mounted and taken off, a factory made from a template, a hand-made one taken over by
 * one, either previewed, an upgrade filed and a conflict's choice, a template in the body as `TemplateGiven`. The factory's parts are
 * each in the factory's namespace: group `mcpservers`, its MCP servers, read, recorded and taken off, and signed in to; group `builtin`,
 * the servers Nemia offers, in no namespace; groups `schedules` and `hires`, read, written and taken back; and group `volumes`, read
 * alone.
 *
 * The definitions, each in a factory's namespace as the factory resolves it: groups `workflows`, `agents` and `skills`, each listed with
 * `?origin=` for one origin's, shadowed or not, read, and yours written in `default` alone; an agent tried and read as a card, a builtin
 * skill copied to yours and a skill's files listed by path.
 *
 * Cluster-scoped, beside the factories: group `templates`, the templates Nemia builds in, and each one's documents as the definitions'
 * Schemas; group `subscriptions`, the feed's subscriptions, read alone here. Group `events`, the feed's lines, each in the namespace of
 * the factory it names, a daemon's and the store's that name none in no namespace. Group `discovery`, `GET /api`: every resource the
 * groups above serve, its scope and verbs.
 *
 * In each factory's namespace, groups `proposals` and `delegations` (`proposal-api.ts`): a change of the factory's definitions proposed,
 * approved, declined and listed, and what the person lets an agent approve unasked.
 *
 * The runs, the cards, the factories, a factory's MCP servers, the agents and the skills are each listed as their `<Kind>List`, or as
 * the same page's `Table` where the request asks for one (`TABLE_ACCEPT`): two successes of one status. A watch answers no Table.
 */
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import { Card, CardFile, CardList, CardStart, CardWrite } from './card.ts';
import { Table } from './table.ts';
import {
  Factory,
  FactoryAdopted,
  FactoryAdoptWrite,
  FactoryApplied,
  FactoryApplyWrite,
  FactoryCommands,
  FactoryCreate,
  FactoryCreated,
  FactoryDiffWrite,
  FactoryPlan,
  FactoryResolved,
  FactoryResolveWrite,
  FactoryUpgraded,
  FactoryUpgradeWrite,
  VolumeAdded,
  VolumeRemoved,
  VolumeWrite,
  FactoryCostLineWrite,
  FactoryInstruction,
  FactoryInstructionWords,
  FactoryInstructionWrite,
  FactoryList,
  FactoryRemoved,
  FactoryRevisionsWrite,
  FactoryRules,
  FactoryRulesWrite,
  FactorySettingWrite,
  FactoryTrusted,
} from './factory.ts';
import { Hire, HireList, HireWrite } from './hire.ts';
import { McpServer, McpServerList, McpServerWrite, SignInCallback, SignInStarted, SignInState, SignedOut } from './mcp-server.ts';
import { Schedule, ScheduleList, ScheduleWrite } from './schedule.ts';
import { Volume, VolumeList } from './volume.ts';
import { KeyForm, Workflow, WorkflowCreate, WorkflowList, WorkflowStepPage, WorkflowWrite } from './workflow.ts';
import {
  Agent,
  AgentCard,
  AgentCopied,
  AgentCopy,
  AgentInstructions,
  AgentInstructionsCleared,
  AgentInstructionsWrite,
  AgentList,
  AgentSources,
  AgentTried,
  AgentTry,
  AgentWrite,
} from './agent.ts';
import { Skill, SkillFiles, SkillList, SkillWrite } from './skill.ts';
import { LabelEdit, Labelled } from './labels.ts';
import { Template, TemplateList } from './template.ts';
import { BadRequest, Conflict, Failed, Forbidden, Invalid, listQuery, Missing, Unauthorized, Unjudged, WriteFailed } from './api-errors.ts';
import { DelegationsGroup, ProposalsGroup } from './proposal-api.ts';
import { RunsGroup } from './run-api.ts';
import { StepsGroup } from './step-api.ts';
import { NemiaGroup } from './nemia-api.ts';
import { Subscription, SubscriptionList } from './subscription.ts';
import { Event, EventList } from './event.ts';
import { KINDS, type Kind } from './words.ts';
import { APIResourceList } from './discovery.ts';
import { ServerGroup, Subscribed, SubscriptionWrite, Unsubscribed } from './server-api.ts';
import { ReadinessGroup } from './readiness.ts';
import { PairGroup, PairingsGroup } from './pairing.ts';

export {
  BadRequest,
  Conflict,
  Failed,
  Forbidden,
  Invalid,
  Missing,
  Unauthorized,
  Unjudged,
  WriteFailed,
  RunsGroup,
  ProposalsGroup,
  DelegationsGroup,
};

export { KINDS, type Kind };

/** The Card and a page of them, named so that the document holds each as a component, as it holds the Run. */
const CardObject = Card.annotate({ identifier: 'Card' });
const CardListObject = CardList.annotate({ identifier: 'CardList' });
/**
 * A page of cards, or the same page as a `Table` where the request's `Accept` asks for one (`TABLE_ACCEPT`): two answers of one status,
 * each its own success, so each is read off the endpoint by its kind.
 */
const CardListOrTable = [CardListObject, Table] as const;

/** The factory's kinds and a page of each, named so that the document holds each as a component. */
const FactoryObject = Factory.annotate({ identifier: 'Factory' });
const FactoryListObject = FactoryList.annotate({ identifier: 'FactoryList' });
const FactoryCommandsObject = FactoryCommands.annotate({ identifier: 'FactoryCommands' });
const FactoryTrustedObject = FactoryTrusted.annotate({ identifier: 'FactoryTrusted' });
const FactoryRemovedObject = FactoryRemoved.annotate({ identifier: 'FactoryRemoved' });
const McpServerObject = McpServer.annotate({ identifier: 'McpServer' });
const McpServerListObject = McpServerList.annotate({ identifier: 'McpServerList' });
const ScheduleObject = Schedule.annotate({ identifier: 'Schedule' });
const ScheduleListObject = ScheduleList.annotate({ identifier: 'ScheduleList' });
const HireObject = Hire.annotate({ identifier: 'Hire' });
const HireListObject = HireList.annotate({ identifier: 'HireList' });
const VolumeObject = Volume.annotate({ identifier: 'Volume' });
const VolumeListObject = VolumeList.annotate({ identifier: 'VolumeList' });
/** The factories and a factory's MCP servers, each a page or the same page as a `Table` where the request asks for one, as the cards. */
const FactoryListOrTable = [FactoryListObject, Table] as const;
const McpServerListOrTable = [McpServerListObject, Table] as const;

/** The definitions and a page of each, named so that the document holds each as a component. */
const WorkflowObject = Workflow.annotate({ identifier: 'Workflow' });
const WorkflowListObject = WorkflowList.annotate({ identifier: 'WorkflowList' });
const AgentObject = Agent.annotate({ identifier: 'Agent' });
const AgentListObject = AgentList.annotate({ identifier: 'AgentList' });
const SkillObject = Skill.annotate({ identifier: 'Skill' });
const SkillListObject = SkillList.annotate({ identifier: 'SkillList' });
/** A namespace's agents and skills, each a page or the same page as a `Table` where the request asks for one, as the cards. */
const AgentListOrTable = [AgentListObject, Table] as const;
const SkillListOrTable = [SkillListObject, Table] as const;

/** The cluster's templates, subscriptions and the feed's events, and a page of each, named so that the document holds each. */
const TemplateObject = Template.annotate({ identifier: 'Template' });
const TemplateListObject = TemplateList.annotate({ identifier: 'TemplateList' });
const SubscriptionObject = Subscription.annotate({ identifier: 'Subscription' });
const SubscriptionListObject = SubscriptionList.annotate({ identifier: 'SubscriptionList' });
const EventObject = Event.annotate({ identifier: 'Event' });
const EventListObject = EventList.annotate({ identifier: 'EventList' });

/** A card, or any object a namespace holds, by its namespace and its name. */
const cardParams = { namespace: Schema.String, name: Schema.String };

/** A namespace, for a list in it. */
const namespaceParams = { namespace: Schema.String };

/** A factory, by its name. */
const factoryParams = { name: Schema.String };
const factoryWorkflowParams = { name: Schema.String, workflow: Schema.String };
const factorySettingParams = { name: Schema.String, setting: Schema.String };

/** The path of a factory's write that a command of the factory's own spells `<factory>`: its name, under that key. */
const factoryOwnParams = { factory: Schema.String };

/**
 * The query of a list of cards: a list's (`listQuery`), and `fieldSelector`, the cards by whether they are still in play, in Kubernetes'
 * spelling: `status.inPlay=true` (or `==true`, `!=false`) the cards not started or whose run has not ended, `status.inPlay=false` those
 * whose run ended; an empty one, or none, every card. Any other is refused `Invalid`, naming the forms it takes.
 */
const cardListQuery = { ...listQuery, fieldSelector: Schema.optionalKey(Schema.String) };

/** What a card's verbs refuse with: a request its reader refuses before the package is asked (400) among them. */
const cardErrors = [BadRequest, Missing, Conflict, Invalid];

/** The inbox's cards as objects. */
export class CardsGroup extends HttpApiGroup.make('cards').add(
  HttpApiEndpoint.get('listAll', '/api/cards', { query: cardListQuery, success: CardListOrTable, error: cardErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/cards', {
    params: { namespace: Schema.String },
    query: cardListQuery,
    success: CardListOrTable,
    error: cardErrors,
  }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/cards/:name', { params: cardParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.get('getAll', '/api/cards/:name', { params: factoryParams, success: CardObject, error: cardErrors }),
  HttpApiEndpoint.put('update', '/api/namespaces/:namespace/cards/:name', {
    params: cardParams,
    payload: CardWrite,
    success: CardObject,
    error: cardErrors,
  }),
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
    success: Schema.Struct({ id: Schema.String, card: Schema.String, ignoredRepo: Schema.optionalKey(Schema.String) }).pipe(
      Schema.annotate({ httpApiStatus: 201 }),
    ),
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

/** What a definition's verbs refuse with: a part's refusals, and a write the disk failed. */
const definitionErrors = [...cardErrors, Failed];

/**
 * The factories, which no namespace holds, and each one's rules, instruction, command lines and cost lines; filed, made from a template,
 * taken over by one, previewed, upgraded and resolved, and its volumes mounted and taken off.
 */
export class FactoriesGroup extends HttpApiGroup.make('factories').add(
  HttpApiEndpoint.get('listAll', '/api/factories', { query: listQuery, success: FactoryListOrTable, error: objectErrors }),
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
  HttpApiEndpoint.put('putCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    payload: FactoryCostLineWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteCostLine', '/api/factories/:name/costlines/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('delete', '/api/factories/:name', {
    params: factoryParams,
    success: FactoryRemovedObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('setRevisions', '/api/factories/:name/revisions', {
    params: factoryParams,
    payload: FactoryRevisionsWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('trust', '/api/factories/:name/trust', {
    params: factoryParams,
    success: FactoryTrustedObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('attach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('detach', '/api/factories/:name/workflows/:workflow', {
    params: factoryWorkflowParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.put('putSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    payload: FactorySettingWrite,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('deleteSetting', '/api/factories/:name/settings/:setting', {
    params: factorySettingParams,
    success: FactoryObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('create', '/api/factories', { payload: FactoryCreate, success: FactoryCreated, error: objectErrors }),
  HttpApiEndpoint.post('addVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    payload: VolumeWrite,
    success: VolumeAdded,
    error: objectErrors,
  }),
  HttpApiEndpoint.delete('removeVolume', '/api/factories/:factory/volumes', {
    params: factoryOwnParams,
    query: { path: Schema.String },
    success: VolumeRemoved,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('apply', '/api/factories/:name/apply', {
    params: factoryParams,
    payload: FactoryApplyWrite,
    success: FactoryApplied,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('adopt', '/api/factories/:factory/adopt', {
    params: factoryOwnParams,
    payload: FactoryAdoptWrite,
    success: FactoryAdopted,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('diff', '/api/factories/:factory/diff', {
    params: factoryOwnParams,
    payload: FactoryDiffWrite,
    success: FactoryPlan,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('upgrade', '/api/factories/:factory/upgrade', {
    params: factoryOwnParams,
    payload: FactoryUpgradeWrite,
    success: FactoryUpgraded,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('resolve', '/api/factories/:factory/resolve', {
    params: factoryOwnParams,
    payload: FactoryResolveWrite,
    success: FactoryResolved,
    error: objectErrors,
  }),
) {}

/** A factory's MCP servers, in its namespace, and their sign-in. */
export class McpServersGroup extends HttpApiGroup.make('mcpservers').add(
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/mcpservers', {
    params: namespaceParams,
    query: listQuery,
    success: McpServerListOrTable,
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
  HttpApiEndpoint.post('signInCallback', '/api/namespaces/:namespace/mcpservers/:name/sign-in/callback', {
    params: cardParams,
    payload: SignInCallback,
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
  HttpApiEndpoint.get('mcpservers', '/api/builtin/mcpservers', { query: listQuery, success: McpServerListObject, error: objectErrors }),
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
    query: removeQuery,
    success: WorkflowObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('step', '/api/namespaces/:namespace/workflows/:name/steps/:step', {
    params: { ...cardParams, step: Schema.String },
    query: originQuery,
    success: WorkflowStepPage,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('keys', '/api/workflows/keys', { success: KeyForm, error: definitionErrors }),
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
    query: { ...listQuery, ...originQuery },
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
    query: removeQuery,
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
    query: originQuery,
    success: AgentCard,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('sources', '/api/agents/sources', {
    query: { path: Schema.optionalKey(Schema.String) },
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
    success: AgentInstructions,
    error: definitionErrors,
  }),
  HttpApiEndpoint.put('putInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    payload: AgentInstructionsWrite,
    success: AgentInstructions,
    error: definitionErrors,
  }),
  HttpApiEndpoint.delete('deleteInstructions', '/api/namespaces/:namespace/agents/:name/instructions', {
    params: cardParams,
    success: AgentInstructionsCleared,
    error: definitionErrors,
  }),
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
) {}

/** A template, by its name, and one of its documents, by the template's name and the document's. */
const templateParams = { name: Schema.String };
const documentParams = { name: Schema.String, doc: Schema.String };

/**
 * The templates Nemia builds in, which no namespace holds, listed and read; and each one's documents, its workflows, agents and skills,
 * rendered with its parameters' defaults and served in the Schemas a namespace serves them in, with origin `builtin`.
 */
export class TemplatesGroup extends HttpApiGroup.make('templates').add(
  HttpApiEndpoint.get('listAll', '/api/templates', { query: listQuery, success: TemplateListObject, error: objectErrors }),
  HttpApiEndpoint.get('get', '/api/templates/:name', { params: templateParams, success: TemplateObject, error: objectErrors }),
  HttpApiEndpoint.get('workflows', '/api/templates/:name/workflows', {
    params: templateParams,
    query: listQuery,
    success: WorkflowListObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('workflow', '/api/templates/:name/workflows/:doc', {
    params: documentParams,
    success: WorkflowObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('agents', '/api/templates/:name/agents', {
    params: templateParams,
    query: listQuery,
    success: AgentListObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('agent', '/api/templates/:name/agents/:doc', {
    params: documentParams,
    success: AgentObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('skills', '/api/templates/:name/skills', {
    params: templateParams,
    query: listQuery,
    success: SkillListObject,
    error: definitionErrors,
  }),
  HttpApiEndpoint.get('skill', '/api/templates/:name/skills/:doc', {
    params: documentParams,
    success: SkillObject,
    error: definitionErrors,
  }),
) {}

/**
 * The feed's subscriptions, which no namespace holds, listed and read; and a long-lived task given one (`nemia subscribe`), and one taken
 * away (`nemia unsubscribe`).
 */
export class SubscriptionsGroup extends HttpApiGroup.make('subscriptions').add(
  HttpApiEndpoint.get('listAll', '/api/subscriptions', { query: listQuery, success: SubscriptionListObject, error: objectErrors }),
  HttpApiEndpoint.get('get', '/api/subscriptions/:name', {
    params: templateParams,
    success: SubscriptionObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('subscribe', '/api/subscriptions/:name', {
    params: templateParams,
    payload: SubscriptionWrite,
    success: Subscribed.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [...objectErrors, Failed],
  }),
  HttpApiEndpoint.delete('unsubscribe', '/api/subscriptions/:name', {
    params: templateParams,
    success: Unsubscribed,
    error: [...objectErrors, Failed],
  }),
) {}

/**
 * The feed's lines as events, in the order they were written: all of them, or a namespace's, those of the factory they name; and one by
 * its name, the byte its line starts at — a daemon's or the store's that names no factory in no namespace.
 */
export class EventsGroup extends HttpApiGroup.make('events').add(
  HttpApiEndpoint.get('listAll', '/api/events', { query: listQuery, success: EventListObject, error: objectErrors }),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/events', {
    params: namespaceParams,
    query: listQuery,
    success: EventListObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.get('getAll', '/api/events/:name', { params: templateParams, success: EventObject, error: objectErrors }),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/events/:name', {
    params: cardParams,
    success: EventObject,
    error: objectErrors,
  }),
) {}

/** The api's discovery: every resource it serves, read off this definition (Kubernetes' `/api`, for Nemia's one group version). */
export class DiscoveryGroup extends HttpApiGroup.make('discovery').add(
  HttpApiEndpoint.get('resources', '/api', { success: APIResourceList.annotate({ identifier: 'APIResourceList' }) }),
) {}

/**
 * The plural each kind is served by, its paths' collection (`/api/<plural>` and `/api/namespaces/<namespace>/<plural>`): the name of the
 * group that serves it, read off the group.
 */
export const RESOURCE_PLURALS = {
  Run: RunsGroup.identifier,
  Card: CardsGroup.identifier,
  Factory: FactoriesGroup.identifier,
  McpServer: McpServersGroup.identifier,
  Schedule: SchedulesGroup.identifier,
  Hire: HiresGroup.identifier,
  Volume: VolumesGroup.identifier,
  Workflow: WorkflowsGroup.identifier,
  Agent: AgentsGroup.identifier,
  Skill: SkillsGroup.identifier,
  Template: TemplatesGroup.identifier,
  Subscription: SubscriptionsGroup.identifier,
  Event: EventsGroup.identifier,
  Proposal: ProposalsGroup.identifier,
  Delegation: DelegationsGroup.identifier,
} as const satisfies { readonly [K in Kind]: string };

/** Everything the api serves as objects. */
export const Api = HttpApi.make('nemia')
  .add(RunsGroup)
  .add(StepsGroup)
  .add(CardsGroup)
  .add(FactoriesGroup)
  .add(McpServersGroup)
  .add(BuiltinGroup)
  .add(SchedulesGroup)
  .add(HiresGroup)
  .add(VolumesGroup)
  .add(WorkflowsGroup)
  .add(AgentsGroup)
  .add(SkillsGroup)
  .add(TemplatesGroup)
  .add(SubscriptionsGroup)
  .add(EventsGroup)
  .add(ProposalsGroup)
  .add(DelegationsGroup)
  .add(DiscoveryGroup)
  .add(ServerGroup)
  .add(NemiaGroup)
  .add(ReadinessGroup)
  .add(PairGroup)
  .add(PairingsGroup);

/** The groups `Api` holds. */
type GroupsOf<A> = A extends HttpApi.HttpApi<string, infer G> ? G : never;

/** Each endpoint of a group as `<group>.<endpoint>`. */
type EndpointNamesOf<G> =
  G extends HttpApiGroup.HttpApiGroup<infer Id extends string, infer E, boolean>
    ? E extends { readonly identifier: infer N extends string }
      ? `${Id}.${N}`
      : never
    : never;

/**
 * The name of an endpoint of `Api`, `<group>.<endpoint>` (`runs.hold`, `server.wait`): what a link to one is typed by, so that a name no
 * endpoint has does not compile.
 */
export type ApiEndpointName = EndpointNamesOf<GroupsOf<typeof Api>>;

/** Each GET endpoint of a group as `<group>.<endpoint>`. */
type GetNamesOf<G> =
  G extends HttpApiGroup.HttpApiGroup<infer Id extends string, infer E, boolean>
    ? E extends { readonly identifier: infer N extends string; readonly method: 'GET' }
      ? `${Id}.${N}`
      : never
    : never;

/**
 * The name of a GET endpoint of `Api`, a read: what the table of how each read is bounded (`READS`) is keyed by, so that a read the `Api`
 * gains with no word on its bound does not compile.
 */
export type ApiGetName = GetNamesOf<GroupsOf<typeof Api>>;
