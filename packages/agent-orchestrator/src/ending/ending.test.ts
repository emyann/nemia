/**
 * The ending's pure functions, as tables: the allow list an ending's session is filed with (`filedAllows`), what a landing owes a merge
 * staged in the checkout (`landingDue`), how long it holds the checkout (`landingOpen`), the words of what it did (`landedWords`), and of
 * a run waiting on the checkout (`checkoutWord`, `checkoutLine`). What the gate of an ending means to `assess`, `listing` and `decision`
 * is in `test/assess-endings.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutLine, checkoutWord, filedAllows, landedWords, landingDue, landingOpen, type MergeState } from './ending.ts';
import type { RepositoryRun, Run, StepRecord, TaskPhase } from '../run.ts';
import type { StepStatus } from '../record/record.ts';
import type { Verdict } from '../check/check.ts';
import type { Workflow } from '../workflow.ts';
import { phases, run } from '../../test/assessed.ts';

const ARTIFACTS = '/store/runs/r1/artifacts';
const READ = 'Read(//store/runs/r1/artifacts/**)';

test('filedAllows', async (t) => {
  await t.test(
    "a step in the checkout is filed with a read of its run's artifacts after its own rules, on the default harness and on each one fenced by permission rules",
    () => {
      assert.deepEqual(filedAllows({ workspace: 'main' }, ARTIFACTS), [READ]);
      assert.deepEqual(filedAllows({ workspace: 'main', harness: 'claude-detached', allowedTools: ['Bash(git status)'] }, ARTIFACTS), [
        'Bash(git status)',
        READ,
      ]);
      assert.deepEqual(filedAllows({ workspace: 'main', allowedTools: [READ] }, ARTIFACTS), [READ], 'given once');
    },
  );

  await t.test(
    'REFUSED: a step in a worktree or a folder, and one in the checkout on a harness fenced by no permission rule, is filed with its own list only',
    () => {
      const own = ['Bash(git status)'];
      assert.equal(filedAllows({ allowedTools: own }, ARTIFACTS), own, 'a worktree');
      const inFolder = { place: 'folder' as const, allowedTools: own };
      assert.equal(filedAllows(inFolder, ARTIFACTS), own, 'a folder');
      assert.equal(filedAllows({ workspace: 'main', harness: 'codex' }, ARTIFACTS), undefined, 'a sandbox');
      assert.equal(filedAllows({ workspace: 'main', harness: 'a2a:far-away' }, ARTIFACTS), undefined, 'a remote agent');
    },
  );
});

/** `implement → ship`, ship an ending with a check: approved first, in the repository's checkout (`landsOnCheck`). */
const LANDER: Workflow = { name: 'ship', after: ['implement'], body: 'ship it', workspace: 'main', gate: true, check: 'npm test' };
/** ship filed, signed, its check filed: every phase given, the checkout's state given. */
const atLanding = (rest: Partial<RepositoryRun> = {}, ship: Partial<StepRecord> = {}): Run => ({
  ...run({ implement: 't-impl' }, { approvals: [{ step: 'ship', try: 1, at: '2026-01-01T00:30:00Z' }], ...rest }),
  steps: {
    implement: { taskId: 't-impl', branch: 'wf/r-1/implement' },
    ship: { taskId: 't-ship', check: { taskId: 't-ship-check' }, ...ship },
  },
});
const STAGED: MergeState = { merging: 'ours', conflicted: false, missing: [], head: 'base000' };
const ON_HEAD: MergeState = { merging: 'none', conflicted: false, missing: [], head: 'merged0' };
const NOT_STAGED: MergeState = { merging: 'none', conflicted: false, missing: ['wf/r-1/implement'], head: 'base000' };
const CALLED_OFF = { cancelledAt: '2026-01-01T01:00:00Z' };
/** The run `r` with ship's check unfiled where `check` is not given: its record has none. */
const filedTo = (r: Run, check: TaskPhase | undefined): Run => {
  const { check: _filed, ...unfiled } = r.steps.ship;
  return check ? r : { ...r, steps: { ...r.steps, ship: unfiled } };
};
/** `landingDue` of `r`, ship's own status `own`, its phase and its check's, the checkout read as `merge` (or by `read`). */
const due = (
  r: Run,
  own: StepStatus,
  ship: TaskPhase,
  check: TaskPhase | undefined,
  merge: MergeState,
  message: string | undefined = 'Add a flag',
  verdict?: Verdict,
  read: () => MergeState = () => merge,
) =>
  landingDue(
    LANDER,
    filedTo(r, check),
    own,
    phases({ 't-impl': 'succeeded', 't-ship': ship, ...(check ? { 't-ship-check': check } : {}) }),
    message,
    verdict,
    merge.merging !== 'none',
    read,
  );
/** A read of the checkout that fails the test: where `landingDue` must not ask git at all. */
const UNREAD = (): MergeState => {
  throw new Error('the checkout was read');
};
const abort = (why: string) => ({ act: 'abort', why });
const record = (landed: object) => ({ act: 'record', landed });
const ENDED = ['blocked', 'unsigned', 'failed', 'stopped', 'denied', 'budget exhausted'] as const;
const phaseOfEnded = (own: (typeof ENDED)[number]): TaskPhase => (own === 'failed' || own === 'stopped' ? own : 'succeeded');

test('landingDue commits, aborts, waits or records', async (t) => {
  await t.test('commits only a merge that is ours, clean and whole, on a check that passed, with a message', () => {
    assert.deepEqual(due(atLanding(), 'checking', 'succeeded', 'succeeded', STAGED), { act: 'commit', message: 'Add a flag' });
  });

  await t.test(
    "REFUSED: commits nothing while the session or its check is in flight, on a merge that is not the run's, or once it has landed",
    () => {
      for (const busy of ['pending', 'running'] as const) {
        assert.equal(due(atLanding(), 'running', busy, undefined, STAGED), undefined, `ship ${busy}`);
        assert.equal(due(atLanding(), 'checking', 'succeeded', busy, STAGED), undefined, `its check ${busy}`);
      }
      const other = { ...STAGED, merging: 'other' as const };
      assert.equal(due(atLanding(), 'checking', 'succeeded', 'succeeded', other), undefined, 'another merge is never touched');
      const landed = atLanding({}, { landed: { commit: 'merged0' } });
      assert.equal(due(landed, 'checking', 'succeeded', 'succeeded', STAGED), undefined, 'once for the try');
      assert.equal(due(atLanding({}, { landed: { aborted: 'x' } }), 'checking', 'succeeded', 'succeeded', STAGED), undefined);
      const unchecked = { ...LANDER, check: undefined };
      const ph = phases({ 't-ship': 'succeeded' });
      assert.equal(
        landingDue(unchecked, atLanding(), 'unverified', ph, 'm', undefined, true, () => STAGED),
        undefined,
        'a ship with no check',
      );
    },
  );

  const { head: _, ...headless } = STAGED;
  const aborts: Array<[string, () => unknown, object]> = [
    [
      'a check that refused names the base it was staged on, for `nemia merge`',
      () => due(atLanding(), 'checking', 'succeeded', 'failed', STAGED, 'm', 1),
      { ...abort('its check refused the merge (exit 1)'), refusedOn: 'base000' },
    ],
    [
      'with no HEAD read, no base is named',
      () => due(atLanding(), 'checking', 'succeeded', 'failed', headless, 'm', 1),
      abort('its check refused the merge (exit 1)'),
    ],
    [
      'a check that did not finish',
      () => due(atLanding(), 'checking', 'succeeded', 'failed', STAGED, 'm', 'unfinished'),
      abort('its check did not finish'),
    ],
    [
      'a stopped check is no verdict, whatever it exited',
      () => due(atLanding(), 'checking', 'succeeded', 'stopped', STAGED, 'm', 1),
      abort('its check did not finish'),
    ],
    [
      'a blank message',
      () => due(atLanding(), 'checking', 'succeeded', 'succeeded', STAGED, ' \n'),
      abort('ship signed off no commit message'),
    ],
    [
      'no message given at all',
      () =>
        landingDue(
          LANDER,
          atLanding(),
          'checking',
          phases({ 't-ship': 'succeeded', 't-ship-check': 'succeeded' }),
          undefined,
          0,
          true,
          () => STAGED,
        ),
      abort('ship signed off no commit message'),
    ],
    [
      'a conflict',
      () => due(atLanding(), 'checking', 'succeeded', 'succeeded', { ...STAGED, conflicted: true }),
      abort('the merge it staged has conflicts'),
    ],
    [
      'a branch left out',
      () => due(atLanding(), 'checking', 'succeeded', 'succeeded', { ...STAGED, missing: ['wf/r-1/implement'] }),
      abort('the merge it staged leaves out wf/r-1/implement'),
    ],
    [
      'a run called off',
      () => due(atLanding(CALLED_OFF), 'checking', 'succeeded', 'succeeded', STAGED),
      abort('the run was called off before its merge was committed'),
    ],
    [
      'a run called off before its check was filed',
      () => due(atLanding(CALLED_OFF), 'checking', 'succeeded', undefined, STAGED),
      abort('the run was called off before its merge was committed'),
    ],
    [
      'a run held before its check was filed',
      () => due(atLanding({ hold: { at: '2026-01-01T01:00:00Z', until: ['r-0'] } }), 'checking', 'succeeded', undefined, STAGED),
      abort('the run was held before its check was filed'),
    ],
    ...ENDED.map((own): [string, () => unknown, object] => [
      `a step that ended ${own} with its merge staged`,
      () => due(atLanding(), own, phaseOfEnded(own), undefined, STAGED),
      abort(`ship ended ${own} with its merge staged`),
    ]),
    ...ENDED.map((own): [string, () => unknown, object] => [
      `${own}, with nothing staged: its own word stands, and nothing is taken back`,
      () => due(atLanding(), own, 'succeeded', undefined, NOT_STAGED),
      record({ untouched: `ship ended ${own}, and nothing of it was staged` }),
    ]),
  ];
  for (const [name, landing, expected] of aborts)
    await t.test(`REFUSED: aborts a merge it is not to commit — ${name}`, () => assert.deepEqual(landing(), expected));

  const unread = { unread: "the place's status was not heard: timed out" };
  const waits: Array<[string, StepStatus, TaskPhase | undefined, Verdict | undefined, Run]> = [
    ['a passed check commits nothing it cannot read', 'checking', 'succeeded', 0, atLanding()],
    ['a refused check aborts nothing it cannot read', 'checking', 'failed', 1, atLanding()],
    ['an ending that did not sign off done aborts nothing it cannot read', 'blocked', undefined, undefined, atLanding()],
    ['nor a run called off', 'checking', 'succeeded', 0, atLanding(CALLED_OFF)],
  ];
  for (const [name, own, check, verdict, r] of waits)
    await t.test(`REFUSED: neither commits nor aborts on a checkout its place gave no reading of: it waits, and says why — ${name}`, () => {
      const ph = phases({ 't-impl': 'succeeded', 't-ship': 'succeeded', ...(check ? { 't-ship-check': check } : {}) });
      const said = landingDue(LANDER, filedTo(r, check), own, ph, 'Add a flag', verdict, true, () => unread);
      assert.deepEqual(said, { act: 'wait', why: unread.unread });
    });

  await t.test(
    'records what a pass after a restart finds: a merge committed, one aborted, nothing staged — and files the check on a merge staged',
    () => {
      assert.equal(due(atLanding(), 'checking', 'succeeded', undefined, STAGED), undefined, 'the check is filed on this pass');
      assert.deepEqual(due(atLanding(), 'checking', 'succeeded', 'succeeded', ON_HEAD), record({ commit: 'merged0' }), 'committed already');
      assert.deepEqual(
        due(atLanding(), 'checking', 'succeeded', 'succeeded', NOT_STAGED),
        record({ aborted: 'its check passed, and the merge it judged was no longer staged, so nothing was committed' }),
      );
      assert.deepEqual(
        due(atLanding(), 'checking', 'succeeded', 'failed', NOT_STAGED, 'm', 1),
        record({ aborted: 'its check refused the merge (exit 1)' }),
        'aborted before the pass wrote it down',
      );
      assert.deepEqual(
        due(atLanding(), 'checking', 'succeeded', 'failed', ON_HEAD, 'm', 1),
        record({
          aborted: 'its check refused the merge (exit 1), and the result is on main already: it was committed before its check ran',
        }),
      );
      assert.deepEqual(
        due(atLanding(), 'checking', 'succeeded', undefined, NOT_STAGED),
        record({ aborted: "ship signed off with no merge of the run's result staged, so nothing was checked or committed" }),
      );
    },
  );
});

/** `due`, its checkout read by `UNREAD`, and read as staged or not by `staged`. */
const read = (r: Run, own: StepStatus, ship: TaskPhase, check: TaskPhase | undefined, staged: boolean) =>
  due(r, own, ship, check, staged ? STAGED : NOT_STAGED, 'm', undefined, UNREAD);

test('landingDue reads no git where no landing can be due', async (t) => {
  await t.test('REFUSED: its session or its check in flight', () => {
    for (const busy of ['pending', 'running'] as const) {
      assert.equal(read(atLanding(), 'running', busy, undefined, true), undefined, `ship ${busy}`);
      assert.equal(read(atLanding(), 'checking', 'succeeded', busy, true), undefined, `its check ${busy}: twenty minutes of passes`);
    }
  });

  await t.test('REFUSED: an ending that did not sign off done with nothing staged is written down on the first pass, with no git', () => {
    for (const own of ENDED)
      assert.deepEqual(
        read(atLanding(), own, phaseOfEnded(own), undefined, false),
        record({ untouched: `ship ended ${own}, and nothing of it was staged` }),
        `${own}: no pass reads git in the person's checkout for as long as the run is kept`,
      );
  });

  await t.test('REFUSED: a task the engine does not know this pass, and a run once landed', () => {
    assert.equal(read(atLanding(), 'running', 'unknown', undefined, false), undefined, 'running, its own word, is no ending');
    assert.equal(read(atLanding({}, { landed: { commit: 'merged0' } }), 'verified', 'succeeded', 'succeeded', true), undefined, 'landed');
  });

  await t.test('a merge staged is read, to be taken back, and a settled check is read, to land', () => {
    assert.throws(() => read(atLanding(), 'blocked', 'succeeded', undefined, true), /the checkout was read/);
    assert.throws(() => read(atLanding(), 'checking', 'succeeded', 'succeeded', false), /the checkout was read/);
  });
});

test('landingOpen holds the checkout from the filing to the landing, and lets go once landed', async (t) => {
  const rows: Array<[string, Run, StepStatus, TaskPhase, TaskPhase | undefined, MergeState['merging'], boolean]> = [
    ['its session works', atLanding(), 'running', 'running', undefined, 'none', true],
    ['its check runs', atLanding(), 'checking', 'succeeded', 'running', 'ours', true],
    ['settled, and not yet landed', atLanding(), 'checking', 'succeeded', 'succeeded', 'ours', true],
    ['blocked with its merge left staged', atLanding(), 'blocked', 'succeeded', undefined, 'ours', true],
    ['blocked, the checkout clean', atLanding(), 'blocked', 'succeeded', undefined, 'none', false],
    ['landed', atLanding({}, { landed: { commit: 'merged0' } }), 'verified', 'succeeded', 'succeeded', 'none', false],
    ['at its gate, nothing filed', atLanding({}, { taskId: null }), 'waiting', 'unknown', undefined, 'none', false],
  ];
  for (const [name, r, own, ship, check, merging, open] of rows)
    await t.test(name, () => {
      const ph = phases({ 't-ship': ship, ...(check ? { 't-ship-check': check } : {}) });
      assert.equal(
        landingOpen(LANDER, r, own, ph, () => merging),
        open,
      );
    });
});

test('landedWords says what the run did with the merge: the commit, or why none', async (t) => {
  await t.test('a commit, by its short sha', () =>
    assert.equal(landedWords({ branch: 'main' }, { commit: '0123456789abcdef' }), 'the run landed on main as 0123456'),
  );
  await t.test('an abort, with why', () =>
    assert.equal(
      landedWords({ branch: 'main' }, { aborted: 'its check refused the merge (exit 1)' }),
      'nothing landed on main: its check refused the merge (exit 1)',
    ),
  );
});

test("checkoutWord and checkoutLine say which run's ending has the repository's checkout", async (t) => {
  const hold = { run: 'r-2', step: 'ship' };
  await t.test('the word on the step, which the board reads as a waiting step', () => {
    assert.equal(checkoutWord(hold), "waiting on the checkout (r-2's ship has it)");
    assert.match(
      checkoutWord(hold),
      /^waiting on /,
      "the board's stepState takes waiting, waiting on and pending for a step with nothing filed",
    );
  });
  await t.test('the line in `nemia decide`, which says when it is filed', () =>
    assert.equal(
      checkoutLine('ship', hold),
      "ship: waiting on the checkout (r-2's ship has it) — it works in the repository's own checkout, and two endings never do at once; the next tick files ship once r-2's ship has settled",
    ),
  );
});
