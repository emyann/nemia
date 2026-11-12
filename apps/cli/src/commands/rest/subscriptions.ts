/**
 * The feed's subscriptions: `nemia subscribe <name> <task> [-l …]… [--digest-every <m>] [--at-least <level>]`
 * (`subscriptions.subscribe`), a long-lived task given one, and `nemia unsubscribe <name>` (`subscriptions.unsubscribe`), one taken
 * away. The api judges the task, the name and each label query; a former word one of them still says is said on stderr, in the api's
 * words (`Subscribed.hints`).
 */
import { type Args, SUBSCRIBE_WORDS, UNSUBSCRIBE_WORDS } from 'objects';
import { asked } from '../../objects.ts';
import { amountArg, listArg, said, textArg } from '../requests.ts';

/** `nemia subscribe`'s runner: the subscription put, said as what its task is told and when. */
export async function subscribe(args: Args): Promise<number> {
  const name = textArg(args, 'name') ?? '';
  const selectors = listArg(args, 'selectors');
  const digestEvery = amountArg(args, 'digestEvery');
  const atLeast = textArg(args, 'atLeast');
  const payload = {
    task: textArg(args, 'task') ?? '',
    ...(selectors.length ? { selectors } : {}),
    ...(digestEvery === undefined ? {} : { digestEvery }),
    ...(atLeast === undefined ? {} : { atLeast }),
  };
  const { subscription: s, hints } = await asked(SUBSCRIBE_WORDS.name, (c) => c.subscriptions.subscribe({ params: { name }, payload }));
  said([
    `subscribed ${name}: ${s.task} is told at once of a line taken by ${s.selectors.join(' or ')}, and of the rest in a digest every ` +
      `${s.digestEvery} minute${s.digestEvery === 1 ? '' : 's'} with no wake.`,
  ]);
  for (const hint of hints ?? []) process.stderr.write(`nemia subscribe: ${hint}\n`);
  return 0;
}

/** `nemia unsubscribe`'s runner: the subscription taken away. */
export async function unsubscribe(args: Args): Promise<number> {
  const { name } = await asked(UNSUBSCRIBE_WORDS.name, (c) =>
    c.subscriptions.unsubscribe({ params: { name: textArg(args, 'name') ?? '' } }),
  );
  said([`unsubscribed ${name}: its task is told nothing more of the feed.`]);
  return 0;
}
