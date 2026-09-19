/**
 * The statusline script (statusline/quota.ts), run as Claude Code runs it: a payload on stdin, the store in WF_ROOT. Every case exits 0 —
 * a statusline that fails is a session's terminal that says so.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(import.meta.dirname, '..', 'statusline', 'quota.ts');
const NOW = Math.floor(Date.now() / 1000);

/** A payload shaped as Claude Code 2.1.278 hands one to a statusline, trimmed to what the script reads and a little around it. */
const payload = (over: object = {}): string => JSON.stringify({
  session_id: 'a1b2', cwd: '/code', model: { id: 'claude-opus-5', display_name: 'Opus 5' }, version: '2.1.278',
  context_window: { total_input_tokens: 4200, context_window_size: 200000, current_usage: { input_tokens: 4200, output_tokens: 12 }, used_percentage: 2 },
  cost: { total_cost_usd: 0.04, total_duration_ms: 61000, total_api_duration_ms: 5200 },
  rate_limits: {
    five_hour: { used_percentage: 38.4, resets_at: NOW + 2 * 3600 },
    seven_day: { used_percentage: 86, resets_at: NOW + 3 * 86400 },
  },
  ...over,
});

const run = (input: string, env: Record<string, string>, ...wrap: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...wrap], { input, encoding: 'utf8', env: { ...process.env, TZ: 'UTC', ...env } });

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-statusline-'));
const read = (root: string) => JSON.parse(fs.readFileSync(path.join(root, 'quota.json'), 'utf8'));
/** A session's payload after its answers came to `apiMs` of API time, reporting the five-hour window at `fiveHour`%. */
const answered = (session: string, apiMs: number, fiveHour: number, over: object = {}) => payload({
  session_id: session, cost: { total_api_duration_ms: apiMs },
  rate_limits: { five_hour: { used_percentage: fiveHour, resets_at: NOW + 3600 }, seven_day: { used_percentage: 50, resets_at: NOW + 86400 } },
  ...over,
});

test('a payload with rate_limits: the quota written, whole, with the time and the version, and a line of its own', () => {
  const root = scratch();
  const before = Date.now();
  const out = run(payload(), { WF_ROOT: root });
  assert.equal(out.status, 0);
  const file = JSON.parse(fs.readFileSync(path.join(root, 'quota.json'), 'utf8'));
  assert.equal(file.claude_code_version, '2.1.278');
  assert.deepEqual(file.rate_limits, JSON.parse(payload()).rate_limits);
  const at = Date.parse(file.written_at);
  assert.ok(at >= before - 1000 && at <= Date.now(), `written_at is the time of the write: ${file.written_at}`);
  assert.deepEqual(Object.keys(file).sort(), ['claude_code_version', 'heard', 'rate_limits', 'written_at'], 'the quota part, and the answer it was heard at');
  assert.deepEqual(file.heard, { a1b2: 5200 });
  const resets = new Date((NOW + 2 * 3600) * 1000).toISOString().slice(11, 16);
  assert.equal(out.stdout, `5h 38% · 7d 86% · resets ${resets}\n`, 'the two percentages and the nearer reset, in the machine’s time');
  assert.deepEqual(fs.readdirSync(root), ['quota.json'], 'written beside and renamed: no hidden file left');
});

test('a payload with no rate_limits: written as none once the session has answered, and nothing written before it has', () => {
  const root = scratch();
  const none = run(payload({ rate_limits: undefined }), { WF_ROOT: root });
  assert.equal(none.status, 0);
  assert.equal(none.stdout, '', 'no line of its own without limits');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'quota.json'), 'utf8')).rate_limits, null);

  // A reading, then a session just opened, with no answer yet: the reading stays.
  run(payload({ cost: { total_api_duration_ms: 9000 } }), { WF_ROOT: root });
  const opened = run(payload({ session_id: 'new', rate_limits: undefined, context_window: { current_usage: null } }), { WF_ROOT: root });
  assert.equal(opened.status, 0);
  assert.equal(read(root).rate_limits.five_hour.used_percentage, 38.4);
});

test('a session with no answer since it last wrote writes nothing: its repaint is not news, even with numbers that differ', () => {
  const root = scratch();
  run(answered('a', 100, 40), { WF_ROOT: root });
  const first = read(root);
  // Claude Code's own run at the five-hour reset: the window gone by dropped, the week as last heard, and no answer behind it.
  const atReset = run(answered('a', 100, 40, { rate_limits: { seven_day: { used_percentage: 50, resets_at: NOW + 86400 } } }), { WF_ROOT: root });
  assert.equal(atReset.status, 0);
  assert.deepEqual(read(root), first, 'the reading and its time kept');
  assert.match(atReset.stdout, /^7d 50%/, 'its own line still says what the session has');

  run(answered('a', 180, 44), { WF_ROOT: root });
  assert.equal(read(root).rate_limits.five_hour.used_percentage, 44, 'an answer since: written');
  assert.ok(read(root).written_at >= first.written_at);
});

test("an idle session's repaint does not put its older numbers over a busier session's newer ones", () => {
  const root = scratch();
  run(answered('idle', 100, 40), { WF_ROOT: root });
  run(answered('busy', 900, 61), { WF_ROOT: root });
  run(answered('idle', 100, 40), { WF_ROOT: root });
  assert.equal(read(root).rate_limits.five_hour.used_percentage, 61);
  assert.deepEqual(read(root).heard, { idle: 100, busy: 900 });
  run(answered('idle', 150, 63), { WF_ROOT: root });
  assert.equal(read(root).rate_limits.five_hour.used_percentage, 63, 'once it has an answer, it is the newest');
});

test('a session with no limits does not wipe a reading that has them; with none to wipe, it says none', () => {
  const root = scratch();
  run(answered('subscription', 100, 40), { WF_ROOT: root });
  const apiKey = run(answered('api-key', 300, 0, { rate_limits: undefined }), { WF_ROOT: root });
  assert.equal(apiKey.status, 0);
  assert.equal(read(root).rate_limits.five_hour.used_percentage, 40);

  const empty = scratch();
  run(answered('api-key', 300, 0, { rate_limits: undefined }), { WF_ROOT: empty });
  assert.equal(read(empty).rate_limits, null);
});

test('heard keeps the last sessions to write, and no more', () => {
  const root = scratch();
  for (let i = 0; i < 34; i++) run(answered(`s${i}`, 100 + i, 40), { WF_ROOT: root });
  const heard = Object.keys(read(root).heard);
  assert.equal(heard.length, 32);
  assert.deepEqual([heard[0], heard.at(-1)], ['s2', 's33']);
});

test('a wrapped command: run with the same stdin, its output first', () => {
  const root = scratch();
  const input = payload();
  const out = run(input, { WF_ROOT: root }, 'printf', '"mine: %s"', '"$(wc -c)"');
  assert.equal(out.status, 0);
  const [theirs, ours] = out.stdout.split('\n');
  assert.equal(theirs, `mine: ${Buffer.byteLength(input)}`, 'the wrapped command read the whole payload');
  assert.match(ours!, /^5h 38% · 7d 86% · resets /);
  assert.ok(fs.existsSync(path.join(root, 'quota.json')));

  // A wrapped command that fails prints what it printed, and the script still exits 0.
  const failing = run(input, { WF_ROOT: root }, 'echo half; exit 3');
  assert.equal(failing.status, 0);
  assert.match(failing.stdout, /^half\n5h /);
});

test('an unwritable store, or a payload that is not JSON: nothing of its own printed, and exit 0', () => {
  const blocker = path.join(scratch(), 'a-file');
  fs.writeFileSync(blocker, '');
  const unwritable = run(payload(), { WF_ROOT: path.join(blocker, 'store') });
  assert.equal(unwritable.status, 0);
  assert.equal(unwritable.stdout, '');
  assert.equal(unwritable.stderr, '', 'and nothing on stderr either');

  const wrapped = run(payload(), { WF_ROOT: path.join(blocker, 'store') }, 'echo theirs');
  assert.equal(wrapped.status, 0);
  assert.equal(wrapped.stdout, 'theirs\n', "the wrapped command's output is still printed");

  const garbage = run('not json', { WF_ROOT: scratch() });
  assert.equal(garbage.status, 0);
  assert.equal(garbage.stdout, '');
});
