/**
 * GET /api/quota: what the statusline script last wrote to `$WF_ROOT/quota.json`, read on each request and judged at it — fresh, stale,
 * none, missing, unreadable — and the pure judgement under it (`quotaOf`).
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store as its module loads: set first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-quota-'));
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { QUOTA_MARK_PERCENT, QUOTA_STALE_MS, quotaOf } = await import('../src/quota.ts');
type Quota = import('../src/quota.ts').Quota;

const FILE = path.join(root, 'quota.json');
const NOW = Date.parse('2026-09-19T10:00:00.000Z');
const s = (ms: number) => Math.floor(ms / 1000);
const written = (ago: number, limits: object | null = { five_hour: { used_percentage: 38, resets_at: s(NOW + 2 * 3600e3) }, seven_day: { used_percentage: 86, resets_at: s(NOW + 3 * 86400e3) } }) =>
  JSON.stringify({ written_at: new Date(NOW - ago).toISOString(), claude_code_version: '2.1.278', rate_limits: limits });

const get = async (): Promise<Quota> => {
  const res = await app.request('/api/quota');
  assert.equal(res.status, 200);
  return (await res.json()) as Quota;
};

test('the api reads the file on each request: missing, then fresh, then gone again', async () => {
  fs.rmSync(FILE, { force: true });
  const missing = await get();
  assert.equal(missing.state, 'missing');
  assert.match(missing.said!, /^No quota read yet: nothing has written .*quota\.json\. To show it, add the statusLine block/);

  fs.writeFileSync(FILE, JSON.stringify({ written_at: new Date().toISOString(), claude_code_version: '2.1.278', rate_limits: { five_hour: { used_percentage: 12, resets_at: s(Date.now() + 3600e3) } } }));
  const fresh = await get();
  assert.equal(fresh.state, 'fresh');
  assert.equal(fresh.version, '2.1.278');
  assert.deepEqual(fresh.windows.map((w) => [w.key, w.label, w.usedPercentage]), [['five_hour', '5-hour', 12]]);
  assert.equal(fresh.said, null);

  fs.rmSync(FILE);
  assert.equal((await get()).state, 'missing', 'nothing kept in memory that outlives the file');
});

test('a fresh reading: each window with its reset, the five-hour first, marked past the threshold', () => {
  const q = quotaOf(written(4 * 60e3), NOW, FILE);
  assert.equal(q.state, 'fresh');
  assert.equal(q.ageMs, 4 * 60e3);
  assert.deepEqual(q.windows, [
    { key: 'five_hour', label: '5-hour', usedPercentage: 38, resetsAt: '2026-09-19T12:00:00.000Z', reset: false, marked: false },
    { key: 'seven_day', label: 'week', usedPercentage: 86, resetsAt: '2026-09-22T10:00:00.000Z', reset: false, marked: true },
  ]);
  assert.equal(q.markAt, QUOTA_MARK_PERCENT);
  // The order is the board's, not the file's.
  const reversed = quotaOf(written(0, { seven_day: { used_percentage: 1, resets_at: s(NOW + 1e6) }, spend_limit: { used_percentage: 104, resets_at: s(NOW + 1e6) }, five_hour: { used_percentage: 2, resets_at: s(NOW + 1e3) } }), NOW, FILE);
  assert.deepEqual(reversed.windows.map((w) => w.label), ['5-hour', 'week', 'spend limit']);
});

test('a window whose reset has passed since the reading says so', () => {
  const q = quotaOf(written(3 * 3600e3, { five_hour: { used_percentage: 90, resets_at: s(NOW - 60e3) }, seven_day: { used_percentage: 40, resets_at: s(NOW + 86400e3) } }), NOW, FILE);
  assert.equal(q.state, 'fresh');
  assert.deepEqual(q.windows.map((w) => w.reset), [true, false]);
});

test('a reading older than the bound is stale: its numbers kept for the record, and a sentence to show in their place', () => {
  const edge = quotaOf(written(QUOTA_STALE_MS), NOW, FILE);
  assert.equal(edge.state, 'fresh', 'at the bound itself, still fresh');
  const q = quotaOf(written(QUOTA_STALE_MS + 1), NOW, FILE);
  assert.equal(q.state, 'stale');
  assert.equal(q.windows.length, 2);
  assert.equal(q.said, 'The quota was last read 5 h ago, older than 5 h, so it is not shown: send a message in an interactive claude session signed in to the subscription to read it again.');
  // Yesterday's is stale, whatever it says.
  assert.equal(quotaOf(written(26 * 3600e3), NOW, FILE).state, 'stale');
  assert.match(quotaOf(written(26 * 3600e3), NOW, FILE).said!, /^The quota was last read 26 h ago/);
});

test('a reading with no limits: none, said plainly', () => {
  const q = quotaOf(written(60e3, null), NOW, FILE);
  assert.equal(q.state, 'none');
  assert.deepEqual(q.windows, []);
  assert.match(q.said!, /^No plan limits to show: the last Claude Code session to write the quota, 1 min ago, reported none\. An API-key session has none/);
  assert.equal(quotaOf(written(60e3, { five_hour: null }), NOW, FILE).state, 'none', 'a window with no number is none too');
});

test('a file the script did not write that way is unreadable, and says which', () => {
  assert.match(quotaOf('{', NOW, FILE).said!, /quota\.json is not JSON/);
  assert.equal(quotaOf('{', NOW, FILE).state, 'unreadable');
  assert.match(quotaOf(JSON.stringify({ rate_limits: null }), NOW, FILE).said!, /has no written_at time/);
  assert.match(quotaOf(JSON.stringify({ written_at: new Date(NOW).toISOString(), rate_limits: [1] }), NOW, FILE).said!, /rate_limits that are not an object/);
});
