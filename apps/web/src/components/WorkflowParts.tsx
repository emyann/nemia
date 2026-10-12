/**
 * The parts the Workflows page's cards and a workflow's own page share: where a workflow is read from, your workflows' folder, why
 * one has no builder, and what either page says of a place it lists no workflows in.
 */
import type { ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { storeQuery, type WorkflowListing } from '../lib/api';
import { fromWord, type ListPlace } from '../lib/factories';
import { repoName } from '../lib/factory';
import { container } from '../lib/meaning';

/** Where a workflow is read from, read in `factory` (`fromWord`): yours, this repository's, or the factory's. */
export function FromBadge({ from, factory }: { from: WorkflowListing['from']; factory?: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
        from === 'yours' ? container.grey : 'bg-muted text-muted-foreground'
      }`}
    >
      {fromWord(from, factory)}
    </span>
  );
}

/** Your workflows' folder, as the api answers it (`storeQuery`). */
export function YoursFolder() {
  const { data: store } = useSuspenseQuery(storeQuery);
  return <code className="font-mono text-xs">{store.workflows}/</code>;
}

/**
 * Why `workflow` has no builder, or nothing for one of yours that reads: the board writes only yours, and nothing into a checkout, nor,
 * read in the named factory `factory`, into a factory's folder; and the builder puts back the steps a folder reads as, so one of yours that
 * does not read is fixed by hand first.
 */
export function NoBuilder({ workflow: { from, error }, factory }: { workflow: WorkflowListing; factory?: string }) {
  if (from === 'repo' && factory !== undefined)
    return (
      <p data-no-builder className="text-xs text-muted-foreground">
        No builder: the board writes only yours, and nothing into a factory&apos;s folder.
      </p>
    );
  if (from === 'repo')
    return (
      <p data-no-builder className="text-xs text-muted-foreground">
        No builder: the board writes only yours, and nothing into this checkout. To build it, copy the folder into <YoursFolder />, build it
        there, and copy it back into the repository by hand.
      </p>
    );
  if (!error) return null;
  return (
    <p data-no-builder className="text-xs text-muted-foreground">
      No builder until the folder reads: the builder puts back the steps a folder reads as. Fix its files by hand first.
    </p>
  );
}

/**
 * What a page says where the address's place lists no workflows (`ListPlace`): for a factory on several repositories, that it reads on
 * one, each a link `onRepo` draws by its folder's name; for one refused, why; and after either, `back`, the way out. Nothing for a place
 * that lists.
 */
export function Unplaced({
  where,
  onRepo,
  back,
}: {
  where: ListPlace;
  onRepo: (repo: string, name: string) => ReactNode;
  back: ReactNode;
}) {
  if (where.kind === 'pick')
    return (
      <p data-pick-repo={where.factory} className="text-sm text-muted-foreground">
        The factory <span className="font-mono">{where.factory}</span> works on {where.repos.length} repositories, and its workflows are
        read on one:{' '}
        {where.repos.map((repo, at) => (
          <span key={repo} title={repo}>
            {at > 0 && ', '}
            {onRepo(repo, repoName(repo))}
          </span>
        ))}
        . {back}.
      </p>
    );
  if (where.kind === 'refused')
    return (
      <p data-unplaced={where.factory} className="text-sm text-yours">
        {where.why} {back}.
      </p>
    );
  return null;
}
