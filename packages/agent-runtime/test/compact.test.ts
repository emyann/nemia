/**
 * The captures already on disk are rewritten once to what their readers read (`compactRuns`, `harness/detached/compact.ts`): each
 * run whose worker has ended, one at a time, its log and its stdout, and what was read kept anew; a capture at work, with no run
 * file, refused by its reader, or read otherwise once kept, is left whole and named. Whether a worker is there is asked of `alive`,
 * so no process is started.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compactRuns } from '../src/harness/detached/compact.ts';
import type { HarnessSpec } from '../src/harness/detached/detached.ts';
import { claudeStreamKept, claudeStreamOutput } from '../src/harness/detached/output.ts';
import { keptSaid } from '../src/harness/detached/said.ts';
import { CONVERSATION_STREAM, stream } from './reader-streams.ts';
import { scratch } from './scratch.ts';

const spec: HarnessSpec = {
  name: 'sh',
  command: () => ({ cmd: 'sh', args: ['-c', 'true'] }),
  readOutput: claudeStreamOutput,
  keepOutput: claudeStreamKept,
  streams: true,
};

/** A stream its reader refuses: a denial whose call id is a number. */
const REFUSED = [
  stream.init,
  stream.toolResult('x'),
  JSON.stringify({ ...JSON.parse(stream.denied('b', 'Bash')), tool_use_id: 7 }),
  '',
].join('\n');

/** The pid `alive` finds, and one it does not. */
const LIVE = 4242;
const GONE = 4343;

/** A folder of runs: each `[name, state, pid, log, stdout?]` written as its worker leaves it, and a log no run file names. */
const runsIn = () => {
  const dir = path.join(scratch('ae-compact-'), 'runs', 'sh');
  fs.mkdirSync(dir, { recursive: true });
  const write = (base: string, state: string, pid: number, log: string, stdout?: string) => {
    const run = { name: base, state, pid, exitCode: 0, logFile: path.join(dir, `${base}.log`), heartbeatAt: new Date().toISOString() };
    fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(run));
    fs.writeFileSync(path.join(dir, `${base}.log`), log);
    if (stdout !== undefined) fs.writeFileSync(path.join(dir, `${base}.stdout`), stdout);
  };
  write('ended', 'done', GONE, CONVERSATION_STREAM, CONVERSATION_STREAM);
  write('refused', 'failed', GONE, REFUSED);
  write('working', 'working', LIVE, CONVERSATION_STREAM);
  write('unstarted', 'working', 0, CONVERSATION_STREAM);
  write('orphan', 'working', GONE, CONVERSATION_STREAM);
  write('compact', 'done', GONE, claudeStreamKept(CONVERSATION_STREAM));
  fs.writeFileSync(path.join(dir, 'stray.log'), CONVERSATION_STREAM);
  fs.writeFileSync(path.join(dir, 'ended.stderr'), 'a warning\n');
  return dir;
};

/** Every file in `dir`, by name, its text and modification time. */
const filesIn = (dir: string) =>
  Object.fromEntries(
    fs.readdirSync(dir).map((f) => [f, [fs.readFileSync(path.join(dir, f), 'utf8'), fs.statSync(path.join(dir, f)).mtimeMs]]),
  );

const alive = (pid: number) => pid === LIVE;

const whole = Buffer.byteLength(CONVERSATION_STREAM);
const kept = Buffer.byteLength(claudeStreamKept(CONVERSATION_STREAM));

test('a count writes nothing, and says what the rewrite then does', () => {
  const dir = runsIn();
  const before = filesIn(dir);
  const counted = compactRuns(spec, dir, { dry: true, alive });
  assert.deepEqual(filesIn(dir), before, 'nothing written');
  const done = compactRuns(spec, dir, { dry: false, alive });
  assert.deepEqual(done, counted);
  assert.equal(done.captures, 8);
  assert.equal(done.compacted, 3, "the ended run's log and stdout, and the log of a working run whose worker is gone");
  assert.equal(done.before, 6 * whole + Buffer.byteLength(REFUSED) + kept);
  assert.equal(done.after, 3 * whole + Buffer.byteLength(REFUSED) + 4 * kept);
});

test('each capture left is named with why, and kept whole', () => {
  const dir = runsIn();
  const before = filesIn(dir);
  const { left } = compactRuns(spec, dir, { dry: false, alive });
  assert.deepEqual(
    left.map(({ name, why }) => [name, why.replace(/: .*/s, ': …')]),
    [
      ['refused.log', 'its reader refuses it: …'],
      ['stray.log', 'no run file names it'],
      ['unstarted.log', 'its worker is at work'],
      ['working.log', 'its worker is at work'],
    ],
  );
  assert.match(left[0].why, /tool_use_id/, "the reader's words");
  const after = filesIn(dir);
  for (const { name } of left) assert.deepEqual(after[name], before[name], `${name} byte for byte`);
  assert.deepEqual(after['ended.stderr'], before['ended.stderr'], 'stderr is left');
  assert.deepEqual(after['compact.log'], before['compact.log'], 'a capture already kept is left as it is');
});

test('a rewritten capture keeps its time, reads as before, and what was read is kept under its new key', () => {
  const dir = runsIn();
  const before = filesIn(dir);
  compactRuns(spec, dir, { dry: false, alive });
  for (const name of ['ended.log', 'ended.stdout', 'orphan.log']) {
    const file = path.join(dir, name);
    assert.equal(fs.readFileSync(file, 'utf8'), claudeStreamKept(CONVERSATION_STREAM), name);
    assert.ok(Math.abs(fs.statSync(file).mtimeMs - Number(before[name][1])) < 0.01, `${name} keeps its time`);
  }
  const { size, mtimeMs } = fs.statSync(path.join(dir, 'ended.log'));
  assert.deepEqual(keptSaid(path.join(dir, 'ended.said'), { size, mtimeMs }), claudeStreamOutput(CONVERSATION_STREAM));
  assert.deepEqual(
    fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')),
    [],
    'nothing left half written',
  );
});

test('a second pass rewrites nothing more', () => {
  const dir = runsIn();
  compactRuns(spec, dir, { dry: false, alive });
  const again = compactRuns(spec, dir, { dry: false, alive });
  assert.equal(again.compacted, 0);
  assert.equal(again.before, again.after);
});

test('a capture whose kept text reads otherwise is left whole, and named', () => {
  const dir = runsIn();
  const dropsResult = (output: string) => claudeStreamKept(output).replace(/\n[^\n]*"type":"result"[^\n]*/, '');
  const before = filesIn(dir);
  const report = compactRuns({ ...spec, keepOutput: dropsResult }, dir, { dry: false, alive });
  assert.equal(report.compacted, 0);
  assert.deepEqual(
    report.left.filter((l) => l.name.startsWith('ended')),
    [
      { name: 'ended.log', why: 'its reader reads it otherwise once kept' },
      { name: 'ended.stdout', why: 'its reader reads it otherwise once kept' },
    ],
  );
  assert.deepEqual(filesIn(dir), before);
});

test('a spec that keeps every capture whole finds none', () => {
  const dir = runsIn();
  const { keepOutput: _, ...whole } = spec;
  assert.deepEqual(compactRuns(whole, dir, { dry: false, alive }), { captures: 0, compacted: 0, before: 0, after: 0, left: [] });
});
