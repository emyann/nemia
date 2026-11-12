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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { classesAt, inboxCard, LISTED, routedWith, STORE_ANSWER, textsOf } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { instantWords } = await import('../src/lib/instant.ts');
const InboxParts = await import('../src/components/inbox/InboxParts.tsx');
const { FileCard } = await import('../src/components/inbox/FileCard.tsx');

test("REFUSED: a queued card's last try says when as the board writes an instant, its date before its time on another day", async () => {
  const { Tried } = await import('../src/components/inbox/InboxParts.tsx');
  const tried = { at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(), refused: true, why: 'no such workflow', repo: '/r' };
  const entry = { repo: '/r', factory: null, error: null, tried };
  const html = renderToStaticMarkup(createElement(Tried, { entry: entry as never }));
  const words = instantWords(new Date(tried.at), new Date());
  assert.ok(textsOf(html).join(' ').startsWith(`Not started at ${words}: no such workflow.`), html);
  assert.match(words, /^\d{1,2} [A-Z][a-z]{2} (\d{4}, )?\d{1,2}:\d\d [AP]M$/, 'three days ago is another day: never its time alone');
});

test('REFUSED: a card that names no factory wears no default tag — its line says it has no factory yet; one naming a factory wears its tag, and an entry that does not read says neither', async () => {
  const line = (extra: Record<string, unknown>) => routedWith(createElement(InboxParts.CardMeta, { entry: inboxCard(extra) }));
  const tagged = await line({ factory: 'solo' });
  assert.match(tagged, /data-factory-tag="solo"/);
  assert.doesNotMatch(tagged, /data-unassigned/);
  for (const factory of [null, 'default']) {
    const bare = await line({ factory });
    assert.match(
      bare,
      /<span data-unassigned="true" title="It names no factory: Start gives it one\.">no factory yet<\/span>/,
      String(factory),
    );
    assert.doesNotMatch(bare, /data-factory-tag/, `${factory}: no tag, the default's least of all`);
  }
  const unread = await line({ error: 'idea.md: not a card' });
  assert.doesNotMatch(unread, /data-factory-tag|data-unassigned/);
});

test('REFUSED: a card that names a workflow and no factory says it has no Queue and that Start gives it a factory — and no other card says it', async () => {
  const note = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(InboxParts.NoQueue, { entry: inboxCard(extra) }));
  for (const factory of [null, 'default']) {
    const said = note({ factory, workflow: 'dev' });
    assert.ok(classesAt(said, 'data-no-queue="true"').includes('text-muted-foreground'), `a note, drawn at rest\n${said}`);
    const words = textsOf(said).join(' ');
    assert.ok(words.startsWith('No Queue:') && words.includes('Start gives it one'), `${String(factory)}: ${words}`);
  }
  assert.equal(note({ factory: 'solo', workflow: 'dev' }), '', 'a card of a factory has its Queue');
  assert.equal(note({ factory: null }), '', 'no workflow: nothing to queue it on');
  assert.equal(
    note({ factory: null, workflow: 'dev', state: 'queued', queued: { at: '2026-09-16T10:00:00.000Z', place: 1 } }),
    '',
    'queued: Unqueue',
  );
});

test('REFUSED: the box says the factories are being read until they are, and never that the store has none', async () => {
  const html = await routedWith(createElement(FileCard, { shown: 'solo' }), [STORE_ANSWER]);
  assert.match(html, /data-reading-factories="true"[^>]*>Reading the factories…<\/p>/);
  assert.doesNotMatch(html, /data-no-factory/);
  const read = await routedWith(createElement(FileCard, { shown: 'solo' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.doesNotMatch(read, /data-reading-factories/);
});

test('the box that files a card lists No factory and each factory offered; under No factory it draws no Workflow and no Repository control, and says the card is parked', async () => {
  const html = await routedWith(createElement(FileCard, { shown: undefined }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.deepEqual(
    [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]),
    [
      ['', 'No factory: chosen at start'],
      ['solo', 'solo'],
      ['pair', 'pair'],
    ],
    'never the default factory',
  );
  assert.match(html, /data-parked="true"[^>]*>Parked with no factory: it gets its factory, workflow and repository when you start it\./);
  assert.doesNotMatch(html, />Workflow<|>Repository<|<input/, 'nothing to type or pick but the idea and the factory');
  assert.doesNotMatch(html, /data-no-factory/);
});

test('the box with no factory to offer has the one choice, and the line that files a factory', async () => {
  const html = await routedWith(createElement(FileCard, { shown: 'default' }), [[['factories'], [LISTED[0]]], STORE_ANSWER]);
  assert.equal([...html.matchAll(/<option /g)].length, 1);
  assert.match(
    html,
    /data-no-factory="true"[^>]*>The store has no factory yet: file one with <code[^>]*>nemia factory add &lt;name&gt; --repo &lt;path&gt;<\/code>/,
  );
});

test("the box preset to the address's factory lists the workflows it offers by name, and says the repository as text — never a Repository list", async () => {
  const solo = await routedWith(createElement(FileCard, { shown: 'solo' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.match(solo, /<option value="solo" selected="">solo<\/option>/);
  assert.match(solo, /data-factory-repo="true"[^>]*>\/r\/a<\/p>/);
  assert.doesNotMatch(solo, /<input|data-parked/, 'no repository to type');
  assert.match(
    solo,
    />Workflow<\/label><select[^>]*><option value="" selected="">None: chosen at start<\/option><option value="dev">dev<\/option><\/select>/,
  );

  const pair = await routedWith(createElement(FileCard, { shown: 'pair' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.doesNotMatch(pair, />Repository<\/label>|<option value="\/r\/a">/, 'no repository picker: the factory places the run');
  assert.doesNotMatch(pair, /data-needs-repo/, 'and its workflows are offered with none picked');
  assert.match(pair, /<option value="dev">dev<\/option>/);
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

test("an older card's repo: is shown retired, struck, never as where it runs", async () => {
  const html = await routedWith(createElement(InboxParts.CardMeta, { entry: inboxCard({ factory: 'solo', repo: '/code/app' }) }));
  assert.match(html, /<s data-repo="retired" title="retired: the factory places the run"[^>]*>\/code\/app<\/s>/);
});
