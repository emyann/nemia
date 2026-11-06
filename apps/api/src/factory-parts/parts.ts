/**
 * What the handlers of a factory and its parts share: the default factory's repository, the api's own (`repoOf`); a list query as the
 * package reads it, `?labelSelector=` and its retired spelling `?selector=` read the same, each given again for another (OR); and a name
 * that is no factory's refused `Invalid` before anything is read. And the paths of a factory and its parts the objects' handler serves,
 * handed it by Hono (`partsRoutes`, objects/serve.ts calls it), and each write among them as the guard's refusals say it
 * (`PART_WRITES`): a server recorded or taken off and a sign-in started or signed out, a schedule written or taken back, an agent hired
 * into a step or fired, the rules written or cleared, and the instruction placed, written or cleared. Each is what every run started in
 * the factory after acts on, so a page on another site must not make it: refused 403 for another site, and 415 for a body that is not
 * JSON, before its body is read.
 */
import { factoryNameRefusal, Invalid as Refused, type ObjectQuery } from 'agent-orchestrator';
import { repoOf } from '../capabilities/capabilities.ts';
import type { Context as RequestContext, Hono } from 'hono';
import type { Guarded } from '../guard.ts';
import type { ApiEnv, Served } from '../layer.ts';

/** The repository the default factory is on: the api's own. */
export const defaultRepo = (s: Served): string => repoOf(s.env, s.running);

/** One selector, several, or none, as a list. */
const listOf = (given: string | readonly string[] | undefined): string[] =>
  given === undefined ? [] : typeof given === 'string' ? [given] : [...given];

/** A list's query as the `Api` decodes it. */
export type ListQuery = {
  readonly limit?: string;
  readonly continue?: string;
  readonly labelSelector?: string | readonly string[];
  readonly selector?: string | readonly string[];
};

/** A list's query as the package reads it. */
export const queryOf = (query: ListQuery): ObjectQuery => ({
  limit: query.limit === undefined ? null : Number(query.limit),
  continue: query.continue,
  labelSelector: [...listOf(query.labelSelector), ...listOf(query.selector)],
});

/** `name` as a factory's, or `Invalid` in the package's words, the route named, before anything is read. */
export const factoryNamed = (route: string, name: string): void => {
  const wrong = factoryNameRefusal(name);
  if (wrong !== undefined) throw new Refused({ message: `${route}: ${wrong}` });
};

/** A write of a factory's part as the guard says it, made on the board's settings page of the factory. */
const partWrite = (route: string, does: string, forAnother: string, why: string, shape: string): Guarded => ({
  route,
  does,
  forAnother,
  why,
  reach: "make it on the factory's settings page on the board",
  instead: "Make it on the factory's settings page on the board, or with `nemia factory`",
  shape,
});

const NO_BODY = 'no body, or `{}`: what it writes is named in the path';
const SERVER_SHAPE =
  '`{ "url": "https://…", "type"?: "http" | "sse", "headers"?: { "<name>": "<value>" }, "oauth"?: { "clientId": "<id>", "callbackPort"?: <port> } }`';
const SCHEDULE_SHAPE = '`{ "cron": "<expr>", "brief": "<text>", "repo"?: "<path>", "tz"?: "<zone>" }`';
const SERVER_WHY =
  "every step of every run started in the factory after is handed the server, and an agent's `mcp:` line resolves its name against the record";
const SIGN_IN_WHY = "it writes the harness's own store, where a factory's sessions find what a server signs in with";
const SCHEDULE_WHY = 'the daemon starts a run of the workflow in the factory at each fire of its cron, at every level';
const HIRE_WHY = 'every run of the workflow started in the factory after runs the step as that agent, in its repositories';
const RULES_WHY = 'they are told to every agent hired into the factory, in every step of every run started after';
const INSTRUCTION_WHY = 'Nemia reads the instruction kept there before she acts in the factory';

/** The writes of a factory's parts, each as the guard says it, by its method and path. */
export const PART_WRITES = {
  putServer: (ns: string, name: string) =>
    partWrite(
      `PUT /api/namespaces/${ns}/mcpservers/${name}`,
      'records an MCP server for a factory',
      'record one',
      SERVER_WHY,
      SERVER_SHAPE,
    ),
  deleteServer: (ns: string, name: string) =>
    partWrite(
      `DELETE /api/namespaces/${ns}/mcpservers/${name}`,
      "takes a server off a factory's record",
      'take it off',
      SERVER_WHY,
      NO_BODY,
    ),
  signIn: (ns: string, name: string) =>
    partWrite(
      `POST /api/namespaces/${ns}/mcpservers/${name}/sign-in`,
      'signs a factory in to a server',
      'sign one in',
      SIGN_IN_WHY,
      NO_BODY,
    ),
  signOut: (ns: string, name: string) =>
    partWrite(
      `DELETE /api/namespaces/${ns}/mcpservers/${name}/sign-in`,
      'signs a factory out of a server',
      'sign one out',
      SIGN_IN_WHY,
      NO_BODY,
    ),
  putSchedule: (ns: string, name: string) =>
    partWrite(
      `PUT /api/namespaces/${ns}/schedules/${name}`,
      "schedules a factory's workflow",
      'schedule one',
      SCHEDULE_WHY,
      SCHEDULE_SHAPE,
    ),
  deleteSchedule: (ns: string, name: string) =>
    partWrite(`DELETE /api/namespaces/${ns}/schedules/${name}`, "takes a workflow's schedule back", 'take it back', SCHEDULE_WHY, NO_BODY),
  putHire: (ns: string, name: string) =>
    partWrite(
      `PUT /api/namespaces/${ns}/hires/${name}`,
      'hires an agent into a step of a factory',
      'hire one',
      HIRE_WHY,
      '`{ "agent": "<the agent\'s name>" }`',
    ),
  deleteHire: (ns: string, name: string) =>
    partWrite(`DELETE /api/namespaces/${ns}/hires/${name}`, "takes a step's hire back", 'take it back', HIRE_WHY, NO_BODY),
  putRules: (name: string) =>
    partWrite(
      `PUT /api/factories/${name}/rules`,
      "writes a factory's rules",
      'write them',
      RULES_WHY,
      '`{ "words": "<the factory\'s rules>" }`',
    ),
  deleteRules: (name: string) =>
    partWrite(`DELETE /api/factories/${name}/rules`, "clears a factory's rules", 'clear them', RULES_WHY, NO_BODY),
  putInstruction: (name: string) =>
    partWrite(
      `PUT /api/factories/${name}/instruction`,
      "says where a factory's instruction is kept",
      'say it',
      INSTRUCTION_WHY,
      '`{ "path": "<path in the factory\'s first folder>" }` or `{ "store": true }`',
    ),
  deleteInstruction: (name: string) =>
    partWrite(
      `DELETE /api/factories/${name}/instruction`,
      "reads a factory's instruction from its folder again",
      'say it',
      INSTRUCTION_WHY,
      NO_BODY,
    ),
  putWords: (name: string) =>
    partWrite(
      `PUT /api/factories/${name}/instruction/words`,
      "writes a factory's instruction",
      'write it',
      INSTRUCTION_WHY,
      '`{ "words": "<what Nemia is to know about the factory>" }`',
    ),
  deleteWords: (name: string) =>
    partWrite(`DELETE /api/factories/${name}/instruction/words`, "clears a factory's instruction", 'clear it', INSTRUCTION_WHY, NO_BODY),
} as const;

/** How a route hands the request on: as a read of one object, a list, or a write the guard stands before. */
export type Handing = {
  readonly forward: (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
  readonly listed: (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
  readonly guarded: (write: (c: RequestContext<ApiEnv>) => Guarded) => (c: RequestContext<ApiEnv>) => Response | Promise<Response>;
};

/** The namespace and the name a path names. */
const at = (c: RequestContext<ApiEnv>) => [c.req.param('namespace') ?? '', c.req.param('name') ?? ''] as const;

/** The factory a cluster-scoped path names. */
const factory = (c: RequestContext<ApiEnv>) => c.req.param('name') ?? '';

/** `app` with the routes of the factories and their parts, each handed on as `h` says. */
export function partsRoutes(app: Hono<ApiEnv>, h: Handing): Hono<ApiEnv> {
  const ns = '/api/namespaces/:namespace';
  app.get('/api/factories', h.listed);
  app.get('/api/factories/:name', h.forward);
  app.get('/api/factories/:name/commands', h.forward);
  app.get('/api/factories/:name/rules', h.forward);
  app.put(
    '/api/factories/:name/rules',
    h.guarded((c) => PART_WRITES.putRules(factory(c))),
  );
  app.delete(
    '/api/factories/:name/rules',
    h.guarded((c) => PART_WRITES.deleteRules(factory(c))),
  );
  app.get('/api/factories/:name/instruction', h.forward);
  app.put(
    '/api/factories/:name/instruction',
    h.guarded((c) => PART_WRITES.putInstruction(factory(c))),
  );
  app.delete(
    '/api/factories/:name/instruction',
    h.guarded((c) => PART_WRITES.deleteInstruction(factory(c))),
  );
  app.put(
    '/api/factories/:name/instruction/words',
    h.guarded((c) => PART_WRITES.putWords(factory(c))),
  );
  app.delete(
    '/api/factories/:name/instruction/words',
    h.guarded((c) => PART_WRITES.deleteWords(factory(c))),
  );
  app.get('/api/builtin/mcpservers', h.listed);
  for (const kind of ['mcpservers', 'schedules', 'hires', 'volumes']) {
    app.get(`${ns}/${kind}`, h.listed);
    app.get(`${ns}/${kind}/:name`, h.forward);
  }
  app.put(
    `${ns}/mcpservers/:name`,
    h.guarded((c) => PART_WRITES.putServer(...at(c))),
  );
  app.delete(
    `${ns}/mcpservers/:name`,
    h.guarded((c) => PART_WRITES.deleteServer(...at(c))),
  );
  app.get(`${ns}/mcpservers/:name/sign-in`, h.forward);
  app.post(
    `${ns}/mcpservers/:name/sign-in`,
    h.guarded((c) => PART_WRITES.signIn(...at(c))),
  );
  app.delete(
    `${ns}/mcpservers/:name/sign-in`,
    h.guarded((c) => PART_WRITES.signOut(...at(c))),
  );
  app.put(
    `${ns}/schedules/:name`,
    h.guarded((c) => PART_WRITES.putSchedule(...at(c))),
  );
  app.delete(
    `${ns}/schedules/:name`,
    h.guarded((c) => PART_WRITES.deleteSchedule(...at(c))),
  );
  app.put(
    `${ns}/hires/:name`,
    h.guarded((c) => PART_WRITES.putHire(...at(c))),
  );
  app.delete(
    `${ns}/hires/:name`,
    h.guarded((c) => PART_WRITES.deleteHire(...at(c))),
  );
  return app;
}
