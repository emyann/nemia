/**
 * Which reads of the `Api` a verb links, so that her shell and the MCP port reach each one a person or she would ask for. A read is
 * linked by a verb's `served` link, is a stream (`READS` shape `stream`), which no tool can serve, or is named in `UNLINKED_READS` with
 * the reason it has no verb. `readsUnlinked` (proved by contracts/reads-unlinked.contract.ts) judges the rule on plain data, and
 * `unlinkedReadsOf` applies it to an `Api` and a table's entries, each break a sentence naming its fix. Pure.
 */
import type { GetRead, ReadReason, ReadsUnlinked, UnlinkedBreak, UnlinkedBreakReason } from '../contracts/reads-unlinked.contract.ts';
import type { ApiGetName } from './api.ts';
import { READS } from './reads.ts';

export type { GetRead, ReadReason, UnlinkedBreak, UnlinkedBreakReason } from '../contracts/reads-unlinked.contract.ts';

/**
 * Each break of the rule, in the reads' order and then the reasons': a read no stream, no verb links and no reason names (`unlinked`);
 * and of each reason, one naming no GET endpoint (`none`), a stream (`stream`), a read a verb links (`linked`), and one that says
 * nothing (`unsaid`).
 */
export const readsUnlinked: ReadsUnlinked = (reads, linked, reasons) => {
  const named = new Set(reasons.map((x) => x.read));
  const links = new Set(linked);
  const unlinked: UnlinkedBreak[] = reads
    .filter((r) => !r.stream && !links.has(r.read) && !named.has(r.read))
    .map((r) => ({ read: r.read, reason: 'unlinked' }));
  const reasonBreaks = reasons.flatMap((x) => {
    const read = reads.find((r) => r.read === x.read);
    const breaks: UnlinkedBreakReason[] = [];
    if (read === undefined) breaks.push('none');
    else if (read.stream) breaks.push('stream');
    else if (links.has(x.read)) breaks.push('linked');
    if (x.why.length === 0) breaks.push('unsaid');
    return breaks.map((reason) => ({ read: x.read, reason }) satisfies UnlinkedBreak);
  });
  return [...unlinked, ...reasonBreaks];
};

/** What an Api is read as here: its groups, each its endpoints by name, with their method. */
type ApiRead = {
  readonly groups: Readonly<
    Record<string, { readonly identifier: string; readonly endpoints: Readonly<Record<string, { readonly method: string }>> }>
  >;
};

/** An entry of a table as the rule reads it: its name and the endpoints it links. */
type LinkingEntry = { readonly name: string; readonly served?: readonly { readonly endpoint: string }[] };

/**
 * Every GET endpoint of `api`, as `<group>.<endpoint>`, each a stream where `READS` reads it as one.
 * @param api The Api whose GET endpoints are read.
 */
export const getReadsOf = (api: ApiRead) =>
  Object.values(api.groups).flatMap((group) =>
    Object.entries(group.endpoints)
      .filter(([, endpoint]) => endpoint.method === 'GET')
      .map(([name]) => {
        const read = `${group.identifier}.${name}`;
        const bound = (READS as Readonly<Record<string, { readonly shape: string }>>)[read];
        return { read, stream: bound?.shape === 'stream' } satisfies GetRead;
      }),
  );

/** The per-kind object reads `nemia get <plural> [<name>]` reaches, generic over every kind discovery lists. */
const BY_GET =
  'an object read by its kind and name, which `nemia get <plural> [<name>]` reaches for every kind discovery lists; a port link is one endpoint per tool, so a generic read of the port is a card of its own';

/** A template's document as the board previews it. */
const TEMPLATE_PREVIEW =
  "the board's preview of a template rendered with its defaults: a verb waits on the template verbs leaving this machine (`template` is a machine verb), and `nemia get templates <name>` reads the template itself";

/** A skill's files, which the skill object serves already. */
const SKILL_FILES =
  "a skill's files by path, which the skill object already serves (`SkillSpec.files`) through `nemia get skills <name> -n <factory> -o yaml` and `nemia library skills <name>`";

/**
 * Why each read of the `Api` that no verb links has none, by its `<group>.<endpoint>` name: a stream needs no reason, and a read given a
 * verb takes its reason out. Typed over every GET name, so a reason for a read the `Api` no longer has does not compile.
 */
export const UNLINKED_READS: { readonly [K in ApiGetName]?: string } = {
  'runs.list': BY_GET,
  'runs.get': BY_GET,
  'cards.list': BY_GET,
  'cards.get': BY_GET,
  'factories.get': BY_GET,
  'mcpservers.get': BY_GET,
  'schedules.list': BY_GET,
  'schedules.get': BY_GET,
  'hires.list': BY_GET,
  'hires.get': BY_GET,
  'libraryadds.get': BY_GET,
  'volumes.list': BY_GET,
  'volumes.get': BY_GET,
  'workflows.list': BY_GET,
  'workflows.get': BY_GET,
  'templates.listAll': BY_GET,
  'templates.get': BY_GET,
  'subscriptions.listAll': BY_GET,
  'subscriptions.get': BY_GET,
  'events.listAll': BY_GET,
  'events.list': BY_GET,
  'events.getAll': BY_GET,
  'events.get': BY_GET,
  'proposals.list': BY_GET,
  'proposals.get': BY_GET,
  'delegations.list': BY_GET,
  'delegations.get': BY_GET,
  'server.health': 'a liveness probe: `nemia server version` reads that the api answers, and its release',
  'server.metrics':
    "the runtime's raw instruments by name and attributes: a person's questions of the daemon are answered by `nemia passes`, `nemia series` and `nemia stats`",
  'readiness.fixOf':
    'a fix read by the id its start answered: `nemia doctor fix` follows its own, and the result shows in `nemia readiness`',
  'upgrades.upgradeOf':
    'an upgrade read by the id its start answered: `nemia server upgrade` follows its own, and the result shows in `nemia server upgrades`',
  'readiness.turnOf': 'a check turn read by the id `readiness.turn` answered, and no verb starts one',
  'folders.list': "the person's alone, as its endpoint says: the board's folder picker",
  'nemia.chat': "Nemia's chat with the person, which her own session is the other side of",
  'skills.files': SKILL_FILES,
  'skills.filesLibrary': SKILL_FILES,
  'templates.workflows': TEMPLATE_PREVIEW,
  'templates.workflow': TEMPLATE_PREVIEW,
  'templates.agents': TEMPLATE_PREVIEW,
  'templates.agent': TEMPLATE_PREVIEW,
  'templates.skills': TEMPLATE_PREVIEW,
  'templates.skill': TEMPLATE_PREVIEW,
  'factories.export': 'read by `nemia factory move`, a write that carries a factory to another store',
  'factories.home': "rendered by `nemia factory home` on the client's machine, to start the person's own session",
};

/** The fix of each break, said after the read it names. */
const FIX: { readonly [R in UnlinkedBreakReason]: string } = {
  unlinked:
    'is a read no verb links, so neither her shell nor the MCP port reaches it: link it from the verb that prints it (`served`), or say why it has none in UNLINKED_READS',
  linked: 'is linked by a verb and still has a reason in UNLINKED_READS: take the reason out',
  stream: 'is a stream, which no tool can serve, and needs no reason: take it out of UNLINKED_READS',
  none: 'is no GET endpoint of the Api and has a reason in UNLINKED_READS: take the reason out',
  unsaid: 'has a reason in UNLINKED_READS that says nothing: say why it has no verb',
};

/**
 * Each read of `api` that breaks the rule, a sentence each naming the read and its fix: one no verb of `entries` links that is no
 * stream and has no reason, and each reason that names a linked read, a stream, no read, or nothing. Empty where every read is linked,
 * a stream, or excused in words.
 * @param api The Api whose GET endpoints are judged.
 * @param entries The verbs whose `served` links count: those her shell's fence and the MCP port read.
 * @param reasons Why each unlinked read has no verb, by its name; UNLINKED_READS by default.
 */
export const unlinkedReadsOf = (
  api: ApiRead,
  entries: readonly LinkingEntry[],
  reasons: Readonly<Record<string, string | undefined>> = UNLINKED_READS,
) => {
  const linked = entries.flatMap((e) => (e.served ?? []).map((link) => link.endpoint));
  const given = Object.entries(reasons).flatMap(([read, why]) => (why === undefined ? [] : [{ read, why } satisfies ReadReason]));
  return readsUnlinked(getReadsOf(api), linked, given).map((b) => `${b.read} ${FIX[b.reason]}`);
};
