/**
 * `npm run api:page`: the one surface as a page to browse (`browseApp`, src/openapi/browse.ts), served alone on this machine's loopback
 * with no daemon, no store and no token. Prints the address and serves until it is stopped. The port is 8790, beside the daemon's and
 * the viewer's and neither, or `PORT`. The one file of the page that touches the machine: it reads the viewer's bundle from the
 * installed package and listens.
 */
import fs from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { browseApp } from '../src/openapi/browse.ts';
import { REFERENCE_BUNDLE, REFERENCE_PATH } from '../src/openapi/reference.ts';

const PAGE_PORT = 8790;

let bundle: Promise<string> | undefined;
const app = browseApp(() => (bundle ??= fs.readFile(REFERENCE_BUNDLE, 'utf8')));
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? PAGE_PORT), hostname: '127.0.0.1' }, (info) => {
  process.stdout.write(`the api, to browse: http://127.0.0.1:${info.port}${REFERENCE_PATH}  (Ctrl-C stops it)\n`);
});
