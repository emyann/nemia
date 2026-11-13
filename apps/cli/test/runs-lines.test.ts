/**
 * What the run's runners read and print, pure, off the api's answers: a person's `--answer`s numbered and lettered as `nemia decide`
 * prints them into the `answers` the api takes, `--budget <step>=<amount>` and `--model <step>=<model>` read, a plan card's frontmatter
 * read off a file, an `--input` sent as text or bytes; and the lines each verb prints of what the api answered. A refusal asserts its
 * exit code and what it names, never its sentence.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { Refused } from '../src/refused.ts';
import { cancelLines, holdLines, refreshLines, routeLines, waitLines } from '../src/commands/runs/act.ts';
import { approveLines, budgetsOf, retryLines, sayLines } from '../src/commands/runs/answer.ts';
import { numberedAnswers } from '../src/commands/runs/answers.ts';
import { nowLines, pauseLines, timeoutLines } from '../src/commands/runs/pause.ts';
import { inputOf, modelsOf, planCardOf } from '../src/commands/runs/start.ts';
import { startedLines } from '../src/commands/runs/started.ts';
import { forgottenLine } from '../src/commands/runs/forgotten.ts';
import type { RunRemoved, RunStarted } from 'objects';

/** `act` refused, exit 2, its words naming each of `named`. */
const refused = (act: () => unknown, ...named: (string | RegExp)[]): void =>
  assert.throws(act, (err: unknown) => {
    assert.ok(err instanceof Refused, String(err));
    assert.equal(err.code, 2);
    for (const n of named) assert.match(err.message, typeof n === 'string' ? new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : n);
    return true;
  });

const QUESTIONS = [
  {
    title: 'Which store?',
    body: '',
    options: [
      { label: 'redis', meaning: '' },
      { label: 'memory', meaning: '' },
    ],
    recommended: 'redis',
    multiple: false,
  },
  {
    title: 'Which tests?',
    body: '',
    options: [
      { label: 'unit', meaning: '' },
      { label: 'e2e', meaning: '' },
      { label: 'none', meaning: '' },
    ],
    recommended: 'unit',
    multiple: true,
  },
];

test('--answer n=letter resolves to the question and label, several letters and own words too, numbered from 1 across the step', () => {
  assert.deepEqual(numberedAnswers(QUESTIONS, ['1=b', '2=a,b: and a smoke test'], 'r-1'), [
    { question: 'Which store?', chose: ['memory'] },
    { question: 'Which tests?', chose: ['unit', 'e2e'], own: 'and a smoke test' },
  ]);
  assert.deepEqual(numberedAnswers(QUESTIONS, ['1: neither, a file'], 'r-1'), [
    { question: 'Which store?', chose: [], own: 'neither, a file' },
  ]);
  assert.deepEqual(numberedAnswers([], ['1=a'], 'r-1'), [], 'a step that asks none is the api to refuse');
});

test('REFUSED, exit 2: an --answer in no form, a question past the last, a letter the question does not offer', () => {
  refused(() => numberedAnswers(QUESTIONS, ['a=1'], 'r-1'), '--answer a=1');
  refused(() => numberedAnswers(QUESTIONS, ['3=a'], 'r-1'), 'nemia decide r-1');
  refused(() => numberedAnswers(QUESTIONS, ['1=c'], 'r-1'), 'a (redis)', 'b (memory)');
});

test('--budget step=amount reads into budgets; one that is not a step and dollars above zero is refused, exit 2', () => {
  assert.deepEqual(budgetsOf(['implement=60', 'review=2.5'], 'r-1', 'ship'), [
    { step: 'implement', usd: 60 },
    { step: 'review', usd: 2.5 },
  ]);
  for (const bad of ['60', 'implement=', '=60', 'implement=0', 'implement=$5'])
    refused(() => budgetsOf([bad], 'r-1', 'ship'), 'nemia approve r-1 ship --budget');
});

test('--model step=model reads into models; one that is not a step and a model is refused, exit 2', () => {
  assert.deepEqual(modelsOf(['implement=opus', 'review=sonnet']), { implement: 'opus', review: 'sonnet' });
  assert.equal(modelsOf([]), undefined);
  refused(() => modelsOf(['opus']), '--model <step>=<model>');
});

test("a plan card's file gives its body, workflow: and after:; a file with no block of keys is the whole brief", () => {
  assert.deepEqual(planCardOf('c.md', '---\nworkflow: dev\n---\nDo it.\n', []), { body: 'Do it.', workflow: 'dev', after: [] });
  assert.deepEqual(planCardOf('c.md', '---\nworkflow: dev\nafter: a, b\n---\nDo it.\n', ['r-1', 'r-2']), {
    body: 'Do it.',
    workflow: 'dev',
    after: ['a', 'b'],
  });
  assert.equal(planCardOf('c.md', 'Do it.\n', []), null);
  assert.equal(planCardOf('c.md', '---\nA sentence: not a key\n---\nDo it.\n', []), null);
});

test("REFUSED, exit 2: a key a plan's card lacks, naming nemia inbox add; an after: with no --after, naming --after", () => {
  refused(() => planCardOf('c.md', '---\nworkflow: dev\nrepo: /x\n---\nDo it.\n', []), 'nemia inbox add c.md', '`repo`');
  refused(() => planCardOf('c.md', '---\nafter: a\n---\nDo it.\n', []), '--after');
});

test('an --input is sent as text where its bytes are UTF-8, else as base64, by its name alone; a file not there is refused', () => {
  const dir = scratch('nemia-runs-inputs-');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'hello\n');
  fs.writeFileSync(path.join(dir, 'shot.png'), Buffer.from([0x89, 0x50, 0xff, 0x00]));
  assert.deepEqual(inputOf(path.join(dir, 'notes.md')), { name: 'notes.md', text: 'hello\n' });
  assert.deepEqual(inputOf(path.join(dir, 'shot.png')), {
    name: 'shot.png',
    base64: Buffer.from([0x89, 0x50, 0xff, 0x00]).toString('base64'),
  });
  refused(() => inputOf(path.join(dir, 'gone.md')), 'gone.md');
});

test('nemia retry prints the try asked for, how, with what, and when it is filed; of a round, the round and its cap', () => {
  const typed = { runId: 'r-1', step: 'implement', round: false, mode: 'fresh', answered: false };
  assert.deepEqual(retryLines({ try: 3, file: '/a/retry-implement-3' }, typed), [
    'r-1  asked: try 3 of implement (--fresh) — the next tick files it, once',
    '   /a/retry-implement-3',
  ]);
  const [line] = retryLines({ try: 3, file: 'f', stopFirst: true }, { ...typed, model: 'opus', budget: 5, answered: true });
  assert.match(line ?? '', /\(--model opus, --budget 5\), with your answers — its harness blocked its session/);
  const [round] = retryLines({ step: 'review', round: 4, budget: 30, file: 'f' }, { ...typed, round: true });
  assert.match(round ?? '', /round 4 of review's loop, its cap raised to \$30/);
});

test('nemia approve prints the try approved and what the next tick files, each cap, the file; a loop accepted as it stands', () => {
  const approved = {
    step: 'ship',
    try: 1,
    at: 't',
    message: 'go',
    file: 'f',
    next: 'step' as const,
    caps: [{ step: 'implement', usd: 60, above: true, workflow: 40 }],
  };
  assert.deepEqual(approveLines(approved, 'r-1', false), [
    'r-1  approved: try 1 of ship, with your words — the next tick files ship',
    "   cap  implement $60.00 (above the workflow's $40.00)",
    '   f',
  ]);
  assert.match(approveLines({ ...approved, loop: true, next: 'nothing' }, 'r-1', false)[0] ?? '', /accepted: try 1 of ship as it stands/);
});

test('nemia say prints where the words went, then the words fenced longer than any run of backticks in them', () => {
  const lines = sayLines({ at: 't', attempt: 2, text: 'use ``` here', after: null, try: 1, taskId: 'task-1' }, 'r-1', 'implement');
  assert.match(lines[0] ?? '', /said to implement, try 1, attempt 2, at t — journalled on task-1/);
  assert.deepEqual(lines.slice(1), ['   ````text', '   use ``` here', '   ````']);
  assert.match(
    sayLines({ at: 't', attempt: 1, text: 'x', after: null, kept: true }, 'r-1', 'review')[0] ?? '',
    /kept for review's first try/,
  );
});

test('cancel, hold, route, refresh and wait print what they did off the answer', () => {
  assert.deepEqual(cancelLines({ id: 'r-1', plan: { kind: 'finished', status: 'succeeded' } } as never), [
    'r-1  already succeeded — nothing to stop',
  ]);
  assert.match(holdLines({ id: 'r-1', lifted: false, hold: { until: [], why: 'legal' } } as never)[0] ?? '', /nemia hold r-1 --off/);
  assert.match(holdLines({ id: 'r-1', lifted: false, hold: { until: ['a', 'b'] } } as never)[0] ?? '', /held until a and b land/);
  assert.deepEqual(routeLines({ step: 'review', try: 2, route: 'fix', file: 'f' } as never, 'r-1'), [
    'r-1  routed: try 2 of review takes fix — the next tick files what its when: names',
    '   f',
  ]);
  assert.match(refreshLines({ drift: [] }, 'r-1', false)[0] ?? '', /asked: the new revisions/);
  assert.deepEqual(waitLines({ ended: 'bound', lines: [], cursor: '40' }), ['cursor: 40']);
});

test('pause, pause --now and pause-timeout print what they did or would do', () => {
  const pause = { at: 't', by: 'ann', why: 'upgrade' };
  assert.match(pauseLines({ pause }, '')[0] ?? '', /paused since t by ann: upgrade — .*nemia resume resumes it/);
  const now = nowLines([{ run: 'r-1', step: 'implement', kind: 'session' }] as never, false, 'It costs a call.');
  assert.match(now[0] ?? '', /would pause the store and cut 1/);
  assert.equal(now.at(-1), 'nemia pause --now --yes does it.');
  assert.deepEqual(timeoutLines({ timeout: { ms: 600_000, set: false }, wrote: false }), [
    "the store's pause timeout is 10m (the default)",
  ]);
  assert.match(timeoutLines({ timeout: { ms: 900_000, set: true }, wrote: true })[0] ?? '', /is now 15m/);
});

/** A run of the test team's `dev` as a start answers it, in the factory `acme` on `/r`, its workflow's files copied. */
const DEV: NonNullable<RunStarted['run']> = {
  steps: [
    { name: 'implement', agent: 'implementer' },
    { name: 'review', agent: 'reviewer' },
    { name: 'ship', agent: 'shipper' },
  ],
  factory: 'acme',
  repo: '/r',
  repository: true,
  workflow: 'dev',
  workspace: '/r',
  workflowFiles: '/s/runs/r-1/workflow/5b5d',
  branch: 'main',
  ends: ['ship'],
};

test('nemia start prints the run it started, worded off the answer, line for line as it printed the api’s lines', () => {
  const rows: [string, RunStarted, string[]][] = [
    [
      'a brief with a model, a gate, an input and a label',
      {
        id: 'r-1',
        run: {
          ...DEV,
          inputs: { names: ['notes.md'], dir: '/s/runs/r-1/inputs' },
          gated: ['implement'],
          models: { implement: 'sonnet' },
          labels: { team: 'core', area: 'cache' },
        },
      },
      [
        'r-1  3 step(s): implement (implementer) → review (reviewer) → ship (shipper)',
        'factory: acme, on /r',
        'workspace: /r',
        'inputs: notes.md — copied into /s/runs/r-1/inputs',
        'workflow files: copied into /s/runs/r-1/workflow/5b5d',
        'gated at: implement — nothing after it is filed until nemia approve r-1 <step>, once it has signed off',
        'ends at: ship — nothing of it runs until nemia approve r-1 ship, which is what files it',
        "models: implement=sonnet — for this run alone; its other steps run on their agents'",
        'labels: area=cache,team=core',
        "run 'nemia tick' (or 'nemia up') to start it",
      ],
    ],
    [
      'a card queued, its retired repo:, after a run, reading two, a label not inherited, in a paused store',
      {
        id: 'r-2',
        card: 'cache-card',
        queueLeft: 'queued: 2026-11-01',
        ignoredRepo: '/old/place',
        landed: ['r-0'],
        hints: ['dev/implement.md still writes `nudge`'],
        paused: { pause: { at: 't', by: 'ann', why: 'upgrade' }, finishing: [], parked: [], staged: [], held: [] },
        run: {
          ...DEV,
          from: 'cache-card',
          after: ['r-0'],
          context: ['r-0', 'r-9'],
          labelsLeftOut: [
            {
              key: 'team',
              values: [
                { run: 'r-0', value: 'core' },
                { run: 'r-9', value: 'edge' },
              ],
            },
          ],
        },
      },
      [
        'r-2  3 step(s): implement (implementer) → review (reviewer) → ship (shipper)',
        'from inbox card cache-card — kept in the inbox, listed as started',
        "queued: 2026-11-01: the tick does not start it again while r-2's record stands; take the line off with nemia inbox queue cache-card --off",
        'factory: acme, on /r',
        'workspace: /r',
        'workflow files: copied into /s/runs/r-1/workflow/5b5d',
        'waits on: r-0 — nothing is filed until nemia decide says each has landed on main',
        'reads: r-0 — handed what it concluded, as context; not waited on',
        "reads: r-9, still in flight — what it has when this run's steps are filed is handed, not landed, not judged",
        'ends at: ship — nothing of it runs until nemia approve r-2 ship, which is what files it',
        'label team not inherited: r-0 has team=core, r-9 has team=edge — set it with nemia label run r-2 team=<value>',
        "run 'nemia tick' (or 'nemia up') to start it",
        'Paused since t by ann: upgrade — nothing runs and nothing new starts; nemia resume resumes it: nothing of this run is filed until then',
        'dev/implement.md still writes `nudge`',
        "the card's repo: /old/place is retired and was not read — its factory places the run (nemia factory attach <factory> <workflow> --repo <name>); delete the line",
      ],
    ],
    [
      'a folder run that mounts, writes and leaves out folders and volumes, its --repo having only found the factory',
      {
        id: 'r-3',
        repoFoundFactory: '/elsewhere',
        notMounted: ['/gone'],
        notVolumes: ['/v-gone'],
        run: {
          ...DEV,
          repository: false,
          workspace: '/s/runs/r-3/work',
          mounts: ['/a', '/b'],
          writable: [{ path: '/b', steps: ['implement'] }],
          volumes: ['/v-read'],
          writableVolumes: [
            { path: '/v-mine', steps: ['implement', 'review'] },
            { path: '/v-none', steps: [] },
          ],
          settings: ['team-hooks'],
          cards: { names: ['spec'], dir: '/s/runs/r-3/inputs/cards' },
          carriedFiles: '/s/runs/r-3/carried/9e88',
          ends: [],
        },
      },
      [
        'r-3  3 step(s): implement (implementer) → review (reviewer) → ship (shipper)',
        'factory: acme',
        '--repo /elsewhere only found the factory acme: dev works on /r',
        'mounts: /a, /b — read-only, for every local step but where written below',
        'writable: /b — for implement alone',
        "not mounted: /gone — of the factory's repositories, and no directory now; start again once it is there",
        'volumes: /v-read — read-only, for every local step',
        "volume: /v-mine — writable for implement, review, read-only for every other local step; not the run's workspace: nothing commits or lands what a step writes there",
        "volume: /v-none — writable, and read-only for every step here, since none writes; not the run's workspace: nothing commits or lands what a step writes there",
        "not mounted: /v-gone — of the factory's volumes, and no directory now; start again once it is there",
        "harness settings: team-hooks — for every step on their harness, beneath its agent's own",
        'workspace: /s/runs/r-3/work — a folder per step, made as each is filed, with no git repository',
        'cards: spec — copied into /s/runs/r-3/inputs/cards',
        'workflow files: copied into /s/runs/r-1/workflow/5b5d',
        'carried files: copied into /s/runs/r-3/carried/9e88',
        "run 'nemia tick' (or 'nemia up') to start it",
      ],
    ],
    [
      'an api that says nothing of the run',
      { id: 'r-4' },
      ["r-4  started on the daemon — nemia show r-4 reads it, and the daemon's next pass files its first step"],
    ],
  ];
  for (const [what, answer, lines] of rows) assert.deepEqual(startedLines(answer, new Date('2026-11-12T00:00:00Z')), lines, what);
});

/** What the engine forgot of a run's tasks: none. */
const NO_TASKS = { forgotten: [], waiting: [], why: [], refused: [], refusedWhy: [], left: [], journalBytes: 0, feedLines: 0 };

test('nemia rm prints the run it forgot in one line, worded off the answer, as it printed the api’s line', () => {
  const rows: [string, RunRemoved, string][] = [
    [
      'a cancelled run with nothing cut',
      {
        id: 'r-1',
        removed: true,
        engine: null,
        worktrees: [],
        handedOff: [],
        gone: [],
        files: ['runs/r-1.json', 'runs/r-1/'],
        branches: [],
      },
      'r-1  forgotten: no worktrees; removed runs/r-1.json, runs/r-1/; no branches left',
    ],
    [
      'worktrees removed, handed off and gone; each branch’s fate; the engine’s tasks forgotten, waiting and refused',
      {
        id: 'r-2',
        removed: true,
        engine: {
          ...NO_TASKS,
          forgotten: ['r-2-implement'],
          journalBytes: 2048,
          feedLines: 1,
          left: ['~/.claude/projects/x'],
          waiting: ['r-2-review'],
          why: ['still running'],
          refused: ['r-2-ship'],
          refusedWhy: ['not settled'],
          marker: 'runs/r-2.forgetting',
        },
        worktrees: ['/w/a', '/w/b'],
        handedOff: [{ step: 'implement', branch: 'wf/r-2/implement', commit: 'abcdef1234' }],
        gone: ['/w/c'],
        files: ['runs/r-2.json'],
        branches: [
          { branch: 'wf/r-2/a', deleted: true, why: 'merged' },
          { branch: 'wf/r-2/b', deleted: true, why: 'forced' },
          { branch: 'wf/r-2/c', deleted: false, why: 'default' },
          { branch: 'wf/r-2/d', deleted: false, why: 'unmerged' },
          { branch: 'wf/r-2/e', deleted: false, why: { git: 'checked out at /x' } },
          { branch: 'wf/r-2/f', deleted: false, why: { unread: 'timed out' } },
        ],
        base: 'main',
        repo: '/r',
        isolate: true,
      },
      [
        'r-2  forgotten: removed 2 worktrees, committed what implement left uncommitted on wf/r-2/implement as abcdef1, 1 worktree was already gone',
        'removed runs/r-2.json',
        'deleted wf/r-2/a (merged into main), wf/r-2/b (not merged into main, forced)',
        'kept wf/r-2/c — branches are kept unless asked: --delete-branches deletes those merged into main',
        'kept wf/r-2/d: not merged into main — --force-unmerged deletes it, and the work on it',
        'kept wf/r-2/e: git would not delete it — checked out at /x',
        "kept wf/r-2/f: the place's remove did not answer — timed out; nemia rm r-2 again deletes it once it does",
        'the engine forgot 1 task of it (2.0 KB of journal, 1 feed line)',
        'it left ~/.claude/projects/x',
        "1 task of it waits — still running — and the daemon's passes forget it once it settles, from runs/r-2.forgetting",
        'the engine refused to forget 1 task of it: not settled runs/r-2.forgetting keeps their ids and the daemon asks again each pass; only a person removes it, once nothing of them is wanted: rm runs/r-2.forgetting',
      ].join('; '),
    ],
    [
      'a run on the base itself, and a folder run whose workflow was never frozen',
      {
        id: 'r-3',
        removed: true,
        engine: null,
        worktrees: [],
        handedOff: [],
        gone: [],
        files: [],
        branches: [],
        repo: '/r',
        isolate: false,
      },
      'r-3  forgotten: no worktrees, it worked in /r itself; no branch of its own',
    ],
    [
      'a folder run',
      { id: 'r-4', removed: true, engine: null, files: ['runs/r-4.json'], folder: true, unfrozen: 'its folder does not read' },
      'r-4  forgotten: a folder run, whose steps worked in its own directory — no worktrees, no branches; removed runs/r-4.json; its workflow was never frozen, and its folder does not read',
    ],
  ];
  for (const [what, answer, line] of rows) assert.equal(forgottenLine(answer), line, what);
});
