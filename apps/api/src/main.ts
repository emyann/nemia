import { serve } from '@hono/node-server';
import { app } from './app.ts';

const port = Number(process.env.PORT) || 8787;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
