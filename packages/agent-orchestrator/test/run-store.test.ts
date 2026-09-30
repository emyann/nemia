/**
 * The run store's interface (`RunStore`, `src/record/run-store.ts`), held to what its files implementation (`filesStore`) answers: a record
 * made, read with a person's files composed onto it, written back with none of them and no byte moved, refused once it is gone; whether a
 * run is there and whether a person called it off; the stamps a pass compares, and the asks it reads, consumes and answers from; a hold
 * lifted only as it was read.
 *
 * And the refusal that keeps the interface the one way in: a file of `src` that imports a run's or a person's file functions from
 * `record.store.ts` directly is refused, unless `DIRECT` still names it, and an entry of `DIRECT` that imports none of them is refused too,
 * so the list only shrinks. `WF_ROOT` is set before the store is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../src/run.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-run-store-');
process.env.WF_ROOT = ROOT;
const { filesStore } = await import('../src/record/files.store.ts');
const { acceptFile, approvalFile, askFile, asksDir, holdFile, markCancelled, pruneFile, runFile, runsDir, writeAsk, writeHold } =
  await import('../src/record/record.store.ts');

const PKG = path.join(import.meta.dirname, '..');
const at = '2026-09-30T09:00:00.000Z';

/** A git run's record as the tick writes one today, frozen steps and all. */
const aRun = (id: string): Run =>
  ({
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
  }) as Run;

/** A run made in the store under `id`. */
const made = (id: string): Run => {
  const run = aRun(id);
  filesStore.runs.create(run);
  return run;
};

/** A prune marker, as `wf prune` writes one. */
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

test('a record read and written back moves no byte, a key no wf writes included', () => {
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
];

/** The files the interface is built from, which alone may import them for good. */
const OWN = ['src/record/record.store.ts', 'src/record/files.store.ts'];

/** The files of `src` that still import a guarded function directly, until the card that moves them onto `runStore`. */
const DIRECT = [
  'src/branches/branches.store.ts',
  'src/cancel/cancel.verb.ts',
  'src/cap/cap.verb.ts',
  'src/decide/decide.verb.ts',
  'src/ending/ending.verb.ts',
  'src/forget/forget.verb.ts',
  'src/gate/gate.verb.ts',
  'src/inbox/inbox.store.ts',
  'src/inbox/inbox.verb.ts',
  'src/list/list.verb.ts',
  'src/prune/prune.verb.ts',
  'src/retry/retry.verb.ts',
  'src/round/round.verb.ts',
  'src/runner.ts',
  'src/say/say.verb.ts',
  'src/start/start.verb.ts',
  'src/views/views.verb.ts',
  'src/wait/wait.verb.ts',
];

const STORE_MODULE = /(?:^|\/)record\.store(?:\.ts)?$/;

/**
 * The guarded functions a source text imports or re-exports from `record.store.ts`, by name across line breaks; `*` for a namespace or a
 * dynamic import of it, which reaches every one.
 */
function directImports(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!STORE_MODULE.test(m[2])) continue;
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (GUARDED.includes(name)) found.add(name);
    }
  }
  for (const m of text.matchAll(/\bimport\s*\*\s*as\s+\w+\s+from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    if (STORE_MODULE.test(m[1] ?? m[2])) found.add('*');
  return [...found].sort();
}

/** What each file imports directly, among `sources`, and a line for each file not on `direct` and each entry that imports nothing. */
function refusals(sources: Record<string, string>, direct: readonly string[]): string[] {
  const out: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    const names = directImports(text);
    if (names.length && !direct.includes(file))
      out.push(
        `${file} imports ${names.join(', ')} from record.store.ts: read and write through runStore (src/record/files.store.ts), adding ` +
          'the method to RunStore (src/record/run-store.ts)',
      );
  }
  for (const file of direct)
    if (!directImports(sources[file] ?? '').length)
      out.push(`${file} imports nothing of record.store.ts that runStore says: delete its entry from DIRECT in test/run-store.test.ts`);
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

test('a file not on the list that imports a run function from record.store.ts is refused, naming the file and the function', () => {
  const sources = { 'src/new/new.verb.ts': "import { readRun, stepsOf } from '../record/record.store.ts';\n" };
  assert.deepEqual(refusals(sources, []), [
    'src/new/new.verb.ts imports readRun from record.store.ts: read and write through runStore (src/record/files.store.ts), adding ' +
      'the method to RunStore (src/record/run-store.ts)',
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

test('an entry on the list that imports none of them is refused, naming the entry to delete', () => {
  const sources = { 'src/tick/tick.verb.ts': "import { stepsOf } from '../record/record.store.ts';\n" };
  assert.deepEqual(refusals(sources, ['src/tick/tick.verb.ts']), [
    'src/tick/tick.verb.ts imports nothing of record.store.ts that runStore says: delete its entry from DIRECT in test/run-store.test.ts',
  ]);
});

test("the files of src that import a run's functions directly are exactly the list", () => {
  const sources = sourcesOfSrc();
  const found = Object.keys(sources)
    .filter((file) => directImports(sources[file]).length)
    .sort();
  assert.deepEqual(found, DIRECT);
  assert.deepEqual(refusals(sources, DIRECT), []);
});
