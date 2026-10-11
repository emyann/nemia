import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACE_TABS, pickedOf, pickTo, RAIL, sectionLink, sectionOf, SECTIONS, tabsOf } from '../src/components/nav.ts';

/** The section labelled `label`. */
const section = (label: string) => SECTIONS.find((item) => item.label === label)!;

test("the sidebar's sections are the factory's Floor, then the Inbox, Runs, Workflows and Stats, in that order", () => {
  assert.deepEqual(
    SECTIONS.map((item) => item.label),
    ['Floor', 'Inbox', 'Runs', 'Workflows', 'Stats'],
  );
  assert.deepEqual(
    SECTIONS.map((item) => item.to),
    ['/factories/$factory', '/inbox', '/runs', '/workflows', '/stats'],
  );
});

test("each page lights one section — a factory's floor the Floor, a run and its steps Runs, a card's page the Inbox, a step's page Workflows — and a page no section has a place for lights none", () => {
  const lit = (path: string) => SECTIONS.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of SECTIONS.filter((one) => one.label !== 'Floor')) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/factories/x'), ['Floor']);
  assert.deepEqual(lit('/runs/r-1'), ['Runs']);
  assert.deepEqual(lit('/runs/r-1/steps/s'), ['Runs']);
  assert.deepEqual(lit('/inbox/card'), ['Inbox']);
  assert.deepEqual(lit('/workflows/repo/dev'), ['Workflows'], "a workflow's page");
  assert.deepEqual(lit('/workflows/repo/dev/review'), ['Workflows']);
  assert.deepEqual(lit('/'), [], 'Home is in the rail, not the sections');
  assert.deepEqual(lit('/agents'), [], 'Agents is in the rail, not the sections');
  assert.deepEqual(lit('/nowhere'), []);
  assert.deepEqual(lit('/factories/'), [], 'refused: a floor names its factory');
  assert.deepEqual(lit('/factories/x/y'), [], "refused: nothing under a floor is the floor's");
  for (const path of ['/runsx', '/factoriesx', '/statsx', '/inboxes', '/workflowsx/repo'])
    assert.deepEqual(lit(path), [], `refused: a path that only begins with a section's name is not under it (${path})`);
});

test('the rail holds Home, Agents, Machines & Capabilities, then Settings, in that order', () => {
  assert.deepEqual(
    RAIL.map((item) => item.label),
    ['Home', 'Agents', 'Machines & Capabilities', 'Settings'],
  );
  assert.deepEqual(
    RAIL.map((item) => item.to),
    ['/', '/agents', '/machines', '/settings'],
  );
});

test("each page lights at most one place in the rail — Home on the canvas and a factory's floor only, Agents on an agent's page, Machines & Capabilities on either of its tabs — and a path that only begins with a place's name lights none", () => {
  const lit = (path: string) => RAIL.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of RAIL) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/factories/nemia'), ['Home']);
  assert.deepEqual(lit('/agents/new'), ['Agents']);
  assert.deepEqual(lit('/agents/skills/x/y'), ['Agents']);
  assert.deepEqual(lit('/machines'), ['Machines & Capabilities']);
  assert.deepEqual(lit('/capabilities'), ['Machines & Capabilities'], 'the place is lit on its second tab too');
  assert.deepEqual(lit('/runs'), [], 'a run is not Home');
  assert.deepEqual(lit('/inbox'), [], 'the Inbox is not Home');
  assert.deepEqual(lit('/settings'), ['Settings']);
  assert.deepEqual(lit('/factories/nemia/settings'), ['Home'], "a factory's own settings are Home's, not the store's Settings");
  assert.deepEqual(lit('/nowhere'), []);
  for (const path of ['/agentsx', '/machinesx', '/capabilitiesx', '/factoriesx', '/machines/x', '/capabilities/x', '/settingsx'])
    assert.deepEqual(lit(path), [], `refused: a path that only begins with a place's name is not under it (${path})`);
});

test("Machines & Capabilities has two tabs, Machines then Capabilities, each its own page's address", () => {
  assert.deepEqual(PLACE_TABS, [
    { to: '/machines', label: 'Machines' },
    { to: '/capabilities', label: 'Capabilities' },
  ]);
});

test("a tab's page has its place's tabs, in their order, and any other page has none, a path that only begins with a tab's name included", () => {
  for (const path of ['/machines', '/capabilities'])
    assert.deepEqual(
      tabsOf(path)?.map((tab) => tab.label),
      ['Machines', 'Capabilities'],
      path,
    );
  for (const path of ['/machinesx', '/capabilitiesx', '/machines/x', '/capabilities/', '/agents', '/', '/runs'])
    assert.equal(tabsOf(path), undefined, `refused: ${path} is no tab's page`);
});

test('the rail and the sections share no route', () => {
  const rail = new Set<string>(RAIL.map((item) => item.to));
  assert.equal(SECTIONS.filter((item) => rail.has(item.to)).length, 0);
});

test("the header names a page by its section first — Floor on a factory's floor — then by the rail's place, Home on the canvas, and a page neither has a place for goes unnamed", () => {
  assert.equal(sectionOf('/'), 'Home');
  assert.equal(sectionOf('/factories/nemia'), 'Floor');
  assert.equal(sectionOf('/runs/r-1'), 'Runs');
  assert.equal(sectionOf('/workflows'), 'Workflows');
  assert.equal(sectionOf('/agents'), 'Agents');
  assert.equal(sectionOf('/agents/scribe'), 'Agents');
  assert.equal(sectionOf('/machines'), 'Machines & Capabilities');
  assert.equal(sectionOf('/capabilities'), 'Machines & Capabilities');
  assert.equal(sectionOf('/settings'), 'Settings');
  assert.equal(sectionOf('/machinesx'), undefined);
});

test("the picked factory is read from the address alone: the name of a factory's floor or settings, else the ?factory= of a section's page, a workflow's or a step's, else none", () => {
  assert.equal(pickedOf('/factories/nemia', {}), 'nemia');
  assert.equal(pickedOf('/factories/nemia/settings', {}), 'nemia', "a factory's settings pick it, as its floor does");
  assert.equal(pickedOf('/factories/nemia/other', {}), undefined, "refused: no other page under a floor is the factory's own");
  assert.equal(pickedOf('/runs', { factory: 'hiring' }), 'hiring');
  assert.equal(pickedOf('/stats', { factory: 'hiring', period: '90d' }), 'hiring');
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
  for (const path of ['/runs/r-1', '/agents', '/inbox/card', '/'])
    assert.equal(pickedOf(path, { factory: 'hiring' }), undefined, `refused: ${path} reads no ?factory=, which its route keeps none of`);
});

test("a section's link carries the picked factory, and none under All factories; the Floor is drawn only with a factory picked", () => {
  assert.equal(sectionLink(section('Floor'), undefined), null);
  assert.deepEqual(sectionLink(section('Floor'), 'nemia'), { to: '/factories/$factory', params: { factory: 'nemia' } });
  for (const label of ['Inbox', 'Runs', 'Workflows', 'Stats']) {
    const { to } = section(label);
    assert.deepEqual(sectionLink(section(label), 'nemia'), { to, search: { factory: 'nemia' } });
    assert.deepEqual(
      sectionLink(section(label), undefined),
      { to, search: {} },
      `refused: ${label} carries no factory under All factories`,
    );
  }
});

test("a pick on a section's page stays there, keeping its other keys; on a factory's floor or settings it opens the picked one's floor, or Home; elsewhere it opens the picked one's floor, or stays", () => {
  const search = { period: '90d', agent: 'ada', factory: 'hiring' };
  assert.deepEqual(pickTo('/stats', search, 'nemia'), { to: '/stats', search: { period: '90d', agent: 'ada', factory: 'nemia' } });
  assert.deepEqual(pickTo('/stats', search, undefined), { to: '/stats', search: { period: '90d', agent: 'ada' } });
  assert.deepEqual(pickTo('/runs', {}, 'nemia'), { to: '/runs', search: { factory: 'nemia' } });
  assert.deepEqual(
    pickTo('/workflows', { factory: 'a', repo: '/x' }, 'b'),
    { to: '/workflows', search: { factory: 'b' } },
    'refused: the repository of the factory left rides to no other',
  );
  assert.deepEqual(pickTo('/workflows', { factory: 'a', repo: '/x' }, undefined), { to: '/workflows', search: {} });
  assert.deepEqual(pickTo('/factories/nemia', {}, undefined), { to: '/' });
  assert.deepEqual(pickTo('/factories/nemia', {}, 'hiring'), { to: '/factories/$factory', params: { factory: 'hiring' } });
  assert.deepEqual(pickTo('/factories/nemia/settings', {}, undefined), { to: '/' }, "All factories leaves a factory's settings for Home");
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
