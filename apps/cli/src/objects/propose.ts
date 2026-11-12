/**
 * `nemia propose -f <file|->`: a change of a factory's definitions asked, not made. The file is read as `nemia apply -f` reads one
 * (`objectsOf`, `readOf`), each object stamped with the `resourceVersion` served now where the file says none (absent where none is
 * served: the object is made), and sent to the api as one `ProposalCreate`, which names the proposal, reads who proposes from the
 * request's token and judges it. `nemia propose --undo <proposal>` asks for the objects as they stood before that proposal applied
 * (`status.before`), each at the version served now, and the removal of each object it made. `nemia proposals approve|decline <name>`
 * judge one. Each prints the proposal's name and phase, whether it widens access, and, while it waits, the line that approves it.
 *
 * The client judges nothing: a proposal the caller may not make or approve is the api's refusal (`Forbidden`, `Unauthorized`), said in
 * its words and exited with as every refusal (`src/objects.ts`).
 */
import {
  APPLY_AT,
  type APIResource,
  type ApplyAt,
  CHANGE_VERBS,
  type ChangeVerb,
  DEFAULT_NAMESPACE,
  PROPOSABLE_KINDS,
  type ProposableKind,
  type Proposal,
  type ProposalCreate,
  type ProposedObject,
  RESOURCE_PLURALS,
} from 'objects';
import { asked, discovered } from '../objects.ts';
import { Refused } from '../refused.ts';
import { isRecord, objectsOf, type Read, readOf, servedOf, textOf } from './apply.ts';

export const PROPOSE_HELP = `nemia propose -f <file|-> [-n <factory>] [--at approval|run-end] [--why <text>]
nemia propose --objects '<json>' [-n <factory>] [--at approval|run-end] [--why <text>]
nemia propose --undo <proposal> [-n <factory>] [--why <text>]

Propose a change of a factory's definitions — workflows, agents, skills, hires, MCP servers, the factory — for the person (or an agent
the person delegated to) to approve. The file is read as nemia apply -f reads it; each object is sent at the resourceVersion served
now where the file says none, and made where none is served. With --undo, propose the objects back as they stood before the proposal
named applied, and the removal of each it made. Prints the proposal's name, its phase, whether it widens access, and the line that approves it.

  -f, --filename <file|->      the file to read, - for stdin
  -n, --namespace <factory>    the factory proposed in; else the one the file names; default where neither does
      --at <when>              approval (the default): applied once approved; run-end: once the proposing run has succeeded
      --why <text>             why, in your words, shown beside the change
      --objects '<json>'       the objects themselves, as JSON or YAML on one line, for a session that writes no file
      --undo <proposal>        propose undoing a proposal that applied
`;

export const PROPOSALS_HELP = `nemia proposals approve <name> [-n <factory>]
nemia proposals decline <name> [-n <factory>]

Approve or decline a waiting proposal. Prints the proposal's name, its phase, whether it widens access, and the line that approves it. List them
with nemia get proposals -n <factory>; read one with nemia get proposal <name> -n <factory> -o yaml.

  -n, --namespace <factory>    the factory the proposal is in; default where none is named
`;

/** What `args` ask of propose. */
type Asked = {
  file?: string;
  inline?: string;
  undo?: string;
  namespace?: string;
  at?: ApplyAt;
  why?: string;
};

/** Whether `word` is one of `words`. */
const oneOf = <W extends string>(words: readonly W[], word: unknown): word is W => (words as readonly unknown[]).includes(word);

/** The option words of `args` and their values, each option taking one; refused, naming the help, at a word no option of `verb`. */
function options(args: readonly string[], verb: string, takes: Readonly<Record<string, string>>): Map<string, string> {
  const said = new Map<string, string>();
  for (let at = 0; at < args.length; at++) {
    const arg = args[at] ?? '';
    const key = takes[arg];
    if (key === undefined) throw new Refused(`nemia ${verb}: ${arg} is no option of ${verb}; see \`nemia ${verb} --help\``);
    const value = args[at + 1];
    if (value === undefined) throw new Refused(`nemia ${verb}: ${arg} takes a value after it; see \`nemia ${verb} --help\``);
    said.set(key, value);
    at++;
  }
  return said;
}

/** What `args` ask of propose: a file or an undo, the factory, when it applies and why. */
function parsed(args: readonly string[]): Asked {
  const said = options(args, 'propose', {
    '-f': 'file',
    '--filename': 'file',
    '-n': 'namespace',
    '--namespace': 'namespace',
    '--at': 'at',
    '--why': 'why',
    '--undo': 'undo',
    '--objects': 'inline',
  });
  const at = said.get('at');
  if (at !== undefined && !oneOf(APPLY_AT, at))
    throw new Refused(`nemia propose: --at takes ${APPLY_AT.join(' or ')}; see \`nemia propose --help\``);
  const asked: Asked = {};
  for (const key of ['file', 'inline', 'undo', 'namespace', 'why'] as const) {
    const value = said.get(key);
    if (value !== undefined) asked[key] = value;
  }
  if (at !== undefined) asked.at = at;
  if ([asked.file, asked.inline, asked.undo].filter((said) => said !== undefined).length !== 1)
    throw new Refused(
      "nemia propose: name one of the file to propose, `nemia propose -f <file>` (`-f -` for stdin), the objects themselves, `nemia propose --objects '<json>'`, or the proposal to undo, `nemia propose --undo <proposal>`",
    );
  if (asked.undo !== undefined && asked.at !== undefined)
    throw new Refused('nemia propose: an undo applies once approved, and takes no --at: drop it, `nemia propose --undo <proposal>`');
  return asked;
}

/**
 * A proposal as the person reads it: its name and phase, whether it widens access, its page on the board, and, while it waits, the line
 * that approves it.
 */
export const proposalLines = (proposal: Proposal, namespace: string): string => {
  const factory = proposal.metadata.namespace ?? namespace;
  const { name } = proposal.metadata;
  const widens = proposal.status.widens ? ' (widens access)' : '';
  const next = proposal.status.phase === 'waiting' ? `  approve: nemia proposals approve ${name} -n ${factory}\n` : '';
  const board = `  board: /factories/${encodeURIComponent(factory)}/proposals/${encodeURIComponent(name)}\n`;
  return `proposals/${name} ${proposal.status.phase}${widens}\n${board}${next}`;
};

/** The metadata of a proposed object: its name, its namespace where its kind has one, and the version it is at where it is served. */
const metadataOf = (namespaced: boolean, name: string, namespace: string, version: string | undefined): ProposedObject['metadata'] => ({
  name,
  ...(namespaced ? { namespace } : {}),
  ...(version !== undefined ? { resourceVersion: version } : {}),
});

/** The kind of `read` as a proposal takes it; refused, naming apply, where the kind is not one a proposal changes. */
function proposable(read: Read): ProposableKind {
  const kind = read.resource.kind;
  if (oneOf(PROPOSABLE_KINDS, kind)) return kind;
  throw new Refused(
    `nemia propose: a ${kind} is not proposed — a proposal changes ${PROPOSABLE_KINDS.join(', ')}: write ${read.resource.name}/${read.name} with \`nemia apply -f <file>\``,
  );
}

/** One object of the file, as the proposal carries it: at the version the file says, else the one served now, else none (it is made). */
async function proposedOf(object: unknown, resources: readonly APIResource[], namespace: string): Promise<ProposedObject> {
  const read = readOf(object, resources, namespace, 'propose');
  const kind = proposable(read);
  const said = isRecord(object) ? object.verb : undefined;
  if (said !== undefined && !oneOf(CHANGE_VERBS, said))
    throw new Refused(
      `nemia propose: ${read.resource.name}/${read.name} says verb ${JSON.stringify(said)}: set ${CHANGE_VERBS.join(', ')}, or leave it out`,
    );
  const verb: ChangeVerb | undefined = said;
  const filed = typeof read.meta.resourceVersion === 'string' ? read.meta.resourceVersion : undefined;
  const version = filed ?? (verb === 'create' ? undefined : (await servedOf(read, 'propose'))?.metadata.resourceVersion);
  return {
    apiVersion: 'nemia/v1',
    kind,
    metadata: metadataOf(read.resource.namespaced, read.name, namespace, version),
    ...(verb !== 'delete' && read.spec !== undefined ? { spec: read.spec } : {}),
    ...(verb !== undefined ? { verb } : {}),
  };
}

/** The namespace a file proposes in: `-n`'s, else the one its objects name, else `default`; refused where they name two. */
function namespaceOf(objects: readonly unknown[], namespace: string | undefined): string {
  if (namespace !== undefined) return namespace;
  const named = new Set(
    objects.flatMap((o) => (isRecord(o) && isRecord(o.metadata) && typeof o.metadata.namespace === 'string' ? [o.metadata.namespace] : [])),
  );
  if (named.size > 1)
    throw new Refused(
      `nemia propose: the file names namespaces ${[...named].join(', ')}: a proposal is of one factory; propose each apart, \`nemia propose -f <file> -n <factory>\``,
    );
  return [...named][0] ?? DEFAULT_NAMESPACE;
}

/**
 * The objects of `text`, read from the file `file` names or given on the line (`--objects`, where `file` says so), as the proposal
 * carries them, in `namespace`.
 */
async function fromText(
  text: string,
  file: string,
  namespace: string | undefined,
): Promise<{ namespace: string; objects: ProposedObject[] }> {
  const objects = objectsOf(text, file, 'propose');
  if (objects.length === 0) throw new Refused(`nemia propose: ${file} holds no object: name one, then \`nemia propose -f <file>\``);
  const where = namespaceOf(objects, namespace);
  const resources = await discovered('propose');
  const proposed: ProposedObject[] = [];
  for (const object of objects) proposed.push(await proposedOf(object, resources, where));
  return { namespace: where, objects: proposed };
}

/** The resource of `kind` among `resources`. */
const resourceOf = (resources: readonly APIResource[], kind: string): APIResource | undefined =>
  resources.find((r) => r.kind === kind && !r.name.includes('/'));

/** `object` as it is served now in `namespace`: its version, or undefined where none is. */
async function versionNow(resources: readonly APIResource[], object: ProposedObject, namespace: string): Promise<string | undefined> {
  const resource = resourceOf(resources, object.kind);
  if (resource === undefined) return undefined;
  const read: Read = { resource, name: object.metadata.name, meta: {}, spec: object.spec, where: namespace };
  return (await servedOf(read, 'propose'))?.metadata.resourceVersion;
}

/**
 * The objects that undo `proposal`: each it changed or removed, back as it stood before (`status.before`), at the version served now, or
 * made again where it is gone; and each it made, removed. Refused, naming what to type, where it has not applied.
 */
async function undoOf(proposal: Proposal, namespace: string): Promise<ProposedObject[]> {
  const { name } = proposal.metadata;
  const before = proposal.status.before;
  if (proposal.status.phase !== 'applied' || before === undefined)
    throw new Refused(
      proposal.status.phase === 'waiting'
        ? `nemia propose: ${name} has not applied, so there is nothing to undo: decline it, \`nemia proposals decline ${name} -n ${namespace}\``
        : `nemia propose: ${name} is ${proposal.status.phase}, not applied, so there is nothing to undo: see it, \`nemia get proposal ${name} -n ${namespace} -o yaml\``,
    );
  const resources = await discovered('propose');
  const objects: ProposedObject[] = [];
  for (const object of before) {
    const { verb: _verb, ...was } = object;
    const version = await versionNow(resources, object, namespace);
    const { resourceVersion: _then, ...meta } = object.metadata;
    objects.push({ ...was, metadata: { ...meta, ...(version !== undefined ? { resourceVersion: version } : {}) } });
  }
  const kept = new Set(before.map((o) => `${RESOURCE_PLURALS[o.kind]}/${o.metadata.name}`));
  for (const change of proposal.status.changes) {
    if (change.verb !== 'create' || kept.has(`${change.resource}/${change.name}`)) continue;
    const kind = PROPOSABLE_KINDS.find((k) => RESOURCE_PLURALS[k] === change.resource);
    if (kind === undefined) continue;
    const made: ProposedObject = { apiVersion: 'nemia/v1', kind, metadata: { name: change.name }, verb: 'delete' };
    const namespaced = resourceOf(resources, kind)?.namespaced ?? kind !== 'Factory';
    const version = await versionNow(resources, made, namespace);
    objects.push({ ...made, metadata: metadataOf(namespaced, change.name, namespace, version) });
  }
  return objects;
}

export async function propose(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(PROPOSE_HELP);
    return 0;
  }
  const said = parsed(args);
  let namespace: string;
  let objects: ProposedObject[];
  let why = said.why;
  if (said.undo !== undefined) {
    const undone = said.undo;
    namespace = said.namespace ?? DEFAULT_NAMESPACE;
    const ns = namespace;
    const proposal = await asked('propose', (c) => c.proposals.get({ params: { namespace: ns, name: undone } }));
    objects = await undoOf(proposal, namespace);
    why ??= `undo ${undone}`;
  } else {
    const file = said.file ?? '--objects';
    const text = said.inline ?? textOf(file, 'propose');
    ({ namespace, objects } = await fromText(text, file, said.namespace));
  }
  const payload = { objects, ...(said.at !== undefined ? { applyAt: said.at } : {}), ...(why !== undefined ? { why } : {}) };
  return proposalMade('propose', namespace, payload);
}

/**
 * The proposal `payload` asks, made in the factory `namespace` for the command `verb` names, and printed (`proposalLines`): the one call
 * a proposal is made by, `nemia propose`'s and a writer's on the `factory` place alike.
 */
export async function proposalMade(verb: string, namespace: string, payload: ProposalCreate): Promise<number> {
  const made = await asked(verb, (c) => c.proposals.create({ params: { namespace }, payload }));
  process.stdout.write(proposalLines(made, namespace));
  return 0;
}

/** `nemia proposals approve|decline <name>`: the proposal judged by the caller, as the api allows it. */
export async function proposals(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(PROPOSALS_HELP);
    return 0;
  }
  const [action, name, ...rest] = args;
  if ((action !== 'approve' && action !== 'decline') || name === undefined || name.startsWith('-'))
    throw new Refused(
      'nemia proposals: say what to do with which proposal, `nemia proposals approve <name> -n <factory>` or `nemia proposals decline <name> -n <factory>`',
    );
  const namespace = options(rest, 'proposals', { '-n': 'namespace', '--namespace': 'namespace' }).get('namespace') ?? DEFAULT_NAMESPACE;
  const params = { params: { namespace, name } };
  const judged = await asked(`proposals ${action}`, (c) =>
    action === 'approve' ? c.proposals.approve(params) : c.proposals.decline(params),
  );
  process.stdout.write(proposalLines(judged, namespace));
  return 0;
}
