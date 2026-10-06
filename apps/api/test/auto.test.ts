/**
 * An agent's rules for auto on the api, through the entries of the package's command table: `GET /api/auto/:name` reads the default in
 * force while nothing is confirmed, beside what the agent proposed and its words kept as guidance; `PUT /api/auto/:name/rules/:id`
 * confirms a proposed rule, keeping the default beside it, and refuses one not proposed (404), one in force already (409), a body but
 * `{}` (400) and a request from another site (403), each writing nothing; `DELETE` drops a rule; a name that is no agent's is a 400.
 *
 * At shipped defaults, over the harness's scratch store (`root`).
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

fs.mkdirSync(path.dirname(PROPOSED), { recursive: true });
fs.writeFileSync(
  PROPOSED,
  JSON.stringify({
    at: '2026-10-06T12:00:00.000Z',
    rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked', 'withinBudget'] }],
    guidance: ['answer in French'],
    digest: null,
  }),
);

test('the default is in force while nothing is confirmed, read beside what the agent proposed and the words it keeps as guidance', async () => {
  const read = await asked('GET', '/api/auto/nemia');
  assert.equal(read.status, 200);
  assert.equal(read.body.isDefault, true);
  assert.deepEqual(
    (read.body.rules as { id: string; words: string }[]).map((r) => [r.id, r.words]),
    [
      [
        'default',
        'Approve any step unasked when the agent recommends it, its check passed, every reviewer accepted, no step is past its budget and nothing is left open.',
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
});

test('REFUSED, writing nothing: a rule not proposed, a body but {}, a request from another site, and a name that is no agent', async () => {
  const ghost = await asked('PUT', '/api/auto/nemia/rules/ghost', {});
  assert.equal(ghost.status, 404);
  assert.match(String(ghost.body.error), /^nemia proposed no rule ghost/);
  assert.equal((await asked('PUT', '/api/auto/nemia/rules/tries', { why: 'go' })).status, 400);
  const foreign = await asked('PUT', '/api/auto/nemia/rules/tries', {}, { ...BOARD, 'sec-fetch-site': 'cross-site' });
  assert.equal(foreign.status, 403);
  assert.equal(fs.existsSync(CONFIRMED), false);
  const hidden = await asked('GET', '/api/auto/.nemia');
  assert.equal(hidden.status, 400);
  assert.match(String(hidden.body.error), /is not an agent's name/);
});

test('a confirm puts the rule in force beside the default; again is a 409; a drop takes the default out', async () => {
  const confirmed = await asked('PUT', '/api/auto/nemia/rules/tries', {});
  assert.equal(confirmed.status, 200);
  assert.deepEqual(
    (confirmed.body.rules as { id: string; from: string }[]).map((r) => [r.id, r.from]),
    [
      ['default', 'default'],
      ['tries', 'proposed'],
    ],
  );
  const twice = await asked('PUT', '/api/auto/nemia/rules/tries');
  assert.equal(twice.status, 409);
  const dropped = await asked('DELETE', '/api/auto/nemia/rules/default');
  assert.equal(dropped.status, 200);
  assert.deepEqual(
    (dropped.body.rules as { id: string }[]).map((r) => r.id),
    ['tries'],
  );
  assert.equal(dropped.body.isDefault, false);
});
