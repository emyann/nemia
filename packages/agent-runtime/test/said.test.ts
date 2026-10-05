/**
 * What a detached run's output said is read once per change of its capture, across processes (`harness/detached/said.ts`): a
 * finished run's reading is kept beside its log, keyed by the log's size and mtime and `SAID_VERSION`, and a fresh runner takes
 * it instead of the log; a kept reading that does not parse, does not decode, or has another key is read again from the log,
 * never trusted. What the shipped readers read is pinned (`SAID_DIGEST`), so a reader that reads otherwise is refused here
 * until the digest is recorded again beside a `SAID_VERSION` gone up with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, type HarnessOutput, type HarnessSpec } from '../src/harness/detached/detached.ts';
import { claudeResultOutput, claudeStreamOutput } from '../src/harness/detached/output.ts';
import { SAID_DIGEST, SAID_EXTENDED, SAID_VERSION } from '../src/harness/detached/said.ts';
import { codexOutput } from '../src/harness/codex/stream.ts';
import { ioCounts } from '../src/core/engine/tally.ts';
import { READER_STREAMS, resultLine, stream } from './reader-streams.ts';
import { scratch } from './scratch.ts';

/** A spec of `claude -p`'s stream, whose reads of an output are counted. */
const counted = () => {
  const reads = { n: 0 };
  const spec: HarnessSpec = {
    name: 'sh',
    command: () => ({ cmd: 'sh', args: ['-c', 'true'] }),
    readOutput: (text) => (reads.n++, claudeStreamOutput(text)),
  };
  return { spec, reads };
};

/** A run `name` of the spec `sh`, written into `dir` as its worker leaves it: in `state`, its capture `text`. */
const runOf = (dir: string, name: string, text: string, state = 'done') => {
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const run = { name, state, pid: 999999, exitCode: 0, logFile: `${base}.log`, heartbeatAt: new Date().toISOString() };
  fs.writeFileSync(`${base}.json`, JSON.stringify(run));
  fs.writeFileSync(`${base}.log`, text);
  return { log: `${base}.log`, kept: `${base}.said` };
};

/** A long session's capture: many lines of work, then its result. */
const longCapture = (outcome: string) =>
  [
    stream.init,
    ...Array.from({ length: 8_000 }, (_, i) => stream.calls([`toolu_${i}`, 'Bash', { command: `echo ${'x'.repeat(200)}` }])),
    stream.denied('toolu_7', 'Bash'),
    resultLine({ structured_output: { outcome }, total_cost_usd: 0.5, duration_api_ms: 900 }),
    '',
  ].join('\n');

const observe = async (spec: HarnessSpec, dir: string) => Effect.runPromise(detachedOps(spec, dir).observe);

test("a finished run's output is read once across processes: a fresh runner takes what the first kept beside its log", async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const { log, kept } = runOf(dir, 'ae/s1/1', longCapture('done'));
  const size = fs.statSync(log).size;
  assert.ok(size > 1_500_000, `a large log: ${size} bytes`);

  const first = (await observe(spec, dir)).get('ae/s1/1');
  assert.equal(reads.n, 1);
  assert.ok(fs.existsSync(kept), 'kept beside its log');
  const before = ioCounts().bytesRead;
  const again = await observe(spec, dir);
  assert.equal(reads.n, 1, 'a second runner, as a second process starts, does not read the log again');
  assert.ok(ioCounts().bytesRead - before < size / 100, `read ${ioCounts().bytesRead - before} bytes of a ${size}-byte log`);
  assert.deepEqual(again.get('ae/s1/1'), first, 'the same sighting, stamped with the same moment');
  assert.deepEqual(first?.closeout?.payload, { outcome: 'done' });
  assert.deepEqual(first?.usage, { costUsd: 0.5, apiMs: 900 });
  assert.deepEqual(first?.denials, [{ tool: 'Bash', what: 'echo' }]);
  assert.deepEqual([...again.keys()], ['ae/s1/1'], 'the kept file is never read as a run');
});

test('a log that grows after its output was kept is read again, and says what it says now', async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const { log } = runOf(dir, 'ae/s2/1', longCapture('done'));
  await observe(spec, dir);
  assert.equal(reads.n, 1);
  fs.appendFileSync(log, `${resultLine({ structured_output: { outcome: 'again' } })}\n`);
  const seen = (await observe(spec, dir)).get('ae/s2/1');
  assert.equal(reads.n, 2, 'its size and mtime moved: read again');
  assert.deepEqual(seen?.closeout?.payload, { outcome: 'again' }, 'not what was kept');
  await observe(spec, dir);
  assert.equal(reads.n, 2, 'and kept again');
});

/** A kept output of the log `log` written by hand: `lie` over a key that is the log's own. */
const keep = (file: string, log: string, lie: object) => {
  const { size, mtimeMs } = fs.statSync(log);
  fs.writeFileSync(file, JSON.stringify({ version: SAID_VERSION, size, mtimeMs, read: { closeout: { payload: 'kept' } }, ...lie }));
};

/** What a fresh runner sees of a finished run whose kept output is written by `write`, and how often it read the log. */
const withKept = async (write: (files: { log: string; kept: string }) => void) => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const files = runOf(dir, 'ae/s3/1', `${resultLine({ structured_output: 'logged' })}\n`);
  write(files);
  const seen = (await observe(spec, dir)).get('ae/s3/1');
  return { payload: seen?.closeout?.payload, reads: reads.n, ...(seen?.skills ? { skills: seen.skills } : {}) };
};

test('a kept output with the log’s own key is taken for it, and the log is not read', async () => {
  assert.deepEqual(await withKept(({ log, kept }) => keep(kept, log, {})), { payload: 'kept', reads: 0 });
});

test('a kept output whose size is not the log’s is read again from the log, never trusted', async () => {
  const kept = await withKept(({ log, kept }) => keep(kept, log, { size: fs.statSync(log).size + 1 }));
  assert.deepEqual(kept, { payload: 'logged', reads: 1 });
});

test('a kept output whose mtime is not the log’s is read again from the log, never trusted', async () => {
  const kept = await withKept(({ log, kept }) => keep(kept, log, { mtimeMs: fs.statSync(log).mtimeMs - 1 }));
  assert.deepEqual(kept, { payload: 'logged', reads: 1 });
});

test('a kept output of another version is read again from the log, never trusted', async () => {
  for (const version of [SAID_VERSION + 1, 0]) {
    assert.equal(SAID_EXTENDED.includes(version), false);
    const kept = await withKept(({ log, kept }) => keep(kept, log, { version }));
    assert.deepEqual(kept, { payload: 'logged', reads: 1 }, `version ${version}`);
  }
});

test('a kept output of a version the readers only added fields to is taken as it is: the log is not read, and what it lacks is absent', async () => {
  assert.deepEqual(SAID_EXTENDED, [1, 2]);
  for (const version of SAID_EXTENDED) {
    const kept = await withKept(({ log, kept }) => keep(kept, log, { version }));
    assert.deepEqual(kept, { payload: 'kept', reads: 0 }, `version ${version}: no skills nor files, read before they were`);
  }
});

test('a kept output whose skills are not a list of names is read again from the log, never trusted', async () => {
  const kept = await withKept(({ log, kept }) => keep(kept, log, { read: { closeout: { payload: 'kept' }, skills: 'look' } }));
  assert.deepEqual(kept, { payload: 'logged', reads: 1 });
});

test('a session that loaded no skills keeps saying so: an empty list is on its sighting, kept, and taken by a fresh runner', async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  runOf(dir, 'ae/s7/1', [stream.init, stream.calls(['toolu_q', 'Bash', { command: 'ls' }]), resultLine({}), ''].join('\n'));
  assert.deepEqual((await observe(spec, dir)).get('ae/s7/1')?.skills, []);
  assert.deepEqual((await observe(spec, dir)).get('ae/s7/1')?.skills, [], 'taken from what was kept');
  assert.equal(reads.n, 1);
});

test('a kept output in no shape a reader reads is read again from the log, never trusted', async () => {
  const wrong = await withKept(({ log, kept }) => keep(kept, log, { read: { closeout: { payload: 'kept' }, usage: { costUsd: 'x' } } }));
  assert.deepEqual(wrong, { payload: 'logged', reads: 1 }, 'a usage that does not decode');
  const text = await withKept(({ kept }) => fs.writeFileSync(kept, '{"version":'));
  assert.deepEqual(text, { payload: 'logged', reads: 1 }, 'text that is not JSON');
});

test('a run still working keeps nothing beside its log; once over, it does', async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const { kept } = runOf(dir, 'ae/s4/1', `${resultLine({ structured_output: 'so far' })}\n`, 'working');
  assert.deepEqual((await observe(spec, dir)).get('ae/s4/1')?.closeout?.payload, 'so far');
  assert.equal(fs.existsSync(kept), false, 'its log may still grow');
  runOf(dir, 'ae/s4/1', `${resultLine({ structured_output: 'done' })}\n`);
  const seen = await observe(spec, dir);
  assert.deepEqual(seen.get('ae/s4/1')?.closeout?.payload, 'done');
  assert.ok(fs.existsSync(kept));
  assert.equal(reads.n, 2);
  assert.deepEqual([...seen.keys()], ['ae/s4/1']);
});

test('a kept output that cannot be written is no failure: the run is seen, and its log read again next time', async (t) => {
  if (process.getuid?.() === 0) return t.skip('run as root, who writes into any folder');
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const { kept } = runOf(dir, 'ae/s5/1', `${resultLine({ structured_output: 'done' })}\n`);
  const runs = path.dirname(kept);
  fs.chmodSync(runs, 0o555);
  try {
    assert.deepEqual((await observe(spec, dir)).get('ae/s5/1')?.closeout?.payload, 'done');
    await observe(spec, dir);
    assert.equal(reads.n, 2);
    assert.deepEqual(fs.readdirSync(runs).sort(), ['ae_s5_1.json', 'ae_s5_1.log'], 'nothing written, nothing left half written');
  } finally {
    fs.chmodSync(runs, 0o755);
  }
});

test('a re-spawn of the same attempt removes what was kept of the last one’s output', async () => {
  const dir = scratch('ae-said-');
  const { spec } = counted();
  const quiet: HarnessSpec = { ...spec, command: () => ({ cmd: 'sh', args: ['-c', 'sleep 2'] }) };
  const { log, kept } = runOf(dir, 'ae/s6/1', `${resultLine({ structured_output: 'last' })}\n`);
  keep(kept, log, {});
  await Effect.runPromise(detachedOps(quiet, dir).spawn({ name: 'ae/s6/1', brief: 'x', cwd: dir }));
  assert.equal(fs.existsSync(kept), false);
  assert.equal((await observe(quiet, dir)).get('ae/s6/1')?.closeout, undefined);
});

/** What each shipped reader reads of its streams, a refusal in its words, as one digest. */
const digestOfReaders = (): string => {
  const readers: Record<keyof typeof READER_STREAMS, (text: string) => HarnessOutput> = {
    claudeResultOutput,
    claudeStreamOutput,
    codexOutput,
  };
  const read = Object.entries(READER_STREAMS).map(([name, streams]) => [
    name,
    streams.map((text) => {
      try {
        return readers[name as keyof typeof READER_STREAMS](text);
      } catch (e) {
        return { wrong: e instanceof Error ? e.message : String(e) };
      }
    }),
  ]);
  return createHash('sha256').update(JSON.stringify(read)).digest('hex');
};

test('what the shipped readers read is pinned beside SAID_VERSION: a reader that reads otherwise is refused until both are recorded', () => {
  assert.equal(
    digestOfReaders(),
    SAID_DIGEST,
    'a reader reads otherwise: a kept output of the old reading would be taken for the new. Raise SAID_VERSION in ' +
      '`harness/detached/said.ts`, and record this digest as SAID_DIGEST beside it',
  );
});
