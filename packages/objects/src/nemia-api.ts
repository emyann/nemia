/**
 * Nemia's group (`NemiaGroup`), added to the one `Api` (`api.ts`) beside the others: where she is and her level set, the facts she keeps,
 * an agent's rules for auto, her chat and its stream, and her custom instructions. She is no object of a namespace — the orchestrator's
 * own agent, one per store — so her routes sit at the cluster's paths, as they always did. What each takes and answers is in nemia.ts.
 */
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
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
  PolicyRuleConfirm,
} from './nemia.ts';

/** An agent's rules, by its name. */
const policyParams = { name: Schema.String };

/** One rule of an agent's, by the agent's name and the rule's id. */
const ruleParams = { name: Schema.String, id: Schema.String };

/** The answers named, so that the document holds each as a component. */
const NemiaLevelObject = NemiaLevel.annotate({ identifier: 'NemiaLevel' });
const NemiaMemoryObject = NemiaMemory.annotate({ identifier: 'NemiaMemory' });
const PolicyListObject = PolicyList.annotate({ identifier: 'PolicyList' });
const ChatHistoryObject = ChatHistory.annotate({ identifier: 'ChatHistory' });
const NemiaInstructionsObject = NemiaInstructions.annotate({ identifier: 'NemiaInstructions' });

/**
 * Nemia's routes.
 *
 * - `GET /api/level` — where she is (`NemiaLevel`); 422 for a level file that does not read. `PUT /api/level` sets the store's level, or a
 *   factory's, raised for a stretch or its raise ended (`NemiaLevelSet`), and answers where she is after: 404 for no such factory, 409
 *   for an end with no raise in force, 422 for arguments that ask no write or a raise that raises nothing. Never refused for her folder's
 *   trust: `trust` names the command that gives it.
 * - `GET /api/nemia/memory` and `GET /api/nemia/memory/:fact` — the facts she keeps, and one's words; 404 for a fact she does not keep.
 * - `GET /api/policy/:name` — an agent's rules for auto; 422 for a name that is no agent's or a file of rules that does not read.
 *   `PUT /api/policy/:name/rules/:id` confirms a proposed rule as the person read it (`{ words }`): 404 for a rule not proposed, 409 for
 *   one that reads otherwise since or is in force already, 422 for blank words or a rule reaching past the agent's delegation. `DELETE`
 *   takes one out of force.
 * - `GET /api/nemia/chat?before&limit` — a page of her chat; 422 for a limit or a `before` that is none.
 * - `GET /api/nemia/chat/stream` — the same followed as server-sent events (`ChatStreamEvent`), from the `Last-Event-ID` an EventSource
 *   sends when it reconnects, else from `after`, else whole; 422 before the stream opens for a cursor no read gave.
 * - `POST /api/nemia/chat/send` — words put in her outbox, 201: 422 for text empty or too long, or from anywhere but the board naming no
 *   agent, 409 for a name the person has not allowed. `POST /api/nemia/chat/answer` — an ask of hers answered: 404 for one her chat does
 *   not hold, 409 for one answered already, 422 for picks that do not answer it. `POST /api/nemia/chat/read` — the read mark moved: 404 for
 *   an event her chat does not hold. `POST /api/nemia/chat/stop` — the turn she is answering stopped: 409 where she is not answering.
 * - `GET|PUT|DELETE /api/nemia/instructions` — her custom instructions, read (a file there that does not read answered in `error`),
 *   written (`{ words }`: 422 for blank words or a frontmatter block) and cleared; her open session is told at her keeper's next beat.
 */
export class NemiaGroup extends HttpApiGroup.make('nemia').add(
  HttpApiEndpoint.get('level', '/api/level', { success: NemiaLevelObject, error: [Invalid] }),
  HttpApiEndpoint.put('setLevel', '/api/level', {
    payload: NemiaLevelSet,
    success: NemiaLevelObject,
    error: [Missing, Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.get('memory', '/api/nemia/memory', { success: NemiaMemoryObject, error: [Missing] }),
  HttpApiEndpoint.get('fact', '/api/nemia/memory/:fact', {
    params: { fact: Schema.String },
    success: NemiaMemoryObject,
    error: [Missing],
  }),
  HttpApiEndpoint.get('policy', '/api/policy/:name', {
    params: policyParams,
    success: PolicyListObject,
    error: [Missing, Invalid],
  }),
  HttpApiEndpoint.put('confirmRule', '/api/policy/:name/rules/:id', {
    params: ruleParams,
    payload: PolicyRuleConfirm,
    success: PolicyListObject,
    error: [Missing, Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.delete('dropRule', '/api/policy/:name/rules/:id', {
    params: ruleParams,
    success: PolicyListObject,
    error: [Missing, Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.get('chat', '/api/nemia/chat', { query: ChatHistoryQuery, success: ChatHistoryObject, error: [Invalid] }),
  HttpApiEndpoint.get('chatStream', '/api/nemia/chat/stream', {
    query: ChatStreamQuery,
    headers: ChatStreamHeaders,
    success: HttpApiSchema.StreamSse({ events: ChatStreamEvent }),
    error: [Invalid],
  }),
  HttpApiEndpoint.post('chatSend', '/api/nemia/chat/send', {
    payload: ChatSend,
    success: ChatSent.pipe(Schema.annotate({ httpApiStatus: 201 })),
    error: [Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.post('chatStop', '/api/nemia/chat/stop', { success: ChatStop, error: [Conflict, Failed] }),
  HttpApiEndpoint.post('chatAnswer', '/api/nemia/chat/answer', {
    payload: ChatAnswerWrite,
    success: ChatAnswer,
    error: [Missing, Conflict, Invalid, Failed],
  }),
  HttpApiEndpoint.post('chatRead', '/api/nemia/chat/read', { payload: ChatReadWrite, success: ChatReadMark, error: [Missing, Failed] }),
  HttpApiEndpoint.get('instructions', '/api/nemia/instructions', { success: NemiaInstructionsObject, error: [Missing, Invalid] }),
  HttpApiEndpoint.put('writeInstructions', '/api/nemia/instructions', {
    payload: NemiaInstructionsWrite,
    success: NemiaInstructionsObject,
    error: [Missing, Invalid, Failed],
  }),
  HttpApiEndpoint.delete('clearInstructions', '/api/nemia/instructions', {
    success: NemiaInstructionsCleared,
    error: [Missing, Invalid, Failed],
  }),
) {}
