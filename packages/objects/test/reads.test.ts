/**
 * How each read is bounded (`src/reads.ts`): every GET endpoint of the `Api` has an entry in `READS` whose page takes `limit` and
 * `continue` and whose narrowing keys its query takes (`readsUnbounded`), and an Api that gains a read with none, or a page with no
 * `limit`, is refused by name. A closeout and a decision answer their summary unless their parts are asked (`closeoutNarrowed`,
 * `decisionNarrowed`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api';
import {
  Api,
  BODY_PAGE,
  closeoutNarrowed,
  decisionNarrowed,
  READS,
  readsUnbounded,
  SHORT_FIELD,
  type RunDecision,
  type StepCloseout,
} from 'objects';

/** `Api`'s groups with `group` beside them, as `readsUnbounded` reads an Api. */
const withGroup = (group: { readonly identifier: string; readonly endpoints: object }) => ({
  groups: { ...Api.groups, planted: group } as Parameters<typeof readsUnbounded>[0]['groups'],
});

test('every read of the Api is bounded: each GET has an entry, a page takes limit and continue, and each narrowing key is its query’s', () => {
  assert.deepEqual(readsUnbounded(Api), []);
});

test('REFUSED: a GET the Api gains with no entry in READS, a page whose query takes no limit, and a key its query does not take', () => {
  const planted = HttpApiGroup.make('planted').add(
    HttpApiEndpoint.get('list', '/api/planted', { query: { continue: Schema.optionalKey(Schema.String) }, success: Schema.String }),
  );
  assert.equal(readsUnbounded(withGroup(planted)).length, 1, 'no entry');
  const noLimitAndTwoKeysItLacks = readsUnbounded(withGroup(planted), {
    ...READS,
    'planted.list': { shape: 'page', narrow: ['limit', 'tail'] },
  });
  assert.equal(noLimitAndTwoKeysItLacks.length, 3);
});

/** A closeout with a short output field, a long one and a body of `body` characters. */
const closeoutOf = (body: number): StepCloseout => ({
  apiVersion: 'nemia/v1',
  outcome: 'done',
  summary: 's',
  body: 'b'.repeat(body),
  needs: null,
  artifacts: [],
  values: [],
  refused: [],
  output: { short: 'x'.repeat(30), long: 'y'.repeat(SHORT_FIELD + 1) },
  missing: [],
  replies: null,
  schema: { short: {}, long: {} },
  questions: [],
  raw: { whole: true },
});

test('a closeout read with no fields keeps its short output fields and names the long ones; * keeps every one', () => {
  const narrowed = closeoutNarrowed(closeoutOf(10), undefined);
  assert.deepEqual(Object.keys(narrowed.output), ['short']);
  assert.deepEqual(narrowed.outputLeftOut, ['long']);
  assert.equal(narrowed.raw, null);
  const every = closeoutNarrowed(closeoutOf(10), ['*']);
  assert.deepEqual(Object.keys(every.output), ['short', 'long']);
  assert.deepEqual(every.outputLeftOut, []);
  assert.deepEqual(every.raw, { whole: true });
  assert.deepEqual(Object.keys(closeoutNarrowed(closeoutOf(10), ['long']).output), ['long']);
});

test('a closeout’s body is read by page: the default page, then on from bodyNext to its end, never past the most', () => {
  const first = closeoutNarrowed(closeoutOf(100_000), undefined);
  assert.equal(first.body?.length, BODY_PAGE.byDefault);
  assert.equal(first.bodyNext, BODY_PAGE.byDefault);
  const rest = closeoutNarrowed(closeoutOf(100_000), undefined, { from: BODY_PAGE.byDefault, limit: 100_000 });
  assert.equal(rest.body?.length, 100_000 - BODY_PAGE.byDefault);
  assert.equal(rest.bodyNext, undefined);
  const raw = { body: 'b'.repeat(100_000), long: 'y' };
  const every = closeoutNarrowed({ ...closeoutOf(100_000), raw }, ['*']);
  assert.deepEqual(every.raw, { body: 'b'.repeat(BODY_PAGE.byDefault), long: 'y' }, 'its raw holds the same page of the body');
  const capped = closeoutNarrowed(closeoutOf(BODY_PAGE.most + 10), undefined, { from: 0, limit: BODY_PAGE.most * 2 });
  assert.equal(capped.body?.length, BODY_PAGE.most);
  assert.equal(capped.bodyNext, BODY_PAGE.most);
});

/** A decidable run's decision holding one branch's diff of two files. */
const decisionOf = (): RunDecision =>
  ({
    standings: [],
    touched: [],
    lesson: { said: '', state: 'none' },
    sensitive: [
      {
        branch: 'b',
        error: null,
        files: [
          { path: 'a.ts', lines: ['+a'], cut: 0 },
          { path: 'b.ts', lines: ['+b'], cut: 0 },
        ],
      },
    ],
  }) as unknown as RunDecision;

/** The lines each file of the decision's diff answers, by its path. */
const linesOf = (decision: RunDecision) =>
  'sensitive' in decision ? decision.sensitive.flatMap((b) => b.files.map((f) => [f.path, f.lines.length])) : [];

test('a decision read with no diffs answers none whole; a path answers its own, and * every one', () => {
  assert.deepEqual(linesOf(decisionNarrowed(decisionOf(), undefined)), [
    ['a.ts', 0],
    ['b.ts', 0],
  ]);
  assert.deepEqual(linesOf(decisionNarrowed(decisionOf(), ['a.ts'])), [
    ['a.ts', 1],
    ['b.ts', 0],
  ]);
  assert.deepEqual(linesOf(decisionNarrowed(decisionOf(), ['*'])), [
    ['a.ts', 1],
    ['b.ts', 1],
  ]);
});
