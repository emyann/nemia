/**
 * The one surface as a page to browse and to try, with no daemon of its own and no store: the api's own reference (`referenceOf`,
 * Scalar's) over its own document (`openapiDocument`, which names each operation a command links by its `nemia` line), served alone on
 * this machine's loopback under a title of its own, its request client on. The document names one server, the page itself, and says the
 * api takes a bearer token: a request tried on the page is sent to the page, which forwards it to the api a person named when they
 * started it (`bin/page.ts`, which alone touches the machine), so the browser crosses no origin and the token typed on the page goes
 * nowhere else. `npm run api:page` serves it.
 */
import { Hono } from 'hono';
import { OPENAPI_PATH, openapiDocument } from './openapi.ts';
import { REFERENCE_PATH, referenceOf } from './reference.ts';

/** What a page is started with: its own address, which the document names as its one server, and the api its requests are sent on to. */
export type Browsed = { readonly page: string; readonly target: string };

/**
 * The document with the page's own title and what it is, its one server and the token the api takes, over the wording every reader of
 * it gets (`openapiDocument`).
 * @param browsed The page's address and the api behind it.
 */
function titled(browsed: Browsed): unknown {
  const document = openapiDocument() as {
    info: { title?: string; description?: string };
    servers?: unknown;
    security?: unknown;
    components?: { securitySchemes?: unknown };
  };
  document.info.title = 'Nemia: one surface';
  document.info.description = [
    'Every store verb of Nemia is one entry of one table: a `nemia` command, a tool of the MCP port, and the endpoint of this api',
    'that serves both. An operation named `nemia …` here is that command, with its tool and who answers for it when an agent calls',
    'it under its name; one named `<group>.<endpoint>` is read by a client directly — the board, a sub-resource, a stream.',
    '',
    `**Try it.** A request sent from this page goes to \`${browsed.target}\`, through the page. Give it a token under Authentication`,
    '(`nemia token add <name>` mints one on that store); the page keeps none. A write acts on that store as any client does.',
    '',
    'In a terminal: `npm run api`.',
  ].join('\n');
  document.servers = [{ url: browsed.page, description: `through this page to ${browsed.target}` }];
  document.components = { ...document.components, securitySchemes: { token: { type: 'http', scheme: 'bearer' } } };
  document.security = [{ token: [] }];
  return document;
}

/**
 * The page's app: the worded document at the document's path, the reference page with its request client and its script beside it, and
 * the root sent to the page. It holds no store: what a request tried on the page reaches is `bin/page.ts`'s to forward.
 * @param script Gives the text of the viewer's script, read where the machine is touched.
 * @param browsed The page's address and the api behind it.
 */
export const browseApp = (script: () => Promise<string>, browsed: Browsed) => {
  const document = titled(browsed);
  return new Hono()
    .get(OPENAPI_PATH, (c) => c.json(document))
    .route('/', referenceOf(script, true))
    .get('/', (c) => c.redirect(REFERENCE_PATH));
};
