/**
 * What the package asks of the place it is given (`PlaceService`), against places whose verbs the test answers: a program that asks the
 * place and is given none does not compile, and dies when run all the same; `openPlace` hands on `open`'s answer, refuses in the place's
 * words and throws a plain `Error` for an `open` not heard; `trialMerges` takes a refusal, an unread outcome and a short answer for no
 * verdict; the words of a verb stopped at its deadline and of one that threw; and `sayFilled`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect } from 'effect';
import { sayFilled, type PlaceAnswers, type PlaceOutcome } from './place.ts';
import { PlaceService, STOP_GRACE_MS, openPlace, stoppedWords, threwWords, trialMerges, type Place } from './place.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { placeOver, unreadBy } from '../../test/place-over.ts';

/** A place none of whose verbs may be asked: each fails the test that asks it. */
const UNASKED: Place = {
  declared: { denyWhileLanding: [], say: {} as Place['declared']['say'] },
  ask: (verb) => Effect.die(new Error(`${verb} was asked of a place this test answers itself`)),
  askNow: (verb) => assert.fail(`${verb} was asked of a place this test answers itself`),
};

const OPENED: PlaceAnswers['open'] = { repo: '/r', baseRef: 'abc', branch: 'main' };
const TRIALS: PlaceAnswers['trial'] = {
  at: { main: 'h', gone: null },
  trials: [{ clean: true }, { clean: false, conflicts: ['a.ts'] }, { unknown: 'no ref' }],
};
const ASKED = [
  { onto: 'main', branch: 'wf/x/a' },
  { onto: 'main', branch: 'wf/x/b' },
  { onto: 'gone', branch: 'wf/x/a' },
];

/** A place whose `open` answers `outcome`. */
const opening = (outcome: PlaceOutcome<'open'>): Place => placeOver(UNASKED, { open: () => outcome });

/** A place whose `trial` answers `outcome`. */
const trying = (outcome: PlaceOutcome<'trial'>): Place => placeOver(UNASKED, { trial: () => outcome });

test('REFUSED: a program that asks the place and is given none does not compile, and one run all the same dies naming the service', () => {
  const asks = Effect.gen(function* () {
    return (yield* PlaceService).declared;
  });
  // @ts-expect-error -- a program that asks the place is given none, and runSync takes no requirement
  const exit = Effect.runSyncExit(asks);
  assert.ok(exit._tag === 'Failure', 'it has no place to ask');
  assert.match(String(Cause.squash(exit.cause)), /orchestrator\/PlaceService/);
  const given = Effect.runSync(asks.pipe(Effect.provide(PlaceService.layer(UNASKED))));
  assert.equal(given, UNASKED.declared, 'and given one by name, it reads that one');
});

test("openPlace answers open's answer, and hands open the root and whether the run cuts worktrees", () => {
  const asked: unknown[] = [];
  const place = placeOver(UNASKED, {
    open: (request) => {
      asked.push(request);
      return { answer: OPENED };
    },
  });
  assert.deepEqual(openPlace(place, '/r', true), OPENED);
  assert.deepEqual(openPlace(place, '/q', false), OPENED);
  assert.deepEqual(asked, [
    { root: '/r', isolate: true },
    { root: '/q', isolate: false },
  ]);
});

test("REFUSED: openPlace when open refuses, in the place's words whole, as an Invalid with exit 2", () => {
  const words = '/r is not a git repository: run git init there and commit once, or name a repository with --repo';
  assert.throws(
    () => openPlace(opening({ refused: words }), '/r', true),
    (err: Error) => err instanceof Invalid && err.exitCode === 2 && err.message === words,
  );
});

test('an open that is not heard is no refusal: openPlace throws a plain Error with why, which a queued card tries again', () => {
  assert.throws(
    () => openPlace(opening(unreadBy('open', 'git: not found')), '/r', true),
    (err: Error) =>
      !(err instanceof Invalid) &&
      (err as { exitCode?: unknown }).exitCode === undefined &&
      err.message === "the place's open was not heard: git: not found. Nothing was started: start it again",
  );
});

test('trialMerges answers what the trial verb answers, and asks nothing for no trial', () => {
  assert.deepEqual(trialMerges('/r', ASKED, trying({ answer: TRIALS })), TRIALS);
  assert.deepEqual(trialMerges('/r', [], UNASKED), { at: {}, trials: [] });
});

test('REFUSED: a trial unread or refused, or an answer short of the trials asked, is no verdict: every trial is unknown in its words, and every base null', () => {
  const pairs = [
    { onto: 'main', branch: 'wf/x/a' },
    { onto: 'wf/y/b', branch: 'wf/x/a' },
  ];
  const silent = trialMerges('/r', pairs, trying(unreadBy('trial', 'git is gone')));
  assert.deepEqual(silent, {
    at: { main: null, 'wf/y/b': null },
    trials: [{ unknown: 'the trial merge was not heard: git is gone' }, { unknown: 'the trial merge was not heard: git is gone' }],
  });
  const refused = trialMerges('/r', pairs, trying({ refused: '/r is not a directory' }));
  assert.deepEqual(refused.trials, [{ unknown: '/r is not a directory' }, { unknown: '/r is not a directory' }]);
  const short = trialMerges('/r', pairs, trying({ answer: { at: { main: 'a'.repeat(40) }, trials: [{ clean: true }] } }));
  assert.deepEqual(short, {
    at: { main: null, 'wf/y/b': null },
    trials: [{ unknown: 'the place answered 1 trial for the 2 asked' }, { unknown: 'the place answered 1 trial for the 2 asked' }],
  });
});

test('a verb stopped at its deadline says so in the deadline words, with what it last said, and names a kill at the shipped grace', () => {
  assert.equal(stoppedWords(300, false, ''), 'it gave no answer within 0.3 s, its deadline, and was stopped');
  assert.equal(
    stoppedWords(120_000, true, ''),
    `it gave no answer within 120 s, its deadline, and was stopped, and a process it started outlived SIGTERM for ${STOP_GRACE_MS / 1000} s and was killed, so a lock it held may be left`,
  );
  assert.match(
    stoppedWords(300, false, 'reading the diff\n'),
    /^it gave no answer within 0\.3 s, its deadline, and was stopped.*reading the diff/,
  );
});

test('a verb that threw says so in one sentence, naming the verb and what was thrown', () => {
  assert.equal(threwWords('make', new Error('also is not iterable')), 'make threw before it answered: also is not iterable');
  assert.equal(threwWords('land', 'a string'), 'land threw before it answered: a string');
});

test('what was thrown is said on one line, its last four lines and no more', () => {
  const thrown = new Error('Command failed: git x\nhint: one\n\n  hint: two\nhint: three\nfatal: four\n');
  assert.equal(threwWords('remove', thrown), 'remove threw before it answered: hint: one / hint: two / hint: three / fatal: four');
});

test("sayFilled fills each hole it is handed, and leaves a hole it is not, and a person's `<branch>`, as written", () => {
  assert.equal(
    sayFilled('git -C {repo} worktree unlock {path}', { repo: '/r', path: '/w/{repo}' }),
    'git -C /r worktree unlock /w/{repo}',
    'a value is put in once, never read again for holes',
  );
  assert.equal(sayFilled('git -C {path} switch -c <branch>', { path: '/w' }), 'git -C /w switch -c <branch>');
  assert.equal(sayFilled('git -C {repo} status', { path: '/w' }), 'git -C {repo} status');
  assert.equal(sayFilled('{toString} {path}', { path: '/w' }), '{toString} /w', 'a name the holes only inherit is no hole they name');
});
