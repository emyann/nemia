/**
 * The api's process: its arguments read (`ticksOf`: none, or `--no-tick`), `PORT` read (`portOf`), and the app's runtime built from its
 * live layer (`runtime.context()`) — each refusal printed and exited with its code. Without `--no-tick` it is the store's daemon: it takes
 * the store's lease first (`up`, as the api), so an api refused by another daemon binds no port, then serves the app on loopback alone
 * (`HOST`, port.ts), writes where it listens into the lease (`holdUrl`) and ticks on the engine its layer built, under `runMain`: a signal
 * closes the server and lets the lease go, and a lease taken over or a pass that fails ends the process. Its passes are said as `nemia up`
 * says them, through the telemetry its environment asks for (`telemetryLayer`): OTLP too when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, its own
 * series a collector reads by their increase (`STEP_FOLLOWS`) born at zero with the daemon's (`up`'s `series`). The
 * feed's lines it writes are published to the hub its layer built (`FeedHub`), which the app's streams of the feed read.
 * With `--no-tick` it serves alone, holding nothing. It prints the port the server got: the one asked for, or a free one for `PORT=0`.
 * Refused first (`Conflict`), binding nothing: a checkout's api on a store that runs an install (`trialRefusal`), unless
 * `NEMIA_ON_INSTALLED=1`; and an install's repository is the one it was built from (`repoOf`).
 */
import { serve } from '@hono/node-server';
import { Context, Effect } from 'effect';
import {
  Conflict,
  currentRelease,
  DEFAULT_EVERY_MS,
  FeedHub,
  PlaceService,
  HOME,
  holdUrl,
  runMain,
  runningRelease,
  telemetryLayer,
  trialRefusal,
  up,
} from 'agent-orchestrator';
import { app, runtime } from './app.ts';
import { repoOf } from './capabilities/capabilities.ts';
import { HOST, portOf, ticksOf } from './port.ts';
import { STEP_FOLLOWS } from './steps/following.ts';
import { Engine } from './store.ts';

/** Prints `err`'s message and exits with its code: 2 for a refusal, 1 for anything else. */
const fail = (err: unknown): never => {
  console.error((err as Error).message ?? String(err));
  return process.exit((err as { exitCode?: number }).exitCode ?? 1);
};

let port: number;
let ticks: boolean;
let e: Engine['Service'];
let hub: (typeof FeedHub)['Service'];
let place: PlaceService['Service'];
const running = runningRelease();
try {
  const trial = trialRefusal(running, currentRelease(), HOME, process.env);
  if (trial !== null) throw new Conflict({ message: trial });
  ticks = ticksOf(process.argv.slice(2));
  port = portOf(process.env.PORT, ticks);
  const services = await runtime.context();
  e = Context.get(services, Engine);
  hub = Context.get(services, FeedHub);
  place = Context.get(services, PlaceService);
} catch (err) {
  fail(err);
}

/**
 * Why the app cannot listen on `port`, as a refusal (exit 2) naming the fix: a port in use is another process's, so another `PORT` —
 * `0` for any free one — or that process stopped; any other error is said with its own words beside the same fix.
 */
const unserved = (err: Error & { code?: string }): Error =>
  Object.assign(
    new Error(
      `api: ${HOST}:${port} ${err.code === 'EADDRINUSE' ? 'is in use by another process' : `cannot be listened on: ${err.message}`}. ` +
        'Stop what listens there, or give PORT= another port (PORT=0 for any free one).',
    ),
    { exitCode: 2 },
  );

/** The app served on `port`, once it listens, at the port it got; the server closed, every connection with it, as the scope closes. */
const listening = Effect.acquireRelease(
  Effect.callback<{ server: ReturnType<typeof serve>; port: number }, Error>((resume) => {
    const server = serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
      console.log(`api listening on http://${HOST}:${info.port}`);
      resume(Effect.succeed({ server, port: info.port }));
    });
    server.once('error', (err) => resume(Effect.fail(unserved(err))));
  }),
  ({ server }) =>
    Effect.sync(() => {
      server.close();
      if ('closeAllConnections' in server) server.closeAllConnections();
    }),
);

if (!ticks!) await Effect.runPromise(Effect.scoped(Effect.andThen(listening, Effect.never))).catch(fail);
else
  await runMain(
    up(e!, {
      every: DEFAULT_EVERY_MS,
      repo: repoOf(process.env, running),
      holder: 'api',
      series: [STEP_FOLLOWS],
      onTaken: () => Effect.map(listening, (served) => void holdUrl(`http://${HOST}:${served.port}`)),
    }).pipe(
      Effect.scoped,
      Effect.provideService(FeedHub, hub),
      Effect.provideService(PlaceService, place!),
      Effect.provide(telemetryLayer(process.env)),
    ),
  ).catch(fail);
