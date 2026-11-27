/**
 * The board's inbox components (`src/components/inbox/`), rendered to markup as a server renders them: what a
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
import { test } from 'vitest';
import assert from 'node:assert/strict';
import './tsx.ts';
import { inboxCard, LISTED, routedWith, STORE_ANSWER, textsOf } from './markup.fixture.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { instantWords } = await import('../src/lib/instant.ts');

test("REFUSED: a queued card's last try says when as the board writes an instant, its date before its time on another day", async () => {
  const { Tried } = await import('../src/components/inbox/InboxParts.tsx');
  const tried = { at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(), refused: true, why: 'no such workflow', repo: '/r' };
  const entry = { repo: '/r', factory: null, error: null, tried };
  const html = renderToStaticMarkup(createElement(Tried, { entry: entry as never }));
  const words = instantWords(new Date(tried.at), new Date());
  assert.ok(textsOf(html).join(' ').startsWith(`Not started at ${words}: no such workflow.`), html);
  assert.match(words, /^\d{1,2} [A-Z][a-z]{2} (\d{4}, )?\d{1,2}:\d\d [AP]M$/, 'three days ago is another day: never its time alone');
});

test("a queued card's ghost says how long ago it was queued as every page says an age: just now under a minute, then in minutes", async () => {
  const { QueueLane } = await import('../src/components/inbox/QueueLane.tsx');
  const queuedAgo = (ms: number, name: string) =>
    inboxCard({ name, workflow: 'dev', state: 'queued', queued: { at: new Date(Date.now() - ms).toISOString(), place: 1 } });
  const html = await routedWith(createElement(QueueLane, { cards: [queuedAgo(20_000, 'fresh'), queuedAgo(3 * 60_000 + 20_000, 'older')] }));
  const ages = [...html.matchAll(/<time[^>]*>([^<]*)<\/time>/g)].map((m) => m[1]);
  assert.deepEqual(ages, ['queued just now', 'queued 3 minutes ago']);
});

/** `LISTED` with the factory `pair` wiring `dev` to `wired`, the folder name of one of its repositories, or to none. */
const pairWired = (wired: string | null) =>
  LISTED.map((f) =>
    f.name === 'pair'
      ? {
          ...f,
          workflowRepos: wired === null ? {} : { dev: wired },
          commands: { ...f.commands, attach: 'nemia factory attach pair <workflow>' },
        }
      : f,
  );

test("a card's start in a factory of two repositories shows the one its wiring gives the card's workflow, never a Repository list", async () => {
  const { FactoryCardStart } = await import('../src/components/factory/FactoryCardStart.tsx');
  const card = inboxCard({ factory: 'pair', workflow: 'dev', repo: '/r/a' });
  const start = (wired: string | null) =>
    routedWith(createElement(FactoryCardStart, { entry: card, onStarted: () => {}, onRefused: () => {} }), [
      [['factories'], pairWired(wired)],
      STORE_ANSWER,
    ]);
  const wired = await start('b');
  assert.match(wired, /<option value="dev" selected="">dev<\/option>/, "preset to the card's workflow, among those the factory offers");
  assert.match(wired, /data-factory-repo="true"[^>]*>\/r\/b<\/p>/, "the wired one, not the card's retired repo:");
  assert.doesNotMatch(wired, />Repository<\/label>|<option value="\/r\/a">/, 'no repository picker');
  const unwired = await start(null);
  assert.match(unwired, /data-unwired="unwired"/);
  assert.match(unwired, /nemia factory attach pair dev --repo &lt;name&gt;, one of a, b/, 'naming the attach that wires it');
  assert.doesNotMatch(unwired, /data-factory-repo|>Repository<\/label>/, 'and no repository to start on, nor to pick');
});

test("a queued card's ghost says the repository its factory wires for its workflow, or not wired — never the card's nor the daemon's", async () => {
  const { QueueLane } = await import('../src/components/inbox/QueueLane.tsx');
  const queued = inboxCard({
    name: 'q',
    factory: 'pair',
    workflow: 'dev',
    repo: '/r/a',
    state: 'queued',
    queued: { at: new Date().toISOString(), place: 1 },
  });
  const lane = (wired: string | null) => routedWith(createElement(QueueLane, { cards: [queued] }), [[['factories'], pairWired(wired)]]);
  assert.match(await lane('b'), /data-ghost-repo="true"[^>]*title="\/r\/b"[^>]*>b<\/span>/);
  const unwired = await lane(null);
  assert.match(unwired, /data-ghost-repo="not wired"[^>]*>not wired<\/span>/);
  assert.match(unwired, /title="[^"]*nemia factory attach pair dev --repo/, 'the attach on hover');
  assert.doesNotMatch(unwired, /daemon/);
});

