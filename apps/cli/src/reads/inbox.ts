/**
 * `nemia inbox [--all] [--search <words>] [--phase <phase>] [--sort newest|oldest|name] [--limit <n>] [--continue <token>] [-l
 * <key>=<value>]...
 * [--show-labels] [-L <key>]... [-o wide]`, its words parsed against `objects`' `INBOX_READ_WORDS`, read from the api: one page of the
 * cards, as the server prints them — the cards list (`GET /api/cards`, `labelSelector` given again for another label query) asked for its
 * `Table` (`TABLE_ACCEPT`), printed by `tableLines`. The cards in play are those the api is asked for (`fieldSelector`
 * `status.inPlay=true`); `--all` keeps every card; `--search`, `--phase` and `--sort` are the list's `search`, `status.phase` and
 * `orderBy`. A page is the list's own, a `--limit` of it, and the last line names the `--continue` token of the next. Then how to start,
 * queue or drop one, or why none is listed. A card is named by its name, never a path. A word the read does not take is refused by its
 * words, naming the inbox's commands.
 */
import { Effect } from 'effect';
import { type Args, INBOX_SORTS, READ_BOUND_MS, tableLines } from 'objects';
import { switchArg, textArg } from '../commands/requests.ts';
import { asked } from '../objects.ts';
import { AS_TABLE, tableAsked, tableOf } from './table.ts';

/** The fieldSelector terms a read asks: the cards in play unless `all`, and those in `phase`. */
const selectorOf = (all: boolean, phase: string | undefined) =>
  [...(all ? [] : ['status.inPlay=true']), ...(phase === undefined ? [] : [`status.phase=${phase}`])].join(',');

/**
 * What `nemia inbox` prints after its table: with a card listed, how to start, queue or drop one, by its name, which a start takes on
 * this machine and on another's alike, and where the next page is; with none, how many were left out for their run having ended
 * (`ended`), else that none matches where a selector or words were given, else that the inbox is empty.
 * @param listed How many cards the table shows.
 * @param selector The label selectors typed with `-l`, none where none was.
 * @param ended How many cards were left out for their run having ended.
 * @param narrowed Whether words or a phase were typed.
 * @param next The token of the next page, none on the last.
 */
const inboxSaid = (listed: number, selector: readonly string[], ended: number, narrowed: boolean, next: string | undefined) =>
  listed
    ? `\nstart one: nemia start <name> [--workflows <w>] [--factory <f>] — queue one: nemia inbox queue <name> — drop one: nemia inbox rm <name>${next === undefined ? '' : `\nmore: nemia inbox --continue ${next}`}`
    : ended
      ? `no card in play${selector.length ? ` matches -l ${selector.join(' -l ')}` : ''}, and ${ended} whose run ended — list them with nemia inbox --all`
      : selector.length || narrowed
        ? `no card of the inbox matches ${selector.length ? `-l ${selector.join(' -l ')}` : 'what you asked'} — see them all with nemia inbox --show-labels`
        : `the inbox is empty — park an idea with nemia inbox add "<idea>"`;

/**
 * Prints the page of cards `args` asks for, as the server prints their table, and how to start, queue or drop one; answers 0.
 * @param args The command's words as parsed against `INBOX_READ_WORDS`.
 */
export async function inbox(args: Args) {
  const all = switchArg(args, 'all');
  const read = tableAsked(args);
  const selector = [...read.selector];
  const search = textArg(args, 'search');
  const phase = textArg(args, 'phase');
  const sort = textArg(args, 'sort');
  const fieldSelector = selectorOf(all, phase);
  const query = {
    ...(selector.length ? { labelSelector: selector } : {}),
    ...(fieldSelector === '' ? {} : { fieldSelector }),
    ...(search === undefined ? {} : { search }),
    ...(sort === undefined ? {} : { orderBy: INBOX_SORTS[sort as keyof typeof INBOX_SORTS] }),
    ...(textArg(args, 'limit') === undefined ? {} : { limit: textArg(args, 'limit') }),
    ...(textArg(args, 'continue') === undefined ? {} : { continue: textArg(args, 'continue') }),
  };
  const listed = await asked('inbox', (client) => client.cards.listAll({ query }), process.env, READ_BOUND_MS, AS_TABLE);
  const table = tableOf('inbox', listed);
  const left = !all && table.rows.length === 0 && table.metadata.continue === undefined ? await endedCount(selector, search) : 0;
  const lines = tableLines(table, read.asked);
  const narrowed = search !== undefined || phase !== undefined;
  for (const line of [...lines, inboxSaid(table.rows.length, selector, left, narrowed, table.metadata.continue)])
    process.stdout.write(`${line}\n`);
  return 0;
}

/**
 * How many cards a read that listed none would have listed with `--all`: the list asked for a page of one, its counts of the phases that
 * mean a run ended read (`metadata.counts`).
 * @param selector The label selectors typed with `-l`.
 * @param search The words typed with `--search`, if any.
 */
const endedCount = (selector: readonly string[], search: string | undefined) =>
  asked(
    'inbox',
    (client) =>
      Effect.map(
        client.cards.listAll({
          query: { limit: '1', ...(selector.length ? { labelSelector: selector } : {}), ...(search === undefined ? {} : { search }) },
        }),
        ({ metadata }) => ('counts' in metadata ? metadata.counts.done + metadata.counts.failed + metadata.counts.cancelled : 0),
      ),
    process.env,
  );
