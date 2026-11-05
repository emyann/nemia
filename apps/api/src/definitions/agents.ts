/**
 * The agents group's handlers (`objects`' `Api`): a namespace's agents as objects — the repository's and yours (`agents`, the table's
 * entry), and, in a factory made from a template, its tree's (`<tree>/workflows/agents`, origin `factory`) — each with the steps that name
 * it, the hires that fill a step with it and the factories that do (`inFactory`), and the ledger's number for what its file holds now.
 *
 * Writes are yours, in `default` alone (`writeGoes`): made, written at the `metadata.resourceVersion` it was read at (a `metadata.name`
 * other than the path's renames it) and removed at the `?resourceVersion=` it was read at, through `agents write` and `agents rm`; a
 * removal of one a step still names is the package's `Conflict`, with its `users`. A try (`agents run`) starts a run of one of yours; the
 * repository's is refused with the copy that makes it yours. Its card is `agents card`'s.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import {
  agentRead,
  definitionRevision,
  factoriesFilling,
  inFactory,
  readFactories,
  stepsFilled,
  untriedOf,
  type AgentReading,
  type AgentsRead,
  type CardRead,
} from 'agent-orchestrator';
import { AGENTS_FOLDER, agentNameRefusal } from 'agent-orchestrator/workflow';
import { type Agent, type AgentSpec, Api, API_VERSION, Invalid } from 'objects';
import type { Served } from '../layer.ts';
import { agentDraftOf, listingOf, saved, type AgentDraftBody, type LibraryAgent } from '../agents/agents.ts';
import { queryOf } from '../factory-parts/index.ts';
import { answeredWrite as answered } from '../objects/refused.ts';
import { markdownNamesIn } from '../workflows/builder.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { listed, originAsked, servedNamed, servedOf, thereOf, writeGoes, writtenAt, type Held, type Origin } from './served.ts';

const AGENTS = commandNamed('agents');
const AGENT_CARD = commandNamed('agents card');
const REMOVE = commandNamed('agents rm');
const TRY = commandNamed('agents run');

/** The agents of the factory's tree, read as the repository's are, then told apart by their origin. */
const treeAgents = (s: Served) =>
  Effect.gen(function* () {
    const tree = s.factory?.tree;
    if (tree === undefined) return [];
    const dir = path.join(tree, 'workflows', AGENTS_FOLDER);
    const read: AgentReading[] = [];
    for (const name of markdownNamesIn(dir)) {
      const one = yield* agentRead('repo', dir, name, { repo: s.repo, home: s.home });
      if (one) read.push(one);
    }
    return read;
  });

/**
 * Every agent the namespace holds, at each origin, read now with its users and fills: the factory's tree's whether or not a step names
 * them, since they are the factory's own; every other only where it fills a step there (`inFactory`).
 */
async function heldIn(s: Served): Promise<Held<LibraryAgent>[]> {
  const { agents } = (await runPlaced(s, s.e, AGENTS.handler({ repo: s.repo }, s.env, s.home))) as AgentsRead;
  const tree = await s.inRequest(treeAgents(s));
  const trees = new Set(tree.map((a) => a.file));
  const listings = await s.inRequest(
    Effect.forEach([...tree, ...agents], (one) => listingOf(one, s.repo, s.home, trees.has(one.file) ? s.factory?.tree : undefined)),
  );
  const filled = stepsFilled(s.repo, s.home, s.factory);
  const byFile = factoriesFilling(readFactories(), s.home);
  const own = inFactory(
    listings.filter((one) => trees.has(one.file)),
    filled,
    byFile,
  );
  const elsewhere = inFactory(
    listings.filter((one) => !trees.has(one.file)),
    filled,
    byFile,
    s.factory,
  );
  return [
    ...own.map((item) => ({ name: item.name, origin: 'factory' as const, item })),
    ...elsewhere.map((item) => ({ name: item.name, origin: item.from, item })),
  ];
}

/** The object of one agent served, its revision read through the ledger. */
const agentObject = (namespace: string, origin: Origin, shadowedBy: Origin | null, a: LibraryAgent, revision: number): Agent => ({
  apiVersion: API_VERSION,
  kind: 'Agent',
  metadata: { name: a.name, namespace, creationTimestamp: writtenAt(a.file), resourceVersion: a.version },
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
    revision,
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

const objectsOf = (s: Served, namespace: string, served: ReturnType<typeof servedOf<LibraryAgent>>): Promise<Agent[]> =>
  s.inRequest(
    Effect.forEach(served, ({ origin, shadowedBy, item }) =>
      Effect.map(definitionRevision('agent', item.name, item.version), (revision) =>
        agentObject(namespace, origin, shadowedBy, item, revision),
      ),
    ),
  );

const listPath = (namespace: string) => `GET /api/namespaces/${namespace}/agents`;

/** The agent `name` the namespace serves (from `asked`, where one is), read now. */
async function agentAt(s: Served, namespace: string, name: string, asked?: Origin): Promise<Agent> {
  const [one] = await objectsOf(s, namespace, [servedNamed(await heldIn(s), name, asked, listPath(namespace))]);
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

const A2A_WHY = (name: string) =>
  `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.`;

export const agentsHandlers = HttpApiBuilder.group(Api, 'agents', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered(async (s) => {
        const { origin, ...page } = query;
        return listed('Agent', await objectsOf(s, namespace, servedOf(await heldIn(s), originAsked(origin))), queryOf(page));
      }),
    )
    .handle('get', ({ params: { namespace, name }, query }) => answered((s) => agentAt(s, namespace, name, originAsked(query.origin))))
    .handle('create', ({ params: { namespace }, payload }) =>
      answered(async (s) => {
        const route = `POST /api/namespaces/${namespace}/agents`;
        const name = named(route, payload.metadata.name);
        writeGoes(namespace, 'create', thereOf(await heldIn(s), name));
        const yours = { from: 'yours' as const, repo: s.repo, home: s.home };
        await saved(s.e, s.placeService, s.inRequest, yours, agentDraftOf(draftBodyOf(payload.spec), name), 201);
        return agentAt(s, namespace, name, 'yours');
      }),
    )
    .handle('replace', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        const route = `PUT /api/namespaces/${namespace}/agents/${name}`;
        writeGoes(namespace, 'replace', thereOf(await heldIn(s), name));
        const version = versioned(route, payload.metadata.resourceVersion);
        const to = payload.metadata.name === undefined ? name : named(route, payload.metadata.name);
        const given = agentDraftOf(draftBodyOf(payload.spec), to);
        await saved(s.e, s.placeService, s.inRequest, { from: 'yours', repo: s.repo, home: s.home }, { ...given, version, name }, 200);
        return agentAt(s, namespace, to, 'yours');
      }),
    )
    .handle('delete', ({ params: { namespace, name }, query }) =>
      answered(async (s) => {
        const route = `DELETE /api/namespaces/${namespace}/agents/${name}`;
        writeGoes(namespace, 'remove', thereOf(await heldIn(s), name));
        const version = versioned(route, query.resourceVersion);
        const before = await agentAt(s, namespace, name, 'yours');
        await runPlaced(s, s.e, REMOVE.handler({ from: 'yours', name, version, repo: s.repo }, undefined, s.home));
        return before;
      }),
    )
    .handle('try', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
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
        const tried = TRY.handler({ from: 'yours', name, brief: payload.brief, repo: s.repo }, undefined, s.home);
        return { id: ((await runPlaced(s, s.e, tried)) as { id: string }).id };
      }),
    )
    .handle('card', ({ params: { namespace, name }, query }) =>
      answered(async (s) => {
        const served = servedNamed(await heldIn(s), name, originAsked(query.origin), listPath(namespace));
        if (served.item.error !== null) throw new Invalid({ error: served.item.error });
        if (served.origin === 'factory')
          throw new Invalid({
            error: `${name} is the factory's own agent, whose card is not drawn here: its skills are \`status.card\` of GET /api/namespaces/${namespace}/agents/${name}?origin=factory.`,
          });
        const from = served.origin === 'yours' ? 'yours' : 'repo';
        const { card } = (await runPlaced(s, s.e, AGENT_CARD.handler({ name, repo: s.repo, from }, s.env, s.home))) as CardRead;
        return { card, servedOverA2A: false as const, why: A2A_WHY(name) };
      }),
    ),
);
