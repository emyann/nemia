/**
 * The board's readers of a run's status (`RunStatus`): what each gives for a run stopped at a gate alone, one waiting on an answer alone
 * and one in which a step broke, and that no file of `src` compares a status to one of the run's words but those listed here
 * (`READERS`, `unlistedReaders`). `TryRun`, the one place that prints the word, is held by `components.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decidableRun, decisionStamp } from '../src/lib/decide.ts';
import { inFlight } from '../src/lib/factory.ts';
import { holdable, holdCandidates } from '../src/lib/hold.ts';
import { prunable } from '../src/lib/prune.ts';
import { RunStatusSchema, type RunStatus } from '../src/lib/api/judged.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');

/** Every word a run's status takes, as the board decodes it. */
const WORDS: readonly RunStatus[] = RunStatusSchema.literals;

/** The files of `src` that compare a run's status to one of its words, each with what it asks of it. */
const READERS: Readonly<Record<string, string>> = {
  'lib/decide.ts': 'whether there is something to decide: not cancelled, and not running unless a step waits on you',
  'lib/factory.ts': 'whether the run is in flight: running, or still moving',
  'lib/hold.ts': 'whether a hold is offered, and what a hold may wait on: not succeeded, not cancelled',
  'lib/prune.ts': 'whether a prune is offered: not running',
};

/** A status compared to a quoted word of the run's, either way round, across line breaks. */
const COMPARED = new RegExp(
  `\\.status\\s*[!=]==?\\s*['"\`](?:${WORDS.join('|')})['"\`]|['"\`](?:${WORDS.join('|')})['"\`]\\s*[!=]==?\\s*[\\w.?]+\\.status\\b`,
);

/** The files among `sources`, by path from `src`, that compare a status to a run's word and are not in `listed`. */
const unlistedReaders = (sources: ReadonlyMap<string, string>, listed: readonly string[]): string[] =>
  [...sources].filter(([file, text]) => COMPARED.test(text) && !listed.includes(file)).map(([file]) => file);

const sourcesOf = (dir: string, under = ''): Map<string, string> =>
  new Map(
    fs.readdirSync(path.join(dir, under), { withFileTypes: true }).flatMap((entry): Array<[string, string]> => {
      const file = path.posix.join(under, entry.name);
      if (entry.isDirectory()) return [...sourcesOf(dir, file)];
      return /\.tsx?$/.test(entry.name) ? [[file, fs.readFileSync(path.join(dir, file), 'utf8')]] : [];
    }),
  );

/** A repository run, nothing of it moving, as the list's row and the answer for one run say it, stopped as `status` says. */
const stopped = (status: RunStatus, waitingOnYou: string[]) => ({
  id: `r-${status}`,
  place: 'repository' as const,
  repo: '/code/app',
  cancelledAt: null,
  pruned: null,
  holding: null,
  heldUntil: [],
  waiting: null,
  toDecide: null,
  moving: false,
  onDisk: { worktrees: true, files: true },
  status,
  waitingOnYou,
  steps: [],
});

const GATE = stopped('awaiting approval', ['land']);
const QUESTION = stopped('blocked', ['implement']);
const BROKE = stopped('failed', ['implement']);

test('the board reads a run at a gate alone, one waiting on an answer alone and one in which a step broke as three runs that stopped: each is offered a hold, a decision and a prune, none is in flight, and each says its own word', () => {
  const other = { ...stopped('running', []), id: 'r-other' };
  for (const run of [GATE, QUESTION, BROKE]) {
    assert.deepEqual(
      {
        holdable: holdable(run),
        heldUntilOffered: holdCandidates(other, [run]).length,
        decidable: decidableRun(run),
        inFlight: inFlight(run),
        prunable: Boolean(prunable(run)),
        stamped: (JSON.parse(decisionStamp(run)) as unknown[])[0],
      },
      { holdable: true, heldUntilOffered: 1, decidable: true, inFlight: false, prunable: true, stamped: run.status },
      run.status,
    );
  }
});

test('REFUSED: a hold of a run that succeeded or was called off, whatever word a stopped one says', () => {
  assert.deepEqual(
    WORDS.map((status) => [status, holdable(stopped(status, []))]),
    [
      ['running', true],
      ['succeeded', false],
      ['failed', true],
      ['cancelled', false],
      ['awaiting approval', true],
      ['blocked', true],
    ],
  );
});

test("every file of src that compares a status to one of the run's words is a listed reader, and every listed reader still does", () => {
  const sources = sourcesOf(SRC);
  assert.deepEqual(unlistedReaders(sources, Object.keys(READERS)), []);
  assert.deepEqual(
    Object.keys(READERS).filter((file) => !COMPARED.test(sources.get(file) ?? '')),
    [],
    'a reader that no longer compares leaves the list',
  );
});

test('REFUSED: a file not listed that compares a status to a word of the run, across a line break and either way round', () => {
  const sources = new Map([
    ['lib/hold.ts', "run.status === 'failed'"],
    ['components/New.tsx', "run.status ===\n  'failed'"],
    ['lib/other.ts', "'awaiting approval' !== row.status"],
    ['lib/clean.ts', "step.status === 'verified'; run.status;"],
  ]);
  assert.deepEqual(unlistedReaders(sources, ['lib/hold.ts']), ['components/New.tsx', 'lib/other.ts']);
});
