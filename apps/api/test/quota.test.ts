/**
 * GET /api/quota: the plan's usage asked of Claude Code with its `get_usage` control request — here of the harness's `claude`, which answers
 * as Claude Code 2.1.278 did when recorded (`fixtures/get-usage-*.json`) — kept for a while, one ask at a time, and each way it can fail said
 * in a sentence; and the pure judgement under it (`quotaOf`).
 */
import { answer, askEnded, asks, calls, lastAskEnv, recorded, usageAnswer } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store as its module loads: set first.
process.env.WF_ROOT = scratch('hkb-api-quota-');

const { app } = await import('../src/app.ts');
const {
  askUsage,
  backoffOf,
  forgetQuota,
  QUOTA_BACKOFF_CEILING_MS,
  QUOTA_BACKOFF_MS,
  QUOTA_KEEP_MS,
  QUOTA_LAST_MS,
  QUOTA_MARK_PERCENT,
  quotaOf,
  readQuota,
  usageEnv,
} = await import('../src/quota.ts');
type Quota = import('../src/quota.ts').Quota;
type Held = import('../src/quota.ts').Held;

const NOW = Date.parse('2026-09-19T10:00:00.000Z');
/** A success answer, as Claude Code's control_response carries it, with these `rate_limits`. */
const success = (limits: unknown, available = true) => ({
  subtype: 'success',
  request_id: 'x',
  response: { subscription_type: 'max', rate_limits_available: available, rate_limits: limits },
});
const plan = (five = 38.4, week = 86) =>
  success({
    five_hour: { utilization: five, resets_at: '2026-09-19T12:00:00.048163+00:00' },
    seven_day: { utilization: week, resets_at: '2026-09-22T10:00:00+00:00' },
    seven_day_opus: null,
    nimbus_quill: { utilization: 0, resets_at: null },
  });
const heard = (response: unknown, at = NOW): Held => ({ asked: { kind: 'answer', response }, at });
/** A recorded answer's control_response, as `askUsage` hands it on. */
const fixture = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered') => (JSON.parse(recorded(name)) as { response: unknown }).response;

const get = async (): Promise<Quota> => {
  const res = await app.request('/api/quota');
  assert.equal(res.status, 200);
  return (await res.json()) as Quota;
};

/** Before each test that asks: nothing held, the harness answering as recorded. */
const fresh = () => {
  forgetQuota();
  usageAnswer(recorded('plan'));
};

test("an answer with the plan's windows: the five-hour and the week, in that order, each with its reset, marked past the threshold", () => {
  const q = quotaOf(heard(plan()), null, NOW + 4 * 60e3);
  assert.equal(q.state, 'fresh');
  assert.equal(q.said, null);
  assert.equal(q.subscription, 'max');
  assert.equal(q.ageMs, 4 * 60e3);
  assert.equal(q.askedAt, '2026-09-19T10:00:00.000Z');
  assert.deepEqual(
    q.windows,
    [
      { key: 'five_hour', label: '5-hour', usedPercentage: 38.4, resetsAt: '2026-09-19T12:00:00.048Z', reset: false, marked: false },
      { key: 'seven_day', label: 'week', usedPercentage: 86, resetsAt: '2026-09-22T10:00:00.000Z', reset: false, marked: true },
    ],
    'a null window and a key the board does not know (nimbus_quill) are not shown',
  );
  assert.equal(q.markAt, QUOTA_MARK_PERCENT);
  assert.equal(q.last, null);
  // The order is the board's, not the answer's.
  const reversed = quotaOf(
    heard(
      success({
        seven_day_sonnet: { utilization: 3, resets_at: null },
        seven_day: { utilization: 1, resets_at: null },
        five_hour: { utilization: 2, resets_at: null },
      }),
    ),
    null,
    NOW,
  );
  assert.deepEqual(
    reversed.windows.map((w) => w.label),
    ['5-hour', 'week', 'week, Sonnet'],
  );
});

test("Claude Code 2.1.278's recorded answer reads as the plan it was: max, 3% of five hours and 50% of the week", () => {
  const q = quotaOf(heard(fixture('plan')), null, NOW);
  assert.equal(q.state, 'fresh');
  assert.equal(q.subscription, 'max');
  assert.deepEqual(
    q.windows.map((w) => [w.key, w.usedPercentage, w.resetsAt]),
    [
      ['five_hour', 3, '2026-09-19T15:10:00.048Z'],
      ['seven_day', 50, '2026-09-23T11:00:00.048Z'],
    ],
  );
});

test('a window whose reset has passed since the answer says so', () => {
  const q = quotaOf(heard(plan()), null, NOW + 3 * 3600e3);
  assert.deepEqual(
    q.windows.map((w) => w.reset),
    [true, false],
  );
});

test('REFUSED: no plan — Claude Code signed in with no subscription, as recorded from a CLAUDE_CONFIG_DIR with no sign-in — shows no number', () => {
  const q = quotaOf(heard(fixture('no-plan')), heard(plan(), NOW - 600e3), NOW + 60e3);
  assert.equal(q.state, 'no-plan');
  assert.deepEqual(q.windows, []);
  assert.equal(
    q.said,
    "No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription (an API key, or another provider). Run claude, then /login with the subscription's account, under the api's CLAUDE_CONFIG_DIR. Asked again in 9 min.",
  );
  assert.equal(q.last?.askedAt, '2026-09-19T09:50:00.000Z', 'the last answer with windows is kept for the hover');
});

test('REFUSED: an answer in a shape this code does not read is unknown, and says what it found', () => {
  const unknown = (response: unknown, what: RegExp) => {
    const q = quotaOf(heard(response), null, NOW);
    assert.equal(q.state, 'unknown', JSON.stringify(response));
    assert.deepEqual(q.windows, []);
    assert.ok(q.said!.startsWith('Claude Code answered the usage request in a shape this board does not read: '), q.said!);
    assert.match(q.said!, what);
    assert.match(q.said!, /get_usage is experimental: see README\.md, The quota on the board\./);
  };
  // As 2.1.278 refuses a subtype it does not have: a Claude Code without get_usage.
  unknown(fixture('unsupported'), /it refused the request \(Unsupported control request subtype: get_usage_nope\)/);
  unknown(null, /its response is not an object/);
  unknown({ subtype: 'pending', response: {} }, /neither a success nor an error/);
  unknown({ subtype: 'success', response: { rate_limits: {} } }, /it has no rate_limits_available/);
  unknown(success([1]), /its rate_limits are not an object/);
  unknown(
    success({ five_hour: { utilization: '3', resets_at: null }, seven_day: { utilization: null, resets_at: null } }),
    /none of its rate_limits \(five_hour, seven_day, seven_day_sonnet, seven_day_opus\) has a numeric utilization/,
  );
  unknown(success({ nimbus_quill: { utilization: 0, resets_at: null } }), /has a numeric utilization/);
});

test("Claude Code 2.1.278's answer when Anthropic's usage service gave it nothing — signed in to max, rate_limits null — is unanswered: not unknown, not no-plan", () => {
  const q = quotaOf({ ...heard(fixture('unanswered')), keptMs: QUOTA_BACKOFF_MS }, heard(plan(), NOW - 25 * 60e3), NOW);
  assert.equal(q.state, 'unanswered');
  assert.equal(q.subscription, 'max');
  assert.deepEqual(q.windows, [], 'no number as now');
  assert.equal(
    q.said,
    "Claude Code is signed in to a subscription (max), but Anthropic's usage service gave it nothing this time. The service may be limiting how often it is asked, so the board waits longer before each ask until it answers. Asked again in 20 min.",
  );
  assert.equal(q.againAt, new Date(NOW + QUOTA_BACKOFF_MS).toISOString(), 'when a read asks again: the wait, not the keep');
  assert.equal(q.last?.askedAt, new Date(NOW - 25 * 60e3).toISOString(), 'the last good reading, to show dimmed with its time');
  assert.deepEqual(
    q.last?.windows.map((w) => w.usedPercentage),
    [38.4, 86],
  );
  // Only null is the service's silence: rate_limits that are there and not an object, or missing, are still a shape not read.
  assert.equal(quotaOf(heard(success(null)), null, NOW).state, 'unanswered');
  assert.equal(quotaOf(heard(success([1])), null, NOW).state, 'unknown');
  assert.equal(quotaOf(heard(success(undefined)), null, NOW).state, 'unknown');
  assert.equal(quotaOf(heard(success(null, false)), null, NOW).state, 'no-plan');
  assert.match(quotaOf({ ...heard(success(null)), keptMs: 80 * 60e3 }, null, NOW).said!, /Asked again in 1 h 20 min\.$/);
});

test('the backoff: 20 min, doubled each time in a row, to a ceiling of 4 h — and a first wait of 0 is none', () => {
  assert.equal(QUOTA_KEEP_MS, 10 * 60e3, 'a good reading is kept ten minutes');
  assert.equal(QUOTA_BACKOFF_MS, 20 * 60e3);
  assert.equal(QUOTA_BACKOFF_CEILING_MS, 4 * 3600e3);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 40].map((n) => backoffOf(n) / 60e3),
    [20, 40, 80, 160, 240, 240, 240],
  );
  assert.deepEqual(
    [1, 2, 9].map((n) => backoffOf(n, 0)),
    [0, 0, 0],
  );
  assert.equal(backoffOf(3, 5 * 3600e3), 5 * 3600e3, 'a first wait set past the ceiling is kept as set');
});

test('REFUSED: the last good reading goes after six hours', () => {
  const at = (ago: number) => quotaOf(heard(success(null)), heard(plan(), NOW - ago), NOW).last;
  assert.notEqual(at(QUOTA_LAST_MS), null);
  assert.equal(at(QUOTA_LAST_MS + 1), null);
});

test('REFUSED: a failure after a good answer shows no number as now: the answer is kept as `last`, for the hover, with its time', () => {
  const q = quotaOf({ asked: { kind: 'timeout', ms: 15_000 }, at: NOW }, heard(plan(), NOW - 400e3), NOW);
  assert.equal(q.state, 'timeout');
  assert.deepEqual(q.windows, []);
  assert.equal(q.last?.askedAt, new Date(NOW - 400e3).toISOString());
  assert.deepEqual(
    q.last?.windows.map((w) => w.usedPercentage),
    [38.4, 86],
  );
  assert.equal(
    q.said,
    'Claude Code did not answer the usage request within 15 s: run claude -p in a shell where the api runs to see why. Asked again in 10 min.',
  );
});

test('each way an ask fails, said with what to do, and when it is asked again', () => {
  const at = (asked: Held['asked'], keep = QUOTA_KEEP_MS) => quotaOf({ asked, at: NOW }, null, NOW, keep).said;
  assert.equal(
    at({ kind: 'no-claude' }),
    "The quota cannot be asked for: there is no claude on the api's PATH. Install Claude Code, or start the api from a shell where claude runs. Asked again in 10 min.",
  );
  assert.equal(
    at({ kind: 'failed', code: 3, signal: null, said: 'claude: not logged in' }),
    'Claude Code stopped before it answered the usage request (exit 3: claude: not logged in). Run claude -p in a shell where the api runs to see why. Asked again in 10 min.',
  );
  assert.match(at({ kind: 'failed', code: null, signal: 'SIGKILL', said: '' })!, /\(killed by SIGKILL\)\./);
  assert.match(at({ kind: 'failed', code: null, signal: null, said: 'spawn EACCES' })!, /\(it did not start: spawn EACCES\)\./);
  assert.match(at({ kind: 'no-claude' }, 0)!, /Asked again on the next read\.$/);
  const asking = quotaOf(null, heard(plan()), NOW);
  assert.deepEqual([asking.state, asking.said, asking.askedAt, asking.windows], ['asking', 'Asking Claude Code for the quota…', null, []]);
  assert.equal(asking.last?.windows.length, 2);
});

test("the route asks the harness's claude, and answers with the plan it recorded", async () => {
  fresh();
  const before = asks();
  const q = await get();
  assert.equal(q.state, 'fresh');
  assert.deepEqual(
    q.windows.map((w) => [w.key, w.usedPercentage]),
    [
      ['five_hour', 3],
      ['seven_day', 50],
    ],
  );
  assert.equal(asks(), before + 1);
});

test('REFUSED: a second read inside the keep asks nothing; one past it asks again', async () => {
  fresh();
  let clock = Date.now();
  const now = () => clock;
  const before = asks();
  assert.equal((await readQuota({ now })).state, 'fresh');
  clock += QUOTA_KEEP_MS - 1;
  const kept = await readQuota({ now });
  assert.equal(kept.state, 'fresh');
  assert.equal(kept.ageMs, QUOTA_KEEP_MS - 1);
  assert.equal(asks(), before + 1, 'held for the keep');
  // A failure is held as long.
  usageAnswer('', 'exit');
  clock += 1;
  assert.equal((await readQuota({ now })).state, 'failed');
  clock += 60_000;
  assert.equal((await readQuota({ now })).state, 'failed');
  assert.equal(asks(), before + 2);
});

test('REFUSED: after an unanswered answer no read asks inside the wait, however many boards read; the waits grow, and a good reading begins them again', async () => {
  fresh();
  let clock = Date.now();
  const now = () => clock;
  const before = asks();
  const many = async () => (await Promise.all(Array.from({ length: 12 }, () => readQuota({ now })))).map((q) => q.state);
  /** Read at `offset` past the last ask, by twelve boards at once: every one of them says `state`, and the asks so far are `asked`. */
  const readsAt = async (offset: number, state: string, asked: number, why: string) => {
    const from = clock;
    clock = from + offset;
    assert.deepEqual(await many(), Array(12).fill(state), why);
    assert.equal(asks(), before + asked, why);
    clock = from;
  };
  usageAnswer(recorded('unanswered'));
  const first = await readQuota({ now });
  assert.equal(first.state, 'unanswered');
  assert.match(first.said!, /Asked again in 20 min\.$/);
  assert.equal(asks(), before + 1);
  await readsAt(QUOTA_KEEP_MS, 'unanswered', 1, 'past the keep of a good reading, and still inside the wait: nothing asked');
  await readsAt(QUOTA_BACKOFF_MS - 1, 'unanswered', 1, 'a millisecond short of twenty minutes: nothing asked');
  clock += QUOTA_BACKOFF_MS;
  const second = await readQuota({ now });
  assert.equal(asks(), before + 2, 'the wait over: one ask');
  assert.match(second.said!, /Asked again in 40 min\.$/);
  await readsAt(40 * 60e3 - 1, 'unanswered', 2, 'the second wait is forty minutes');
  clock += 40 * 60e3;
  assert.match((await readQuota({ now })).said!, /Asked again in 1 h 20 min\.$/);
  assert.equal(asks(), before + 3);
  // A failure in between is kept the keep, and neither ends the row nor adds to it.
  usageAnswer('', 'exit');
  clock += 80 * 60e3;
  assert.equal((await readQuota({ now })).state, 'failed');
  usageAnswer(recorded('unanswered'));
  clock += QUOTA_KEEP_MS;
  assert.match((await readQuota({ now })).said!, /Asked again in 2 h 40 min\.$/);
  assert.equal(asks(), before + 5);
  // The first good reading begins the waits again, and is kept the keep.
  usageAnswer(recorded('plan'));
  clock += 160 * 60e3;
  const good = await readQuota({ now });
  assert.equal(good.state, 'fresh');
  assert.equal(good.againAt, new Date(clock + QUOTA_KEEP_MS).toISOString());
  assert.equal(asks(), before + 6);
  await readsAt(QUOTA_KEEP_MS - 1, 'fresh', 6, 'a good reading is kept ten minutes');
  usageAnswer(recorded('unanswered'));
  clock += QUOTA_KEEP_MS;
  const again = await readQuota({ now });
  assert.equal(again.state, 'unanswered');
  assert.match(again.said!, /Asked again in 20 min\.$/, 'the row begun again: twenty minutes, not five hours and twenty');
  assert.equal(again.last?.windows.length, 2, 'with the good reading beside it');
  assert.equal(asks(), before + 7);
  usageAnswer(recorded('plan'));
});

test('HKB_QUOTA_BACKOFF_MS sets the first wait — 0 asks on every read — and a value that is no length of time is the default', async () => {
  fresh();
  usageAnswer(recorded('unanswered'));
  const before = asks();
  const env = { ...process.env, HKB_QUOTA_BACKOFF_MS: '0' };
  assert.equal((await readQuota({ env })).said?.endsWith('Asked again on the next read.'), true);
  await readQuota({ env });
  assert.equal(asks(), before + 2);
  for (const bad of ['-5', 'soon', '']) {
    forgetQuota();
    assert.match((await readQuota({ env: { ...process.env, HKB_QUOTA_BACKOFF_MS: bad } })).said!, /Asked again in 20 min\.$/, bad);
  }
  usageAnswer(recorded('plan'));
});

test('REFUSED: reads that come while an ask is in flight join it: one claude for all of them', async () => {
  fresh();
  const before = asks();
  const all = await Promise.all([readQuota(), readQuota(), get(), readQuota()]);
  assert.deepEqual(
    all.map((q) => q.state),
    ['fresh', 'fresh', 'fresh', 'fresh'],
  );
  assert.equal(asks(), before + 1);
});

test('HKB_QUOTA_KEEP_MS sets the keep — 0 asks on every read — and a value that is no length of time is the default', async () => {
  fresh();
  const before = asks();
  const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0' };
  assert.equal((await readQuota({ env })).keepMs, 0);
  await readQuota({ env });
  assert.equal(asks(), before + 2);
  for (const bad of ['-5', 'soon', '']) {
    forgetQuota();
    assert.equal((await readQuota({ env: { ...process.env, HKB_QUOTA_KEEP_MS: bad } })).keepMs, QUOTA_KEEP_MS, bad);
  }
});

test('REFUSED: an answer to another request — or a line that is not one — is not taken for this one', async () => {
  fresh();
  const theirs = `${JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: 'not-yours', error: 'wrong one' } })}\n`;
  usageAnswer(`not json\n{"type":"system","subtype":"init"}\n${theirs}${recorded('plan')}`);
  const asked = await askUsage();
  assert.equal(asked.kind, 'answer');
  assert.equal((asked as { response: { subtype: string } }).response.subtype, 'success');
});

test('REFUSED: the ask runs without what a Claude Code session hands its children, but with how it signs in, in the temporary directory', async () => {
  fresh();
  const session = { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_PID: '1', CLAUDE_CODE_SESSION_ID: 's', AI_AGENT: 'claude-code' };
  const signIn = { CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-test', CLAUDE_CODE_USE_BEDROCK: '1' };
  const env = { ...process.env, ...session, ...signIn };
  const kept = usageEnv(env);
  for (const key of Object.keys(session)) assert.equal(kept[key], undefined, key);
  for (const [key, value] of Object.entries(signIn)) assert.equal(kept[key], value, key);
  await askUsage({ env });
  const ran = lastAskEnv();
  assert.equal(ran.CLAUDECODE, 'unset');
  assert.equal(ran.CLAUDE_CODE_ENTRYPOINT, 'unset');
  assert.equal(ran.CLAUDE_CONFIG_DIR, process.env.CLAUDE_CONFIG_DIR);
  assert.equal(ran.CLAUDE_CODE_OAUTH_TOKEN, 'sk-ant-oat-test');
  assert.equal(ran.CLAUDE_CODE_USE_BEDROCK, '1');
  assert.equal(ran.cwd, fs.realpathSync(os.tmpdir())); // not a root: where askUsage runs its claude
  // Started without the user's settings — their plugins, hooks and skills' sync — without MCP servers, and writing no session.
  const started = fs
    .readFileSync(calls, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('-p '))
    .pop();
  assert.equal(
    started,
    '-p --input-format stream-json --output-format stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources ',
  );
});

test('an answered ask closes its stdin, and the process ends of its own', async () => {
  fresh();
  assert.equal((await askUsage()).kind, 'answer');
  // This ask's own process, by the pid it wrote as it started: every ask before it has answered, so its line is the last.
  const pid = Number(lastAskEnv().pid);
  for (let i = 0; i < 50 && !askEnded(pid); i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(askEnded(pid), `the ask's claude (pid ${pid}) ended of its own once its stdin was closed`);
});

test('REFUSED: no claude on PATH is no-claude', async () => {
  fresh();
  const env = { ...process.env, PATH: path.join(scratch('hkb-api-nowhere-'), 'no-such-dir') };
  assert.deepEqual(await askUsage({ env }), { kind: 'no-claude' });
  assert.equal((await readQuota({ env })).state, 'no-claude');
});

test('REFUSED: a claude that ends before it answers is failed, with its exit code and the last line it wrote on stderr', async () => {
  fresh();
  usageAnswer('', 'exit');
  assert.deepEqual(await askUsage(), { kind: 'failed', code: 3, signal: null, said: 'claude: the harness was told to fail' });
});

test('REFUSED: a claude that never answers is ended at the timeout, and a read that waits past its wait says asking, then timeout', async () => {
  fresh();
  usageAnswer(fs.readFileSync(answer, 'utf8'), 'silent');
  const q = await readQuota({ waitMs: 50, timeoutMs: 400 });
  assert.equal(q.state, 'asking');
  assert.equal(q.said, 'Asking Claude Code for the quota…');
  await new Promise((r) => setTimeout(r, 600));
  const after = await readQuota({ waitMs: 50, timeoutMs: 400 });
  assert.equal(after.state, 'timeout');
  assert.match(after.said!, /^Claude Code did not answer the usage request within 1 s:/);
  const pid = Number(lastAskEnv().pid);
  await new Promise((r) => setTimeout(r, 100));
  assert.throws(
    () => process.kill(pid, 0),
    (e: NodeJS.ErrnoException) => e.code === 'ESRCH',
    'the silent claude is gone',
  );
  usageAnswer(recorded('plan'));
});
