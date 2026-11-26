/**
 * `nemia inbox resend <name> [--workflow <name>]`: a started card sent on through the Card's `resend`, filed again as `<run>-resent`,
 * `--workflow` sent by its name in its body (a path refused), or none for its factory's card triggers. The card is read first, across
 * namespaces (`cards.getAll`), for the namespace its path takes.
 */
import { DEFAULT_NAMESPACE, INBOX_RESEND_WORDS, type Args, type CardResent } from 'objects';
import { asked } from '../../objects.ts';
import { said, textArg } from '../requests.ts';
import { factoryLine, workflowNamed } from './card-lines.ts';

const { name: COMMAND } = INBOX_RESEND_WORDS;

/**
 * What `nemia inbox resend` prints of the card sent on: the card filed and where it goes, the run it is handed, and the run cancelled or
 * why not.
 * @param sent What the api answers of the card sent on.
 */
const resentLines = (sent: CardResent) => {
  const { card, from } = sent;
  const name = card.metadata.name;
  const goes =
    card.spec.workflow === undefined
      ? `naming no workflow, for its factory's card triggers: where none selects it, queue it with nemia inbox queue ${name} --workflow <name>`
      : `queued at ${card.spec.queued ?? ''} on ${card.spec.workflow}: the tick starts it once its turn comes and a run slot is free`;
  const run = sent.cancelled
    ? [`${from.run}  cancelled: it waited on you, and the card sent on takes its place`]
    : sent.cancelLeft
      ? [`${from.run}  not cancelled: ${sent.cancelLeft}`]
      : [];
  return [`${name}  filed from ${from.card}, handed run ${from.run}${factoryLine(card)}`, `${name}  ${goes}`, ...run];
};

/**
 * `nemia inbox resend`'s runner, on the words parsed against its words.
 * @param args The words typed after the command's name, parsed against its words (`parseArgv`).
 */
export async function inboxResend(args: Args) {
  const name = textArg(args, 'name') ?? '';
  const workflow = workflowNamed(textArg(args, 'workflow'), COMMAND, `nemia inbox resend ${name}`);
  const before = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
  const params = { namespace: before.metadata.namespace ?? DEFAULT_NAMESPACE, name };
  const payload = workflow === undefined ? {} : { workflow };
  said(resentLines(await asked(COMMAND, (c) => c.cards.resend({ params, payload }))));
  return 0;
}
