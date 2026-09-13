import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { portOf } from './port.ts';

let port: number;
try {
  port = portOf(process.env.PORT);
} catch (err) {
  console.error((err as Error).message);
  process.exit((err as { exitCode?: number }).exitCode ?? 1);
}

// `info.port` is the port the server got: the one asked for, or a free one for `PORT=0`.
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
