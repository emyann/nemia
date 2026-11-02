/**
 * The one HTTP door of every read: a GET to the api serving this store, found by its lease (`where.ts`), started on demand where none
 * serves (`daemon.ts`). A refusal is thrown as `Refused`, which the bin prints and exits with.
 */
import { servedAt } from './where.ts';
import { daemonStarted } from './daemon.ts';
import { Refused } from './refused.ts';

export { Refused } from './refused.ts';

/** A query's words: each key once, or several times for a list (`selector`). */
export type Query = Readonly<Record<string, string | readonly string[] | undefined>>;

/** `path` with `query` on it, against `base`. */
export const urlOf = (base: string, path: string, query: Query = {}): URL => {
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query))
    for (const one of value === undefined ? [] : typeof value === 'string' ? [value] : value) url.searchParams.append(key, one);
  return url;
};

/**
 * The base url of the api serving this store: its lease's, else one started now for the read `verb` names. Refused where none comes up,
 * naming the command that reads the store in process and the one that installs the service.
 */
export async function served(verb: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const at = servedAt(env);
  if (at !== undefined) return at;
  return daemonStarted(verb, env);
}

/** What a body of the api's refusal says, if it says anything: its `error`, or its `message`. */
const refusalOf = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null) return undefined;
  const said = 'error' in body ? body.error : 'message' in body ? body.message : undefined;
  return typeof said === 'string' ? said : undefined;
};

/**
 * The api's answer to a GET of `path`, read as JSON. A refused connection starts a daemon once and asks again (a lease left by a daemon
 * that died). A 404 on the route itself — no `error` in its body — is a daemon older than this client: refused, naming the restart. Any
 * other refusal is the api's own words, exit 2.
 */
export async function get<T>(verb: string, path: string, query: Query = {}, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  let base = await served(verb, env);
  let response: Response;
  try {
    response = await fetch(urlOf(base, path, query));
  } catch {
    base = await daemonStarted(verb, env);
    response = await fetch(urlOf(base, path, query));
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (response.ok) return body as T;
  const said = refusalOf(body);
  if (response.status === 404 && said === undefined)
    throw new Refused(
      `the daemon at ${base} does not serve ${path}: it is older than this nemia. Restart it, \`nemia service restart\`, or read in process: \`nemia ${verb} … --local\``,
    );
  throw new Refused(said ?? `the api answered ${response.status} to ${path}: ${text.slice(0, 200)}`);
}
