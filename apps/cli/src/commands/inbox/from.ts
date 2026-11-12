/**
 * `nemia inbox from <name> <run>... | --off`: the runs a card's run is handed as context (its `from:`) set, or taken off. The api writes a
 * card whole (`cards.update`), so the card is read first across namespaces (`cards.getAll`) and written back at the version it was read
 * at, its `from:` the runs named, or none for `--off`.
 */
import { DEFAULT_NAMESPACE, INBOX_FROM_WORDS, runsNamed, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';
import { fileOf } from './card-lines.ts';

const { name: COMMAND } = INBOX_FROM_WORDS;

/** What `nemia inbox from` prints of the card written, beside the runs it named before (`was`). */
export const fromLines = (card: Card, was: readonly string[]): string[] => {
  const name = card.metadata.name;
  const from = card.spec.from ?? [];
  return from.length
    ? [`${name}  from: ${from.join(', ')} — its run is handed what each concluded, as context, and waits on none (${fileOf(card)})`]
    : [`${name}  ${was.length ? `from: taken off (was ${was.join(', ')})` : 'no from: — nothing to take off'}`];
};

/** `nemia inbox from`'s runner, on the words parsed against its words. */
export async function inboxFrom(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const runs = switchArg(args, 'off') ? [] : runsNamed(args);
  const current = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
  const { from: was, ...rest } = current.spec;
  const { resourceVersion } = current.metadata;
  const written = await asked(COMMAND, (c) =>
    c.cards.update({
      params: { namespace: current.metadata.namespace ?? DEFAULT_NAMESPACE, name },
      payload: {
        metadata: resourceVersion === undefined ? {} : { resourceVersion },
        spec: runs.length ? { ...rest, from: [...runs] } : rest,
      },
    }),
  );
  said(fromLines(written, was ?? []));
  return 0;
}
