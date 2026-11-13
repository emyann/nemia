/**
 * The agents' reads and copy, each asked of the api's Agent group in `default`: `nemia agents` (every page of the listing, on the
 * repository `--repo` names, else the one it is typed in, `repoQuery`), `nemia agents card` (the A2A card on stdout, what it is not on
 * stderr), `nemia agents sources` (the agent files the store knows of) and `nemia agents copy` (one copied into yours: its file a path on
 * the daemon's machine); and the lines each prints of what the api answers.
 */
import {
  AGENTS_CARD_WORDS,
  AGENTS_COPY_WORDS,
  AGENTS_SOURCES_WORDS,
  AGENTS_WORDS,
  DEFAULT_NAMESPACE,
  type Agent,
  type AgentCopied,
  type AgentSource,
  type AgentSources,
  type Args,
} from 'objects';
import { asked, everyPage, pageOf } from '../../objects.ts';
import { listArg, pathSent, said, textArg } from '../requests.ts';
import { repoQuery } from './sent.ts';

/** The line of an agent copied in: the file and version it came from, and whether that file has changed since or is gone. */
const copiedLine = ({ source, version, now }: NonNullable<Agent['status']['copied']>): string =>
  `   copied from ${source} at ${version}${now === 'changed' ? '; the source has changed since' : now === 'gone' ? '; the source is gone' : ''}`;

/** One agent's lines on `nemia agents`: what it is for, what it says it can do, and the skills it is given; or why it does not read. */
function agentLines({ metadata: { name }, spec, status }: Agent): string[] {
  const from = status.origin;
  if (status.error !== null) return [`${name}  ${from}  does not read: ${status.error.split('\n')[0]}`];
  const custom = status.custom ?? null;
  return [
    `${name}  ${from}  ${spec.description ?? 'no description:'}`,
    ...(status.cardError !== null ? [`   says nothing it can do — ${status.cardError.split('\n')[0]}`] : []),
    ...(status.card ?? []).map((skill) => `   ${skill.id}  ${skill.name} — ${skill.description}`),
    ...(spec.skills ? [`   given the skills ${spec.skills}`] : []),
    ...(spec.harnessPrompt != null && spec.harnessPrompt !== 'keep' ? [`   harness prompt: ${spec.harnessPrompt}`] : []),
    ...(spec.mcp ? [`   loads the MCP servers ${spec.mcp}`] : []),
    ...(custom !== null ? [`   custom instructions: ${custom}`] : []),
    ...(status.copied !== null ? [copiedLine(status.copied)] : []),
  ];
}

/** `nemia agents`' lines: each agent, and how to get one's card; or where an agent would be, for none. */
export const agentsLines = (agents: readonly Agent[]): string[] =>
  agents.length
    ? [...agents.flatMap(agentLines), `\none in A2A's shape: nemia agents card <name>`]
    : ["no agents — an agent is a file in <workflows>/agents: the repository's, or yours in the store"];

/** `nemia agents`' runner: every agent the api lists in `default`, on the repository `--repo` names or it is typed in. */
export async function agentsListed(args: Args): Promise<number> {
  const repo = repoQuery(args);
  const list = await asked(AGENTS_WORDS.name, (c) =>
    pageOf(everyPage((page) => c.agents.list({ params: { namespace: DEFAULT_NAMESPACE }, query: { ...page, ...repo } }))),
  );
  said(agentsLines(list.items));
  return 0;
}

/** `nemia agents card <name>`'s runner: the card printed as JSON, and on stderr that it is a card, not an address. */
export async function agentsCard(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const origin = textArg(args, 'from');
  const query = { ...repoQuery(args), ...(origin !== undefined && { origin }) };
  const answer = await asked(AGENTS_CARD_WORDS.name, (c) => c.agents.card({ params: { namespace: DEFAULT_NAMESPACE, name }, query }));
  said([JSON.stringify(answer.card, null, 2)]);
  process.stderr.write(
    `${name} (${answer.from ?? origin ?? 'repo'}) — a card, not an address: nothing here serves this agent over A2A, so it declares no interfaces and no security schemes.\n`,
  );
  return 0;
}

/** The heading of the agents of one folder: the repository's, the library's, or the one named. */
const headingOf = ({ place, repo, dir }: AgentSource): string =>
  place === 'repository' ? `${dir}  (the repository ${repo})` : place === 'library' ? `${dir}  (your library)` : dir;

/** `nemia agents sources`' lines: the agents of each folder under its heading, then how to copy one; or that there is none. */
export function sourcesLines({ sources }: AgentSources): string[] {
  if (!sources.length)
    return ['no agent file found in the repositories the store knows, nor in your library: name a folder of them with --path <folder>.'];
  const lines: string[] = [];
  let heading = '';
  for (const source of sources) {
    const now = headingOf(source);
    if (now !== heading) lines.push(...(heading ? [''] : []), now);
    heading = now;
    lines.push(
      source.error === null
        ? `  ${source.name}  ${source.description ?? 'no description'}  ${source.file}`
        : `  ${source.name}  does not read: ${source.error.split('\n')[0]}  ${source.file}`,
    );
  }
  return [...lines, '', 'copy one into your library: nemia agents copy <file> [--as <name>]'];
}

/** `nemia agents sources`' runner: the folder `--path` names a path on the daemon's machine. */
export async function agentsSources(args: Args): Promise<number> {
  const at = textArg(args, 'path');
  const query = at === undefined ? {} : { path: pathSent(at) };
  said(sourcesLines(await asked(AGENTS_SOURCES_WORDS.name, (c) => c.agents.sources({ query }))));
  return 0;
}

/** The words of a copy: what it wrote, what it reused, and how the agent is given to a step. */
export const copiedLines = ({ name, copied, reused }: AgentCopied): string[] => [
  `${name} copied into your library${copied.length ? `: ${copied.join(', ')}` : ', which held it already'}`,
  ...(reused.length && copied.length ? [`reused as they were: ${reused.join(', ')}`] : []),
  `give it to a step: nemia factory hire <factory> ${name} --step <workflow>/<step>`,
];

/** `nemia agents copy <file>`'s runner: the file a path on the daemon's machine, which reads and judges it. */
export async function agentsCopy(args: Args): Promise<number> {
  const file = pathSent(textArg(args, 'file') ?? '');
  const as = textArg(args, 'as');
  const keep = listArg(args, 'keep');
  const payload = { file, ...(as !== undefined && { as }), ...(keep.length > 0 && { keep: [...keep] }) };
  said(copiedLines(await asked(AGENTS_COPY_WORDS.name, (c) => c.agents.copy({ params: { namespace: DEFAULT_NAMESPACE }, payload }))));
  return 0;
}
