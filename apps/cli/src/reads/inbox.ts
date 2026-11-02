/**
 * `nemia inbox`, read from the api (`GET /api/inbox`): each card a line, then how to start, queue or drop one — or that the inbox is
 * empty — printed as the in-process command prints it (`inboxLines`, the orchestrator's `inbox/inbox.ts`, ported word for word). Where
 * a card that names no factory is said to start is this process's `WF_DEFAULT_FACTORY_STARTS`, and the folder named in the last line this
 * store's, as the in-process command reads both. Any words after `inbox` go to the old path: `inbox add`, `inbox rm` and the rest are
 * commands of their own there.
 */
import path from 'node:path';
import type { InboxEntry } from '../../../api/src/client/client.ts';
import { get } from '../client.ts';
import { spawned } from '../local.ts';
import { storeRoot } from '../where.ts';

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

/** A line per entry of the inbox: the in-process `inboxLines`. */
function inboxLines(listing: readonly InboxEntry[], unfactoredStarts: boolean): string[] {
  const width = Math.max(0, ...listing.map((l) => l.name.length));
  const inLine = listing.filter((l) => l.queued?.place).length;
  return listing.map((l) => {
    const started = l.startedAs.length ? `  started as ${l.startedAs.join(', ')}` : '';
    const queued = l.queued?.place ? `  queued ${l.queued.place} of ${inLine}` : '';
    const tried = triedClause(l, unfactoredStarts);
    if (l.error !== null) return `${l.name.padEnd(width)}  ${l.error}${queued}${tried}${started}`;
    return `${l.name.padEnd(width)}  ${(l.title ?? '').slice(0, 56).trimEnd()}${l.workflow ? `  workflow: ${l.workflow}` : ''}${l.repo ? `  repo: ${l.repo}` : ''}${l.gate ? `  gate: ${l.gate}` : ''}${l.factory ? `  factory: ${l.factory}` : ''}${queued}${tried}${started}`;
  });
}

/** What `nemia inbox` prints of the cards, in a process whose environment is `env`. */
export const inboxPrinted = (cards: readonly InboxEntry[], env: NodeJS.ProcessEnv = process.env): string[] =>
  cards.length
    ? [
        ...inboxLines(cards, env.WF_DEFAULT_FACTORY_STARTS === '1'),
        `\nstart one: nemia start ${path.join(storeRoot(env), 'inbox', '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`,
      ]
    : [`the inbox is empty — park an idea with nemia inbox add "<idea>"`];

export async function inbox(args: readonly string[]): Promise<number> {
  if (args.length) return spawned(['inbox', ...args]);
  for (const line of inboxPrinted(await get<InboxEntry[]>('inbox', '/api/inbox'))) process.stdout.write(`${line}\n`);
  return 0;
}
