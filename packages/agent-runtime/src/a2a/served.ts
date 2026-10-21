/**
 * What a holder serves on its port (`listener.ts`): the card it declares, and the reading surface alone over the handler the
 * runtime already had (`HarnessHandler`).
 *
 * **The card.** One JSONRPC interface, at the port's own URL, at A2A 1.0, and one `bearer` security scheme with one
 * requirement naming it: without the scheme a client finds no requirement and sends no header (`authOf`), and the port would
 * refuse every request it made. The in-process card (`cardOf`) stays `supportedInterfaces: []`, since the in-process road has
 * no URL. The runtime's extension is declared with no method and `say: false`: the port answers no method of ours, so it
 * offers none.
 *
 * **The surface.** The card, `getTask` and `SubscribeToTask`/`resubscribe`, each delegated to the handler. Every other method
 * of `A2ARequestHandler` — a send, a cancel, a listing, the push-notification configuration, the extended card — is refused
 * in the SDK's `UnsupportedOperationError`, naming the method and that this port reads alone. The refusals are a record over
 * the methods the surface does not serve, so a method the SDK adds with no entry fails the typecheck rather than passing
 * unguarded; the narrowing lives here and not in `HarnessHandler`, which must keep every method for the in-process road.
 */
import { AgentCard } from '@a2a-js/sdk';
import type {
  CancelTaskRequest,
  DeleteTaskPushNotificationConfigRequest,
  GetExtendedAgentCardRequest,
  GetTaskPushNotificationConfigRequest,
  GetTaskRequest,
  ListTaskPushNotificationConfigsRequest,
  ListTaskPushNotificationConfigsResponse,
  ListTasksRequest,
  ListTasksResponse,
  Message,
  SendMessageRequest,
  StreamResponse,
  SubscribeToTaskRequest,
  Task,
  TaskPushNotificationConfig,
} from '@a2a-js/sdk';
import type { A2ARequestHandler, ServerCallContext } from '@a2a-js/sdk/server';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import type { RunnerOps } from '../harness/index.ts';
import { cardOf, type RuntimeExtensionParams } from './handler.ts';

/** The name the served card gives its bearer scheme, and the name `credentials` is asked for. */
export const BEARER = 'bearer';

/** The protocol binding and version the served interface declares: what a client's `spokenOf` reads to choose it. */
const BINDING = 'JSONRPC';
const VERSION = '1.0';

/** The three methods the port serves; every other method of the SDK's handler is refused. */
type Served = 'getAgentCard' | 'getTask' | 'resubscribe';

/** Why each method the port does not serve is refused, by its name on the SDK's handler. */
export const REFUSED: Readonly<Record<Exclude<keyof A2ARequestHandler, Served>, string>> = {
  sendMessage: 'no session is started over this port',
  sendMessageStream: 'no session is started over this port',
  cancelTask: 'no session is stopped over this port',
  listTasks: 'no listing is served over this port',
  createTaskPushNotificationConfig: 'this port sends no notifications',
  getTaskPushNotificationConfig: 'this port sends no notifications',
  listTaskPushNotificationConfigs: 'this port sends no notifications',
  deleteTaskPushNotificationConfig: 'this port sends no notifications',
  getAuthenticatedExtendedAgentCard: 'this port serves one card, and it is the whole of it',
};

/** The refusal of `method`: why, and what the port is for. */
const refuse = (method: Exclude<keyof A2ARequestHandler, Served>) =>
  new UnsupportedOperationError(
    `\`${method}\` is not served here: ${REFUSED[method]}. This port reads a session the engine that serves it holds — its card, \`GetTask\` and \`SubscribeToTask\`. Ask the engine that holds the session for anything else.`,
  );

/**
 * The card a holder serves for `harness` at `url`: the in-process card (`cardOf`) with one JSONRPC interface at `url`, a
 * `bearer` scheme and the one requirement that names it, and the runtime's extension declaring no method and no `say`.
 */
export const servedCardOf = (harness: string, ops: RunnerOps, url: string): AgentCard => {
  const card = cardOf(harness, ops);
  return {
    ...card,
    supportedInterfaces: [{ url, protocolBinding: BINDING, tenant: '', protocolVersion: VERSION }],
    securitySchemes: {
      [BEARER]: { scheme: { $case: 'httpAuthSecurityScheme', value: { description: '', scheme: 'Bearer', bearerFormat: '' } } },
    },
    securityRequirements: [{ schemes: { [BEARER]: { list: [] } } }],
    capabilities: {
      ...card.capabilities!,
      extensions: (card.capabilities?.extensions ?? []).map((e) => ({
        ...e,
        params: { methods: [], say: false } satisfies RuntimeExtensionParams,
      })),
    },
  };
};

/** A card as the JSON it is served and configured as (`cardOfJson` reads it back). */
export const cardJsonOf = (card: AgentCard): Record<string, unknown> => AgentCard.toJSON(card) as Record<string, unknown>;

/**
 * The reading surface over `inner`, serving `card`: `getAgentCard`, `getTask` and `resubscribe` are `inner`'s, and every
 * other method is refused (`REFUSED`), whatever `inner` would have done. Each method takes the SDK's `ServerCallContext`, as
 * the SDK's transports hand it one.
 */
export class ServedHandler implements A2ARequestHandler {
  private readonly inner: A2ARequestHandler;
  private readonly card: AgentCard;

  constructor(inner: A2ARequestHandler, card: AgentCard) {
    this.inner = inner;
    this.card = card;
  }

  async getAgentCard(): Promise<AgentCard> {
    return this.card;
  }

  async getTask(params: GetTaskRequest, context: ServerCallContext): Promise<Task> {
    return this.inner.getTask(params, context);
  }

  async *resubscribe(params: SubscribeToTaskRequest, context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    yield* this.inner.resubscribe(params, context);
  }

  async sendMessage(_params: SendMessageRequest, _context: ServerCallContext): Promise<Message | Task> {
    throw refuse('sendMessage');
  }

  // oxlint-disable-next-line require-yield -- the SDK's handler types this as a stream, and this port serves none
  async *sendMessageStream(_params: SendMessageRequest, _context: ServerCallContext): AsyncGenerator<StreamResponse, void, undefined> {
    throw refuse('sendMessageStream');
  }

  async cancelTask(_params: CancelTaskRequest, _context: ServerCallContext): Promise<Task> {
    throw refuse('cancelTask');
  }

  async listTasks(_params: ListTasksRequest, _context: ServerCallContext): Promise<ListTasksResponse> {
    throw refuse('listTasks');
  }

  async createTaskPushNotificationConfig(
    _params: TaskPushNotificationConfig,
    _context: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    throw refuse('createTaskPushNotificationConfig');
  }

  async getTaskPushNotificationConfig(
    _params: GetTaskPushNotificationConfigRequest,
    _context: ServerCallContext,
  ): Promise<TaskPushNotificationConfig> {
    throw refuse('getTaskPushNotificationConfig');
  }

  async listTaskPushNotificationConfigs(
    _params: ListTaskPushNotificationConfigsRequest,
    _context: ServerCallContext,
  ): Promise<ListTaskPushNotificationConfigsResponse> {
    throw refuse('listTaskPushNotificationConfigs');
  }

  async deleteTaskPushNotificationConfig(_params: DeleteTaskPushNotificationConfigRequest, _context: ServerCallContext): Promise<void> {
    throw refuse('deleteTaskPushNotificationConfig');
  }

  async getAuthenticatedExtendedAgentCard(_params: GetExtendedAgentCardRequest, _context: ServerCallContext): Promise<AgentCard> {
    throw refuse('getAuthenticatedExtendedAgentCard');
  }
}
