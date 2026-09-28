/**
 * The api's process: `PORT` read (`portOf`) — a refusal printed and exited with its code — and the app served on loopback alone (`HOST`,
 * port.ts), printing the port the server got: the one asked for, or a free one for `PORT=0`.
 */
import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { HOST, portOf } from './port.ts';

let port: number;
try {
  port = portOf(process.env.PORT);
} catch (err) {
  console.error((err as Error).message);
  process.exit((err as { exitCode?: number }).exitCode ?? 1);
}

serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
  console.log(`api listening on http://${HOST}:${info.port}`);
});
