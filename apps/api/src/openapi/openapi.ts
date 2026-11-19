/**
 * The api's OpenAPI 3.1 document of the objects it serves (`GET /openapi/v3/nemia/v1`): written by Effect from the one definition of them
 * (`OpenApi.fromApi(Api)`, the `objects` package's `Api`), so the paths, the bodies, the answers and the refusals it says are the ones the
 * handlers are built from (`src/objects/`), and a client generated from it reads what they answer.
 */
import { Hono } from 'hono';
import { OpenApi } from 'effect/http-api';
import { toolsOf } from 'agent-orchestrator';
import { Api, COMMAND_WORDS } from 'objects';
import type { ApiEnv } from '../layer.ts';

/** The path the document is served on, as Kubernetes serves a group's: `/openapi/v3/<group>/<version>`. */
export const OPENAPI_PATH = '/openapi/v3/nemia/v1';

/** An operation of the document, as far as it is worded here. */
type Operation = { operationId?: string; summary?: string; description?: string };

/** The heading of the section under an operation's own words that names the command and the MCP tool calling it. */
export const EQUIVALENTS_HEADING = '### CLI and MCP';

/** The one line of that section for an endpoint no command links. */
export const NO_EQUIVALENT = 'No `nemia` command and no MCP tool calls this endpoint.';

/** Who answers for a command when an agent calls it, in words. */
const AGENT: Readonly<Record<string, string>> = {
  read: 'an agent reads it',
  act: 'an agent acts',
  ask: 'the person is asked',
  answer: 'the person answers what waits on them',
  none: 'out of an agent’s reach',
};

/**
 * What each endpoint a command links is said as under its own words, by its id: for every link of the table (`COMMAND_WORDS`, through
 * `toolsOf`), in the table's order, the command's line and usage, its tool on the MCP port, who answers for it when an agent calls it,
 * and the command's help as it is printed, in a block that keeps its `<words>`.
 */
const equivalentsByEndpoint = () => {
  const said = new Map<string, string[]>();
  for (const words of COMMAND_WORDS)
    for (const tool of toolsOf(words)) {
      const answers =
        typeof words.class === 'string' ? (AGENT[words.class] ?? words.class) : 'an agent reads it, and the person is asked to set';
      const block = [
        `**Command** \`${`nemia ${words.name} ${words.usage}`.trim()}\``,
        `**MCP tool** \`${tool.tool}\` · **When an agent calls it** ${answers}`,
        ['```text', ...words.help, '```'].join('\n'),
      ].join('\n\n');
      said.set(tool.endpoint, [...(said.get(tool.endpoint) ?? []), block]);
    }
  return said;
};

/**
 * The document: every group of the `Api`, its paths, and the Schemas of its objects and refusals under `components.schemas`, as Effect
 * writes it (`OpenApi.fromApi`), each operation then named for the surface: its summary its id (`runs.decision`), the api's own verb,
 * whatever command links it; its description the endpoint's own words, as `objects` says them on it, then a section under
 * `EQUIVALENTS_HEADING` naming every command of the table that links it and its tool, or `NO_EQUIVALENT`. The section's words are the
 * table's, so a command's help changed there is changed here.
 */
export const openapiDocument = () => {
  const document = OpenApi.fromApi(Api);
  const equivalents = equivalentsByEndpoint();
  for (const item of Object.values(document.paths as Record<string, Record<string, Operation>>))
    for (const op of Object.values(item)) {
      if (typeof op !== 'object' || op.operationId === undefined) continue;
      op.summary = op.operationId;
      const section = equivalents.get(op.operationId) ?? [NO_EQUIVALENT];
      op.description = [op.description, EQUIVALENTS_HEADING, ...section].filter((part) => part?.trim()).join('\n\n');
    }
  return document;
};

export const openapi = new Hono<ApiEnv>().get(OPENAPI_PATH, (c) => c.json(openapiDocument()));
