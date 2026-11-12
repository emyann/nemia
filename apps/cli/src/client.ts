/**
 * What every request of this client shares: the session's token it carries (`sessionHeaders`), a url with its query (`urlOf`), and the
 * refusals a daemon's answer can be read as — none answering (`unanswered`), or one older than this client (`olderThanThis`). The
 * daemon is found and made ready by `daemon.ts`, and a read asks it through the typed client of `objects.ts`. A refusal is thrown as
 * `Refused`, which the bin prints and exits with.
 */
export { Refused } from './refused.ts';
import { chosenToken } from './context.ts';
import { Refused } from './refused.ts';

/**
 * The header that says who calls: `Authorization: Bearer <token>` where `WF_SESSION_TOKEN` holds the token the orchestrator handed a
 * session; else the person's token of the context in use (`chosenToken`, context.ts): a remote one's, or the one kept for this machine's
 * own daemon where its store is exposed; none where neither is, which the api of a store not exposed reads as the person. Every request
 * of this client carries it.
 */
export const sessionHeaders = (env: NodeJS.ProcessEnv = process.env): Readonly<Record<string, string>> => {
  const token = callerToken(env);
  return token === undefined ? {} : { authorization: `Bearer ${token}` };
};

/**
 * The token this client calls with, as `sessionHeaders` presents it: the session's where `WF_SESSION_TOKEN` holds one, else the
 * person's.
 */
export const callerToken = (env: NodeJS.ProcessEnv = process.env): string | undefined => {
  const session = env.WF_SESSION_TOKEN;
  return session !== undefined && session !== '' ? session : chosenToken(env);
};

/** A query's words: each key once, or several times for a list (`selector`). */
export type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

/** `path` with `query` on it, against `base`. */
export const urlOf = (base: string, path: string, query: Query = {}): URL => {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query))
    for (const one of value === undefined ? [] : typeof value === 'string' ? [value] : value) url.searchParams.append(key, one);
  return url;
};

/** A daemon that answered its readiness and then took no request: refused, naming its status and the restart. */
export const unanswered = (verb: string, base: string, err: unknown): Refused =>
  new Refused(
    `the daemon at ${base} does not answer (${err instanceof Error ? err.message : String(err)}). See whether it is up, \`nemia service status\`, or restart it, \`nemia service restart\`, then type \`nemia ${verb}\` again`,
  );

/** A daemon that serves no `path` at all, a 404 with no `error`: older than this client, refused naming the restart. */
export const olderThanThis = (verb: string, base: string, path: string): Refused =>
  new Refused(
    `the daemon at ${base} does not serve ${path}: it is older than this nemia. Restart it, \`nemia service restart\`, then type \`nemia ${verb}\` again`,
  );
