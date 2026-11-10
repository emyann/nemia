/**
 * The orchestrator's commands as routes, generated from its table (`COMMANDS`): each routed command on its path, its body derived from its
 * spec, refused in the api's words (words.ts), then handed to the command's own handler — the one `nemia` runs. The run's named actions are
 * no route of this table: the objects' handlers serve each in the run's namespace, its body decoded by `objects`' Schema, calling its
 * typed entry (objects/runs.ts).
 */
import { Schema } from 'effect';
import { Hono, type Context } from 'hono';
import {
  type Args,
  type Command,
  COMMANDS,
  type CommandSpec,
  type Flag,
  generated,
  type Positional,
  type Route,
  renamedValues,
  routeList,
} from 'agent-orchestrator';
import { isRefusal } from 'agent-orchestrator';
import { decodeBody, NotBlank } from '../body.ts';
import type { Refusal } from '../guard.ts';
import { type ApiEnv, type Served, served } from '../layer.ts';
import { runPlaced } from '../store.ts';
import { type Named, type RouteWords, WORDS } from './words.ts';

/** The schema of a positional's or a flag's value in a body. */
const valueSchema = (kind: Positional['kind'] | Flag['kind']): Schema.Decoder<unknown> =>
  kind === 'name' ? NotBlank : kind === 'amount' ? Schema.Number : kind === 'switch' ? Schema.Boolean : Schema.String;

/** The schema of a flag's value in a body: a list of its values where the flag is given many times. */
const flagSchema = (flag: Flag): Schema.Decoder<unknown> => (flag.many ? Schema.Array(valueSchema(flag.kind)) : valueSchema(flag.kind));

/** The arguments a route fixes (`sets`), whatever a request says: none on a read. */
const fixedOf = (route: Route): Readonly<Record<string, string | boolean>> => ('sets' in route ? (route.sets ?? {}) : {});

/**
 * The body a command takes on its route, derived from its spec: each positional its path does not name, required unless it is optional,
 * and a list, optional, where it takes many;
 * each key a flag sets, required, as one of the values its flags set it to — a body says its way, and takes no default; each flag's value,
 * optional, a switch's as true or false, one given many times as a list, but a flag the CLI alone takes, and one the api alone takes
 * required where it says so. A key its route fixes (`sets`) is none of the body's.
 */
export function bodySchema(command: CommandSpec, inPath: readonly string[], route: Route) {
  const fields: Record<string, Schema.Decoder<unknown>> = {};
  const fixed = Object.keys(fixedOf(route));
  for (const p of command.spec.positionals.filter((p) => !inPath.includes(p.key)))
    fields[p.key] =
      p.takes === 'many'
        ? Schema.optionalKey(Schema.Array(valueSchema(p.kind)))
        : p.takes === 'optional'
          ? Schema.optionalKey(valueSchema(p.kind))
          : valueSchema(p.kind);
  const set = new Map<string, string[]>();
  for (const [key, value] of command.spec.flags.flatMap((f) => Object.entries(f.sets ?? {})))
    set.set(key, [...new Set([...(set.get(key) ?? []), value])]);
  for (const [key, values] of set) fields[key] = Schema.Literals(values);
  for (const f of command.spec.flags.filter((f): f is Flag & { key: string } => f.key !== undefined && f.only?.side !== 'cli'))
    fields[f.key] = f.only?.required ? flagSchema(f) : Schema.optionalKey(flagSchema(f));
  for (const key of fixed) delete fields[key];
  return Schema.Struct(fields);
}

/** The words of the command `name` (`WORDS`), and the word a refusal names its route by: its name. */
export const wordsAt = (name: string): RouteWords & { said: string } => {
  const own = WORDS[name];
  if (own === undefined) throw new Error(`No words for the command '${name}' in WORDS (commands/words.ts): give it its words there.`);
  return { ...own, said: name };
};

/** What a request sent as its body: its text, read once the pipeline needs it — never on a delete, nor after a refusal before it. */
export type Sent = () => Promise<string>;

/** A request's JSON body, or why it is none, in the route's words (400). */
async function jsonOf(sent: Sent, name: string, words: RouteWords, at: Named): Promise<{ value: unknown } | Refusal> {
  try {
    return { value: JSON.parse(await sent()) as unknown };
  } catch {
    return { status: 400, error: words.notJson?.(at) ?? `POST …/${name} takes a JSON body: ${words.shape}.` };
  }
}

/** The body's values that are arguments, a list of words among them. */
function argsIn(body: Readonly<Record<string, unknown>>): Args {
  const args: Record<string, string | number | boolean | readonly string[]> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') args[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) args[key] = value;
  }
  return args;
}

/**
 * What a request's body carries, under its route's schema: the arguments it gives; or why it carries none: its JSON body (400), the body's
 * schema (400) — a key the schema has not refused before those it has where the route's words are strict.
 */
async function bodyOf(sent: Sent, params: Params, command: CommandSpec, at: Named, route: Route) {
  const words = wordsAt(command.name);
  const json = await jsonOf(sent, words.said, words, at);
  if ('status' in json) return json;
  const { body, hint } = renamedValues(command.name, json.value);
  const options = words.strict ? ({ onExcessProperty: 'error' } as const) : undefined;
  const read = decodeBody(bodySchema(command, Object.keys(params), route), body, words.issue(at), options);
  return 'status' in read ? read : { args: argsIn(read.body), ...(hint === undefined ? {} : { hint }) };
}

/**
 * The arguments of a request on a route — the store's own, as `POST /api/pause`, a subscription or an agent — or why it carries none:
 * its body (`bodyOf`), or the text a route that reads none was sent (`RouteWords.bodyless`), 400. A delete reads no body. Its arguments
 * are what its path names and its route fixes (`sets`), said over the body's.
 */
async function argsOf(
  sent: Sent,
  params: Params,
  command: CommandSpec,
  route: Route,
  at: Named,
): Promise<{ args: Args; hint?: string } | Refusal> {
  const bound = { ...params, ...fixedOf(route) };
  const bodyless = wordsAt(command.name).bodyless;
  if (bodyless) {
    const wrong = bodyless(at, await sent());
    return wrong === null ? { args: bound } : { status: 400, error: wrong };
  }
  if (route.method === 'DELETE') return { args: bound };
  const read = await bodyOf(sent, params, command, at, route);
  if ('status' in read) return read;
  return { args: { ...read.args, ...bound }, ...('hint' in read && read.hint !== undefined ? { hint: read.hint } : {}) };
}

/** A flag keyed `repo` that the CLI alone takes: on the api, the repository the request is served on (`Served.repo`). */
const servedRepo = (command: CommandSpec, args: Args, s: Served): Args =>
  command.spec.flags.some((f) => f.key === 'repo' && f.only?.side === 'cli') ? { ...args, repo: s.repo } : args;

/** What the api answers of a command's data: the keys it declares the api answers (`apiKeys`), or the whole of it. */
const answerOf = (command: Command, data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  command.apiKeys ? Object.fromEntries(command.apiKeys.map((key) => [key, data[key]])) : data;

/** What a request on a route names, as its words say it (`Named`). */
const namedBy = (c: Context<ApiEnv>): Named => ({
  runId: c.req.param('runId') ?? '',
  step: c.req.param('step') ?? '',
  name: c.req.param('name') ?? '',
  factory: c.req.param('factory') ?? '',
  namespace: c.req.param('namespace') ?? '',
  method: c.req.method,
  path: c.req.path,
});

/** The names a request's path gives, by the route's names for them. */
export type Params = Readonly<Record<string, string>>;

/** What a command answers through its pipeline: the keys of its data the api answers (`answerOf`), and a `hint` where it has one. */
export type CommandAnswer = { readonly data: Readonly<Record<string, unknown>>; readonly hint?: string };

/** Why a command answers nothing: one of the api's refusals, or a failure in the command's words, 502 (`RouteWords.failed`). */
export type CommandRefusal = Refusal | { readonly status: 502; readonly error: string };

/**
 * A routed command's pipeline: a name its path names (400), its arguments (`argsOf`), its check (422), and its handler's
 * data in the keys the api answers — with a `hint` naming what to send now where the body said a former value (`renamedValues`) —, the
 * app's memos of the runs each read projects handed with it (`ReadMemo.records`), so a read that polls — the factories' listing — answers
 * a run whose record has not moved from memory — or, where the command throws a refusal in place of data that did nothing
 * (`apiRefusal`), that refusal, thrown; or 502 in its words, where it has words for a failure (`RouteWords.failed`). `params` are the
 * path's names by the table route's, and `sent` reads the body.
 */
async function commandAnswered(
  command: Command,
  at: Route,
  named: Named,
  params: Params,
  sent: Sent,
  s: Served,
): Promise<CommandAnswer | CommandRefusal> {
  const words = wordsAt(command.name);
  const misnamed = words.named?.(named);
  if (misnamed) return { status: 400, error: misnamed };
  const read = await argsOf(sent, params, command, at, named);
  if ('status' in read) return read;
  const wrong = command.check?.(read.args);
  if (wrong) return { status: 422, error: wrong };
  try {
    const args = servedRepo(command, read.args, s);
    const data = await runPlaced(s, s.e, command.handler(args, s.env, s.home, { records: s.memo.records }));
    const refusal = command.apiRefusal?.(data, args);
    if (refusal) throw refusal;
    const answer = answerOf(command, data);
    return 'hint' in read && read.hint !== undefined ? { data: answer, hint: read.hint } : { data: answer };
  } catch (err) {
    if (isRefusal(err) || !words.failed) throw err;
    return { status: 502, error: words.failed(named, err instanceof Error ? err.message : String(err)) };
  }
}

/**
 * A routed command's handler on Hono, behind the write guard every write meets (`writeGuard`, guard.ts): the command's pipeline
 * (`commandAnswered`), its answer at its
 * route's status with its `hint` beside it, its refusals in `{ error }`; a refusal of the package's it throws is answered by `app.onError`.
 */
const route = (command: Command, at: Route) => (c: Context<ApiEnv>) =>
  served(c, async (s) => {
    const named = namedBy(c);
    const answered = await commandAnswered(command, at, named, c.req.param(), () => c.req.text(), s);
    if ('status' in answered) return c.json({ error: answered.error }, answered.status);
    return c.json(answered.hint === undefined ? answered.data : { ...answered.data, hint: answered.hint }, at.status);
  });

/**
 * The routes the table generates (`generated`): every route of a command of `table` the api posts, puts or deletes on that it serves by
 * no hand of its own, each answered from its entry. A read the api gets, and a write it serves by hand (`Route.hand`), are served by the
 * api's own route for it, which calls the entry's handler.
 */
export function routesOf(table: readonly Command[]): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  for (const command of table) for (const at of routeList(command).filter(generated)) router.on(at.method, at.path, route(command, at));
  return router;
}

/** Where the table asks the api for words it does not have, a sentence each: a command with a route generated and none in words.ts. */
export const wordBreaks = (table: readonly Pick<CommandSpec, 'name' | 'route'>[]): string[] =>
  table
    .filter((c) => routeList(c).some(generated) && !Object.hasOwn(WORDS, c.name))
    .map((c) => `${c.name} is routed on the api, and words.ts has no words for it: give it its shape and its refusals there`);

/**
 * The store's own writes, each a route of a command of the package's table, one path per command, in its words (`wordsAt`), each through
 * the one pipeline (`commandAnswered`), guarded as every write is (`writeGuard`, guard.ts): the routes generated here
 * (`routesOf(COMMANDS)`). Each route answers 400 for a body that is not one, refuses with 422 what the command's `check` refuses — the
 * same words `nemia` prints — and writes through the command's own handler, the package's verb, whose refusals it lets through to
 * `app.onError` (app.ts), which answers each by its kind, verbatim: 404 for what is gone (`Missing`), 409 for a state that forbids the ask
 * (`Conflict`), 422 for a record that does not read (`Invalid`). The api judges none of it. A write that fails otherwise is a 502 naming
 * the command that asks the same way. A run's named actions are the Run's, in `objects`' Api (objects/runs.ts).
 *
 * - `POST /api/pause` — the store paused, as `nemia pause` pauses it (`pauseParked`), its body `nemia pause`'s `--why`, `--by`, `--timeout`
 *   and `--now`, its route setting `yes`, and the route names no run: no pass starts new work until the lift, and every session parks at
 *   its tool call's end within `timeout` (`"15m"`; the store's, `nemia pause-timeout`, where it is left out), written on the pause as
 *   `timeoutMs`. Refuses what `nemia pause` refuses of `--why`, `--by` and `--timeout` — a timeout out of its form, or given with `now` —
 *   with 422, and a pause that stands without `now` with 409 (`Conflict`). Its 200 is `{ pause }`, as written. With `now`, as `nemia pause
 *   --now --yes`, it pauses at once (`pauseNow`): it keeps a pause that stands as it was put, its timeout cut to 0, so each session's call
 *   is cut and the session goes on as the same try once the store is resumed, and asks each check at work but a landing's to stop, run
 *   again then; its 200 is `{ pause, kept, interrupted, skipped }`.
 * - `DELETE /api/pause` — the store's pause lifted, as `nemia resume` lifts it (`resumePause`), and the sessions' drain with it; it reads
 *   no body. None standing is a 404 (`Missing`). Its 200 is `{ pause }`, the pause lifted.
 * - `POST /api/subscriptions/:name` — a long-lived task given a subscription to the feed, as `nemia subscribe <name> <task>` gives it
 *   (`subscribe`), its body `{ task, selectors?, digestEvery?, atLeast? }`, `selectors` a list as `-l` given many times, and `atLeast`
 *   the level a run's factory is at least at for its lines to be carried, as `--at-least` takes it, stored as the subscription's `scope`:
 *   the daemon's deliverer says the feed to the task from the feed's end. A name that names no file is a 400 before the body is read; a
 *   task never filed on the store's engine is a 404 (`Missing`), one not long-lived, a selector the feed's grammar refuses, minutes not
 *   above zero and an `atLeast` the package knows as no level a 422, in its own words naming `--at-least` and the levels, and a name
 *   taken a 409 (`Conflict`). Its 201 is `{ name, subscription }`, as written.
 * - `DELETE /api/subscriptions/:name` — a subscription taken away, as `nemia unsubscribe <name>` takes it (`dropSubscription`), and where
 *   its deliverer was with it; it reads no body. None by that name is a 404 (`Missing`). Its 200 is `{ name }`.
 * - `POST /api/agents/yours/copy` — an agent file copied into your library, as `nemia agents copy` copies it (`copyAgent`), its body
 *   `{ file, as?, keep? }`, `keep` a list as `--keep` given many times: the agent, its schema and every skill it gives but the builtin
 *   place skills, each part your library holds as it is reused, and the record of where it came from. Refused in the package's words,
 *   before anything is written: a file that is not there (404, `Missing`), a part your library holds otherwise (409, `Conflict`, naming
 *   each and its fix, `as` or `keep`), and a file the store would not run, a key another harness's agent file has among them (422,
 *   `Invalid`). A key it does not take is a 400. Its 200 is `{ name, copied, reused, record }`.
 */
export const commands = routesOf(COMMANDS);
