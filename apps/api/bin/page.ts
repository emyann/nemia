/**
 * `npm run api:page [-- <url>]`: the one surface as a page to browse and to try (`browseApp`, src/openapi/browse.ts), served alone on
 * this machine's loopback. A request tried on the page is sent here with the address it is for, set on the page under Server — the api
 * at `<url>` to begin with, a server's or this machine's daemon where none is given — and forwarded with the token typed on the page and
 * nothing else of the browser's; each one is said on a line with its status, its time and its size, which is how an endpoint's cost is
 * read. Only the page itself may ask: a request another site's page sends here is refused, so the page is no way for a site to reach
 * this machine's network. Prints the page's address and serves until it is stopped. The port is 8790, beside the daemon's and the
 * viewer's and neither, or `PORT`. The one file of the page that touches the machine: it reads the viewer's bundle from the installed
 * package, listens, and forwards.
 */
import fs from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { browseApp } from '../src/openapi/browse.ts';
import { REFERENCE_BUNDLE, REFERENCE_PATH, REFERENCE_PROXY_PATH } from '../src/openapi/reference.ts';

const PAGE_PORT = 8790;

/** This machine's daemon, where no api is named. */
const DAEMON = 'http://127.0.0.1:8787';

/** The headers of a request tried on the page that are sent on: the token, and what says the body and the answer wanted. */
const SENT_ON = ['authorization', 'content-type', 'accept'];

/** An address as the page takes one: http or https, a host, and no path. */
const ADDRESS = /^https?:\/\/[^/]+\/?$/;

const given = process.argv[2];
if (given !== undefined && !ADDRESS.test(given)) {
  process.stderr.write(
    `api:page takes the address of an api, as https://nemia.example or ${DAEMON}, and was given ${given}: npm run api:page -- <url>\n`,
  );
  process.exit(2);
}
const target = (given ?? DAEMON).replace(/\/$/, '');
const port = Number(process.env.PORT ?? PAGE_PORT);
const page = `http://127.0.0.1:${port}`;

let bundle: Promise<string> | undefined;
const app = browseApp(() => (bundle ??= fs.readFile(REFERENCE_BUNDLE, 'utf8')), { target });

app.all(REFERENCE_PROXY_PATH, async (c) => {
  const site = c.req.header('sec-fetch-site');
  const origin = c.req.header('origin');
  if ((site !== undefined && site !== 'same-origin') || (origin !== undefined && origin !== page))
    return c.json({ message: `only the page at ${page} sends a request through it: open ${page}${REFERENCE_PATH} and try it there.` }, 403);
  const asked = c.req.query('scalar_url') ?? '';
  const to = URL.canParse(asked) ? new URL(asked) : undefined;
  if (to === undefined || (to.protocol !== 'http:' && to.protocol !== 'https:'))
    return c.json(
      {
        message: `a request is sent to an http or https address, and this one names ${asked || 'none'}: set the api's address under Server.`,
      },
      400,
    );
  const started = performance.now();
  const headers = new Headers(SENT_ON.flatMap((name) => (c.req.header(name) === undefined ? [] : [[name, c.req.header(name) ?? '']])));
  const body = c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer();
  const line = (status: number | string, bytes: number) => {
    process.stdout.write(`${c.req.method} ${to.href}  ${status}  ${Math.round(performance.now() - started)} ms  ${bytes} B\n`);
  };
  try {
    const answered = await fetch(to, { method: c.req.method, headers, body });
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
        message: `no api answered at ${to.origin}: ${cause instanceof Error ? cause.message : String(cause)}. Start it, or set another address under Server.`,
      },
      502,
    );
  }
});

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  process.stdout.write(
    `the api, to browse and to try, starting on ${target}: http://127.0.0.1:${info.port}${REFERENCE_PATH}  (Ctrl-C stops it)\n`,
  );
});
