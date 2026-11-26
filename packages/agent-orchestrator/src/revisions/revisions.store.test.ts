/**
 * The Ledger door at a store's root: the door's walks (`test/ledger-walks.ts`) on a fresh scratch store each, and what only a store's
 * keyspace can be asked — a record that does not read, a ledger file of before the keyspace imported, the key an entry is kept at, N
 * appends at once numbered N in turn, the default door's root — and no file of `src` on the synchronous read.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { act, done, rootedOn, settled, walksOn } from '../../test/door-walks.ts';
import { plantRecord, recordText } from '../../testing.ts';
import { LEDGER_WALKS } from '../../test/ledger-walks.ts';
import { LedgerDoor } from './revisions.store.ts';
import { StoreRoot } from '../config/root.store.ts';

const PKG = path.join(import.meta.dirname, '..', '..');

for (const [name, body] of walksOn(LEDGER_WALKS, () => {
  const root = scratch('wf-ledger-door-');
  return { door: rootedOn(Effect.runSync(LedgerDoor), root), root, layer: 'keyspace' };
}))
  test(name, body);

/** A fresh store and its Ledger door at its root. */
const store = () => {
  const root = scratch('wf-ledger-door-');
  return { root, door: rootedOn(Effect.runSync(LedgerDoor), root) };
};

test('the ledger reads as empty where its record does not read', () => {
  const { root, door } = store();
  assert.deepEqual(done(door.entries.of({ kind: 'workflow', name: 'never-resolved' })), []);
  plantRecord(root, '/registry/revisions/workflow/broken', 'not json');
  assert.deepEqual(
    done(door.entries.of({ kind: 'workflow', name: 'broken' })),
    [],
    'a record that does not read leaves every other kind readable',
  );
  plantRecord(root, '/registry/revisions/workflow/broken', '{"n": 1}');
  assert.deepEqual(done(door.entries.of({ kind: 'workflow', name: 'broken' })), [], 'and so does one that holds no list');
});

test('a ledger file of before the keyspace is imported, an entry with a field more kept whole, one that is no entry left out', () => {
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
  const key = `/registry/revisions/skill/${encodeURIComponent('apps/web:ds-build')}`;
  assert.equal(JSON.parse(recordText(root, key) ?? '[]')[1].by, 'a newer nemia', 'the field more is written back as it was');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [], 'the file is moved aside');
  assert.ok(fs.existsSync(path.join(root, 'imported', 'revisions', 'skill', path.basename(file))));
});

test('appends of N contents at once are numbered 1 to N, none lost', async () => {
  const { door } = store();
  const of = { kind: 'agent', name: 'coder' } as const;
  const hashes = Array.from({ length: 8 }, (_, i) => `${'0123456789abcdef'.slice(i)}${'x'.repeat(i)}`);
  await Promise.all(hashes.map((hash) => settled(door.entries.append(of, hash, '2026-11-01T00:00:00.000Z'))));
  assert.deepEqual(
    (await settled(door.entries.of(of))).map((e) => e.n),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('the default door reads the keyspace at the store root the program is given, and refuses Invalid where it was given none', () => {
  const { root, door } = store();
  done(door.entries.append({ kind: 'agent', name: 'coder' }, 'aaaa', '2026-11-01T00:00:00.000Z'));
  const of = Effect.gen(function* () {
    return (yield* (yield* LedgerDoor).entries.of({ kind: 'agent', name: 'coder' })).map((e) => e.n);
  });
  assert.deepEqual(act(Effect.provideService(of, StoreRoot, root)), [1]);
  assert.deepEqual(act(of), { refused: 'Invalid' });
});

/** The ledger's synchronous read, a test's. */
const SEAM = ['ledgerOf'];

/** The door's own files: where the seam is defined, not a use. */
const OWN = ['src/revisions/revisions.store.ts', 'src/revisions/memory.store.ts'];

/** The seam's uses in each file — a call, or the function handed on — comment lines and bindings left out. */
const SEAM_USE = new RegExp(`(?<![\\w$.])(?:${SEAM.join('|')})(?![\\w$])`, 'g');

/** Each file of `sources` that uses the ledger's synchronous read rather than yielding the door, as a refusal. */
const seamRefusals = (sources: Record<string, string>) =>
  [...seamUses(sources, SEAM_USE, { bindings: true })].map(
    ([file, n]) => `${file} uses the ledger's synchronous read ${n} time(s): yield LedgerDoor (src/revisions/revisions.store.ts) instead`,
  );

test("no file of src uses the ledger's synchronous read: every caller yields LedgerDoor", () => {
  assert.deepEqual(seamRefusals(sourcesUnder(PKG, 'src', OWN)), []);
});

test('REFUSED: a file that uses it again', () => {
  const sources = sourcesUnder(PKG, 'src', OWN);
  const again = {
    ...sources,
    'src/revisions/revisions.ts': `${sources['src/revisions/revisions.ts']}\nconst x = ledgerOf('agent', 'coder');\n`,
  };
  assert.equal(seamRefusals(again).length, 1);
});
