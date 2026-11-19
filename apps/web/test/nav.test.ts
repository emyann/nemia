/**
 * Where each page sits in the frame (src/components/nav/nav.ts): its seat, read from its path alone — the store's level under a destination
 * of the rail, or one factory's under a place of its pane — what the rail lights, where the rail and the pane lead, the tabs of Settings,
 * and where picking another factory takes a page.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { litOf, pageNameOf, PANE_PLACES, pickTo, placeHref, RAIL_GROUPS, railHref, seatOf, tabsOf } from '../src/components/nav/nav.ts';

describe("RAIL_GROUPS and PANE_PLACES: the store rail's groups and the factory pane's places, in their order", () => {
  test('the rail holds what spans factories, then yours, then the person’s, each group its destinations in order', () => {
    assert.deepEqual(
      RAIL_GROUPS.map((group) => [group.label, group.items.map((item) => item.label)]),
      [
        ['Across factories', ['Factories', 'Waiting']],
        ['Yours', ['Agents', 'Skills', 'Library']],
        ['You', ['Stats', 'Settings']],
      ],
    );
  });
  test('the pane holds the floor, the runs, the inbox, the workflows, the agents, the skills, the proposals and the settings', () => {
    assert.deepEqual(
      PANE_PLACES.map((place) => place.label),
      ['Floor', 'Runs', 'Inbox', 'Workflows', 'Agents', 'Skills', 'Proposals', 'Settings'],
    );
  });
});

describe('seatOf: each page of the seat table at its level, under its destination or place', () => {
  test('a page of the store sits under the rail’s destination that holds it', () => {
    const rows: [string, string][] = [
      ['/', 'factories'],
      ['/welcome', 'factories'],
      ['/welcome/factory', 'factories'],
      ['/runs', 'waiting'],
      ['/runs/r-1', 'waiting'],
      ['/runs/r-1/steps/s', 'waiting'],
      ['/labels/k/v', 'waiting'],
      ['/inbox', 'waiting'],
      ['/inbox/card', 'waiting'],
      ['/workflows', 'agents'],
      ['/workflows/repo/dev/review', 'agents'],
      ['/agents', 'agents'],
      ['/agents/new', 'agents'],
      ['/agents/user/a', 'agents'],
      ['/agents/skills/new', 'skills'],
      ['/agents/skills/user/s', 'skills'],
      ['/capabilities', 'settings'],
      ['/settings', 'settings'],
      ['/setup', 'settings'],
      ['/tokens', 'settings'],
      ['/library', 'library'],
      ['/stats', 'stats'],
      ['/chat', 'nemia'],
    ];
    for (const [path, rail] of rows) assert.deepEqual(seatOf(path), { level: 'store', rail }, path);
  });
  test('a page under /factories/<name> sits in that factory, at the place its next segment names, its name decoded', () => {
    const rows: [string, string][] = [
      ['/factories/kit', 'floor'],
      ['/factories/kit/settings', 'settings'],
      ['/factories/kit/proposals', 'proposals'],
      ['/factories/kit/proposals/p', 'proposals'],
      ['/factories/kit/runs', 'runs'],
      ['/factories/kit/runs/r-1', 'runs'],
      ['/factories/kit/runs/r-1/steps/s', 'runs'],
      ['/factories/kit/inbox', 'inbox'],
      ['/factories/kit/inbox/card', 'inbox'],
      ['/factories/kit/workflows', 'workflows'],
      ['/factories/kit/workflows/repo/dev/review', 'workflows'],
      ['/factories/kit/agents', 'agents'],
      ['/factories/kit/agents/a', 'agents'],
      ['/factories/kit/skills', 'skills'],
      ['/factories/kit/skills/s', 'skills'],
    ];
    for (const [path, place] of rows) assert.deepEqual(seatOf(path), { level: 'factory', factory: 'kit', place }, path);
    assert.deepEqual(seatOf('/factories/a%20b/runs'), { level: 'factory', factory: 'a b', place: 'runs' });
  });
  test('REFUSED: an address no route has, or one that only begins with a destination’s name, has no seat', () => {
    for (const path of [
      '/nowhere',
      '/welcomex',
      '/chatx',
      '/agentsx',
      '/runsx',
      '/statsx',
      '/settingsx',
      '/factories',
      '/factories/kit/nowhere',
    ])
      assert.equal(seatOf(path), undefined, path);
  });
});

describe('litOf, railHref and placeHref: what the rail lights, and where the rail and the pane lead', () => {
  test('the rail lights a store page’s destination, Factories on any factory’s page, and none on her chat’s page', () => {
    assert.equal(litOf(seatOf('/runs')), 'waiting');
    assert.equal(litOf(seatOf('/factories/kit/runs/r-1')), 'factories');
    assert.equal(litOf(seatOf('/chat')), undefined, 'her face says her page');
    assert.equal(litOf(undefined), undefined);
  });
  test('each destination leads to its page, Skills to its section of the Agents page, the Library to its own', () => {
    assert.deepEqual(
      RAIL_GROUPS.flatMap((group) => group.items).map((item) => railHref(item.id)),
      ['/', '/runs', '/agents', '/agents#skills', '/library', '/stats', '/settings'],
    );
  });
  test('each place leads under its factory’s path, the name escaped, the floor the path itself', () => {
    assert.equal(placeHref('floor', 'kit'), '/factories/kit');
    assert.equal(placeHref('runs', 'a b/c'), '/factories/a%20b%2Fc/runs');
    for (const place of PANE_PLACES)
      assert.deepEqual(seatOf(placeHref(place.id, 'kit')), { level: 'factory', factory: 'kit', place: place.id });
  });
});

test("pageNameOf: a page's head names its factory's place, else the store's page itself, else nothing", () => {
  const rows: [string, string | undefined][] = [
    ['/factories/kit/runs/r-1', 'Runs'],
    ['/factories/kit', 'Floor'],
    ['/factories/kit/proposals', 'Proposals'],
    ['/factories/kit/proposals/p', 'Proposals'],
    ['/', 'Factories'],
    ['/runs', 'Runs'],
    ['/labels/k/v', 'Runs'],
    ['/inbox/card', 'Inbox'],
    ['/workflows/repo/dev', 'Workflows'],
    ['/agents/user/a', 'Agents'],
    ['/agents/skills/new', 'Skills'],
    ['/library', 'Library'],
    ['/library/x', 'Library'],
    ['/stats', 'Stats'],
    ['/tokens', 'Settings'],
    ['/chat', 'Nemia'],
    ['/nowhere', undefined],
  ];
  for (const [path, name] of rows) assert.equal(pageNameOf(path), name, path);
});

test("tabsOf: a tab's page has the tabs of Settings, in their order, and any other page none", () => {
  for (const path of ['/settings', '/setup', '/capabilities', '/tokens']) {
    assert.deepEqual(
      tabsOf(path)?.map((tab) => tab.label),
      ['Settings', 'Capabilities', 'Setup', 'Tokens'],
      path,
    );
  }
  for (const path of ['/settings/x', '/setupx', '/agents', '/', '/runs', '/factories/kit/skills', '/factories/kit/settings'])
    assert.equal(tabsOf(path), undefined, `refused: ${path} is no tab's page`);
});

describe('pickTo: where picking another factory takes a page', () => {
  test("a factory's list keeps its place and every key of its search but the repository of the factory left", () => {
    assert.equal(pickTo('/factories/a/runs', { l: 'x', repo: 'r' }, 'b'), '/factories/b/runs?l=x');
    assert.equal(pickTo('/factories/a/inbox', { cards: 'ended' }, 'b'), '/factories/b/inbox?cards=ended');
  });
  test("a run's or a card's page goes to the place's list, its object being the factory left's", () => {
    assert.equal(pickTo('/factories/a/runs/abc', {}, 'b'), '/factories/b/runs');
    assert.equal(pickTo('/factories/a/runs/abc/steps/s', { bar: 'x' }, 'b'), '/factories/b/runs');
    assert.equal(pickTo('/factories/a/inbox/card', {}, 'b'), '/factories/b/inbox');
  });
  test('a workflow’s page, a step’s, an agent’s or a skill’s is the same name read in the factory picked', () => {
    assert.equal(pickTo('/factories/a/workflows/repo/dev/review', { repo: 'r' }, 'b'), '/factories/b/workflows/repo/dev/review');
    assert.equal(pickTo('/factories/a/agents/x', { from: 'repo' }, 'b'), '/factories/b/agents/x?from=repo');
  });
  test('the floor and the settings go to the picked factory’s floor or settings', () => {
    assert.equal(pickTo('/factories/a', {}, 'b'), '/factories/b');
    assert.equal(pickTo('/factories/a/settings', {}, 'b'), '/factories/b/settings');
  });
  test('the proposals and a proposal’s page go to the picked factory’s proposals, the proposal being the factory left’s', () => {
    assert.equal(pickTo('/factories/a/proposals', {}, 'b'), '/factories/b/proposals');
    assert.equal(pickTo('/factories/a/proposals/p', {}, 'b'), '/factories/b/proposals');
  });
  test("a store page goes to the picked factory's floor, the store's Capabilities to its Skills", () => {
    assert.equal(pickTo('/stats', {}, 'b'), '/factories/b');
    assert.equal(pickTo('/capabilities', {}, 'b'), '/factories/b/skills');
  });
});
