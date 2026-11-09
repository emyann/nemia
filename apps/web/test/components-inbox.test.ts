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
import { inboxCard, LISTED, routedWith, STORE_ANSWER, textsOf } from './markup-fixtures.ts';

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
    assert.equal(
      note({ factory, workflow: 'dev' }),
      '<p data-no-queue="true" class="text-body-small text-muted-foreground">No Queue: a queued card starts on its own, in the factory it names, and this one names none. Start gives it one.</p>',
      String(factory),
    );
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

test("the box preset to the address's factory says its one repository as text, and offers the repositories of a factory on several as a list with none chosen", async () => {
  const solo = await routedWith(createElement(FileCard, { shown: 'solo' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.match(solo, /<option value="solo" selected="">solo<\/option>/);
  assert.match(solo, /data-factory-repo="true"[^>]*>\/r\/a<\/p>/);
  assert.doesNotMatch(solo, /<input|data-parked/, 'no repository to type');
  assert.match(solo, />Workflow<\/label>/);

  const pair = await routedWith(createElement(FileCard, { shown: 'pair' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.match(
    pair,
    />Repository<\/label><select[^>]*><option value="" selected="">None: chosen at start<\/option><option value="\/r\/a">\/r\/a<\/option><option value="\/r\/b">\/r\/b<\/option><\/select>/,
  );
  assert.match(pair, /data-needs-repo="true"/, 'its workflows are read once a repository is picked');
});
