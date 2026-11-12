/**
 * `nemia inbox [--all] [-l <selector>]... [--show-labels] [-L <key>]... [-o wide]`, read from the api: the cards, as the server prints them
 * — the cards list (`GET /api/cards`, `labelSelector` given again for another selector) asked for its `Table` (`TABLE_ACCEPT`), printed
 * by `tableLines` — then how to start, queue or drop one, or why none is listed. The cards in play are those the api says are (each row's
 * card, `status.inPlay`); `--all` keeps every card. The folder named in the last line is this store's. Any other words after `inbox` go
 * to the old path: `inbox add`, `inbox rm` and the rest are commands of their own there.
 */
import path from 'node:path';
import { Schema } from 'effect';
import type { Table } from 'objects';
import { handedOn } from '../local.ts';
import { asked, READ_BOUND_MS } from '../objects.ts';
import { storeRoot } from '../where.ts';
import { AS_TABLE, tableAsked, tableLines, tableOf } from './table.ts';

/** What a row's card says of its play: whether the api counts it in play. */
const InPlay = Schema.Struct({ status: Schema.Struct({ inPlay: Schema.Boolean }) });

/** Whether a row's object is a card the api counts in play. */
const inPlay = (row: Table['rows'][number]): boolean => {
  const read = Schema.decodeUnknownOption(InPlay)(row.object);
  return read._tag === 'Some' && read.value.status.inPlay;
};

/**
 * What `nemia inbox` prints after its table, in a process whose environment is `env`: with a card listed, how to start, queue or drop
 * one; with none, how many were left out for their run having ended (`ended`), else that none matches where a selector was given, else
 * that the inbox is empty.
 */
export const inboxSaid = (listed: number, selector: readonly string[], ended: number, env: NodeJS.ProcessEnv = process.env): string =>
  listed
    ? `\nstart one: nemia start ${path.join(storeRoot(env), 'inbox', '<name>.md')} [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`
    : ended
      ? `no card in play${selector.length ? ` matches -l ${selector.join(' -l ')}` : ''}, and ${ended} whose run ended — list them with nemia inbox --all`
      : selector.length
        ? `no card of the inbox matches -l ${selector.join(' -l ')} — see them all with nemia inbox --show-labels`
        : `the inbox is empty — park an idea with nemia inbox add "<idea>"`;

export async function inbox(args: readonly string[]): Promise<number> {
  const all = args.includes('--all');
  const read = tableAsked(args.filter((word) => word !== '--all'));
  if (read === null || read.rest.length) return handedOn(['inbox', ...args]);
  const { selector } = read;
  const listed = await asked(
    'inbox',
    (client) => client.cards.listAll({ query: selector.length ? { labelSelector: selector } : {} }),
    process.env,
    READ_BOUND_MS,
    AS_TABLE,
  );
  const table = tableOf('inbox', listed);
  const shown = all ? table.rows : table.rows.filter(inPlay);
  const lines = tableLines({ ...table, rows: shown }, read.asked);
  for (const line of [...lines, inboxSaid(shown.length, selector, table.rows.length - shown.length)]) process.stdout.write(`${line}\n`);
  return 0;
}
