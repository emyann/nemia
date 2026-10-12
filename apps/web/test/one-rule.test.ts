/**
 * One word for a wait and for in flight, the api's: the footer and the gauges (`atWork`), a factory's bar (`openBlockOf`) and the bell
 * name the same runs on the same light answer, and no reader of the frame applies the board's own rule for the whole list to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Factory } from '../src/lib/api.ts';
import { bellRows } from '../src/lib/bell.ts';
import { openBlockOf } from '../src/lib/factories.ts';
import { inFlight, openRows } from '../src/lib/factory.ts';
import { atWork } from '../src/lib/footer.ts';
import { summary } from './run-fixtures.ts';

const SRC = path.resolve(import.meta.dirname, '../src');

const nemia = { name: 'nemia', default: false, repos: [], workflows: [], hires: {}, error: null } as unknown as Factory;

/** A run that still moves while a step of it waits at its gate, a running run at its gate, and one run that only moves. */
const both = summary(
  [
    ['design', 'running (working)'],
    ['plan', 'awaiting approval'],
  ],
  { id: 'r-both', factory: 'nemia', waitingOnYou: ['plan'] },
);
const gate = summary([['plan', 'awaiting approval']], { id: 'r-gate', factory: 'nemia', moving: false, waitingOnYou: ['plan'] });
const moving = summary([['build', 'checking']], { id: 'r-moving', factory: 'nemia' });
const open = { counts: { waiting: 2, inFlight: 1, finished: 4 }, waiting: [both, gate], inFlight: [moving] };

test('REFUSED: the footer, the gauges, the factory bar and the bell name the same runs on the same answer', () => {
  const footer = atWork(open);
  const bar = openBlockOf(nemia, open);
  assert.equal(footer.runs, open.counts.inFlight, 'the footer and the gauges, both off atWork');
  assert.equal(bar.inFlight, open.counts.inFlight, "a factory's bar");
  assert.equal(footer.runs, 1);
  assert.equal(bar.waitsOnYou, open.counts.waiting, "the bar's waiting and the bell's count");
  assert.equal(bellRows(open.waiting).length, open.counts.waiting, 'the bell lists the runs the count names');
  assert.equal(bar.runs, 7);
  assert.equal(
    openRows(open).filter(inFlight).length,
    3,
    "the whole list's rule counts a run that waits and moves, and a running run at its gate, in flight too: the frame would say 3",
  );
  assert.equal(footer.sessions, 2, 'the session of the run that also waits still works, and counts');
});

/** `text` from the declaration of `from` up to the next exported declaration, or its end. */
function declared(text: string, from: string): string {
  const start = text.indexOf(`export const ${from}`);
  assert.notEqual(start, -1, `${from} is declared`);
  const next = text.indexOf('\nexport ', start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

/** Each use of the whole list's rule in `text`, called or handed on: its name where it is no key of an answer or of a record. */
const wholeListRule = (text: string): string[] => [...text.matchAll(/(?<![.\w'"])(?:inFlight|waitsOnYou)\b(?!\s*[:?])/g)].map((m) => m[0]);

test("REFUSED: no reader of the frame applies the whole list's rule to the light answer", () => {
  const read = (file: string) => fs.readFileSync(path.join(SRC, file), 'utf8');
  const frame = ['lib/footer.ts', 'lib/bell.ts', 'components/FrameFooter.tsx', 'components/GaugesBar.tsx', 'components/FrameHeader.tsx'];
  for (const file of [...frame, 'components/FactoryBar.tsx', 'components/WaitingBar.tsx']) {
    assert.deepEqual(wholeListRule(read(file)), [], `${file} reads the api's counts, never inFlight nor waitsOnYou`);
  }
  const bar = declared(read('lib/factories.ts'), 'openBlockOf');
  assert.match(bar, /counts\.inFlight/, 'the slice holds the bar');
  assert.deepEqual(wholeListRule(bar), [], "openBlockOf reads the api's counts");
  assert.equal(
    wholeListRule(declared(read('lib/factories.ts'), 'blockOf')).length,
    2,
    'the scan finds the rule where the whole list uses it',
  );
  assert.deepEqual(wholeListRule('runs: runs.filter(inFlight).length, waitsOnYou(run)'), ['inFlight', 'waitsOnYou']);
  assert.deepEqual(wholeListRule('inFlight: open.counts.inFlight, more: block.waitsOnYou > 0, inFlight?: number'), []);
});
