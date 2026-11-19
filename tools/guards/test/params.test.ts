/**
 * An exported function's doc says each of its parameters: a `@param <name>` for every parameter it names, and none for a name it
 * has not, so a person's hover and an agent's read of the signature find what each is for, in the signature's order, and a tag that
 * went stale is refused. `@returns` is asked of nobody: the signature's type says it.
 *
 * The functions written before the rule are counted per file in `params.baseline.json`, which only shrinks: a file with more than its
 * count is refused, one the baseline does not name owes none, and a count above today's is refused too, so a change that documents a
 * function lowers its file's count in the same commit. Today's counts, as the baseline's text: `node tools/guards/test/params.ts`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { counted, owedIn, shipped } from './params.ts';

const BASELINE = 'tools/guards/test/params.baseline.json';

/** What today's counts and `baseline` disagree on, each a sentence naming the fix. */
export const breaks = (today: Readonly<Record<string, number>>, baseline: Readonly<Record<string, number>>) => [
  ...Object.entries(today)
    .filter(([file, owed]) => owed > (baseline[file] ?? 0))
    .map(
      ([file, owed]) =>
        `${file} has ${owed} exported function(s) whose doc and parameters disagree, and ${BASELINE} allows ${baseline[file] ?? 0}: ` +
        "give each parameter a `@param <name>` saying what it is for, in the signature's order, and take off a tag that names none; never raise the count",
    ),
  ...Object.entries(baseline)
    .filter(([file, held]) => held > (today[file] ?? 0))
    .map(([file, held]) => `${file} owes ${today[file] ?? 0} now, and ${BASELINE} holds ${held}: lower it there, which only shrinks`),
];

test("every exported function's doc names its parameters, but those the baseline counts, which only shrinks", () => {
  const baseline = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'params.baseline.json'), 'utf8')) as Record<string, number>;
  assert.deepEqual(breaks(counted(shipped()), baseline), []);
});

test('REFUSED: a parameter with no tag, a tag that names no parameter, and a count above what is owed; a parameter taken apart asks none', () => {
  const said =
    '/**\n * Ships it.\n * @param parcel What is shipped.\n * @param to Where to.\n */\nexport const ship = (parcel: string, to: string) => parcel + to;\n';
  assert.equal(owedIn('pkg/src/a.ts', said), 0);
  assert.equal(owedIn('pkg/src/a.ts', said.replace(' * @param to Where to.\n', '')), 1, 'a parameter with no tag');
  assert.equal(owedIn('pkg/src/a.ts', said.replace('@param to', '@param towards')), 1, 'a tag that names no parameter');
  assert.equal(
    owedIn('pkg/src/a.ts', '/** Ships it. */\nexport function ship({ parcel }: { parcel: string }) {\n  return parcel;\n}\n'),
    0,
  );
  assert.equal(owedIn('pkg/src/a.ts', '/** Ships it. */\nconst ship = (parcel: string) => parcel;\n'), 0, 'not exported');
  assert.deepEqual(
    counted(
      new Map([
        ['packages/p/src/a.ts', said.replace(' * @param to Where to.\n', '')],
        ['packages/p/src/a.test.ts', ''],
      ]),
    ),
    {
      'packages/p/src/a.ts': 1,
    },
  );
  assert.equal(breaks({ 'a.ts': 1 }, {}).length, 1);
  assert.equal(breaks({ 'a.ts': 1 }, { 'a.ts': 1 }).length, 0);
  assert.equal(breaks({}, { 'a.ts': 1 }).length, 1, 'a count for a file that owes none');
});
