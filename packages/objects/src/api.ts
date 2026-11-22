/**
 * The one definition of what the api serves of the objects (`Api`): the handlers the api builds from it, the clients that read through
 * it and the OpenAPI document it writes (`OpenApi.fromApi(Api)`) are all made from this, so no layer keeps a shape of its own. Each
 * endpoint says what it does on itself (`OpenApi.Description`), in the api's words.
 *
 * Its groups each live in the file of their concept: `runs` (`run-api.ts`), `steps` (`step-api.ts`), `cards` (`card-api.ts`), the
 * factory and its parts (`factory-api.ts`), the definitions (`definition-api.ts`), `proposals` and `delegations`
 * (`proposal-api.ts`), and the machine's (`server-api.ts`, `nemia-api.ts`, `readiness.ts`, `upgrade.ts`, `pairing.ts`, `token.ts`).
 * Every refusal is an object with one key, `error`, the sentence that says what to do next; a Conflict carries the `users` that hold
 * the thing too.
 *
 * Here, cluster-scoped beside the factories: group `templates`, the templates Nemia builds in, and each one's documents as the
 * definitions' Schemas; group `subscriptions`, the feed's subscriptions; group `events`, the feed's lines, each in the namespace of the
 * factory it names, a daemon's and the store's that name none in no namespace; and group `discovery`, `GET /api`: every resource the
 * groups serve, its scope and verbs.
 *
 * The runs, the cards, the factories, a factory's MCP servers, the agents and the skills are each listed as their `<Kind>List`, or as
 * the same page's `Table` where the request asks for one (`TABLE_ACCEPT`): two successes of one status. A watch answers no Table.
 */
import { Schema } from 'effect';
import { Table } from './table.ts';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';
import { Template, TemplateList } from './template.ts';
import {
  BadRequest,
  Conflict,
  definitionErrors,
  Failed,
  Forbidden,
  Invalid,
  listQuery,
  Missing,
  objectErrors,
  Unauthorized,
  Unjudged,
  WriteFailed,
} from './api-errors.ts';
import { namespaceParams, cardParams, templateParams, documentParams, subscriptionParams, eventNameParams } from './api-params.ts';
import { DelegationsGroup, ProposalsGroup } from './proposal-api.ts';
import { RunsGroup } from './run-api.ts';
import { FilesGroup } from './file-api.ts';
import { StepsGroup } from './step-api.ts';
import { NemiaGroup } from './nemia-api.ts';
import { Subscription, SubscriptionList } from './subscription.ts';
import { Event, EventList } from './event.ts';
import { KINDS, type Kind } from './words.ts';
import { APIResourceList } from './discovery.ts';
import { ServerGroup, Subscribed, SubscriptionWrite, Unsubscribed } from './server-api.ts';
import { ReadinessGroup } from './readiness.ts';
import { FoldersGroup } from './folders.ts';
import { UpgradesGroup } from './upgrade.ts';
import { LinksGroup, PairingsGroup } from './pairing.ts';
import { SessionGroup } from './session.ts';
import { TokensGroup } from './token.ts';
import { CardsGroup } from './card-api.ts';
import {
  FactoriesGroup,
  HiresGroup,
  LibraryAddsGroup,
  McpServersGroup,
  SchedulesGroup,
  TriggersGroup,
  VolumesGroup,
} from './factory-api.ts';
import {
  AgentListObject,
  AgentObject,
  AgentsGroup,
  SkillListObject,
  SkillObject,
  SkillsGroup,
  WorkflowListObject,
  WorkflowObject,
  WorkflowsGroup,
} from './definition-api.ts';
export {
  CardsGroup,
  FactoriesGroup,
  McpServersGroup,
  SchedulesGroup,
  TriggersGroup,
  HiresGroup,
  LibraryAddsGroup,
  VolumesGroup,
  WorkflowsGroup,
  AgentsGroup,
  SkillsGroup,
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

/** The cluster's templates, subscriptions and the feed's events, and a page of each, named so that the document holds each. */
const TemplateObject = Template.annotate({ identifier: 'Template' });
const TemplateListObject = TemplateList.annotate({ identifier: 'TemplateList' });
const SubscriptionObject = Subscription.annotate({ identifier: 'Subscription' });
const SubscriptionListObject = SubscriptionList.annotate({ identifier: 'SubscriptionList' });
const EventObject = Event.annotate({ identifier: 'Event' });
const EventListObject = EventList.annotate({ identifier: 'EventList' });

/**
 * The templates Nemia builds in, which no namespace holds, listed and read; and each one's documents, its workflows, agents and skills,
 * rendered with its parameters' defaults and served in the Schemas a namespace serves them in, with origin `builtin`.
 */
export class TemplatesGroup extends HttpApiGroup.make('templates').add(
  HttpApiEndpoint.get('listAll', '/api/templates', {
    query: listQuery,
    success: [TemplateListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    'Lists the templates Nemia builds in, which no namespace holds, a page at a time. Answers a TemplateList, or the same page as a Table where the request asks for one.',
  ),
  HttpApiEndpoint.get('get', '/api/templates/:name', { params: templateParams, success: TemplateObject, error: objectErrors }).annotate(
    OpenApi.Description,
    "Reads one of Nemia's templates by its name: its version, the instruction and rules it gives a factory, its parameters and the agent it hires into each step. Answers the Template.",
  ),
  HttpApiEndpoint.get('workflows', '/api/templates/:name/workflows', {
    params: templateParams,
    query: listQuery,
    success: [WorkflowListObject, Table],
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a template's workflows, rendered with its parameters' defaults and served as a namespace serves them, with origin builtin. Answers a WorkflowList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('workflow', '/api/templates/:name/workflows/:doc', {
    params: documentParams,
    success: WorkflowObject,
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one workflow of a template, rendered with its parameters' defaults, its steps filled by the template's hires as in a factory applied from it. Answers the Workflow.",
  ),
  HttpApiEndpoint.get('agents', '/api/templates/:name/agents', {
    params: templateParams,
    query: listQuery,
    success: [AgentListObject, Table],
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a template's agents, rendered with its parameters' defaults and served as a namespace serves them, with origin builtin. Answers an AgentList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('agent', '/api/templates/:name/agents/:doc', {
    params: documentParams,
    success: AgentObject,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Reads one agent of a template, rendered with its parameters' defaults. Answers the Agent."),
  HttpApiEndpoint.get('skills', '/api/templates/:name/skills', {
    params: templateParams,
    query: listQuery,
    success: [SkillListObject, Table],
    error: definitionErrors,
  }).annotate(
    OpenApi.Description,
    "Lists a template's skills, rendered with its parameters' defaults and served as a namespace serves them, with origin builtin. Answers a SkillList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('skill', '/api/templates/:name/skills/:doc', {
    params: documentParams,
    success: SkillObject,
    error: definitionErrors,
  }).annotate(OpenApi.Description, "Reads one skill of a template, rendered with its parameters' defaults. Answers the Skill."),
) {}

/**
 * The feed's subscriptions, which no namespace holds, listed and read; and a long-lived task given one (`nemia subscribe`), and one taken
 * away (`nemia unsubscribe`).
 */
export class SubscriptionsGroup extends HttpApiGroup.make('subscriptions').add(
  HttpApiEndpoint.get('listAll', '/api/subscriptions', {
    query: listQuery,
    success: [SubscriptionListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists the feed's subscriptions, which no namespace holds, a page at a time. Answers a SubscriptionList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('get', '/api/subscriptions/:name', {
    params: subscriptionParams,
    success: SubscriptionObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of the feed's subscriptions by its name: the long-lived task it feeds and what of the feed it carries. Answers the Subscription.",
  ),
  HttpApiEndpoint.post('subscribe', '/api/subscriptions/:name', {
    params: subscriptionParams,
    payload: SubscriptionWrite,
    success: Subscribed.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [...objectErrors, Failed],
  }).annotate(
    OpenApi.Description,
    "Gives a long-lived task a subscription to the feed under the name in the path: the lines its selectors and level keep, said to it from the feed's end, in digests where asked. It gives the feed to a long-lived task of this store's engine alone, and is no way for a client outside it to be told of the feed. Answers Subscribed with a 201, the subscription as written.",
  ),
  HttpApiEndpoint.delete('unsubscribe', '/api/subscriptions/:name', {
    params: subscriptionParams,
    success: Unsubscribed,
    error: [...objectErrors, Failed],
  }).annotate(OpenApi.Description, 'Takes a subscription away, removing its file. Answers Unsubscribed, its name.'),
) {}

/**
 * The feed's lines as events, in the order they were written: all of them, or a namespace's, those of the factory they name; and one by
 * its name, the byte its line starts at — a daemon's or the store's that names no factory in no namespace.
 */
export class EventsGroup extends HttpApiGroup.make('events').add(
  HttpApiEndpoint.get('listAll', '/api/events', { query: listQuery, success: [EventListObject, Table], error: objectErrors }).annotate(
    OpenApi.Description,
    "Lists the feed's lines as events, every one, in the order they were written, a page at a time; with watch=true and a resourceVersion, a stream from that byte. Answers an EventList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('list', '/api/namespaces/:namespace/events', {
    params: namespaceParams,
    query: listQuery,
    success: [EventListObject, Table],
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Lists the feed's lines as events in one namespace, those naming its factory, in the order they were written, a page at a time. Answers an EventList, or the same page as a Table where the request asks for one.",
  ),
  HttpApiEndpoint.get('getAll', '/api/events/:name', { params: eventNameParams, success: EventObject, error: objectErrors }).annotate(
    OpenApi.Description,
    "Reads one of the feed's lines as an event by its name, the byte its line starts at, a daemon's or the store's that names no factory among them. Answers the Event.",
  ),
  HttpApiEndpoint.get('get', '/api/namespaces/:namespace/events/:name', {
    params: cardParams,
    success: EventObject,
    error: objectErrors,
  }).annotate(
    OpenApi.Description,
    "Reads one of the feed's lines as an event by its name, the byte its line starts at, in the namespace of the factory it names. Answers the Event.",
  ),
) {}

/** The api's discovery: every resource it serves, read off this definition (Kubernetes' `/api`, for Nemia's one group version). */
export class DiscoveryGroup extends HttpApiGroup.make('discovery').add(
  HttpApiEndpoint.get('resources', '/api', { success: APIResourceList.annotate({ identifier: 'APIResourceList' }) }).annotate(
    OpenApi.Description,
    "Reads every resource the api serves, read off its own definition: each one's name, singular, kind, scope and verbs, as Kubernetes' /api says them. Answers APIResourceList.",
  ),
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
  Trigger: TriggersGroup.identifier,
  Hire: HiresGroup.identifier,
  LibraryAdd: LibraryAddsGroup.identifier,
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
  .add(FilesGroup)
  .add(StepsGroup)
  .add(CardsGroup)
  .add(FactoriesGroup)
  .add(McpServersGroup)
  .add(SchedulesGroup)
  .add(TriggersGroup)
  .add(HiresGroup)
  .add(LibraryAddsGroup)
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
  .add(FoldersGroup)
  .add(UpgradesGroup)
  .add(PairingsGroup)
  .add(LinksGroup)
  .add(TokensGroup)
  .add(SessionGroup);

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
