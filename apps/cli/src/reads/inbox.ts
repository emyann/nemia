/**
 * `nemia inbox [--all] [-l <key>=<value>]... [--show-labels] [-L <key>]... [-o wide]`, its words parsed against `objects`'
 * `INBOX_READ_WORDS`, read from the api: the cards, as the server prints them — the cards list (`GET /api/cards`, `labelSelector` given
 * again for another label query) asked for its `Table` (`TABLE_ACCEPT`), every page read (`everyPage`), printed by `tableLines` — then
 * how to start, queue or drop one, or why none is listed. The cards in play are those the api says are (each row's card,
 * `status.inPlay`); `--all` keeps every card. The last line names a card by its name, never a path. A word the read does not take is
 * refused by its words, naming the inbox's commands.
 */
import { Schema } from 'effect';
import { type Args, READ_BOUND_MS, type Table, tableLines } from 'objects';
import { switchArg } from '../commands/requests.ts';
import { asked, everyPage } from '../objects.ts';
import { AS_TABLE, tableAsked, tableOf } from './table.ts';

/** What a row's card says of its play: whether the api counts it in play. */
const InPlay = Schema.Struct({ status: Schema.Struct({ inPlay: Schema.Boolean }) });

/** Whether a row's object is a card the api counts in play. */
const inPlay = (row: Table['rows'][number]): boolean => {
  const read = Schema.decodeUnknownOption(InPlay)(row.object);
  return read._tag === 'Some' && read.value.status.inPlay;
};

/**
 * What `nemia inbox` prints after its table: with a card listed, how to start, queue or drop one, by its name, which a start takes on
 * this machine and on another's alike; with none, how many were left out for their run having ended (`ended`), else that none matches
 * where a selector was given, else that the inbox is empty.
 */
export const inboxSaid = (listed: number, selector: readonly string[], ended: number): string =>
  listed
    ? `\nstart one: nemia start <name> [--workflows <w>] [--repo <r>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>`
    : ended
      ? `no card in play${selector.length ? ` matches -l ${selector.join(' -l ')}` : ''}, and ${ended} whose run ended — list them with nemia inbox --all`
      : selector.length
        ? `no card of the inbox matches -l ${selector.join(' -l ')} — see them all with nemia inbox --show-labels`
        : `the inbox is empty — park an idea with nemia inbox add "<idea>"`;

/** Prints the cards `args` asks for, as the server prints their table, and how to start, queue or drop one; answers 0. */
export async function inbox(args: Args): Promise<number> {
  const all = switchArg(args, 'all');
  const read = tableAsked(args);
  const selector = [...read.selector];
  const listed = await asked(
    'inbox',
    (client) => everyPage((page) => client.cards.listAll({ query: selector.length ? { ...page, labelSelector: selector } : page })),
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
