/**
 * The daemon serving this store, made ready (the intent's Q14): the url its lease names where something listens there, else a daemon
 * started once on demand — the in-process `nemia daemon --json` (`local.ts`), which starts the store's daemon as any ticking command does
 * (`ensureDaemon`) — and waited for by its readiness, `GET /api/health` answering at the url it said or its lease names, polled until it
 * answers or `READY_WITHIN_MS` is gone. A read never asks twice: it asks once, of a daemon that answered. Refused, exit 2, where none
 * comes up or the start is off (`NEMIA_DAEMON_START=off`), naming the command that reads in process and the one that installs the service.
 *
 * Under a remote context (`context.ts`) the daemon is the context's server: asked there, never started, and this machine's lease never
 * read; one that takes no connection is refused, exit 2, naming the context and `nemia config get-contexts`. A context the config does
 * not hold is refused too.
 */
import { Effect, Option, Schedule } from 'effect';
import { sessionHeaders } from './client.ts';
import { chosenOf, unheld } from './context.ts';
import { captured } from './local.ts';
import { Refused } from './refused.ts';
import { servedAt } from './where.ts';

/** The setting that turns the start off, as the orchestrator reads it. */
export const START_OFF = 'NEMIA_DAEMON_START';

/** The path whose answer says a daemon is ready: any answer, a refusal among them, says something listens and speaks HTTP. */
export const READY_PATH = '/api/health';

/**
 * How long a started daemon has to answer `READY_PATH`: fifteen seconds, some ten times a cold start of the api on this machine, so a
 * loaded machine still gets there, while a person is told within a quarter of a minute that it did not come up.
 */
export const READY_WITHIN_MS = 15_000;

/** How long one probe waits for an answer before it says the daemon took the connection and is silent. */
const PROBE_MS = 1_000;

/** How often a start polls its readiness. */
const POLL_EVERY = '100 millis';

/**
 * What a daemon at `base` does when asked `READY_PATH`, with the session's token as every request is (`sessionHeaders`): answers (any
 * status); takes the connection and says nothing within `PROBE_MS` (`silent`: one holds the port, and a read is to be bounded
 * rather than start another); or takes none (`refused`).
 */
export async function probe(base: string, env: NodeJS.ProcessEnv = process.env): Promise<'answers' | 'silent' | 'refused'> {
  try {
    const response = await fetch(new URL(READY_PATH, base), { headers: sessionHeaders(env), signal: AbortSignal.timeout(PROBE_MS) });
    await response.body?.cancel();
    return 'answers';
  } catch (err) {
    return err instanceof Error && err.name === 'TimeoutError' ? 'silent' : 'refused';
  }
}

/** The url a `nemia daemon --json` answered on its last line, where it names one. */
const urlIn = (stdout: string): string | undefined => {
  try {
    const answer: unknown = JSON.parse(stdout.trim().split('\n').at(-1) ?? '');
    if (typeof answer !== 'object' || answer === null || !('url' in answer)) return undefined;
    return typeof answer.url === 'string' && answer.url !== '' ? answer.url : undefined;
  } catch {
    return undefined;
  }
};

/** Why none serves the store, and what to type: the read in process, the install, and the setting where it is why. */
const unserved = (verb: string, off: boolean): Refused =>
  new Refused(
    `nemia ${verb}: no daemon serves this store` +
      (off ? `, and ${START_OFF}=off here, so none is started on demand. ` : ', and none came up when one was started. ') +
      `Read it in process, typed again with --local: \`nemia ${verb} --local …\`; or install the service that serves it: \`nemia service install\`` +
      (off ? `; or unset ${START_OFF} to have one started.` : '; what the start said is in daemon.log, in the store.'),
  );

/** The first url `urlNow` names whose daemon answers `READY_PATH`, polled every `POLL_EVERY` for `withinMs`; none where none answered. */
export const readyAt = (
  urlNow: () => string | undefined,
  withinMs: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const base = urlNow();
      const answered = base === undefined ? 'refused' : yield* Effect.promise(() => probe(base, env));
      if (base === undefined || answered !== 'answers') return yield* Effect.fail('not ready' as const);
      return base;
    }).pipe(Effect.retry(Schedule.spaced(POLL_EVERY)), Effect.timeoutOption(withinMs), Effect.map(Option.getOrUndefined)),
  );

/**
 * The url of a daemon started for the read `verb` names, once it is ready: `nemia daemon --json` run once in process, then the url it
 * answered, else the one the lease names, polled until its daemon answers. Refused where none answers within `withinMs`, or the start
 * is off.
 */
export async function daemonStarted(
  verb: string,
  env: NodeJS.ProcessEnv = process.env,
  withinMs: number = READY_WITHIN_MS,
): Promise<string> {
  if (env[START_OFF] === 'off') throw unserved(verb, true);
  const { code, stdout } = await captured(['daemon', '--json'], env);
  const said = code === 0 ? urlIn(stdout) : undefined;
  const ready = await readyAt(() => said ?? servedAt(env), withinMs, env);
  if (ready === undefined) throw unserved(verb, false);
  return ready;
}

/** A remote context's daemon that takes no connection: refused, naming the context, how to see the contexts, and how to leave it. */
const remoteDown = (verb: string, name: string, server: string): Refused =>
  new Refused(
    `nemia ${verb}: the daemon of the context ${name}, at ${server}, takes no connection. See that it runs there (\`nemia service status\` on its machine), check its address with \`nemia config get-contexts\`, or read this machine's store after \`nemia config use-context local\``,
  );

/**
 * The base url of the daemon a read asks, ready: under a remote context its server, where something listens there, never a daemon
 * started here; else this store's lease's, where something listens there — answering, or holding the connection silent, which the
 * read's own bound then says — else one started now and waited for (`daemonStarted`).
 */
export async function served(verb: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const chosen = chosenOf(env);
  if (chosen.kind === 'refused') throw unheld(chosen.name);
  if (chosen.kind === 'remote') {
    if ((await probe(chosen.server, env)) !== 'refused') return chosen.server;
    throw remoteDown(verb, chosen.name, chosen.server);
  }
  const at = servedAt(env);
  if (at !== undefined && (await probe(at, env)) !== 'refused') return at;
  return daemonStarted(verb, env);
}
