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
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import './tsx.ts';
import { routedWith } from './markup.fixture.ts';

const { createElement } = await import('react');

/** The frame's tab strip at `path`, inside a router, around a page that reads `the page`. */
async function frameTabsAt(path: string) {
  const { FrameTabs } = await import('../src/components/frame/FrameTabs.tsx');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  return routedWith(createElement(FrameTabs, { path, children: createElement('p', { 'data-page': '' }, 'the page') }));
}

/**
 * The strip's tabs, in their order: each one's tag, `href`, name (the text it holds, whatever it is drawn in) and whether it is
 * selected.
 */
const tabsIn = (html: string) =>
  [
    ...(/role="tablist"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[1] ?? '').matchAll(
      /<(a|div)\b([^>]*role="tab"[^>]*)>([\s\S]*?)<\/\1>/g,
    ),
  ].map(([, tag, attrs, inner]) => ({
    tag,
    href: /href="([^"]*)"/.exec(attrs ?? '')?.[1],
    name: (inner ?? '').replace(/<[^>]*>/g, ''),
    selected: /aria-selected="true"/.test(attrs ?? ''),
  }));

test("a tab's page is drawn under the strip of Settings' tabs, each a link to its own address, its own alone selected", async () => {
  const html = await frameTabsAt('/capabilities');
  assert.match(html, /role="tablist"[^>]*aria-label="Settings"|aria-label="Settings"[^>]*role="tablist"/, html);
  assert.deepEqual(tabsIn(html), [
    { tag: 'a', href: '/settings', name: 'Settings', selected: false },
    { tag: 'a', href: '/capabilities', name: 'Capabilities', selected: true },
    { tag: 'a', href: '/setup', name: 'Setup', selected: false },
    { tag: 'a', href: '/tokens', name: 'Tokens', selected: false },
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

test('REFUSED: the factory pane is drawn folded only where the cookie keeps sidebar_state=false, whole', async () => {
  const { paneOpenOf } = await import('../src/lib/frameFold.ts');
  assert.equal(paneOpenOf('a=1; sidebar_state=false'), false);
  assert.equal(paneOpenOf('sidebar_state=false'), false);
  for (const open of ['', 'sidebar_state=true', 'sidebar_statex=false', 'xsidebar_state=false', 'a=sidebar_state=false'])
    assert.equal(paneOpenOf(open), true, open);
});

test("the person's fold is kept as the cookie the pane is read from, for a week across the board", async () => {
  const { paneCookie, paneOpenOf } = await import('../src/lib/frameFold.ts');
  for (const open of [true, false]) {
    const [pair, ...attributes] = paneCookie(open).split('; ');
    assert.equal(paneOpenOf(pair ?? ''), open);
    assert.deepEqual(attributes, ['path=/', `max-age=${60 * 60 * 24 * 7}`]);
  }
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
async function bannerOver(pieces: ReturnType<typeof pieceOf>[], ran: boolean) {
  const { SetupBanner } = await import('../src/components/frame/SetupBanner.tsx');
  const read = { ready: pieces.every((p) => p.state !== 'missing'), pieces, ran };
  return routedWith(createElement(SetupBanner, { path: '/runs' }), [[['readiness'], read]]);
}

/** The banner's words, its markup's tags taken out. */
const wordsOf = (html: string) => html.replace(/<[^>]*>/g, '');

describe('the setup banner is raised by a missing piece a run waits on alone, says what the missing pieces cost, and "first run" only where no run was ever started', () => {
  test('REFUSED: a server whose factories have run, missing only linger, which no run waits on: no banner, so no "first run" nor "not ready"', async () => {
    const html = await bannerOver([pieceOf('claude-token', 'run', 'met'), pieceOf('linger', 'server', 'missing')], true);
    assert.equal(html, '', 'a piece advised is listed on Setup and raises no banner');
  });
  test('a server where no run was ever started, missing a piece a run waits on: before its first run', async () => {
    const said = wordsOf(await bannerOver([pieceOf('claude-token', 'run', 'missing'), pieceOf('linger', 'server', 'met')], false));
    assert.match(said, /first run/);
    assert.doesNotMatch(said, /no run waits on/);
  });
  test('a server whose factories have run, missing a piece a run waits on and one that keeps it up: each said apart', async () => {
    const said = wordsOf(await bannerOver([pieceOf('claude-token', 'run', 'missing'), pieceOf('linger', 'server', 'missing')], true));
    assert.match(said, /a piece a run waits on/);
    assert.match(said, /keeps the server up or open/);
    assert.doesNotMatch(said, /first run|not ready/);
  });
  test('REFUSED: a read with nothing missing draws no banner', async () => {
    assert.equal(await bannerOver([pieceOf('linger', 'server', 'met')], true), '');
  });
});

test("presenceWord: the machine bar says Nemia's session in a word, down first, then answering, then what she asks", async () => {
  const { presenceWord } = await import('../src/components/frame/MachineBar.tsx');
  const here = { runsWaiting: 0, asksWaiting: 0, notSent: false, down: false, resting: false, answering: false, unread: 0 };
  assert.equal(presenceWord(here), 'Nemia here');
  assert.equal(presenceWord({ ...here, down: true, answering: true }), 'Nemia down');
  assert.equal(presenceWord({ ...here, resting: true, asksWaiting: 1 }), 'Nemia resting');
  assert.equal(presenceWord({ ...here, answering: true, asksWaiting: 2 }), 'Nemia answering');
  assert.equal(presenceWord({ ...here, asksWaiting: 2, notSent: true }), 'Nemia asks 2');
  assert.equal(presenceWord({ ...here, notSent: true }), 'Nemia, not sent');
});

test("a failed read's one line is marked by its kind, names what it read, says the page's own next step after it, and no checkout's command", async () => {
  const { ReadTrouble } = await import('../src/components/frame/ReadTrouble.tsx');
  const { ReadRefusal, UnreadAnswer } = await import('../src/lib/api/read.ts');
  const kinds: Array<[Error, string]> = [
    [new ReadRefusal('no factory acme', 404), 'refused'],
    [new UnreadAnswer('GET /api/agents', 'unread'), 'unread'],
    [new TypeError('Failed to fetch'), 'unanswered'],
  ];
  for (const [error, kind] of kinds) {
    const html = await routedWith(createElement(ReadTrouble, { what: 'the agents', error, then: 'Then this.' }));
    assert.match(html, new RegExp(`<p [^>]*data-read-trouble="${kind}"`), kind);
    assert.ok(html.includes('the agents') && html.includes(error.message), html);
    assert.ok(html.indexOf(error.message) < html.indexOf('Then this.'), 'the next step comes after the words');
    assert.ok(!html.includes('npm run'), html);
  }
});
