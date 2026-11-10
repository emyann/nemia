/**
 * The board's factory components (`src/components/factory/`), rendered to markup as a server renders them: what a
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
import { listed, summary } from './run-fixtures.ts';
import './tsx.ts';
import { at, filed, inboxCard, LISTED, nemiaUp, pagedWith, routedWith, STORE_ANSWER, TRUST } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ReactFlowProvider } = await import('@xyflow/react');
const { TemplateCard } = await import('../src/components/factory/TemplateCard.tsx');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { FactoryBlockNode } = await import('../src/components/factory/FactoryBlock.tsx');
const { UnassignedStart } = await import('../src/components/factory/FactoryCardStart.tsx');

/** A factory's block on the Factories canvas, rendered to markup, `inspected` or not. */
function factoryBlockMarkup(inspected: boolean): string {
  const block = {
    name: 'hiring',
    default: false,
    repos: ['checkout'],
    runs: 1,
    inFlight: 0,
    waitsOnYou: 0,
    workflows: 1,
    hires: 1,
    error: null,
    inspected,
  };
  const props = {
    id: block.name,
    type: 'factory' as const,
    data: block,
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: false,
    deletable: false,
    draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(FactoryBlockNode, props)));
}

test("a factory's block is no link, so a press inspects it, and is marked as inspected only while the bar shows it", () => {
  const shown = factoryBlockMarkup(true);
  const hidden = factoryBlockMarkup(false);
  for (const html of [shown, hidden]) {
    assert.doesNotMatch(html, /<a[\s>]/, `the block holds no link: ${html}`);
    assert.doesNotMatch(html, /href=/, `and no address: ${html}`);
    assert.match(html, /data-factory="hiring"/);
    assert.match(html, /0 in flight · 1 run/);
    assert.match(html, /1 workflow · 1 hire/);
  }
  assert.match(shown, /data-inspected/, 'the block the bar shows is marked');
  assert.match(shown, /ring-2 ring-ring/, 'and ringed');
  assert.doesNotMatch(hidden, /data-inspected/, 'a block the bar does not show is not marked');
});

test("the picker offers the factories Home lists, then the address's own when they leave it out, never twice", async () => {
  const { pickerFactories } = await import('../src/components/factory/FactoryPicker.tsx');
  const factories = [filed('default', { default: true, workflows: null }), filed('nemia'), filed('quay')];
  const names = (picked: string | undefined) => pickerFactories(factories, false, picked).map((item) => item.name);
  assert.deepEqual(names(undefined), ['nemia', 'quay']);
  assert.deepEqual(names('quay'), ['nemia', 'quay']);
  assert.deepEqual(names('default'), ['nemia', 'quay', 'default']);
  assert.deepEqual(names('gone'), ['nemia', 'quay', 'gone']);
  assert.equal(pickerFactories(factories, false, 'gone').at(-1)?.factory, undefined);
  assert.deepEqual(
    pickerFactories(factories, true, undefined).map((item) => item.name),
    ['nemia', 'quay'],
    'a default factory that holds a run is not offered once a factory is named',
  );
  const alone = [filed('default', { default: true, workflows: null })];
  assert.deepEqual(
    pickerFactories(alone, true, undefined).map((item) => item.name),
    ['default'],
    'with no factory named, the default one is offered while it holds a run',
  );
  assert.equal(pickerFactories(alone, false, undefined).length, 0, 'and not while it holds none');
});

test("REFUSED: the picker offers only All factories until the default's light answer arrives, though the address picks the default", async () => {
  const { pickerOffer } = await import('../src/components/factory/FactoryPicker.tsx');
  const alone = [filed('default', { default: true, workflows: null })];
  const counts = (finished: number) => ({ counts: { waiting: 0, inFlight: 0, finished } });
  assert.deepEqual(pickerOffer(alone, undefined, 'default'), [], 'the light answer unread: nothing is offered');
  assert.deepEqual(pickerOffer(undefined, counts(1), 'default'), [], 'the factories unread: nothing is offered');
  assert.deepEqual(
    pickerOffer(alone, counts(1), 'default').map((item) => item.name),
    ['default'],
    'read, and holding a run: the default is offered',
  );
  assert.equal(pickerOffer(alone, counts(1), 'default')[0].factory, alone[0], 'as the factory the api lists, not a bare name');
  const named = [...alone, filed('nemia')];
  assert.deepEqual(
    pickerOffer(named, undefined, undefined).map((item) => item.name),
    ['nemia'],
    'once a factory is named, no light answer is waited for',
  );
});

test("a factory in the switcher says its runs in flight, every factory's said as runs; a name no factory has, or a file that does not read, says so", async () => {
  const { inFlightWords, supportOf } = await import('../src/components/factory/FactoryPicker.tsx');
  assert.equal(inFlightWords(0, true), 'none in flight');
  assert.equal(inFlightWords(1, true), '1 run in flight');
  assert.equal(inFlightWords(5, true), '5 runs in flight');
  assert.equal(inFlightWords(4, false), '4 in flight');
  const moving = (id: string, factory: string | null) => listed(summary([['build', 'checking']], { id, factory }));
  const open = {
    asOf: at,
    counts: { waiting: 0, inFlight: 3, finished: 0 },
    waiting: [],
    inFlight: [moving('a', 'nemia'), moving('b', 'nemia'), moving('c', null)],
  };
  assert.equal(supportOf({ name: 'nemia', factory: filed('nemia') }, open), '2 in flight');
  assert.equal(
    supportOf({ name: 'default', factory: filed('default', { default: true }) }, open),
    '1 in flight',
    "a run naming none is the default's",
  );
  assert.equal(supportOf({ name: 'quay', factory: filed('quay') }, open), 'none in flight');
  assert.equal(supportOf({ name: 'quay', factory: filed('quay') }, undefined), undefined, 'nothing before the light answer is read');
  assert.equal(supportOf({ name: 'gone' }, open), 'no such factory');
  assert.equal(supportOf({ name: 'quay', factory: filed('quay', { error: 'not JSON' }) }, open), 'its file does not read');
});

test('REFUSED: the start in no factory yet offers each factory a run starts in, the default left out, one that cannot start saying why', async () => {
  const { FactoryChoice } = await import('../src/components/factory/FactoryStart.tsx');
  const factories = [
    filed('default', { default: true, workflows: null }),
    filed('nemia'),
    filed('quay', { error: '/wf/factories/quay.json is not JSON' }),
  ];
  const html = await pagedWith(createElement(FactoryChoice, { factories }));
  assert.deepEqual(
    [...html.matchAll(/data-start-factory="([^"]+)"/g)].map((m) => m[1]),
    ['nemia', 'quay'],
  );
  assert.match(html, /data-start-factory="quay"[\s\S]*disabled=""[\s\S]*data-why-not[^>]*>The factory quay&#x27;s file does not read/);
  assert.doesNotMatch(html.slice(0, html.indexOf('data-start-factory="quay"')), /disabled=""|data-why-not/);
  assert.equal([...html.matchAll(/<button[^>]*>(nemia|quay)<\/button>/g)].length, 2, 'each factory a button, which a press picks');
  assert.doesNotMatch(html, /type="radio"/, 'refused: a radio, which an arrow key checks, and so picks, while moving past it');
  assert.match(await pagedWith(createElement(FactoryChoice, { factories: [factories[0]] })), /No factory is filed to start a run in/);
});

/** A factory's rules as its settings page draws them over the api's answer `read`: the file is `/store/factories/hiring/RULES.md`. */
async function rulesMarkup(read: { words: string | null; error: string | null }): Promise<string> {
  const { FactoryRules } = await import('../src/components/factory/FactoryRules.tsx');
  const { factoryRulesQuery } = await import('../src/lib/api/factories.ts');
  const answer = { name: 'hiring', file: '/store/factories/hiring/RULES.md', ...read };
  return routedWith(createElement(FactoryRules, { name: 'hiring' }), [[factoryRulesQuery('hiring').queryKey, answer]]);
}

test("a factory's rules draw their words, where they are kept and who is told them; Clear is offered only while a file is kept", async () => {
  const kept = await rulesMarkup({ words: 'Never push on a Friday.', error: null });
  assert.match(kept, /<section aria-label="Rules" data-factory-rules="true"/);
  assert.match(kept, /data-rules-told[^>]*>Told to every agent hired into this factory, after its custom instructions and before/);
  assert.match(kept, /<textarea[^>]*>Never push on a Friday\.<\/textarea>/);
  assert.match(kept, /data-rules-file[^>]*>\/store\/factories\/hiring\/RULES\.md</);
  assert.match(kept, />Clear…</, 'rules kept: they can be cleared');
  assert.doesNotMatch(kept, /data-rules-error|data-rules-refused|data-rules-done/, 'rules that read say no trouble, and nothing done yet');
  const none = await rulesMarkup({ words: null, error: null });
  assert.match(none, /<textarea[^>]*><\/textarea>/);
  assert.doesNotMatch(none, />Clear…<|data-rules-error/, 'no file kept: nothing to clear, and nothing wrong');
});

test("a factory's rules that cannot be told say why and what they stop, and what is there can be cleared, words read or not", async () => {
  const why = '/store/factories/hiring/RULES.md is not a file: remove it, and write the rules again.';
  const untold = await rulesMarkup({ words: null, error: why });
  const alert = /<div[^>]*data-rules-error="true"[^>]*>[^]*?<\/div><\/div>/.exec(untold)?.[0] ?? '';
  assert.match(alert, /role="alert"/, untold);
  assert.match(alert, /These rules cannot be told, and no run starts in this factory until they can/);
  assert.ok(alert.includes(why), alert);
  assert.match(untold, /<textarea[^>]*><\/textarea>/, 'no words were read');
  assert.match(untold, />Clear…</, 'with no words read, what is at the file can still be cleared');
  const keyed = await rulesMarkup({ words: '---\ntools: Bash\n---\nUse Bash.', error: 'RULES.md opens with a frontmatter block.' });
  assert.match(keyed, /data-rules-error="true"[^]*RULES\.md opens with a frontmatter block\./);
  assert.match(keyed, /<textarea[^>]*>---\ntools: Bash\n---\nUse Bash\.<\/textarea>/, 'the words are given beside it, to mend');
  assert.match(keyed, />Clear…</);
});

/** The Factories with no factory, drawn over a cache holding the store's lines and Nemia's `level`, or none read yet. */
async function noFactoryWith(level: Record<string, unknown> | null): Promise<string> {
  const { FactoriesCanvas } = await import('../src/components/factory/FactoriesCanvas.tsx');
  const client = new QueryClient();
  client.setQueryData(['store'], {
    workflows: '/store/workflows',
    agents: '/store/agents',
    skills: '/store/skills',
    fileFactory: 'nemia factory new <name>',
    turnOnNemia: 'nemia level semi-auto',
  });
  if (level !== null)
    client.setQueryData(['nemia', 'level'], {
      level: 'manual',
      since: null,
      task: null,
      phase: null,
      sessionId: null,
      reach: [],
      bridge: null,
      stopped: false,
      spend: null,
      allows: [],
      factories: [],
      trust: null,
      ...level,
    });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(FactoriesCanvas, { blocks: [] })));
}

test('no factory and Nemia off: Turn Nemia on, beside the line that does it from the command line; on: her session in words', async () => {
  const off = await noFactoryWith({});
  assert.match(off, /No factory yet[\s\S]*<code>nemia factory new &lt;name&gt;<\/code>/);
  assert.match(
    off,
    /data-nemia-off[\s\S]*<button[^>]*data-nemia-turn-on[^>]*>Turn Nemia on<\/button>[\s\S]*<code[^>]*>nemia level semi-auto<\/code>/,
  );
  assert.doesNotMatch(off, /data-nemia-on=/);

  const raised = await noFactoryWith({ factories: [{ factory: 'mill', level: 'semi-auto', default: 'manual', own: null, raise: null }] });
  assert.doesNotMatch(raised, /data-nemia-turn-on/, 'a factory above Manual keeps her: she is on');

  const waiting = await noFactoryWith({ level: 'semi-auto', task: 'nemia-1', trust: TRUST });
  assert.doesNotMatch(waiting, /data-nemia-turn-on/);
  assert.match(waiting, /data-nemia-on="true" data-state="untrusted"[\s\S]*Nemia is on\. Waiting on your trust/);
  assert.match(waiting, /data-nemia-trust[\s\S]*<code[^>]*>cd &#x27;\/store\/nemia&#x27; &amp;&amp; claude<\/code>/);
  assert.equal(waiting.split('in a terminal').length, 2, 'how to trust it is said once');

  const up = await noFactoryWith({ ...nemiaUp });
  assert.match(up, /data-nemia-on="true" data-state="up"[\s\S]*Nemia is on\. Up: her session runs\./);
  assert.doesNotMatch(up, /data-nemia-trust/);

  assert.doesNotMatch(await noFactoryWith(null), /data-nemia-o(n|ff)=/, 'nothing offered while her level is not read');
});

/** A factory's template as the api answers it: applied at `applied`, with `conditions`. */
const template = (applied: string | null, conditions: import('../src/lib/api/factories.ts').FactoryCondition[] = []) => ({
  source: '/drafts/team',
  version: 'v2',
  params: { repo: '/work/repo', retries: 2 },
  applied,
  conditions,
});

test("a factory's Template card: where it is, the version wanted and applied, each parameter, and each condition, amiss in the destructive colour", () => {
  const html = renderToStaticMarkup(
    createElement(TemplateCard, {
      template: template('v1', [
        { type: 'Applied', status: 'False', reason: 'VersionDrift', message: 'the template is at v2, applied at v1' },
        { type: 'ConflictsPending', status: 'False', reason: 'NoUpgrade', message: 'nothing to merge' },
      ]),
    }),
  );
  assert.match(html, /data-template="\/drafts\/team"/);
  assert.match(html, />Template</);
  assert.match(html, /data-template-version="true">v2</);
  assert.match(html, /data-template-applied="v1">applied at <span[^>]*>v1</);
  assert.match(html, /data-param="repo"><dt[^>]*>repo<\/dt><dd[^>]*>\/work\/repo</);
  assert.match(html, /data-param="retries"><dt[^>]*>retries<\/dt><dd[^>]*>2</);
  assert.match(html, /data-condition="Applied" data-condition-status="False" data-amiss=""><span[^>]*data-variant="destructive"/);
  assert.match(html, /VersionDrift<\/span><span[^>]*>the template is at v2, applied at v1</);
  assert.match(html, /data-condition="ConflictsPending" data-condition-status="False"><span[^>]*data-variant="secondary"/);
  assert.doesNotMatch(html, /<(button|input|textarea)/, 'read-only: nothing to press or type in');
});

test('a Template card not rendered yet says the daemon renders it, and lists no condition', () => {
  const html = renderToStaticMarkup(createElement(TemplateCard, { template: template(null) }));
  assert.match(html, /data-template-applied="">not rendered yet: the daemon renders its tree on its next pass</);
  assert.doesNotMatch(html, /data-condition=/);
});

test('REFUSED: a schedule whose latest fire was refused draws why, whole, under its alert; one whose fire started its run draws none', async () => {
  const { FactorySchedules } = await import('../src/components/factory/FactorySchedules.tsx');
  const why =
    'dev: the factory nemia does not offer this workflow — it offers none yet. Attach it: nemia factory attach nemia dev. Nothing was started.';
  const scheduled = (workflow: string, extra: Partial<import('../src/lib/api/factories.ts').FactorySchedule>) => ({
    workflow,
    cron: '0 9 * * 1',
    tz: 'America/Montreal',
    brief: 'Read the stats',
    repo: null,
    next: '2026-10-12T13:00:00.000Z',
    last: null,
    refused: null,
    commands: { unschedule: `nemia factory unschedule nemia ${workflow}` },
    ...extra,
  });
  const factory = filed('nemia', {
    schedules: [
      scheduled('dev', { refused: why }),
      scheduled('janitor', { last: { run: 'read-the-stats-k2v9', at: '2026-10-05T13:00:02.000Z' } }),
    ],
  });
  const html = await routedWith(createElement(FactorySchedules, { factory }));
  const [, dev = '', janitor = ''] = html.split(/data-factory-schedule="(?=dev"|janitor")/);
  assert.match(dev, /data-schedule-refused="true"[^]*Its latest fire started no run/, 'the refused fire under its alert');
  assert.ok(dev.includes(why), `and why, whole: ${dev}`);
  assert.match(janitor, /href="\/runs\/read-the-stats-k2v9"/, "the started fire's row, its last run a link to the run's page");
  assert.doesNotMatch(janitor, /data-schedule-refused/, 'and no alert');
});

test("FactoryTrust says each place that is not trusted, what is withheld and the api's line; nothing for a factory whose places are trusted", async () => {
  const { FactoryTrust } = await import('../src/components/factory/FactoryTrust.tsx');
  assert.equal(renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia') })), '');
  const place = { place: '/code/nemia', harness: 'A harness', withheld: 'the allow rules of its settings', never: null };
  const one = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [place] }) }));
  assert.match(one, /data-untrusted="nemia"/);
  assert.match(one, /A place is not trusted/);
  assert.match(one, /data-untrusted-place="\/code\/nemia"/);
  assert.match(one, /is not trusted for A harness\. Withheld:.*the allow rules of its settings\./);
  assert.match(one, /Trust it:.*nemia factory trust nemia/);
  const home = { ...place, place: '/home/me', never: 'No trust is kept for a home directory.' };
  const never = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [home] }) }));
  assert.match(never, /No trust is kept for a home directory\./);
  assert.doesNotMatch(never, /data-trust-command/, 'a place no line repairs is offered none');
  const two = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [place, home] }) }));
  assert.match(two, /2 places are not trusted/);
  assert.match(two, /Trust them:/);
});

test("REFUSED: FactoryVolumes says the caveat on a writable volume alone — each path with its mark and the api's line; with none, the line that adds one", async () => {
  const { FactoryVolumes } = await import('../src/components/factory/FactoryVolumes.tsx');
  const volume = (path: string, readOnly: boolean) => ({ path, readOnly, commands: { rm: `nemia factory volume rm nemia ${path}` } });
  const factory = filed('nemia', { volumes: [volume('/home/me/notes', true), volume('/home/me/scratch', false)] });
  const html = renderToStaticMarkup(createElement(FactoryVolumes, { factory }));
  assert.match(html, /data-factory-volumes="nemia"/);
  assert.deepEqual(
    [...html.matchAll(/data-factory-volume="([^"]*)"/g)].map((m) => m[1]),
    ['/home/me/notes', '/home/me/scratch'],
    "each volume, in the api's order",
  );
  const [, notes = '', scratch = ''] = html.split(/data-factory-volume="/);
  assert.match(notes, /data-volume-mark="ro"[^>]*>:ro</);
  assert.match(scratch, /data-volume-mark="rw"[^>]*>:rw</);
  assert.doesNotMatch(notes, /data-volume-caveat/, 'a read-only volume carries no caveat');
  assert.match(scratch, /data-volume-caveat/, "the writable one says it is not the run's workspace");
  assert.ok(notes.includes('nemia factory volume rm nemia /home/me/notes'), "the api's line that takes it back");
  assert.ok(scratch.includes('nemia factory volume rm nemia /home/me/scratch'));
  assert.doesNotMatch(html, /data-no-volumes/);
  const none = renderToStaticMarkup(createElement(FactoryVolumes, { factory: filed('nemia') }));
  assert.match(none, /data-no-volumes/);
  assert.ok(none.includes('nemia factory volume add nemia &lt;path&gt;:ro|:rw'), `the api's line that adds one: ${none}`);
  assert.doesNotMatch(none, /data-factory-volume=/);
});

test('REFUSED: the start of a card that names no factory draws no start form before a factory is picked — a Factory list with nothing chosen; and with no factory to offer, the line that files one', async () => {
  const start = (factories: unknown[]) =>
    routedWith(createElement(UnassignedStart, { entry: inboxCard(), onStarted: () => {}, onRefused: () => {} }), [
      [['factories'], factories],
      STORE_ANSWER,
    ]);
  const html = await start(LISTED);
  assert.match(html, /data-start-unassigned="true"/);
  assert.match(
    html,
    /<option value="" disabled="" selected="">Pick the factory it runs in<\/option><option value="solo">solo<\/option><option value="pair">pair<\/option>/,
  );
  assert.doesNotMatch(html, /<form|>Workflow<|aria-label="Start idea"/);
  const none = await start([LISTED[0]]);
  assert.match(none, /data-no-factory="true"[^>]*>A card starts in a factory, and the store has none yet: file one with /);
  assert.doesNotMatch(none, /<select|<form/);
});

test("a factory's delegations list each agent's grants in words with a Remove, beside the form that writes one", async () => {
  const { FactoryDelegations } = await import('../src/components/factory/FactoryDelegations.tsx');
  const delegation = {
    apiVersion: 'nemia/v1' as const,
    kind: 'Delegation' as const,
    metadata: { name: 'planner', namespace: 'acme', resourceVersion: '1', creationTimestamp: '2026-11-06T10:00:00Z' },
    spec: { rules: [{ resources: ['hires'], resourceNames: [], verbs: ['update' as const] }] },
  };
  const html = await routedWith(createElement(FactoryDelegations, { name: 'acme' }), [
    [['delegations', 'acme'], [delegation]],
    [['delegable-agents', 'acme'], ['planner']],
  ]);
  assert.match(html, /data-delegation="planner"[^]*data-delegation-grant[^>]*>update hires, any name<[^]*data-delegation-remove/);
  assert.match(html, /data-delegation-form[^]*data-delegation-resource="hires"[^]*data-delegation-verb="update"/);
  const none = await routedWith(createElement(FactoryDelegations, { name: 'acme' }), [[['delegations', 'acme'], []]]);
  assert.match(none, /data-no-delegation/);
});
