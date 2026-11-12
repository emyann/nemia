/**
 * Settings' Server release section (`src/components/settings/ServerRelease.tsx`) and the frame's note that sends a person there
 * (`NewerRelease`), rendered to markup as a server renders them, the reads they make already answered: what a person is shown and
 * offered, without a browser. Its states in a browser are its stories, pictured by `test/e2e/parts-photos.ts`.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Upgrade, UpgradesRead, VersionAnswer } from 'objects';
import './tsx.ts';
import { routedWith } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { ServerRelease } = await import('../src/components/settings/ServerRelease.tsx');
const { NewerRelease } = await import('../src/components/frame/NewerRelease.tsx');

/** An install of v0.3.0 whose release check read v0.4.0, with its notes. */
const NEWER: VersionAnswer = {
  version: '0.3.0',
  release: { kind: 'install', root: '/srv/nemia/v0.3.0', tag: 'v0.3.0' },
  latest: { version: '0.4.0', newer: true, tag: 'v0.4.0', notes: 'https://example.com/notes/v0.4.0' },
};

/** A checkout, as the e2e's api runs: no release check, nothing to go back to. */
const CHECKOUT: VersionAnswer = { version: '0.3.0', release: { kind: 'checkout', root: '/code/nemia' } };

/** An upgrade to v0.4.0 in `phase`, having printed `output`. */
const upgrade = (phase: Upgrade['phase'], output = 'Fetching v0.4.0\n'): Upgrade => ({
  id: 'u-1',
  tag: 'v0.4.0',
  from: 'v0.3.0',
  phase,
  output,
  startedAt: '2026-11-12T09:41:00.000Z',
});

/** The section over both reads answered. */
const section = (version: VersionAnswer, upgrades?: UpgradesRead): Promise<string> =>
  upgrades === undefined
    ? routedWith(createElement(ServerRelease), [[['version'], version]])
    : routedWith(createElement(ServerRelease), [
        [['version'], version],
        [['upgrades'], upgrades],
      ]);

test("a checkout's section says the release it runs and offers neither Upgrade nor Back", async () => {
  const html = await section(CHECKOUT, { previous: null, last: null });
  assert.match(html, /data-server-release/);
  assert.match(html, /data-server-running[^>]*>[^<]*checkout/);
  assert.doesNotMatch(html, /data-upgrade-press/);
  assert.doesNotMatch(html, /data-back-press/);
});

test('a newer release read is shown with its notes, Upgrade to its tag, and Back where an older release is allowed', async () => {
  const html = await section(NEWER, { previous: { tag: 'v0.2.1' }, last: null });
  assert.match(html, /data-server-newer="0\.4\.0"/);
  assert.match(
    html,
    /data-server-notes[^>]*href="https:\/\/example\.com\/notes\/v0\.4\.0"|href="https:\/\/example\.com\/notes\/v0\.4\.0"[^>]*data-server-notes/,
  );
  assert.match(html, /data-upgrade-press[\s\S]*?>Upgrade to v0\.4\.0</);
  assert.match(html, /data-back-press="offered"/);
  assert.doesNotMatch(html, /data-upgrade-confirm/, 'nothing is sent, nor asked, before a press');
});

test('Back refused by the floor is shown refused, its reason under it', async () => {
  const html = await section(NEWER, { previous: { tag: 'v0.2.1', refused: 'the floor refuses it' }, last: null });
  assert.match(html, /data-back-press="refused"[^>]*disabled|disabled[^>]*data-back-press="refused"/);
  assert.match(html, /data-back-refused/);
});

test('an upgrade at work takes both presses away and is followed as it runs', async () => {
  const html = await section(NEWER, { previous: { tag: 'v0.2.1' }, last: upgrade('running') });
  assert.match(html, /data-upgrade-run="running"/);
  assert.match(html, /data-upgrade-output[^>]*>Fetching v0\.4\.0/);
  assert.doesNotMatch(html, /data-upgrade-press/);
  assert.doesNotMatch(html, /data-back-press/);
});

test('an upgrade waiting for a slot says so', async () => {
  const html = await section(NEWER, { previous: null, last: upgrade('pending', '') });
  assert.match(html, /data-upgrade-run="pending"/);
});

test('a failed upgrade shows its log, and Upgrade is offered again', async () => {
  const html = await section(NEWER, { previous: null, last: { ...upgrade('failed', 'archive does not match its sum\n'), exitCode: 1 } });
  assert.match(html, /data-upgrade-outcome="failed"/);
  assert.match(html, /data-upgrade-output[^>]*>archive does not match its sum/);
  assert.match(html, /data-upgrade-press/);
});

test('a succeeded upgrade says the release the server now runs, and offers Reload, this page having been loaded from the checkout the first section drew', async () => {
  const now: VersionAnswer = { version: '0.4.0', release: { kind: 'install', root: '/srv/nemia/v0.4.0', tag: 'v0.4.0' } };
  const html = await section(now, { previous: { tag: 'v0.3.0' }, last: { ...upgrade('succeeded'), exitCode: 0 } });
  assert.match(html, /data-upgrade-outcome="succeeded"/);
  assert.match(html, /data-upgrade-said[^>]*>[^<]*v0\.4\.0/);
  assert.match(html, /data-upgrade-reload/);
});

test('an upgrades read not answered leaves the running release alone shown, with no press', async () => {
  const html = await section(NEWER);
  assert.match(html, /data-server-running/);
  assert.doesNotMatch(html, /data-upgrade-press/);
  assert.doesNotMatch(html, /data-back-press/);
});

test("the frame's note of a newer release links to Settings", async () => {
  const html = await routedWith(createElement(NewerRelease), [[['version'], NEWER]]);
  assert.match(html, /data-newer-release="0\.4\.0"/);
  assert.match(html, /href="\/settings"/);
  const none = await routedWith(createElement(NewerRelease), [[['version'], CHECKOUT]]);
  assert.doesNotMatch(none, /data-newer-release/);
});
