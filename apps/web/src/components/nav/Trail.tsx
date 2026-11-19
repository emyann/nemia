import { linkOptions, useRouter } from '@tanstack/react-router';
import { Breadcrumb, Breadcrumbs } from '../ui/ds';

/** Where a level of a trail leads, as `linkOptions` gives a link: a route, its params, its search and its hash. */
type TrailTo = {
  readonly to: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly search?: Readonly<Record<string, unknown>>;
  readonly hash?: string;
};

/** One level of a page's trail: its name, and where it leads; the last level is the page itself, which leads nowhere. */
type TrailLevel = { readonly name: string; readonly to?: TrailTo };

/**
 * Where a deep page is, in its head: the kit's `Breadcrumbs`, a level a link to its page, from the factory down to the page itself, which
 * is the last and no link. Each level's address is built by the router from its route (`buildLocation`), and the root's `RouterProvider`
 * navigates it, for a click and for Enter alike. Its `levels` run from the factory's first to the page's own last.
 */
export function Trail({ levels }: { levels: readonly TrailLevel[] }) {
  const router = useRouter();
  return (
    <nav aria-label="Where you are" data-trail>
      <Breadcrumbs>
        {levels.map((level, at) => (
          <Breadcrumb key={at} id={at} href={level.to && router.buildLocation(level.to).href}>
            {level.name}
          </Breadcrumb>
        ))}
      </Breadcrumbs>
    </nav>
  );
}

/**
 * The first level of a page under a factory's path: the factory, leading to its floor; none at the store's level.
 *
 * @param factory the factory the page sits in, none at the store's level
 */
export const factoryLevel = (factory: string | undefined) =>
  (factory === undefined
    ? []
    : [{ name: factory, to: linkOptions({ to: '/factories/$factory', params: { factory } }) }]) satisfies TrailLevel[] as TrailLevel[];

/**
 * The Runs level: the factory's runs under its path, else every factory's.
 *
 * @param factory the factory the page sits in, none at the store's level
 */
export const runsLevel = (factory: string | undefined) => ({
  name: 'Runs',
  to: factory === undefined ? linkOptions({ to: '/runs' }) : linkOptions({ to: '/factories/$factory/runs', params: { factory } }),
});

/**
 * The level of one run, by its name, leading to its page: under the factory's path, else at the store's level.
 *
 * @param factory the factory the page sits in, none at the store's level
 * @param runId the run's id
 * @param name what the run is called, its id while it is still read
 */
export const runLevel = (factory: string | undefined, runId: string, name: string) => ({
  name,
  to:
    factory === undefined
      ? linkOptions({ to: '/runs/$runId', params: { runId } })
      : linkOptions({ to: '/factories/$factory/runs/$runId', params: { factory, runId } }),
});

/**
 * The Inbox level: the factory's inbox under its path, else every factory's.
 *
 * @param factory the factory the page sits in, none at the store's level
 */
export const inboxLevel = (factory: string | undefined) => ({
  name: 'Inbox',
  to: factory === undefined ? linkOptions({ to: '/inbox' }) : linkOptions({ to: '/factories/$factory/inbox', params: { factory } }),
});
