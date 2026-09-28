/**
 * A remote A2A agent for `remote-step.test.ts`: the SDK's own server over HTTP, on a port the system picks, so a workflow step on
 * `harness: a2a:<name>` is proven against the protocol as another party speaks it — not against the runtime's handler, and not against the
 * runtime's own test server, which this package may not import (`contract.test.ts`). Not a test file.
 *
 * It serves its card, and JSON-RPC through the SDK's express handler; with `token`, the card asks for a bearer scheme named `token` and a
 * request without it is refused 401. Each message it is sent makes a Task, which `answer` completes at once with one artifact, a text part or
 * a data part, fails, or leaves waiting on a question (`input-required`). What it was sent and the headers it was sent with are kept for the test.
 */
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AgentCard, Role, TaskState, type Artifact, type Message, type Part } from '@a2a-js/sdk';
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore, type AgentExecutor } from '@a2a-js/sdk/server';
import { jsonRpcHandler, UserBuilder } from '@a2a-js/sdk/server/express';

/** How the agent ends a Task it is sent: completed with a text or a data part, failed, or left waiting on an answer to a question. */
export type Answer = { text: string } | { data: Record<string, unknown> } | { failed: string } | { asks: string };

export type A2AServer = {
  /** The agent's base URL: its card at `/.well-known/agent-card.json` beneath it. */
  url: string;
  /** The text of every message the agent was sent, in order. */
  sent: string[];
  /** The headers of every A2A request, auth refused or not. */
  headers: http.IncomingHttpHeaders[];
  close: () => Promise<void>;
};

const textPart = (text: string): Part => ({
  content: { $case: 'text', value: text },
  metadata: undefined,
  filename: '',
  mediaType: 'text/plain',
});

export async function a2aServer(o: { token?: string; answer?: (text: string) => Answer } = {}): Promise<A2AServer> {
  const answer = o.answer ?? (() => ({ text: 'done' }));
  const sent: string[] = [];
  const headers: http.IncomingHttpHeaders[] = [];
  let base = '';

  const executor: AgentExecutor = {
    execute: async (ctx, bus) => {
      const { taskId, contextId } = ctx;
      const part = ctx.userMessage.parts.find((p) => p.content?.$case === 'text');
      const text = part?.content?.$case === 'text' ? part.content.value : '';
      sent.push(text);
      const now = () => new Date().toISOString();
      bus.publish(
        AgentEvent.task({
          id: taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: now() },
          artifacts: [],
          history: [ctx.userMessage],
          metadata: undefined,
        }),
      );
      const said = answer(text);
      if ('failed' in said || 'asks' in said) {
        const words = 'failed' in said ? said.failed : said.asks;
        const message: Message = {
          messageId: `m-${taskId}`,
          contextId,
          taskId,
          role: Role.ROLE_AGENT,
          parts: [textPart(words)],
          metadata: undefined,
          extensions: [],
          referenceTaskIds: [],
        };
        const state = 'failed' in said ? TaskState.TASK_STATE_FAILED : TaskState.TASK_STATE_INPUT_REQUIRED;
        bus.publish(AgentEvent.statusUpdate({ taskId, contextId, status: { state, message, timestamp: now() }, metadata: undefined }));
        return;
      }
      const artifact: Artifact = {
        artifactId: `a-${taskId}`,
        name: 'result',
        description: '',
        metadata: undefined,
        extensions: [],
        parts: [
          'data' in said
            ? { content: { $case: 'data', value: said.data }, metadata: undefined, filename: '', mediaType: '' }
            : textPart(said.text),
        ],
      };
      bus.publish(AgentEvent.artifactUpdate({ taskId, contextId, artifact, append: false, lastChunk: true, metadata: undefined }));
      bus.publish(
        AgentEvent.statusUpdate({
          taskId,
          contextId,
          status: { state: TaskState.TASK_STATE_COMPLETED, message: undefined, timestamp: now() },
          metadata: undefined,
        }),
      );
    },
    cancelTask: async () => {},
  };

  const card = (): AgentCard => ({
    name: 'reviewer',
    description: 'A remote A2A agent a test started.',
    version: '1.0.0',
    supportedInterfaces: [{ url: `${base}/a2a/jsonrpc`, protocolBinding: 'JSONRPC', tenant: '', protocolVersion: '1.0' }],
    provider: undefined,
    documentationUrl: undefined,
    iconUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extensions: [], extendedAgentCard: false },
    securitySchemes: o.token
      ? { token: { scheme: { $case: 'httpAuthSecurityScheme', value: { description: '', scheme: 'Bearer', bearerFormat: '' } } } }
      : {},
    securityRequirements: o.token ? [{ schemes: { token: { list: [] } } }] : [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [],
    signatures: [],
  });

  const app = express();
  app.get('/.well-known/agent-card.json', (_req, res) => {
    res.json(AgentCard.toJSON(card()));
  });
  app.use('/a2a', (req, res, go) => {
    headers.push({ ...req.headers });
    if (o.token && req.headers.authorization !== `Bearer ${o.token}`) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    go();
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Made once the port is known, since the card names it.
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({
      requestHandler: new DefaultRequestHandler(card(), new InMemoryTaskStore(), executor),
      userBuilder: UserBuilder.noAuthentication,
    }),
  );

  return {
    url: base,
    sent,
    headers,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
