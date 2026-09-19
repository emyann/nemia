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
  rate_limits: {
    five_hour: { used_percentage: 38.4, resets_at: NOW + 2 * 3600 },
    seven_day: { used_percentage: 86, resets_at: NOW + 3 * 86400 },
  },
  ...over,
});

const run = (input: string, env: Record<string, string>, ...wrap: string[]) =>
  spawnSync(process.execPath, [SCRIPT, ...wrap], { input, encoding: 'utf8', env: { ...process.env, TZ: 'UTC', ...env } });

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-statusline-'));

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
  assert.deepEqual(Object.keys(file).sort(), ['claude_code_version', 'rate_limits', 'written_at'], 'the quota part and nothing of the session');
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
  run(payload(), { WF_ROOT: root });
  const opened = run(payload({ rate_limits: undefined, context_window: { current_usage: null } }), { WF_ROOT: root });
  assert.equal(opened.status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'quota.json'), 'utf8')).rate_limits.five_hour.used_percentage, 38.4);
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
