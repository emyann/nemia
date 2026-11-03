/**
 * `nemia inbox`, read from the api (`GET /api/inbox`): each card a line, then how to start, queue or drop one — or that the inbox is
 * empty — printed as the in-process command prints it (`inboxLines`, the orchestrator's `inbox/inbox.ts`, ported word for word). Where
 * a card that names no factory is said to start is this process's `WF_DEFAULT_FACTORY_STARTS`, and the folder named in the last line this
 * store's, as the in-process command reads both. `-l <selector>` (sent as `?selector=`, given again for another), `--show-labels` and
 * `-L <key>` are read here; any other words after `inbox` go to the old path: `inbox add`, `inbox rm` and the rest are commands of
 * their own there.
 */
import path from 'node:path';
import type { InboxEntry } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { spawned } from '../local.ts';
import { storeRoot } from '../where.ts';
import { labelSegments, labelsAsked, type LabelMap, type LabelsAsked } from './labels.ts';

/** Why a queued card's last start did not happen, as the in-process `triedClause` says it. */
function triedClause(l: InboxEntry, unfactoredStarts: boolean): string {
  const t = l.tried;
  if (!t) return '';
  const said = l.error === null && !l.repo && (l.factory !== null || unfactoredStarts);
  const its = t.repo === l.factoryRepo ? ", its factory's one repository" : '';
  const on = said ? ` on ${t.repo}${its}` : '';
  const why = t.why !== l.error ? `: ${t.why}` : '';
  if (!t.refused) return ` — failed at ${t.at}${on}${why} — not a refusal: the tick tries it again on every pass, where it keeps its place`;
  const elsewhere = said && l.factoryRepo === null ? ', or run nemia up in the repository it is about' : '';
  return ` — not started at ${t.at}${on}${why} Edit the card, or take it back and queue it again${elsewhere}, and the tick tries it again`;
}

/** The map a selector reads of an entry: its person labels, then its `workflow:` and `factory:` where set — the in-process `cardLabels`. */
const cardLabels = (l: Pick<InboxEntry, 'labels' | 'workflow' | 'factory'>): LabelMap => ({
  ...l.labels,
  ...(l.workflow ? { workflow: l.workflow } : {}),
  ...(l.factory ? { factory: l.factory } : {}),
});

/** No label asked shown: the lines as they were. */
const NONE_SHOWN: LabelsAsked = { selector: [], showLabels: false, columns: [] };

/** A line per entry of the inbox, each ending on its labels' segments where `asked` shows them: the in-process `inboxLines`. */
function inboxLines(listing: readonly InboxEntry[], unfactoredStarts: boolean, asked: LabelsAsked): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  const inLine = listing.filter((l) => l.queued?.place).length;
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}` : '';
    const queued = l.queued?.place ? `  queued ${l.queued.place} of ${inLine}` : '';
    const tried = triedClause(l, unfactoredStarts);
    const labelled = labelSegments(cardLabels(l), asked);
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${queued}${tried}${started}${labelled}`;
    return `${l.name.padEnd(width)}  ${(l.title ?? '').slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${l.gate ? `  gate: ${l.gate}` : ''}${l.factory ? `  factory: ${l.factory}` : ''}${queued}${tried}${started}${labelled}`;
  });
}

/**
 * What `nemia inbox` prints of the cards, in a process whose environment is `env`, of those `asked`'s selectors took: with none taken
 * where a selector was given, that none matches.
 */
export const inboxPrinted = (
  cards: readonly InboxEntry[],
  env: NodeJS.ProcessEnv = process.env,
  asked: LabelsAsked = NONE_SHOWN,
): string[] =>
  cards.length
    ? [
        ...inboxLines(cards, env.WF_DEFAULT_FACTORY_STARTS === '1', asked),
        `\nstart one: nemia start ${path.join(storeRoot(env), 'inbox', '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`,
      ]
    : asked.selector.length
      ? [`no card of the inbox matches -l ${asked.selector.join(' -l ')} — see them all with nemia inbox --show-labels`]
      : [`the inbox is empty — park an idea with nemia inbox add "<idea>"`];

export async function inbox(args: readonly string[]): Promise<number> {
  const read = labelsAsked(args);
  if (read === null || read.rest.length) return spawned(['inbox', ...args]);
  const cards = await get<InboxEntry[]>('inbox', '/api/inbox', { selector: read.asked.selector });
  for (const line of inboxPrinted(cards, process.env, read.asked)) process.stdout.write(`${line}\n`);
  return 0;
}
