/**
 * The one surface as a page to browse, with no daemon, no store and no token: the api's own reference (`referenceOf`, Scalar's) over
 * its own document (`openapiDocument`, which names each operation a command links by its `nemia` line), served alone on this machine's
 * loopback under a title of its own.
 * `npm run api:page` serves it (`bin/page.ts`, which alone touches the machine). It reads no store and takes no request but its three
 * reads, so it asks for no token: there is nothing behind it to guard.
 */
import { Hono } from 'hono';
import { OPENAPI_PATH, openapiDocument } from './openapi.ts';
import { REFERENCE_PATH, referenceOf } from './reference.ts';

/** The document with the page's own title and what it is, over the wording every reader of it gets (`openapiDocument`). */
function titled(): unknown {
  const document = openapiDocument() as { info: { title?: string; description?: string } };
  document.info.title = 'Nemia: one surface';
  document.info.description = [
    'Every store verb of Nemia is one entry of one table: a `nemia` command, a tool of the MCP port, and the endpoint of this api',
    'that serves both. An operation named `nemia …` here is that command, with its tool and who answers for it when an agent calls',
    'it under its name; one named `<group>.<endpoint>` is read by a client directly — the board, a sub-resource, a stream.',
    '',
    'In a terminal: `npm run api`.',
  ].join('\n');
  return document;
}

/**
 * The page's app: the worded document at the document's path, the reference page and its script beside it, and the root sent to the
 * page. It holds no store and guards nothing: there is nothing behind it but the document.
 * @param script Gives the text of the viewer's script, read where the machine is touched.
 */
export const browseApp = (script: () => Promise<string>) => {
  const document = titled();
  return new Hono()
    .get(OPENAPI_PATH, (c) => c.json(document))
    .route('/', referenceOf(script))
    .get('/', (c) => c.redirect(REFERENCE_PATH));
};
