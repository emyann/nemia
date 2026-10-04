/**
 * The api's process: its arguments read (`ticksOf`: none, or `--no-tick`), `PORT` read (`portOf`), and the app's runtime built from its
 * live layer (`runtime.context()`) — each refusal printed and exited with its code. Without `--no-tick` it is the store's daemon: it takes
 * the store's lease first (`up`, as the api), so an api refused by another daemon binds no port, then serves the app on loopback alone
 * (`HOST`, port.ts), writes where it listens into the lease (`holdUrl`) and ticks on the engine its layer built, under `runMain`: a signal
 * closes the server and lets the lease go, and a lease taken over or a pass that fails ends the process. With `--no-tick` it serves alone,
 * holding nothing. It prints the port the server got: the one asked for, or a free one for `PORT=0`.
 */
import { serve } from '@hono/node-server';
import { Context, Effect } from 'effect';
import { DEFAULT_EVERY_MS, holdUrl, runMain, up } from 'agent-orchestrator';
import { app, runtime } from './app.ts';
import { repoOf } from './capabilities/capabilities.ts';
import { HOST, portOf, ticksOf } from './port.ts';
import { Engine } from './store.ts';

/** Prints `err`'s message and exits with its code: 2 for a refusal, 1 for anything else. */
const fail = (err: unknown): never => {
  console.error((err as Error).message ?? String(err));
  return process.exit((err as { exitCode?: number }).exitCode ?? 1);
};

let port: number;
let ticks: boolean;
let e: Engine['Service'];
try {
  ticks = ticksOf(process.argv.slice(2));
  port = portOf(process.env.PORT, ticks);
  e = Context.get(await runtime.context(), Engine);
} catch (err) {
  fail(err);
}

/** The app served on `port`, once it listens, at the port it got; the server closed, every connection with it, as the scope closes. */
const listening = Effect.acquireRelease(
  Effect.callback<{ server: ReturnType<typeof serve>; port: number }>((resume) => {
    const server = serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
      console.log(`api listening on http://${HOST}:${info.port}`);
      resume(Effect.succeed({ server, port: info.port }));
    });
  }),
  ({ server }) =>
    Effect.sync(() => {
      server.close();
      if ('closeAllConnections' in server) server.closeAllConnections();
    }),
);

if (!ticks!) await Effect.runPromise(Effect.scoped(Effect.andThen(listening, Effect.never)));
else
  await runMain(
    up(e!, {
      every: DEFAULT_EVERY_MS,
      repo: repoOf(process.env),
      holder: 'api',
      onTaken: () => Effect.map(listening, (served) => void holdUrl(`http://${HOST}:${served.port}`)),
    }).pipe(Effect.scoped),
  ).catch(fail);
