/**
 * The one surface as a page to browse and to try, with no daemon of its own and no store: the api's own reference (`referenceOf`,
 * Scalar's) over its own document (`openapiDocument`, which names each operation by its id, the api's verb, and says under its own words
 * the command and the MCP tool that call it), served alone on
 * this machine's loopback under a title of its own, its request client on. The document names one server, an address a person sets on
 * the page — the api the page was started against until they give another — and says the api takes a bearer token: a request tried on
 * the page is sent to the page with the address it is for (`REFERENCE_PROXY_PATH`), and `bin/page.ts`, which alone touches the machine,
 * forwards it, so the browser crosses no origin and the token typed goes only where the address says. `npm run api:page` serves it.
 */
import { Hono } from 'hono';
import { OPENAPI_PATH, openapiDocument } from './openapi.ts';
import { REFERENCE_PATH, TOKEN_SCHEME, referenceOf } from './reference.ts';

/** What a page is started with: the api its requests are sent to until a person gives another address on the page. */
export type Browsed = { readonly target: string };

/**
 * The document with the page's own title and what it is, its one server and the token the api takes, over the wording every reader of
 * it gets (`openapiDocument`).
 * @param browsed The api the page starts on.
 */
function titled(browsed: Browsed) {
  const document = openapiDocument() as {
    info: { title?: string; description?: string };
    servers?: unknown;
    security?: unknown;
    components?: { securitySchemes?: unknown };
  };
  document.info.title = 'Nemia: one surface';
  document.info.description = [
    'Every store verb of Nemia is one entry of one table: a `nemia` command, a tool of the MCP port, and the endpoint of this api',
    'that serves both. Each operation here is named by its id, `<group>.<endpoint>`, and says what it does; under it, *CLI and MCP*',
    'names the command and the tool that call it and who answers for it when an agent calls it, or says that none does: a client',
    'reads that endpoint directly — the board, a sub-resource, a stream.',
    '',
    '**Try it.** A request sent from this page goes to the address under Server, through the page: set it to the api you mean, a',
    "server's or this machine's. Give it a token under Authentication (`nemia token add <name>` mints one on that store): it is",
    'sent with every request after it, and kept by this browser for this page until you clear it. A write acts on that store as any',
    'client does.',
    '',
    'In a terminal: `npm run api`.',
  ].join('\n');
  document.servers = [
    {
      url: '{api}',
      description: 'The api a request is sent to, through this page.',
      variables: { api: { default: browsed.target, description: 'Its address, as http://127.0.0.1:8787 or https://nemia.example.' } },
    },
  ];
  document.components = { ...document.components, securitySchemes: { [TOKEN_SCHEME]: { type: 'http', scheme: 'bearer' } } };
  document.security = [{ [TOKEN_SCHEME]: [] }];
  return document;
}

/**
 * The page's app: the worded document at the document's path, the reference page with its request client and its script beside it, and
 * the root sent to the page. It holds no store: what a request tried on the page reaches is `bin/page.ts`'s to forward.
 * @param script Gives the text of the viewer's script, read where the machine is touched.
 * @param browsed The api the page starts on.
 */
export const browseApp = (script: () => Promise<string>, browsed: Browsed) => {
  const document = titled(browsed);
  return new Hono()
    .get(OPENAPI_PATH, (c) => c.json(document))
    .route('/', referenceOf(script, true))
    .get('/', (c) => c.redirect(REFERENCE_PATH));
};
