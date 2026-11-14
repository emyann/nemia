/**
 * A contract imports nothing from the code that implements it: it is written first, and typechecks before the code exists.
 *
 * A contract is every `*.contract.ts` the repository holds. A file implements a contract when it imports from the contract's file; a
 * contract that imports from such a file reads its own implementation, and is refused, naming both. The types a contract's signature
 * needs are declared in the contract and taken from it by the code, or held by `objects` as a Schema where they cross a door; a value
 * both need (an error class, a service) lives in a file of its own that both import.
 *
 * The contracts written before this rule are named in `contract-first.baseline.ts`, which only shrinks: a contract it does not name is
 * refused, and so is a name it holds for a contract that reads its code no more.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { files, textOf } from 'test-kit/repo';
import { READS_ITS_CODE } from './contract-first.baseline.ts';

const BASELINE = 'tools/guards/test/contract-first.baseline.ts';

/** The files `text` imports by a relative path, each by its path from the root, read from `from`'s folder. */
const importsOf = (from: string, text: string): string[] =>
  [...text.matchAll(/from '(\.{1,2}\/[^']+)'/g)].map((m) => path.posix.join(path.posix.dirname(from), m[1] ?? ''));

/** Each contract among `sources`, a path and its text, that imports a file importing it back: the contract and that file. */
export const readsItsCode = (sources: ReadonlyMap<string, string>): Array<{ contract: string; code: string }> =>
  [...sources]
    .filter(([file]) => file.endsWith('.contract.ts'))
    .flatMap(([contract, text]) =>
      importsOf(contract, text)
        .filter((code) => importsOf(code, sources.get(code) ?? '').includes(contract))
        .map((code) => ({ contract, code })),
    );

/** What today's contracts and `baseline` disagree on, each a sentence naming the fix. */
export const breaks = (found: ReadonlyArray<{ contract: string; code: string }>, baseline: readonly string[]): string[] => {
  const reading = new Set(found.map((f) => f.contract));
  return [
    ...found
      .filter((f) => !baseline.includes(f.contract))
      .map(
        (f) =>
          `${f.contract} imports ${f.code}, which implements it: declare the types its signature needs in the contract and let the ` +
          `code take them from it, or put a value both need in a file of its own; never add it to ${BASELINE}`,
      ),
    ...baseline
      .filter((contract) => !reading.has(contract))
      .map((contract) => `${contract} reads its code no more: take it off ${BASELINE}, which only shrinks`),
  ];
};

test('no contract imports from the code that implements it, but those the baseline names, which only shrinks', () => {
  const sources = new Map(
    files()
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const text = textOf(file);
        return text === undefined ? [] : [[file, text] as const];
      }),
  );
  assert.ok(
    [...sources.keys()].some((file) => file.endsWith('.contract.ts')),
    'the contracts are among the files read',
  );
  assert.deepEqual(breaks(readsItsCode(sources), READS_ITS_CODE), []);
});

test('REFUSED: a contract that takes its types from the file typed by it, and a baseline entry for one that reads its code no more', () => {
  const planted = new Map([
    [
      'pkg/contracts/parcel.contract.ts',
      "import type { Parcel } from '../src/parcel.ts';\nexport type StatusOf = (p: Parcel) => string;\n",
    ],
    ['pkg/src/parcel.ts', "import type { StatusOf } from '../contracts/parcel.contract.ts';\nexport interface Parcel {}\n"],
    ['pkg/contracts/users.contract.ts', "import type { Users } from '../src/users.model.ts';\n"],
    ['pkg/src/users.model.ts', 'export interface Users {}\n'],
  ]);
  const found = readsItsCode(planted);
  assert.deepEqual(found, [{ contract: 'pkg/contracts/parcel.contract.ts', code: 'pkg/src/parcel.ts' }]);
  assert.equal(breaks(found, []).length, 1, 'a contract the baseline does not name');
  assert.equal(breaks(found, ['pkg/contracts/parcel.contract.ts']).length, 0);
  assert.equal(breaks([], ['pkg/contracts/parcel.contract.ts']).length, 1, 'an entry for a contract that is clean now');
});
