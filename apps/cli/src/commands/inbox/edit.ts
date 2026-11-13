/**
 * `nemia inbox edit <name> "<card>"|<file>`: a card's body and keys replaced by a card's text, through the Card's `edit`, its name and
 * labels kept. A file is read here and its text sent; a folder is refused, naming the command. The card is found across namespaces
 * first (`cards.getAll`) and its text sent with no version: the last writer wins, as a write that names none.
 */
import { DEFAULT_NAMESPACE, headline, INBOX_EDIT_WORDS, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';
import { fileOf, textOrFile } from './card-lines.ts';

const { name: COMMAND } = INBOX_EDIT_WORDS;

/** What `nemia inbox edit` prints of the card written, beside the card as it was read (`before`): its name kept and its title now. */
export const editedLines = (card: Card, before: Card): string[] => {
  const { name } = card.metadata;
  const title = headline(card.spec.body ?? '');
  const unchanged = card.metadata.resourceVersion === before.metadata.resourceVersion;
  return [
    `${name}  ${title.slice(0, 56)}${card.spec.workflow ? `  workflow: ${card.spec.workflow}` : ''}`,
    unchanged ? `unchanged: ${fileOf(card)} already reads as that text` : `edited: ${fileOf(card)} — its name kept, ${name}`,
  ];
};

/** `nemia inbox edit`'s runner, on the words parsed against its words. */
export async function inboxEdit(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const source = textOrFile(textArg(args, 'source') ?? '', COMMAND, `nemia inbox edit ${name} ./card.md`);
  const before = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
  const namespace = before.metadata.namespace ?? DEFAULT_NAMESPACE;
  const written = await asked(COMMAND, (c) => c.cards.edit({ params: { namespace, name }, payload: { source } }));
  said(editedLines(written, before));
  return 0;
}
