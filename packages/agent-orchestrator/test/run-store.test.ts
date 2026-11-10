/**
 * The run store's interface (`RunStore`, `src/record/record.ts`), held to what its files implementation (`filesStore`) answers: a record
 * made, read with a person's files composed onto it, written back with none of them and no byte moved, refused once it is gone; whether a
 * run is there and whether a person called it off; the stamps a pass compares, and the asks it reads, consumes and answers from; a hold
 * lifted only as it was read; and the tick asking it, before each filing, whether a person called the run off since (`mayFileOf`). And a
 * person's writes: an ask of each kind at its name, never over a file there, a hold put once and standing while its file does, a
 * cancellation kept as first written, a prune marker put and taken back, and a run forgotten file by file; the inbox is the Card
 * door's (`src/cards/cards.store.test.ts`). And what `nemia rm` and `nemia prune --artifacts` read of it: every run's id read or not, a
 * run's files directory found and dropped.
 *
 * And the refusal that keeps the interface the one way in: a file of `src` but the store's own that imports a run's or a person's file
 * functions from `record.store.ts`, or through `runner.ts`, is refused. `WF_ROOT` is set before the store is imported, since it is read as
 * the module loads.
 */
import { rootNow } from './config-given.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import type { Run } from '../src/run.ts';
import type { PersonRequest } from '../src/record/record.ts';
import { scratch } from 'test-kit/scratch';

const ROOT = scratch('wf-run-store-');
process.env.WF_ROOT = ROOT;
const { filesStore } = await import('../src/record/files.store.ts');
const { RunDoor, runDoorFiles } = await import('../src/runs/runs.store.ts');
const { act, doorFrom, walksOn } = await import('./door-walks.ts');
const { RUN_WALKS, aRun } = await import('./run-walks.ts');
const { RunId } = await import('../src/record/record.model.ts');
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
  writeHold,
} = await import('../src/record/record.store.ts');

const PKG = path.join(import.meta.dirname, '..');
const at = '2026-09-30T09:00:00.000Z';

/** A run made in the store under `id`. */
const made = (id: string): Run => {
  const run = aRun(id);
  filesStore.runs.create(run);
  return run;
};

/** A prune marker, as `nemia prune` writes one. */
const pruned = (id: string): void => fs.writeFileSync(pruneFile(id), JSON.stringify({ at, worktrees: [] }, null, 2));

/** The Run door over the files of this file's store. */
const door = doorFrom(RunDoor, runDoorFiles);

for (const [name, body] of walksOn(RUN_WALKS, () => ({ door, root: ROOT, layer: 'files' }))) test(name, body);

test('a record of an older shape reads through the door as the one Run type, and is written back with nothing refused or moved', () => {
  const id = 'r-older-shape';
  const older = {
    ...aRun(id),
    steps: {
      implement: { taskId: `${id}-implement-try2`, tries: [{ taskId: `${id}-implement`, then: 'retries' }], workspace: '/w/implement' },
      review: { taskId: null },
    },
    gatesTimed: [{ step: 'implement', try: 1 }],
    deniedCounted: [{ task: `${id}-implement`, attempts: 2 }],
    settlesCounted: [`${id}-implement`],
    runTimed: true,
    slotHeldAt: '2026-09-01T00:01:00.000Z',
    keyNobodyNames: 'kept as it was',
  };
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(id), JSON.stringify(older, null, 2));
  const read = act(door.runs.read(RunId.read(id)));
  assert.ok(!('refused' in read), 'an older record reads');
  assert.equal(read.steps.implement?.tries?.[0]?.cause, 'retries', "a try's former `then` is read as its cause");
  assert.deepEqual(read.gatesTimed, older.gatesTimed, 'a counter of the tick reads as the model names it');
  assert.equal(act(door.runs.rewrite(read)), true, 'and is written back through the model with nothing refused');
  const written = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Record<string, unknown>;
  assert.equal(written.keyNobodyNames, 'kept as it was');
});

test('a record in the store, read and written back through the door: what it holds is what it held', async (t) => {
  await t.test(
    'a record stored under an id runId would not mint still reads through the door, and is written back (RunId on read is nominal)',
    () => {
      const id = 'Old_Id';
      fs.mkdirSync(runsDir(), { recursive: true });
      fs.writeFileSync(runFile(id), JSON.stringify(aRun(id), null, 2));
      const read = act(door.runs.read(RunId.read(id)));
      assert.ok(!('refused' in read), 'a stored id is read as it is');
      assert.equal(act(door.runs.rewrite(read)), true);
    },
  );
  await t.test('a new run at an id with a record is refused before a byte of the first is written over (wx)', () => {
    const run = made('r-exclusive');
    const text = fs.readFileSync(runFile(run.id), 'utf8');
    assert.deepEqual(act(door.runs.create({ ...run, brief: 'another' })), { refused: 'Conflict' });
    assert.equal(fs.readFileSync(runFile(run.id), 'utf8'), text);
  });
  await t.test('a record read and written back moves no byte, a key no nemia writes included', () => {
    const id = 'r-bytes';
    const text = JSON.stringify({ ...aRun(id), laterKey: { kept: [1, 2] } }, null, 2);
    fs.mkdirSync(runsDir(), { recursive: true });
    fs.writeFileSync(runFile(id), text);
    assert.equal(filesStore.runs.rewrite(filesStore.runs.read(id)), true);
    assert.equal(fs.readFileSync(runFile(id), 'utf8'), text);
  });
  await t.test('a record that is not JSON is left out of the list and said, and the other runs are listed', () => {
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
});

test('whether a person called a run off: a pause, a hold and a record gone, as the store and the tick each read it', async (t) => {
  await t.test('every run is called off while the store is paused, and none once the pause is lifted', () => {
    const run = made('r-paused');
    putPause(rootNow(), { by: 'ann' });
    try {
      assert.equal(filesStore.runs.calledOff(run.id), true);
    } finally {
      resumePause(rootNow());
    }
    assert.equal(filesStore.runs.calledOff(run.id), false);
  });
  await t.test("the store's pause is composed onto every run read and listed, and written back into none", () => {
    const run = made('r-pause-read');
    const pause = putPause(rootNow(), { why: 'merging by hand', by: 'ann' });
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
      resumePause(rootNow());
    }
    assert.equal('pause' in filesStore.runs.read(run.id), false, 'lifted, no run reads it');
  });
  await t.test('a pass files for a run until a person holds it, and not again in that pass once the hold is lifted', () => {
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
  await t.test('a pass files nothing for a run whose record is gone', () => {
    const run = made('r-may-file-gone');
    fs.rmSync(runFile(run.id));
    assert.equal(mayFileOf(run)(), false);
  });
});

/** One ask of each kind a person writes, with the path the tick reads it at and its reader's words for a file there that is not one. */
const asksOfEachKind = (id: string): Array<{ asked: PersonRequest; file: string; stray: (file: string) => unknown }> => [
  {
    asked: { kind: 'retry', of: 'try', ask: { step: 'implement', try: 2, mode: 'fresh', message: 'again', at } },
    file: askFile(id, 'implement', 2),
    stray: (file) => askIn(file, 'implement', 2),
  },
  {
    asked: { kind: 'retry', of: 'round', ask: { step: 'review', round: 3, at } },
    file: roundAskFile(id, 'review', 3),
    stray: (file) => roundAskIn(file, 'review', 3),
  },
  {
    asked: { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at, message: 'yes' } },
    file: approvalFile(id, 'implement', 1),
    stray: (file) => approvalIn(file, 'implement', 1),
  },
  {
    asked: { kind: 'approve', of: 'loop', ask: { step: 'review', try: 1, at, message: 'good enough' } },
    file: acceptFile(id, 'review', 1),
    stray: (file) => acceptanceIn(file, 'review', 1),
  },
];

test('an ask of each kind is written at the name the tick reads it by, holding the ask alone, and answered where it is', () => {
  const run = made('r-write-asks');
  for (const { asked, file } of asksOfEachKind(run.id)) {
    const n = asked.of === 'round' ? asked.ask.round : asked.of === 'base' ? asked.ask.merge.try : asked.ask.try;
    assert.equal(filesStore.asks.where(run.id, { of: asked.of, step: asked.ask.step, n }), file);
    assert.deepEqual(filesStore.asks.write(run.id, asked), { written: true, where: file });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), asked.ask, `${asked.of} is written as the ask alone`);
  }
  const read = filesStore.asks.read(run.id);
  assert.equal(read.asks.length, 1);
  assert.equal(read.rounds.length, 1);
  assert.deepEqual(read.notes, []);
});

test('a merge ask is written at its target and try, holding its loop, round, base and commit, and read back as a round ask of its loop', () => {
  const run = made('r-write-merge');
  const merge = { target: 'implement', try: 3, onto: 'main', sha: 'a'.repeat(40) };
  const file = filesStore.asks.where(run.id, { of: 'base', step: 'implement', n: 3 });
  assert.match(file, /merge-implement-3$/);
  assert.deepEqual(filesStore.asks.write(run.id, { kind: 'refresh', of: 'base', ask: { step: 'review', round: 2, at, merge } }), {
    written: true,
    where: file,
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { loop: 'review', round: 2, onto: 'main', sha: 'a'.repeat(40), at });
  assert.deepEqual(filesStore.asks.read(run.id).rounds, [{ step: 'review', round: 2, at, merge }]);
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

test('a hold file stands while it is there, read as a hold or not, and not once it is gone', () => {
  const run = made('r-stands');
  assert.equal(filesStore.holds.stands(run.id), false);
  fs.writeFileSync(holdFile(run.id), 'not json');
  assert.equal(filesStore.holds.stands(run.id), true);
  fs.rmSync(holdFile(run.id));
  assert.equal(filesStore.holds.stands(run.id), false);
});

test("a run forgotten loses its record and every person's file and its directory, in order, and another run keeps its own", () => {
  const run = made('r-forget');
  const other = made('r-forget-other');
  for (const id of [run.id, other.id]) {
    filesStore.runs.cancel(id);
    pruned(id);
    filesStore.holds.put(id, ['x'], {});
    filesStore.asks.write(id, { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at } });
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

/** The functions of `record.store.ts` that read or write a run's record or a person's files beside it: `runStore` says each. */
const GUARDED = [
  'runRecord',
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
        `${file} imports ${names.join(', ')} from ${from}: read and write through the Run door (RunDoor, src/runs/runs.store.ts), adding ` +
          'the method to RunStore (src/record/record.ts)',
      );
  }
  return out;
}

test("what `nemia rm` and `nemia prune --artifacts` read of the store: each run's id, read or not, and its files directory found and dropped", async (t) => {
  await t.test("every run id with a record file is listed, read or not, and none from a person's file alone", () => {
    const listed = (): string[] => filesStore.runs.ids().filter((id) => id.startsWith('r-ids-'));
    made('r-ids-read');
    fs.writeFileSync(runFile('r-ids-torn'), '{ "id": ');
    markCancelled('r-ids-cancelled');
    filesStore.holds.put('r-ids-held', ['x'], {});
    fs.mkdirSync(asksDir('r-ids-asked'), { recursive: true });
    assert.deepEqual(listed(), ['r-ids-read', 'r-ids-torn']);
    assert.ok(!filesStore.runs.list(() => {}).some((run) => run.id === 'r-ids-torn'), 'where list leaves the torn record out');
  });
  await t.test('no run id is listed with no runs folder', () => {
    const away = path.join(scratch('wf-run-store-ids-'), 'runs');
    fs.renameSync(runsDir(), away);
    try {
      assert.deepEqual(filesStore.runs.ids(), []);
    } finally {
      fs.renameSync(away, runsDir());
    }
  });
  await t.test("a run's files directory is found while it is a directory, and not when it is absent or a link to one", () => {
    const files = (id: string): string => path.join(runsDir(), id, 'artifacts');
    fs.mkdirSync(files('r-files-there'), { recursive: true });
    assert.equal(filesStore.runs.filesAt('r-files-there'), files('r-files-there'));
    assert.equal(filesStore.runs.filesAt('r-files-never'), undefined);
    fs.mkdirSync(path.join(runsDir(), 'r-files-linked'), { recursive: true });
    fs.symlinkSync(files('r-files-there'), files('r-files-linked'));
    assert.equal(filesStore.runs.filesAt('r-files-linked'), undefined);
  });
  await t.test("a run's files directory dropped is gone, and one never there drops as gone", () => {
    const files = path.join(runsDir(), 'r-drop-files', 'artifacts');
    fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
    fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
    assert.equal(filesStore.runs.dropFiles('r-drop-files'), null);
    assert.equal(fs.existsSync(files), false);
    assert.equal(fs.existsSync(path.join(runsDir(), 'r-drop-files')), true, 'the run keeps its own directory');
    assert.equal(filesStore.runs.dropFiles('r-drop-never'), null);
  });
  await t.test("REFUSED: a run's files directory that cannot be removed answers why in one line, and stays", (c) => {
    if (process.getuid?.() === 0) return c.skip('root removes what a mode forbids');
    const files = path.join(runsDir(), 'r-drop-stuck', 'artifacts');
    fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
    fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
    fs.chmodSync(path.join(files, 'implement'), 0o555);
    c.after(() => fs.chmodSync(path.join(files, 'implement'), 0o755));
    const why = filesStore.runs.dropFiles('r-drop-stuck');
    assert.match(why ?? '', /EACCES/);
    assert.ok(!why?.includes('\n'), why ?? '');
    assert.equal(fs.existsSync(path.join(files, 'implement', 'shot.png')), true);
  });
});

/** `said` refuses each of `imported` in turn, naming the file, the function and its module, and the fix: a method on RunStore. */
function refusedFor(said: readonly string[], ...imported: Array<[fn: string, from: string]>): void {
  assert.equal(said.length, imported.length, said.join('\n'));
  imported.forEach(([fn, from], i) => {
    assert.ok(said[i].startsWith(`src/new/new.verb.ts imports ${fn} from ${from}: `), said[i]);
    assert.ok(said[i].includes('RunDoor, src/runs/runs.store.ts'), said[i]);
    assert.ok(said[i].includes('RunStore (src/record/record.ts)'), said[i]);
  });
}

test('a file that imports a run function from record.store.ts is refused, naming the file and the function', () => {
  const sources = { 'src/new/new.verb.ts': "import { runRecord, stepsOf } from '../record/record.store.ts';\n" };
  refusedFor(refusals(sources), ['runRecord', 'record.store.ts']);
});

test('an import spread over lines is refused, as is a re-export, a namespace and a dynamic import', () => {
  const spread = "import {\n  artifactsDir,\n  cancelFile,\n  holdFile as held,\n  stepsOf,\n} from '../record/record.store.ts';\n";
  assert.deepEqual(directImports(spread), ['cancelFile', 'holdFile']);
  assert.deepEqual(directImports("export {\n  listRuns,\n} from './record/record.store.ts';\n"), ['listRuns']);
  assert.deepEqual(directImports("import * as store from '../record/record.store.ts';\n"), ['*']);
  assert.deepEqual(directImports("const store = await import('../record/record.store.ts');\n"), ['*']);
  assert.deepEqual(
    directImports("import { runRecord } from '../other/other.store.ts';\nimport { stepsOf } from './record.store.ts';\n"),
    [],
  );
});

test('a run function imported through runner.ts is refused, naming runner.ts as the module it came from', () => {
  const sources = { 'src/new/new.verb.ts': "import {\n  HOME,\n  runRecord,\n} from '../runner.ts';\n" };
  refusedFor(refusals(sources), ['runRecord', 'runner.ts']);
  const both = {
    'src/new/new.verb.ts': "import { listRuns } from '../runner.ts';\nimport { readAsks } from '../record/record.store.ts';\n",
  };
  refusedFor(refusals(both), ['readAsks', 'record.store.ts'], ['listRuns', 'runner.ts']);
  assert.deepEqual(directImports("import { runRecord } from '../runners.ts';\nimport { stepsOf } from '../../runner.ts';\n"), []);
});

test("no file of src but the store's own imports a run's functions from record.store.ts or through runner.ts", () => {
  assert.deepEqual(refusals(sourcesUnder(PKG, 'src', OWN)), []);
});

/**
 * A read of the run store past the Run door: its files store by name (`filesStore`), or the run store's former binding (`runStore.`).
 * The binding itself is gone from `files.store.ts`, so the typecheck refuses an import of it; this refuses the files store named instead.
 */
const PAST_THE_DOOR = /\bfilesStore\b|\brunStore\s*\.\s*(?:runs|asks|holds|refresh|forgetting|labels)\b/g;

/** The two files the rule leaves out: the files store, which defines it, and the Run door, its one reader. */
const DOOR_AND_FILES = ['src/record/files.store.ts', 'src/runs/runs.store.ts'];

/** What a read past the door says: the file, how many uses, and the fix. */
const pastTheDoor = (sources: Record<string, string>): string[] =>
  [...seamUses(sources, PAST_THE_DOOR)].map(
    ([file, n]) =>
      `${file} reads the run store past the Run door ${n} time(s): yield RunDoor in a program, or read runsAtOnce (src/runs/runs.store.ts) in a plain function`,
  );

test('no file of src but the Run door reads the run store: every other reads RunDoor or runsAtOnce', () => {
  assert.deepEqual(pastTheDoor(sourcesUnder(PKG, 'src', DOOR_AND_FILES)), []);
});

test('REFUSED: a file of src that reads the files store, or the run store by its former binding, is named', () => {
  const sources = sourcesUnder(PKG, 'src', DOOR_AND_FILES);
  const planted = {
    ...sources,
    'src/cancel/cancel.verb.ts': `${sources['src/cancel/cancel.verb.ts']}\nimport { filesStore } from '../record/files.store.ts';\nconst x = filesStore.runs.read('a');\n`,
    'src/try/try.verb.ts': `${sources['src/try/try.verb.ts']}\nconst y = runStore.asks.read('a');\n`,
  };
  const said = pastTheDoor(planted);
  assert.equal(said.length, 2, said.join('\n'));
  assert.ok(said[0]?.startsWith('src/cancel/cancel.verb.ts reads the run store past the Run door 2 time(s)'), said[0]);
  assert.ok(said[1]?.startsWith('src/try/try.verb.ts reads the run store past the Run door 1 time(s)'), said[1]);
});

/** A run under `id` started out of the inbox's card `card`. */
const fromCard = (id: string, card: string): Run => ({ ...aRun(id), from: { inbox: card } });

/** Where the claim of the card `card` is: `<root>/started/<card>.json`. */
const claimOf = (card: string): string => path.join(ROOT, 'started', `${card}.json`);

/** A claim of the card `card` planted for the run `run`, as a crash or a forgotten run leaves one. */
const plantClaim = (card: string, run: string): void => {
  fs.mkdirSync(path.dirname(claimOf(card)), { recursive: true });
  fs.writeFileSync(claimOf(card), JSON.stringify({ run }));
};

test('a claim naming a run with no record is stale: it is taken over, and the claim names the new run', () => {
  plantClaim('c-stale', 'c-stale-gone');
  const made = act(door.runs.create(fromCard('c-stale-new', 'c-stale')));
  assert.equal(made, undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(claimOf('c-stale'), 'utf8')), { run: 'c-stale-new' });
  assert.deepEqual(
    fs.readdirSync(path.join(ROOT, 'started')).filter((n) => n.includes('c-stale')),
    ['c-stale.json'],
  );
});

test('a claim naming a record from another card is stale, and taken over', () => {
  act(door.runs.create(fromCard('c-other-run', 'c-other-card')));
  plantClaim('c-mine', 'c-other-run');
  assert.equal(act(door.runs.create(fromCard('c-mine-run', 'c-mine'))), undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(claimOf('c-mine'), 'utf8')), { run: 'c-mine-run' });
});

test('a claim lives at <root>/started/<card>.json, and no listing of runs, taken id or stamp reads it', () => {
  act(door.runs.create(fromCard('c-unread-run', 'c-unread')));
  assert.deepEqual(JSON.parse(fs.readFileSync(claimOf('c-unread'), 'utf8')), { run: 'c-unread-run' });
  const listed = filesStore.runs.list(() => {}).map((r) => r.id);
  assert.deepEqual(
    {
      listed: listed.includes('c-unread'),
      ids: filesStore.runs.ids().includes('c-unread'),
      stamped: filesStore.runs.stamps().has('c-unread'),
      taken: filesStore.runs.taken('c-unread'),
    },
    { listed: false, ids: false, stamped: false, taken: false },
  );
});

test('REFUSED: the loser of a card leaves no record and no folder under its id, and the claim names the first run', () => {
  act(door.runs.create(fromCard('c-won', 'c-twice')));
  assert.deepEqual(act(door.runs.create(fromCard('c-lost', 'c-twice'))), { refused: 'Conflict' });
  assert.equal(fs.existsSync(path.join(runsDir(), 'c-lost.json')), false);
  assert.equal(fs.existsSync(path.join(runsDir(), 'c-lost')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(claimOf('c-twice'), 'utf8')), { run: 'c-won' });
});
