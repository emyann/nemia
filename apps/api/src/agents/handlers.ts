/**
 * The agents group's handlers (`objects`' `Api`): a namespace's agents as objects — the repository's and yours (`agents`, the table's
 * entry), and, in a factory made from a template, its tree's (`<tree>/workflows/agents`, origin `factory`) — each with the steps that name
 * it, the hires that fill a step with it and the factories that do (`inFactory`), and the ledger's number for what its file holds now.
 *
 * Writes are yours, in `default` alone (`writeGoes`): made, written at the `metadata.resourceVersion` it was read at (a `metadata.name`
 * other than the path's renames it) and removed at the `?resourceVersion=` it was read at, through `agents write` and `agents rm`; a
 * removal of one a step still names is the package's `Conflict`, with its `users`. A try (`agents run`) starts a run of one of yours; the
 * repository's is refused with the copy that makes it yours. Its card is `agents card`'s.
 *
 * Beside the objects, each through its entry of the package's, called by type: where agent files are looked for (`sources`, `nemia agents
 * sources`), in no namespace; one copied into yours (`copy`, `nemia agents copy`), in `default` alone; and a person's custom instructions
 * for an agent (`instructions`, `nemia agents custom`), one record per agent's name, told to whichever agent of that name a run finds:
 * read in any namespace — a file there that does not read answered with why, beside no words — and written and cleared in `default`
 * alone. A run reads them once, at its start, so a write or a clear reaches only the runs started after it. A name in a path is refused
 * (400) before a file is read, so none reaches outside the folder; a name no place has is a 404.
 */
import path from 'node:path';
import { Effect } from 'effect';
import {
  agentTable,
  AGENT_CARD,
  AGENTS,
  AGENTS_COPY,
  AGENTS_CUSTOM,
  AGENTS_REMOVE,
  AGENTS_SOURCES,
  AGENTS_TRY,
  agentRead,
  customInstructionsFile,
  definitionRevision,
  factoriesFilling,
  inFactory,
  listedAtOnce,
  stepsFilled,
  untriedOf,
  type AgentReading,
} from 'agent-orchestrator';
import { AGENTS_FOLDER, agentDraftOf as agentFileDraft, agentNameRefusal, WorkflowError } from 'agent-orchestrator/workflow';
import {
  type Agent,
  type AgentInstructions,
  type AgentDrafted,
  type AgentInstructionsCleared,
  type AgentSpec,
  Api,
  API_VERSION,
  BadRequest,
  type DefinitionFiles,
  Invalid,
} from 'objects';
import type { Served } from '../layer.ts';
import { repoLayer } from '../factory/place.ts';
import { agentDraftOf, listingOf, saved, type AgentDraftBody, type LibraryAgent } from './agents.ts';
import { queryOf } from '../factory/parts/index.ts';
import { answered, answeredIn, answeredWriteIn } from '../objects/refused.ts';
import { wantsTable } from '../objects/table.ts';
import { markdownNamesIn } from '../workflows/builder.ts';
import { listed, originIn, servedNamed, servedOf, thereOf, writeGoes, writtenAt, type Held, type Origin } from '../definitions/served.ts';
import { readsBounded } from '../objects/answer-bound.ts';

/** The agents of the factory's tree, read as the repository's are, then told apart by their origin. */
const treeAgents = (s: Served) =>
  Effect.gen(function* () {
    const tree = s.factory?.tree;
    if (tree === undefined) return [];
    const dir = path.join(tree, 'workflows', AGENTS_FOLDER);
    const read: AgentReading[] = [];
    for (const name of markdownNamesIn(dir)) {
      const one = yield* agentRead('repo', dir, name, { repo: repoLayer(s), home: s.home });
      if (one) read.push(one);
    }
    return read;
  });

/** What the namespace's agents are told apart by: the steps each file fills (`stepsFilled`) and the factories that fill one with it. */
const fillsIn = (s: Served) => ({
  filled: stepsFilled(repoLayer(s), s.home, s.factory),
  byFile: factoriesFilling(listedAtOnce(s.home), s.home),
});

/**
 * The agents of the factory's tree (`<tree>/workflows/agents`), each held at `origin` — `factory` in a namespace, `builtin` for a
 * template's render — read now with its users and fills, whether or not a step names it, since they are the factory's own; none where the
 * factory has no tree. The one reader of a tree's agents.
 */
export async function treeAgentsHeld(s: Served, origin: Origin, fills = fillsIn(s)): Promise<Held<LibraryAgent>[]> {
  const tree = await s.inRequest(treeAgents(s));
  const listings = await s.inRequest(Effect.forEach(tree, (one) => listingOf(one, repoLayer(s), s.home, s.factory?.tree)));
  return inFactory(listings, fills.filled, fills.byFile).map((item) => ({ name: item.name, origin, item }));
}

/**
 * Every agent the namespace holds, at each origin, read now with its users and fills: the factory's tree's (`treeAgentsHeld`); every
 * other only where it fills a step there (`inFactory`).
 */
async function heldIn(s: Served): Promise<Held<LibraryAgent>[]> {
  const repo = repoLayer(s);
  const { agents } = await s.inRequest(AGENTS.handler({ repo }));
  const fills = fillsIn(s);
  const own = await treeAgentsHeld(s, 'factory', fills);
  const trees = new Set(own.map(({ item }) => item.file));
  const listings = await s.inRequest(
    Effect.forEach(
      agents.filter((one) => !trees.has(one.file)),
      (one) => listingOf(one, repo, s.home),
    ),
  );
  const elsewhere = inFactory(listings, fills.filled, fills.byFile, s.factory);
  return [...own, ...elsewhere.map((item) => ({ name: item.name, origin: item.from, item }))];
}

/** The object of one agent served, its revision read through the ledger; with neither namespace nor revision for a template's. */
const agentObject = (
  namespace: string | undefined,
  origin: Origin,
  shadowedBy: Origin | null,
  a: LibraryAgent,
  revision: number | undefined,
): Agent => ({
  apiVersion: API_VERSION,
  kind: 'Agent',
  metadata: {
    name: a.name,
    ...(namespace !== undefined && { namespace }),
    creationTimestamp: writtenAt(a.file),
    resourceVersion: a.version,
  },
  spec: {
    role: a.role,
    description: a.description,
    keys: a.keys,
    skills: a.skills,
    harnessPrompt: a.harnessPrompt,
    mcp: a.mcp,
    output: a.schema,
    instructions: a.body,
  },
  status: {
    origin,
    ...(shadowedBy !== null && { shadowedBy }),
    ...(revision !== undefined && { revision }),
    dir: a.dir,
    file: a.file,
    source: a.source,
    usedBy: a.usedBy,
    fills: a.fills,
    factories: a.factories,
    given: a.given,
    copied: a.copied,
    untried: a.untried,
    card: a.card,
    cardError: a.cardError,
    error: a.error,
  },
});

/**
 * The objects of the agents `served`: in `namespace`, with the ledger's revision, where one is given; with neither where none is (a
 * template's documents, which the ledger does not count).
 */
export const agentObjectsOf = (s: Served, served: ReturnType<typeof servedOf<LibraryAgent>>, namespace?: string): Promise<Agent[]> =>
  s.inRequest(
    Effect.forEach(served, ({ origin, shadowedBy, item }) =>
      namespace === undefined
        ? Effect.succeed(agentObject(undefined, origin, shadowedBy, item, undefined))
        : Effect.map(definitionRevision('agent', item.name, item.version), (revision) =>
            agentObject(namespace, origin, shadowedBy, item, revision),
          ),
    ),
  );

const listPath = (namespace: string) => `GET /api/namespaces/${namespace}/agents`;

/** The agent `name` the namespace serves (from `asked`, where one is), read now. */
async function agentAt(s: Served, namespace: string, name: string, asked?: Origin): Promise<Agent> {
  const [one] = await agentObjectsOf(s, [servedNamed(await heldIn(s), name, asked, listPath(namespace))], namespace);
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one;
}

/** A write's spec as the draft the package writes: `instructions` its body, `output` its schema. */
const draftBodyOf = ({ output, instructions, ...lines }: AgentSpec): AgentDraftBody => ({
  ...lines,
  ...(instructions !== undefined && { body: instructions }),
  ...(output !== undefined && { schema: output }),
});

/** `name` as an agent's, or `Invalid` in the package's words. */
const named = (route: string, name: string | undefined): string => {
  if (name === undefined) throw new Invalid({ error: `${route} takes the agent's name, as \`metadata.name\`.` });
  const wrong = agentNameRefusal(name);
  if (wrong !== undefined) throw new Invalid({ error: `${route}: ${wrong}` });
  return name;
};

/** The `resourceVersion` a write carries, or `Invalid` saying why it must. */
const versioned = (route: string, version: string | undefined): string => {
  if (version === undefined)
    throw new Invalid({
      error: `${route} takes the resourceVersion the Agent was read at, so an agent changed since is not written over.`,
    });
  return version;
};

/** Where an agent's custom instructions are, as a refusal names it. */
const instructionsPath = (namespace: string, name: string) => `/api/namespaces/${namespace}/agents/${name}/instructions`;

/** `name` as an agent's, or a 400 (`BadRequest`) in the package's words, before any file is read. */
const agentNamed = (route: string, name: string): string => {
  const wrong = agentNameRefusal(name);
  if (wrong !== undefined) throw new BadRequest({ error: `${route}: ${wrong}` });
  return name;
};

/** What `nemia agents custom` answers when it is asked for words: the words read or written, never a clear's. */
const wordsOf = (answer: AgentInstructions | AgentInstructionsCleared): AgentInstructions => {
  if ('removed' in answer) throw new Error(`nemia agents custom answered a clear of ${answer.name} where its words were asked.`);
  return answer;
};

/** What `nemia agents custom` answers when it is asked to clear: the clear, never words. */
const clearedOf = (answer: AgentInstructions | AgentInstructionsCleared): AgentInstructionsCleared => {
  if (!('removed' in answer)) throw new Error(`nemia agents custom answered the words of ${answer.name} where a clear was asked.`);
  return answer;
};

/**
 * The custom instructions for the agent `name`, read through `nemia agents custom`'s entry on the request's repository: a file there the
 * package refuses — a link, a frontmatter block, not a file — answered with its words in `error`, beside no words, since it stops every
 * run naming the agent until it is cleared or written again; a name no place has is the package's `Missing`.
 */
async function instructionsRead(s: Served, name: string): Promise<AgentInstructions> {
  try {
    return wordsOf(await s.inRequest(AGENTS_CUSTOM.handler({ name, repo: s.repo })));
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return { name, file: customInstructionsFile(s.home, name), words: null, error: err.message };
  }
}

const A2A_WHY = (name: string) =>
  `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.`;

/** The agent `name` tried on `brief` (`nemia agents run`'s entry): one of yours alone, any other refused with how to copy it. */
async function triedIn(s: Served, namespace: string, name: string, brief: string | undefined): Promise<{ id: string }> {
  const route = `POST /api/namespaces/${namespace}/agents/${name}/try`;
  const held = await heldIn(s);
  const there = thereOf(held, name);
  writeGoes(namespace, 'act', there);
  if (there !== 'yours') {
    const agent = servedNamed(held, name, undefined, listPath(namespace)).item;
    const untried = agent.untried ?? untriedOf({ from: 'repo', name, file: agent.file, keys: {}, schemaFile: null }, s.home);
    throw new Invalid({
      error: `${route}: ${untried?.why ?? 'only an agent of yours is tried.'}${untried?.copy ? ` \`${untried.copy}\`` : ''}`,
    });
  }
  const { id } = await s.inRequest(AGENTS_TRY.handler({ from: 'yours', name, brief, repo: s.repo }));
  return { id };
}

/** The A2A card of the agent `name` from `origin` (`nemia agents card`'s entry), beside why nothing serves it over A2A. */
async function cardIn(s: Served, namespace: string, name: string, origin: string | undefined) {
  const served = servedNamed(await heldIn(s), name, originIn(s, origin), listPath(namespace));
  if (served.item.error !== null) throw new Invalid({ error: served.item.error });
  if (served.origin === 'factory')
    throw new Invalid({
      error: `${name} is the factory's own agent, whose card is not drawn here: its skills are \`status.card\` of GET /api/namespaces/${namespace}/agents/${name}?origin=factory.`,
    });
  const from = served.origin === 'yours' ? 'yours' : 'repo';
  const { card } = await s.inRequest(AGENT_CARD.handler({ name, repo: s.repo, from }));
  return { card, servedOverA2A: false as const, why: A2A_WHY(name) };
}

const READ_ROUTE = 'POST /api/agents/read';

/**
 * An agent's files read into its spec, as a GET of the same files written to yours answers it, writing nothing: the first file the
 * agent's, read by the package's reader (`agentDraftOf`), named `name`, else by its file without `.md`; the schema its `output:` names
 * read from the files sent beside it. Refused `Invalid`, naming the file, for a file that does not read and for a schema named and not
 * sent.
 */
export function agentReadOf({ name, files }: DefinitionFiles): AgentDrafted {
  const [file, ...beside] = files;
  if (file === undefined)
    throw new Invalid({ error: `${READ_ROUTE} reads an agent's file: send it first in \`files\`, then the schema its output: names.` });
  const agent = name ?? path.basename(file.path, '.md');
  const wrong = agentNameRefusal(agent);
  if (wrong !== undefined) throw new Invalid({ error: `${READ_ROUTE}: ${wrong}` });
  const sent = (named: string) => beside.find((f) => f.path === named)?.text;
  let draft: ReturnType<typeof agentFileDraft>;
  try {
    draft = agentFileDraft(agent, file.text, sent);
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    throw new Invalid({ error: `${READ_ROUTE}: ${file.path} does not read: ${err.message}` });
  }
  const named = draft.keys.output ?? null;
  const text = named === null ? undefined : sent(named);
  if (named !== null && text === undefined)
    throw new Invalid({
      error: `${READ_ROUTE}: ${file.path} names ${named} as its output:, which was not sent: send ${named} beside it in \`files\`.`,
    });
  const { role, description, keys, skills, harnessPrompt, mcp, body } = draft;
  const output = named === null || text === undefined ? null : { file: named, text };
  return { metadata: { name: agent }, spec: { role, description, keys, skills, harnessPrompt, mcp, output, instructions: body } };
}

export const agentsHandlers = readsBounded(Api, 'agents', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answeredWriteIn(namespace, async (s) => {
          const { origin, ...page } = query;
          const list = listed('Agent', await agentObjectsOf(s, servedOf(await heldIn(s), originIn(s, origin)), namespace), queryOf(page));
          return table ? agentTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { namespace, name }, query }) =>
      answeredWriteIn(namespace, (s) => agentAt(s, namespace, name, originIn(s, query.origin))),
    )
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredWriteIn(namespace, async (s) => {
        const route = `POST /api/namespaces/${namespace}/agents`;
        const name = named(route, payload.metadata.name);
        writeGoes(namespace, 'create', thereOf(await heldIn(s), name));
        await saved(s, agentDraftOf(draftBodyOf(payload.spec), name));
        return agentAt(s, namespace, name, 'yours');
      }),
    )
    .handle('replace', ({ params: { namespace, name }, payload }) =>
      answeredWriteIn(namespace, async (s) => {
        const route = `PUT /api/namespaces/${namespace}/agents/${name}`;
        writeGoes(namespace, 'replace', thereOf(await heldIn(s), name));
        const version = versioned(route, payload.metadata.resourceVersion);
        const to = payload.metadata.name === undefined ? name : named(route, payload.metadata.name);
        const given = agentDraftOf(draftBodyOf(payload.spec), to);
        await saved(s, { ...given, version, name });
        return agentAt(s, namespace, to, 'yours');
      }),
    )
    .handle('delete', ({ params: { namespace, name }, query }) =>
      answeredWriteIn(namespace, async (s) => {
        const route = `DELETE /api/namespaces/${namespace}/agents/${name}`;
        writeGoes(namespace, 'remove', thereOf(await heldIn(s), name));
        const version = versioned(route, query.resourceVersion);
        const before = await agentAt(s, namespace, name, 'yours');
        await s.inRequest(AGENTS_REMOVE.handler({ from: 'yours', name, version, repo: s.repo }));
        return before;
      }),
    )
    .handle('try', ({ params: { namespace, name }, payload }) =>
      answeredWriteIn(namespace, (s) => triedIn(s, namespace, name, payload.brief)),
    )
    .handle('card', ({ params: { namespace, name }, query }) => answeredWriteIn(namespace, (s) => cardIn(s, namespace, name, query.origin)))
    .handle('read', ({ payload }) => answered(async () => agentReadOf(payload)))
    .handle('sources', ({ query }) => answered((s) => s.inRequest(AGENTS_SOURCES.handler(query))))
    .handle('copy', ({ params: { namespace }, payload }) =>
      answeredWriteIn(namespace, (s) => {
        writeGoes(namespace, 'act', 'yours');
        return s.inRequest(AGENTS_COPY.handler(payload));
      }),
    )
    .handle('instructions', ({ params: { namespace, name } }) =>
      answeredIn(namespace, (s) => instructionsRead(s, agentNamed(`GET ${instructionsPath(namespace, name)}`, name))),
    )
    .handle('putInstructions', ({ params: { namespace, name }, payload: { words } }) =>
      answeredWriteIn(namespace, async (s) => {
        writeGoes(namespace, 'act', 'yours');
        const agent = agentNamed(`PUT ${instructionsPath(namespace, name)}`, name);
        return wordsOf(await s.inRequest(AGENTS_CUSTOM.handler({ name: agent, repo: s.repo, words })));
      }),
    )
    .handle('deleteInstructions', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, async (s) => {
        writeGoes(namespace, 'act', 'yours');
        const agent = agentNamed(`DELETE ${instructionsPath(namespace, name)}`, name);
        return clearedOf(await s.inRequest(AGENTS_CUSTOM.handler({ name: agent, repo: s.repo, clear: true })));
      }),
    ),
);
