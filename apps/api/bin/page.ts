/**
 * `npm run api:page [-- <url>]`: the one surface as a page to browse and to try (`browseApp`, src/openapi/browse.ts), served alone on
 * this machine's loopback. A request tried on the page is forwarded to the api at `<url>` — a server's, `https://…`, or this machine's
 * daemon where none is given — with the token typed on the page and nothing else of the browser's, and each one is said on a line
 * with its status, its time and its size, which is how an endpoint's cost is read. Prints the page's address and serves until it is
 * stopped. The port is 8790, beside the daemon's and the viewer's and neither, or `PORT`. The one file of the page that touches the
 * machine: it reads the viewer's bundle from the installed package, listens, and forwards.
 */
import fs from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { browseApp } from '../src/openapi/browse.ts';
import { REFERENCE_BUNDLE, REFERENCE_PATH } from '../src/openapi/reference.ts';

const PAGE_PORT = 8790;

/** This machine's daemon, where no api is named. */
const DAEMON = 'http://127.0.0.1:8787';

/** The headers of a request tried on the page that are sent on: the token, and what says the body and the answer wanted. */
const SENT_ON = ['authorization', 'content-type', 'accept'];

const given = process.argv[2];
if (given !== undefined && !/^https?:\/\/[^/]+\/?$/.test(given)) {
  process.stderr.write(
    `api:page takes the address of an api, as https://nemia.example or ${DAEMON}, and was given ${given}: npm run api:page -- <url>\n`,
  );
  process.exit(2);
}
const target = (given ?? DAEMON).replace(/\/$/, '');
const port = Number(process.env.PORT ?? PAGE_PORT);
const page = `http://127.0.0.1:${port}`;

let bundle: Promise<string> | undefined;
const app = browseApp(() => (bundle ??= fs.readFile(REFERENCE_BUNDLE, 'utf8')), { page, target });

app.all('/api/*', async (c) => {
  const url = new URL(c.req.url);
  const started = performance.now();
  const headers = new Headers(SENT_ON.flatMap((name) => (c.req.header(name) === undefined ? [] : [[name, c.req.header(name) ?? '']])));
  const body = c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer();
  const line = (status: number | string, bytes: number): void => {
    process.stdout.write(
      `${c.req.method} ${url.pathname}${url.search}  ${status}  ${Math.round(performance.now() - started)} ms  ${bytes} B\n`,
    );
  };
  try {
    const answered = await fetch(`${target}${url.pathname}${url.search}`, { method: c.req.method, headers, body });
    const bytes = await answered.arrayBuffer();
    line(answered.status, bytes.byteLength);
    return new Response(bytes, {
      status: answered.status,
      headers: { 'content-type': answered.headers.get('content-type') ?? 'text/plain' },
    });
  } catch (cause) {
    line('unreached', 0);
    return c.json(
      {
        message: `no api answered at ${target}: ${cause instanceof Error ? cause.message : String(cause)}. Start it, or name another: npm run api:page -- <url>`,
      },
      502,
    );
  }
});

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  process.stdout.write(
    `the api, to browse and to try against ${target}: http://127.0.0.1:${info.port}${REFERENCE_PATH}  (Ctrl-C stops it)\n`,
  );
});
