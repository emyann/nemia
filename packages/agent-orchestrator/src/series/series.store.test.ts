/**
 * The series' files (`series.store.ts`): a line labelled outside the closed set refused with nothing written, a line that does not read
 * left out and its file said once, and the last line read off a bounded tail of the latest day. A store of its own: `WF_ROOT` is read as
 * the module loads, so it is set before the import.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratch } from '../../test/scratch.ts';

process.env.WF_ROOT = scratch('wf-series-store-');
const { appendLines, dayFile, days, lastLine, readDay, tierDir } = await import('./series.store.ts');
const { metered } = await import('../meter/tally.store.ts');
type RollupLine = import('./series.ts').RollupLine;

const line = (t: string, v: number, l: Record<string, string> = {}): RollupLine => ({
  t,
  s: 'store.runs',
  l,
  n: 1,
  sum: v,
  min: v,
  max: v,
  last: v,
});

const stderrOf = (t: TestContext): string[] => {
  const said: string[] = [];
  t.mock.method(process.stderr, 'write', (text: string) => said.push(text) > 0);
  return said;
};

test('REFUSED: a line labelled by a run, and none of the lines handed with it written', () => {
  fs.rmSync(tierDir('hour'), { recursive: true, force: true });
  assert.throws(
    () => appendLines('hour', [line('2026-10-05T10:00:00.000Z', 1), line('2026-10-05T11:00:00.000Z', 2, { factory: 'f', run: 'r-1' })]),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.message.startsWith('A series line may not be labelled run: ') &&
      err.message.includes('factory, workflow, step, agent'),
  );
  assert.deepEqual(days('hour'), []);
});

test('lines go to the file of their UTC day, and a line that does not read is left out, its file said once', (t) => {
  appendLines('minute', [line('2026-10-04T23:59:00.000Z', 1), line('2026-10-05T00:00:00.000Z', 2)]);
  assert.deepEqual(days('minute'), ['2026-10-04', '2026-10-05']);
  fs.appendFileSync(dayFile('minute', '2026-10-05'), '{"t":"x"}\nnot json\n');
  appendLines('minute', [line('2026-10-05T00:01:00.000Z', 3)]);
  const said = stderrOf(t);
  assert.deepEqual(
    readDay('minute', '2026-10-05').map((x) => x.sum),
    [2, 3],
  );
  assert.deepEqual(said, [`${dayFile('minute', '2026-10-05')}: 2 of its lines did not read as a series line and were left out.\n`]);
  assert.deepEqual(readDay('minute', '2026-01-01'), [], 'no file, no lines');
});

test("the last line is read off the latest day's tail alone, however long the day", async () => {
  fs.rmSync(tierDir('minute'), { recursive: true, force: true });
  appendLines('minute', [line('2026-10-04T10:00:00.000Z', 1)]);
  appendLines(
    'minute',
    Array.from({ length: 2000 }, (_, k) => line(new Date(Date.UTC(2026, 9, 5, 0, 0, k)).toISOString(), k)),
  );
  assert.ok(fs.statSync(dayFile('minute', '2026-10-05')).size > 100_000);
  const { value, tallies } = await metered(async () => lastLine('minute'));
  assert.equal(value?.sum, 1999);
  const bytes = Object.values(tallies!.kinds).reduce((sum, k) => sum + k.bytes, 0);
  assert.equal(bytes, 16_384, 'the tail, not the day');
  fs.rmSync(tierDir('hour'), { recursive: true, force: true });
  assert.equal(lastLine('hour'), undefined, 'none before any is written');
});
