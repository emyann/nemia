/**
 * `nemia get` against a served store (`served.ts`): a resource's objects listed as a table, `-l` taking those its selector takes, one
 * read by its name, `-o yaml` read back by `nemia apply` as unchanged, and a word that names no resource refused exit 2 naming
 * `nemia explain`. The client's own verb: its help is its own and `--local` is refused naming `nemia service status`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { servedStore, write } from './served.ts';

const store = await servedStore('nemia-cli-get-', (root) => {
  write(path.join(root, 'inbox', 'cache-the-views.md'), '---\nworkflow: dev\nlabels:\n  team: core\n---\nCache the views.\n');
  write(path.join(root, 'inbox', 'tidy-the-docs.md'), '---\nlabels:\n  team: docs\n---\nTidy the docs.\n');
});
test.after(() => store.stop());

test('`nemia get cards` lists every card of the default namespace as a table: NAME, STATE, AGE', async () => {
  const listed = await store.nemia(['get', 'cards']);
  assert.equal(listed.code, 0, listed.err);
  assert.match(listed.out, /^NAME +STATE +AGE$/m);
  assert.match(listed.out, /^cache-the-views +filed +\d+[smhd]$/m);
  assert.match(listed.out, /^tidy-the-docs +filed /m);
});

test('`-l team=core` lists the cards its selector takes, and no other; `-A` adds their namespace', async () => {
  const core = await store.nemia(['get', 'cards', '-l', 'team=core', '-A']);
  assert.equal(core.code, 0, core.err);
  assert.match(core.out, /^NAMESPACE +NAME +STATE +AGE$/m);
  assert.match(core.out, /^default +cache-the-views /m);
  assert.doesNotMatch(core.out, /tidy-the-docs/);
  const none = await store.nemia(['get', 'cards', '-l', 'team=nope']);
  assert.equal(none.code, 0, 'an empty list is no failure');
  assert.equal(none.out, '');
  assert.match(none.err, /^No cards found/);
});

test('`nemia get card <name> -n default -o yaml` is read back by `nemia apply -f -` as unchanged', async () => {
  const read = await store.nemia(['get', 'card', 'cache-the-views', '-n', 'default', '-o', 'yaml']);
  assert.equal(read.code, 0, read.err);
  assert.match(read.out, /^kind: Card$/m);
  const applied = await store.nemia(['apply', '-f', '-'], read.out);
  assert.equal(applied.code, 0, applied.err);
  assert.equal(applied.out, 'cards/cache-the-views unchanged\n');
  const named = await store.nemia(['get', 'cards/cache-the-views', '-n', 'default', '-o', 'name']);
  assert.equal(named.out, 'cards/cache-the-views\n');
});

test('`nemia get card <name>` with no -n finds the card in its factory, by its store-wide name (`GET /api/cards/:name`)', async () => {
  const read = await store.nemia(['get', 'card', 'cache-the-views', '-o', 'json']);
  assert.equal(read.code, 0, read.err);
  const card: unknown = JSON.parse(read.out);
  assert.ok(typeof card === 'object' && card !== null && 'metadata' in card);
  assert.deepEqual(
    card.metadata && typeof card.metadata === 'object' && 'namespace' in card.metadata ? card.metadata.namespace : null,
    'default',
  );
});

test('REFUSED: `nemia get nope` exits 2 naming `nemia explain` and the resources there are', async () => {
  const refused = await store.nemia(['get', 'nope']);
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /nemia explain/);
  assert.match(refused.err, /\bcards\b/);
  assert.equal(refused.out, '');
});

test('REFUSED: `-A` of a kind the api lists one namespace at a time exits 2 naming -n', async () => {
  const refused = await store.nemia(['get', 'workflows', '-A']);
  assert.equal(refused.code, 2, refused.err);
  assert.match(refused.err, /-n <namespace>/);
});

test('`nemia get --help` is its own; `nemia get cards --local` is refused exit 2 naming `nemia service status`', async () => {
  const help = await store.nemia(['get', '--help']);
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /^nemia get <resource>/);
  const local = await store.nemia(['get', 'cards', '--local']);
  assert.equal(local.code, 2, local.err);
  assert.match(local.err, /nemia service status/);
});
