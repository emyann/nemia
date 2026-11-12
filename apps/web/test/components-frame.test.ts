/**
 * The board's frame components (`src/components/frame/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { routedWith } from './markup-fixtures.ts';

const { createElement } = await import('react');

/** The frame's tab strip at `path`, inside a router, around a page that reads `the page`. */
async function frameTabsAt(path: string): Promise<string> {
  const { FrameTabs } = await import('../src/components/frame/FrameTabs.tsx');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  return routedWith(createElement(FrameTabs, { path, children: createElement('p', { 'data-page': '' }, 'the page') }));
}

/** The strip's tabs, in their order: each one's tag, `href`, name and whether it is selected. */
const tabsIn = (html: string) =>
  [...(/<div[^>]*role="tablist"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '').matchAll(/<(\w+)\b([^>]*role="tab"[^>]*)>([^<]*)</g)].map(
    ([, tag, attrs, name]) => ({
      tag,
      href: /href="([^"]*)"/.exec(attrs ?? '')?.[1],
      name,
      selected: /aria-selected="true"/.test(attrs ?? ''),
    }),
  );

test("a tab's page is drawn under the strip of Settings' tabs, each a link to its own address, its own alone selected", async () => {
  const html = await frameTabsAt('/capabilities');
  assert.match(html, /role="tablist"[^>]*aria-label="Settings"|aria-label="Settings"[^>]*role="tablist"/, html);
  assert.deepEqual(tabsIn(html), [
    { tag: 'a', href: '/settings', name: 'Settings', selected: false },
    { tag: 'a', href: '/capabilities', name: 'Capabilities', selected: true },
    { tag: 'a', href: '/setup', name: 'Setup', selected: false },
  ]);
  assert.match(
    html,
    /<div[^>]*role="tabpanel"[^>]*>\s*<p data-page="">the page<\/p>/,
    `the page sits in the selected tab's panel: ${html}`,
  );
  assert.doesNotMatch(
    /<div[^>]*role="tabpanel"[^>]*>/.exec(html)?.[0] ?? '',
    /\btext-body-medium\b/,
    "the panel leaves the page's text its own size",
  );
});

test('a page with one view draws no strip: its page bare', async () => {
  for (const path of ['/agents', '/machinesx']) {
    const html = await frameTabsAt(path);
    assert.doesNotMatch(html, /role="tab/, `refused: ${path} has no tabs`);
    assert.equal(html, '<p data-page="">the page</p>', path);
  }
});

test('REFUSED: the sidebar is drawn folded only where the cookie keeps sidebar_state=false, whole', async () => {
  const { sidebarOpenOf } = await import('../src/components/ui/sidebar.tsx');
  assert.equal(sidebarOpenOf('a=1; sidebar_state=false'), false);
  assert.equal(sidebarOpenOf('sidebar_state=false'), false);
  for (const open of ['', 'sidebar_state=true', 'sidebar_statex=false', 'xsidebar_state=false', 'a=sidebar_state=false'])
    assert.equal(sidebarOpenOf(open), true, open);
});

/** A piece of the readiness read, of `cost`, in `state`. */
const pieceOf = (name: string, cost: 'run' | 'server', state: 'met' | 'missing') => ({
  name,
  area: cost === 'run' ? ('harness' as const) : ('service' as const),
  state,
  message: `${name} is ${state}`,
  fixes: [],
  cost,
});

/** The setup banner at `/runs`, over a readiness read whose pieces are `pieces` and whose `ran` is `ran`. */
async function bannerOver(pieces: ReturnType<typeof pieceOf>[], ran: boolean): Promise<string> {
  const { SetupBanner } = await import('../src/components/frame/SetupBanner.tsx');
  const read = { ready: pieces.every((p) => p.state !== 'missing'), pieces, ran };
  return routedWith(createElement(SetupBanner, { path: '/runs' }), [[['readiness'], read]]);
}

/** The banner's words, its markup's tags taken out. */
const wordsOf = (html: string): string => html.replace(/<[^>]*>/g, '');

test('the setup banner is raised by a missing piece a run waits on alone, says what the missing pieces cost, and "first run" only where no run was ever started', async (t) => {
  await t.test(
    'REFUSED: a server whose factories have run, missing only linger, which no run waits on: no banner, so no "first run" nor "not ready"',
    async () => {
      const html = await bannerOver([pieceOf('claude-token', 'run', 'met'), pieceOf('linger', 'server', 'missing')], true);
      assert.equal(html, '', 'a piece advised is listed on Setup and raises no banner');
    },
  );
  await t.test('a server where no run was ever started, missing a piece a run waits on: before its first run', async () => {
    const said = wordsOf(await bannerOver([pieceOf('claude-token', 'run', 'missing'), pieceOf('linger', 'server', 'met')], false));
    assert.match(said, /first run/);
    assert.doesNotMatch(said, /no run waits on/);
  });
  await t.test('a server whose factories have run, missing a piece a run waits on and one that keeps it up: each said apart', async () => {
    const said = wordsOf(await bannerOver([pieceOf('claude-token', 'run', 'missing'), pieceOf('linger', 'server', 'missing')], true));
    assert.match(said, /a piece a run waits on/);
    assert.match(said, /keeps the server up or open/);
    assert.doesNotMatch(said, /first run|not ready/);
  });
  await t.test('REFUSED: a read with nothing missing draws no banner', async () => {
    assert.equal(await bannerOver([pieceOf('linger', 'server', 'met')], true), '');
  });
});
