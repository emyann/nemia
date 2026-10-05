/**
 * What the daemon says of a pass (`passSaid`) and how it says it (`logPass`): as logs, through whatever logger the process provides, each
 * annotated with the run and the steps it is about, and each failure said once while it stands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Logger, References } from 'effect';
import { logPass, NOTHING_SAID, passSaid, type UpSaid } from './up.verb.ts';
import type { Pass } from '../tick/tick.verb.ts';

/** A pass that advanced one run, `r-1`: a note, `implement` filed and `review` checking; the rest of an `Advanced` is not read here. */
const advanced = (): Pass =>
  ({
    runs: [{ run: { id: 'r-1' }, notes: ['review: waits on implement'], filed: ['implement'], tried: [], looped: [], checked: ['review'] }],
  }) as never;

/** What a capturing logger was handed: each log's level, its message's text and its annotations. */
type Logged = { level: string; text: string; annotations: Record<string, unknown> };

/** Runs `logPass` under a logger that keeps what it is handed, in place of every other: answers with what it kept and what was said. */
async function logged(pass: Pass, was: UpSaid = NOTHING_SAID): Promise<{ logs: Logged[]; said: UpSaid }> {
  const logs: Logged[] = [];
  const keeper = Logger.make(({ message, logLevel, fiber }) => {
    logs.push({
      level: logLevel,
      text: (Array.isArray(message) ? message : [message]).join(' '),
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    });
  });
  const said = await Effect.runPromise(logPass(pass, was).pipe(Effect.provide(Logger.layer([keeper]))));
  return { logs, said };
}

test('a pass that advanced a run is logged at Info, each line annotated with its run, and a line that names steps with them', async () => {
  const { logs } = await logged(advanced());
  assert.deepEqual(logs, [
    { level: 'Info', text: 'r-1  review: waits on implement', annotations: { run: 'r-1' } },
    { level: 'Info', text: 'r-1  filed implement', annotations: { run: 'r-1', step: 'implement' } },
    { level: 'Info', text: 'r-1  checking review', annotations: { run: 'r-1', step: 'review' } },
  ]);
});

test('a pass that filed two steps of a run says each on a line of its own, annotated with that step alone', async () => {
  const pass = { runs: [{ run: { id: 'r-1' }, notes: [], filed: ['a', 'b'], tried: [], looped: [], checked: [] }] } as never as Pass;
  const { logs } = await logged(pass);
  assert.deepEqual(logs, [
    { level: 'Info', text: 'r-1  filed a', annotations: { run: 'r-1', step: 'a' } },
    { level: 'Info', text: 'r-1  filed b', annotations: { run: 'r-1', step: 'b' } },
  ]);
});

test('a failure is a warning, said once while it stands and again once it cleared and came back; a quiet pass says nothing', async () => {
  const failing = { runs: [], feedError: 'the feed could not be written', unreadable: ['t-1: a line no runtime wrote'] } as never as Pass;
  const first = await logged(failing);
  assert.deepEqual(
    first.logs.map((l) => [l.level, l.text]),
    [
      ['Warn', 'the feed could not be written'],
      ['Warn', 'left out: t-1: a line no runtime wrote'],
    ],
  );
  const again = await logged(failing, first.said);
  assert.deepEqual(again.logs, [], 'said once while it stands');
  const cleared = await logged({ runs: [] }, again.said);
  assert.deepEqual(cleared.logs, [], 'a quiet pass says nothing');
  const back = await logged(failing, cleared.said);
  assert.equal(back.logs.length, 2, 'and again once it came back');
});

test('passSaid is the words alone, the lines logPass logs, read with no logger', () => {
  const { lines } = passSaid(advanced(), NOTHING_SAID, Date.parse('2026-10-05T08:00:00Z'));
  assert.deepEqual(
    lines.map((l) => l.text),
    ['r-1  review: waits on implement', 'r-1  filed implement', 'r-1  checking review'],
  );
});

test('a forgetting line is said once while its words stand, and again once they change, with its warning', async () => {
  const forgetting = (text: string, warn?: true) => ({ runs: [], forgetting: [{ text, ...(warn ? { warn } : {}) }] }) as never as Pass;
  const waiting = 'r-9 (removed): the engine forgot 1 task of it, and 1 waits to settle';
  const first = await logged(forgetting(waiting));
  assert.deepEqual(
    first.logs.map((l) => [l.level, l.text]),
    [['Info', waiting]],
  );
  const again = await logged(forgetting(waiting), first.said);
  assert.deepEqual(again.logs, [], 'said once while its words stand');
  const refused = 'r-9 (removed): the engine refused to forget r-9-implement';
  const changed = await logged(forgetting(refused, true), again.said);
  assert.deepEqual(
    changed.logs.map((l) => [l.level, l.text]),
    [['Warn', refused]],
    'said again once they change',
  );
});
