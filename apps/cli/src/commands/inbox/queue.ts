/**
 * `nemia inbox queue <name> [--workflow <name>] [--off]`: a card marked to start on its own through the Card's `queue`, `--workflow` sent
 * by its name in its query (a path refused), or with `--off` the mark taken back through its `unqueue`. The card is read first, across
 * namespaces (`cards.getAll`), for the namespace its path takes and whether it was queued.
 */
import { DEFAULT_NAMESPACE, INBOX_QUEUE_WORDS, type Args, type Card } from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';
import { repoFactory, workflowNamed } from './card-lines.ts';

const { name: COMMAND } = INBOX_QUEUE_WORDS;

/** What `nemia inbox queue` prints of the card queued: when and where in the queue, on what, and how the tick starts it. */
export const queuedLines = (card: Card): string[] => {
  const name = card.metadata.name;
  const { place, queueLength, factoryRepo } = card.status;
  const at = queueLength === undefined ? `${place ?? '?'} in the queue` : `${place ?? '?'} of ${queueLength}`;
  const where = card.spec.repo
    ? ''
    : factoryRepo
      ? `, on ${factoryRepo}, its factory's one repository`
      : ', on the repository nemia up runs in';
  return [
    `${name}  queued at ${card.spec.queued ?? ''}, ${at}  workflow: ${card.spec.workflow ?? ''}${repoFactory(card)}`,
    `the tick starts it on its own once its turn comes and a run slot is free${where} — take it back with nemia inbox queue ${name} --off`,
  ];
};

/** What `nemia inbox queue --off` prints, given whether the card was queued before. */
const takenBackLines = (name: string, was: boolean): string[] =>
  was
    ? [`${name}  taken back: it no longer starts on its own — start it with nemia start ${name}`]
    : [`${name}  not queued — nothing to take back`];

/** `nemia inbox queue`'s runner, on the words parsed against its words. */
export async function inboxQueue(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const workflow = workflowNamed(textArg(args, 'workflow'), COMMAND, `nemia inbox queue ${name}`);
  const before = await asked(COMMAND, (c) => c.cards.getAll({ params: { name } }));
  const params = { namespace: before.metadata.namespace ?? DEFAULT_NAMESPACE, name };
  if (switchArg(args, 'off')) {
    await asked(COMMAND, (c) => c.cards.unqueue({ params }));
    said(takenBackLines(name, before.spec.queued !== undefined));
    return 0;
  }
  const query = workflow === undefined ? {} : { workflow };
  said(queuedLines(await asked(COMMAND, (c) => c.cards.queue({ params, query }))));
  return 0;
}
