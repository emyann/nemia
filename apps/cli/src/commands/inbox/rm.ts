/**
 * `nemia inbox rm <name>`: one card dropped without starting it, through the Card's `delete` in the namespace the card is in (read across
 * namespaces, `namespaceOfCard`). A name with no card is the api's `Missing`, in its words, naming the cards there are.
 */
import { INBOX_RM_WORDS, type Args } from 'objects';
import { asked } from '../../objects.ts';
import { namespaceOfCard, said, textArg } from '../requests.ts';
import { fileOf } from './card-lines.ts';

const { name: COMMAND } = INBOX_RM_WORDS;

/**
 * `nemia inbox rm`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxRm(args: Args) {
  const name = textArg(args, 'name') ?? '';
  const namespace = await namespaceOfCard(COMMAND, name);
  const dropped = await asked(COMMAND, (c) => c.cards.delete({ params: { namespace, name } }));
  said([`${name}  dropped, and nothing started — ${fileOf(dropped)} removed`]);
  return 0;
}
