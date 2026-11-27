/**
 * The inbox page's arithmetic (src/lib/inbox.ts) — the cards in order, the workflow a card's start is preset to, and the queue as the page
 * and the Factory say it — and what the board sends the api for it (src/lib/api/inbox.ts): a card filed, dropped, started, queued and
 * taken off the queue. `npm run e2e` looks at the page itself.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { UnreadAnswer, WriteRefusal } from '../src/lib/api/read.ts';
import { entriesOf, entryOf as cardEntryOf } from '../src/lib/api/inbox.ts';
import { cardList, cardObject } from './factory.fixture.ts';
import { CARD_WORDS, ENDED } from '../src/lib/words.ts';
import {
  CARD_STATES,
  cardQuery,
  dropCard,
  fileCard,
  cardCountQuery,
  chainsQuery,
  factoryInboxQuery,
  inboxPageQuery,
  queueCard,
  startCard,
  type CardState,
  type InboxEntry,
} from '../src/lib/api/inbox.ts';
import { startRun, type WorkflowListing } from '../src/lib/api/workflows.ts';
import { type Factory } from '../src/lib/api/factories.ts';
import {
  capLine,
  CARD_KIND,
  cardFiling,
  cardPlace,
  cardTag,
  cardWord,
  chainsOf,
  chainsPulled,
  inboxAskedOf,
  inboxSearch,
  INBOX_PAGE,
  factoriesOffered,
  factoryPreset,
  cardRepo,
  factoryRepoOf,
  inboxBadgeTitle,
  inPlay,
  ordinal,
  queueable,
  queueOf,
  startedCard,
  startPlace,
  triedLine,
  triedShown,
  unassigned,
  unreadWorkflows,
  workflowKey,
} from '../src/lib/inbox.ts';
import { apiAnswers } from './network.ts';

const entry = (name: string, filedAt: string | null, extra: Partial<InboxEntry> = {}) =>
  ({
    labels: {},
    name,
    file: `${name}.md`,
    title: name,
    workflow: null,
    repo: null,
    factory: null,
    from: [],
    startedAs: [],
    state: 'filed',
    phase: 'notStarted',
    followedBy: [],
    chained: false,
    error: null,
    filedAt,
    factoryRepo: null,
    ...extra,
  }) satisfies InboxEntry;

const listing = (name: string, from: 'repo' | 'user', dir: string, error: string | null = null) =>
  ({
    name,
    from,
    dir,
    description: null,
    readme: null,
    steps: [],
    graph: { roots: [], edges: [] },
    schemas: [],
    folderTeam: false,
    version: '0',
    error,
    unfilled: null,
  }) satisfies WorkflowListing;

const WORKFLOWS = [
  listing('dev', 'repo', '/code/app/workflows/dev'),
  listing('broken', 'repo', '/code/app/workflows/broken', 'review: `afer` is not a key a step has.'),
  listing('dev', 'user', '/home/me/.agent-workflows/workflows/dev'),
  listing('mine', 'user', '/home/me/.agent-workflows/workflows/mine'),
];

/** The api answering each request with `answer()`, for the length of the test: the requests the board sent. */
function sending(t: { onTestFinished: (fn: () => void) => void }, answer: () => Response) {
  const sent: Array<{ url: string; init: RequestInit | undefined }> = [];
  apiAnswers(async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init });
    return answer();
  });
  return sent;
}

const answered = (status: number, body: object | string, statusText = '') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });

describe('unreadWorkflows: the workflows a list leaves out', () => {
  test('the workflows a list leaves out are those that do not read, each with why', () => {
    const listed = [
      { name: 'dev', error: null },
      { name: 'bad', error: 'bad: no step' },
    ];
    assert.deepEqual(unreadWorkflows(listed), [{ name: 'bad', error: 'bad: no step' }]);
    assert.equal(unreadWorkflows([listed[0]]).length, 0);
  });
});

describe('workflowKey: a workflow as a pick is keyed', () => {
  test('a workflow as a pick is keyed by its source and its name: yours and the repository may each have one of a name', () => {
    assert.equal(workflowKey(WORKFLOWS[0]), 'repo:dev');
    assert.equal(workflowKey(WORKFLOWS[2]), 'user:dev');
  });
});

/** A card as the Card verbs answer it, named `name`, in `namespace`. */
const cardAnswer = (name: string, namespace = 'default') => ({
  apiVersion: 'nemia/v1',
  kind: 'Card',
  metadata: { name, namespace, creationTimestamp: '2026-09-16T10:00:00.000Z', resourceVersion: 'v1' },
  spec: { body: 'Cache the views' },
  status: { state: 'filed', runs: [], inPlay: true },
});
/** Each request sent: its path, method, content type and body. */
const asSent = (sent: Array<{ url: string; init: RequestInit | undefined }>) =>
  sent.map(({ url, init }) => [
    url,
    init?.method,
    new Headers(init?.headers).get('content-type'),
    init?.body == null ? undefined : typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as Uint8Array),
  ]);

describe('fileCard, dropCard, startCard, queueCard: what the board sends the api for a card, through the Card verbs', () => {
  test("a card is filed in its factory's namespace as JSON, its factory carried by the path, and resolves with its name; a refusal rejects with the api's words", async (t) => {
    let answer = () => answered(201, cardAnswer('cache-the-views-k2q9', 'pair'), 'Created') satisfies Response;
    const sent = sending(t, () => answer());
    const card = { body: 'Cache the views', workflow: 'dev', factory: 'pair' };
    assert.deepEqual(await fileCard(card), { name: 'cache-the-views-k2q9' });
    const [{ url, init }] = sent as [(typeof sent)[number]];
    assert.deepEqual(
      [url, init?.method, new Headers(init?.headers).get('content-type')],
      ['/api/namespaces/pair/cards', 'POST', 'application/json'],
    );
    const { factory: _, ...body } = card;
    assert.deepEqual(JSON.parse(String(init?.body)), body, 'the factory is the namespace, never sent twice');
    answer = () => answered(201, cardAnswer('a-k2q9'), 'Created');
    const held = { body: 'An idea', repo: '/code/app', from: 'repo' };
    await fileCard(held);
    assert.deepEqual(
      JSON.parse(String(sent[1]?.init?.body)),
      { body: 'An idea' },
      'never a repository nor an origin, whatever the caller held',
    );
    assert.equal(sent[1]?.url, '/api/namespaces/default/cards', 'a card that names no factory is filed in default');
    await fileCard({ body: '---\nfactory: acme\n---\nAn idea' });
    assert.equal(sent[2]?.url, '/api/namespaces/acme/cards', 'an idea whose own factory: line names one, none picked, is filed in it');

    answer = () => answered(422, { error: 'the idea names no directory' });
    await assert.rejects(
      fileCard(card),
      (err: Error) => err instanceof WriteRefusal && err.status === 422 && err.message === 'the idea names no directory',
    );
    answer = () => answered(502, 'Bad Gateway', 'Bad Gateway');
    await assert.rejects(
      fileCard(card),
      (err: Error) => err instanceof WriteRefusal && err.status === 502 && err.message.includes('POST /api/namespaces/pair/cards'),
    );
    answer = () => answered(201, { ...cardAnswer('x'), metadata: {} }, 'Created');
    await assert.rejects(
      fileCard(card),
      (err: Error) =>
        err instanceof UnreadAnswer &&
        err.route === 'POST /api/namespaces/pair/cards' &&
        err.message.includes('at metadata.name') &&
        /before filing it again/.test(err.message),
    );
  });
  test("a card is dropped by its namespace and name in the path, sent as `{}` in JSON; a refusal rejects with the api's words", async (t) => {
    let answer = () => answered(200, cardAnswer('a b')) satisfies Response;
    const sent = sending(t, () => answer());
    await dropCard({ name: 'a b', factory: null });
    await dropCard({ name: 'c', factory: 'pair' });
    assert.deepEqual(asSent(sent), [
      ['/api/namespaces/default/cards/a%20b', 'DELETE', 'application/json', '{}'],
      ['/api/namespaces/pair/cards/c', 'DELETE', 'application/json', '{}'],
    ]);

    answer = () => answered(404, { error: 'no card gone-k2q9' });
    await assert.rejects(dropCard({ name: 'gone-k2q9', factory: null }), (err: Error) => err instanceof WriteRefusal && err.status === 404);
    answer = () => answered(500, 'oops', 'Internal Server Error');
    await assert.rejects(
      dropCard({ name: 'gone-k2q9', factory: null }),
      (err: Error) =>
        err instanceof WriteRefusal &&
        err.status === 500 &&
        err.message.includes('DELETE /api/namespaces/default/cards/gone-k2q9') &&
        err.message.includes('500 Internal Server Error'),
    );
  });
  test('a card is started by its own verb, with the workflow and the brief, and resolves with the run: the card stays', async (t) => {
    let answer = () =>
      answered(201, { id: 'show-each-step-s-cost-42g6', card: 'show-what-a-step-cost-c3cw' }, 'Created') satisfies Response;
    const sent = sending(t, () => answer());
    const asked = { workflow: 'dev', brief: "Show each step's cost", after: ['p-1'] };
    const card = { name: 'show-what-a-step-cost-c3cw', factory: null };
    assert.deepEqual(await startCard(card, asked), { id: 'show-each-step-s-cost-42g6', card: 'show-what-a-step-cost-c3cw' });
    assert.equal(sent[0]?.url, '/api/namespaces/default/cards/show-what-a-step-cost-c3cw/start');
    assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), asked);

    answer = () => answered(404, { error: 'no card show-what-a-step-cost-c3cw' });
    await assert.rejects(startCard(card, asked), (err: Error) => err instanceof WriteRefusal && err.status === 404);
  });
  test("a card is queued and taken off the queue by its own verbs, POST, each sent as `{}` in JSON; a refusal rejects with the api's words", async (t) => {
    let answer = () => answered(200, cardAnswer('a b')) satisfies Response;
    const sent = sending(t, () => answer());
    assert.equal((await queueCard({ name: 'a b', factory: 'pair' })).metadata.name, 'a b');
    await queueCard({ name: 'a b', factory: 'pair' }, { off: true });
    assert.deepEqual(asSent(sent), [
      ['/api/namespaces/pair/cards/a%20b/queue', 'POST', 'application/json', '{}'],
      ['/api/namespaces/pair/cards/a%20b/unqueue', 'POST', 'application/json', '{}'],
    ]);

    answer = () => answered(422, { error: 'bare.md: no workflow' });
    await assert.rejects(queueCard({ name: 'bare', factory: null }), (err: Error) => err instanceof WriteRefusal && err.status === 422);
    answer = () => answered(502, 'Bad Gateway', 'Bad Gateway');
    await assert.rejects(
      queueCard({ name: 'bare', factory: null }, { off: true }),
      (err: Error) => err instanceof WriteRefusal && err.message.includes('POST /api/namespaces/default/cards/bare/unqueue'),
    );
    answer = () => answered(200, {});
    await assert.rejects(
      queueCard({ name: 'bare', factory: null }),
      (err: Error) =>
        err instanceof UnreadAnswer &&
        err.route === 'POST /api/namespaces/default/cards/bare/queue' &&
        /before asking again/.test(err.message),
    );
  });
  test('REFUSED: a card started in a factory says the factory alone in the query, never a repository, nor an origin in the body', async (t) => {
    const sent = sending(t, () => answered(201, { id: 'r', card: 'c' }, 'Created'));
    const asked = { workflow: 'good', brief: 'Hire' };
    await startCard({ name: 'c', factory: null }, { ...asked, from: 'repo', repo: '/r/x' } as typeof asked, 'hiring');
    assert.equal(sent[0]?.url, '/api/namespaces/default/cards/c/start?factory=hiring', "the factory's wiring places the run");
    assert.deepEqual(
      JSON.parse(String(sent[0]?.init?.body)),
      asked,
      'the workflow by its name, which the factory finds, whatever the caller held',
    );
    await startCard({ name: 'c', factory: 'hiring' }, asked, 'default');
    await startCard({ name: 'c', factory: 'hiring' }, asked);
    assert.deepEqual(
      sent.slice(1).map((s) => s.url),
      ['/api/namespaces/hiring/cards/c/start', '/api/namespaces/hiring/cards/c/start'],
      'the default factory, and no place, send no query',
    );
  });
  test("a run started of no card goes to its factory's namespace, its repository in the query, none for the default", async (t) => {
    const sent = sending(t, () => answered(201, { id: 'r' }, 'Created'));
    await startRun({ workflow: 'good', from: 'repo', brief: 'Hire' }, { factory: 'hiring', repo: '/r/x' });
    await startRun({ workflow: 'good', from: 'repo', brief: 'Hire' }, { factory: 'default', repo: '/r/x' });
    await startRun({ workflow: 'good', from: 'repo', brief: 'Hire' });
    assert.deepEqual(
      sent.map((s) => s.url),
      ['/api/namespaces/hiring/runs?repo=%2Fr%2Fx', '/api/namespaces/default/runs', '/api/namespaces/default/runs'],
    );
  });
});

describe('ordinal, queueOf, queueable, triedLine, capLine: the queue as the page and the Factory say it', () => {
  test('a place is said as a person says it: 1st, 2nd, 3rd, then th — 11th to 13th too — and 21st, 102nd', () => {
    assert.deepEqual([1, 2, 3, 4, 10, 11, 12, 13, 14, 21, 22, 23, 101, 102, 111, 112, 113].map(ordinal), [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '10th',
      '11th',
      '12th',
      '13th',
      '14th',
      '21st',
      '22nd',
      '23rd',
      '101st',
      '102nd',
      '111th',
      '112th',
      '113th',
    ]);
  });
  test("the queue is every card with a place, in its place's order, whatever order the inbox lists them in — a refused card in its place, a started one not", () => {
    const at = '2026-09-16T10:00:00.000Z';
    const cards = [
      entry('a-third', at, { workflow: 'dev', state: 'queued', queued: { at, place: 3 } }),
      entry('b-parked', at, { workflow: 'dev' }),
      entry('c-first', at, { workflow: 'dev', state: 'queued', queued: { at, place: 1 } }),
      entry('d-started', at, { workflow: 'dev', state: 'running', queued: { at, place: null }, startedAs: ['r-1'] }),
      entry('e-refused', at, {
        workflow: 'gone',
        state: 'refused',
        queued: { at, place: 2 },
        tried: { at, repo: '/code/app', why: 'no workflow gone.', refused: true },
      }),
    ];
    assert.deepEqual(
      queueOf(cards).map((c) => c.name),
      ['c-first', 'e-refused', 'a-third'],
    );
    assert.deepEqual(queueOf([]), []);
  });
  test('REFUSED: a try is shown on a queued or refused card that carries one, never on a started one, whatever it carries', () => {
    const at = '2026-09-16T10:00:00.000Z';
    const tried = { at, repo: '/code/app', why: 'no workflow gone.', refused: true };
    assert.equal(triedShown(entry('refused', at, { state: 'refused', queued: { at, place: 1 }, tried })), true);
    assert.equal(triedShown(entry('failed', at, { state: 'queued', queued: { at, place: 1 }, tried: { ...tried, refused: false } })), true);
    assert.equal(triedShown(entry('queued', at, { state: 'queued', queued: { at, place: 1 } })), false, 'no try');
    for (const state of ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped', 'cancelled'] as const)
      assert.equal(triedShown(entry('started', at, { state, startedAs: ['r-1'], queued: { at, place: null }, tried })), false, state);
  });
  test('Queue is offered on a card that names a factory and a workflow, reads, is not queued and was not started', () => {
    assert.equal(queueable(entry('named', null, { factory: 'solo', workflow: 'dev' })), true);
    assert.equal(
      queueable(entry('named', null, { factory: 'solo', workflow: 'dev', startedAs: ['r-1'] })),
      true,
      "its state says filed: the runs it names are links, never what decides it (the orchestrator's `state`)",
    );
  });
  test('REFUSED: no Queue on a card that names no factory, or default', () => {
    for (const factory of [null, 'default'])
      assert.equal(queueable(entry('loose', null, { factory, workflow: 'dev' })), false, String(factory));
  });
  test("REFUSED: no Queue on a card of a factory that names no workflow, one queued already, one a record says was started, or one that does not read — each a refusal of the package's", () => {
    const at = '2026-09-16T10:00:00.000Z';
    const solo = (name: string, extra: Partial<InboxEntry> = {}) => entry(name, null, { factory: 'solo', ...extra });
    assert.equal(queueable(solo('bare')), false, 'no workflow');
    assert.equal(queueable(solo('queued', { workflow: 'dev', state: 'queued', queued: { at, place: 1 } })), false, 'queued already');
    for (const state of ['pending', 'running', 'waiting', 'succeeded', 'failed', 'stopped', 'cancelled'] as const) {
      assert.equal(queueable(solo('started', { workflow: 'dev', state, startedAs: ['r-1'] })), false, `started, its run ${state}`);
      assert.equal(queueable(solo('started', { workflow: 'dev', state })), false, `started, its run ${state}, read off its state alone`);
    }
    assert.equal(queueable(solo('refused', { workflow: 'dev', state: 'refused' })), false, 'refused, read off its state alone');
    assert.equal(
      queueable(solo('broken', { workflow: 'dev', error: 'broken.md: `colour` is not a key an inbox card has.' })),
      false,
      'does not read',
    );
  });
  test("a start the tick tried and did not make says so as `wf inbox` does: refused, it stays queued and waits for you; failed, it is tried again — the repository named for a card of a factory, as its factory's where its wiring gives it, never for one that names no factory, and a why the card's own refusal says not said twice", () => {
    const at = '2026-09-16T10:00:00.000Z';
    const refused = { at, repo: '/code/app', why: 'no workflow gone in /code/app/workflows.', refused: true };
    assert.equal(
      triedLine({ factory: 'solo', factoryRepo: null, error: null, tried: refused }, 'then'),
      'Not started at then on /code/app: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
      'a factory that wires no repository for it: the try names where it was, and no daemon is told to run elsewhere',
    );
    assert.equal(
      triedLine({ factory: 'solo', factoryRepo: '/code/app', error: null, tried: refused }, 'then'),
      "Not started at then on /code/app, its factory's repository for its workflow: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.",
      'tried on the repository its factory wires for its workflow, from a daemon anywhere',
    );
    assert.equal(
      triedLine({ factory: 'solo', factoryRepo: '/r/b', error: null, tried: refused }, 'then'),
      'Not started at then on /code/app: no workflow gone in /code/app/workflows. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
      'a try on another repository than its wiring gives now (the wiring changed since) is not said to be the wired one',
    );
    const unfactored = 'card.md: this card names no factory, and a card is started only in the factory named for it.';
    assert.equal(
      triedLine({ factory: null, factoryRepo: null, error: null, tried: { ...refused, why: unfactored } }, 'then'),
      `Not started at then: ${unfactored} It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.`,
      'a card that names no factory is refused wherever a daemon runs: no repository is named to run one in',
    );
    const gone = 'card.md: `workflow: a/b` names a path; a card names a workflow by its name.';
    assert.equal(
      triedLine({ factory: null, factoryRepo: null, error: gone, tried: { ...refused, repo: '/code/gone', why: gone } }, 'then'),
      'Not started at then. It stays queued, and the tick does not try it again while it reads the same: edit the card, or take it off the queue and queue it again.',
    );
    assert.equal(
      triedLine(
        {
          factory: 'solo',
          factoryRepo: null,
          error: null,
          tried: { at, repo: '/code/app', why: 'git: not a git repository', refused: false },
        },
        'then',
      ),
      'Failed at then on /code/app: git: not a git repository. Not a refusal: the tick tries it again on every pass, where it keeps its place.',
    );
  });
  test("a factory's floor says the run slots taken of the machine's cap, on this machine, and how many are queued — `no cap` with none, and the queue left out when empty", () => {
    assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 3), '2 of 4 run slots taken on this machine · 3 queued');
    assert.equal(capLine({ cap: 4, inFlight: ['a', 'b'] }, 0), '2 of 4 run slots taken on this machine');
    assert.equal(capLine({ cap: 1, inFlight: [] }, 1), '0 of 1 run slots taken on this machine · 1 queued');
    assert.equal(capLine({ cap: 0, inFlight: null }, 3), 'no cap on this machine · 3 queued');
    assert.equal(capLine({ cap: 0, inFlight: null }, 0), 'no cap on this machine');
    assert.equal(capLine({ cap: 0, inFlight: ['a'] }, 0), 'no cap on this machine', 'a count with no cap is no count against one');
  });
});

/** The line that files a factory, as `GET /api/store` answers it. */
const FILE_FACTORY = 'nemia factory add <name> --volume <path|url>:rw';

/** A factory as the api lists it, on `repos`. */
const factoryOn = (name: string, repos: string[], error: string | null = null) =>
  ({
    name,
    default: name === 'default',
    worksOn: repos,
    workflows: name === 'default' ? null : ['good'],
    hires: {},
    error,
    commands: {
      attach: `nemia factory attach ${name} <workflow>`,
      rm: `nemia factory rm ${name}`,
      add: `nemia factory add ${name} --volume <path|url>:rw`,
      schedule: `nemia factory schedule ${name} <workflow> --cron <expr> --brief <text>`,
      trust: `nemia factory trust ${name}`,
      volume: `nemia factory volume add ${name} <path|url>:ro|:rw`,
      trigger: `nemia factory trigger ${name} <name> --labels <key>=<value> --to <workflow>`,
      home: null,
    },
    untrusted: [],
    volumes: [],
    costLines: {},
    workflowRepos: {},
    firstWorkflow: null,
    template: null,
  }) satisfies Factory;
const FACTORIES = [factoryOn('default', ['/code/app']), factoryOn('solo', ['/r/a']), factoryOn('pair', ['/r/a', '/r/b'])];

const SOLO = { name: 'solo', repos: ['/r/a'] };

const PAIR = { name: 'pair', repos: ['/r/a', '/r/b'] };

describe("cardPlace, cardFiling, factoriesOffered: a card's factory and place, the filing box and the badge", () => {
  test("a card's place: none in the default factory; else its factory, the workflow it names where offered, and the repository wired for it", () => {
    assert.equal(cardPlace(entry('a', null), FACTORIES, FILE_FACTORY), null);
    assert.equal(cardPlace(entry('a', null, { factory: 'default' }), FACTORIES, FILE_FACTORY), null);
    const solo = cardPlace(entry('a', null, { factory: 'solo', workflow: 'good' }), FACTORIES, FILE_FACTORY);
    assert.ok(solo && !('why' in solo));
    assert.deepEqual([solo.factory.name, solo.workflow, solo.on], ['solo', 'good', { repo: '/r/a' }], "the factory's only one");
    const pair = cardPlace(entry('a', null, { factory: 'pair', workflow: 'good', repo: '/r/b' }), FACTORIES, FILE_FACTORY);
    assert.ok(pair && !('why' in pair) && pair.on !== null && 'refused' in pair.on);
    assert.equal(pair.on.refused, 'unwired', "several, none wired: never the card's retired repo:");
    const wired = [...FACTORIES.filter((f) => f.name !== 'pair'), { ...factoryOn('pair', ['/r/a', '/r/b']), workflowRepos: { good: 'b' } }];
    const placed = cardPlace(entry('a', null, { factory: 'pair', workflow: 'good' }), wired, FILE_FACTORY);
    assert.ok(placed && !('why' in placed));
    assert.deepEqual(placed.on, { repo: '/r/b' }, 'the one its wiring names');
    for (const workflow of [null, 'nope', '/code/app/workflows/good', 'workflows/good']) {
      const none = cardPlace(entry('a', null, { factory: 'pair', workflow }), FACTORIES, FILE_FACTORY);
      assert.ok(none && !('why' in none));
      assert.deepEqual([none.workflow, none.on], [null, null], `${workflow}: no workflow the factory offers by that name, so none preset`);
    }
  });
  test('REFUSED: no place for a card naming a factory the store does not list, or one whose file does not read — each says why', () => {
    assert.deepEqual(cardPlace(entry('a', null, { factory: 'gone' }), FACTORIES, FILE_FACTORY), {
      why: "The card names the factory gone, which the store does not have: file it by that name with nemia factory add <name> --volume <path|url>:rw, or change the card's factory: line.",
    });
    assert.deepEqual(
      cardPlace(
        entry('a', null, { factory: 'bad' }),
        [...FACTORIES, factoryOn('bad', [], '/store/factories/bad.json is not JSON')],
        FILE_FACTORY,
      ),
      {
        why: 'The card names the factory bad, whose file does not read: /store/factories/bad.json is not JSON',
      },
    );
  });
  test('every card state has its kind: its own three unstarted, a run in flight, a run ended — the in play the api lists', () => {
    const kinds: Record<CardState, 'unstarted' | 'in flight' | 'ended'> = {
      filed: 'unstarted',
      queued: 'unstarted',
      refused: 'unstarted',
      pending: 'in flight',
      running: 'in flight',
      waiting: 'in flight',
      succeeded: 'ended',
      failed: 'ended',
      stopped: 'ended',
      cancelled: 'ended',
    };
    assert.deepEqual(Object.keys(CARD_KIND).sort(), [...CARD_STATES].sort(), 'one row for every state the api sends');
    for (const state of CARD_STATES) {
      assert.equal(CARD_KIND[state], kinds[state], state);
      assert.equal(startedCard({ state }), kinds[state] !== 'unstarted', `${state}: started`);
      assert.equal(inPlay({ state }), kinds[state] !== 'ended', `${state}: in play`);
    }
  });
  test("the Inbox badge's title says what it counts whole: in the factory picked, or in every factory", () => {
    assert.equal(inboxBadgeTitle(3, undefined), '3 cards not yet started, in every factory');
    assert.equal(inboxBadgeTitle(1, 'nemia'), '1 card not yet started, in nemia');
  });
  test('a card names no factory when it has no factory: line or writes default; one naming a factory is assigned', () => {
    assert.equal(unassigned({ factory: null }), true);
    assert.equal(unassigned({ factory: 'default' }), true);
    assert.equal(unassigned({ factory: 'solo' }), false);
  });
  test("the factories offered are the named ones whose file reads, in the api's order: never the default factory, never one that does not read", () => {
    const listed = [
      factoryOn('default', ['/code/app']),
      factoryOn('pair', ['/r/a', '/r/b']),
      factoryOn('bad', [], 'not JSON'),
      factoryOn('solo', ['/r/a']),
    ];
    assert.deepEqual(
      factoriesOffered(listed).map((f) => f.name),
      ['pair', 'solo'],
    );
    assert.equal(factoriesOffered([factoryOn('default', ['/code/app'])]).length, 0);
  });
  test("the box is preset to the address's factory when it is offered, else to no factory", () => {
    const offered = factoriesOffered(FACTORIES);
    assert.equal(factoryPreset('solo', offered), 'solo');
    for (const shown of ['gone', 'default', undefined]) assert.equal(factoryPreset(shown, offered), '', String(shown));
    assert.equal(factoryPreset('solo', []), '', 'shown, and not offered');
  });
  test('REFUSED: the box never sends a repository nor an origin — a card names its factory and a workflow by name, the factory places its run', () => {
    assert.deepEqual(cardFiling({ idea: 'An idea', factory: null, workflow: 'good' }), { body: 'An idea' }, 'no factory: the idea alone');
    assert.deepEqual(cardFiling({ idea: 'An idea', factory: PAIR, workflow: null }), { body: 'An idea', factory: 'pair' });
    for (const factory of [SOLO, PAIR]) {
      const filed = cardFiling({ idea: 'An idea', factory, workflow: 'good' });
      assert.deepEqual(filed, { body: 'An idea', factory: factory.name, workflow: 'good' }, factory.name);
      assert.equal('repo' in filed, false, `${factory.name}: the factory's wiring places the run, never the card`);
      assert.equal('from' in filed, false, `${factory.name}: the factory finds the workflow by its name`);
    }
    const held = { idea: 'An idea', factory: PAIR, workflow: 'good', repo: '/r/b', from: 'repo' } as Parameters<typeof cardFiling>[0];
    assert.deepEqual(Object.keys(cardFiling(held)).sort(), ['body', 'factory', 'workflow'], 'whatever a caller still holds');
  });
  test("a card of no factory starts nowhere until a factory is picked, then in that factory's place, whatever repository the card names", () => {
    assert.equal(startPlace(entry('a', null), '', FACTORIES, FILE_FACTORY), null);
    const solo = startPlace(entry('a', null, { workflow: 'good', repo: '/code/app' }), 'solo', FACTORIES, FILE_FACTORY);
    assert.ok(solo && !('why' in solo));
    assert.deepEqual([solo.factory.name, solo.workflow, solo.on], ['solo', 'good', { repo: '/r/a' }]);
    const gone = startPlace(entry('a', null), 'gone', FACTORIES, FILE_FACTORY);
    assert.ok(gone && 'why' in gone, 'a factory the store does not have says why');
  });
  test("the floor's cards are its factory's in play, asked of the api, never every card of every factory", async (t) => {
    const sent = sending(t, () => answered(200, cardList()));
    await (factoryInboxQuery('pair').queryFn as unknown as () => Promise<InboxEntry[]>)();
    await (factoryInboxQuery('default').queryFn as unknown as () => Promise<InboxEntry[]>)();
    const urls = sent.map((r) => new URL(r.url, 'http://board'));
    assert.deepEqual(
      urls.map((u) => u.pathname),
      ['/api/namespaces/pair/cards', '/api/namespaces/default/cards'],
    );
    assert.deepEqual(
      urls.map((u) => u.searchParams.get('fieldSelector')),
      ['status.inPlay=true', 'status.inPlay=true'],
      'the api keeps the cards in play',
    );
    const key = factoryInboxQuery('pair').queryKey;
    assert.equal(key[0], 'inbox', "under ['inbox'], so every write and the feed read it again");
    assert.notDeepEqual(key, cardQuery('pair').queryKey, 'a card named as the factory keeps its page');
    assert.notDeepEqual(key, factoryInboxQuery('default').queryKey, 'each factory its own key');
  });
  test("a Card is the board's entry: its factory its namespace, its file its name, its place the one the api answers", () => {
    const queued = (name: string, at: string, place: number, namespace = 'pair') =>
      cardObject({ metadata: { name, namespace }, spec: { queued: at }, status: { state: 'queued', runs: [], inPlay: true, place } });
    const whole = cardList(
      queued('late', '2026-09-16T11:00:00.000Z', 3),
      queued('early-b', '2026-09-16T10:00:00.000Z', 2, 'default'),
      cardObject({
        metadata: { name: 'started' },
        spec: { queued: '2026-09-16T09:00:00.000Z' },
        status: { state: 'running', runs: ['r-9'], inPlay: true },
      }),
    );
    const byName = new Map(entriesOf(whole).map((e) => [e.name, e]));
    assert.deepEqual(
      ['early-b', 'late', 'started'].map((name) => byName.get(name)?.queued?.place),
      [2, 3, null],
      "each queued card's place as the api answers it, the board ordering none; a card with none has none",
    );
    assert.equal(byName.get('early-b')?.factory, null, 'default is no factory');
    assert.equal(byName.get('late')?.factory, 'pair');
    assert.equal(byName.get('late')?.file, 'late.md');
    assert.deepEqual(cardEntryOf(cardObject({ metadata: { labels: { team: 'core' } } })).labels, { team: 'core' });
  });
  test("each card state has a person's word, its sentence and a hue: a run called off is never said cancelled", () => {
    for (const state of CARD_STATES) {
      assert.ok(CARD_WORDS[state].word.trim() !== '', state);
      assert.ok(CARD_WORDS[state].title.trim() !== '', state);
    }
    assert.equal(CARD_WORDS.cancelled.word, 'cancelled');
    assert.equal(CARD_WORDS.waiting.hue, 'yours', 'a run waiting on a person is yours');
    assert.equal(CARD_WORDS.running.hue, 'alive');
    assert.equal(CARD_WORDS.failed.hue, 'failure');
  });
  test("a card whose run ended wears its outcome's hue, as every page draws that outcome (`ENDED`)", () => {
    for (const outcome of ['succeeded', 'failed', 'cancelled'] as const) {
      assert.deepEqual([CARD_WORDS[outcome].word, CARD_WORDS[outcome].hue], [ENDED[outcome].word, ENDED[outcome].hue], outcome);
    }
  });
});

test("cardRepo, factoryRepoOf: the repository a card's factory wires for its workflow, read off the factories as the orchestrator reads it", () => {
  const wired = (name: string, repos: string[], workflowRepos: Record<string, string> = {}) => ({
    ...factoryOn(name, repos),
    workflowRepos,
  });
  const factories = [
    wired('solo', ['/code/app']),
    wired('pair', ['/r/app', '/r/docs'], { good: 'docs' }),
    factoryOn('broken', ['/r/c'], 'bad'),
    factoryOn('default', ['/x']),
  ];
  const card = (factory: string | null, workflow: string | null, repo: string | null = null) =>
    entry('c', null, { factory, workflow, repo });
  assert.deepEqual(cardRepo(card('solo', 'good'), factories), { repo: '/code/app' }, 'its only one');
  assert.deepEqual(cardRepo(card('solo', null), factories), { repo: '/code/app' }, 'its only one, with no workflow named');
  assert.deepEqual(cardRepo(card('pair', 'good'), factories), { repo: '/r/docs' }, 'the one its wiring names for the workflow');
  assert.deepEqual(cardRepo(card('pair', 'good', '/r/app'), factories), { repo: '/r/docs' }, "never the card's repo:, which is retired");
  const unwired = cardRepo(card('pair', 'other'), factories);
  assert.ok(unwired !== null && 'refused' in unwired && unwired.refused === 'unwired', 'several, and none named for it');
  assert.match(unwired.why, /nemia factory attach pair other --repo/);
  assert.equal(cardRepo(card('pair', null), factories), null, 'several, and no workflow named: its start picks one');
  assert.equal(cardRepo(card('pair', '/code/app/workflows/good'), factories), null, 'a path is no workflow name');
  assert.equal(cardRepo(card('broken', 'good'), factories), null, 'a factory that does not read');
  assert.equal(cardRepo(card(null, 'good'), factories), null, 'no factory: the daemon places it');
  assert.equal(cardRepo(card('default', 'good'), factories), null, 'the default');
  assert.equal(cardRepo(card('gone', 'good'), factories), null, 'a factory not listed');
  assert.equal(cardRepo(card('solo', 'good'), undefined), null, 'the factories unread');
  assert.equal(factoryRepoOf(card('pair', 'good'), factories), '/r/docs');
  assert.equal(factoryRepoOf(card('pair', 'other'), factories), null, 'a refusal is no repository');
});

describe('inboxSearch, inboxAskedOf, chainsPulled: what the Inbox page keeps in its address and asks of the api', () => {
  test('the address keeps words, the older order, the closed side and a state of the side shown, and nothing else', () => {
    assert.deepEqual(inboxSearch({}), {});
    assert.deepEqual(inboxSearch({ q: '  reads ', sort: 'oldest', cards: 'closed', state: 'done' }), {
      q: 'reads',
      sort: 'oldest',
      cards: 'closed',
      state: 'done',
    });
    assert.deepEqual(inboxSearch({ sort: 'newest', cards: 'open', q: ' ' }), {}, 'the first look is the address without a key');
  });
  test('REFUSED: a state of the other side is no state, so an address that names one reads as All', () => {
    assert.deepEqual(inboxSearch({ state: 'done' }), {});
    assert.deepEqual(inboxSearch({ cards: 'closed', state: 'working' }), { cards: 'closed' });
    assert.deepEqual(inboxSearch({ state: 'nonsense' }), {});
  });
  test('the page asks the api for its side, its words, its labels, its order and its page; chains are pulled out only where nothing filters', () => {
    assert.deepEqual(inboxAskedOf({}), {
      fieldSelector: 'status.inPlay=true,status.chained=false',
      orderBy: 'metadata.creationTimestamp desc',
      limit: INBOX_PAGE,
    });
    assert.equal(chainsPulled({}), true);
    assert.deepEqual(inboxAskedOf({ q: 'reads', l: 'team=core', sort: 'oldest', older: 'abc' }), {
      fieldSelector: 'status.inPlay=true',
      labelSelector: 'team=core',
      search: 'reads',
      orderBy: 'metadata.creationTimestamp',
      limit: INBOX_PAGE,
      continue: 'abc',
    });
    for (const view of [{ q: 'reads' }, { l: 'team=core' }, { state: 'working' as const }, { cards: 'closed' as const }])
      assert.equal(chainsPulled(view), false, JSON.stringify(view));
    assert.equal(inboxAskedOf({ state: 'working' }).fieldSelector, 'status.phase=working', 'a state is one flat page of that phase');
    assert.equal(inboxAskedOf({ cards: 'closed' }).fieldSelector, 'status.inPlay=false');
  });
  test("a page is one read of the api, with its counts and the labels in use, and the counts of a factory's cards are a page of one", async (t) => {
    const sent = sending(t, () => answered(200, cardList()));
    const asked = inboxAskedOf({ q: 'reads' });
    const page = await (inboxPageQuery(asked, 'pair').queryFn as unknown as () => Promise<{ entries: unknown[]; next: string | null }>)();
    assert.deepEqual([page.entries, page.next], [[], null]);
    const counts = await (cardCountQuery('pair').queryFn as unknown as () => Promise<Record<string, number>>)();
    assert.equal(counts.notStarted, 0);
    const [first, second] = sent.map((r) => new URL(r.url, 'http://board'));
    assert.equal(first?.pathname, '/api/namespaces/pair/cards');
    assert.equal(first?.searchParams.get('search'), 'reads');
    assert.equal(first?.searchParams.get('limit'), String(INBOX_PAGE));
    assert.equal(second?.searchParams.get('limit'), '1');
    assert.equal(sent.length, 2, 'one read each: no page past the first');
    assert.equal(inboxPageQuery(asked).queryKey[0], 'inbox');
    assert.notDeepEqual(inboxPageQuery(asked).queryKey, inboxPageQuery(asked, 'pair').queryKey, 'each factory its own key');
    assert.notDeepEqual(inboxPageQuery(asked).queryKey, cardQuery('all').queryKey, 'a card named all keeps its page');
  });
  test('the chains are read whole: every page of the cards in chains still in play', async (t) => {
    const sent = sending(t, () => answered(200, cardList()));
    await (chainsQuery().queryFn as unknown as () => Promise<unknown>)();
    assert.equal(new URL(sent[0]?.url ?? '', 'http://board').searchParams.get('fieldSelector'), 'status.inPlay=true,status.chained=true');
  });
});

describe('cardTag, chainsOf: how a card is drawn and how chains are laid out', () => {
  test("a card says one word: refused, stuck, blocked or pending where it is queued, else its run's phase, and none where it is filed and quiet", () => {
    const at = '2026-09-16T10:00:00.000Z';
    const wait = { card: 'before', kind: 'waiting' as const, stalled: false };
    assert.equal(cardWord(entry('filed', at)), null);
    assert.equal(cardWord(entry('refused', at, { state: 'refused', queued: { at, place: 1 } })), 'refused');
    assert.equal(cardWord(entry('queued', at, { state: 'queued', queued: { at, place: 1 } })), 'pending');
    assert.equal(cardWord(entry('chained', at, { state: 'queued', queued: { at, place: 1 }, waits: [wait] })), 'blocked');
    assert.equal(cardWord(entry('stuck', at, { waits: [{ ...wait, stalled: true }] })), 'stuck');
    assert.equal(cardWord(entry('working', at, { state: 'running', phase: 'working', startedAs: ['r-1'] })), 'working');
    assert.equal(cardWord(entry('waiting', at, { state: 'waiting', phase: 'waiting', startedAs: ['r-1'] })), 'waiting');
    assert.equal(cardWord(entry('done', at, { state: 'succeeded', phase: 'done', startedAs: ['r-1'] })), 'done');
  });
  test('REFUSED: the frame takes a colour only for working, waiting, refused and stuck; the others have none, and a card that says nothing has no tag', () => {
    const at = '2026-09-16T10:00:00.000Z';
    const frames = (extra: Partial<InboxEntry>) => cardTag(entry('x', at, extra))?.frame;
    assert.equal(frames({ state: 'running', phase: 'working' }), 'alive');
    assert.equal(frames({ state: 'waiting', phase: 'waiting' }), 'yours');
    assert.equal(frames({ state: 'refused' }), 'failure');
    assert.equal(frames({ waits: [{ card: 'a', kind: 'waiting', stalled: true }] }), 'yours');
    assert.equal(frames({ state: 'succeeded', phase: 'done' }), 'none');
    assert.equal(frames({ state: 'failed', phase: 'failed' }), 'none');
    assert.equal(cardTag(entry('x', at)), null);
  });
  test('a chain is a set of cards joined by what they wait on, in columns by how many cards come before each', () => {
    const at = '2026-09-16T10:00:00.000Z';
    const link = (name: string, followedBy: string[]) => entry(name, at, { followedBy, chained: true });
    const chains = chainsOf([link('a', ['b']), link('b', ['c']), link('c', []), link('d', ['e']), link('e', []), link('f', ['c'])]);
    assert.deepEqual(
      chains.map((columns) => columns.map((column) => column.map((card) => card.name))),
      [
        [['a', 'f'], ['b'], ['c']],
        [['d'], ['e']],
      ],
    );
    assert.deepEqual(chainsOf([]), []);
  });
});
