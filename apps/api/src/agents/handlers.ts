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
  libraryUsers,
  AGENTS_REMOVE,
  AGENTS_SOURCES,
  AGENTS_TRY,
  agentRead,
  customInstructionsFile,
  customOf,
  definitionRevision,
  factoriesFilling,
  inFactory,
  listedAt,
  stepsFilled,
  untriedOf,
  type AgentReading,
} from 'agent-orchestrator';
import { AGENTS_FOLDER, agentDraftOf as agentFileDraft, agentNameRefusal, WorkflowError } from 'agent-orchestrator/workflow';
import {
  type Agent,
  type AgentInstructions,
  type AgentInstructionsCleared,
  type AgentSpec,
  Api,
  API_VERSION,
  BadRequest,
  type DefinitionFiles,
  Invalid,
  type AgentWrite,
} from 'objects';
import type { Served } from '../layer.ts';
import { repoLayer } from '../factory/place.ts';
import { agentDraftOf, listingOf, saved, type LibraryAgent } from './agents.ts';
import { queryOf } from '../factory/parts/index.ts';
import { answered, answeredIn, answeredWriteIn } from '../objects/refused.ts';
import { wantsTable } from '../objects/table.ts';
import { markdownNamesIn } from '../workflows/builder.ts';
import {
  addsGated,
  listed,
  originIn,
  servedNamed,
  servedOf,
  thereOf,
  namespacedWriteRefused,
  writeGoes,
  writtenAt,
  type Held,
  type Origin,
} from '../definitions/served.ts';
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
const fillsIn = async (s: Served) => ({
  filled: stepsFilled(repoLayer(s), s.home, s.factory),
  byFile: factoriesFilling(await s.inRequest(listedAt(s.home)), s.home),
});

/**
 * The agents of the factory's tree (`<tree>/workflows/agents`), each held at `origin` — `factory` in a namespace, `builtin` for a
 * template's render — read now with its users and fills, whether or not a step names it, since they are the factory's own; none where the
 * factory has no tree. The one reader of a tree's agents.
 * @param s The request's services, its caller and the place it is answered in.
 * @param origin The origin each agent is held at.
 * @param given What fills each agent's lines, read from the request's services where none is given.
 */
export async function treeAgentsHeld(s: Served, origin: Origin, given?: Awaited<ReturnType<typeof fillsIn>>) {
  const fills = given ?? (await fillsIn(s));
  const tree = await s.inRequest(treeAgents(s));
  const listings = await s.inRequest(Effect.forEach(tree, (one) => listingOf(one, repoLayer(s), s.home, s.factory?.tree)));
  return inFactory(listings, fills.filled, fills.byFile).map((item) => ({ name: item.name, origin, item })) satisfies Held<LibraryAgent>[];
}

/**
 * Every agent the namespace holds, at each origin, read now with its users and fills: the factory's tree's (`treeAgentsHeld`); every
 * other only where it fills a step there (`inFactory`).
 */
async function heldIn(s: Served) {
  const repo = repoLayer(s);
  const { agents } = await s.inRequest(AGENTS.handler({ repo }));
  const fills = await fillsIn(s);
  const own = await treeAgentsHeld(s, 'factory', fills);
  const trees = new Set(own.map(({ item }) => item.file));
  const listings = await s.inRequest(
    Effect.forEach(
      agents.filter((one) => !trees.has(one.file)),
      (one) => listingOf(one, repo, s.home),
    ),
  );
  const elsewhere = inFactory(listings, fills.filled, fills.byFile, s.factory);
  return [...own, ...elsewhere.map((item) => ({ name: item.name, origin: item.from, item }))] satisfies Held<LibraryAgent>[];
}

/**
 * The object of one agent served, its revision read through the ledger, and the file of its custom instructions in the store `home`; with
 * neither namespace nor revision for a template's.
 */
const agentObject = (
  home: string,
  namespace: string | undefined,
  origin: Origin,
  shadowedBy: Origin | null,
  a: LibraryAgent,
  revision: number | undefined,
) =>
  ({
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
      custom: customOf(home, a.name),
    },
  }) satisfies Agent;

/**
 * The objects of the agents `served`: in `namespace`, with the ledger's revision, where one is given; with neither where none is (a
 * template's documents, which the ledger does not count).
 * @param s The request's services, its caller and the place it is answered in.
 * @param served The agents to answer, each with its origin and what shadows it.
 * @param namespace The namespace the objects are in, whose ledger gives each its revision; none for a template's documents.
 */
export const agentObjectsOf = (s: Served, served: ReturnType<typeof servedOf<LibraryAgent>>, namespace?: string) =>
  s.inRequest(
    Effect.forEach(served, ({ origin, shadowedBy, item }) =>
      namespace === undefined
        ? Effect.succeed(agentObject(s.home, undefined, origin, shadowedBy, item, undefined))
        : Effect.map(definitionRevision('agent', item.name, item.version), (revision) =>
            agentObject(s.home, namespace, origin, shadowedBy, item, revision),
          ),
    ),
  ) satisfies Promise<Agent[]>;

const listPath = (namespace: string) => `GET /api/namespaces/${namespace}/agents`;

/** The agent `name` the namespace serves (from `asked`, where one is), read now. */
async function agentAt(s: Served, namespace: string, name: string, asked?: Origin) {
  const [one] = await agentObjectsOf(
    s,
    [servedNamed(addsGated(s.home, namespace, 'agents', await heldIn(s)), name, asked, listPath(namespace))],
    namespace,
  );
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one satisfies Agent;
}

/** The namespace the library is read in: the default factory with no repository, whose agents are the person's and the builtins. */
const LIBRARY = 'default';

/** The library's list, as a refusal names it. */
const LIBRARY_PATH = 'GET /api/agents';

/** The agents the library holds: the person's and the builtins, at each origin. */
const libraryHeld = async (s: Served) => (await heldIn(s)).filter((h) => h.origin === 'user' || h.origin === 'builtin');

/** The library's objects of the agents `served`, in no namespace, each with the factories that add it. */
const libraryObjectsOf = async (s: Served, served: ReturnType<typeof servedOf<LibraryAgent>>) =>
  Promise.all(
    (await agentObjectsOf(s, served)).map(async (one) => ({
      ...one,
      status: { ...one.status, factories: await s.inRequest(libraryUsers(s.home, { kind: 'Agent', name: one.metadata.name })) },
    })),
  ) satisfies Promise<Agent[]>;

/** The library's agent `name` (from `asked`, where one is), read now. */
async function libraryAt(s: Served, name: string, asked?: Origin) {
  const [one] = await libraryObjectsOf(s, [servedNamed(await libraryHeld(s), name, asked, LIBRARY_PATH)]);
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one satisfies Agent as Agent;
}

/** A write's spec as the draft the package writes: `instructions` its body, `output` its schema. */
const draftBodyOf = ({ output, instructions, ...lines }: AgentSpec) => ({
  ...lines,
  ...(instructions !== undefined && { body: instructions }),
  ...(output !== undefined && { schema: output }),
});

/** `name` as an agent's, or `Invalid` in the package's words. */
const named = (route: string, name: string | undefined) => {
  if (name === undefined) throw new Invalid({ error: `${route} takes the agent's name, as \`metadata.name\`.` });
  const wrong = agentNameRefusal(name);
  if (wrong !== undefined) throw new Invalid({ error: `${route}: ${wrong}` });
  return name;
};

/** The `resourceVersion` a write carries, or `Invalid` saying why it must. */
const versioned = (route: string, version: string | undefined) => {
  if (version === undefined)
    throw new Invalid({
      error: `${route} takes the resourceVersion the Agent was read at, so an agent changed since is not written over.`,
    });
  return version;
};

/** Where an agent's custom instructions are, as a refusal names it. */
const instructionsPath = (namespace: string, name: string) => `/api/namespaces/${namespace}/agents/${name}/instructions`;

/** `name` as an agent's, or a 400 (`BadRequest`) in the package's words, before any file is read. */
const agentNamed = (route: string, name: string) => {
  const wrong = agentNameRefusal(name);
  if (wrong !== undefined) throw new BadRequest({ error: `${route}: ${wrong}` });
  return name;
};

/** What `nemia agents custom` answers when it is asked for words: the words read or written, never a clear's. */
const wordsOf = (answer: AgentInstructions | AgentInstructionsCleared) => {
  if ('removed' in answer) throw new Error(`nemia agents custom answered a clear of ${answer.name} where its words were asked.`);
  return answer;
};

/** What `nemia agents custom` answers when it is asked to clear: the clear, never words. */
const clearedOf = (answer: AgentInstructions | AgentInstructionsCleared) => {
  if (!('removed' in answer)) throw new Error(`nemia agents custom answered the words of ${answer.name} where a clear was asked.`);
  return answer;
};

/**
 * The custom instructions for the agent `name`, read through `nemia agents custom`'s entry on the request's repository: a file there the
 * package refuses — a link, a frontmatter block, not a file — answered with its words in `error`, beside no words, since it stops every
 * run naming the agent until it is cleared or written again; a name no place has is the package's `Missing`.
 */
async function instructionsRead(s: Served, name: string) {
  try {
    return wordsOf(await s.inRequest(AGENTS_CUSTOM.handler({ name, repo: s.repo })));
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return { name, file: customInstructionsFile(s.home, name), words: null, error: err.message };
  }
}

const A2A_WHY = (name: string) =>
  `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.`;

/** The agent `name` tried on `brief` (`nemia agents run`'s entry): one of the user library alone, any other refused with how to copy it. */
async function triedIn(s: Served, name: string, brief: string | undefined) {
  const route = `POST /api/agents/${name}/try`;
  const held = await libraryHeld(s);
  const there = thereOf(held, name);
  writeGoes('library', 'act', there);
  if (there !== 'user') {
    const agent = servedNamed(held, name, undefined, LIBRARY_PATH).item;
    const untried = agent.untried ?? untriedOf({ from: 'repo', name, file: agent.file, keys: {}, schemaFile: null }, s.home);
    throw new Invalid({
      error: `${route}: ${untried?.why ?? 'only an agent of the user library is tried.'}${untried?.copy ? ` \`${untried.copy}\`` : ''}`,
    });
  }
  const { id } = await s.inRequest(AGENTS_TRY.handler({ from: 'user', name, brief, repo: s.repo }));
  return { id };
}

/** The A2A card of the agent `name` from `origin` (`nemia agents card`'s entry), beside why nothing serves it over A2A. */
async function cardIn(s: Served, namespace: string, name: string, origin: string | undefined) {
  const served = servedNamed(addsGated(s.home, namespace, 'agents', await heldIn(s)), name, originIn(s, origin), listPath(namespace));
  if (served.item.error !== null) throw new Invalid({ error: served.item.error });
  if (served.origin === 'factory')
    throw new Invalid({
      error: `${name} is the factory's own agent, whose card is not drawn here: its skills are \`status.card\` of GET /api/namespaces/${namespace}/agents/${name}?origin=factory.`,
    });
  const from: 'user' | 'repo' = served.origin === 'user' ? 'user' : 'repo';
  const { card } = await s.inRequest(AGENT_CARD.handler({ name, repo: s.repo, from }));
  return { card, servedOverA2A: false as const, why: A2A_WHY(name), from };
}

const READ_ROUTE = 'POST /api/agents/read';

/**
 * An agent's files read into its spec, as a GET of the same files written to yours answers it, writing nothing: the first file the
 * agent's, read by the package's reader (`agentDraftOf`), named `name`, else by its file without `.md`; the schema its `output:` names
 * read from the files sent beside it. Refused `Invalid`, naming the file, for a file that does not read and for a schema named and not
 * sent.
 */
export function agentReadOf({ name, files }: DefinitionFiles) {
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

/** The agent `payload` names made in the user library, read back. */
async function libraryCreated(s: Served, payload: AgentWrite) {
  const name = named('POST /api/agents', payload.metadata.name);
  writeGoes('library', 'create', thereOf(await libraryHeld(s), name));
  await saved(s, agentDraftOf(draftBodyOf(payload.spec), name));
  return libraryAt(s, name, 'user');
}

/** The library's agent `name` written over from `payload`, read back. */
async function libraryReplaced(s: Served, name: string, payload: AgentWrite) {
  const route = `PUT /api/agents/${name}`;
  writeGoes('library', 'replace', thereOf(await libraryHeld(s), name));
  const version = versioned(route, payload.metadata.resourceVersion);
  const to = payload.metadata.name === undefined ? name : named(route, payload.metadata.name);
  const given = agentDraftOf(draftBodyOf(payload.spec), to);
  await saved(s, { ...given, version, name });
  return libraryAt(s, to, 'user');
}

export const agentsHandlers = readsBounded(Api, 'agents', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answeredWriteIn(namespace, async (s) => {
          const { origin, ...page } = query;
          const list = listed(
            'Agent',
            await agentObjectsOf(s, servedOf(addsGated(s.home, namespace, 'agents', await heldIn(s)), originIn(s, origin)), namespace),
            queryOf(page),
          );
          return table ? agentTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { namespace, name }, query }) =>
      answeredWriteIn(namespace, (s) => agentAt(s, namespace, name, originIn(s, query.origin))),
    )
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredWriteIn(namespace, async (s) => {
        namespacedWriteRefused(namespace, 'create', thereOf(await heldIn(s), payload.metadata.name ?? ''));
      }),
    )
    .handle('replace', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, async (s) => {
        namespacedWriteRefused(namespace, 'replace', thereOf(await heldIn(s), name));
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, async (s) => {
        namespacedWriteRefused(namespace, 'remove', thereOf(await heldIn(s), name));
      }),
    )
    .handle('listLibrary', ({ query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answeredWriteIn(LIBRARY, async (s) => {
          const { origin, ...page } = query;
          const list = listed('Agent', await libraryObjectsOf(s, servedOf(await libraryHeld(s), originIn(s, origin))), queryOf(page));
          return table ? agentTable(list) : list;
        }),
      ),
    )
    .handle('getLibrary', ({ params: { name }, query }) => answeredWriteIn(LIBRARY, (s) => libraryAt(s, name, originIn(s, query.origin))))
    .handle('createLibrary', ({ payload }) => answeredWriteIn(LIBRARY, (s) => libraryCreated(s, payload)))
    .handle('replaceLibrary', ({ params: { name }, payload }) => answeredWriteIn(LIBRARY, (s) => libraryReplaced(s, name, payload)))
    .handle('deleteLibrary', ({ params: { name }, query }) =>
      answeredWriteIn(LIBRARY, async (s) => {
        const route = `DELETE /api/agents/${name}`;
        const version = versioned(route, query.resourceVersion);
        writeGoes(
          'library',
          'remove',
          thereOf(await libraryHeld(s), name),
          await s.inRequest(libraryUsers(s.home, { kind: 'Agent', name })),
        );
        const before = await libraryAt(s, name, 'user');
        const { removed } = await s.inRequest(AGENTS_REMOVE.handler({ from: 'user', name, version, repo: query.repo }));
        return { ...before, status: { ...before.status, removed } };
      }),
    )
    .handle('tryLibrary', ({ params: { name }, payload }) => answeredWriteIn(LIBRARY, (s) => triedIn(s, name, payload.brief)))
    .handle('copyLibrary', ({ payload }) => answered((s) => s.inRequest(AGENTS_COPY.handler(payload))))
    .handle('card', ({ params: { namespace, name }, query }) => answeredWriteIn(namespace, (s) => cardIn(s, namespace, name, query.origin)))
    .handle('read', ({ payload }) => answered(async () => agentReadOf(payload)))
    .handle('sources', ({ query }) => answered((s) => s.inRequest(AGENTS_SOURCES.handler(query))))
    .handle('instructions', ({ params: { namespace, name } }) =>
      answeredIn(namespace, (s) => instructionsRead(s, agentNamed(`GET ${instructionsPath(namespace, name)}`, name))),
    )
    .handle('putInstructions', ({ params: { name }, query, payload: { words } }) =>
      answered(async (s) => {
        const agent = agentNamed(`PUT /api/agents/${name}/instructions`, name);
        return wordsOf(await s.inRequest(AGENTS_CUSTOM.handler({ name: agent, repo: query.repo, words })));
      }),
    )
    .handle('deleteInstructions', ({ params: { name }, query }) =>
      answered(async (s) => {
        const agent = agentNamed(`DELETE /api/agents/${name}/instructions`, name);
        return clearedOf(await s.inRequest(AGENTS_CUSTOM.handler({ name: agent, repo: query.repo, clear: true })));
      }),
    ),
);
