import type { QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
});

function Root() {
  return (
    <>
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            hkb
          </Link>
          <Link to="/" className="text-sm text-neutral-500 [&.active]:text-neutral-900 dark:[&.active]:text-neutral-100">
            Runs
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
      <ReactQueryDevtools buttonPosition="bottom-left" />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  );
}
