import { useRouterState } from '@tanstack/react-router';
import type { PagePlace } from '@/lib/api/workflows';
import { seatFactory, seatOf, type Seat } from './nav';

/** Where the page the router shows sits in the frame (`seatOf` of its path): the store's level or one factory's, none for no route. */
export function useSeat() {
  return seatOf(useRouterState({ select: (state) => state.location.pathname })) satisfies Seat | undefined;
}

/** The place the page the router shows is read in: the factory its path names (`seatOf`), and the repository its search names. */
export function usePagePlace() {
  const factory = seatFactory(useSeat());
  const repo: unknown = useRouterState({ select: (state) => (state.location.search as { repo?: unknown }).repo });
  return {
    ...(factory !== undefined && { factory }),
    ...(typeof repo === 'string' && repo !== '' ? { repo } : {}),
  } satisfies PagePlace as PagePlace;
}
