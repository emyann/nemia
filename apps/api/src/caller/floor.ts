/**
 * What the floor of an agent's standing token judges a request of the `Api` as: the command entry its endpoint serves, read off the
 * table's `served` links (the package's `TABLE` and `CLI_VERBS`), the strictest for an agent where several link one endpoint, and, where
 * none does, a read for a GET and out of reach otherwise (`floorEntryOf`); and the words of a refusal of the floor, each naming what the
 * person types or clicks instead (`floorWords`). The judgement is the package's (`tokenFloor`), run for every endpoint by the wrapper
 * every group is built with (`readsBounded`, objects/answer-bound.ts).
 */
import {
  agentClassOf,
  CLI_VERBS,
  TABLE,
  TOKEN_LEAST,
  type AdmissionEntry,
  type FloorRefusal,
  type ProposalCaller,
} from 'agent-orchestrator';
import { DEFAULT_NAMESPACE } from 'objects';

/** A class of a command once a setter's is resolved for a request, as the floor reads it. */
type Resolved = 'read' | 'act' | 'ask' | 'answer' | 'none';

/** How far each class is from what runs unasked: the strictest of several entries is the one an agent's call is judged by. */
const STRICTNESS: Readonly<Record<Resolved, number>> = { read: 0, act: 1, answer: 2, ask: 3, none: 4 };

/** The class of `entry` for an agent's call by `method`: out of reach where an agent never types it, and a setter's bare read for a GET. */
const resolvedOf = (entry: AdmissionEntry, method: string): Resolved => {
  const c = agentClassOf(entry);
  return typeof c !== 'object' ? c : method === 'GET' ? c.bare : c.sets;
};

/** Every entry of the table, the CLI's verbs among them. */
const TABLED: ReadonlySet<AdmissionEntry & { readonly served?: readonly { readonly endpoint: string }[] }> = new Set([
  ...TABLE,
  ...CLI_VERBS,
]);

/** Each endpoint the table's entries link (`<group>.<endpoint>`), with every entry that links it. */
const LINKED: ReadonlyMap<string, readonly AdmissionEntry[]> = (() => {
  const linked = new Map<string, AdmissionEntry[]>();
  for (const entry of TABLED)
    for (const link of entry.served ?? []) linked.set(link.endpoint, [...(linked.get(link.endpoint) ?? []), entry]);
  return linked;
})();

/**
 * The command entry the endpoint `endpoint` (`<group>.<endpoint>`) serves, as the floor judges a request of it by `method`: the strictest
 * for an agent of the entries that link it; where none does, one named for the endpoint, a read for a GET and out of reach otherwise.
 */
export function floorEntryOf(endpoint: string, method: string): AdmissionEntry {
  const linked = LINKED.get(endpoint) ?? [];
  const [first, ...rest] = linked;
  if (first === undefined) return { name: endpoint, class: method === 'GET' ? 'read' : 'none' };
  return rest.reduce(
    (strictest, entry) => (STRICTNESS[resolvedOf(entry, method)] > STRICTNESS[resolvedOf(strictest, method)] ? entry : strictest),
    first,
  );
}

/** How the person raises the factory `factory` to `least`, as admission says it: the store's for the default factory, else its own. */
const raiseWords = (factory: string | undefined, least: string): string =>
  factory === undefined || factory === DEFAULT_NAMESPACE ? `nemia level ${least}` : `nemia level ${least} --factory ${factory}`;

/**
 * The words of the floor's refusal of `route` (`<METHOD> <path>`), served as `entry`, under the agent's standing token `caller`, for
 * `reason`: what reached past the floor, and what the person types or clicks instead. `factory` is the factory the request names, where
 * it names one.
 */
export function floorWords(
  route: string,
  entry: AdmissionEntry,
  caller: Extract<ProposalCaller, { kind: 'agent' }>,
  reason: FloorRefusal,
  factory: string | undefined,
): string {
  const held = `the token ${caller.token ?? ''} that ${caller.agent} holds`;
  const command = ![...TABLED].includes(entry)
    ? `the board, or their own nemia`
    : `\`nemia ${entry.name}\` with their own nemia, or the board`;
  const mint = `\`nemia token add <name> --agent ${caller.agent}${factory === undefined ? '' : ` --factory ${factory}`}\``;
  switch (reason) {
    case 'out-of-reach':
      return `${route} is out of an agent's reach, and this request carries ${held}: the person does it through ${command}.`;
    case 'asks-the-person':
      return `${route} is asked of the person every time, and the api has no prompt to ask it at: the person does it through ${command}.`;
    case 'narrowed':
      return `${route} reaches past ${held}, narrowed to ${caller.narrowed ?? 'less'} when it was minted: the person does it through ${command}, or mints a token that reaches it, ${mint}.`;
    case 'other-factory':
      return `${route} acts in a factory other than ${caller.factory ?? 'its own'}, the one ${held} is bound to: the person does it through ${command}, or mints a token for this factory, ${mint}.`;
    case 'below-level':
      return `${route} acts in the factory ${factory ?? DEFAULT_NAMESPACE}, below ${TOKEN_LEAST}, which an agent's call leaves alone: raising it is the person's, \`${raiseWords(factory, TOKEN_LEAST)}\`, or the person does it through ${command}.`;
    case 'waits-on-person':
      return `${route} answers what waits on the person, and no rule they confirmed for ${caller.agent} lets it through: the person answers it through ${command}, or confirms a rule for it (\`nemia policy ${caller.agent}\`).`;
  }
}
