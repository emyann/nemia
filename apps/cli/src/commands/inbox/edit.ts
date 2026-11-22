/**
 * `nemia inbox edit <name> "<card>"|<file>`: a card's body and keys replaced by a card's text, through the Card's `edit`, its name and
 * labels kept, its `after:` the card's wait, a text with none taking the wait off, which the answer says. A file is read here and its
 * text sent; a folder is refused, naming the command. The card is found across namespaces first (`cards.getAll`) and its text sent
 * with no version: the last writer wins, as a write that names none.
 */
import { DEFAULT_NAMESPACE, headline, INBOX_EDIT_WORDS, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';
import { afterLines, fileOf, textOrFile } from './card-lines.ts';

const { name: COMMAND } = INBOX_EDIT_WORDS;

/** How a queued card not started came to be queued: by hand, or by the card triggers of its factory that select it. */
const queuedHow = (card: Card) => {
  if (card.spec.queued !== undefined) return 'by hand';
  const triggers = card.status.queuedBy ?? [];
  if (triggers.length === 0) return undefined;
  return `by the card trigger${triggers.length > 1 ? 's' : ''} ${triggers.join(', ')}`;
};

/**
 * The lines of a card's wait taken off by its edit: the cards it waited on, and, where it is queued and not started, that it may start
 * on the next pass and how to put the wait back.
 */
const takenOffLines = (card: Card, was: readonly string[]) => {
  const how = card.status.runs.length === 0 ? queuedHow(card) : undefined;
  return [
    `  after: taken off — it waited on ${was.join(', ')}, and now waits on none`,
    ...(how === undefined
      ? []
      : [
          `  it is queued ${how} and may start on the next pass — put the wait back with nemia inbox edit ${card.metadata.name} <file> naming after: ${was.join(', ')}`,
        ]),
  ];
};

/** The lines of the card's wait after its edit, beside the cards it waited on before it (`was`). */
const waitLines = (card: Card, was: readonly string[]) => {
  const after = card.spec.after ?? [];
  if (after.length === 0) return was.length > 0 ? takenOffLines(card, was) : [];
  const changed = was.length > 0 && was.join(', ') !== after.join(', ');
  return afterLines(after, changed ? ` (was ${was.join(', ')})` : '');
};

/**
 * What `nemia inbox edit` prints of the card written, beside the card as it was read (`before`): its name kept, its title now, and its
 * wait — the cards it waits on, as `nemia inbox add` says them, with those it waited on where they changed, or the wait taken off.
 * @param card The card as the api answers it after the write.
 * @param before The card as it was read before the write.
 */
export const editedLines = (card: Card, before: Card) => {
  const { name } = card.metadata;
  const title = headline(card.spec.body ?? '');
  const unchanged = card.metadata.resourceVersion === before.metadata.resourceVersion;
  return [
    `${name}  ${title.slice(0, 56)}${card.spec.workflow ? `  workflow: ${card.spec.workflow}` : ''}`,
    unchanged ? `unchanged: ${fileOf(card)} already reads as that text` : `edited: ${fileOf(card)} — its name kept, ${name}`,
    ...waitLines(card, before.spec.after ?? []),
  ];
};

/**
 * `nemia inbox edit`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxEdit(args: Args) {
  const name = textArg(args, 'name') ?? '';
  const source = textOrFile(textArg(args, 'source') ?? '', COMMAND, `nemia inbox edit ${name} ./card.md`);
  const before = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
  const namespace = before.metadata.namespace ?? DEFAULT_NAMESPACE;
  const written = await asked(COMMAND, (c) => c.cards.edit({ params: { namespace, name }, payload: { source } }));
  said(editedLines(written, before));
  return 0;
}
