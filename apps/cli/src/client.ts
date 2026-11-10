/**
 * What every request of this client shares: the session's token it carries (`sessionHeaders`), a url with its query (`urlOf`), and the
 * refusals a daemon's answer can be read as — none answering (`unanswered`), or one older than this client (`olderThanThis`). The
 * daemon is found and made ready by `daemon.ts`, and a read asks it through the typed client of `objects.ts`. A refusal is thrown as
 * `Refused`, which the bin prints and exits with.
 */
export { Refused } from './refused.ts';
import { Refused } from './refused.ts';

/**
 * The header that says who calls: `Authorization: Bearer <token>` where `WF_SESSION_TOKEN` holds the token the orchestrator handed a
 * session, none where it is unset or empty, which the api reads as the person. Every request of this client carries it.
 */
export const sessionHeaders = (env: NodeJS.ProcessEnv = process.env): Readonly<Record<string, string>> => {
  const token = env.WF_SESSION_TOKEN;
  return token !== undefined && token !== '' ? { authorization: `Bearer ${token}` } : {};
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

/** A daemon that answered its readiness and then took no request: refused, naming the read in process and the restart. */
export const unanswered = (verb: string, base: string, err: unknown): Refused =>
  new Refused(
    `the daemon at ${base} does not answer (${err instanceof Error ? err.message : String(err)}). Read in process: \`nemia ${verb} --local …\`, or restart it: \`nemia service restart\``,
  );

/** A daemon that serves no `path` at all, a 404 with no `error`: older than this client, refused naming the restart. */
export const olderThanThis = (verb: string, base: string, path: string): Refused =>
  new Refused(
    `the daemon at ${base} does not serve ${path}: it is older than this nemia. Restart it, \`nemia service restart\`, or read in process: \`nemia ${verb} … --local\``,
  );
