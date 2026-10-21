/**
 * The orchestrator's commands as routes, generated from its table (`COMMANDS`): each routed command on its path, its body derived from its
 * spec, guarded as a start is (guard.ts) where it writes, refused in the api's words (words.ts) and extended where the api does more
 * (extend.ts), then handed to the command's own handler — the one `nemia` runs.
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
  routeList,
} from 'agent-orchestrator';
import { isRefusal } from 'agent-orchestrator';
import { decodeBody, NotBlank } from '../body.ts';
import { type Refusal, refusedBeforeReading } from '../guard.ts';
import { type ApiEnv, type Served, served } from '../layer.ts';
import { findRun, noSuchRun, taskOfStep, runPlaced } from '../store.ts';
import { EXTENSIONS, type FoldAt } from './extend.ts';
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
 * required where it says so; and the keys its extension takes (extend.ts), optional. A key its route fixes (`sets`) is none of the body's.
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
  for (const f of command.spec.flags.filter((f) => f.key !== undefined && f.only?.side !== 'cli'))
    fields[f.key!] = f.only?.required ? flagSchema(f) : Schema.optionalKey(flagSchema(f));
  for (const key of command.apiTakes ?? []) {
    const takes = EXTENSIONS[command.name]?.takes[key];
    if (takes) fields[key] = Schema.optionalKey(takes);
  }
  for (const key of fixed) delete fields[key];
  return Schema.Struct(fields);
}

/** Every key a command of the table takes on the api alone, and the routes that write it. */
const apiOnly = (table: readonly CommandSpec[]): ReadonlyMap<string, readonly Route[]> =>
  new Map(
    [...new Set(table.flatMap((c) => c.apiTakes ?? []))].map((key) => [
      key,
      table.filter((c) => c.apiTakes?.includes(key)).flatMap((c) => routeList(c).filter(generated)),
    ]),
  );

/** A route as a refusal names it: its method, then its path from its last fixed word — `POST …/approve`, `PUT …/custom-instructions`. */
const routeShort = ({ method, path }: Route): string => {
  const parts = path.split('/');
  const fixed = parts.filter((p) => p !== '' && !p.startsWith(':')).at(-1) ?? '';
  return `${method} …/${parts.slice(parts.lastIndexOf(fixed)).join('/')}`;
};

/**
 * Why a body carries a key another command takes on the api alone and this one does not, 422 — a person's `answers` sent to a round,
 * which would go nowhere — or null.
 */
function foreignKey(command: CommandSpec, route: Route, table: readonly CommandSpec[], value: unknown, shape: string): Refusal | null {
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, takers] of apiOnly(table)) {
    if (!Object.hasOwn(value, key) || command.apiTakes?.includes(key)) continue;
    return {
      status: 422,
      error: `\`${key}\` is not a key ${routeShort(route)} takes — ${takers.map(routeShort).join(', ')} ${takers.length > 1 ? 'take' : 'takes'} it — so it would go nowhere: ${shape}.`,
    };
  }
  return null;
}

/** The run a route names, found, and its step where the path or the body names one; or 404, in the store's words. */
function located(at: Named, step: string | undefined, home: string): { run: FoldAt['run'] } | Refusal {
  if (step === undefined) {
    const run = findRun(at.runId);
    return run ? { run } : { status: 404, error: noSuchRun(at.runId) };
  }
  const found = taskOfStep(at.runId, step, home);
  return 'error' in found ? { status: 404, error: found.error } : { run: found.run };
}

/** A request's JSON body, or why it is none, in the route's words (400). */
async function jsonOf(c: Context<ApiEnv>, name: string, words: RouteWords, at: Named): Promise<{ value: unknown } | Refusal> {
  try {
    return { value: await c.req.json() };
  } catch {
    return { status: 400, error: words.notJson?.(at) ?? `POST …/${name} takes a JSON body: ${words.shape}.` };
  }
}

/** The body's values that are arguments, a list of words among them, and those under the keys the command takes on the api alone. */
function split(command: CommandSpec, body: Readonly<Record<string, unknown>>) {
  const own = new Set(command.apiTakes);
  const args: Record<string, string | number | boolean | readonly string[]> = {};
  const taken: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (own.has(key)) taken[key] = value;
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') args[key] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) args[key] = value;
  }
  return { args, taken };
}

/**
 * What a request's body carries, under its route's schema: the arguments it gives and the keys the command takes on the api alone; or why
 * it carries none: its JSON body (400), a key another command takes on the api alone (422), the body's schema (400) — a key the schema has
 * not refused before those it has where the route's words are strict.
 */
async function bodyOf(c: Context<ApiEnv>, command: CommandSpec, at: Named, route: Route) {
  const words = WORDS[command.name];
  const json = await jsonOf(c, command.name, words, at);
  if ('status' in json) return json;
  const foreign = foreignKey(command, route, COMMANDS, json.value, words.shape);
  if (foreign) return foreign;
  const options = words.strict ? ({ onExcessProperty: 'error' } as const) : undefined;
  const read = decodeBody(bodySchema(command, Object.keys(c.req.param()), route), json.value, words.issue(at), options);
  return 'status' in read ? read : split(command, read.body);
}

/**
 * The arguments a request carries, made whole by the command's extension, or why it carries none: the run and the step its path names
 * (404), its body (`bodyOf`), a step its body names (404), and the extension's own refusals. A delete reads no body: its arguments are
 * what its path names. What the route fixes (`sets`) is said over the body's.
 */
async function argsOf(c: Context<ApiEnv>, command: CommandSpec, route: Route, at: Named, s: Served) {
  if (!at.runId) return storeArgsOf(c, command, route, at);
  const bound = c.req.param();
  const named = located(at, at.step || undefined, s.home);
  if ('status' in named) return named;
  const read = route.method === 'DELETE' ? { args: {}, taken: {} } : await bodyOf(c, command, at, route);
  if ('status' in read) return read;
  const args: Args = { ...read.args, ...fixedOf(route), ...bound };
  const found = !at.step && typeof args.step === 'string' ? located(at, args.step, s.home) : named;
  if ('status' in found) return found;
  const extension = EXTENSIONS[command.name];
  if (!extension) return { args };
  return extension.fold({ e: s.e, home: s.home, run: found.run }, command, args, read.taken);
}

/**
 * The arguments of a request on a route that names no run — the store's own, as `POST /api/pause`, a card or an agent — or why it carries
 * none: its body (`bodyOf`), or the text a route that reads none was sent (`RouteWords.bodyless`), 400. A delete reads no body. Its
 * arguments are what its path names and its route fixes (`sets`), said over the body's.
 */
async function storeArgsOf(c: Context<ApiEnv>, command: CommandSpec, route: Route, at: Named): Promise<{ args: Args } | Refusal> {
  const bound = { ...c.req.param(), ...fixedOf(route) };
  const bodyless = WORDS[command.name].bodyless;
  if (bodyless) {
    const wrong = bodyless(at, await c.req.text());
    return wrong === null ? { args: bound } : { status: 400, error: wrong };
  }
  if (route.method === 'DELETE') return { args: bound };
  const read = await bodyOf(c, command, at, route);
  return 'status' in read ? read : { args: { ...read.args, ...bound } };
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
  server: c.req.param('server') ?? '',
  method: c.req.method,
  path: c.req.path,
});

/**
 * A routed command's handler: the guard where it writes, a name its path names (400), its arguments, its check (422), and its handler's
 * data at its route's status, the app's memos of the runs each read projects handed with them (`ReadMemo.records`), so a read that polls
 * — the factories' listing — answers a run whose record has not moved from memory — or, where the command throws a refusal in place
 * of data that did nothing (`apiRefusal`), that refusal, answered by `app.onError`; or 502 in its words, where it has words for a
 * failure (`RouteWords.failed`).
 */
const route = (command: Command, at: Route) => (c: Context<ApiEnv>) =>
  served(c, async (s) => {
    const words = WORDS[command.name];
    const named = namedBy(c);
    if (command.writes) {
      const guard = words.guard(named);
      const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
      if (refused) return c.json({ error: refused.error }, refused.status);
    }
    const misnamed = words.named?.(named);
    if (misnamed) return c.json({ error: misnamed }, 400);
    const read = await argsOf(c, command, at, named, s);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const wrong = command.check?.(read.args);
    if (wrong) return c.json({ error: wrong }, 422);
    try {
      const args = servedRepo(command, read.args, s);
      const data = await runPlaced(s.placeService, s.e, command.handler(args, s.env, s.home, { records: s.memo.records }));
      const refusal = command.apiRefusal?.(data, args);
      if (refusal) throw refusal;
      return c.json(answerOf(command, data), at.status);
    } catch (err) {
      if (isRefusal(err) || !words.failed) throw err;
      return c.json({ error: words.failed(named, err instanceof Error ? err.message : String(err)) }, 502);
    }
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
    .map((c) => `${c.name} is routed on the api, and words.ts has no words for it: give it its guard, its shape and its refusals there`);

/**
 * The board's writes for a person's asks of a run, one route per command of the package's table that has one (`routesOf(COMMANDS)`). Each
 * route is guarded as a start is (guard.ts), answers 404 for a run or a step it does not have, 400 for a body that is not an ask and 422
 * for a key another command takes on the api alone (`foreignKey`), refuses with 422 what the command's `check` refuses — the same words
 * `nemia` prints — and writes through the command's own handler, the package's verb, whose refusals it lets through to
 * `app.onError` (app.ts), which answers each by its kind, verbatim: 404 for a run gone since the route read it (`Missing`), 409 for a state
 * that forbids the ask (`Conflict`), 422 for a record that does not read (`Invalid`). The api judges none of it. A 202 is accepted and not
 * yet done: the next tick honours the ask once, as it does one made at the command line. A write that fails otherwise is a 502 naming the
 * command that asks the same way.
 *
 * - `POST /api/runs/:id/steps/:step/retry` — another try of a step: the answer to a step that signed off blocked, a nudge, a recheck. Made
 *   by `retryRun`, `nemia retry`'s own, which writes the ask file and nothing else. Refuses a message or a budget that cannot ride on the
 *   ask (`messageRefusal`, `budgetRefusal` — a budget on a recheck, which files no session to spend it) with 422 before the run is read,
 *   and a step that may not be tried again that way (`retryRefusal`) with 409 after. A step whose session its harness blocked, with nothing
 *   signed, is taken as `nemia retry` takes it (`stopBlocked`): the ask is written as any other, and the tick stops the session before it
 *   files the try — which the answer's `stopFirst` says, for the board to word, and then a tick after that one files the try. A person's
 *   `answers` to the questions the step's current closeout asks are checked against them and written as the try's message, the message
 *   given beside them its note (`answeredHow`): answers that do not fit, or on a recheck, are refused with 400.
 * - `POST /api/runs/:id/round` — another round of a run's loop: the loop out of rounds, or held on a step of it past its budget, with the
 *   cap raised. Made by `roundRun`, `nemia round`'s own, which writes the ask file and nothing else. Refuses a budget not above zero with
 *   400, before the round is asked (`roundBudgetRefusal`, which `roundAsk` refuses first, whatever the run); a round the loop may not go,
 *   or a budget not above what its steps have cost (`roundAsk`), with 409.
 * - `POST /api/runs/:id/merge` — a loop's work sent back to merge its base branch, on the round it is on, which the merge does not spend.
 *   Made by `mergeRun`, `nemia merge`'s own, which tries the merge with git and writes the ask file and nothing else. Refuses a merge the
 *   loop may not take (`mergeAsk`) with 409: among them a run whose result step closes no loop, pointed to `nemia retry`, and work that
 *   merges cleanly, pointed to the landing's approval.
 * - `POST /api/runs/:id/steps/:step/say` — a person's words to a step's running session, through `sayRun`, `nemia say`'s own, which hands
 *   them to the session through the engine, and the engine journals them: the api writes nothing, and the step's detail reads them back
 *   (`said`). Refuses, in the package's and the engine's words, with 409: a step not filed, settled, or of a cancelled run; empty words; a
 *   session its harness does not list running — the engine's refusals thrown as a `Conflict` by `sayRun`. Words the harness did not take
 *   are the engine's error, verbatim, with 502: nothing was journalled, and asking again may work. Its 202 means the session's harness took
 *   the words and the engine journalled them; whether the session reads them is the session's.
 * - `POST /api/runs/:id/steps/:step/approve` — an approval of a step waiting at its gate, through `approveRun`, `nemia approve`'s own,
 *   which writes the approval file and nothing else; the next tick files what waits on the step. Refuses empty words
 *   (`approvalWordsRefusal`) with 422 before the run is read, and a step that may not be approved (`approvalRefusal`) with 409 after —
 *   not gated, not signed off yet, already approved, sent back, or of a run called off. Sending it back is `POST …/retry` with a message,
 *   as `nemia retry --message` is.
 * - `POST /api/runs/:id/steps/:step/accept` — an acceptance of a loop out of rounds, as it stands, through `acceptRun`, `nemia accept`'s
 *   own, which writes the acceptance file and nothing else; the next tick files what waits on the looping step as if it had said `again:
 *   false`. Refuses words that are missing or empty (`acceptWordsRefusal`) with 422 before the run is read, and a loop that may not be
 *   accepted (`acceptAsk`) with 409 after — a step with no `loop:`, a round the run files itself or one already asked for, a loop that
 *   ended `again: false`, a try already accepted, a run called off.
 * - `POST /api/runs/:id/hold` — a run held until other runs ship, as `nemia hold <run> --until <run>…` holds it (`hold`), its body
 *   `{ until, why?, by? }`, `until` a list as `--until` given many times, and `by` the user the api runs as where it is left out. Its route
 *   sets `off` false, so no body lifts through it, and a key it does not take, `off` among them, is a 400 naming each. Refuses what
 *   `nemia hold` refuses of its arguments (`check`) with 422 — no run to wait on, a `why` or `by` blank or over its cap — before the run
 *   is read; a run the store does not have with 404; and what `hold` refuses after (`holdRefusal`) with 409 (`Conflict`): a run already
 *   held, cancelled, pruned, finished or a folder run's, and of each run named one the store does not have, the run itself, one on
 *   another repository or base branch, one that never ships, and one that already waits on it. Its 200 is `{ id, lifted: false, hold }`,
 *   the hold as written. No feed line: the board reads the run again.
 * - `DELETE /api/runs/:id/hold` — a person's hold lifted, as `nemia hold <run> --off` lifts it (`unhold`): its route sets `off`, and it
 *   reads no body. Its file removed, the run goes on at the next tick, what its steps asked while
 *   it was held asked again. Refused in the package's words, by `app.onError`: a run nobody holds — a pruned one among them, since no verb
 *   holds one — and a hold put again as it was lifted are a 409 (`Conflict`), a run gone since the route read it a 404; any other failure
 *   is a 502. Its 200 is `{ id, lifted: true, hold }`. No feed line: the tick is the feed's one writer, and the board reads the run again.
 * - `POST /api/pause` — the store paused, as `nemia pause` pauses it (`putPause`), its body `nemia pause`'s `--why`, `--by` and `--now`,
 *   its route setting `yes`, and the route names no run: no pass starts new work until the lift. Refuses what `nemia pause` refuses of
 *   `--why` and `--by` with 422, and a pause that stands without `now` with 409 (`Conflict`). Its 200 is `{ pause }`, as written. With
 *   `now`, as `nemia pause --now --yes`, it pauses at once (`pauseNow`): it keeps a pause that stands as it was put, and asks each step
 *   session or check at work but a landing to stop, each tried again once the store is resumed; its 200 is `{ pause, kept, interrupted,
 *   skipped }`.
 * - `DELETE /api/pause` — the store's pause lifted, as `nemia resume` lifts it (`resumePause`); it reads no body. None standing is a 404
 *   (`Missing`). Its 200 is `{ pause }`, the pause lifted.
 * - `POST /api/subscriptions/:name` — a long-lived task given a subscription to the feed, as `nemia subscribe <name> <task>` gives it
 *   (`subscribe`), its body `{ task, selectors?, digestEvery?, atLeast? }`, `selectors` a list as `-l` given many times, and `atLeast`
 *   the level a run's factory is at least at for its lines to be carried, as `--at-least` takes it, stored as the subscription's `scope`:
 *   the daemon's deliverer says the feed to the task from the feed's end. A name that names no file is a 400 before the body is read; a
 *   task never filed on the store's engine is a 404 (`Missing`), one not long-lived, a selector the feed's grammar refuses, minutes not
 *   above zero and an `atLeast` the package knows as no level a 422, in its own words naming `--at-least` and the levels, and a name
 *   taken a 409 (`Conflict`). Its 201 is `{ name, subscription }`, as written.
 * - `DELETE /api/subscriptions/:name` — a subscription taken away, as `nemia unsubscribe <name>` takes it (`dropSubscription`), and where
 *   its deliverer was with it; it reads no body. None by that name is a 404 (`Missing`). Its 200 is `{ name }`.
 * - `DELETE /api/runs/:id` — a try's run removed, as `nemia rm <run>` removes it (`forgetRun`): its record, and the folders it worked in
 *   with it; it reads no body. Only a try (rm's extension, extend.ts): any other run is a 409 naming `nemia rm`, which says what it hands
 *   off and what it leaves, and a repository run's worktrees and branches are a person's to read before they go. What removed nothing is
 *   thrown in `nemia rm`'s line (`RM.apiRefusal`): a try still working, and a worktree a session holds — the record kept — are a 409, a
 *   record gone since the route read it a 404; any other failure is a 502. Its 200 is `{ id, removed: true, engine }`, `engine` what the
 *   engine forgot of the records of its tasks, their journals and session files, and what waits to be forgotten until it settles; null with
 *   none.
 * - `POST /api/runs/:id/prune` — a finished run pruned, as `nemia prune <run> --yes` prunes it (`prune`), its route setting `yes`, with
 *   `artifacts` its `--artifacts` and `unmerged` its `--unmerged`, each true or false, and no other key, every one named at once (400):
 *   its worktrees removed, and its files with `artifacts`; its record and every branch kept. The page asks twice before it sends this, so
 *   there is no dry run here. The package decides everything and words it (`PRUNE.apiRefusal`): refused — a folder run, a run not over, a
 *   finished run nobody merged without `unmerged`, a worktree holding what no commit has — and nothing left to prune are each a 409 in
 *   `nemia prune`'s words alone, the page saying `Not pruned` above them itself; any other failure is a 502. Its 200 is `{ id, pruned:
 *   true, lines, worktrees, artifacts, left }`. No feed line: the marker the prune writes moves the run's stamp in `runStore`, and the
 *   board reads the run again itself.
 * - `PUT /api/factories/:factory/hires/:step` — an agent hired into a step of a factory's workflow, as `nemia factory hire` hires it
 *   (`hireAgent`), its body `{ agent }` and its step `<workflow>/<step>` one encoded segment, `build%2Fimplement`. Refused in the package's
 *   words: a factory the store does not have (404, `Missing`), the default factory (409, `Conflict`), a step or an agent that is no name
 *   and a workflow the factory does not offer (422, `Invalid`), and a step whose own file names its agent, in the store's root of the
 *   app or a repository of the factory's (409, `Conflict`, in `hireRefusalOf`'s words). Its 200 is `{ file, replaced }`, the agent the
 *   hire replaced or null.
 * - `POST /api/agents/yours/copy` — an agent file copied into your library, as `nemia agents copy` copies it (`copyAgent`), its body
 *   `{ file, as?, keep? }`, `keep` a list as `--keep` given many times: the agent, its schema and every skill it gives but the place skills
 *   Nemia ships, each part your library holds as it is reused, and the record of where it came from. Refused in the package's words, before
 *   anything is written: a file that is not there (404, `Missing`), a part your library holds otherwise (409, `Conflict`, naming each and
 *   its fix, `as` or `keep`), and a file the store would not run, a key another harness's agent file has among them (422, `Invalid`). A
 *   key it does not take is a 400. Its 200 is `{ name, copied, reused, record }`.
 * - `DELETE /api/factories/:factory/hires/:step` — a step's hire taken back, as `nemia factory fire` takes it (`fireAgent`); it reads no
 *   body. A step the factory hires no one into is a 404 (`Missing`). Its 200 is `{ file, fired }`.
 */
export const commands = routesOf(COMMANDS);
