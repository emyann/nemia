/**
 * The one surface as a page to browse, with no daemon, no store and no token: the api's own reference (`referenceOf`, Scalar's) over
 * its own document (`openapiDocument`), served alone on this machine's loopback, each operation a command links named by it — its
 * `nemia` line as the summary, and under it its tool on the MCP port, who answers for it when an agent calls it, and its help.
 * `npm run api:page` serves it (`bin/page.ts`, which alone touches the machine). It reads no store and takes no request but its three
 * reads, so it asks for no token: there is nothing behind it to guard.
 */
import { toolsOf } from 'agent-orchestrator';
import { Hono } from 'hono';
import { COMMAND_WORDS } from 'objects';
import { OPENAPI_PATH, openapiDocument } from './openapi.ts';
import { REFERENCE_PATH, referenceOf } from './reference.ts';

/** An operation of the document, as far as the page words it. */
type Operation = { operationId?: string; summary?: string; description?: string };

/** What a command says of an operation it links: its line, and what stands under it. */
type Said = { readonly summary: string; readonly description: string };

/** Who answers for a command when an agent calls it, in words. */
const AGENT: Readonly<Record<string, string>> = {
  read: 'an agent reads it',
  act: 'an agent acts',
  ask: 'the person is asked',
  answer: 'the person answers what waits on them',
  none: 'out of an agent’s reach',
};

/** What each linked endpoint is said as, by its id: its command's line, then its tool, its class and the command's help. */
const saidByEndpoint = (): Map<string, Said> =>
  new Map(
    COMMAND_WORDS.flatMap((words) =>
      toolsOf(words).map((tool) => {
        const line = `nemia ${words.name}`;
        const answers =
          typeof words.class === 'string' ? (AGENT[words.class] ?? words.class) : 'an agent reads it, and the person is asked to set';
        const said: Said = {
          summary: tool.tool === words.name.replaceAll(' ', '_') ? line : `${line} (${tool.tool})`,
          description: [
            `**Command** \`${`${line} ${words.usage}`.trim()}\``,
            `**MCP tool** \`${tool.tool}\` · **When an agent calls it** ${answers}`,
            words.help.join('\n'),
          ].join('\n\n'),
        };
        return [tool.endpoint, said] as const;
      }),
    ),
  );

/** The document with each operation a command links said by it; one no command links keeps its id as its line. */
function worded(): unknown {
  const document = openapiDocument() as {
    info: { title?: string; description?: string };
    paths: Record<string, Record<string, Operation>>;
  };
  const said = saidByEndpoint();
  document.info.title = 'Nemia: one surface';
  document.info.description = [
    'Every store verb of Nemia is one entry of one table: a `nemia` command, a tool of the MCP port, and the endpoint of this api',
    'that serves both. An operation named `nemia …` here is that command, with its tool and who answers for it when an agent calls',
    'it under its name; one named `<group>.<endpoint>` is read by a client directly — the board, a sub-resource, a stream.',
    '',
    'In a terminal: `npm run api`.',
  ].join('\n');
  for (const item of Object.values(document.paths))
    for (const op of Object.values(item)) {
      if (typeof op !== 'object' || op.operationId === undefined) continue;
      const by = said.get(op.operationId);
      op.summary = by?.summary ?? op.operationId;
      if (by) op.description = by.description;
    }
  return document;
}

/**
 * The page's app: the worded document at the document's path, the reference page and its script beside it (`script` gives the
 * viewer's text), and the root sent to the page. It holds no store and guards nothing: there is nothing behind it but the document.
 */
export const browseApp = (script: () => Promise<string>) => {
  const document = worded();
  return new Hono()
    .get(OPENAPI_PATH, (c) => c.json(document))
    .route('/', referenceOf(script))
    .get('/', (c) => c.redirect(REFERENCE_PATH));
};
