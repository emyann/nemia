/**
 * A page of the board her words link to by its whole address, cut into the path, search and hash the router's link takes
 * (`routeOfHref`, `lib/routeHref.ts`), so the link under her bubble (`Said`) reads and preloads the run its address names, never a run
 * whose id holds the address's query.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
const { routeOfHref } = await import('../src/lib/routeHref.ts');
const { Said } = await import('../src/components/conversation/Said.tsx');

/** A step's address as her brief writes it (`bring-what-waits`). */
const STEP = '/runs/gate-questions-e2e?step=design';

/** A router holding the run's page, `/runs/$runId`, whose loader keeps each run id it is asked to load in `loaded`. */
function runsRouter() {
  const loaded: string[] = [];
  const root = createRootRoute();
  const run = createRoute({
    getParentRoute: () => root,
    path: '/runs/$runId',
    loader: ({ params }) => void loaded.push(params.runId),
  });
  const router = createRouter({ routeTree: root.addChildren([run]), history: createMemoryHistory() });
  return { router, loaded };
}

/** `cut`'s search as a plain object: the router's parse returns one with no prototype, which a deep comparison tells apart. */
const plain = (cut: ReturnType<typeof routeOfHref>) => ({ ...cut, search: { ...cut.search } });

test('routeOfHref: the path, the query read as the router reads it, and the hash, apart', () => {
  const cases: [string, ReturnType<typeof routeOfHref>][] = [
    [STEP, { to: '/runs/gate-questions-e2e', search: { step: 'design' } }],
    ['/runs/r1', { to: '/runs/r1', search: {} }],
    ['/runs/r1?bar=step%3Ar1%2Fdesign#step-design', { to: '/runs/r1', search: { bar: 'step:r1/design' }, hash: 'step-design' }],
    ['/factories/f/proposals/p', { to: '/factories/f/proposals/p', search: {} }],
  ];
  for (const [href, cut] of cases) assert.deepEqual(plain(routeOfHref(href)), cut, href);
});

test("routeOfHref: a step's address preloads the run it names, and no run id holding its query", async () => {
  const { router, loaded } = runsRouter();
  await router.preloadRoute(routeOfHref(STEP) as never);
  assert.deepEqual(loaded, ['gate-questions-e2e']);
});

/**
 * Each set of options the router's link under `said` builds its location from as it renders, which are the options its preload on
 * hover is given: kept by watching `router.buildLocation` for the render alone.
 */
function linkOptions(router: ReturnType<typeof runsRouter>['router'], said: Parameters<typeof Said>[0]['said']): unknown[] {
  const built: unknown[] = [];
  const build = router.buildLocation.bind(router);
  router.buildLocation = ((options: Parameters<typeof build>[0]) => {
    built.push(options);
    return build(options);
  }) as typeof router.buildLocation;
  try {
    renderToStaticMarkup(
      // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` in the props; a .ts file has no JSX.
      createElement(RouterContextProvider, { router, children: createElement(Said, { said, marks: 'chat' }) }),
    );
  } finally {
    router.buildLocation = build;
  }
  return built;
}

test("Said: the link under her bubble to a step's address preloads the run it names, never one whose id holds the query", async () => {
  const { router, loaded } = runsRouter();
  const built = linkOptions(router, {
    kind: 'said',
    id: 'm1',
    who: 'Nemia',
    at: '2026-11-10T09:00:00.000Z',
    text: 'design of gate-questions-e2e asks how the card is cut.',
    markdown: true,
    yours: false,
    links: [{ words: 'design of gate-questions-e2e', href: STEP }],
  });
  assert.ok(built.length > 0, 'the link built its location through the router');
  for (const options of built) await router.preloadRoute(options as never);
  assert.deepEqual([...new Set(loaded)], ['gate-questions-e2e']);
});
