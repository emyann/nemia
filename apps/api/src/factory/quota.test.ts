/**
 * GET /api/quota: the plan's usage as the engine's `quota` answers it — here through the harness's `claude`, which answers as Claude Code
 * 2.1.278 did when recorded (`fixtures/get-usage-*.json`) — kept for a while, one ask at a time, and each way it can fail said in a
 * sentence; the pure judgement under it (`quotaOf`); and that the read starts no process of its own.
 */
import { asks, recorded, usageAnswer } from '../../test/harness.ts';
import { story } from '../../test/checkpoints.ts';
import { until, WAITED } from '../../test/waits.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Layer } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { HarnessQuota } from 'agent-orchestrator';
import { appOf, liveOf } from '../app.ts';
import {
  backoffOf,
  QUOTA_BACKOFF_CEILING_MS,
  QUOTA_BACKOFF_MS,
  QUOTA_KEEP_MS,
  QUOTA_LAST_MS,
  QUOTA_MARK_PERCENT,
  QUOTA_WAIT_MS,
  quotaOf,
  makeQuota,
  QuotaAsker,
  daemonQuota,
  harnessQuotaOf,
  QUOTA_DAEMON_WAIT_MS,
} from './quota.ts';

type Quota = import('./quota.ts').Quota;
type Held = import('./quota.ts').Held;
type ReadQuota = import('./quota.ts').ReadQuota;

/** An app over the live services but its quota asker, `read`: the one the test asks directly too. */
const appAsking = (read: ReadQuota) => appOf(Layer.merge(liveOf(), QuotaAsker.layer(read))).app;
let readQuota = makeQuota();
let app = appAsking(readQuota);
/** A quota asker with nothing held, as a process that has just started has, and an app that asks through it. */
const forgetQuota = () => {
  readQuota = makeQuota();
  app = appAsking(readQuota);
};

const NOW = Date.parse('2026-09-19T10:00:00.000Z');
/** The plan's limits as the engine answers them, in Claude Code's order: a key the board does not know among them. */
const plan = (five = 38.4, week = 86): HarnessQuota => ({
  kind: 'windows',
  limits: [
    { key: 'five_hour', usedPercentage: five, resetsAt: '2026-09-19T12:00:00.048Z' },
    { key: 'seven_day', usedPercentage: week, resetsAt: '2026-09-22T10:00:00.000Z' },
    { key: 'nimbus_quill', usedPercentage: 0, resetsAt: null },
  ],
  subscription: 'max',
});
const UNANSWERED: HarnessQuota = { kind: 'unanswered', subscription: 'max' };
const heard = (asked: HarnessQuota, at = NOW): Held => ({ asked, at });

/** What the fake ask answers next, and how many times it has been asked. */
const fake = { next: plan(), asked: 0 };
/** A read through the fake ask, with `opts` beside it. */
const read = (opts: Omit<Parameters<ReadQuota>[0], 'ask'> = {}): Promise<Quota> =>
  readQuota({
    ...opts,
    ask: async () => {
      fake.asked += 1;
      return fake.next;
    },
  });

const get = async (): Promise<Quota> => {
  const res = await app.request('/api/quota');
  assert.equal(res.status, 200);
  return (await res.json()) as Quota;
};

/** Before each test that asks: nothing held, the fake ask and the harness answering the plan. */
const fresh = () => {
  forgetQuota();
  fake.next = plan();
  usageAnswer(recorded('plan'));
};

/**
 * Asks the test answers by hand, each in its turn: how many began, how many were out at once at most, the answer of each, and `begun(n)`,
 * which waits until the `n`th has begun — a few turns of the loop after the one before it ends — and throws if it has not after a hundred.
 */
const handAsks = () => {
  const answers: ((q: HarnessQuota) => void)[] = [];
  const counts = { began: 0, out: 0, most: 0 };
  const ask = () =>
    new Promise<HarnessQuota>((resolve) => {
      counts.began += 1;
      counts.out += 1;
      counts.most = Math.max(counts.most, counts.out);
      answers.push((q) => {
        counts.out -= 1;
        resolve(q);
      });
    });
  const begun = async (n: number) => {
    for (let turn = 0; answers.length < n; turn += 1) {
      if (turn === 100) throw new Error(`ask ${n} never began: ${answers.length} began`);
      await new Promise((r) => setImmediate(r));
    }
  };
  return { ask, answers, counts, begun };
};

test('quotaOf and harnessQuotaOf: what the board and the daemon are shown of each answer an ask came to', async (t) => {
  await t.test(
    "an answer with the plan's windows: the five-hour and the week, in that order, each with its reset, marked past the threshold",
    () => {
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
        'a key the board does not know (nimbus_quill) is not shown',
      );
      assert.equal(q.markAt, QUOTA_MARK_PERCENT);
      assert.equal(q.last, null);
      const reversed = quotaOf(
        heard({
          kind: 'windows',
          limits: [
            { key: 'seven_day_sonnet', usedPercentage: 3, resetsAt: null },
            { key: 'seven_day', usedPercentage: 1, resetsAt: null },
            { key: 'five_hour', usedPercentage: 2, resetsAt: null },
          ],
          subscription: null,
        }),
        null,
        NOW,
      );
      assert.deepEqual(
        reversed.windows.map((w) => w.label),
        ['5-hour', 'week', 'week, Sonnet'],
        "the order is the board's, not the answer's",
      );
    },
  );
  await t.test('a window whose reset has passed since the answer says so', () => {
    const q = quotaOf(heard(plan()), null, NOW + 3 * 3600e3);
    assert.deepEqual(
      q.windows.map((w) => w.reset),
      [true, false],
    );
  });
  await t.test('REFUSED: no plan — Claude Code signed in with no subscription — shows no number', () => {
    const q = quotaOf(heard({ kind: 'no-plan' }), heard(plan(), NOW - 600e3), NOW + 60e3);
    assert.equal(q.state, 'no-plan');
    assert.deepEqual(q.windows, []);
    assert.equal(
      q.said,
      "No plan limits to show: the Claude Code the api runs is not signed in to a Claude subscription (an API key, or another provider). Run claude, then /login with the subscription's account, under the api's CLAUDE_CONFIG_DIR. Asked again in 9 min.",
    );
    assert.equal(q.last?.askedAt, '2026-09-19T09:50:00.000Z', 'the last answer with windows is kept for the hover');
  });
  await t.test(
    'REFUSED: an answer in a shape this code does not read is unknown, and says what it found; so are limits none of which the board shows',
    () => {
      const unknown = (asked: HarnessQuota, what: RegExp) => {
        const q = quotaOf(heard(asked), null, NOW);
        assert.equal(q.state, 'unknown', JSON.stringify(asked));
        assert.deepEqual(q.windows, []);
        assert.ok(q.said!.startsWith('Claude Code answered the usage request in a shape this board does not read: '), q.said!);
        assert.match(q.said!, what);
        assert.match(q.said!, /get_usage is experimental: see README\.md, The quota on the board\./);
      };
      unknown(
        { kind: 'unknown', what: 'it refused the request (Unsupported control request subtype: get_usage_nope)' },
        /it refused the request \(Unsupported control request subtype: get_usage_nope\)/,
      );
      unknown(
        { kind: 'windows', limits: [], subscription: 'max' },
        /none of its rate_limits \(five_hour, seven_day, seven_day_sonnet, seven_day_opus\) has a numeric utilization/,
      );
      unknown(
        { kind: 'windows', limits: [{ key: 'nimbus_quill', usedPercentage: 0, resetsAt: null }], subscription: 'max' },
        /has a numeric utilization/,
      );
    },
  );
  await t.test(
    "an answer in which Anthropic's usage service gave Claude Code nothing — signed in to max — is unanswered: not unknown, not no-plan",
    () => {
      const q = quotaOf({ ...heard(UNANSWERED), keptMs: QUOTA_BACKOFF_MS }, heard(plan(), NOW - 25 * 60e3), NOW);
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
      assert.match(
        quotaOf(heard({ kind: 'unanswered', subscription: null }), null, NOW).said!,
        /^Claude Code is signed in to a subscription, but/,
      );
      assert.match(quotaOf({ ...heard(UNANSWERED), keptMs: 80 * 60e3 }, null, NOW).said!, /Asked again in 1 h 20 min\.$/);
    },
  );
  await t.test('REFUSED: the last good reading goes after six hours', () => {
    const at = (ago: number) => quotaOf(heard(UNANSWERED), heard(plan(), NOW - ago), NOW).last;
    assert.notEqual(at(QUOTA_LAST_MS), null);
    assert.equal(at(QUOTA_LAST_MS + 1), null);
  });
  await t.test(
    'REFUSED: a failure after a good answer shows no number as now: the answer is kept as `last`, for the hover, with its time',
    () => {
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
    },
  );
  await t.test('each way an ask fails, said with what to do, and when it is asked again', () => {
    const at = (asked: Held['asked'], keep = QUOTA_KEEP_MS) => quotaOf({ asked, at: NOW }, null, NOW, keep).said;
    assert.equal(
      at({ kind: 'missing' }),
      "The quota cannot be asked for: there is no claude on the api's PATH. Install Claude Code, or start the api from a shell where claude runs. Asked again in 10 min.",
    );
    assert.equal(quotaOf({ asked: { kind: 'missing' }, at: NOW }, null, NOW).state, 'no-claude');
    assert.equal(
      at({ kind: 'failed', code: 3, signal: null, said: 'claude: not logged in' }),
      'Claude Code stopped before it answered the usage request (exit 3: claude: not logged in). Run claude -p in a shell where the api runs to see why. Asked again in 10 min.',
    );
    assert.match(at({ kind: 'failed', code: null, signal: 'SIGKILL', said: '' })!, /\(killed by SIGKILL\)\./);
    assert.match(at({ kind: 'failed', code: null, signal: null, said: 'spawn EACCES' })!, /\(it did not start: spawn EACCES\)\./);
    assert.match(at({ kind: 'missing' }, 0)!, /Asked again on the next read\.$/);
    const asking = quotaOf(null, heard(plan()), NOW);
    assert.deepEqual(
      [asking.state, asking.said, asking.askedAt, asking.windows],
      ['asking', 'Asking Claude Code for the quota…', null, []],
    );
    assert.equal(asking.last?.windows.length, 2);
  });
  await t.test("the daemon's answer is the board's: a fresh quota's windows the board shows, and no windows for any other state", () => {
    assert.deepEqual(harnessQuotaOf(quotaOf(heard(plan()), null, NOW)), {
      kind: 'windows',
      limits: [
        { key: 'five_hour', usedPercentage: 38.4, resetsAt: '2026-09-19T12:00:00.048Z' },
        { key: 'seven_day', usedPercentage: 86, resetsAt: '2026-09-22T10:00:00.000Z' },
      ],
      subscription: 'max',
    });
    for (const q of [quotaOf(null, null, NOW), quotaOf(heard(UNANSWERED), null, NOW), quotaOf(heard({ kind: 'no-plan' }), null, NOW)])
      assert.notEqual(harnessQuotaOf(q).kind, 'windows', `REFUSED: ${q.state} gives no windows`);
    assert.ok(QUOTA_DAEMON_WAIT_MS > 15_000, "the daemon waits past the runtime's own 15 s limit on get_usage");
  });
});

test('the keep, the backoff and the wait: their shipped lengths, and the HKB_QUOTA_* knobs that set them', async (t) => {
  await t.test('the backoff: 20 min, doubled each time in a row, to a ceiling of 4 h — and a first wait of 0 is none', () => {
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
  await t.test(
    'HKB_QUOTA_BACKOFF_MS sets the first wait — 0 asks on every read — and a value that is no length of time is the default',
    async () => {
      fresh();
      fake.next = UNANSWERED;
      const before = fake.asked;
      const env = { ...process.env, HKB_QUOTA_BACKOFF_MS: '0' };
      const now = () => NOW;
      assert.equal((await read({ env, now })).said?.endsWith('Asked again on the next read.'), true);
      await read({ env, now });
      assert.equal(fake.asked, before + 2, 'asked again at the same instant');
      for (const bad of ['-5', 'soon', '']) {
        forgetQuota();
        assert.match((await read({ env: { ...process.env, HKB_QUOTA_BACKOFF_MS: bad }, now })).said!, /Asked again in 20 min\.$/, bad);
      }
    },
  );
  await t.test(
    'HKB_QUOTA_KEEP_MS sets the keep — 0 asks on every read — and a value that is no length of time is the default',
    async () => {
      fresh();
      const before = fake.asked;
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0' };
      const now = () => NOW;
      assert.equal((await read({ env, now })).keepMs, 0);
      await read({ env, now });
      assert.equal(fake.asked, before + 2, 'asked again at the same instant');
      for (const bad of ['-5', 'soon', '']) {
        forgetQuota();
        assert.equal((await read({ env: { ...process.env, HKB_QUOTA_KEEP_MS: bad }, now })).keepMs, QUOTA_KEEP_MS, bad);
      }
    },
  );
  await t.test(
    'HKB_QUOTA_WAIT_MS sets how long a read waits for its ask: at a keep of 0, a read outlasts an ask slower than the 2 s default',
    async (t) => {
      fresh();
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0', HKB_QUOTA_WAIT_MS: '30000' };
      const { ask, answers, begun } = handAsks();
      const slow = readQuota({ ask, env });
      await begun(1);
      t.mock.timers.tick(QUOTA_WAIT_MS);
      answers[0](plan());
      assert.equal((await slow).state, 'fresh', 'the read is answered by its own ask, slower than the default wait');
      const bad = readQuota({ ask, env: { ...env, HKB_QUOTA_WAIT_MS: 'soon' } });
      await begun(2);
      t.mock.timers.tick(QUOTA_WAIT_MS);
      assert.equal((await bad).state, 'asking', 'a wait that is no length of time is the default');
      answers[1](plan());
    },
  );
});

test('The board polls the quota: one ask through the harness, kept, asked again past the keep, held when it fails, backed off after an unanswered, shared with the daemon', async (t) => {
  const s = story(t);
  await s.test(
    "the route asks the engine's claude harness, and answers with the plan it recorded; a claude that fails is said so",
    async () => {
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
      assert.equal(asks(), before + 1, 'the engine asked the harness once');
      forgetQuota();
      usageAnswer('', 'exit');
      try {
        assert.match(
          (await get()).said!,
          /^Claude Code stopped before it answered the usage request \(exit 3: claude: the harness was told to fail\)\./,
        );
      } finally {
        usageAnswer(recorded('plan'));
      }
    },
  );
  await s.test('REFUSED: an ask that rejects is held as failed, with its words, and asked again only past the keep', async () => {
    fresh();
    let clock = NOW;
    const now = () => clock;
    const mono = () => clock - NOW;
    let rejected = 0;
    const ask = async (): Promise<HarnessQuota> => {
      rejected += 1;
      throw Object.assign(new Error('quota: the `claude` harness reports no quota.'), { exitCode: 2 });
    };
    const q = await readQuota({ ask, now, mono });
    assert.equal(q.state, 'failed');
    assert.equal(
      q.said,
      "The api's engine would not ask Claude Code for the quota (quota: the `claude` harness reports no quota.): this is the engine " +
        'refusing, not Claude Code failing, so running claude will not show why. Restart the api; if the board says it again, the engine ' +
        'the api runs has no claude harness that answers a quota: see README.md, The quota on the board. Asked again in 10 min.',
    );
    clock += QUOTA_KEEP_MS - 1;
    assert.equal((await readQuota({ ask, now, mono })).state, 'failed');
    assert.equal(rejected, 1, 'held for the keep, as any failure');
    clock += 1;
    const again = await readQuota({ ask, now, mono });
    assert.equal(again.state, 'failed');
    assert.equal(rejected, 2, 'past the keep, a rejected ask is asked again');
  });
  await s.test('REFUSED: a second read inside the keep asks nothing; one past it asks again', async () => {
    fresh();
    const base = Date.now();
    let clock = base;
    const now = () => clock;
    const mono = () => clock - base;
    const before = fake.asked;
    assert.equal((await read({ now, mono })).state, 'fresh');
    clock += QUOTA_KEEP_MS - 1;
    const kept = await read({ now, mono });
    assert.equal(kept.state, 'fresh');
    assert.equal(kept.ageMs, QUOTA_KEEP_MS - 1);
    assert.equal(fake.asked, before + 1, 'held for the keep');
    fake.next = { kind: 'failed', code: 3, signal: null, said: '' };
    clock += 1;
    assert.equal((await read({ now, mono })).state, 'failed');
    clock += 60_000;
    assert.equal((await read({ now, mono })).state, 'failed');
    assert.equal(fake.asked, before + 2, 'a failure is held as long');
  });
  await s.test(
    'REFUSED: a board and the daemon reading within the keep ask once; after an unanswered, neither asks inside its wait',
    async () => {
      fresh();
      const base = Date.now();
      let clock = base;
      const now = () => clock;
      const mono = () => clock - base;
      const before = fake.asked;
      const counting = async () => {
        fake.asked += 1;
        return fake.next;
      };
      const daemon = daemonQuota((opts) => readQuota({ ...opts, now, mono }), 'board', counting);
      assert.equal((await read({ now, mono, harness: 'board' })).state, 'fresh', 'a board reads');
      clock += QUOTA_KEEP_MS - 1;
      assert.equal((await daemon()).kind, 'windows', 'the daemon reads what the board asked for');
      assert.equal(fake.asked, before + 1, 'one ask for both');
      fake.next = UNANSWERED;
      clock += 1;
      assert.notEqual((await daemon()).kind, 'windows', 'past the keep the daemon asks, and is told nothing');
      clock += QUOTA_BACKOFF_MS - 1;
      await daemon();
      await read({ now, mono, harness: 'board' });
      assert.equal(fake.asked, before + 2, 'inside the backoff neither asks');
      fake.next = plan();
      const other = await daemonQuota((opts) => readQuota({ ...opts, now, mono }), 'another', counting)();
      assert.equal(other.kind, 'windows', "REFUSED: another harness is never answered from the board's harness's held answer");
      assert.equal(fake.asked, before + 3, 'another harness asks for itself');
    },
  );
  await s.test(
    'REFUSED: after an unanswered answer no read asks inside the wait, however many boards read; the waits grow, and a good reading begins them again',
    async () => {
      fresh();
      const base = Date.now();
      let clock = base;
      const now = () => clock;
      const mono = () => clock - base;
      const before = fake.asked;
      const many = async () => (await Promise.all(Array.from({ length: 12 }, () => read({ now, mono })))).map((q) => q.state);
      const readsAt = async (offset: number, state: string, asked: number, why: string) => {
        const from = clock;
        clock = from + offset;
        assert.deepEqual(
          await many(),
          Array(12).fill(state),
          `${why}: read by twelve boards at once, ${offset} ms past the last ask, each says ${state}`,
        );
        assert.equal(fake.asked, before + asked, `${why}: ${asked} asks so far`);
        clock = from;
      };
      fake.next = UNANSWERED;
      const first = await read({ now, mono });
      assert.equal(first.state, 'unanswered');
      assert.match(first.said!, /Asked again in 20 min\.$/);
      assert.equal(fake.asked, before + 1);
      await readsAt(QUOTA_KEEP_MS, 'unanswered', 1, 'past the keep of a good reading, and still inside the wait: nothing asked');
      await readsAt(QUOTA_BACKOFF_MS - 1, 'unanswered', 1, 'a millisecond short of twenty minutes: nothing asked');
      clock += QUOTA_BACKOFF_MS;
      const second = await read({ now, mono });
      assert.equal(fake.asked, before + 2, 'the wait over: one ask');
      assert.match(second.said!, /Asked again in 40 min\.$/);
      await readsAt(40 * 60e3 - 1, 'unanswered', 2, 'the second wait is forty minutes');
      clock += 40 * 60e3;
      assert.match((await read({ now, mono })).said!, /Asked again in 1 h 20 min\.$/);
      assert.equal(fake.asked, before + 3);
      fake.next = { kind: 'failed', code: 3, signal: null, said: '' };
      clock += 80 * 60e3;
      assert.equal((await read({ now, mono })).state, 'failed');
      fake.next = UNANSWERED;
      clock += QUOTA_KEEP_MS;
      assert.match(
        (await read({ now, mono })).said!,
        /Asked again in 2 h 40 min\.$/,
        'a failure in between is kept the keep, and neither ends the row nor adds to it',
      );
      assert.equal(fake.asked, before + 5);
      fake.next = plan();
      clock += 160 * 60e3;
      const good = await read({ now, mono });
      assert.equal(good.state, 'fresh');
      assert.equal(
        good.againAt,
        new Date(clock + QUOTA_KEEP_MS).toISOString(),
        'the first good reading begins the waits again, and is kept the keep',
      );
      assert.equal(fake.asked, before + 6);
      await readsAt(QUOTA_KEEP_MS - 1, 'fresh', 6, 'a good reading is kept ten minutes');
      fake.next = UNANSWERED;
      clock += QUOTA_KEEP_MS;
      const again = await read({ now, mono });
      assert.equal(again.state, 'unanswered');
      assert.match(again.said!, /Asked again in 20 min\.$/, 'the row begun again: twenty minutes, not five hours and twenty');
      assert.equal(again.last?.windows.length, 2, 'with the good reading beside it');
      assert.equal(fake.asked, before + 7);
    },
  );
  await s.test('askedAt is when the ask began, not when it answered', async () => {
    fresh();
    let clock = NOW;
    const now = () => clock;
    const { ask, answers, begun } = handAsks();
    const q = readQuota({ ask, now, waitMs: 60_000 });
    await begun(1);
    clock += 7_000;
    answers[0](plan());
    const answered = await q;
    assert.equal(answered.askedAt, new Date(NOW).toISOString(), 'the time Claude Code was asked, before the world it read could change');
    assert.equal(answered.ageMs, 7_000);
  });
  await s.test(
    'a wall clock stepped forward past the keep asks nothing while the monotonic clock says the keep holds; past it there, it asks',
    async () => {
      fresh();
      const clock = { wall: NOW, mono: 0 };
      const now = () => clock.wall;
      const mono = () => clock.mono;
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '' };
      assert.equal((await read({ env, now, mono })).state, 'fresh');
      const before = fake.asked;
      clock.wall = NOW + QUOTA_KEEP_MS + 60_000;
      clock.mono = 1_000;
      assert.equal((await read({ env, now, mono })).state, 'fresh');
      assert.equal(fake.asked, before, 'a second later on the monotonic clock: held');
      clock.mono = QUOTA_KEEP_MS;
      await read({ env, now, mono });
      assert.equal(fake.asked, before + 1, 'the keep over on the monotonic clock: asked again');
    },
  );
});

test('REFUSED: never two asks at once — reads that come while an ask is in flight join it or queue behind it, whatever the wall clock does', async (t) => {
  await t.test(
    'REFUSED: reads of the harness the route reads that come while an ask is in flight join it: one ask for all of them, the route among them',
    async (t) => {
      fresh();
      t.mock.timers.enable({ apis: ['Date'], now: NOW });
      const before = asks() + fake.asked;
      const route = { harness: 'claude' };
      const all = await Promise.all([read(route), read(route), get(), read(route)]);
      assert.deepEqual(
        all.map((q) => q.state),
        ['fresh', 'fresh', 'fresh', 'fresh'],
      );
      assert.equal(asks() + fake.asked, before + 1);
    },
  );
  await t.test(
    'REFUSED: at a keep of 0, a read that comes while an ask begun before it is in flight is answered by an ask begun after it, never two at once',
    async () => {
      fresh();
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0' };
      let clock = NOW;
      const now = () => clock;
      const { ask, answers, counts, begun } = handAsks();
      const a = readQuota({ ask, env, now, waitMs: 60_000 });
      await begun(1);
      clock += 1;
      const b = readQuota({ ask, env, now, waitMs: 60_000 });
      const c = readQuota({ ask, env, now, waitMs: 60_000 });
      answers[0]({ kind: 'no-plan' });
      assert.equal((await a).state, 'no-plan', 'the first read is answered by the ask it began');
      await begun(2);
      assert.equal(counts.most, 1, 'the second ask began only once the first came back');
      answers[1]({ kind: 'unknown', what: 'it refused the request' });
      assert.deepEqual(
        [(await b).state, (await c).state],
        ['unknown', 'unknown'],
        'the reads that came while the first ask was out are answered by the one begun after them, and share it',
      );
      assert.equal(counts.began, 2, 'one ask for the read that came first, one for the two that came after');
      assert.equal(counts.most, 1, 'never two asks at once');
    },
  );
  await t.test(
    'REFUSED: at a keep of 0, three reads that come while an ask is in flight share one ask queued behind it: one begins, not three',
    async () => {
      fresh();
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0' };
      const { ask, answers, counts, begun } = handAsks();
      const a = readQuota({ ask, env, waitMs: 60_000 });
      await begun(1);
      const later = [0, 1, 2].map(() => readQuota({ ask, env, waitMs: 60_000 }));
      answers[0](plan());
      assert.equal((await a).state, 'fresh');
      await begun(2);
      for (let turn = 0; turn < 10; turn += 1) await new Promise((r) => setImmediate(r));
      assert.equal(counts.began, 2, 'one ask for the first read, and one queued for the three after it');
      assert.equal(counts.most, 1, 'never two asks at once');
      answers[1]({ kind: 'no-plan' });
      assert.deepEqual(
        (await Promise.all(later)).map((q) => q.state),
        ['no-plan', 'no-plan', 'no-plan'],
        'the three reads are answered by the one ask they share',
      );
    },
  );
  await t.test(
    'REFUSED: at a keep of 0, a read after the wall clock stepped back behind the start of the held ask asks again',
    async (t) => {
      fresh();
      t.mock.timers.enable({ apis: ['Date'], now: NOW });
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0' };
      assert.equal((await read({ env })).state, 'fresh');
      const before = fake.asked;
      fake.next = UNANSWERED;
      t.mock.timers.setTime(NOW - 1_500);
      assert.equal((await read({ env })).state, 'unanswered', 'the read is answered by an ask begun after it');
      assert.equal(fake.asked, before + 1, 'asked again, however far back the wall clock went');
    },
  );
  await t.test(
    'REFUSED: at a keep of 0, a read that comes while an ask is in flight, with the wall clock stepped back behind its start, queues behind it and does not join it',
    async (t) => {
      fresh();
      t.mock.timers.enable({ apis: ['Date'], now: NOW });
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0' };
      const { ask, answers, counts, begun } = handAsks();
      const a = readQuota({ ask, env, waitMs: 60_000 });
      await begun(1);
      t.mock.timers.setTime(NOW - 1_500);
      const b = readQuota({ ask, env, waitMs: 60_000 });
      answers[0](plan());
      assert.equal((await a).state, 'fresh');
      await begun(2);
      answers[1](UNANSWERED);
      assert.equal((await b).state, 'unanswered', 'the read is answered by the ask begun after it, not the one begun before');
      assert.equal(counts.most, 1, 'never two asks at once');
    },
  );
  await t.test(
    'REFUSED: an ask whose answer cannot be read fails the reads that share it, and the ask queued behind it still begins',
    async () => {
      fresh();
      const env = { ...process.env, HKB_QUOTA_KEEP_MS: '0', HKB_QUOTA_BACKOFF_MS: '0' };
      let clock = NOW;
      const now = () => clock;
      const { ask, answers, begun } = handAsks();
      const waits = () => process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
      const before = waits();
      const a = readQuota({ ask, env, now, waitMs: 60_000 });
      await begun(1);
      clock += 1;
      const b = readQuota({ ask, env, now, waitMs: 60_000 });
      answers[0]({ kind: 'windows', limits: null, subscription: 'max' } as never);
      await assert.rejects(a, 'the read that shared the ask whose answer does not read fails with it');
      await begun(2);
      answers[1](plan());
      assert.equal((await b).state, 'fresh', 'the read queued behind it is answered by its own ask');
      clock += 1;
      const c = readQuota({ ask, env, now, waitMs: 60_000 });
      await begun(3);
      answers[2]({ kind: 'no-plan' });
      assert.equal((await c).state, 'no-plan', 'and a read after both is answered');
      assert.equal(waits(), before, 'no read leaves its wait behind, the failed one included');
    },
  );
});

test('REFUSED: a read that waits past its wait says asking, then what the ask came to', WAITED, async (t) => {
  fresh();
  let answered = false;
  const ask = () =>
    new Promise<HarnessQuota>((r) =>
      setTimeout(() => {
        answered = true;
        r({ kind: 'timeout', ms: 15_000 });
      }, 300),
    );
  const q = await readQuota({ ask, waitMs: 50 });
  assert.equal(q.state, 'asking');
  assert.equal(q.said, 'Asking Claude Code for the quota…');
  const after = await until(
    t,
    async () => {
      const read = await readQuota({ ask, waitMs: 50 });
      return read.state !== 'asking' && read;
    },
    'the quota read to come to what its ask answered',
    { everyMs: 20 },
  );
  assert.ok(answered);
  assert.equal(after.state, 'timeout');
  assert.match(after.said!, /^Claude Code did not answer the usage request within 15 s:/);
});

/** Each way `text` could start a process of its own: node's child_process named, or a call of one of its functions. */
const starts = (text: string): string[] =>
  [...text.matchAll(/\bchild_process\b|\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/g)].map((m) => m[0]);

test('REFUSED: the quota read starts no process: the engine asks', () => {
  assert.deepEqual(starts("import { spawn } from 'node:child_process';\nconst c = spawn ('claude', USAGE_ARGS);"), [
    'child_process',
    'spawn (',
  ]);
  const text = fs.readFileSync(path.join(import.meta.dirname, 'quota.ts'), 'utf8');
  assert.match(text, /export function makeQuota\s*\(/, 'the file read is the quota asker');
  assert.deepEqual(starts(text), [], 'factory/quota.ts asks the engine, and starts no claude itself');
});
