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
import { claudeResultOutput, claudeStreamKept, claudeStreamOutput, READ_INPUT_KEYS, STREAM_KINDS } from '../src/harness/detached/output.ts';
import { printedKindOf } from '../src/harness/claude/print.ts';
import { SAID_DIGEST, SAID_EXTENDED, SAID_VERSION } from '../src/harness/detached/said.ts';
import { codexOutput } from '../src/harness/codex/stream.ts';
import { ioCounts } from '../src/core/engine/tally.ts';
import { CONVERSATION_STREAM, FILES_STREAM, MODEL, READER_STREAMS, resultLine, stream } from './reader-streams.ts';
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
const runOf = (dir: string, name: string, text: string, state = 'done', heartbeatAt = new Date().toISOString()) => {
  const runs = path.join(dir, 'runs', 'sh');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const run = { name, state, pid: 999999, exitCode: 0, logFile: `${base}.log`, heartbeatAt };
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
  assert.deepEqual(SAID_EXTENDED, [1, 2, 3, 4, 6]);
  for (const version of SAID_EXTENDED) {
    const kept = await withKept(({ log, kept }) => keep(kept, log, { version }));
    assert.deepEqual(kept, { payload: 'kept', reads: 0 }, `version ${version}: no skills, files nor model, read before they were`);
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

test('a kept output whose files are not a list of paths is read again from the log, never trusted', async () => {
  const kept = await withKept(({ log, kept }) => keep(kept, log, { read: { closeout: { payload: 'kept' }, files: 'a.ts' } }));
  assert.deepEqual(kept, { payload: 'logged', reads: 1 });
});

test('the files a session touched are on its sighting, kept, and taken by a fresh runner; none touched is an empty list', async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = counted();
  const none = [FILES_STREAM.split('\n')[0], resultLine({}), ''].join('\n');
  runOf(dir, 'ae/s8/1', `${FILES_STREAM}\n`);
  runOf(dir, 'ae/s8/2', none);
  for (const said of ['read from the log', 'taken from what was kept']) {
    const seen = await observe(spec, dir);
    assert.deepEqual(seen.get('ae/s8/1')?.files, ['apps/web/a.tsx', 'b.ts', 'n.ipynb'], said);
    assert.deepEqual(seen.get('ae/s8/2')?.files, [], said);
  }
  assert.equal(reads.n, 2, 'each log read once');
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

/** What each shipped reader reads of its streams, each stream first given to `kept`, a refusal in its words, as one digest. */
const digestOfReaders = (kept: (name: string, text: string) => string = (_, text) => text): string => {
  const readers: Record<keyof typeof READER_STREAMS, (text: string) => HarnessOutput> = {
    claudeResultOutput,
    claudeStreamOutput,
    codexOutput,
  };
  const read = Object.entries(READER_STREAMS).map(([name, streams]) => [
    name,
    streams.map((text) => {
      try {
        return readers[name as keyof typeof READER_STREAMS](kept(name, text));
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

/** A Claude stream as a finished job's capture keeps it (`claudeStreamKept`), or whole where the reader refuses it. */
const keptOrWhole = (name: string, text: string): string => {
  if (name === 'codexOutput') return text;
  try {
    return claudeStreamKept(text);
  } catch {
    return text;
  }
};

test('a capture kept to what the readers read reads the same as the whole one, over every stream of the corpus', () => {
  assert.equal(digestOfReaders(keptOrWhole), SAID_DIGEST, 'a kept capture reads otherwise than its whole stream');
  const refused = READER_STREAMS.claudeStreamOutput.filter((text) => keptOrWhole('claudeStreamOutput', text) === text);
  assert.ok(refused.length < READER_STREAMS.claudeStreamOutput.length, 'some streams were cut');
});

test('a capture kept once is kept the same again', () => {
  for (const text of [...READER_STREAMS.claudeStreamOutput.map((t) => keptOrWhole('claudeStreamOutput', t)), CONVERSATION_STREAM]) {
    const once = keptOrWhole('claudeStreamOutput', text);
    assert.equal(keptOrWhole('claudeStreamOutput', once), once);
  }
});

test('a session killed before its result still reads, kept, what it was denied, the call named whole', () => {
  const killed = CONVERSATION_STREAM.split('\n').slice(0, -2).join('\n');
  const kept = claudeStreamKept(killed);
  assert.deepEqual(claudeStreamOutput(kept), claudeStreamOutput(killed));
  assert.deepEqual(claudeStreamOutput(kept).denials, [{ tool: 'Bash', what: 'git' }]);
  assert.match(kept, /git push origin main/, 'a denied call keeps its input whole');
  const lone = [stream.init, stream.denied('toolu_b', 'Bash')].join('\n');
  assert.deepEqual(
    claudeStreamOutput(claudeStreamKept(lone)),
    { denials: [{ tool: 'Bash' }], skills: [], ranOn: MODEL },
    'the keep keeps the `init` line whole, so the model the session really started on survives it',
  );
});

/** The ids of the calls a capture says were denied: by a `permission_denied` line or its result's `permission_denials`. */
const deniedIn = (capture: string): Set<string> => {
  const ids = new Set<string>();
  for (const text of capture.split('\n')) {
    const kind = printedKindOf(text);
    if (kind === 'system permission_denied') ids.add(JSON.parse(text).tool_use_id);
    if (kind === 'result') for (const d of JSON.parse(text).permission_denials ?? []) ids.add(d.tool_use_id);
  }
  return ids;
};

/**
 * What of the conversation a capture keeps that no reader reads, named: a JSON line of a kind no reader reads, an assistant's block
 * that is no call, an input key no reader reads of a call that was not denied, and a command kept past its first word.
 */
const conversationIn = (capture: string): string[] => {
  const denied = deniedIn(capture);
  return capture.split('\n').flatMap((text, i): string[] => {
    const kind = printedKindOf(text);
    if (kind === undefined) return [];
    if (kind === 'other' || !STREAM_KINDS.includes(kind)) return [`line ${i + 1}: a ${JSON.parse(text).type} line`];
    if (kind !== 'assistant') return [];
    const blocks: { type: string; id?: string; name?: string; input?: Record<string, unknown> }[] = JSON.parse(text).message.content;
    return blocks.flatMap((b): string[] => {
      if (b.type !== 'tool_use') return [`line ${i + 1}: a ${b.type} block`];
      if (denied.has(b.id ?? '')) return [];
      const keys = Object.keys(b.input ?? {}).filter((k) => k !== READ_INPUT_KEYS[b.name ?? '']);
      const command = b.name === 'Bash' && typeof b.input?.command === 'string' && /\s/.test(b.input.command.trim());
      return [...keys.map((k) => `line ${i + 1}: ${b.name}'s ${k}`), ...(command ? [`line ${i + 1}: a whole command`] : [])];
    });
  });
};

test('a kept capture holds nothing of the conversation no reader reads; a capture that does is named', () => {
  assert.deepEqual(conversationIn(claudeStreamKept(CONVERSATION_STREAM)), []);
  for (const text of READER_STREAMS.claudeStreamOutput) assert.deepEqual(conversationIn(keptOrWhole('claudeStreamOutput', text)), []);
  assert.deepEqual(conversationIn(CONVERSATION_STREAM), [
    'line 2: a stream_event line',
    'line 3: a stream_event line',
    'line 4: a thinking block',
    'line 4: a text block',
    "line 4: Write's content",
    "line 4: Edit's old_string",
    "line 4: Edit's new_string",
    "line 4: Bash's description",
    'line 4: a whole command',
    "line 4: Grep's pattern",
    "line 4: Grep's path",
    'line 5: a text block',
    'line 6: a user line',
    'line 8: a system line',
    'line 9: a rate_limit_event line',
    'line 10: a stream_event line',
  ]);
  assert.deepEqual(conversationIn([stream.init, stream.toolResult('x')].join('\n')), ['line 2: a user line']);
  const written = stream.calls(['toolu_w', 'Write', { file_path: '/w/a.ts', content: 'all of it' }]);
  assert.deepEqual(conversationIn(written), ["line 1: Write's content"]);
});

test('a kept capture says what its whole stream says, and keeps the init, the denial, the result and stderr as printed', () => {
  const kept = claudeStreamKept(CONVERSATION_STREAM);
  assert.deepEqual(claudeStreamOutput(kept), claudeStreamOutput(CONVERSATION_STREAM));
  assert.deepEqual(claudeStreamOutput(kept).files, ['a.ts', 'b.ts']);
  const whole = CONVERSATION_STREAM.split('\n');
  for (const at of [0, 6, 10, 11, 12]) assert.ok(kept.split('\n').includes(whole[at]), `line ${at + 1} kept as printed`);
  assert.ok(kept.length < CONVERSATION_STREAM.length, `${kept.length} of ${CONVERSATION_STREAM.length} characters`);
});

/** A spec of `claude -p`'s stream that keeps its streams apart and keeps of an ended capture what `keep` keeps, its reads counted. */
const keeping = (keep: (output: string) => string = claudeStreamKept) => {
  const { spec, reads } = counted();
  return { spec: { ...spec, streams: true, keepOutput: keep } satisfies HarnessSpec, reads };
};

/** A run of `keeping`'s spec whose log and stdout are `CONVERSATION_STREAM`, its stderr a line, with their times set long ago. */
const conversationRun = (dir: string, name: string, state = 'done', heartbeatAt?: string) => {
  const files = runOf(dir, name, CONVERSATION_STREAM, state, heartbeatAt);
  const stdout = files.log.replace(/\.log$/, '.stdout');
  const stderr = files.log.replace(/\.log$/, '.stderr');
  fs.writeFileSync(stdout, CONVERSATION_STREAM);
  fs.writeFileSync(stderr, 'a warning on stderr\n');
  const long = new Date('2026-01-02T03:04:05.678Z');
  for (const file of [files.log, stdout, stderr]) fs.utimesSync(file, long, long);
  return { ...files, stdout, stderr, long };
};

test("an ended job's capture and its stdout are rewritten to what its readers read, their times kept, and read as before", async () => {
  const dir = scratch('ae-said-');
  const { spec, reads } = keeping();
  const { log, kept, stdout, stderr, long } = conversationRun(dir, 'ae/k1/1');
  const whole = claudeStreamOutput(CONVERSATION_STREAM);
  const seen = (await observe(spec, dir)).get('ae/k1/1');
  assert.equal(fs.readFileSync(log, 'utf8'), claudeStreamKept(CONVERSATION_STREAM));
  assert.equal(fs.readFileSync(stdout, 'utf8'), claudeStreamKept(CONVERSATION_STREAM));
  assert.equal(fs.readFileSync(stderr, 'utf8'), 'a warning on stderr\n', 'stderr is no stream the readers read: left');
  for (const file of [log, stdout]) assert.equal(fs.statSync(file).mtimeMs, long.getTime(), `${path.basename(file)} keeps its time`);
  assert.equal(JSON.parse(fs.readFileSync(kept, 'utf8')).size, fs.statSync(log).size, 'what was read is kept under the kept key');
  assert.deepEqual(seen?.closeout?.payload, whole.closeout?.payload);
  assert.deepEqual([seen?.usage, seen?.denials, seen?.skills, seen?.files], [whole.usage, whole.denials, whole.skills, whole.files]);
  const read = reads.n;
  const again = (await observe(spec, dir)).get('ae/k1/1');
  assert.deepEqual(again, seen, 'a fresh runner takes what was kept');
  assert.equal(reads.n, read, 'and reads no capture');
});

test('a capture is left whole while its worker has not written its end, a lease gone included', async () => {
  const dir = scratch('ae-said-');
  const { spec } = keeping();
  const stale = conversationRun(dir, 'ae/k2/1', 'working', new Date(Date.now() - 600_000).toISOString());
  const fresh = conversationRun(dir, 'ae/k2/2', 'working');
  const seen = await observe(spec, dir);
  assert.equal(seen.get('ae/k2/1')?.state, 'failed');
  for (const file of [stale.log, stale.stdout, fresh.log, fresh.stdout]) assert.equal(fs.readFileSync(file, 'utf8'), CONVERSATION_STREAM);
  assert.ok(fs.existsSync(stale.kept), 'a run whose lease is gone keeps what was read, as before');
  assert.equal(fs.existsSync(fresh.kept), false);
});

test('a capture its reader refuses is left whole, its run failed', async () => {
  const dir = scratch('ae-said-');
  const { spec } = keeping();
  const refused = [stream.init, JSON.stringify({ ...JSON.parse(stream.denied('toolu_b', 'Bash')), tool_use_id: 7 }), resultLine({}), ''];
  const { log, kept } = runOf(dir, 'ae/k3/1', [...refused.slice(0, 1), stream.toolResult('x'), ...refused.slice(1)].join('\n'));
  const text = fs.readFileSync(log, 'utf8');
  assert.equal((await observe(spec, dir)).get('ae/k3/1')?.state, 'failed');
  assert.equal(fs.readFileSync(log, 'utf8'), text);
  assert.equal(fs.existsSync(kept), false);
});

test('a capture whose kept text reads otherwise is left whole, and what was read is kept under its own key', async () => {
  const dir = scratch('ae-said-');
  const dropsResult = (output: string) => claudeStreamKept(output).replace(/\n[^\n]*"type":"result"[^\n]*/, '');
  const { spec } = keeping(dropsResult);
  const { log, kept, stdout, long } = conversationRun(dir, 'ae/k4/1');
  const seen = (await observe(spec, dir)).get('ae/k4/1');
  assert.deepEqual(seen?.closeout?.payload, { outcome: 'done' });
  for (const file of [log, stdout]) {
    assert.equal(fs.readFileSync(file, 'utf8'), CONVERSATION_STREAM, `${path.basename(file)} left whole`);
    assert.equal(fs.statSync(file).mtimeMs, long.getTime());
  }
  assert.equal(JSON.parse(fs.readFileSync(kept, 'utf8')).size, Buffer.byteLength(CONVERSATION_STREAM));
});
