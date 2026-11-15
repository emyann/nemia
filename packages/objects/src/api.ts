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
 * Group `factories`: the factories, which no namespace holds, listed, read, removed, exported whole and filed from another store's export,
 * and each one's sub-resources — its rules and its instruction, read, written and cleared, the lines a person types for it (`commands`),
 * its cost line per workflow, its revisions policy, its places trusted again, a workflow attached and detached, and a harness setting set
 * and taken off; and the writes that name a template or a folder: a factory filed, a volume mounted and taken off, a factory made from a
 * template, a hand-made one taken over by one, either previewed, an upgrade filed and a conflict's choice, a template in the body as
 * `TemplateGiven`. The factory's parts are each in the factory's namespace: group `mcpservers`, its MCP servers, read, recorded and taken
 * off, and signed in to, and at the store's level, in no namespace, the library's servers — the person's beside those Nemia offers —
 * listed, read, recorded and taken off; groups `schedules`, `hires` and `libraryadds` (the library items a factory has added), read,
 * written and taken back; and group `volumes`, read alone.
 *
 * The definitions, each in a factory's namespace as the factory resolves it: groups `workflows`, `agents` and `skills`, each listed with
 * `?origin=` for one origin's, shadowed or not, and read; and at the store's level, in no namespace, the library — the person's
 * definitions beside the builtins — listed with who uses each, read, and the person's made, written whole and removed, an agent tried, a
 * builtin skill copied to the person's and a skill's files listed by path. A write sent to a namespace is refused, naming the way the
 * definition changes: the library's, or the factory's. And, in no namespace, each kind's files as a person keeps them read into its
 * spec (`read`), which writes nothing — a Kubernetes `*Review`'s way: the client reads a person's files, the api reads them by the
 * orchestrator's readers, and the client writes the spec through `create` or `replace`, the board's one write path.
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
import { cardParams, namespaceParams, templateParams, documentParams, subscriptionParams, eventNameParams } from './api-params.ts';
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
import { UpgradesGroup } from './upgrade.ts';
import { PairGroup, PairingsGroup } from './pairing.ts';
import { TokensGroup } from './token.ts';
import { CardsGroup } from './card-api.ts';
import { FactoriesGroup, HiresGroup, LibraryAddsGroup, McpServersGroup, SchedulesGroup, VolumesGroup } from './factory-api.ts';
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
    params: subscriptionParams,
    success: SubscriptionObject,
    error: objectErrors,
  }),
  HttpApiEndpoint.post('subscribe', '/api/subscriptions/:name', {
    params: subscriptionParams,
    payload: SubscriptionWrite,
    success: Subscribed.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [...objectErrors, Failed],
  }),
  HttpApiEndpoint.delete('unsubscribe', '/api/subscriptions/:name', {
    params: subscriptionParams,
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
  HttpApiEndpoint.get('getAll', '/api/events/:name', { params: eventNameParams, success: EventObject, error: objectErrors }),
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
  .add(StepsGroup)
  .add(CardsGroup)
  .add(FactoriesGroup)
  .add(McpServersGroup)
  .add(SchedulesGroup)
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
  .add(UpgradesGroup)
  .add(PairGroup)
  .add(PairingsGroup)
  .add(TokensGroup);

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
