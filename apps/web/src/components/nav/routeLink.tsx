import { createLink } from '@tanstack/react-router';
import type { ComponentType } from 'react';

/**
 * A React Aria link to a route. `createLink` gives it the router's typed `to`, the `href` built from it, preloading on intent and
 * `aria-current`; the root's `RouterProvider` navigates, for a click and for the keyboard alike.
 *
 * TanStack's click handler is left off, so a link navigates once. Enter on a link makes the browser click it on keydown, and React Aria
 * lets that click through to the provider, which navigates. On keyup React Aria calls the link's `onClick`, with a click it makes
 * itself, which TanStack's handler would take as a second navigation to the same place. An `onClick` given to the link is dropped with
 * TanStack's: run something on a press with `onPress`.
 */
export function routeLink<P extends object>(Link: ComponentType<P>) {
  return createLink(({ onClick: _router, ...props }: P & { onClick?: never }) => <Link {...(props as P)} />);
}
