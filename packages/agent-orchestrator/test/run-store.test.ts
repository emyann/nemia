/**
 * The run store's interface (`RunStore`, `src/record/record.ts`), held to what its files implementation (`filesStore`) answers: a record
 * made, read with a person's files composed onto it, written back with none of them and no byte moved, refused once it is gone; whether a
 * run is there and whether a person called it off; the stamps a pass compares, and the asks it reads, consumes and answers from; a hold
 * lifted only as it was read; and the tick asking it, before each filing, whether a person called the run off since (`mayFileOf`). And a
 * person's writes: an ask of each kind at its name, never over a file there, a hold put once and standing while its file does, a
 * cancellation kept as first written, a prune marker put and taken back, and a run forgotten file by file. And the inbox: its entries, a
 * card filed exclusively, rewritten keeping its filing time, dropped, and the tick's tries put, read and dropped. And what `nemia rm`,
 * `nemia prune --artifacts` and `nemia start <path>` read of it: every run's id read or not, a run's files directory found and dropped,
 * and the card a path names.
 *
 * And the refusal that keeps the interface the one way in: a file of `src` but the store's own that imports a run's or a person's file
 * functions from `record.store.ts`, or through `runner.ts`, is refused. `WF_ROOT` is set before the store is imported, since it is read as
 * the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../src/run.ts';
import type { PersonAsk } from '../src/record/record.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-run-store-');
process.env.WF_ROOT = ROOT;
const { filesStore } = await import('../src/record/files.store.ts');
const { mayFileOf } = await import('../src/tick/advance.verb.ts');
const { resumePause, putPause } = await import('../src/pause/pause.store.ts');
const {
  acceptFile,
  acceptanceIn,
  approvalFile,
  approvalIn,
  askFile,
  askIn,
  asksDir,
  holdFile,
  markCancelled,
  pruneFile,
  roundAskFile,
  roundAskIn,
  runFile,
  runsDir,
  writeAsk,
  writeHold,
} = await import('../src/record/record.store.ts');

const PKG = path.join(import.meta.dirname, '..');
const at = '2026-09-30T09:00:00.000Z';

/** A repository run's record as the tick writes one today, frozen steps and all. */
const aRun = (id: string): Run => ({
  id,
  repo: '/repo',
  workspace: '/repo',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/repo/workflows/dev',
  workflow: [
    { name: 'implement', after: [], body: 'do it', harness: 'claude' },
    { name: 'review', after: ['implement'], body: 'read it', harness: 'claude' },
  ],
  steps: { implement: { taskId: `${id}-implement`, workspace: '/w/implement', branch: `wf/${id}/implement` }, review: { taskId: null } },
  createdAt: '2026-09-01T00:00:00.000Z',
});

/** A run made in the store under `id`. */
const made = (id: string): Run => {
  const run = aRun(id);
  filesStore.runs.create(run);
  return run;
};

/** A prune marker, as `nemia prune` writes one. */
const pruned = (id: string): void => fs.writeFileSync(pruneFile(id), JSON.stringify({ at, worktrees: [] }, null, 2));

test('a run made is read back with the hold, the approval and the cancellation beside it composed onto it', () => {
  const run = made('r-read');
  writeHold(run.id, ['other-run']);
  writeAsk(approvalFile(run.id, 'implement', 1), { step: 'implement', try: 1, at, message: 'yes' });
  const cancelledAt = markCancelled(run.id);
  const read = filesStore.runs.read(run.id);
  assert.equal(read.brief, 'add a flag');
  assert.deepEqual(read.hold?.until, ['other-run']);
  assert.deepEqual(read.approvals, [{ step: 'implement', try: 1, at, message: 'yes' }]);
  assert.equal(read.cancelledAt, cancelledAt);
});

test('a record removed is not written back: rewrite answers false and makes no file', () => {
  const run = made('r-gone');
  fs.rmSync(runFile(run.id));
  assert.equal(filesStore.runs.rewrite(run), false);
  assert.equal(fs.existsSync(runFile(run.id)), false);
  assert.deepEqual(
    fs.readdirSync(runsDir()).filter((name) => name.startsWith(`${run.id}.`)),
    [],
  );
});

test('a record read and written back moves no byte, a key no nemia writes included', () => {
  const id = 'r-bytes';
  const text = JSON.stringify({ ...aRun(id), laterKey: { kept: [1, 2] } }, null, 2);
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(id), text);
  assert.equal(filesStore.runs.rewrite(filesStore.runs.read(id)), true);
  assert.equal(fs.readFileSync(runFile(id), 'utf8'), text);
});

test("a run written back carries none of a person's files composed onto it", () => {
  const run = made('r-one-writer');
  writeHold(run.id, ['other-run']);
  writeAsk(approvalFile(run.id, 'implement', 1), { step: 'implement', try: 1, at });
  writeAsk(acceptFile(run.id, 'review', 1), { step: 'review', try: 1, at, message: 'good enough' });
  pruned(run.id);
  const read = filesStore.runs.read(run.id);
  assert.ok(read.hold && read.approvals && read.acceptances && read.pruned, 'every file is composed onto the run read');
  assert.equal(filesStore.runs.rewrite(read), true);
  const written = JSON.parse(fs.readFileSync(runFile(run.id), 'utf8')) as Record<string, unknown>;
  for (const key of ['hold', 'approvals', 'acceptances', 'pruned'])
    assert.equal(key in written, false, `${key} is written into the record`);
});

test('a plain run is not called off', () => {
  assert.equal(filesStore.runs.calledOff(made('r-plain').id), false);
});

test('a cancelled run is called off', () => {
  const run = made('r-cancelled');
  markCancelled(run.id);
  assert.equal(filesStore.runs.calledOff(run.id), true);
});

test('a held run is called off', () => {
  const run = made('r-held');
  writeHold(run.id, ['other-run']);
  assert.equal(filesStore.runs.calledOff(run.id), true);
});

test('every run is called off while the store is paused, and none once the pause is lifted', () => {
  const run = made('r-paused');
  putPause({ by: 'ann' });
  try {
    assert.equal(filesStore.runs.calledOff(run.id), true);
  } finally {
    resumePause();
  }
  assert.equal(filesStore.runs.calledOff(run.id), false);
});

test("the store's pause is composed onto every run read and listed, and written back into none", () => {
  const run = made('r-pause-read');
  const pause = putPause({ why: 'merging by hand', by: 'ann' });
  try {
    const read = filesStore.runs.read(run.id);
    assert.deepEqual(read.pause, pause);
    assert.deepEqual(filesStore.runs.list().find((r) => r.id === run.id)?.pause, pause);
    assert.deepEqual(
      filesStore.runs.list(undefined, (id) => (id === run.id ? run : undefined)).find((r) => r.id === run.id)?.pause,
      pause,
      'a run the memo kept is read with the pause as it stands',
    );
    assert.equal(filesStore.runs.rewrite(read), true);
    assert.equal('pause' in JSON.parse(fs.readFileSync(runFile(run.id), 'utf8')), false, 'the pause is written into the record');
  } finally {
    resumePause();
  }
  assert.equal('pause' in filesStore.runs.read(run.id), false, 'lifted, no run reads it');
});

test('a pruned run is called off', () => {
  const run = made('r-pruned');
  pruned(run.id);
  assert.equal(filesStore.runs.calledOff(run.id), true);
});

test('a run exists while its record is there, and an id never made does not', () => {
  const run = made('r-exists');
  assert.equal(filesStore.runs.exists(run.id), true);
  fs.rmSync(runFile(run.id));
  assert.equal(filesStore.runs.exists(run.id), false);
  assert.equal(filesStore.runs.exists('r-never-made'), false);
});

test('a record that is not JSON is left out of the list and said, and the other runs are listed', () => {
  made('r-listed');
  fs.writeFileSync(runFile('r-not-json'), '{ not json');
  const said: string[] = [];
  try {
    const ids = filesStore.runs.list((line) => said.push(line)).map((run) => run.id);
    assert.ok(ids.includes('r-listed'));
    assert.equal(ids.includes('r-not-json'), false);
    assert.equal(said.length, 1);
    assert.match(said[0], /r-not-json/);
  } finally {
    fs.rmSync(runFile('r-not-json'));
  }
});

test("an ask moves its run's stamp, is read, is consumed once the record holds its try, and is still answered from", () => {
  const run = made('r-asks');
  const before = filesStore.runs.stamps().get(run.id);
  assert.ok(before);
  assert.equal(writeAsk(askFile(run.id, 'implement', 2), { step: 'implement', try: 2, mode: 'fresh', message: 'try it again', at }), true);
  assert.notEqual(filesStore.runs.stamps().get(run.id), before);
  const { asks, rounds, notes } = filesStore.asks.read(run.id);
  assert.deepEqual(notes, []);
  assert.deepEqual(asks, [{ step: 'implement', try: 2, mode: 'fresh', message: 'try it again', at }]);
  filesStore.asks.consume(run, asks, rounds);
  assert.equal(fs.existsSync(askFile(run.id, 'implement', 2)), true, 'an ask for a try the record does not hold stays');
  const tried = {
    ...run,
    steps: { ...run.steps, implement: { ...run.steps.implement, tries: [{ taskId: `${run.id}-implement`, then: 'fresh' as const }] } },
  };
  filesStore.asks.consume(tried, asks, rounds);
  assert.equal(fs.existsSync(askFile(run.id, 'implement', 2)), false);
  assert.equal(fs.existsSync(path.join(asksDir(run.id), 'done', 'retry-implement-2')), true);
  assert.deepEqual(
    filesStore.asks.answers(run.id).map((a) => a.message),
    ['try it again'],
  );
});

test('a hold is lifted only as it was put: not one put at another time, and the one standing', () => {
  const run = made('r-lift');
  const hold = writeHold(run.id, ['other-run']);
  assert.ok(hold);
  assert.equal(filesStore.holds.lift(run.id, '2020-01-01T00:00:00.000Z'), false);
  assert.equal(fs.existsSync(holdFile(run.id)), true);
  assert.equal(filesStore.holds.lift(run.id, hold.at), true);
  assert.equal(fs.existsSync(holdFile(run.id)), false);
});

test('a pass files for a run until a person holds it, and not again in that pass once the hold is lifted', () => {
  const run = made('r-may-file');
  const mayFile = mayFileOf(run);
  assert.equal(mayFile(), true);
  const hold = writeHold(run.id, ['other-run']);
  assert.ok(hold);
  assert.equal(mayFile(), false);
  assert.equal(filesStore.holds.lift(run.id, hold.at), true);
  assert.equal(mayFile(), false);
  assert.equal(mayFileOf(run)(), true);
});

test('a pass files nothing for a run whose record is gone', () => {
  const run = made('r-may-file-gone');
  fs.rmSync(runFile(run.id));
  assert.equal(mayFileOf(run)(), false);
});

/** One ask of each kind a person writes, with the path the tick reads it at and its reader's words for a file there that is not one. */
const asksOfEachKind = (id: string): Array<{ asked: PersonAsk; file: string; stray: (file: string) => unknown }> => [
  {
    asked: { kind: 'retry', ask: { step: 'implement', try: 2, mode: 'fresh', message: 'again', at } },
    file: askFile(id, 'implement', 2),
    stray: (file) => askIn(file, 'implement', 2),
  },
  {
    asked: { kind: 'round', ask: { step: 'review', round: 3, at } },
    file: roundAskFile(id, 'review', 3),
    stray: (file) => roundAskIn(file, 'review', 3),
  },
  {
    asked: { kind: 'approve', ask: { step: 'implement', try: 1, at, message: 'yes' } },
    file: approvalFile(id, 'implement', 1),
    stray: (file) => approvalIn(file, 'implement', 1),
  },
  {
    asked: { kind: 'accept', ask: { step: 'review', try: 1, at, message: 'good enough' } },
    file: acceptFile(id, 'review', 1),
    stray: (file) => acceptanceIn(file, 'review', 1),
  },
];

test('an ask of each kind is written at the name the tick reads it by, holding the ask alone, and answered where it is', () => {
  const run = made('r-write-asks');
  for (const { asked, file } of asksOfEachKind(run.id)) {
    const n = asked.kind === 'round' ? asked.ask.round : asked.kind === 'merge' ? asked.ask.merge.try : asked.ask.try;
    assert.equal(filesStore.asks.where(run.id, { kind: asked.kind, step: asked.ask.step, n }), file);
    assert.deepEqual(filesStore.asks.write(run.id, asked), { written: true, where: file });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), asked.ask, `${asked.kind} is written as the ask alone`);
  }
  const read = filesStore.asks.read(run.id);
  assert.equal(read.asks.length, 1);
  assert.equal(read.rounds.length, 1);
  assert.deepEqual(read.notes, []);
});

test('a merge ask is written at its target and try, holding its loop, round, base and commit, and read back as a round ask of its loop', () => {
  const run = made('r-write-merge');
  const merge = { target: 'implement', try: 3, onto: 'main', sha: 'a'.repeat(40) };
  const file = filesStore.asks.where(run.id, { kind: 'merge', step: 'implement', n: 3 });
  assert.match(file, /merge-implement-3$/);
  assert.deepEqual(filesStore.asks.write(run.id, { kind: 'merge', ask: { step: 'review', round: 2, at, merge } }), {
    written: true,
    where: file,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { loop: 'review', round: 2, onto: 'main', sha: 'a'.repeat(40), at });
  assert.deepEqual(filesStore.asks.read(run.id).rounds, [{ step: 'review', round: 2, at, merge }]);
});

test('an ask written over one already there is refused as no stray, and the first stays byte for byte', () => {
  const run = made('r-write-twice');
  for (const { asked, file } of asksOfEachKind(run.id)) {
    filesStore.asks.write(run.id, asked);
    const first = fs.readFileSync(file, 'utf8');
    const again = { ...asked, ask: { ...asked.ask, at: '2026-10-01T00:00:00.000Z' } } as PersonAsk;
    assert.deepEqual(filesStore.asks.write(run.id, again), { written: false, where: file, stray: null });
    assert.equal(fs.readFileSync(file, 'utf8'), first);
  }
});

test("an ask written where a file that is not one stands is refused with the tick's words for it", () => {
  const run = made('r-write-stray');
  for (const { asked, file, stray } of asksOfEachKind(run.id)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'not json');
    const words = stray(file);
    assert.equal(typeof words, 'string');
    assert.deepEqual(filesStore.asks.write(run.id, asked), { written: false, where: file, stray: words });
  }
});

test('a hold is put once: a second put answers null and the first stands', () => {
  const run = made('r-put');
  const hold = filesStore.holds.put(run.id, ['other-run'], { why: 'wait for it', by: 'ann' });
  assert.ok(hold);
  assert.deepEqual(hold.until, ['other-run']);
  assert.equal(filesStore.holds.put(run.id, ['third-run'], {}), null);
  assert.deepEqual(filesStore.runs.read(run.id).hold, hold);
});

test('a hold file stands while it is there, read as a hold or not, and not once it is gone', () => {
  const run = made('r-stands');
  assert.equal(filesStore.holds.stands(run.id), false);
  fs.writeFileSync(holdFile(run.id), 'not json');
  assert.equal(filesStore.holds.stands(run.id), true);
  fs.rmSync(holdFile(run.id));
  assert.equal(filesStore.holds.stands(run.id), false);
});

test('a run cancelled twice keeps the first time, and is read with it', () => {
  const run = made('r-cancel');
  const first = filesStore.runs.cancel(run.id);
  assert.equal(filesStore.runs.cancel(run.id), first);
  assert.equal(filesStore.runs.read(run.id).cancelledAt, first);
});

test('a prune marker put is read back and calls the run off, and taken back it does neither', () => {
  const run = made('r-prune');
  const marker = { at, worktrees: [{ path: '/w/implement', bytes: 12 }], artifacts: { at, bytes: 3 } };
  filesStore.runs.prune(run.id, marker);
  assert.deepEqual(filesStore.runs.read(run.id).pruned, marker);
  assert.deepEqual(filesStore.runs.pruned(run.id), marker, 'and by its own reader, which reads no record');
  assert.equal(filesStore.runs.calledOff(run.id), true);
  filesStore.runs.prune(run.id, undefined);
  assert.equal(filesStore.runs.read(run.id).pruned, undefined);
  assert.equal(filesStore.runs.pruned(run.id), undefined);
  assert.equal(filesStore.runs.calledOff(run.id), false);
});

test("a run forgotten loses its record and every person's file and its directory, in order, and another run keeps its own", () => {
  const run = made('r-forget');
  const other = made('r-forget-other');
  for (const id of [run.id, other.id]) {
    filesStore.runs.cancel(id);
    pruned(id);
    filesStore.holds.put(id, ['x'], {});
    filesStore.asks.write(id, { kind: 'approve', ask: { step: 'implement', try: 1, at } });
    fs.mkdirSync(path.join(runsDir(), id, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(runsDir(), id, 'artifacts', 'x'), 'x');
  }
  assert.deepEqual(filesStore.runs.forget(run.id), [
    `runs/${run.id}.json`,
    `runs/${run.id}.cancelled`,
    `runs/${run.id}.pruned`,
    `runs/${run.id}.hold`,
    `runs/${run.id}.asks/`,
    `runs/${run.id}/`,
  ]);
  assert.deepEqual(
    fs.readdirSync(runsDir()).filter((name) => name === run.id || name.startsWith(`${run.id}.`)),
    [],
  );
  assert.equal(filesStore.runs.exists(other.id), true);
  const kept = filesStore.runs.read(other.id);
  assert.ok(kept.cancelledAt && kept.pruned && kept.hold && kept.approvals);
  assert.equal(fs.existsSync(path.join(runsDir(), other.id, 'artifacts', 'x')), true);
  assert.deepEqual(filesStore.runs.forget(run.id), []);
});

test("the inbox's entries are a folder by its name and a trailing slash, a markdown file with its text, any other file with none; and none with no inbox", () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'inbox')), false);
  assert.deepEqual(filesStore.inbox.entries(), []);
  fs.mkdirSync(path.join(ROOT, 'inbox', 'a-folder'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'inbox', 'an-idea.md'), 'an idea\n');
  fs.writeFileSync(path.join(ROOT, 'inbox', 'notes.txt'), 'not a card');
  try {
    assert.deepEqual(
      filesStore.inbox.entries().sort((a, b) => a.file.localeCompare(b.file)),
      [
        { file: 'a-folder/', text: '' },
        { file: 'an-idea.md', text: 'an idea\n' },
        { file: 'notes.txt', text: '' },
      ],
    );
  } finally {
    fs.rmSync(path.join(ROOT, 'inbox'), { recursive: true });
  }
});

test('a card is read by its file, and a file not there reads as null', () => {
  assert.equal(filesStore.inbox.add('c-read.md', 'read me\n'), true);
  assert.equal(filesStore.inbox.read('c-read.md'), 'read me\n');
  assert.equal(filesStore.inbox.read('c-never-filed.md'), null);
});

test('a card that is there and cannot be read is not read as gone: reading it throws', () => {
  fs.mkdirSync(path.join(ROOT, 'inbox', 'c-folder.md'), { recursive: true });
  assert.throws(
    () => filesStore.inbox.read('c-folder.md'),
    (err: NodeJS.ErrnoException) => err.code === 'EISDIR',
  );
});

test('a card filed is written exclusively: a second filing at its name answers false and the first stays byte for byte', () => {
  assert.equal(filesStore.inbox.add('c-twice.md', 'first\n'), true);
  assert.equal(filesStore.inbox.add('c-twice.md', 'second\n'), false);
  assert.equal(fs.readFileSync(path.join(ROOT, 'inbox', 'c-twice.md'), 'utf8'), 'first\n');
});

test('a card rewritten is written whole, keeps the time it was filed, and leaves no hidden file', () => {
  const file = path.join(ROOT, 'inbox', 'c-rewrite.md');
  assert.equal(filesStore.inbox.add('c-rewrite.md', 'before\n'), true);
  const filed = new Date('2026-01-02T03:04:05.000Z');
  fs.utimesSync(file, filed, filed);
  filesStore.inbox.rewrite('c-rewrite.md', 'after\n');
  assert.equal(fs.readFileSync(file, 'utf8'), 'after\n');
  assert.equal(filesStore.inbox.filedAt('c-rewrite.md'), filed.toISOString());
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'inbox')).filter((name) => name.startsWith('.')),
    [],
  );
});

test('a card dropped is gone, and dropped again answers false', () => {
  assert.equal(filesStore.inbox.add('c-drop.md', 'drop me\n'), true);
  assert.equal(typeof filesStore.inbox.filedAt('c-drop.md'), 'string');
  assert.equal(filesStore.inbox.drop('c-drop.md'), true);
  assert.equal(filesStore.inbox.filedAt('c-drop.md'), null);
  assert.equal(filesStore.inbox.drop('c-drop.md'), false);
});

test('a card that is there and cannot be removed is not dropped as gone: dropping it throws, and it stays', () => {
  const at = path.join(ROOT, 'inbox', 'c-stuck.md');
  fs.mkdirSync(at, { recursive: true });
  assert.throws(() => filesStore.inbox.drop('c-stuck.md'));
  assert.equal(fs.existsSync(at), true);
});

test('a card is found where a person reads it', () => {
  assert.equal(filesStore.inbox.where('x.md'), path.join(ROOT, 'inbox', 'x.md'));
});

test("a try put is read back by its card's name, a file that does not read as a try is none, and a try dropped is gone", () => {
  const queue = path.join(ROOT, 'queue');
  const tried = { at, text: 'the card\n', repo: '/repo', why: 'the workflow is gone', refused: true };
  filesStore.inbox.putTry('t-put', tried);
  assert.equal(fs.readFileSync(path.join(queue, 't-put.json'), 'utf8'), JSON.stringify(tried, null, 2));
  fs.writeFileSync(path.join(queue, 't-torn.json'), '{ "at": ');
  fs.writeFileSync(path.join(queue, 't-shape.json'), JSON.stringify({ at, text: 'x' }));
  assert.deepEqual([...filesStore.inbox.tries()], [['t-put', tried]]);
  filesStore.inbox.dropTry('t-put');
  filesStore.inbox.dropTry('t-never-put');
  assert.deepEqual([...filesStore.inbox.tries()], []);
  assert.equal(fs.existsSync(path.join(queue, 't-put.json')), false);
});

/** The functions of `record.store.ts` that read or write a run's record or a person's files beside it: `runStore` says each. */
const GUARDED = [
  'readRun',
  'listRuns',
  'writeRun',
  'rewriteRun',
  'restStamps',
  'readAsks',
  'readAnswers',
  'consumeAsks',
  'removeHold',
  'markCancelled',
  'writeHold',
  'writeAsk',
  'runFile',
  'cancelFile',
  'holdFile',
  'pruneFile',
  'readPruned',
];

/** The files the interface is built from, which alone may import them for good. */
const OWN = ['src/record/record.store.ts', 'src/record/files.store.ts'];

/** `record.store.ts`, and `runner.ts`, which re-exports some of its functions. */
const STORE_MODULE = /(?:^|\/)(?:record\.store|runner)(?:\.ts)?$/;

/** The module a store import names, as a refusal says it: `record.store.ts` or `runner.ts`. */
const moduleOf = (spec: string): string => (/(?:^|\/)runner(?:\.ts)?$/.test(spec) ? 'runner.ts' : 'record.store.ts');

/**
 * The guarded functions a source text imports or re-exports from `record.store.ts` or through `runner.ts`, by name across line breaks,
 * each by the module it came from; `*` for a namespace or a dynamic import of either, which reaches every one.
 */
function importsFrom(text: string): Map<string, string[]> {
  const found = new Map<string, Set<string>>();
  const add = (spec: string, name: string): void => {
    const from = moduleOf(spec);
    found.set(from, (found.get(from) ?? new Set()).add(name));
  };
  for (const m of text.matchAll(/\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!STORE_MODULE.test(m[2])) continue;
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (GUARDED.includes(name)) add(m[2], name);
    }
  }
  for (const m of text.matchAll(/\bimport\s*\*\s*as\s+\w+\s+from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    if (STORE_MODULE.test(m[1] ?? m[2])) add(m[1] ?? m[2], '*');
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)).map(([from, names]) => [from, [...names].sort()]));
}

/** The guarded functions a source text imports, whichever module they came from (`importsFrom`). */
const directImports = (text: string): string[] => [...new Set([...importsFrom(text).values()].flat())].sort();

/** A line for each file among `sources` that imports a guarded function directly, naming the module each import came from. */
function refusals(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const [from, names] of importsFrom(text))
      out.push(
        `${file} imports ${names.join(', ')} from ${from}: read and write through runStore (src/record/files.store.ts), adding ` +
          'the method to RunStore (src/record/record.ts)',
      );
  }
  return out;
}

/** Every file of `src` but the tests beside the code and the interface's own, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

test("every run id with a record file is listed, read or not, and none from a person's file alone", () => {
  const listed = (): string[] => filesStore.runs.ids().filter((id) => id.startsWith('r-ids-'));
  made('r-ids-read');
  fs.writeFileSync(runFile('r-ids-torn'), '{ "id": ');
  markCancelled('r-ids-cancelled');
  filesStore.holds.put('r-ids-held', ['x'], {});
  fs.mkdirSync(asksDir('r-ids-asked'), { recursive: true });
  assert.deepEqual(listed(), ['r-ids-read', 'r-ids-torn']);
  assert.ok(!filesStore.runs.list(() => {}).some((run) => run.id === 'r-ids-torn'), 'where list leaves the torn record out');
});

test('no run id is listed with no runs folder', () => {
  const away = path.join(scratch('wf-run-store-ids-'), 'runs');
  fs.renameSync(runsDir(), away);
  try {
    assert.deepEqual(filesStore.runs.ids(), []);
  } finally {
    fs.renameSync(away, runsDir());
  }
});

test("a run's files directory is found while it is a directory, and not when it is absent or a link to one", () => {
  const files = (id: string): string => path.join(runsDir(), id, 'artifacts');
  fs.mkdirSync(files('r-files-there'), { recursive: true });
  assert.equal(filesStore.runs.filesAt('r-files-there'), files('r-files-there'));
  assert.equal(filesStore.runs.filesAt('r-files-never'), undefined);
  fs.mkdirSync(path.join(runsDir(), 'r-files-linked'), { recursive: true });
  fs.symlinkSync(files('r-files-there'), files('r-files-linked'));
  assert.equal(filesStore.runs.filesAt('r-files-linked'), undefined);
});

test("a run's files directory dropped is gone, and one never there drops as gone", () => {
  const files = path.join(runsDir(), 'r-drop-files', 'artifacts');
  fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
  fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
  assert.equal(filesStore.runs.dropFiles('r-drop-files'), null);
  assert.equal(fs.existsSync(files), false);
  assert.equal(fs.existsSync(path.join(runsDir(), 'r-drop-files')), true, 'the run keeps its own directory');
  assert.equal(filesStore.runs.dropFiles('r-drop-never'), null);
});

test("REFUSED: a run's files directory that cannot be removed answers why in one line, and stays", (t) => {
  if (process.getuid?.() === 0) return t.skip('root removes what a mode forbids');
  const files = path.join(runsDir(), 'r-drop-stuck', 'artifacts');
  fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
  fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
  fs.chmodSync(path.join(files, 'implement'), 0o555);
  t.after(() => fs.chmodSync(path.join(files, 'implement'), 0o755));
  const why = filesStore.runs.dropFiles('r-drop-stuck');
  assert.match(why ?? '', /EACCES/);
  assert.ok(!why?.includes('\n'), why ?? '');
  assert.equal(fs.existsSync(path.join(files, 'implement', 'shot.png')), true);
});

test('a path names an inbox card by its file, by its name, through a link to the inbox, and in an inbox that is a link; and no card outside it', () => {
  const inbox = path.join(ROOT, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  assert.equal(filesStore.inbox.nameAt(path.join(inbox, 'c-named.md')), 'c-named');
  assert.equal(filesStore.inbox.nameAt(path.join(inbox, 'c-named')), 'c-named');
  const linked = path.join(scratch('wf-run-store-link-'), 'cards');
  fs.symlinkSync(inbox, linked);
  assert.equal(filesStore.inbox.nameAt(path.join(linked, 'c-named.md')), 'c-named');
  assert.equal(filesStore.inbox.nameAt(path.join(ROOT, 'elsewhere', 'c-named.md')), null);
  assert.equal(filesStore.inbox.nameAt('add a flag'), null);
  const real = path.join(scratch('wf-run-store-real-'), 'inbox');
  fs.renameSync(inbox, real);
  fs.symlinkSync(real, inbox);
  try {
    assert.equal(filesStore.inbox.nameAt(path.join(real, 'c-named.md')), 'c-named', 'an inbox that is itself a link');
  } finally {
    fs.rmSync(inbox);
    fs.renameSync(real, inbox);
  }
});

test('a file that imports a run function from record.store.ts is refused, naming the file and the function', () => {
  const sources = { 'src/new/new.verb.ts': "import { readRun, stepsOf } from '../record/record.store.ts';\n" };
  assert.deepEqual(refusals(sources), [
    'src/new/new.verb.ts imports readRun from record.store.ts: read and write through runStore (src/record/files.store.ts), adding ' +
      'the method to RunStore (src/record/record.ts)',
  ]);
});

test('an import spread over lines is refused, as is a re-export, a namespace and a dynamic import', () => {
  const spread = "import {\n  artifactsDir,\n  cancelFile,\n  holdFile as held,\n  stepsOf,\n} from '../record/record.store.ts';\n";
  assert.deepEqual(directImports(spread), ['cancelFile', 'holdFile']);
  assert.deepEqual(directImports("export {\n  listRuns,\n} from './record/record.store.ts';\n"), ['listRuns']);
  assert.deepEqual(directImports("import * as store from '../record/record.store.ts';\n"), ['*']);
  assert.deepEqual(directImports("const store = await import('../record/record.store.ts');\n"), ['*']);
  assert.deepEqual(directImports("import { readRun } from '../other/other.store.ts';\nimport { stepsOf } from './record.store.ts';\n"), []);
});

test('a run function imported through runner.ts is refused, naming runner.ts as the module it came from', () => {
  const sources = { 'src/new/new.verb.ts': "import {\n  HOME,\n  readRun,\n} from '../runner.ts';\n" };
  assert.deepEqual(refusals(sources), [
    'src/new/new.verb.ts imports readRun from runner.ts: read and write through runStore (src/record/files.store.ts), adding ' +
      'the method to RunStore (src/record/record.ts)',
  ]);
  const both = {
    'src/new/new.verb.ts': "import { listRuns } from '../runner.ts';\nimport { readAsks } from '../record/record.store.ts';\n",
  };
  assert.deepEqual(refusals(both), [
    'src/new/new.verb.ts imports readAsks from record.store.ts: read and write through runStore (src/record/files.store.ts), adding ' +
      'the method to RunStore (src/record/record.ts)',
    'src/new/new.verb.ts imports listRuns from runner.ts: read and write through runStore (src/record/files.store.ts), adding ' +
      'the method to RunStore (src/record/record.ts)',
  ]);
  assert.deepEqual(directImports("import { readRun } from '../runners.ts';\nimport { stepsOf } from '../../runner.ts';\n"), []);
});

test("no file of src but the store's own imports a run's functions from record.store.ts or through runner.ts", () => {
  assert.deepEqual(refusals(sourcesOfSrc()), []);
});
