/**
 * The Ledger door's files layer: the door's walks (`test/ledger-walks.ts`) on a fresh scratch store each, and what only the files can be
 * asked — a ledger file that does not read, a stored ledger written before the door, the path an entry is kept at, the default door's
 * root — and the debt of the callers still on the synchronous spellings (`test/ledger-door.baseline.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { LEDGER_WALKS } from '../../test/ledger-walks.ts';
import { LedgerDoor, ledgerDoorFiles } from './revisions.store.ts';
import { StoreRoot } from '../config/root.store.ts';

const PKG = path.join(import.meta.dirname, '..', '..');

for (const [name, body] of walksOn(LEDGER_WALKS, () => {
  const root = scratch('wf-ledger-door-');
  return { door: doorFrom(LedgerDoor, ledgerDoorFiles(root)), root, layer: 'files' };
}))
  test(name, body);

/** A fresh store and its Ledger door over the files. */
const store = () => {
  const root = scratch('wf-ledger-door-');
  return { root, door: doorFrom(LedgerDoor, ledgerDoorFiles(root)) };
};

test('the ledger reads as empty where its file does not read', () => {
  const { root, door } = store();
  assert.deepEqual(done(door.entries.of({ kind: 'workflow', name: 'never-resolved' })), []);
  const file = path.join(root, 'revisions', 'workflow', 'broken.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not json');
  assert.deepEqual(
    done(door.entries.of({ kind: 'workflow', name: 'broken' })),
    [],
    'a file a hand edit broke leaves every other kind readable',
  );
  fs.writeFileSync(file, '{"n": 1}');
  assert.deepEqual(done(door.entries.of({ kind: 'workflow', name: 'broken' })), [], 'and so does one that holds no list');
});

test('a stored ledger written before the door reads, an entry with a field more kept whole, one that is no entry left out', () => {
  const { root, door } = store();
  const file = path.join(root, 'revisions', 'skill', `${encodeURIComponent('apps/web:ds-build')}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stored = [
    { n: 1, hash: '0123456789abcdef', at: '2026-01-01T00:00:00.000Z' },
    { n: 2, hash: 'fedcba9876543210', at: '2026-02-01T00:00:00.000Z', by: 'a newer nemia' },
    { hash: 'no-number' },
  ];
  fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`);
  const of = { kind: 'skill', name: 'apps/web:ds-build' } as const;
  assert.deepEqual(done(door.entries.of(of)), stored.slice(0, 2));
  assert.deepEqual(done(door.entries.append(of, 'fedcba9876543210', '2026-03-01T00:00:00.000Z')).n, 2, 'a stored content keeps its number');
  assert.deepEqual(done(door.entries.append(of, 'aaaaaaaaaaaaaaaa', '2026-03-01T00:00:00.000Z')).n, 3, 'a new one is numbered past it');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))[1].by, 'a newer nemia', 'the field more is written back as it was');
  assert.deepEqual(
    fs.readdirSync(path.dirname(file)),
    [path.basename(file)],
    'the escaped name is the one file, and no temporary file is left',
  );
});

test('the default door reads the files at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.entries.append({ kind: 'agent', name: 'coder' }, 'aaaa', '2026-11-01T00:00:00.000Z'));
  const of = Effect.gen(function* () {
    return (yield* (yield* LedgerDoor).entries.of({ kind: 'agent', name: 'coder' })).map((e) => e.n);
  });
  assert.deepEqual(act(Effect.provideService(of, StoreRoot, root)), [1]);
  assert.deepEqual(act(of), { refused: 'Invalid' });
});

/** The ledger's synchronous spellings, which `src`'s code still uses rather than yielding the door. */
const SEAM = ['ledgerOf', 'appendRevision'];

/** The door's own files: where the seam is defined, not a debt. */
const OWN = ['src/revisions/revisions.store.ts', 'src/revisions/memory.store.ts'];

/** Every file of `src` but the tests and the door's own, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (!OWN.includes(file)) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** A binding of a name, an `import … from` or an `export { … } from`, over as many lines as it takes: plumbing, not a use. */
const BINDINGS = /^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"][^'"]*['"]\s*;?/gm;

/** The seam's uses in each file — a call, or the function handed on — comment lines and bindings left out. */
function seamUses(sources: Record<string, string>): Map<string, number> {
  const use = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})(?![\\w$])`, 'g');
  const uses = new Map<string, number>();
  for (const [file, text] of Object.entries(sources)) {
    const code = text
      .replace(BINDINGS, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
      .join('\n');
    const n = [...code.matchAll(use)].length;
    if (n) uses.set(file, n);
  }
  return uses;
}

/** Why the uses of `sources` break the baseline `debt`: a file it does not name, a count grown, a count fallen. */
function debtBreaks(sources: Record<string, string>, debt: Readonly<Record<string, number>>): string[] {
  const uses = seamUses(sources);
  const out: string[] = [];
  for (const [file, n] of uses) {
    const owed = debt[file] ?? 0;
    if (n > owed)
      out.push(
        `${file} uses the ledger's synchronous spellings ${n} time(s) where test/ledger-door.baseline.ts names ${owed}: yield LedgerDoor (src/revisions/revisions.store.ts) instead`,
      );
    if (n < owed)
      out.push(
        `${file} uses the ledger's synchronous spellings ${n} time(s): lower its count in test/ledger-door.baseline.ts to ${n}, which only shrinks`,
      );
  }
  for (const file of Object.keys(debt))
    if (!uses.has(file))
      out.push(`${file} uses the ledger's synchronous spellings no more: take its line out of test/ledger-door.baseline.ts`);
  return out;
}

test("no file of src uses the ledger's synchronous spellings but as test/ledger-door.baseline.ts counts it, and the count only shrinks", async () => {
  const { LEDGER_DOOR_DEBT } = await import('../../test/ledger-door.baseline.ts');
  assert.deepEqual(debtBreaks(sourcesOfSrc(), LEDGER_DOOR_DEBT), []);
});

test('REFUSED: a converted file that uses a spelling again, and a count the baseline holds above what is left', async () => {
  const { LEDGER_DOOR_DEBT } = await import('../../test/ledger-door.baseline.ts');
  const sources = sourcesOfSrc();
  const again = {
    ...sources,
    'src/revisions/revisions.ts': `${sources['src/revisions/revisions.ts']}\nconst x = ledgerOf('agent', 'coder');\n`,
  };
  assert.equal(debtBreaks(again, LEDGER_DOOR_DEBT).length, 1);
  const [first] = Object.keys(LEDGER_DOOR_DEBT);
  assert.equal(debtBreaks(sources, { ...LEDGER_DOOR_DEBT, [first]: (LEDGER_DOOR_DEBT[first] ?? 0) + 1 }).length, 1);
});
