/**
 * An agent's rules for auto on the api, the nemia group of `objects`' Api calling the entries of the package's command table by type:
 * `GET /api/policy/:name` reads the default in force while nothing is confirmed, beside what the agent proposed and its words kept as
 * guidance; `PUT /api/policy/:name/rules/:id` confirms a proposed rule as the person read it, keeping the default beside it, and refuses
 * one not proposed (404), one that reads otherwise since (409), one in force already (409), a body with no words (400, naming
 * `payload.words`) or blank words (422), and a request from another site (403), each writing nothing; `DELETE` drops a rule; a name
 * that is no agent's is the package's 422; the former spelling `/api/auto/…` is no route (404).
 *
 * At shipped defaults, over the harness's scratch store (`root`).
 */
import { PERSON_TOKEN, root } from './harness.ts';
import { test } from 'node:test';
import { story } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TOKEN_COOKIE } from 'objects';
import { appOf, liveOf } from '../src/app.ts';

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
const app = appOf(liveOf()).app;

/** The person's list for nemia, and what she proposed. */
const CONFIRMED = path.join(root, 'auto', 'nemia.json');
const PROPOSED = path.join(root, 'auto', 'nemia.proposed.json');

/** The api's answer to `method` on `url` with `body`, as the board sends it, or with `headers`. */
async function asked(method: string, url: string, body?: unknown, headers: Record<string, string> = BOARD) {
  const res = await app.request(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** What nemia proposes: `tries`, as `rule` gives it. */
function propose(rule: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(PROPOSED), { recursive: true });
  fs.writeFileSync(
    PROPOSED,
    JSON.stringify({ at: '2026-10-06T12:00:00.000Z', rules: [{ id: 'tries', ...rule }], guidance: ['answer in French'], digest: null }),
  );
}

/** `tries`, as the person reads it on the board. */
const TRIES = { answer: 'retry', steps: ['implement'], when: ['checked', 'withinBudget'] };
const WORDS = 'Try implement again on its own once its check passed and it stayed within budget.';

propose(TRIES);

test('A person keeps her rules: the default in force, a proposed rule refused but as proposed, a confirm put in force once, and a drop that takes the default out', async (t) => {
  const s = story(t);
  await s.test(
    'the default is in force while nothing is confirmed, read beside what the agent proposed and the words it keeps as guidance',
    async () => {
      const read = await asked('GET', '/api/policy/nemia');
      assert.equal(read.status, 200);
      assert.equal(read.body.isDefault, true);
      assert.deepEqual(
        (read.body.rules as { id: string; words: string }[]).map((r) => [r.id, r.words]),
        [
          [
            'default',
            'Approve any step on its own once its agent recommends it, its check passed, its review passed, it stayed within budget and nothing waits on you.',
          ],
        ],
      );
      const proposed = read.body.proposed as { rules: { id: string; confirmed: boolean }[]; guidance: string[] };
      assert.deepEqual(
        proposed.rules.map((r) => [r.id, r.confirmed]),
        [['tries', false]],
      );
      assert.deepEqual(proposed.guidance, ['answer in French']);
      assert.equal(read.body.instruction, null);
    },
  );
  await s.test(
    'REFUSED, writing nothing: a rule not proposed, a body with no words or blank ones, a request from another site, and a name that is no agent',
    async () => {
      const ghost = await asked('PUT', '/api/policy/nemia/rules/ghost', { words: WORDS });
      assert.equal(ghost.status, 404);
      assert.match(String(ghost.body.error), /^nemia proposed no rule ghost/);
      const wordless = await asked('PUT', '/api/policy/nemia/rules/tries', {});
      assert.equal(wordless.status, 400);
      assert.equal(wordless.body.field, 'payload.words');
      const blank = await asked('PUT', '/api/policy/nemia/rules/tries', { words: '  ' });
      assert.equal(blank.status, 422);
      assert.match(String(blank.body.error), /takes the rule's words as you read them/);
      const foreign = await asked(
        'PUT',
        '/api/policy/nemia/rules/tries',
        { words: WORDS },
        { ...BOARD, 'sec-fetch-site': 'cross-site', cookie: `${TOKEN_COOKIE}=${PERSON_TOKEN}` },
      );
      assert.equal(foreign.status, 403, "a page on another site, the browser sending it the board's cookie");
      assert.equal(foreign.body.reason, 'site');
      assert.equal(fs.existsSync(CONFIRMED), false);
      const hidden = await asked('GET', '/api/policy/.nemia');
      assert.equal(hidden.status, 422);
      assert.match(String(hidden.body.error), /is not an agent's name/);
    },
  );
  await s.test(
    'REFUSED (409), writing nothing: a confirm of the words the person read, once the agent proposed the rule otherwise',
    async () => {
      propose({ answer: 'approve', when: [] });
      try {
        const stale = await asked('PUT', '/api/policy/nemia/rules/tries', { words: WORDS });
        assert.equal(stale.status, 409);
        assert.match(String(stale.body.error), /^nemia's rule tries now reads "Approve any step on its own, whatever its state\."/);
        assert.equal(fs.existsSync(CONFIRMED), false);
      } finally {
        propose(TRIES);
      }
    },
  );
  await s.test('a confirm puts the rule in force beside the default; again is a 409; a drop takes the default out', async () => {
    const confirmed = await asked('PUT', '/api/policy/nemia/rules/tries', { words: WORDS });
    assert.equal(confirmed.status, 200);
    assert.deepEqual(
      (confirmed.body.rules as { id: string; from: string }[]).map((r) => [r.id, r.from]),
      [
        ['default', 'default'],
        ['tries', 'proposed'],
      ],
    );
    const twice = await asked('PUT', '/api/policy/nemia/rules/tries', { words: WORDS });
    assert.equal(twice.status, 409);
    const dropped = await asked('DELETE', '/api/policy/nemia/rules/default');
    assert.equal(dropped.status, 200);
    assert.deepEqual(
      (dropped.body.rules as { id: string }[]).map((r) => r.id),
      ['tries'],
    );
    assert.equal(dropped.body.isDefault, false);
  });
  await s.test(
    "the routes' former spelling, /api/auto/…, is no route: the api's 404, naming where the paths it serves are listed",
    async () => {
      const res = await asked('PUT', '/api/auto/nemia/rules/tries?x=1', { words: WORDS });
      assert.equal(res.status, 404);
      assert.match(String(res.body.error), /is no route of this api/);
    },
  );
});
