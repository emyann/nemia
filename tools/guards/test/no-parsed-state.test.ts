/**
 * No state is parsed out of a string. A step's state crosses every door as codes — its `phase`, its `reason`, a check's `verdict` as
 * `{ result, exit }` — beside the `message` a person reads, which nothing compares. A `.startsWith('failed ✗ check')` on a step's word
 * is the sentence made a contract: the day the sentence is made clearer, the board draws the wrong state and no test says so.
 *
 * `parsedStates` (`parsed-state.ts`) finds, by TypeScript's parser, a `.startsWith`, `.endsWith`, `.split`, `.match`, `.replace` or
 * `.includes` called on a name that ends in status, phase, verdict or word, and a pattern's `.test` of such a name, in every `.ts` and
 * `.tsx` git lists under a package's `src`, the api's and the board's — tests and stories left out. What still does is counted per file
 * in `no-parsed-state.baseline.ts`, with the card that takes it out, and the count only shrinks: refused are a file the baseline does
 * not hold, a count above the baseline's, and an entry above today's count, for a file clean or gone.
 *
 * The test reads files outside this package; the apps' source is among `guards#test`'s inputs in `turbo.json`, and the packages' reach
 * it through its dependency on `agent-orchestrator`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARSED_STATE } from './no-parsed-state.baseline.ts';
import { counted, namesState, parsedStates, repositoryCounts } from './parsed-state.ts';

type Baseline = Readonly<Record<string, { readonly count: number; readonly card: string }>>;

/** Where the counts live, as a refusal names it. */
const BASELINE = 'tools/guards/test/no-parsed-state.baseline.ts';

const FIX = 'carry the state as a code (its reason, its phase, a verdict.result) and compare the code, never the words';

/**
 * What `counts`, today's measure, and `baseline` disagree on, each a sentence naming the fix, by the file it is about: a file the
 * baseline does not hold, a count above the baseline's, an entry above today's count or for a file clean or gone, and one with no card.
 */
export const breaks = (counts: Readonly<Record<string, number>>, baseline: Baseline): Array<{ file: string; why: string }> => {
  const out: Array<{ file: string; why: string }> = [];
  for (const [file, count] of Object.entries(counts)) {
    const held = baseline[file];
    if (held === undefined)
      out.push({ file, why: `${file} parses a state out of a string ${count} time(s): ${FIX}; never add it to ${BASELINE}` });
    else if (count > held.count)
      out.push({ file, why: `${file} parses a state ${count} time(s), more than the ${held.count} ${BASELINE} allows: ${FIX}` });
  }
  for (const [file, held] of Object.entries(baseline)) {
    const count = counts[file] ?? 0;
    if (!held.card.trim()) out.push({ file, why: `${file} has no card in ${BASELINE}: name the card that takes its parses out` });
    if (count < held.count)
      out.push({
        file,
        why: count
          ? `${file} parses a state ${count} time(s), fewer than ${held.count}: lower its count to ${count} in ${BASELINE}`
          : `${file} parses no state any more, or is gone: take its entry off ${BASELINE}`,
      });
  }
  return out;
};

/** The files `breaks` refuses, in order. */
const refused = (counts: Record<string, number>, baseline: Baseline): string[] => breaks(counts, baseline).map(({ file }) => file);

const CARD = 'a card';

test('the count finds each parse of a state, however it is laid out, and nothing else', () => {
  assert.equal(parsedStates("if (row.status.startsWith('x')) go();\n").length, 1, 'a member');
  assert.equal(parsedStates("const [w] = status.split(' · ');\n").length, 1, 'a name');
  assert.equal(parsedStates("step\n  .status\n  .endsWith(\n    'x',\n  );\n").length, 1, 'a call the formatter laid over lines');
  assert.equal(parsedStates("verdict?.startsWith('exit ');\n(row.phase as string).includes('w');\n").length, 2, 'optional, and cast');
  assert.equal(parsedStates("s.stepWord.match(/x/); S.ROW_STATUS.replace('a', 'b');\n").length, 2, 'a state at the end of a name');
  assert.equal(parsedStates('if (/^exit /.test(verdict)) go();\nUNFINISHED.test(row.status);\n').length, 2, "a pattern's test");
  assert.deepEqual(parsedStates("const a = 1;\nif (row.status.startsWith('x')) go();\n"), ['2: .startsWith of status'], 'by its line');

  assert.deepEqual(parsedStates("// row.status.startsWith('x')\nconst s = 'status.split(1)';\n"), [], 'a comment or a string');
  assert.deepEqual(parsedStates("row.status === 'x'; row.reason.startsWith('W'); words.split(' ');\n"), [], 'a comparison, no state');
  assert.deepEqual(parsedStates("password.includes('x'); keyword.split(' ');\n"), [], 'a state inside a longer word');
  assert.deepEqual(parsedStates('STEP_PHASES.includes(phase); status.trim();\n'), [], 'a state as an argument, another method');
  assert.equal(namesState('rowStatus') && namesState('ROW_PHASE') && namesState('Verdict'), true);

  assert.equal(counted('apps/web/src/lib/status.ts'), true);
  assert.equal(counted('packages/agent-runtime/src/core/domain.ts'), true);
  for (const file of ['apps/web/src/lib/status.test.ts', 'apps/web/src/a.stories.tsx', 'apps/web/test/a.ts', 'apps/docs/src/a.ts'])
    assert.equal(counted(file), false, file);
});

test('a count the baseline holds is let through', () => {
  assert.deepEqual(refused({ 'a.ts': 2 }, { 'a.ts': { count: 2, card: CARD } }), []);
});

test('REFUSED: a file that parses a state, which the baseline does not hold', () => {
  const counts = { 'a.ts': parsedStates("if (row.status.startsWith('x')) go();\n").length };
  assert.deepEqual(refused(counts, {}), ['a.ts']);
});

test('REFUSED: a count above the baseline', () => {
  assert.deepEqual(refused({ 'a.ts': 3 }, { 'a.ts': { count: 2, card: CARD } }), ['a.ts']);
});

test('REFUSED: a baseline entry above the count, or for a file clean or gone', () => {
  assert.deepEqual(refused({ 'a.ts': 1 }, { 'a.ts': { count: 2, card: CARD } }), ['a.ts']);
  assert.deepEqual(refused({}, { 'b.ts': { count: 1, card: CARD } }), ['b.ts']);
});

test('REFUSED: a baseline entry with no card', () => {
  assert.deepEqual(refused({ 'a.ts': 1 }, { 'a.ts': { count: 1, card: ' ' } }), ['a.ts']);
});

test('the repository: no shipped source parses a state but where the baseline holds it, each count only shrinking', () => {
  const counts = repositoryCounts();
  assert.ok(Object.keys(counts).length > 0, 'the count reads the sources: the debt is not empty yet');
  assert.deepEqual(
    breaks(counts, PARSED_STATE).map(({ why }) => why),
    [],
  );
});
