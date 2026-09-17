import { createLink } from '@tanstack/react-router';
import type { ComponentType } from 'react';

/**
 * A React Aria link to a route. `createLink` gives it the router's typed `to`, the `href` built from it, preloading on intent and
 * `aria-current`; the root's `RouterProvider` navigates, for a click and for the keyboard alike.
 *
 * TanStack's click handler is left off, and one navigation is left. Enter on a link makes the browser click it on keydown, and React Aria
 * lets that click through to the provider, which navigates. On keyup React Aria calls the link's `onClick`, with a click it makes
 * itself, and TanStack's handler would take it as a second navigation to the same place: the route loaded twice, measured. So run
 * something on a press with `onPress`: an `onClick` given to the link is dropped with TanStack's.
 */
export function routeLink<P extends object>(Link: ComponentType<P>) {
  return createLink(({ onClick: _router, ...props }: P & { onClick?: unknown }) => <Link {...(props as P)} />);
}
