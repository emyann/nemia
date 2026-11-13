/**
 * Who made a write, on the board (src/components/actor/Actor.tsx): one line in objects' words of the actor (`actorWords`), a glyph of the
 * person or an agent beside it, drawn under a gate's approval, a try's answer and a hold, and nothing where the served object carries no
 * actor (a record written before actors were said). And the Tokens page's words of a token (src/lib/tokens.ts) and its reads
 * (src/lib/api/tokens.ts): `GET /api/tokens` decoded, `DELETE /api/tokens/{name}` sent, an agent's 403 rejected as the refusal it is.
 * `npm run e2e` reads them on the pages (`680-tokens.ts`, `690-actor.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { at, routedWith, textsOf, threeTries } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { actorWords } = await import('objects');
const { Actor } = await import('../src/components/actor/Actor.tsx');
const { Approved } = await import('../src/components/gate/Gate.tsx');
const { TryCloseouts } = await import('../src/components/step/Closeout.tsx');
const { RunWait } = await import('../src/components/run/RunWait.tsx');
const { holderWord, reachWord } = await import('../src/lib/tokens.ts');
const { retireToken, tokensQuery } = await import('../src/lib/api/tokens.ts');
const { ReadRefusal, WriteRefusal } = await import('../src/lib/api/read.ts');

/** The actors a write can carry: the person on a token, the person in-process, an agent by its token, a session. */
const ACTORS = [
  { kind: 'person', token: 'laptop' },
  { kind: 'person' },
  { kind: 'agent', agent: 'operator', token: 'ops' },
  { kind: 'agent', agent: 'review', run: 'r-1', step: 'plan' },
] as const;

/** The actor lines of `html`: each one's kind and its words. */
const actorsIn = (html: string): Array<[string, string]> =>
  [...html.matchAll(/<span data-actor="(\w+)"[^>]*>([\s\S]*?)<\/span><\/span>/g)].map((m) => [m[1], textsOf(m[2]).join(' ')]);

test("an actor is drawn in objects' words, its kind marked, whole on hover; none is drawn where the object carries none", () => {
  for (const actor of ACTORS) {
    const html = renderToStaticMarkup(createElement(Actor, { actor }));
    assert.deepEqual(actorsIn(html), [[actor.kind, actorWords(actor)]], JSON.stringify(actor));
    assert.match(html, new RegExp(`title="Made by ${actorWords(actor).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`));
  }
  assert.equal(renderToStaticMarkup(createElement(Actor, { actor: undefined })), '', 'an older record: nothing drawn');
});

test("a gate's approval says who approved it, and an approval of an older record says no one", () => {
  const approval = { try: 1, at, message: null, actor: ACTORS[0] };
  const html = renderToStaticMarkup(createElement(Approved, { step: 'plan', approval }));
  assert.deepEqual(actorsIn(html), [['person', 'the person, on laptop']]);
  const older = renderToStaticMarkup(createElement(Approved, { step: 'plan', approval: { try: 1, at, message: null } }));
  assert.deepEqual(actorsIn(older), []);
});

test("a try's answer says who answered it, in the try shown and in an earlier one folded", () => {
  const tries = threeTries.map((t) => ({
    ...t,
    answer: t.try === 3 ? null : 'Fix the test.',
    ...(t.try === 2 ? { answeredBy: ACTORS[3] } : {}),
  }));
  const shown = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[1], none: '-' }));
  assert.deepEqual(
    actorsIn(shown),
    [['agent', 'review, of r-1/plan']],
    'try 2 shown: its answer and who gave it; try 1 answered by no one said',
  );
  const folded = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[2], none: '-' }));
  assert.deepEqual(actorsIn(folded), [['agent', 'review, of r-1/plan']], 'try 2 folded under the current: the same');
});

test('a hold says who put it, where its file says', async () => {
  const wait = {
    runs: [{ run: 'a-1', missing: false }],
    word: 'held until a-1 lands',
    advice: 'nemia hold r-1 --off',
    waitingOnYou: false,
  };
  const held = await routedWith(createElement(RunWait, { label: 'Held', wait, actor: ACTORS[2] }));
  assert.deepEqual(actorsIn(held), [['agent', 'operator, by its token ops']]);
  assert.deepEqual(actorsIn(await routedWith(createElement(RunWait, { label: 'Held', wait }))), []);
});

test("a token's holder and reach in the board's words: yours or the agent's name, its factory or store-wide", () => {
  assert.equal(holderWord({ holder: 'person' }), 'yours');
  assert.equal(holderWord({ holder: 'agent', agent: 'operator' }), 'operator');
  assert.equal(reachWord({}), 'store-wide');
  assert.equal(reachWord({ factory: 'nemia' }), 'nemia');
});

/** What a request was sent as: its method and its path. */
type Sent = { method: string; path: string };

/** Every request answered `body` as JSON with `status` for the length of the test; what each was sent as is kept in the list returned. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200): Sent[] {
  const before = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = async (input, init) => {
    sent.push({ method: init?.method ?? 'GET', path: String(input) });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return sent;
}

const LISTED = { name: 'ops', holder: 'agent', agent: 'operator', narrowed: 'read', createdAt: at } as const;

test('the tokens are read by GET /api/tokens, decoded as objects says them', async (t) => {
  const sent = answering(t, { tokens: [LISTED, { name: 'laptop', holder: 'person', createdAt: at }] });
  const list = await tokensQuery.queryFn!({} as never);
  assert.deepEqual(
    list.tokens.map((token) => token.name),
    ['ops', 'laptop'],
  );
  assert.deepEqual(sent, [{ method: 'GET', path: '/api/tokens' }]);
});

test('REFUSED: an agent reading the tokens is refused 403, rejected as the read refusal it is', async (t) => {
  answering(t, { error: 'the person alone lists tokens', reason: 'person-only' }, 403);
  await assert.rejects(
    async () => tokensQuery.queryFn!({} as never),
    (err: unknown) => err instanceof ReadRefusal && err.status === 403,
  );
});

test('a token is retired by DELETE /api/tokens/{name}, and a refusal rejects as a write refused', async (t) => {
  const sent = answering(t, LISTED);
  assert.equal((await retireToken('ops')).name, 'ops');
  assert.deepEqual(sent, [{ method: 'DELETE', path: '/api/tokens/ops' }]);
  answering(t, { error: 'no token is kept under gone', reason: 'missing' }, 404);
  await assert.rejects(retireToken('gone'), (err: unknown) => err instanceof WriteRefusal && err.status === 404);
});
