/**
 * The orchestrator's commands as routes, generated from its table (`COMMANDS`): each routed command on its path, its body derived from its
 * spec, guarded as a start is (guard.ts) where it writes, refused in the api's words (words.ts) and extended where the api does more
 * (extend.ts), then handed to the command's own handler — the one `wf` runs.
 */
import { Schema } from 'effect';
import { Hono, type Context } from 'hono';
import { type Args, type Command, COMMANDS, type CommandSpec, type Flag, type Positional } from 'agent-orchestrator';
import { isRefusal } from 'agent-orchestrator/effect';
import { decodeBody, NotBlank } from '../body.ts';
import { type Refusal, refusedBeforeReading } from '../guard.ts';
import { type ApiEnv, type Served, served } from '../layer.ts';
import { findRun, noSuchRun, taskOfStep } from '../store.ts';
import { EXTENSIONS, type FoldAt } from './extend.ts';
import { type Named, type RouteWords, WORDS } from './words.ts';

/** The schema of a positional's or a flag's value in a body. */
const valueSchema = (kind: Positional['kind'] | Flag['kind']): Schema.Decoder<unknown> =>
  kind === 'name' ? NotBlank : kind === 'amount' ? Schema.Number : Schema.String;

/**
 * The body a command takes on its route, derived from its spec: each positional its path does not name, required unless it is optional;
 * each key a flag sets, required, as one of the values its flags set it to — a body says its way, and takes no default; each flag's value,
 * optional; and the keys its extension takes (extend.ts), optional.
 */
export function bodySchema(command: CommandSpec, inPath: readonly string[]) {
  const fields: Record<string, Schema.Decoder<unknown>> = {};
  for (const p of command.spec.positionals.filter((p) => !inPath.includes(p.key)))
    fields[p.key] = p.takes === 'optional' ? Schema.optionalKey(valueSchema(p.kind)) : valueSchema(p.kind);
  const set = new Map<string, string[]>();
  for (const [key, value] of command.spec.flags.flatMap((f) => Object.entries(f.sets ?? {})))
    set.set(key, [...new Set([...(set.get(key) ?? []), value])]);
  for (const [key, values] of set) fields[key] = Schema.Literals(values);
  for (const f of command.spec.flags) if (f.key !== undefined) fields[f.key] = Schema.optionalKey(valueSchema(f.kind));
  for (const key of command.apiTakes ?? []) {
    const takes = EXTENSIONS[command.name]?.takes[key];
    if (takes) fields[key] = Schema.optionalKey(takes);
  }
  return Schema.Struct(fields);
}

/** Every key a command of the table takes on the api alone, and the commands that take it. */
const apiOnly = (table: readonly CommandSpec[]): ReadonlyMap<string, readonly string[]> =>
  new Map(
    [...new Set(table.flatMap((c) => c.apiTakes ?? []))].map((key) => [
      key,
      table.filter((c) => c.apiTakes?.includes(key)).map((c) => c.name),
    ]),
  );

/**
 * Why a body carries a key another command takes on the api alone and this one does not, 422 — a person's `answers` sent to an
 * approval, which would go nowhere — or null.
 */
function foreignKey(command: CommandSpec, table: readonly CommandSpec[], value: unknown, shape: string): Refusal | null {
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, takers] of apiOnly(table)) {
    if (!Object.hasOwn(value, key) || takers.includes(command.name)) continue;
    return {
      status: 422,
      error: `\`${key}\` is not a key POST …/${command.name} takes — ${takers.map((n) => `POST …/${n}`).join(', ')} takes it — so it would go nowhere: ${shape}.`,
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
async function jsonOf(c: Context<ApiEnv>, name: string, words: RouteWords): Promise<{ value: unknown } | Refusal> {
  try {
    return { value: await c.req.json() };
  } catch {
    return { status: 400, error: `POST …/${name} takes a JSON body: ${words.shape}.` };
  }
}

/** The body's values that are arguments, and those under the keys the command takes on the api alone. */
function split(command: CommandSpec, body: Readonly<Record<string, unknown>>) {
  const own = new Set(command.apiTakes);
  const args: Record<string, string | number> = {};
  const taken: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (own.has(key)) taken[key] = value;
    else if (typeof value === 'string' || typeof value === 'number') args[key] = value;
  }
  return { args, taken };
}

/**
 * The arguments a request carries, made whole by the command's extension, or why it carries none: the run and the step its path names
 * (404), its JSON body (400), a key another command takes on the api alone (422), the body's schema (400), a step its body names (404),
 * and the extension's own refusals.
 */
async function argsOf(c: Context<ApiEnv>, command: CommandSpec, at: Named, s: Served): Promise<{ args: Args } | Refusal> {
  const words = WORDS[command.name];
  const bound = at.step ? at : { runId: at.runId };
  const named = located(at, at.step || undefined, s.home);
  if ('status' in named) return named;
  const json = await jsonOf(c, command.name, words);
  if ('status' in json) return json;
  const foreign = foreignKey(command, COMMANDS, json.value, words.shape);
  if (foreign) return foreign;
  const read = decodeBody(bodySchema(command, Object.keys(bound)), json.value, words.issue(at));
  if ('status' in read) return read;
  const { args: given, taken } = split(command, read.body);
  const args: Args = { ...given, ...bound };
  const found = !at.step && typeof args.step === 'string' ? located(at, args.step, s.home) : named;
  if ('status' in found) return found;
  const extension = EXTENSIONS[command.name];
  if (!extension) return { args };
  return extension.fold({ e: s.e, home: s.home, run: found.run }, command, args, taken);
}

/** What the api answers of a command's data: the keys it declares the api answers (`apiKeys`), or the whole of it. */
const answerOf = (command: Command, data: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> =>
  command.apiKeys ? Object.fromEntries(command.apiKeys.map((key) => [key, data[key]])) : data;

/** A routed command's handler: the guard where it writes, its arguments, its check (422), and its handler's data, or 502 in its words. */
const route = (command: Command, status: 202) => (c: Context<ApiEnv>) =>
  served(c, async (s) => {
    const words = WORDS[command.name];
    const at: Named = { runId: c.req.param('runId') ?? '', step: c.req.param('step') ?? '' };
    if (command.writes) {
      const guard = words.guard(at);
      const refused = refusedBeforeReading(guard, c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
      if (refused) return c.json({ error: refused.error }, refused.status);
    }
    const read = await argsOf(c, command, at, s);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const wrong = command.check?.(read.args);
    if (wrong) return c.json({ error: wrong }, 422);
    try {
      return c.json(answerOf(command, await command.handler(s.e, read.args)), status);
    } catch (err) {
      if (isRefusal(err)) throw err;
      return c.json({ error: words.failed(at, err instanceof Error ? err.message : String(err)) }, 502);
    }
  });

/** The routes of every command of `table` that has one, each answered from its entry. */
export function routesOf(table: readonly Command[]): Hono<ApiEnv> {
  const router = new Hono<ApiEnv>();
  for (const command of table) if (command.route) router.on(command.route.method, command.route.path, route(command, command.route.status));
  return router;
}

/** Where the table asks the api for words it does not have, a sentence each: a routed command with none in words.ts. */
export const wordBreaks = (table: readonly Pick<CommandSpec, 'name' | 'route'>[]): string[] =>
  table
    .filter((c) => c.route && !Object.hasOwn(WORDS, c.name))
    .map((c) => `${c.name} is routed on the api, and words.ts has no words for it: give it its guard, its shape and its refusals there`);

/**
 * The board's writes for a person's asks of a run, one route per command of the package's table that has one (`routesOf(COMMANDS)`). Each
 * route is guarded as a start is (guard.ts), answers 404 for a run or a step it does not have, 400 for a body that is not an ask and 422
 * for a key another command takes on the api alone (`foreignKey`), refuses with 422 what the command's `check` refuses — the same words
 * `wf` prints — and writes through the command's own handler, the package's verb, whose refusals it lets through to
 * `app.onError` (app.ts), which answers each by its kind, verbatim: 404 for a run gone since the route read it (`Missing`), 409 for a state
 * that forbids the ask (`Conflict`), 422 for a record that does not read (`Invalid`). The api judges none of it. A 202 is accepted and not
 * yet done: the next tick honours the ask once, as it does one made at the command line. A write that fails otherwise is a 502 naming the
 * command that asks the same way.
 *
 * - `POST /api/runs/:id/steps/:step/retry` — another try of a step: the answer to a step that signed off blocked, a nudge, a recheck. Made
 *   by `retry()`, `wf retry`'s own, which writes the ask file and nothing else. Refuses a message or a budget that cannot ride on the ask
 *   (`messageRefusal`, `budgetRefusal` — a budget on a recheck, which files no session to spend it) with 422 before the run is read, and a
 *   step that may not be tried again that way (`retryRefusal`) with 409 after. A step whose session its harness blocked, with nothing
 *   signed, is taken as `wf retry` takes it (`stopBlocked`): the ask is written as any other, and the tick stops the session before it
 *   files the try — which the answer's `stopFirst` says, for the board to word, and then a tick after that one files the try. A person's
 *   `answers` to the questions the step's current closeout asks are checked against them and written as the try's message, the message
 *   given beside them its note (`answeredHow`): answers that do not fit, or on a recheck, are refused with 400.
 * - `POST /api/runs/:id/round` — another round of a run's loop: the loop out of rounds, or held on a step of it past its budget, with the
 *   cap raised. Made by `round()`, `wf round`'s own, which writes the ask file and nothing else. Refuses a budget not above zero with 400,
 *   before the round is asked (`roundBudgetRefusal`, which `roundAsk` refuses first, whatever the run); a round the loop may not go, or a
 *   budget not above what its steps have cost (`roundAsk`), with 409.
 * - `POST /api/runs/:id/steps/:step/say` — a person's words to a step's running session, through `say()`, `wf say`'s own, which hands them
 *   to the session through the engine, and the engine journals them: the api writes nothing, and the step's detail reads them back
 *   (`said`). Refuses, in the package's and the engine's words, with 409: a step not filed, settled, or of a cancelled run; empty words; a
 *   session its harness does not list running — the engine's refusals thrown as a `Conflict` by `say()`. Words the harness did not take are
 *   the engine's error, verbatim, with 502: nothing was journalled, and asking again may work. Its 202 means the session's harness took the
 *   words and the engine journalled them; whether the session reads them is the session's.
 * - `POST /api/runs/:id/steps/:step/approve` — an approval of a step waiting at its gate, through `approve()`, `wf approve`'s own, which
 *   writes the approval file and nothing else; the next tick files what waits on the step. Refuses empty words (`approvalWordsRefusal`)
 *   with 422 before the run is read, and a step that may not be approved (`approvalRefusal`) with 409 after — not gated, not signed off
 *   yet, already approved, sent back, or of a run called off. Sending it back is `POST …/retry` with a message, as `wf retry --message` is.
 * - `POST /api/runs/:id/steps/:step/accept` — an acceptance of a loop out of rounds, as it stands, through `accept()`, `wf accept`'s own,
 *   which writes the acceptance file and nothing else; the next tick files what waits on the looping step as if it had said `again: false`.
 *   Refuses words that are missing or empty (`acceptWordsRefusal`) with 422 before the run is read, and a loop that may not be accepted
 *   (`acceptAsk`) with 409 after — a step with no `loop:`, a round the run files itself or one already asked for, a loop that ended
 *   `again: false`, a try already accepted, a run called off.
 */
export const commands = routesOf(COMMANDS);
