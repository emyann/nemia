/**
 * The feed on disk (`nemia watch`), as its writer and its readers make it, in a store of its own: the one-shots `recordFeed` writes
 * once per occurrence across a restart, a cursor that never passes a partial line, the lines `readFeed` reads whatever their shape, the
 * cursor a watch hands each line on with, a watch's races with the file it follows, and what `--help` says of it; and the pure parts —
 * `feedPhase`, `feedWords`, the fold and the diff, and the bytes a line is published at — beside the file, since what matters of them is
 * what the file ends up saying.
 *
 * A run's feed as the tick writes it, pass by pass, and `nemia watch` reading it, is `test/run-feed.test.ts`'s; the hub and its live
 * readers `feed.verb.test.ts`'s. `WF_ROOT` is read as the module loads, so it is set before the import.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, Fiber } from 'effect';
import { testEngine, bell, until, WAITED } from 'agent-runtime/testing';
import type { Run } from '../record/record.ts';
import { listing } from '../list/list.ts';
import {
  feedChanges,
  feedPhase,
  feedWords,
  FEED_VERSION,
  foldFeed,
  freshFold,
  isRunLine,
  publishedOf,
  REMOVED,
  upgraded,
  type FeedLine,
  type FeedWords,
  type Reason,
  type RunLine,
} from './feed.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-feed-');
const FEED = path.join(ROOT, 'feed.jsonl');

process.env.WF_ROOT = ROOT;
const store = await import('./feed.store.ts');
const { feedCursorRefusal, freshFeedMemo, readFeed, watchFeed } = store;
/** The lines the feed's writer wrote (`recordFeed`), as a pass hands it what it judged. */
const recordFeed = (...args: Parameters<typeof store.recordFeed>) => store.recordFeed(...args).lines;
const { main, watchPrinted, watching } = await import('../cli/main.ts');
const { engineOf } = await import('../runtime-client.ts');

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (pattern: RegExp) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && pattern.test(err.message);

/** A store with no feed. */
const emptyStore = () => fs.rmSync(FEED, { force: true });

/** Every line in the feed, read off the file as a reader with cursor 0 would. */
const lines = (): RunLine[] => readFeed(0).lines.filter(isRunLine);
const size = (): number => fs.statSync(FEED, { throwIfNoEntry: false })?.size ?? 0;

/** What a pass judged of a step at work, with the calls `denials` says it was denied, and the labels a filing gives it. */
const atWork = (denials: readonly { step: string; try: number; call: string }[]): FeedWords => ({
  run: { word: 'running' },
  labels: { run: 'r-1', factory: 'nemia', workflow: 'build' },
  steps: [{ name: 'plan', word: 'running', labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' } }],
  denials,
});

/** Every one-shot the feed holds, in order, with the fields a selector matches one by. */
const shots = () =>
  lines()
    .filter((l) => l.reason === 'ToolDenied')
    .map((l) => ({ step: l.step, word: l.word, note: l.note, call: l.call, try: l.try, type: l.type, source: l.source, waits: l.waits }));

/**
 * What a pass judged of a run a person has acted on, with the one-shots the pass read of it beside its words: a person's acts
 * (`actsOf`), the runtime's faults (`faultsOf`), and the two moments a hold is paired by.
 */
const withOnce = (once: Pick<FeedWords, 'acts' | 'faults' | 'held' | 'lifted'>): FeedWords => ({
  run: { word: 'running' },
  labels: { run: 'r-1', factory: 'nemia', workflow: 'build' },
  steps: [{ name: 'plan', word: 'running', labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' } }],
  ...once,
});

/** Every line of one reason the feed holds, in order, with the fields a selector matches one by. */
const said = (reason: Reason) =>
  lines()
    .filter((l) => l.reason === reason)
    .map((l) => ({ run: l.run, step: l.step, word: l.word, note: l.note, try: l.try, type: l.type, source: l.source, waits: l.waits }));

/** A person's three acts on one run, each as the record carries them after the verb wrote the person's own file. */
const AT = '2026-10-16T04:00:00.000Z';
const APPROVED = { run: 'r-1', step: 'plan', word: 'approved', note: 'try 1 · at 2026-10-16T03:00:00.000Z', try: 1 };
const CANCELLED = { word: 'cancel asked', note: 'at 2026-10-16T03:30:00.000Z' };

test("recordFeed writes a one-shot once per occurrence, counted off the feed's own lines, and a restarted daemon neither again nor never", async (t) => {
  await t.test(
    'a denial journalled once writes one one-shot line over ten passes, counted by the step and the try alone — and a restart writes it neither again nor never',
    () => {
      emptyStore();
      const push = { step: 'plan', try: 1, call: 'Bash(git push)' };
      const memo = freshFeedMemo();
      const at = '2026-10-16T04:00:00.000Z';
      for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', atWork([push])]]), { at, memo });
      assert.deepEqual(
        shots(),
        [
          {
            step: 'plan',
            word: 'denied: Bash(git push)',
            note: 'try 1',
            call: 'Bash(git push)',
            try: 1,
            type: 'Warning',
            source: 'runtime',
            waits: undefined,
          },
        ],
        'one denial the runtime journalled is one line, however many passes read it',
      );
      assert.equal(
        lines().find((l) => l.reason === 'ToolDenied')!.message,
        'denied: Bash(git push) · try 1',
        "the message a person reads is the owner's wording",
      );

      recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo });
      recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo });
      assert.equal(shots().length, 2, 'the same call denied a second time in the same try is one more line, and no repeat of the first');

      const restarted = freshFeedMemo();
      recordFeed(new Map([['r-1', atWork([push, push])]]), { at, memo: restarted });
      assert.equal(shots().length, 2, 'a daemon with no fold reads the feed and writes neither of them again');
      recordFeed(new Map([['r-1', atWork([push, push, push])]]), { at, memo: restarted });
      assert.equal(shots().length, 3, 'nor misses the third');
    },
  );
  await t.test('REFUSED: a one-shot is counted by the step and the try, not by what it reads back as a message', () => {
    emptyStore();
    const memo = freshFeedMemo();
    const at = '2026-10-16T04:00:00.000Z';
    const first = { step: 'plan', try: 1, call: 'Bash(ls)' };
    recordFeed(new Map([['r-1', atWork([first])]]), { at, memo });
    assert.equal(shots().length, 1);
    const reworded = freshFeedMemo();
    recordFeed(new Map([['r-1', atWork([{ ...first, call: 'Bash(ls) — reworded by a newer nemia' }])]]), { at, memo: reworded });
    assert.equal(shots().length, 1, 'a denial of the same step and try, worded anew, is the one the feed holds — not a second');
    recordFeed(new Map([['r-1', atWork([first, { ...first, try: 2 }])]]), { at, memo: freshFeedMemo() });
    assert.equal(shots().length, 2, 'and the same call on another try is its own line');
  });
  await t.test("a person's act is one line per act, never one per pass — and a restarted daemon writes it neither again nor never", () => {
    emptyStore();
    const memo = freshFeedMemo();
    const acts = withOnce({ acts: [APPROVED, CANCELLED], held: '2026-10-16T03:45:00.000Z' });
    for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', acts]]), { at: AT, memo });
    assert.deepEqual(
      [...said('Approved'), ...said('CancelAsked'), ...said('HoldPut')],
      [
        {
          run: 'r-1',
          step: 'plan',
          word: 'approved',
          note: 'try 1 · at 2026-10-16T03:00:00.000Z',
          try: 1,
          type: 'Normal',
          source: 'person',
          waits: undefined,
        },
        {
          run: 'r-1',
          step: undefined,
          word: 'cancel asked',
          note: 'at 2026-10-16T03:30:00.000Z',
          try: undefined,
          type: 'Normal',
          source: 'person',
          waits: undefined,
        },
        {
          run: 'r-1',
          step: undefined,
          word: 'hold put',
          note: 'since 2026-10-16T03:45:00.000Z',
          try: undefined,
          type: 'Normal',
          source: 'person',
          waits: undefined,
        },
      ],
      "each of a person's three acts is one line, the person's deed, over ten passes that read the same record",
    );
    assert.equal(
      lines().find((l) => l.reason === 'Approved')!.message,
      'approved · try 1 · at 2026-10-16T03:00:00.000Z',
      'and what a person reads of it is the word and its note',
    );

    const restarted = freshFeedMemo();
    for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', acts]]), { at: AT, memo: restarted });
    assert.equal(
      [...said('Approved'), ...said('CancelAsked'), ...said('HoldPut')].length,
      3,
      'a daemon with no fold reads the feed and writes none of them again',
    );
  });
  await t.test('a second act of the same kind gets its own line: the try an approval opens is part of what counts it', () => {
    emptyStore();
    const memo = freshFeedMemo();
    const first = { acts: [APPROVED] };
    recordFeed(new Map([['r-1', withOnce(first)]]), { at: AT, memo });
    const again = { run: 'r-1', step: 'plan', word: 'approved', note: 'try 2 · at 2026-10-16T05:00:00.000Z', try: 2 };
    for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', withOnce({ acts: [APPROVED, again] })]]), { at: AT, memo });
    assert.deepEqual(
      said('Approved').map((l) => [l.try, l.note]),
      [
        [1, 'try 1 · at 2026-10-16T03:00:00.000Z'],
        [2, 'try 2 · at 2026-10-16T05:00:00.000Z'],
      ],
      'a step approved again on a later try says so once more, and the first approval is not repeated',
    );
  });
  await t.test('a hold a person lifted by hand says so once, read off the put the feed holds and the hold the record no longer has', () => {
    emptyStore();
    const memo = freshFeedMemo();
    const put = '2026-10-16T03:45:00.000Z';
    const none = { acts: [] };
    for (let i = 0; i < 2; i++) recordFeed(new Map([['r-1', withOnce({ ...none, held: put })]]), { at: AT, memo });
    assert.equal(said('HoldLifted').length, 0, 'while the hold stands, no lift is due');
    for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', withOnce(none)]]), { at: AT, memo });
    assert.deepEqual(
      said('HoldLifted'),
      [
        {
          run: 'r-1',
          step: undefined,
          word: 'hold lifted',
          note: `since ${put}`,
          try: undefined,
          type: 'Normal',
          source: 'person',
          waits: undefined,
        },
      ],
      "a hold gone with no pass having lifted it is the person's deed, said exactly once over ten passes after it",
    );

    const again = '2026-10-16T06:00:00.000Z';
    for (let i = 0; i < 2; i++) recordFeed(new Map([['r-1', withOnce({ ...none, held: again })]]), { at: AT, memo });
    for (let i = 0; i < 5; i++) recordFeed(new Map([['r-1', withOnce(none)]]), { at: AT, memo });
    assert.deepEqual(
      [said('HoldPut').map((l) => l.note), said('HoldLifted').map((l) => l.note)],
      [
        [`since ${put}`, `since ${again}`],
        [`since ${put}`, `since ${again}`],
      ],
      'a hold put, lifted, put and lifted again is two puts and two lifts, each told apart by the moment its hold was put',
    );
    const restarted = freshFeedMemo();
    for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', withOnce(none)]]), { at: AT, memo: restarted });
    assert.equal(said('HoldLifted').length, 2, 'and a daemon with no fold writes neither lift a second time');
  });
  await t.test(
    "a hold the tick lifted itself is the tick's deed, not the person's — the pass that lifted it is the only thing that knows",
    () => {
      emptyStore();
      const memo = freshFeedMemo();
      const put = '2026-10-16T03:45:00.000Z';
      recordFeed(new Map([['r-1', withOnce({ acts: [], held: put })]]), { at: AT, memo });
      for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', withOnce({ acts: [], lifted: put })]]), { at: AT, memo });
      assert.deepEqual(
        said('HoldLifted'),
        [
          {
            run: 'r-1',
            step: undefined,
            word: 'hold lifted',
            note: `since ${put}`,
            try: undefined,
            type: 'Normal',
            source: 'tick',
            waits: undefined,
          },
        ],
        "one line, sourced tick: the pass's own offer and the absence rule's are one occurrence, so the absence rule adds none",
      );
    },
  );
  await t.test("a hold the pass lifted on the very pass that read it still says the person's put, not the lift alone", () => {
    emptyStore();
    const memo = freshFeedMemo();
    const put = '2026-10-16T03:45:00.000Z';
    for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', withOnce({ acts: [], lifted: put })]]), { at: AT, memo });
    assert.deepEqual(
      [...said('HoldPut'), ...said('HoldLifted')].map((l) => [l.word, l.note, l.source]),
      [
        ['hold put', `since ${put}`, 'person'],
        ['hold lifted', `since ${put}`, 'tick'],
      ],
      "liftHold takes the hold off the record before the pass is worded, so a pass that reads one and lifts it sees only its lift: the person's own nemia hold must not lose its line there, and neither is said twice over ten passes",
    );
  });
  await t.test('each fault the runtime journalled is one line per occurrence, and neither waits on a person', () => {
    emptyStore();
    const memo = freshFeedMemo();
    const faults = [
      { run: 'r-1', step: 'plan', word: 'nothing started', note: 'try 1', try: 1 },
      { run: 'r-1', step: 'plan', word: 'session lost', note: 'try 1', try: 1 },
      { run: 'r-1', step: 'plan', word: 'session lost', note: 'try 1', try: 1 },
    ];
    for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', withOnce({ acts: [], faults })]]), { at: AT, memo });
    assert.deepEqual(
      [...said('SpawnFailed'), ...said('SessionLost')],
      [
        { run: 'r-1', step: 'plan', word: 'nothing started', note: 'try 1', try: 1, type: 'Warning', source: 'runtime', waits: undefined },
        { run: 'r-1', step: 'plan', word: 'session lost', note: 'try 1', try: 1, type: 'Warning', source: 'runtime', waits: undefined },
        { run: 'r-1', step: 'plan', word: 'session lost', note: 'try 1', try: 1, type: 'Warning', source: 'runtime', waits: undefined },
      ],
      'two attempts of one try lost are two lines and the spawn refused is a third, each the runtime telling us and waking nobody',
    );
    const restarted = freshFeedMemo();
    for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', withOnce({ acts: [], faults })]]), { at: AT, memo: restarted });
    assert.equal([...said('SpawnFailed'), ...said('SessionLost')].length, 3, 'and a daemon with no fold writes none of them again');
    for (let i = 0; i < 2; i++)
      recordFeed(new Map([['r-1', withOnce({ acts: [], faults: [...faults, faults[1]] })]]), { at: AT, memo: restarted });
    assert.equal(said('SessionLost').length, 3, 'nor misses a third attempt lost');
  });
  await t.test('REFUSED: a one-shot holds no entry in the fold — the step says its own word once, however many denials it carries', () => {
    emptyStore();
    const memo = freshFeedMemo();
    const at = '2026-10-16T04:00:00.000Z';
    const denied = { step: 'plan', try: 1, call: 'Bash(git push)' };
    const state = () =>
      lines()
        .filter((l) => l.step === 'plan' && l.reason !== 'ToolDenied')
        .map((l) => l.word);
    for (let i = 0; i < 3; i++) recordFeed(new Map([['r-1', atWork([denied])]]), { at, memo });
    assert.deepEqual(state(), ['running'], "the step's word is said once");
    const done = { ...atWork([denied]), steps: [{ name: 'plan', word: 'unverified · done' }] };
    for (let i = 0; i < 10; i++) recordFeed(new Map([['r-1', done]]), { at, memo });
    assert.deepEqual(state(), ['running', 'unverified · done'], 'and its next word once — never again on every pass');
    assert.equal(shots().length, 1, 'and its denial stays one line');
  });
});

test('the cursor never passes a partial line: a line being written is not read, nor stepped over, and is read once it ends', () => {
  emptyStore();
  const whole = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
  const next = JSON.stringify({ at: '2026-09-22T10:00:04.000Z', run: 'r-a', step: 'plan', word: 'pending' });
  fs.writeFileSync(FEED, `${whole}\n${next.slice(0, 20)}`);

  const first = readFeed(0);
  assert.deepEqual(
    first.lines.map((l) => l.word),
    ['running'],
  );
  assert.equal(first.cursor, Buffer.byteLength(whole) + 1, 'the cursor stops where the partial line starts');
  assert.deepEqual(
    readFeed(first.cursor),
    { lines: [], cursor: first.cursor },
    'and reading from there again reads nothing, and moves nothing',
  );

  fs.appendFileSync(FEED, `${next.slice(20)}\n`);
  const second = readFeed(first.cursor);
  assert.deepEqual(
    second.lines.map((l) => l.word),
    ['pending'],
    'the line is read once it ends',
  );
  assert.equal(second.cursor, size());
});

test('readFeed reads every line whose fields are text, whatever its writer signed of it, and the lines after one that is not', async (t) => {
  await t.test('a line whose step or note is not text is read by nobody, and the lines after it are read', () => {
    emptyStore();
    const at = '2026-09-22T10:00:00.000Z';
    const bad = [
      { at, run: 'r-a', step: 3, word: 'running' },
      { at, run: 'r-a', word: 'blocked', note: { needs: 'a key' } },
    ];
    const good = { at, run: 'r-a', step: 'plan', word: 'pending', note: 'waits on you' };
    fs.writeFileSync(FEED, [...bad, good].map((l) => `${JSON.stringify(l)}\n`).join(''));
    const read = readFeed(0);
    assert.deepEqual(read.lines, [upgraded(good)], 'the one line that reads is read, upgraded to a v1 signal');
    assert.equal(read.cursor, size());
  });
  await t.test('a v1 line only half signed is read all the same, and every key it lacks is filled in from its word and its note', () => {
    emptyStore();
    const at = '2026-09-22T10:00:00.000Z';
    const half = [
      { at, run: 'r-a', step: 'plan', word: 'awaiting approval', involved: { kind: 'Step', name: 'r-a/plan' } },
      { at, run: 'r-a', step: 'plan', word: 'denied: Bash(ls)', note: 'try 1', call: 'Bash(ls)' },
      { at, run: 'r-a', word: 'running', reason: 'ReasonANewerNemiaNamed', apiVersion: 'nemia/v2' },
    ];
    fs.writeFileSync(FEED, half.map((l) => `${JSON.stringify(l)}\n`).join(''));
    const read = readFeed(0).lines;
    assert.equal(read.length, 3, 'no line is dropped for a key it lacks, or for one this nemia does not know');
    assert.deepEqual(
      { reason: read[0].reason, waits: read[0].waits, source: read[0].source },
      { reason: 'AwaitingApproval', waits: 'person', source: 'tick' },
      'a line with an involved and no reason is read by its word',
    );
    assert.deepEqual(
      { reason: read[1].reason, call: read[1].call, try: read[1].try, source: read[1].source },
      { reason: 'ToolDenied', call: 'Bash(ls)', try: undefined, source: 'runtime' },
      'a one-shot with no try is a one-shot, and the try it lacks is not invented',
    );
    assert.equal(read[2].reason, 'ReasonANewerNemiaNamed', 'a line a newer nemia signed is passed on as its writer judged it');
    const fold = foldFeed(freshFold(), read);
    assert.deepEqual([...fold.said.keys()], ['Step/r-a/plan', 'Run/r-a'], 'and the fold reads each by what it is about');
    assert.deepEqual(
      [...fold.shots.entries()],
      [['ToolDenied Step/r-a/plan#0#try 1', 1]],
      'the one-shot is counted under its reason, what it is about, the try it lacks and the note that tells it from another',
    );
  });
});

test(
  'a watch hands each line on with its own cursor: the byte after it, in bytes not characters, where a reader resumes with the lines after it and no other',
  WAITED,
  async (t) => {
    emptyStore();
    const line = (run: string, word: string, note?: string) =>
      JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run, word, ...(note ? { note } : {}) });
    fs.writeFileSync(
      FEED,
      [
        line('r-a', 'running'),
        line('r-a', 'awaiting approval', 'round 2 — asked — approve it'),
        '{"at":"2026-09-22T10:00:00.000Z","run":"r-torn","wo',
        line('r-b', 'running'),
        line('r-a', 'done'),
      ]
        .map((l) => `${l}\n`)
        .join(''),
    );
    const whole = readFeed(0);
    assert.equal(
      whole.lines.length,
      4,
      'a note of three-byte dashes, then a line a writer died in, ended by the next: its bytes move the cursor and it is handed on to nobody',
    );

    const got: { line: FeedLine; cursor: number }[] = [];
    const arrived = bell();
    const watch = watchFeed({
      intervalMs: 20,
      onLine: (l, cursor) => {
        got.push({ line: l, cursor });
        arrived.ring();
      },
    });
    try {
      await until(
        t,
        () => got.length >= whole.lines.length,
        () => `all ${whole.lines.length} lines handed by the watch; it handed ${got.length}`,
        { bell: arrived },
      );
    } finally {
      watch.stop();
    }

    assert.deepEqual(
      got.map((g) => g.line),
      whole.lines,
      'every line, once, in order',
    );
    for (const [i, { cursor }] of got.entries()) {
      assert.equal(feedCursorRefusal(cursor), undefined, `line ${i}'s cursor is one the feed takes`);
      assert.deepEqual(readFeed(cursor).lines, whole.lines.slice(i + 1), `from line ${i}'s cursor, the lines after it and no other`);
    }
    assert.equal(got.at(-1)!.cursor, whole.cursor, "the last line's cursor is the end a read hands out");
    assert.equal(
      got[2].cursor - got[1].cursor > Buffer.byteLength(line('r-b', 'running')) + 1,
      true,
      "the torn line's bytes are counted into the next line's cursor",
    );
  },
);

test(
  "a feed that goes between a watch's stat of it and the read after it is said as the cut it is, never as a cursor past its end",
  WAITED,
  async (t) => {
    emptyStore();
    const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
    fs.writeFileSync(FEED, `${line}\n${line}\n`);
    const from = size();
    const cuts: string[] = [];
    const errors: string[] = [];
    const said = bell();
    const open = fs.openSync;
    let opens = 0;
    t.mock.method(fs, 'openSync', ((file: fs.PathLike, flags: string) => {
      const fd = open(file, flags);
      if (String(file) === FEED && ++opens === 2) fs.rmSync(FEED, { force: true });
      return fd;
    }) as typeof fs.openSync);
    const watch = watchFeed({
      from,
      intervalMs: 20,
      onLine: () => {},
      onCut: (cut) => {
        cuts.push(cut);
        said.ring();
      },
      onError: (err) => {
        errors.push((err as Error).message ?? String(err));
        said.ring();
      },
    });
    try {
      await until(t, () => cuts.length + errors.length > 0, 'the feed gone under the beat said', { bell: said });
    } finally {
      watch.stop();
    }
    assert.deepEqual(errors, [], 'a watch following never says a cursor-by-hand refusal');
    assert.equal(cuts.length, 1, 'the cut is said once');
    assert.match(
      cuts[0],
      /^the feed was deleted under this watch at cursor \d+/,
      'there at the stat of the beat and gone at the read after it: the deletion, not a cursor past the end',
    );
  },
);

test(
  '`nemia watch` says it is watching only once it holds its cursor: a feed cut the moment the banner is read is said, not refused',
  WAITED,
  async (t) => {
    emptyStore();
    const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
    fs.writeFileSync(FEED, `${line}\n${line}\n`);
    const from = size();
    const out: string[] = [];
    const err: string[] = [];
    const said = bell();
    t.mock.method(console, 'log', (...a: unknown[]) => {
      out.push(a.join(' '));
      if (a.join(' ').startsWith('watching from')) fs.truncateSync(FEED, 0);
    });
    t.mock.method(console, 'error', (...a: unknown[]) => {
      err.push(a.join(' '));
      said.ring();
    });
    const watch = watchPrinted(from);
    try {
      assert.deepEqual(
        out,
        [`watching from ${from}, ^C to stop`],
        "a reader acts on the banner at once, as fast as it can: in this process, before the next line of the watch's own start",
      );
      await until(t, () => err.length > 0, 'the truncation said on stderr', { bell: said });
      assert.match(err[0], /^nemia watch: the feed was truncated /);
      assert.match(err[0], /at cursor \d+, and is 0 bytes now /);
      assert.ok(err[0].includes('from its start'), err[0]);
    } finally {
      watch.stop();
    }
  },
);

test('`nemia watch` interrupted in the process, as a signal interrupts it, leaves no watcher and no timer behind, and prints nothing more', async (t) => {
  emptyStore();
  const line = (run: string) => `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run, word: 'running' })}\n`;
  fs.writeFileSync(FEED, line('r-before'));
  const from = size();
  const out: string[] = [];
  let banner: () => void = () => {};
  const bannered = new Promise<void>((resolve) => {
    banner = resolve;
  });
  t.mock.method(console, 'log', (...a: unknown[]) => {
    out.push(a.join(' '));
    if (a.join(' ').startsWith('watching from')) banner();
  });
  t.mock.method(console, 'error', () => {});
  const closes: { mock: { callCount(): number } }[] = [];
  const watch = fs.watch;
  t.mock.method(fs, 'watch', (...args: Parameters<typeof fs.watch>) => {
    const made = watch(...args);
    closes.push(t.mock.method(made, 'close'));
    return made;
  });
  const timers: NodeJS.Timeout[] = [];
  const every = setInterval;
  t.mock.method(globalThis, 'setInterval', (...args: Parameters<typeof setInterval>) => {
    const made = every(...args);
    timers.push(made);
    return made;
  });
  const cleared: unknown[] = [];
  const clear = clearInterval;
  t.mock.method(globalThis, 'clearInterval', (timer: NodeJS.Timeout) => {
    cleared.push(timer);
    clear(timer);
  });
  const fiber = Effect.runFork(watching(from));
  await bannered;
  assert.equal(closes.length, 1, 'the watch holds one watcher of the feed');
  assert.equal(timers.length, 1, 'and one timer');
  assert.equal(closes[0].mock.callCount(), 0);
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.equal(closes[0].mock.callCount(), 1, 'its watcher closed as it was interrupted');
  assert.deepEqual(cleared, timers, 'and its timer cleared');
  const exit = await Effect.runPromise(Fiber.await(fiber));
  assert.ok(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause), 'interrupted, never ended of itself');

  const printed = out.length;
  const got: string[] = [];
  let arrived: () => void = () => {};
  const other = watchFeed({
    from,
    intervalMs: 20,
    onLine: (l) => {
      if (isRunLine(l)) got.push(l.run);
      arrived();
    },
  });
  try {
    const delivered = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    fs.appendFileSync(FEED, line('r-after'));
    await delivered;
  } finally {
    other.stop();
  }
  assert.deepEqual(got, ['r-after'], 'a watch still running is handed the line');
  assert.equal(out.length, printed, 'the interrupted watch printed nothing of it');
});

test(
  'REFUSED: a watch not told what to do about a cut feed refuses to read it, on every beat — the api ends its stream on that',
  WAITED,
  async (t) => {
    emptyStore();
    const line = JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' });
    fs.writeFileSync(FEED, `${line}\n${line}\n`);
    const errors: Error[] = [];
    const refused = bell();
    const watch = watchFeed({
      from: size(),
      intervalMs: 20,
      onLine: () => {},
      onError: (e) => {
        errors.push(e as Error);
        refused.ring();
      },
    });
    try {
      fs.truncateSync(FEED, 0);
      await until(
        t,
        () => errors.length >= 2,
        () => `the cut feed refused on two beats; refused ${errors.length} times`,
        { bell: refused },
      );
      assert.ok(errors.every(refusedWith(/is past the end of the feed/)), errors.map((e) => e.message).join('\n'));
    } finally {
      watch.stop();
    }
  },
);

test(
  'a watch says each read that works, before the lines it found and whether or not it found any, and no read that fails',
  WAITED,
  async (t) => {
    if (process.getuid?.() === 0) return t.skip('a mode of 000 does not keep root from reading');
    emptyStore();
    fs.writeFileSync(FEED, `${JSON.stringify({ at: '2026-09-22T10:00:00.000Z', run: 'r-a', word: 'running' })}\n`);
    const said: string[] = [];
    const spoke = bell();
    const heard = (ok: () => boolean, what: string) =>
      until(t, ok, () => `${what}; the watch said ${said.join(', ') || 'nothing'}`, { bell: spoke });
    const count = (word: string) => said.filter((w) => w === word).length;
    const watch = watchFeed({
      intervalMs: 20,
      onLine: () => {
        said.push('line');
        spoke.ring();
      },
      onRead: () => {
        said.push('read');
        spoke.ring();
      },
      onError: () => {
        said.push('error');
        spoke.ring();
      },
    });
    try {
      await heard(() => count('read') >= 4, 'reads that find nothing are said too');
      assert.deepEqual(said.slice(0, 2), ['read', 'line'], 'the read, then the line it found');
      assert.equal(count('line'), 1);

      fs.chmodSync(FEED, 0o000);
      try {
        await heard(() => count('error') >= 1, 'a read that fails goes to onError');
        const at = said.lastIndexOf('error');
        await heard(() => said.slice(at + 1).includes('error'), 'and so does the next');
        assert.deepEqual(
          said.slice(at).filter((w) => w !== 'error'),
          [],
          'no read is said while reads fail',
        );
      } finally {
        fs.chmodSync(FEED, 0o644);
      }
      const back = said.length;
      await heard(() => said.slice(back).includes('read'), 'the first read that works is said, with nothing new written');
      assert.equal(count('line'), 1);
    } finally {
      watch.stop();
    }
  },
);

test('`wf --help` names nemia watch whole, and says which feed is whose', async (t) => {
  const out: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.join(' '));
  });
  await main(['--help'], engineOf(testEngine().layer));
  const printed = out.join('\n');
  assert.equal(/^ {2}nemia feed\b/m.test(printed), false, 'nemia feed is retired: nemia watch --once reads once');
  assert.match(printed, /^ {2}nemia watch \[cursor\] \[--once\] \[-l <selector>\]\.\.\. \[--cursor-file <path>\] \[--json\]$/m);
  assert.match(printed, /nemia watch follows what the workflow decides/);
  assert.match(printed, /ae watch/);
});

test("feedPhase folds the engine's live words into running, and keeps every word a decision reads", () => {
  for (const live of ['running (working)', 'running (idle)', 'working (quiescent)', 'starting', 'between attempts'])
    assert.equal(feedPhase(live), 'running', live);
  for (const kept of ['pending', 'needs-human', 'succeeded', 'failed', 'stopped', 'unknown']) assert.equal(feedPhase(kept), kept);
});

test('feedWords says each run and step in the word nemia ls prints, with its prune, its wait on a person and its slot', async (t) => {
  await t.test('feedWords says the run with its prune, what waits on a person as a note, and a slot wait without its count', () => {
    const steps = [{ name: 'plan', after: [], brief: 'plan it' }] as unknown as Parameters<typeof listing>[0]['steps'];
    const run = {
      id: 'r-1',
      brief: 'b',
      createdAt: '2026-09-22T10:00:00.000Z',
      steps: {},
      repo: '/r',
      branch: 'wf/r-1',
      base: 'main',
    } as unknown as Run;
    const held = listing({
      steps,
      run,
      phaseOf: () => 'unknown',
      closeoutOf: () => undefined,
      asks: [],
      roundAsks: [],
      answers: [],
      waits: [],
      slot: { inFlight: 2, cap: 2 },
    });
    const a = feedWords(held, run, { status: 'running' });
    assert.deepEqual(a.run, { word: 'running' });
    assert.deepEqual(
      a.steps.map((s) => s.word),
      ['waiting for a run slot'],
    );
    const other = listing({
      steps,
      run,
      phaseOf: () => 'unknown',
      closeoutOf: () => undefined,
      asks: [],
      roundAsks: [],
      answers: [],
      waits: [],
      slot: { inFlight: 3, cap: 3 },
    });
    assert.deepEqual(feedWords(other, run, { status: 'running' }), a, 'the count in flight moving is not a change');
    assert.deepEqual(feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'succeeded' }).run, { word: 'succeeded (pruned)' });
    assert.deepEqual(
      feedWords(held, run, { status: 'awaiting approval' }).run,
      { word: 'awaiting approval' },
      "a run stopped on a person's word, and not on anything that broke, says what it stopped on",
    );
    assert.deepEqual(
      feedWords(held, { pruned: { at: '', worktrees: [] } }, { status: 'blocked' }).run,
      { word: 'blocked (pruned)' },
      'pruned too',
    );
    assert.deepEqual(feedWords(held, run, { status: 'failed' }).run, { word: 'failed' }, 'and one that broke says failed');
  });
  await t.test("the feed's word for a step waiting on a person is the word `nemia ls` prints, with what its harness waits for", () => {
    const steps = [{ name: 'plan', after: [], brief: 'plan it' }] as unknown as Parameters<typeof listing>[0]['steps'];
    const run = {
      id: 'r-1',
      brief: 'b',
      createdAt: '2026-09-22T10:00:00.000Z',
      steps: { plan: { taskId: 't1' } },
      repo: '/r',
      branch: 'wf/r-1',
      base: 'main',
    } as unknown as Run;
    const blockedWith = (waitingOf: (id: string) => string | undefined) =>
      listing({
        steps,
        run,
        phaseOf: (id) => (id === 't1' ? 'needs-human' : 'unknown'),
        closeoutOf: () => undefined,
        asks: [],
        roundAsks: [],
        answers: [],
        waits: [],
        waitingOf,
      });
    const waiting = blockedWith((id) => (id === 't1' ? 'permission prompt' : undefined));
    assert.deepEqual(
      [waiting.steps[0].status, waiting.steps[0].waits],
      ['needs-human', 'waiting for a permission prompt'],
      "the listing's status keeps the bare word, and the wait beside it",
    );
    assert.equal(
      feedWords(waiting, run, { status: 'running' }).steps[0].word,
      'needs-human: waiting for a permission prompt',
      'the feed gives the word as `nemia ls` prints it, the wait included',
    );
    assert.equal(
      feedWords(
        blockedWith(() => undefined),
        run,
        { status: 'running' },
      ).steps[0].word,
      'needs-human',
      'a step whose harness says nothing of its wait is the bare word',
    );
  });
});

test('foldFeed keeps the last word of each run and step, forgets a removed run, and feedChanges owes a line only for what moved', async (t) => {
  await t.test(
    'the fold keeps the last word of each run and step, forgets a removed run, and the diff owes a line only for what moved',
    () => {
      const at = '2026-09-22T10:00:00.000Z';
      const fold = foldFeed(freshFold(), [
        { at, run: 'r-1', word: 'running' },
        { at, run: 'r-1', step: 'plan', word: 'pending' },
        { at, run: 'r-1', step: 'plan', word: 'running' },
        { at, run: 'r-2', word: 'running' },
        { at, run: 'r-2', word: 'removed' },
        { at, run: 'r-3', word: 'running', note: 'waiting on you: approve plan' },
      ]);
      assert.deepEqual([...fold.said.keys()], ['Run/r-1', 'Step/r-1/plan', 'Run/r-3']);
      const now = new Map([
        [
          'r-1',
          {
            run: { word: 'running' },
            steps: [
              { name: 'plan', word: 'running' },
              { name: 'implement', word: 'waiting' },
            ],
          },
        ],
        ['r-3', { run: { word: 'running' }, steps: [] }],
        ['r-2', { run: { word: 'running' }, steps: [] }],
      ]);
      assert.deepEqual(
        feedChanges(fold, now, at),
        [
          { at, run: 'r-1', step: 'implement', word: 'waiting' },
          { at, run: 'r-3', word: 'running' },
          { at, run: 'r-2', word: 'running' },
        ].map(upgraded),
        'a new step, a note gone, and a run back under an id it had',
      );
      assert.deepEqual(
        feedChanges(fold, new Map(), at),
        [
          { at, run: 'r-1', word: 'removed' },
          { at, run: 'r-3', word: 'removed' },
        ].map(upgraded),
      );
    },
  );
  await t.test(
    "a removed run's one-shots go with it: a run back under an id it had says its acts again, and never reads them as already written",
    () => {
      const at = '2026-09-22T10:00:00.000Z';
      const put = '2026-09-22T09:00:00.000Z';
      const oneShotsOf = (run: string): FeedLine[] => [
        { at, run, word: 'cancel asked', note: `at ${put}` },
        { at, run, word: 'hold put', note: `since ${put}` },
        { at, run, step: 'plan', word: 'approved', note: `try 1 · at ${put}`, try: 1 },
        { at, run, step: 'plan', word: 'denied: Bash(git push)', note: 'try 1', call: 'Bash(git push)', try: 1 },
      ];
      const fold = foldFeed(freshFold(), [...oneShotsOf('r-1'), ...oneShotsOf('r-1x'), { at, run: 'r-1', word: 'running' }]);
      assert.equal([...fold.shots.keys()].length, 8, 'the fixture holds four one-shots of each run, of its own kind and of its step');

      foldFeed(fold, [{ at, run: 'r-1', word: 'removed' }]);
      assert.deepEqual(
        [...fold.shots.keys()].map((key) => key.slice(key.indexOf(' ') + 1).split('#')[0]).sort(),
        ['Run/r-1x', 'Run/r-1x', 'Step/r-1x/plan', 'Step/r-1x/plan'],
        "a removal takes the run's one-shots with it, its own and its steps' — and leaves every other run's, an id this one is a prefix of included",
      );
      assert.deepEqual([...fold.said.keys()], [], 'as it takes its words');

      const words: FeedWords = {
        run: { word: 'running' },
        steps: [{ name: 'plan', word: 'running' }],
        acts: [
          { word: 'cancel asked', note: `at ${put}` },
          { step: 'plan', word: 'approved', note: `try 1 · at ${put}`, try: 1 },
        ],
        held: put,
      };
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', words]]), at)
          .filter((l) => l.reason !== 'Running')
          .map((l) => [l.reason, l.note]),
        [
          ['CancelAsked', `at ${put}`],
          ['Approved', `try 1 · at ${put}`],
          ['HoldPut', `since ${put}`],
        ],
        'a run back under an old id says each of its acts again',
      );
    },
  );
  await t.test(
    'a feed written before the signature and one written after fold to the same state, and a removal of either shape forgets the run',
    () => {
      const at = '2026-10-16T04:00:00.000Z';
      const v0: FeedLine[] = [
        { at, run: 'r-1', word: 'running' },
        { at, run: 'r-1', step: 'plan', word: 'pending' },
        { at, run: 'r-1', step: 'plan', word: 'running', note: 'waiting on you: approve the plan' },
        { at, run: 'r-2', word: 'succeeded' },
        { at, run: 'r-2', step: 'plan', word: 'unverified · done' },
      ];
      const v1: FeedLine[] = [
        {
          at,
          run: 'r-1',
          word: 'running',
          apiVersion: FEED_VERSION,
          involved: { kind: 'Run', name: 'r-1' },
          labels: { run: 'r-1', factory: 'nemia', workflow: 'build' },
          reason: 'Running',
          type: 'Normal',
          source: 'tick',
          message: 'running',
        },
        {
          at,
          run: 'r-1',
          step: 'plan',
          word: 'pending',
          apiVersion: FEED_VERSION,
          involved: { kind: 'Step', name: 'r-1/plan' },
          labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
          reason: 'Pending',
          type: 'Normal',
          source: 'tick',
          message: 'pending',
        },
        {
          at,
          run: 'r-1',
          step: 'plan',
          word: 'running',
          note: 'waiting on you: approve the plan',
          apiVersion: FEED_VERSION,
          involved: { kind: 'Step', name: 'r-1/plan' },
          labels: { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
          reason: 'Running',
          type: 'Normal',
          waits: 'person',
          source: 'tick',
          message: 'running · waiting on you: approve the plan',
        },
        {
          at,
          run: 'r-2',
          word: 'succeeded',
          apiVersion: FEED_VERSION,
          involved: { kind: 'Run', name: 'r-2' },
          labels: { run: 'r-2', factory: 'nemia', workflow: 'build' },
          reason: 'Succeeded',
          type: 'Normal',
          source: 'tick',
          message: 'succeeded',
        },
        {
          at,
          run: 'r-2',
          step: 'plan',
          word: 'unverified · done',
          apiVersion: FEED_VERSION,
          involved: { kind: 'Step', name: 'r-2/plan' },
          labels: { run: 'r-2', factory: 'nemia', workflow: 'build', step: 'plan', agent: 'ada' },
          reason: 'Succeeded',
          type: 'Normal',
          source: 'tick',
          message: 'unverified · done',
        },
      ];

      assert.deepEqual(
        [...foldFeed(freshFold(), v0).said.keys()],
        ['Run/r-1', 'Step/r-1/plan', 'Run/r-2', 'Step/r-2/plan'],
        'a line of a step keys on the step, never on the run it belongs to',
      );
      assert.deepEqual(
        foldFeed(freshFold(), v0),
        foldFeed(freshFold(), v1),
        'the same events in the two shapes fold to the same state: what each is about is derived the one way',
      );

      const fromSigned = foldFeed(freshFold(), v1);
      foldFeed(fromSigned, [{ at, run: 'r-1', word: REMOVED }]);
      assert.deepEqual(
        [...fromSigned.said.keys()],
        ['Run/r-2', 'Step/r-2/plan'],
        'a removal written before the signature forgets a run folded from signed lines, and its steps with it',
      );

      const fromUnsigned = foldFeed(freshFold(), v0);
      foldFeed(fromUnsigned, [
        {
          at,
          run: 'r-2',
          word: REMOVED,
          apiVersion: FEED_VERSION,
          involved: { kind: 'Run', name: 'r-2' },
          labels: { run: 'r-2', factory: 'nemia', workflow: 'build' },
          reason: 'Removed',
          type: 'Normal',
          source: 'person',
          message: 'removed',
        },
      ]);
      assert.deepEqual(
        [...fromUnsigned.said.keys()],
        ['Run/r-1', 'Step/r-1/plan'],
        'and a signed removal forgets a run folded from lines written before the signature',
      );
    },
  );
  await t.test(
    'REFUSED: a run at rest whose words stand owes no line for a note reworded — a word moved, a step new to the fold and a run gone still do',
    () => {
      const at = '2026-10-05T19:29:00.000Z';
      const fold = foldFeed(freshFold(), [
        { at, run: 'r-1', word: 'succeeded' },
        { at, run: 'r-1', step: 'plan', word: 'done' },
        { at, run: 'r-2', word: 'succeeded' },
      ]);
      const reworded = {
        run: { word: 'succeeded', note: 'a note it never had' },
        steps: [{ name: 'plan', word: 'done', note: 'said to 2 times' }],
      };
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', { ...reworded, atRest: true as const }]]), at, new Set(['r-2'])),
        [],
        'at rest, the same words with new notes are a change of wording, not of the run',
      );
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', reworded]]), at, new Set(['r-2'])),
        [
          { at, run: 'r-1', word: 'succeeded', note: 'a note it never had' },
          { at, run: 'r-1', step: 'plan', word: 'done', note: 'said to 2 times' },
        ].map(upgraded),
        'in flight, a note that moved is a line',
      );
      const moved = { ...reworded, atRest: true as const, steps: [{ name: 'plan', word: 'failed', note: 'said to 2 times' }] };
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', moved]]), at, new Set(['r-2'])),
        [upgraded({ at, run: 'r-1', step: 'plan', word: 'failed', note: 'said to 2 times' })],
        'at rest, a word that moved is a line, with its note',
      );
      const added = { ...reworded, atRest: true as const, steps: [...reworded.steps, { name: 'ship', word: 'done' }] };
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', added]]), at, new Set(['r-2'])),
        [upgraded({ at, run: 'r-1', step: 'ship', word: 'done' })],
        'at rest, a step the feed never named says its word',
      );
      assert.deepEqual(
        feedChanges(fold, new Map([['r-1', { ...reworded, atRest: true as const }]]), at),
        [upgraded({ at, run: 'r-2', word: 'removed' })],
        'a run gone from the store is removed, at rest or not',
      );
    },
  );
});

test('publishedOf gives each line written the bytes it was written at, and none where another writer appended among them', async (t) => {
  await t.test(
    'each line written is published with the bytes it was written at: after the newline that ended a torn line, in bytes not characters',
    () => {
      const at = '2026-09-22T10:00:00.000Z';
      const lines: FeedLine[] = [
        { at, run: 'r-1', word: 'running' },
        { at, run: 'r-1', step: 'plan', word: 'waiting', note: 'on you — approve' },
      ];
      const sizes = lines.map((l) => Buffer.byteLength(`${JSON.stringify(l)}\n`));
      assert.notEqual(sizes[1], `${JSON.stringify(lines[1])}\n`.length, 'the second line holds a character of more than one byte');
      const written = sizes[0] + sizes[1];
      assert.deepEqual(publishedOf({ lines, before: 100, after: 100 + written, leading: '' }), [
        { from: 100, to: 100 + sizes[0], line: lines[0] },
        { from: 100 + sizes[0], to: 100 + written, line: lines[1] },
      ]);
      assert.deepEqual(
        publishedOf({ lines, before: 100, after: 101 + written, leading: '\n' }).map(({ from, to }) => [from, to]),
        [
          [101, 101 + sizes[0]],
          [101 + sizes[0], 101 + written],
        ],
        'a newline written first to end a line a writer died in the middle of is no line of its own',
      );
    },
  );
  await t.test(
    'REFUSED: lines another writer appended among are published with no bytes — the file is grown by more than they are, so its readers read it',
    () => {
      const lines: FeedLine[] = [{ at: '2026-09-22T10:00:00.000Z', run: 'r-1', word: 'running' }];
      const size = Buffer.byteLength(`${JSON.stringify(lines[0])}\n`);
      assert.equal(publishedOf({ lines, before: 0, after: size, leading: '' }).length, 1);
      assert.deepEqual(publishedOf({ lines, before: 0, after: size + 40, leading: '' }), []);
      assert.deepEqual(publishedOf({ lines: [], before: 7, after: 7, leading: '' }), []);
    },
  );
});
