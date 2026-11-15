/**
 * Nemia's group (`NemiaGroup`), added to the one `Api` (`api.ts`) beside the others: where she is and her level set, the facts she keeps,
 * an agent's rules for auto, her chat and its stream, and her custom instructions. She is no object of a namespace — the orchestrator's
 * own agent, one per store — so her routes sit at the cluster's paths, as they always did. What each takes and answers is in nemia.ts.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { Conflict, Failed, Invalid, Missing } from './api-errors.ts';
import {
  ChatAnswer,
  ChatAnswerWrite,
  ChatHistory,
  ChatHistoryQuery,
  ChatReadMark,
  ChatReadWrite,
  ChatSend,
  ChatSent,
  ChatStop,
  ChatStreamEvent,
  ChatStreamHeaders,
  ChatStreamQuery,
  NemiaInstructions,
  NemiaInstructionsCleared,
  NemiaInstructionsWrite,
  NemiaLevel,
  NemiaLevelSet,
  NemiaMemory,
  PolicyList,
  PolicyProposal,
  PolicyReach,
  PolicyReachQuery,
  PolicyRuleConfirm,
} from './nemia.ts';

/** An agent's rules, by its name. */
const policyParams = { name: Schema.String.annotate({ description: "The agent's name." }) };

/** One rule of an agent's, by the agent's name and the rule's id. */
const ruleParams = { ...policyParams, id: Schema.String.annotate({ description: "The rule's id." }) };

/** The answers named, so that the document holds each as a component. */
const NemiaLevelObject = NemiaLevel.annotate({ identifier: 'NemiaLevel' });
const NemiaMemoryObject = NemiaMemory.annotate({ identifier: 'NemiaMemory' });
const PolicyListObject = PolicyList.annotate({ identifier: 'PolicyList' });
const PolicyReachObject = PolicyReach.annotate({ identifier: 'PolicyReach' });
const ChatHistoryObject = ChatHistory.annotate({ identifier: 'ChatHistory' });
const NemiaInstructionsObject = NemiaInstructions.annotate({ identifier: 'NemiaInstructions' });

/**
 * Nemia's routes.
 *
 * - `GET /api/level` — where she is (`NemiaLevel`); 422 for a level file that does not read. `PUT /api/level` sets the store's level, or a
 *   factory's, raised for a stretch or its raise ended (`NemiaLevelSet`), and answers where she is after: 404 for no such factory, 409
 *   for an end with no raise in force, 422 for arguments that ask no write or a raise that raises nothing. Never refused for her folder's
 *   trust: the keeper gives it, and `untrusted` says why where its write was refused.
 * - `GET /api/nemia/memory` and `GET /api/nemia/memory/:fact` — the facts she keeps, and one's words; 404 for a fact she does not keep.
 * - `GET /api/policy/:name` — an agent's rules for auto; 422 for a name that is no agent's or a file of rules that does not read.
 *   `PUT /api/policy/:name/rules/:id` confirms a proposed rule as the person read it (`{ words }`): 404 for a rule not proposed, 409 for
 *   one that reads otherwise since or is in force already, 422 for blank words or a rule reaching past the agent's delegation. `DELETE`
 *   takes one out of force. `PUT /api/policy/:name/proposal` writes what the agent proposes, its JSON text in `{ words }`, over what it
 *   proposed, none in force until confirmed: 422 for a name that is no agent's or words that are no proposal.
 * - `GET /api/policy/:name/reach?factory|run` — which steps at their gate the agent's rules in force could ever approve, in one factory or
 *   one run (`PolicyReach`): 422 for a name that is no agent's, or for neither or both of `factory` and `run`; 404 for no such factory or
 *   run.
 * - `GET /api/nemia/chat?before&limit` — a page of her chat; 422 for a limit or a `before` that is none.
 * - `GET /api/nemia/chat/stream` — the same followed as server-sent events (`ChatStreamEvent`), from the `Last-Event-ID` an EventSource
 *   sends when it reconnects, else from `after`, else whole; 422 before the stream opens for a cursor no read gave.
 * - `POST /api/nemia/chat/send` — words put in her outbox, 201, as the caller's its token says: 422 for text empty or too long, for a
 *   `from` naming an agent (retired: an agent speaks with a token of its own), and for an agent under a name no agent speaks under.
 *   `POST /api/nemia/chat/answer` — an ask of hers answered: 404 for one her chat does
 *   not hold, 409 for one answered already, 422 for picks that do not answer it. `POST /api/nemia/chat/read` — the read mark moved: 404 for
 *   an event her chat does not hold. `POST /api/nemia/chat/stop` — the turn she is answering stopped: 409 where she is not answering.
 * - `GET|PUT|DELETE /api/nemia/instructions` — her custom instructions, read (a file there that does not read answered in `error`),
 *   written (`{ words }`: 422 for blank words or a frontmatter block) and cleared; her open session is told at her keeper's next beat.
 */
export class NemiaGroup extends HttpApiGroup.make('nemia').add(
  HttpApiEndpoint.get('level', '/api/level', { success: NemiaLevelObject, error: [Invalid] }).annotate(
    OpenApi.Description,
    "Reads where Nemia is: the store's level and since when, her task and its session, how a person reaches her, what her ended sessions cost, and each factory's level. Answers NemiaLevel.",
  ),
  HttpApiEndpoint.put('setLevel', '/api/level', {
    payload: NemiaLevelSet,
    success: NemiaLevelObject,
    error: [Missing, Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Sets the store's level, or a factory's default, raised for a stretch or its raise ended, as the body says. Answers NemiaLevel, where she is after.",
  ),
  HttpApiEndpoint.get('memory', '/api/nemia/memory', { success: NemiaMemoryObject, error: [Missing] }).annotate(
    OpenApi.Description,
    'Reads the facts Nemia keeps: the folder they are in and their names. Answers NemiaMemory.',
  ),
  HttpApiEndpoint.get('fact', '/api/nemia/memory/:fact', {
    params: { fact: Schema.String.annotate({ description: 'The name of the fact asked.' }) },
    success: NemiaMemoryObject,
    error: [Missing],
  }).annotate(OpenApi.Description, 'Reads one of the facts Nemia keeps, by its name, with its words. Answers NemiaMemory.'),
  HttpApiEndpoint.get('policy', '/api/policy/:name', {
    params: policyParams,
    success: PolicyListObject,
    error: [Missing, Invalid],
  }).annotate(
    OpenApi.Description,
    "Reads an agent's rules for auto: the person's list, the rules in force, what the agent proposed, its custom instruction, and the builtin rule. Answers PolicyList.",
  ),
  HttpApiEndpoint.put('confirmRule', '/api/policy/:name/rules/:id', {
    params: ruleParams,
    payload: PolicyRuleConfirm,
    success: PolicyListObject,
    error: [Missing, Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Puts in force a rule the agent proposed, as the person read it, by the words the body sends, which must be the rule's. Answers PolicyList as it is after.",
  ),
  HttpApiEndpoint.delete('dropRule', '/api/policy/:name/rules/:id', {
    params: ruleParams,
    success: PolicyListObject,
    error: [Missing, Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Takes a rule of an agent's out of force, the builtin one among them. Answers PolicyList as it is after.",
  ),
  HttpApiEndpoint.put('propose', '/api/policy/:name/proposal', {
    params: policyParams,
    payload: PolicyProposal,
    success: PolicyListObject,
    error: [Missing, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Records what an agent proposes from its custom instruction, the rules and the guidance the body's words hold, over what it proposed before. Answers PolicyList as it is after.",
  ),
  HttpApiEndpoint.get('reach', '/api/policy/:name/reach', {
    params: policyParams,
    query: PolicyReachQuery,
    success: PolicyReachObject,
    error: [Missing, Conflict, Invalid],
  }).annotate(
    OpenApi.Description,
    "Reads how far an agent's rules in force reach in a factory: how many of the steps at their gate they reach, a row for each, the rules suggested for the rest, and the whole proposal to propose them by. Answers PolicyReach.",
  ),
  HttpApiEndpoint.get('chat', '/api/nemia/chat', { query: ChatHistoryQuery, success: ChatHistoryObject, error: [Invalid] }).annotate(
    OpenApi.Description,
    "Reads a page of Nemia's chat, oldest first, older pages by the id given, with the cursor a stream resumes from and where she is. Answers ChatHistory.",
  ),
  HttpApiEndpoint.get('chatStream', '/api/nemia/chat/stream', {
    query: ChatStreamQuery,
    headers: ChatStreamHeaders,
    success: HttpApiSchema.StreamSse({ events: ChatStreamEvent }),
    error: [Invalid],
  }).annotate(
    OpenApi.Description,
    "Follows Nemia's chat as server-sent events from a cursor: each event new or changed, and where she is as it changes. Answers a stream of ChatStreamEvent.",
  ),
  HttpApiEndpoint.post('chatSend', '/api/nemia/chat/send', {
    payload: ChatSend,
    success: ChatSent.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Sends words to Nemia's chat, from the person or from the agent the caller's token names, kept in her outbox for her session. Answers ChatSent with a 201.",
  ),
  HttpApiEndpoint.post('chatStop', '/api/nemia/chat/stop', { success: ChatStop, error: [Conflict, Failed] }).annotate(
    OpenApi.Description,
    "Stops Nemia's turn in progress. Answers ChatStop: when, and the attempt she was in.",
  ),
  HttpApiEndpoint.post('chatAnswer', '/api/nemia/chat/answer', {
    payload: ChatAnswerWrite,
    success: ChatAnswer,
    error: [Missing, Conflict, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Answers an ask of Nemia's with the person's pick for each of its questions. Answers ChatAnswer, as her chat keeps it.",
  ),
  HttpApiEndpoint.post('chatRead', '/api/nemia/chat/read', {
    payload: ChatReadWrite,
    success: ChatReadMark,
    error: [Missing, Failed],
  }).annotate(OpenApi.Description, "Moves the person's read mark in Nemia's chat to the event the body names. Answers ChatReadMark."),
  HttpApiEndpoint.get('instructions', '/api/nemia/instructions', { success: NemiaInstructionsObject, error: [Missing, Invalid] }).annotate(
    OpenApi.Description,
    "Reads Nemia's custom instructions: the file they are kept in, their words, and why the file does not read where it does not. Answers NemiaInstructions.",
  ),
  HttpApiEndpoint.put('writeInstructions', '/api/nemia/instructions', {
    payload: NemiaInstructionsWrite,
    success: NemiaInstructionsObject,
    error: [Missing, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Writes Nemia's custom instructions, the words she is told after her own. Answers NemiaInstructions as they are now.",
  ),
  HttpApiEndpoint.delete('clearInstructions', '/api/nemia/instructions', {
    success: NemiaInstructionsCleared,
    error: [Missing, Invalid, Failed],
  }).annotate(
    OpenApi.Description,
    "Clears Nemia's custom instructions. Answers NemiaInstructionsCleared, with whether there were words to remove.",
  ),
) {}
