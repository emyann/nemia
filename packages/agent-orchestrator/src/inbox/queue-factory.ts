/**
 * The factory a queued card asks for: a card is queued only where it could be started on its own, in a factory it names. Pure: the store
 * hands in the factories on file and whether a start that names none is allowed.
 */
import { DEFAULT_FACTORY, defaultStartRefusal } from '../factory/factory.ts';
import type { InboxCard } from './inbox.ts';

const NOT_STARTED = 'Nothing was started.';
const NOT_QUEUED = 'Nothing was queued.';

/**
 * Why `nemia inbox queue` will not queue this card for its factory, in words that name the fix, or null when it may. Refused: a card
 * with no `factory:` unless `unfactoredStarts`, naming the factories on file (`names`) or how one is filed; and `factory: default`,
 * whatever `unfactoredStarts` says (`defaultStartRefusal`). Whether the factory named is on file, and offers the workflow, is not judged
 * here: the pass that starts the card says it.
 */
export function queueFactoryRefusal(
  card: Pick<InboxCard, 'name' | 'factory'>,
  file: string,
  names: readonly string[],
  unfactoredStarts: boolean,
): string | null {
  if (card.factory === DEFAULT_FACTORY) {
    return defaultStartRefusal(`\`factory: <name>\` in ${file}`, names).replace(NOT_STARTED, NOT_QUEUED);
  }
  if (card.factory !== undefined || unfactoredStarts) return null;
  const which = names.length ? `one of ${[...names].sort().join(', ')}` : 'once one is filed: nemia factory add <name> --repo <root>';
  return `${file}: this card names no factory, and a queued card is started on its own only in the factory named for it. Write \`factory: <name>\` in its frontmatter — ${which}, then queue it again: nemia inbox queue ${card.name}. ${NOT_QUEUED}`;
}
