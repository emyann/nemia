/**
 * Bodies: each long text kept once, every entry naming it read back as the event appended, a journal from before them read as
 * written, and a body still named never removed.
 *
 * Told as one story — a long brief kept once by the tasks that share it, read back key for key, and swept once nothing names it —
 * then tables of what keeps no body, of `split`, of a body harmed and of a removal refused; the races between a put and a removal,
 * and a put that fails, stay focused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { Journal, type JournalError, type JournalOps } from './journal.ts';
import { BODY_GRACE_MS, BODY_MIN_BYTES, BodyError, refOf, split, type BodyRefused } from './bodies.ts';
import type { Event } from '../domain.ts';
import { ioCounts } from './tally.ts';
import { scratch } from '../../../test/scratch.ts';
import { story } from '../../../test/checkpoints.ts';
import { TaskId } from '../model.ts';

const root = () => scratch('ae-bodies-');
const run = <A, E>(layer: Layer.Layer<Journal>, e: Effect.Effect<A, E, Journal>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
const failure = <A>(layer: Layer.Layer<Journal>, e: Effect.Effect<A, JournalError | BodyRefused, Journal>) =>
  Effect.runPromise(Effect.flip(e).pipe(Effect.provide(layer)));
const append = (taskId: string, event: Event, parts?: readonly string[]) =>
  Effect.flatMap(Journal, (j) => j.append(TaskId.read(taskId), event, parts));
const read = (taskId: string) => Effect.flatMap(Journal, (j) => j.read(TaskId.read(taskId)));
const feed = (after = 0) => Effect.flatMap(Journal, (j) => j.feed(after));

/** A text of about `bytes` bytes, told apart by `seed`. */
const long = (seed: string, bytes = 4096) => `${seed}\n${'x'.repeat(bytes)}\n`;
const SHARED = `\n## From design\n\n${long('the design', 4096)}`;
const SCHEMA = {
  type: 'object',
  required: ['outcome'],
  properties: { outcome: { enum: ['done', 'blocked'] }, notes: { type: 'string', description: long('notes', 1200) } },
};
const CLAUDE = { settings: '/s.json', pluginDir: ['/p'], appendSystemPromptFile: '/a.md', remoteControl: 'name' };

const filed = (brief: string, extra: Partial<Extract<Event, { kind: 'filed' }>> = {}): Event => ({
  kind: 'filed',
  at: '2026-10-05T00:00:00Z',
  brief,
  cwd: '/r',
  config: { model: 'opus', claude: CLAUDE },
  closeoutSchema: SCHEMA,
  queued: false,
  ...extra,
});
const BRIEF_PARTS = [`# Task\n\n${long('the ask', 2000)}`, SHARED, '\n## When you are finished\n\nSay so.\n'];
const BRIEF = BRIEF_PARTS.join('');
const NUDGE = long('the answer', 1500);
const EVENTS: Event[] = [
  filed(BRIEF),
  { kind: 'starting', at: '2026-10-05T00:00:01Z', attempt: 1, nudge: NUDGE },
  { kind: 'input', at: '2026-10-05T00:00:02Z', text: NUDGE, config: { model: 'haiku' } },
  { kind: 'starting', at: '2026-10-05T00:00:03Z', attempt: 2, nudge: 'short' },
];

const lines = (dir: string, taskId: string) =>
  fs
    .readFileSync(path.join(dir, 'tasks', `${taskId}.jsonl`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

/** Asserts `words` holds each of `names`: what a person needs to find the body and the fix. */
const naming = (words: string, ...names: string[]) => {
  for (const name of names) assert.ok(words.includes(name), `${JSON.stringify(name)} in: ${words}`);
};

/** Sets the time of the body of `text` under `dir` to `ms` ago. */
const age = (dir: string, text: string, ms: number) => {
  const when = new Date(Date.now() - ms);
  fs.utimesSync(path.join(dir, 'bodies', refOf(text)), when, when);
};
const sweep = (yes: boolean) => Effect.flatMap(Journal, (j) => j.sweep({ yes }));
const removeBody = (ref: string) => Effect.flatMap(Journal, (j) => j.removeBody(ref));

/** Takes task `taskId`'s journal and its feed entries out of the store under `dir`, as if its line never reached them. */
const forget = (dir: string, taskId: string) => {
  fs.rmSync(path.join(dir, 'tasks', `${taskId}.jsonl`));
  const feedFile = path.join(dir, 'feed.jsonl');
  const kept = fs
    .readFileSync(feedFile, 'utf8')
    .split('\n')
    .filter((line) => line && !line.includes(`"taskId":"${taskId}"`));
  fs.writeFileSync(feedFile, kept.map((line) => `${line}\n`).join(''));
};

test('a long brief is kept once by the tasks that share it, read back key for key, and swept once nothing names it', async (t) => {
  const s = story(t);
  const dir = root();
  const layer = Journal.files(dir);
  const bodies = () => fs.readdirSync(path.join(dir, 'bodies')).sort();
  const ref = refOf(SHARED);
  const schemaRef = refOf(JSON.stringify(SCHEMA));
  const other = [`# Another task\n\n${long('another ask', 1500)}`, SHARED, long('a young orphan')];
  const [orphan, , young] = other;

  await s.test(
    'a brief whose parts a second task shares keeps that part once: the second journal grows by its reference alone',
    async () => {
      await run(layer, append('t1', filed(BRIEF), BRIEF_PARTS));
      assert.deepEqual(
        bodies(),
        [refOf(BRIEF_PARTS[0]), ref, schemaRef].sort(),
        'the parts of a length, and the schema; the short part stays',
      );
      const feedBefore = fs.statSync(path.join(dir, 'feed.jsonl')).size;
      await run(layer, append('t2', filed(other.join('')), other));

      assert.deepEqual(lines(dir, 't1')[0].briefParts, [{ body: refOf(BRIEF_PARTS[0]) }, { body: ref }, BRIEF_PARTS[2]]);
      assert.deepEqual(lines(dir, 't2')[0].briefParts, [{ body: refOf(orphan) }, { body: ref }, { body: refOf(young) }]);
      assert.deepEqual(
        bodies(),
        [refOf(BRIEF_PARTS[0]), ref, schemaRef, refOf(orphan), refOf(young)].sort(),
        'the second task added only its own parts',
      );
      assert.equal(fs.readFileSync(path.join(dir, 'bodies', ref), 'utf8'), SHARED);
      assert.ok(!fs.readFileSync(path.join(dir, 'tasks', 't2.jsonl'), 'utf8').includes('the design'), 'no copy of the shared part');

      const grown = fs.statSync(path.join(dir, 'tasks', 't2.jsonl')).size + fs.statSync(path.join(dir, 'feed.jsonl')).size - feedBefore;
      const copied = Buffer.byteLength(JSON.stringify(filed(other.join(''))));
      assert.ok(grown < copied, `the journal and the feed grew by ${grown} bytes, where a copy in each is ${copied} twice`);
    },
  );

  await s.test('a schema an end is held to, filed again by another task, is one body both name', async () => {
    const before = bodies();
    await run(layer, append('t3', filed('a')));
    for (const id of ['t1', 't2', 't3']) assert.equal(lines(dir, id)[0].closeoutSchemaBody, schemaRef, id);
    assert.deepEqual(bodies(), before, 'no body more');
    assert.deepEqual(
      Object.keys(lines(dir, 't3')[0]),
      ['kind', 'at', 'brief', 'cwd', 'config', 'closeoutSchemaBody', 'queued'],
      'in its place',
    );
  });

  await s.test('a cold read of a task that names a body counts the body read; a second read reads nothing', async () => {
    const reading = Effect.flatMap(Journal, (j) =>
      Effect.gen(function* () {
        const before = ioCounts();
        yield* j.read(TaskId.read('t1'));
        const between = ioCounts();
        yield* j.read(TaskId.read('t1'));
        return [between.reads - before.reads, ioCounts().reads - between.reads];
      }),
    );
    const [cold, warm] = await run(Journal.files(dir), reading);
    assert.equal(cold, 1 + 3, 'the journal and its three bodies: two parts and the schema');
    assert.equal(warm, 0);
  });

  await s.test('a nudge that repeats the answer beside it is one body, named by both lines', async () => {
    await run(
      layer,
      Effect.forEach(EVENTS.slice(1), (event) => append('t1', event), { discard: true }),
    );
    const [, starting, input, short] = lines(dir, 't1');
    assert.equal(starting.nudgeBody, refOf(NUDGE));
    assert.equal(input.textBody, refOf(NUDGE));
    assert.ok(!('nudge' in starting) && !('text' in input));
    assert.equal(short.nudge, 'short', 'a text under the size stays in its line');
    assert.equal(bodies().filter((r) => r === refOf(NUDGE)).length, 1);
  });

  await s.test('every event read back is the event appended, key for key under JSON, from the journal and the feed alike', async () => {
    const fresh = Journal.files(dir);
    const events = await run(fresh, read('t1'));
    assert.equal(JSON.stringify(events), JSON.stringify(EVENTS), 'read');
    const { entries } = await run(fresh, feed());
    assert.equal(JSON.stringify(entries.filter((e) => e.taskId === 't1').map((e) => e.event)), JSON.stringify(EVENTS), 'feed');
    assert.equal(JSON.stringify(entries.find((e) => e.taskId === 't2')?.event), JSON.stringify(filed(other.join(''))), 'the other task');
    assert.deepEqual(Object.keys((events[0] as { config: { claude: object } }).config.claude), Object.keys(CLAUDE), 'flag order');
  });

  await s.test('removing a body a journal names is refused, naming the task, and the body stays', async () => {
    forget(dir, 't2');
    forget(dir, 't3');
    for (const text of [orphan, SHARED]) age(dir, text, BODY_GRACE_MS + 60_000);
    const error = await failure(layer, removeBody(ref));
    assert.equal(error._tag, 'BodyRefused');
    naming(error.message, ref, "task t1's journal");
    assert.ok(fs.existsSync(path.join(dir, 'bodies', ref)));
  });

  await s.test('a body put within the grace is not removed, and the refusal says when it may be', async () => {
    const error = await failure(layer, removeBody(refOf(young)));
    assert.equal(error._tag, 'BodyRefused');
    naming(error.message, `Body ${refOf(young)} was put at `, 'within the grace', 'remove it after ');
    assert.ok(fs.existsSync(path.join(dir, 'bodies', refOf(young))));
  });

  await s.test(
    'sweep removes only a body nothing names put before the grace: a young one and a named old one are kept, and without yes nothing goes',
    async () => {
      const all = bodies();
      const dry = await run(layer, sweep(false));
      assert.deepEqual(dry, { removable: 1, bytes: Buffer.byteLength(orphan), kept: all.length - 1, removed: 0, removedBytes: 0 });
      assert.deepEqual(bodies(), all, 'a dry run removes nothing');

      const done = await run(layer, sweep(true));
      assert.deepEqual(done, { ...dry, removed: 1, removedBytes: dry.bytes });
      assert.deepEqual(
        bodies(),
        all.filter((r) => r !== refOf(orphan)),
        'the old orphan went; the young one and every named one stayed',
      );
      assert.equal(JSON.stringify(await run(Journal.files(dir), read('t1'))), JSON.stringify(EVENTS), 'and every named one still reads');
    },
  );

  await s.test('once no journal and no feed entry names a body past the grace, removing it goes through', async () => {
    fs.rmSync(path.join(dir, 'tasks', 't1.jsonl'));
    const byFeed = await failure(layer, removeBody(ref));
    assert.equal(byFeed._tag, 'BodyRefused');
    naming(byFeed.message, ref, "the feed's entry for task t1");
    assert.ok(fs.existsSync(path.join(dir, 'bodies', ref)));

    fs.rmSync(path.join(dir, 'feed.jsonl'));
    await run(layer, removeBody(ref));
    assert.ok(!fs.existsSync(path.join(dir, 'bodies', ref)));
  });
});

/** A journal as a runtime before bodies wrote it: every text in its line, and the former shapes `upgrade` reads. */
const OLD = [
  {
    kind: 'filed',
    at: '2026-09-01T00:00:00Z',
    brief: BRIEF,
    cwd: '/r',
    budgetUsd: 2,
    model: 'opus',
    remoteControl: true,
    closeoutSchema: SCHEMA,
  },
  { kind: 'starting', at: '2026-09-01T00:00:01Z', attempt: 1, nudge: NUDGE },
  { kind: 'input', at: '2026-09-01T00:00:02Z', text: NUDGE, budgetUsd: 1 },
];
/** What a runtime before bodies read `OLD` as, pinned. */
const OLD_READ = [
  {
    kind: 'filed',
    at: '2026-09-01T00:00:00Z',
    brief: BRIEF,
    cwd: '/r',
    closeoutSchema: SCHEMA,
    config: { model: 'opus', budgetUsd: 2, claude: { remoteControl: true } },
  },
  { kind: 'starting', at: '2026-09-01T00:00:01Z', attempt: 1, nudge: NUDGE },
  { kind: 'input', at: '2026-09-01T00:00:02Z', text: NUDGE, config: { budgetUsd: 1 } },
];

/** Appends `EVENTS` to `t1` through `layer`, the brief in its parts. */
const appendAll = (layer: Layer.Layer<Journal>) =>
  run(
    layer,
    Effect.forEach(EVENTS, (event, i) => append('t1', event, i === 0 ? BRIEF_PARTS : undefined), { discard: true }),
  );
const NO_SWEEP = { removable: 0, bytes: 0, kept: 0, removed: 0, removedBytes: 0 };

test('a store with bodies in memory, one with none, and a journal from before them each read back the event appended', async (t) => {
  await t.test(
    'the memory store reads back every event appended, key for key under JSON, from the journal and the feed alike',
    async () => {
      const layer = Journal.test();
      await appendAll(layer);
      const events = await run(layer, read('t1'));
      assert.equal(JSON.stringify(events), JSON.stringify(EVENTS), 'read');
      const { entries } = await run(layer, feed());
      assert.equal(JSON.stringify(entries.map((e) => e.event)), JSON.stringify(EVENTS), 'feed');
      assert.deepEqual(Object.keys((events[0] as { config: { claude: object } }).config.claude), Object.keys(CLAUDE), 'flag order');
    },
  );

  await t.test('the memory store without bodies appends each event whole, and its sweep finds nothing', async () => {
    const layer = Journal.test({ bodies: false });
    await appendAll(layer);
    assert.equal(JSON.stringify(await run(layer, read('t1'))), JSON.stringify(EVENTS));
    assert.deepEqual(await run(layer, sweep(true)), NO_SWEEP);
  });

  await t.test("an implementor's own store that keeps no bodies is handed each event whole, no reference in them", async () => {
    const kept: unknown[] = [];
    const own: JournalOps = {
      append: (_taskId, event) => Effect.sync(() => void kept.push(event)),
      read: () => Effect.succeed(kept as Event[]),
      list: Effect.succeed(['t1']),
      feed: () => Effect.succeed({ entries: [], cursor: 0 }),
    };
    const layer = Journal.layer(own);
    await appendAll(layer);
    assert.equal(JSON.stringify(await run(layer, read('t1'))), JSON.stringify(EVENTS));
    assert.deepEqual(await run(layer, sweep(true)), NO_SWEEP);
    assert.equal(JSON.stringify(kept), JSON.stringify(EVENTS), 'whole, no reference in them');
  });

  await t.test(
    'a journal from before bodies reads as it read, beside a task filed with them, in the order of the feed, and no byte on disk changes',
    async () => {
      const dir = root();
      fs.mkdirSync(path.join(dir, 'tasks'));
      fs.writeFileSync(path.join(dir, 'tasks', 't-old.jsonl'), OLD.map((l) => JSON.stringify(l) + '\n').join(''));
      fs.writeFileSync(path.join(dir, 'feed.jsonl'), OLD.map((event) => JSON.stringify({ taskId: 't-old', event }) + '\n').join(''));
      const before = fs.readFileSync(path.join(dir, 'tasks', 't-old.jsonl'), 'utf8');
      const layer = Journal.files(dir);
      await run(layer, append('t-new', EVENTS[0], BRIEF_PARTS));

      assert.equal(JSON.stringify(await run(layer, read('t-old'))), JSON.stringify(OLD_READ));
      const { entries } = await run(layer, feed());
      assert.deepEqual(
        entries.map((e) => e.taskId),
        ['t-old', 't-old', 't-old', 't-new'],
      );
      assert.equal(JSON.stringify(entries.map((e) => e.event)), JSON.stringify([...OLD_READ, EVENTS[0]]));
      assert.equal(fs.readFileSync(path.join(dir, 'tasks', 't-old.jsonl'), 'utf8'), before);
    },
  );
});

test('split: a text under the size, or no well-formed UTF-16, stays in its line; one at the size is a body; parts that do not join are one', async (t) => {
  await t.test('a text under the size stays in its line', () => {
    const text = 'y'.repeat(BODY_MIN_BYTES - 1);
    const { entry, bodies } = split({ kind: 'input', at: 'now', text });
    assert.deepEqual([entry, bodies.size], [{ kind: 'input', at: 'now', text }, 0]);
  });

  await t.test('a text that is no well-formed UTF-16 stays in its line', () => {
    const text = `${'z'.repeat(BODY_MIN_BYTES)}${String.fromCharCode(0xd800)}`;
    const { entry, bodies } = split({ kind: 'input', at: 'now', text });
    assert.deepEqual([entry, bodies.size], [{ kind: 'input', at: 'now', text }, 0]);
  });

  await t.test('a text at the size is a body', () => {
    const at = { kind: 'input', at: 'now', text: 'y'.repeat(BODY_MIN_BYTES) } as const;
    assert.deepEqual(split(at).entry, { kind: 'input', at: 'now', textBody: refOf(at.text) });
  });

  await t.test("parts that do not join into the brief are not the brief's: it is kept as one part", () => {
    const { entry } = split(filed(BRIEF, { closeoutSchema: undefined }), ['not', 'it']);
    assert.deepEqual((entry as { briefParts: unknown }).briefParts, [{ body: refOf(BRIEF) }]);
  });
});

test("a body missing or altered fails its task's read naming the body's file and saying to restore it, and its feed entry is skipped and said, the cursor past it", async (t) => {
  for (const harm of ['missing', 'altered'] as const)
    await t.test(`a body ${harm}`, async () => {
      const dir = root();
      const layer = Journal.files(dir);
      await run(layer, Effect.all([append('t1', EVENTS[0], BRIEF_PARTS), append('t2', filed('fine', { closeoutSchema: undefined }))]));
      const file = path.join(dir, 'bodies', refOf(SHARED));
      if (harm === 'missing') fs.rmSync(file);
      else fs.writeFileSync(file, SHARED.replace('the design', 'another design'));

      const fresh = Journal.files(dir);
      const error = await failure(fresh, read('t1'));
      assert.deepEqual([error._tag, (error as JournalError).taskId], ['JournalError', 't1']);
      naming(error.message, `t1's journal (${path.join(dir, 'tasks', 't1.jsonl')}), entry 1, names body ${refOf(SHARED)} (${file})`);
      assert.ok(error.message.endsWith('restore it from a backup of the store.'), error.message);

      const { entries, refused, cursor } = await run(fresh, feed());
      assert.deepEqual(
        entries.map((e) => e.taskId),
        ['t2'],
      );
      assert.equal(refused?.length, 1);
      assert.equal(refused[0].taskId, 't1');
      assert.ok(refused[0].why.includes(file), refused[0].why);
      assert.equal(cursor, fs.statSync(path.join(dir, 'feed.jsonl')).size);
    });
});

test('removeBody: what is no body, or a store that keeps none, is refused, saying so', async (t) => {
  await t.test('a reference that is no sha256', async () => {
    const error = await failure(Journal.files(root()), removeBody('nope'));
    assert.equal(error._tag, 'BodyRefused');
    naming(error.message, '"nope"', 'sha256', '64 lowercase hex digits');
  });

  await t.test('a body this store does not have', async () => {
    const error = await failure(Journal.files(root()), removeBody(refOf('x')));
    assert.equal(error._tag, 'BodyRefused');
    naming(error.message, `no body ${refOf('x')} in this store`);
  });

  await t.test('a store that keeps no bodies', async () => {
    const error = await failure(Journal.test({ bodies: false }), removeBody(refOf('x')));
    assert.equal(error._tag, 'BodyRefused');
    naming(error.message, 'keeps no bodies', refOf('x'));
  });
});

test('a body put again past the grace, its line not yet in a journal, is put anew: sweep keeps it', async () => {
  const dir = root();
  const layer = Journal.files(dir);
  const orphan = long('an orphan');
  const event = filed(orphan, { closeoutSchema: undefined });
  await run(layer, append('t2', event, [orphan]));
  forget(dir, 't2');
  age(dir, orphan, BODY_GRACE_MS + 60_000);
  await run(layer, append('t3', event, [orphan]));
  forget(dir, 't3');

  const done = await run(layer, sweep(true));
  assert.deepEqual(done, { removable: 0, bytes: 0, kept: 1, removed: 0, removedBytes: 0 });
  assert.ok(fs.existsSync(path.join(dir, 'bodies', refOf(orphan))), 'the body a filing in flight put again stays');
});

test('a body put again between the listing and its removal stays: removeBody refuses, saying so, and sweep counts it kept', async () => {
  const dir = root();
  const orphan = long('an orphan');
  await run(Journal.files(dir), append('t2', filed(orphan, { closeoutSchema: undefined }), [orphan]));
  forget(dir, 't2');
  age(dir, orphan, BODY_GRACE_MS + 60_000);
  const ops = Journal.filesOps(dir);
  const racing = Journal.layer({
    ...ops,
    bodies: { ...ops.bodies, list: Effect.tap(ops.bodies.list, () => ops.bodies.put(refOf(orphan), orphan)) },
  });
  const file = path.join(dir, 'bodies', refOf(orphan));

  const error = await failure(racing, removeBody(refOf(orphan)));
  assert.equal(error._tag, 'BodyRefused');
  naming(error.message, refOf(orphan), 'put again while it was being removed', 'after the grace');
  assert.ok(fs.existsSync(file));

  age(dir, orphan, BODY_GRACE_MS + 60_000);
  const done = await run(racing, sweep(true));
  assert.deepEqual(done, { removable: 1, bytes: Buffer.byteLength(orphan), kept: 1, removed: 0, removedBytes: 0 });
  assert.ok(fs.existsSync(file));
});

test('a body that fails to be put fails the append, and no line is written: the journal and the feed hold nothing new', async () => {
  const dir = root();
  const ops = Journal.filesOps(dir);
  const full = Journal.layer({
    ...ops,
    bodies: { ...ops.bodies, put: () => Effect.fail(new BodyError({ message: 'no space left on device' })) },
  });

  const error = await failure(full, append('t1', EVENTS[0], BRIEF_PARTS));
  assert.equal(error.message, 'no space left on device');
  const fresh = Journal.files(dir);
  assert.deepEqual(await run(fresh, read('t1')), []);
  assert.deepEqual((await run(fresh, feed())).entries, []);
});
