import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationHref, destinationOf, DESTINATIONS, pickedOf, pickTo, SETTINGS_TABS, tabsOf } from '../src/components/nav.ts';

/** The name of the destination the page at `path` lights, none for none. */
const lit = (path: string) => destinationOf(path)?.label;

test("the rail's destinations are Overview, Runs, Inbox, Factories, Agents, Workflows, Stats and Settings, in that order", () => {
  assert.deepEqual(
    DESTINATIONS.map((item) => item.label),
    ['Overview', 'Runs', 'Inbox', 'Factories', 'Agents', 'Workflows', 'Stats', 'Settings'],
  );
});

test("each page lights its destination — a run's steps Runs, a card's page the Inbox, a factory's settings Factories, Machines Settings — and a path that only begins with a destination's name lights none", () => {
  assert.equal(lit('/'), 'Overview');
  assert.equal(lit('/runs/r-1/steps/s'), 'Runs');
  assert.equal(lit('/inbox/card'), 'Inbox');
  assert.equal(lit('/factories/nemia'), 'Factories');
  assert.equal(lit('/factories/nemia/settings'), 'Factories', "a factory's own settings are its, not the store's Settings");
  assert.equal(lit('/agents/skills/new'), 'Agents');
  assert.equal(lit('/workflows/repo/dev/review'), 'Workflows');
  assert.equal(lit('/stats'), 'Stats');
  for (const path of ['/settings', '/machines', '/capabilities']) assert.equal(lit(path), 'Settings', path);
  for (const path of ['/nowhere', '/agentsx', '/machinesx', '/capabilitiesx', '/factoriesx', '/settingsx', '/statsx', '/runsx'])
    assert.equal(lit(path), undefined, `refused: ${path} is no destination's page`);
});

test('Settings has three tabs, Settings, Machines then Capabilities, each its own page\'s address', () => {
  assert.deepEqual(SETTINGS_TABS, [
    { to: '/settings', label: 'Settings' },
    { to: '/machines', label: 'Machines' },
    { to: '/capabilities', label: 'Capabilities' },
  ]);
});

test("a tab's page has the tabs of Settings, in their order, and any other page has none, a path that only begins with a tab's name included", () => {
  for (const path of ['/settings', '/machines', '/capabilities'])
    assert.deepEqual(
      tabsOf(path)?.map((tab) => tab.label),
      ['Settings', 'Machines', 'Capabilities'],
      path,
    );
  for (const path of ['/machinesx', '/capabilitiesx', '/machines/x', '/capabilities/', '/settings/x', '/agents', '/', '/runs'])
    assert.equal(tabsOf(path), undefined, `refused: ${path} is no tab's page`);
});

test("the picked factory is read from the address alone: the name of a factory's floor or settings, else the ?factory= of a section's page, a workflow's or a step's, else none", () => {
  assert.equal(pickedOf('/factories/nemia', {}), 'nemia');
  assert.equal(pickedOf('/factories/nemia/settings', {}), 'nemia', "a factory's settings pick it, as its floor does");
  assert.equal(pickedOf('/factories/nemia/other', {}), undefined, "refused: no other page under a floor is the factory's own");
  assert.equal(pickedOf('/runs', { factory: 'hiring' }), 'hiring');
  assert.equal(pickedOf('/workflows', { factory: 'hiring' }), 'hiring');
  assert.equal(pickedOf('/inbox', { factory: 'hiring' }), 'hiring');
  assert.equal(pickedOf('/runs', {}), undefined);
  assert.equal(pickedOf('/runs', { factory: '' }), undefined, 'an empty name picks none');
  assert.equal(pickedOf('/runs', { factory: 3 }), undefined, 'a name that is no string picks none');
  assert.equal(pickedOf('/factories/nemia', { factory: 'hiring' }), 'nemia', 'on a floor the path wins over a stray ?factory=');
  assert.equal(pickedOf('/workflows/repo/dev', { factory: 'hiring' }), 'hiring', "a workflow's page is read in the factory picked");
  assert.equal(pickedOf('/workflows/yours/w/review', { factory: 'hiring' }), 'hiring', "and a step's page");
  for (const path of ['/runs/r-1', '/agents', '/inbox/card', '/', '/workflows/repo/dev', '/workflows/repo/dev/review'])
    assert.equal(pickedOf(path, {}), undefined, `${path} picks none`);
  for (const path of ['/runs/r-1', '/agents', '/inbox/card', '/', '/stats'])
    assert.equal(pickedOf(path, { factory: 'hiring' }), undefined, `refused: ${path} reads no ?factory=, which its route keeps none of`);
});

test("a list's destination carries the picked factory, none under All factories; Factories leads to the picked floor, else the first factory's, else Overview", () => {
  for (const id of ['inbox', 'runs', 'workflows']) {
    assert.equal(destinationHref(id, 'my factory', 'a'), `/${id}?factory=my%20factory`);
    assert.equal(destinationHref(id, undefined, 'a'), `/${id}`, `refused: ${id} carries no factory under All factories`);
  }
  assert.equal(destinationHref('factories', 'nemia', 'a'), '/factories/nemia');
  assert.equal(destinationHref('factories', undefined, 'a b'), '/factories/a%20b');
  assert.equal(destinationHref('factories', undefined, undefined), '/');
  assert.equal(destinationHref('overview', 'nemia', 'a'), '/');
  for (const id of ['agents', 'stats', 'settings'])
    assert.equal(destinationHref(id, 'nemia', 'a'), `/${id}`, `refused: ${id} carries no factory`);
});

test("a pick on a section's page stays there, keeping its other keys; on a factory's floor or settings it opens the picked one's floor, or Overview; elsewhere it opens the picked one's floor, or stays", () => {
  const search = { bar: 'start', factory: 'hiring' };
  assert.deepEqual(pickTo('/runs', search, 'nemia'), { to: '/runs', search: { bar: 'start', factory: 'nemia' } });
  assert.deepEqual(pickTo('/runs', search, undefined), { to: '/runs', search: { bar: 'start' } });
  assert.deepEqual(pickTo('/runs', {}, 'nemia'), { to: '/runs', search: { factory: 'nemia' } });
  assert.deepEqual(
    pickTo('/workflows', { factory: 'a', repo: '/x' }, 'b'),
    { to: '/workflows', search: { factory: 'b' } },
    'refused: the repository of the factory left rides to no other',
  );
  assert.deepEqual(pickTo('/workflows', { factory: 'a', repo: '/x' }, undefined), { to: '/workflows', search: {} });
  assert.equal(pickTo('/stats', { factory: 'a' }, undefined), null, "refused: /stats is no section's page, and stays as any other");
  assert.deepEqual(
    pickTo('/stats', {}, 'nemia'),
    { to: '/factories/$factory', params: { factory: 'nemia' } },
    "refused: /stats is no section's page, and a pick there opens the floor",
  );
  assert.deepEqual(pickTo('/factories/nemia', {}, undefined), { to: '/' });
  assert.deepEqual(pickTo('/factories/nemia', {}, 'hiring'), { to: '/factories/$factory', params: { factory: 'hiring' } });
  assert.deepEqual(pickTo('/factories/nemia/settings', {}, undefined), { to: '/' }, "All factories leaves a factory's settings for Overview");
  assert.deepEqual(pickTo('/factories/nemia/settings', {}, 'hiring'), { to: '/factories/$factory', params: { factory: 'hiring' } });
  assert.deepEqual(pickTo('/runs/r-1', {}, 'nemia'), { to: '/factories/$factory', params: { factory: 'nemia' } });
  assert.deepEqual(pickTo('/inbox/card', { factory: 'x' }, 'nemia'), { to: '/factories/$factory', params: { factory: 'nemia' } });
  assert.equal(pickTo('/runs/r-1', {}, undefined), null);
  assert.equal(pickTo('/agents', {}, undefined), null);
  assert.deepEqual(
    pickTo('/workflows/yours/w/review', { factory: 'hiring', repo: '/code/app', bar: 'x' }, 'nemia'),
    {
      to: '/workflows/$from/$workflow/$step',
      params: { from: 'yours', workflow: 'w', step: 'review' },
      search: { bar: 'x', factory: 'nemia' },
    },
    "a step's page stays, read in the factory picked, the repository the last one named dropped",
  );
  assert.deepEqual(pickTo('/workflows/repo/dev', { factory: 'hiring', build: true }, undefined), {
    to: '/workflows/$from/$workflow',
    params: { from: 'repo', workflow: 'dev' },
    search: { build: true },
  });
});
