/**
 * What a run's decision says on the board (src/lib/decide.ts): the Factory card's line of what it changed and its bars, when the
 * decision is asked for and read again, a diff's lines, and the step `accept` is pressed on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptStepOf,
  barOf,
  changeOf,
  decidableRun,
  decisionStamp,
  diffLine,
  isDecidable,
  mostLines,
  touchedSummary,
} from '../src/lib/decide.ts';
import { decisionQuery, type Decidable, type Radius, type RunStatus, type Touched } from '../src/lib/api.ts';
import { coded, decidable, type Word } from './run-fixtures.ts';

const group = (name: string, files: number, added: number, removed: number, binary = 0) => ({ name, files, added, removed, binary });

/** A branch that moved a test from one package to another, edited the root's CLAUDE.md, and added a binary. */
const radius: Radius = {
  changes: [
    { path: 'CLAUDE.md', added: 2, removed: 0 },
    { path: 'logo.png', added: null, removed: null },
    { from: 'packages/a/test/x.test.ts', path: 'packages/b/test/x.test.ts', added: 10, removed: 3 },
  ],
  /** The rename counts in both packages, as `radius` counts it. */
  groups: [group('(root)', 2, 2, 0, 1), group('packages/a', 1, 10, 3), group('packages/b', 1, 10, 3)],
  agentFacing: ['CLAUDE.md'],
  checkAffecting: ['packages/a/test/x.test.ts → packages/b/test/x.test.ts'],
  lessons: [{ path: 'CLAUDE.md', added: 2, removed: 0 }],
};
const read: Touched = { branch: 'wf/r/implement', radius };
const unread = (branch: string): Touched => ({ branch, radius: { error: `git could not diff abc...${branch}` } });

test("touchedSummary, barOf, mostLines: the Factory card's line of what a run changed, and its bars", async (t) => {
  await t.test(
    "the Factory card's line: every group once, each change's lines once — a rename across packages is not counted twice",
    () => {
      assert.equal(touchedSummary([read]), 'touched 3 packages · +12 −3');
      assert.equal(
        touchedSummary([
          {
            branch: 'wf/r/one',
            radius: { ...radius, groups: [group('apps/web', 1, 4, 1)], changes: [{ path: 'apps/web/a.ts', added: 4, removed: 1 }] },
          },
        ]),
        'touched 1 package · +4 −1',
      );
      assert.equal(
        touchedSummary([read, read, unread('wf/r/gone')]),
        'touched 3 packages · +12 −3 · 1 not known',
        'two branches with the same changes count each package and each file once, and a branch that could not be read is said, not dropped',
      );
      assert.equal(touchedSummary([unread('wf/r/gone')]), 'touched not known — what its branch changed was not said');
      assert.equal(touchedSummary([unread('a'), unread('b')]), 'touched not known — what its 2 branches changed was not said');
      assert.equal(touchedSummary([]), 'touched nothing — no branch to read');
    },
  );
  await t.test(
    "REFUSED: a fan-out's result branches each carry the parent's changes, and the card counts them once — not once per branch",
    () => {
      const branch = (name: string, changes: Radius['changes'], groups: Radius['groups']): Touched => ({
        branch: `wf/r/${name}`,
        radius: { changes, groups, agentFacing: [], checkAffecting: [], lessons: [] },
      });
      const api = branch(
        'api',
        [
          { path: 'packages/a/src/x.ts', added: 100, removed: 0 },
          { path: 'packages/a/src/y.ts', added: 5, removed: 0 },
        ],
        [group('packages/a', 2, 105, 0)],
      );
      const web = branch(
        'web',
        [
          { path: 'packages/a/src/x.ts', added: 120, removed: 4 },
          { path: 'apps/web/z.ts', added: 7, removed: 1 },
        ],
        [group('packages/a', 1, 120, 4), group('apps/web', 1, 7, 1)],
      );
      assert.equal(
        touchedSummary([api, web]),
        'touched 2 packages · +132 −5',
        "api and web each started from plan's branch, which added x.ts's +100: x.ts once, as web changed it most (+120 −4), then y.ts +5 and z.ts +7 −1",
      );
      assert.notEqual(touchedSummary([api, web]), 'touched 2 packages · +232 −5', "plan's +100 counted once per result branch");
      assert.equal(
        touchedSummary([web, api]),
        'touched 2 packages · +132 −5',
        "the larger change is the file's, whichever branch is read first",
      );
      const bin = branch('bin', [{ path: 'packages/a/src/x.ts', added: null, removed: null }], [group('packages/a', 1, 0, 0, 1)]);
      assert.equal(
        touchedSummary([bin, api]),
        'touched 1 package · +105 −0',
        'a binary file on both adds no lines, and does not stand in for a counted change of the same path',
      );
    },
  );
  await t.test(
    "a bar is its group's share of the most lines a group on the branch changed: the largest fills the track, a binary-only group has none",
    () => {
      const groups = [group('packages/a', 1, 60, 20), group('packages/b', 1, 30, 10), group('(root)', 1, 0, 0, 1)];
      const most = mostLines(groups);
      assert.equal(most, 80);
      assert.deepEqual(
        groups.map((g) => barOf(g, most)),
        [
          { added: 75, removed: 25 },
          { added: 37.5, removed: 12.5 },
          { added: 0, removed: 0 },
        ],
      );
      assert.deepEqual(barOf(group('x', 1, 1, 2), 3), { added: 33.33, removed: 66.67 });
      assert.deepEqual(
        barOf(group('x', 1, 0, 0, 1), mostLines([group('x', 1, 0, 0, 1)])),
        { added: 0, removed: 0 },
        'a branch of binary files only has nothing to measure against: no bar rather than a division by zero',
      );
      assert.equal(mostLines([]), 0);
    },
  );
});

/** A fan-out as the api gives it: implement signed off blocked, and tokens in `tokens`' word. The run `assess` calls failed. */
const fanOut = (tokens: Word, over: { status?: RunStatus; waitingOnYou?: string[]; tokensTask?: string | null } = {}) => ({
  status: over.status ?? 'failed',
  cancelledAt: null,
  waitingOnYou: over.waitingOnYou ?? ['implement'],
  steps: [
    { name: 'implement', taskId: 't-1', branch: 'wf/r/implement', ...coded('succeeded · BLOCKED'), note: null },
    {
      name: 'tokens',
      taskId: over.tokensTask === undefined ? 't-2' : over.tokensTask,
      branch: 'wf/r/tokens',
      ...coded(tokens),
      note: null,
    },
  ],
});

test("decidableRun, decisionStamp: when a run's decision is asked for and read again", async (t) => {
  await t.test('a run is asked for its decision once it finished or waits on a person — never while it runs, nor once called off', () => {
    const at = '2026-09-13T00:00:00.000Z';
    assert.equal(decidableRun({ status: 'failed', cancelledAt: null, waitingOnYou: ['implement'] }), true);
    assert.equal(decidableRun({ status: 'succeeded', cancelledAt: null, waitingOnYou: [] }), true);
    assert.equal(decidableRun({ status: 'running', cancelledAt: null, waitingOnYou: ['implement'] }), true);
    assert.equal(decidableRun({ status: 'running', cancelledAt: null, waitingOnYou: [] }), false);
    assert.equal(decidableRun({ status: 'cancelled', cancelledAt: at, waitingOnYou: [] }), false);
    assert.equal(
      decidableRun({ status: 'cancelled', cancelledAt: at, waitingOnYou: ['implement'] }),
      false,
      'a cancelled run as the api has it, with a step still named: called off all the same',
    );
  });
  await t.test("only the api's decision is shown: not `running`, not `nothing`, not an answer still to come", () => {
    const decidable: Decidable = {
      standings: [],
      touched: [read],
      lesson: { said: 'CLAUDE.md +2 −0', state: 'written' },
      sensitive: [],
      used: {},
      total: {
        usage: null,
        used: 'not measured',
        cost: 'not measured',
        costUsd: null,
        apiMs: null,
        toolMs: null,
        read: null,
        peak: null,
        rebuilt: 0,
      },
      cost: null,
      overBudget: null,
      collisions: null,
      commands: [],
      awaiting: null,
    };
    assert.equal(isDecidable(decidable), true);
    assert.equal(isDecidable({ running: true }), false);
    assert.equal(isDecidable({ nothing: 'cancelled at 2026-09-13T00:00:00.000Z — nothing to decide' }), false);
    assert.equal(isDecidable(undefined), false);
  });
  await t.test(
    'a decision is read again when a step settles, a try is filed, or the run moves — and the list and the detail stamp a run alike',
    () => {
      const stamp = decisionStamp(fanOut('running (working)'));
      const detail = fanOut('running (working)');
      assert.equal(
        decisionStamp({ ...detail, steps: detail.steps.map((s) => ({ ...s, closeout: null, used: null })) }),
        stamp,
        "the detail's steps carry more: the stamp reads what both have",
      );
      for (const settled of ['checking', 'unverified · done', 'succeeded · BLOCKED', 'failed', 'unsigned'] as const) {
        assert.notEqual(decisionStamp(fanOut(settled)), stamp, `tokens signed off or ended: ${settled}`);
      }
      assert.notEqual(decisionStamp(fanOut('checking')), decisionStamp(fanOut('verified ✓')), 'a check settled');
      assert.notEqual(
        decisionStamp(fanOut('failed ✗ check (unfinished)')),
        decisionStamp(fanOut('failed ✗ check (exit 1)')),
        'a refusal is not a check that did not finish',
      );
      assert.notEqual(decisionStamp(fanOut('running (working)', { tokensTask: 't-3' })), stamp, 'a try filed');
      assert.notEqual(
        decisionStamp(fanOut('running (working)', { status: 'running', waitingOnYou: [] })),
        stamp,
        'a person asked for a try',
      );
      assert.notEqual(
        decisionStamp(fanOut('succeeded · BLOCKED', { status: 'succeeded' })),
        decisionStamp(fanOut('succeeded · BLOCKED')),
        'the run moved',
      );
      assert.notEqual(
        decisionStamp(fanOut('waiting', { tokensTask: null })),
        decisionStamp(fanOut('pending')),
        'a step filed: one not filed is not in flight, and one filed is, so the task moves it',
      );
    },
  );
  await t.test("a decision is not read again while a live step's engine word moves and nothing it says has", () => {
    const stamp = decisionStamp(fanOut('running (working)'));
    for (const word of ['working (quiescent)', 'starting', 'between attempts', 'needs-human', 'pending', 'running (working)'] as const) {
      assert.equal(decisionStamp(fanOut(word)), stamp, `tokens' engine word: ${word}`);
    }
  });
  await t.test(
    'a decision is read again when a hold is written, lifted, or its runs ship — the hold is what the api answers for a held run',
    () => {
      const holding = (word: string) => ({ at: '2026-09-23T07:00:00.000Z', runs: [], word, advice: '', onYou: false });
      const unheld = decisionStamp(fanOut('running (working)'));
      const held = decisionStamp({ ...fanOut('running (working)'), holding: holding('held until a-1 lands') });
      assert.notEqual(held, unheld, 'a hold written');
      assert.equal(
        decisionStamp({ ...fanOut('running (working)'), holding: null }),
        unheld,
        'no hold, and an api older than the hold, alike',
      );
      assert.notEqual(
        decisionStamp({
          ...fanOut('running (working)'),
          holding: holding('held until a-1 lands — it has landed, and the next tick lifts the hold'),
        }),
        held,
        'its run landed',
      );
    },
  );
});

test("diffLine, changeOf, acceptStepOf: a diff's lines, a file among the changes, and the step accept is pressed on", async (t) => {
  await t.test("a diff's lines, told apart for their colour: a file's header, a hunk's, added, removed and context", () => {
    const kinds = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,3 +1,3 @@ {',
      ' "name": "app",',
      '-  "test": "node --test"',
      '+  "test": "node --test test/"',
      '',
      '\\ No newline at end of file',
      'rename from test/a.test.ts',
      'Binary files a/logo.png and b/logo.png differ',
    ].map(diffLine);
    assert.deepEqual(kinds, ['meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'removed', 'added', 'context', 'context', 'meta', 'meta']);
  });
  await t.test(
    "a diff's file is found among the branch's changes by its name, a rename by both ends — and not on a branch not read",
    () => {
      assert.deepEqual(changeOf(read, 'CLAUDE.md'), { path: 'CLAUDE.md', added: 2, removed: 0 });
      assert.equal(changeOf(read, 'packages/a/test/x.test.ts → packages/b/test/x.test.ts')?.added, 10);
      assert.equal(changeOf(read, 'README.md'), undefined);
      assert.equal(changeOf(unread('wf/r/gone'), 'CLAUDE.md'), undefined);
      assert.equal(changeOf(undefined, 'CLAUDE.md'), undefined);
    },
  );
  await t.test(
    'the board presses `accept` on the step the api names beside it, never on one read off its text, and on no other row',
    () => {
      const accept = (command: string, step: string | null) => ({ label: 'accept' as const, command, step });
      assert.equal(acceptStepOf(accept('nemia accept r-1 review --message "<why>"', 'review')), 'review');
      assert.equal(
        acceptStepOf(accept('nemia accept r-1 implement --message "<why>"', 'review')),
        'review',
        'REFUSED: the step is the one the api names, not the one the text spells',
      );
      assert.equal(acceptStepOf({ label: 'once more', step: 'review' }), null, 'every other row only copies');
      assert.equal(acceptStepOf(accept('nemia accept r-1 review --message "<why>"', null)), null, 'names no step');
    },
  );
  await t.test(
    'a merge `nemia decide` offers decodes as the api serves it, labelled merge, and the board only copies it: it presses accept alone',
    async (t) => {
      const merge = {
        label: 'merge',
        command: 'nemia merge r-1 review',
        said: "review: implement's work conflicts with main. Merge main into it — implement continued, then a new review, on round 1, which the merge does not spend:  nemia merge r-1 review",
        step: 'review',
      } as const;
      const before = globalThis.fetch;
      globalThis.fetch = async () =>
        new Response(JSON.stringify(decidable({ commands: [merge] })), { status: 200, headers: { 'content-type': 'application/json' } });
      t.after(() => {
        globalThis.fetch = before;
      });
      const answered = await decisionQuery('r-1', 'stamp').queryFn!({} as never);
      assert.deepEqual(isDecidable(answered) ? answered.commands : answered, [merge]);
      assert.equal(acceptStepOf(merge), null);
    },
  );
});
