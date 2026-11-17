import type { AnyRouter } from '@tanstack/react-router';

declare module 'react-aria-components' {
  interface RouterConfig {
    routerOptions: { resetScroll?: boolean };
  }
}

/**
 * What React Aria's `RouterProvider` calls to follow one of its links: the router's own navigation to the link's `href`, with the
 * link's `routerOptions` (`resetScroll: false` keeps the page where it stands, for a link that opens a sheet over it).
 *
 * @param router the router that navigates
 */
export const ariaNavigate =
  (router: AnyRouter) =>
  (href: string, options?: { resetScroll?: boolean }): void =>
    void router.navigate({ href, ...options });
