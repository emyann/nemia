/**
 * The queue on disk: the cap on runs in flight (`WF_MAX_RUNS`), and inbox cards that start themselves (`nemia inbox queue`), judged by the
 * tick over every run and card in a store of its own — told as a person's stories on `story(t)` and the stage (`staged`): a cap of two
 * runs, a run's momentum, a card that becomes a run at a cap of one, and the queue's failures; and as tables, what the daemon's ceilings
 * refuse and what `nemia inbox queue` refuses. Kept focused: a card started by hand, kept, never started again, a record that does not read
 * as a run, and a try file the tick reads only as it writes it.
 *
 * What the cap decides is pure, and lives in `src/cap/cap.test.ts`; what a card and the queue's order are, in `src/inbox/inbox.test.ts`;
 * a queued card whose start fails in git's words, in `queue-store.boundary.test.ts`. A file of its own, since `tick` reads every run
 * under `WF_ROOT`: each story starts on an empty store and leaves none in flight. `WF_ROOT` is read as the module loads, so it is set
 * before the import; `WF_MAX_RUNS` is read on every pass. `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of
 * runs at rest, and a difference throws (`verifyRest` in tick.verb.ts). The stage's engine keeps no pass of its own: `ticking` hands it
 * one that reports nothing, so a pass reads each task off the stand-in as a person settled it.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import type { Engine } from '../src/runtime-client.ts';
import type { Run } from '../src/run.ts';
import { queueLine } from '../src/inbox/inbox.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';
import { decideScreen } from './screens.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-queue-');
const RUNS = path.join(ROOT, 'runs');
const INBOX = path.join(ROOT, 'inbox');

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const {
  addFactory,
  addToInbox,
  advanceRun,
  attachWorkflow,
  cancelRun,
  decideRun,
  readInbox,
  retryRun,
  runSlots,
  startRun,
  startFromInbox,
  tickRun,
  runWith: runEngine,
} = await import('../src/runner.ts');
const { listRuns, readRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
const { filesStore } = await import('../src/record/files.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { passParents } = await import('../src/views/views.verb.ts');
const { NOTHING_READ, standingReader } = await import('../src/standing/standing.verb.ts');
const { story, staged } = await import('./story.ts');
const stage = staged({ runWith: runEngine, main: cli, engineOf });
const { runWith, runPlaced } = stage;
/** The runs waited on as a read with no standing reads them: none of their branches asked. */
const noParents = () => passParents(standingReader(NOTHING_READ));

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** What the engine's own pass answers here: nothing admitted, nothing started, no view — every task is read off the stand-in. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** The stage's engine with a pass of its own that does nothing, and no tally: what a whole-store pass asks of the engine first. */
const ticking = () => {
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  return b;
};

/** An engine of its own whose pass dies of `stop`: a daemon stopped there, or proof that a refusal came before the engine was asked. */
const stoppedBy = (stop: Error) => {
  const own = testEngine();
  const e = engineOf(own.layer);
  Object.assign(e, { tick: () => Effect.die(stop), tallied: undefined });
  return { e, own };
};

/** Refused as `tag`, exit 2, its words naming each of `facts`. */
const refusedAs =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true;
  };

/**
 * A store with no runs, no cards, no tries of the queue and no ceilings of a last pass in it, and the cap as given: `undefined` unsets it.
 */
const emptyStore = (cap: string | undefined) => {
  for (const dir of [RUNS, INBOX, path.join(ROOT, 'queue'), path.join(ROOT, 'tick.json')]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(RUNS, { recursive: true });
  if (cap === undefined) delete process.env.WF_MAX_RUNS;
  else process.env.WF_MAX_RUNS = cap;
};

/** A repository with one commit, so a start has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow of one step, `implement`. */
const oneStep = (() => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
})();

/** A folder of steps written from their frontmatter and a one-line body. */
const folderOf = (steps: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, front] of Object.entries(steps))
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nplace: git\n${front}\n---\n${name} it\n`);
  return dir;
};

/**
 * `nemia start`, for real, of a one-step run over a repository of its own unless given one — created at `createdAt`, written over the
 * record as the test's to say.
 */
const started = async (
  brief: string,
  createdAt: string,
  opts: { isolate?: boolean; after?: string[]; repo?: string } = {},
): Promise<Run> => {
  const run = await runPlaced(
    startRun({
      brief,
      repo: opts.repo ?? aRepo(),
      workflowDir: oneStep,
      isolate: opts.isolate ?? false,
      ...(opts.after ? { after: opts.after } : {}),
    }),
  );
  const file = path.join(RUNS, `${run.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), createdAt }, null, 2));
  return readRun(run.id);
};
const at = (minute: number) => `2026-09-16T09:${String(minute).padStart(2, '0')}:00.000Z`;
const runsWritten = () => fs.readdirSync(RUNS).filter((f) => f.endsWith('.json')).length;

/** What `nemia argv` printed, line by line, over `e` (the stage's engine when none is named). */
const printedBy = async (t: TestContext, argv: string[], e?: Engine): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await stage.main(argv, e);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** A repository with one commit and a one-step workflow under its workflows/ for each name. */
const aRepoWith = (...workflows: string[]): string => {
  const repo = aRepo();
  for (const name of workflows) {
    fs.mkdirSync(path.join(repo, 'workflows', name), { recursive: true });
    fs.writeFileSync(path.join(repo, 'workflows', name, 'implement.md'), `---\nplace: git\n---\nimplement it, on ${name}\n`);
  }
  return repo;
};

/** A card written by hand, under a name of the test's: its keys as given, then its body. */
const aCard = (name: string, keys: Record<string, string>, body: string): string => {
  fs.mkdirSync(INBOX, { recursive: true });
  const file = path.join(INBOX, `${name}.md`);
  fs.writeFileSync(
    file,
    `---\n${Object.entries(keys)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}\n---\n${body}\n`,
  );
  return file;
};

const fromCard = (card: string) => listRuns().filter((r) => r.from?.inbox === card);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The factory `solo`, filed afresh on one repository that holds the tests' team under `workflows/`, with `attached` attached to it: the
 * team's `dev` names its agents in its steps, so a start of it in `solo` hires no one.
 */
const aSoloFactory = (attached: readonly string[]): string => {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const repo = aRepo();
  fs.cpSync(TEAM, path.join(repo, 'workflows'), { recursive: true });
  addFactory({ name: 'solo', repos: [repo] });
  for (const workflow of attached) attachWorkflow({ factory: 'solo', workflow });
  return repo;
};

/** Unfactored starts as shipped, for one test: the switch the tests' ambient sets is taken off, and put back after. */
const asShipped = (t: { after: (f: () => void) => void }): void => {
  const was = process.env.WF_DEFAULT_FACTORY_STARTS;
  delete process.env.WF_DEFAULT_FACTORY_STARTS;
  t.after(() => {
    if (was !== undefined) process.env.WF_DEFAULT_FACTORY_STARTS = was;
  });
};

/** A watcher's workflow: its one step in the repository's own checkout, outside the cap on runs, bridged, on a window of its own. */
const WATCHER = folderOf({
  supervise: 'workspace: main\nslot: none\nharness: claude\ncontext: 200k\nbackground: true\nremote: true\npermissionMode: dontAsk',
});

test('a cap of two runs: the rest wait for a slot, as `nemia tick`, `nemia ls` and `nemia decide` say; the run created first takes a slot a finished or called-off run frees; a watcher and a run waiting on another are not counted; with no cap, nothing waits', async (t) => {
  const s = story(t);
  emptyStore('2');
  t.after(() => emptyStore(undefined));
  const b = ticking();
  const task = (r: Run) => `${r.id}-implement`;
  let one: Run, two: Run, younger: Run, older: Run;
  const HELD = 'waiting for a run slot (2 of 2 in flight)';
  const heldDecided = (r: Run) => [
    `  ${HELD}`,
    `  nothing of ${r.id} is filed until a run in flight settles, oldest held first; nothing to decide yet`,
  ];

  await s.test(
    'at a cap of 2, two runs are filed and the others wait: `nemia tick`, `nemia ls` and `nemia decide` say 2 of 2 in flight, and each record says when the cap first held it',
    async (c) => {
      one = await started('first', at(1));
      two = await started('second', at(2));
      younger = await started('b the younger', at(4));
      older = await started('c the older', at(3), { isolate: true });
      assert.ok(younger.id < older.id, 'by id the younger comes first; by when it was created, the older');

      const ticked = await printedBy(c, ['tick']);
      assert.deepEqual(b.filings, [task(one), task(two)]);
      for (const held of [younger, older]) assert.ok(ticked.includes(`${held.id}  running  ${HELD}`), ticked.join('\n'));
      assert.ok(ticked.includes(`   implement: ${HELD} — filed once a run in flight settles`), ticked.join('\n'));
      assert.ok(readRun(older.id).slotHeldAt, 'the pass that held it wrote when');
      assert.deepEqual(readRun(one.id).slotHeldAt, undefined, 'a run the cap never held has no time written');

      const listed = await printedBy(c, ['ls']);
      assert.ok(
        listed.some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)),
        listed.join('\n'),
      );
      assert.equal(listed.filter((l) => l.includes('waiting for a run slot')).length, 2, 'the two in flight say pending');
      assert.ok(
        (await printedBy(c, ['ls', older.id])).some((l) => /^ {3}implement +waiting for a run slot \(2 of 2 in flight\)/.test(l)),
        'judged over the store for one run too',
      );
      assert.deepEqual((await printedBy(c, ['decide', older.id])).slice(2), heldDecided(older));
      assert.equal((await runWith(b.e, decideRun(one.id))).held, undefined);
    },
  );

  await s.test(
    'the next pass holds them again, files nothing, and writes nothing: the time stands, and the note is said once',
    async () => {
      const heldAt = readRun(older.id).slotHeldAt;
      const { runs: again } = await runWith(b.e, tickRun());
      assert.deepEqual([b.filings.length, readRun(older.id).slotHeldAt], [2, heldAt]);
      assert.deepEqual(again.find((a) => a.run.id === older.id)!.notes, []);
      assert.deepEqual(
        [
          again.find((a) => a.run.id === older.id)!.held,
          again
            .filter((a) => a.inFlight)
            .map((a) => a.run.id)
            .sort(),
        ],
        [{ inFlight: 2, cap: 2 }, [one.id, two.id].sort()],
      );
    },
  );

  await s.test(
    "`nemia ls` and `nemia decide` judge by the cap the last pass ran with, not their own shell's: whatever WF_MAX_RUNS a shell sets",
    async (c) => {
      const seen = async () => ({
        listed: (await printedBy(c, ['ls'])).filter((l) => l.includes('waiting for a run slot')).map((l) => l.trim()),
        decided: (await printedBy(c, ['decide', older.id])).slice(2),
      });
      const held = { listed: [`implement      ${HELD}`, `implement      ${HELD}`], decided: heldDecided(older) };
      try {
        for (const shell of [undefined, '5', '1', 'two']) {
          if (shell === undefined) delete process.env.WF_MAX_RUNS;
          else process.env.WF_MAX_RUNS = shell;
          assert.deepEqual(await seen(), held, `a shell with WF_MAX_RUNS=${shell} says what the daemon holds`);
        }
      } finally {
        process.env.WF_MAX_RUNS = '2';
      }
    },
  );

  await s.test('the whole screen of a run the cap holds', async (c) => {
    assert.deepEqual(await decideScreen(c, b.e, [older.id], { '<id>': older.id, '<root>': ROOT }, stage.place().place), [
      '<id>  c the older',
      '',
      '  waiting for a run slot (2 of 2 in flight)',
      '  nothing of <id> is filed until a run in flight settles, oldest held first; nothing to decide yet',
    ]);
  });

  await s.test(
    "a watcher's run (`slot: none`) files its step at a full cap, counts against nothing and holds no other run — nor while its session runs on an answer",
    async () => {
      const watcher = await runPlaced(startRun({ brief: 'supervise this repository', repo: aRepo(), workflowDir: WATCHER }));
      const { runs: pass } = await runWith(b.e, tickRun());
      const watching = pass.find((a) => a.run.id === watcher.id)!;
      assert.deepEqual([watching.filed, watching.held, watching.inFlight], [['supervise'], undefined, false]);
      assert.deepEqual(
        pass.filter((a) => a.held).map((a) => [a.run.id, a.held]),
        [
          [younger.id, { inFlight: 2, cap: 2 }],
          [older.id, { inFlight: 2, cap: 2 }],
        ],
        'the work beside it waits as before, listed by id: the watcher took no slot',
      );
      const held = async () =>
        [...(await runWith(b.e, runSlots(b.e, listRuns(), process.env, noParents())))].map(([id]) => id).sort((x, y) => x.localeCompare(y));
      assert.deepEqual(await held(), [younger.id, older.id], 'between passes too');

      b.settle(`${watcher.id}-supervise`, 'succeeded', {
        outcome: 'blocked',
        summary: 'a run is ready',
        artifacts: [],
        needs: 'Merge it?',
      });
      for (let pass = 0; pass < 2; pass++)
        assert.equal(
          (await runWith(b.e, tickRun())).runs.find((a) => a.run.id === watcher.id)!.inFlight,
          false,
          `pass ${pass}: its own filing is not counted while its session runs`,
        );
      assert.deepEqual(await held(), [younger.id, older.id]);
    },
  );

  await s.test(
    "REFUSED at `nemia start`, with nothing written: `slot: none` on a step of a workflow that has another — a slot is a run's",
    async () => {
      const before = runsWritten();
      const shapes: Record<string, string>[] = [
        { supervise: 'slot: none', implement: 'harness: claude' },
        { implement: 'harness: claude', supervise: 'after: implement\nslot: none' },
        { supervise: 'slot: none', review: 'after: supervise' },
      ];
      for (const steps of shapes)
        await assert.rejects(
          async () => await runPlaced(startRun({ brief: 'watch it', repo: aRepo(), workflowDir: folderOf(steps) })),
          refusedAs('Invalid', 'supervise: `slot: none`', '(WF_MAX_RUNS)', "a slot is a run's, not a step's"),
          Object.keys(steps).join(' + '),
        );
      assert.equal(runsWritten(), before, 'nothing written');
    },
  );

  await s.test(
    'a run that finishes frees its slot on the next pass, and the run created first takes it — not the one first by id, nor by the order the store lists it in',
    async () => {
      b.settle(task(one), 'succeeded', SIGNED);
      const { runs: freed } = await runWith(b.e, tickRun());
      assert.deepEqual(b.filings.slice(-1), [task(older)], 'signed off: finished, and the pass files the run held longest');
      assert.deepEqual(
        [freed.find((a) => a.run.id === older.id)!.filed, freed.find((a) => a.run.id === younger.id)!.held],
        [['implement'], { inFlight: 2, cap: 2 }],
        'and holds the other',
      );
    },
  );

  await s.test('a run called off while it runs frees its slot once the engine has stopped it, and the run held next takes it', async () => {
    b.settle(task(two), 'working');
    await runWith(b.e, cancelRun(two.id));
    assert.ok(b.stopped.includes(task(two)), 'its task asked to stop');
    b.settle(task(two), 'stopped');
    await runWith(b.e, tickRun());
    assert.deepEqual(b.filings.slice(-1), [task(younger)]);
  });

  await s.test("the timeline counts the wait for a slot as the run's queue, on `nemia decide` too", async (c) => {
    b.tasks.get(task(younger))!.filedAt = '2026-09-16T10:15:00.000Z';
    b.settle(task(younger), 'succeeded', SIGNED);
    const { timeline } = await runWith(b.e, decideRun(younger.id));
    assert.deepEqual(
      timeline.slot,
      { from: at(4), filedAt: '2026-09-16T10:15:00.000Z', ms: 71 * 60_000, queued: '1h11m' },
      'created at 09:04 and filed at 10:15: that wait is its queue',
    );
    assert.ok((await printedBy(c, ['decide', younger.id])).includes('  timeline  run slot  queued 1h11m'), 'on the screen');
  });

  await s.test(
    'a run waiting on `--after` counts only once filed: with one run in flight, a run started after it is filed — and the one after that is held at 2 of 2',
    async (c) => {
      const child = await started('child', at(5), { after: [older.id], isolate: true, repo: older.repo });
      const plain = await started('plain', at(6));
      const { runs: pass } = await runWith(b.e, tickRun());
      assert.deepEqual(b.filings.slice(-1), [task(plain)]);
      const waiting = pass.find((a) => a.run.id === child.id)!;
      assert.deepEqual([waiting.waiting.map((w) => w.run), waiting.held, waiting.inFlight], [[older.id], undefined, false]);

      const later = await started('later', at(7));
      const filed = b.filings.length;
      await runWith(b.e, tickRun());
      assert.equal(b.filings.length, filed);
      const listed = await printedBy(c, ['ls']);
      assert.ok(
        listed.some((l) => new RegExp(`^ {3}implement +waiting on ${older.id}`).test(l)),
        listed.join('\n'),
      );
      assert.equal(listed.filter((l) => l.includes(HELD)).length, 1, `only ${later.id}`);
    },
  );

  await s.test(
    "with no cap — WF_MAX_RUNS unset, or 0 — a pass files every run and writes nothing of a slot; before any pass, a shell's own cap, and none the daemon does not run with",
    async (c) => {
      const recorded = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'tick.json'), 'utf8')) as { sessions: number; runs: number };
      const listedHeld = async () => (await printedBy(c, ['ls'])).filter((l) => l.includes('waiting for a run slot'));
      fs.rmSync(path.join(ROOT, 'tick.json'));
      delete process.env.WF_MAX_RUNS;
      assert.deepEqual(await listedHeld(), [], "before any pass has written its ceilings, the shell's own: with none, nothing is held");
      process.env.WF_MAX_RUNS = 'two';
      await assert.rejects(
        stage.main(['ls']),
        refusedAs('Invalid', 'WF_MAX_RUNS=two', 'WF_MAX_RUNS=2'),
        "a shell's own value that is not a count",
      );

      for (const cap of [undefined, '0']) {
        if (cap === undefined) delete process.env.WF_MAX_RUNS;
        else process.env.WF_MAX_RUNS = cap;
        const runs = [await started('fresh one', at(8)), await started('fresh two', at(9))];
        const { runs: pass } = await runWith(b.e, tickRun());
        assert.equal(recorded().runs, 0, `${cap}: the pass writes down that it runs with no cap`);
        for (const r of runs) assert.ok(b.filings.includes(task(r)), `${cap}: ${r.id} filed`);
        assert.deepEqual(
          pass.filter((a) => a.held),
          [],
        );
        assert.ok(runs.every((r) => readRun(r.id).slotHeldAt === undefined));
      }
      await started('fourth', at(10));
      process.env.WF_MAX_RUNS = '1';
      try {
        assert.deepEqual(await listedHeld(), [], 'not held by a cap the daemon does not run with');
      } finally {
        delete process.env.WF_MAX_RUNS;
      }
    },
  );
});

/** `findings` and `again`, as a looping review declares them. */
const LOOPING = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
    again: { type: 'boolean' },
  },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const FOUND = [{ file: 'src/flag.ts', line: 12, what: 'the flag is read before it is parsed' }];

test('a run keeps its momentum: its first steps are filed with none, and everything after them — a step after another, a check, a round, a try `retries:` files and one `nemia retry` asks for — with 1', async (t) => {
  const s = story(t);
  emptyStore(undefined);
  t.after(() => emptyStore(undefined));
  const b = stage.board();
  const priorityByStep = (id: string) =>
    Object.fromEntries(
      b.filings
        .filter((task) => task.startsWith(`${id}-`))
        .map((task) => [task.slice(id.length + 1), b.tasks.get(task)!.spec.priority ?? 'none']),
    );
  const advanced = async (id: string) => runWith(b.e, advanceRun(readRun(id)));

  await s.test('every step that waits on nothing has no momentum, and the step that joins them has 1', async () => {
    const dir = folderOf({ left: '', right: '', join: 'after: left, right' });
    const run = await runPlaced(startRun({ brief: 'two halves', repo: aRepo(), workflowDir: dir }));
    assert.deepEqual((await advanced(run.id)).filed.sort(), ['left', 'right']);
    b.settle(`${run.id}-left`, 'succeeded', SIGNED);
    b.settle(`${run.id}-right`, 'succeeded', SIGNED);
    assert.deepEqual((await advanced(run.id)).filed, ['join']);
    assert.deepEqual(priorityByStep(run.id), { left: 0, right: 0, join: 1 });
  });

  await s.test(
    "implement, its check, review looping back: round 2's implement, continued, its check, and a new session of review — each with 1",
    async () => {
      const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
      fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: npm test\n---\nimplement it\n');
      fs.writeFileSync(
        path.join(dir, 'review.md'),
        '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\n---\nreview it\n',
      );
      fs.writeFileSync(path.join(dir, 'review.schema.json'), JSON.stringify(LOOPING, null, 2));
      const run = await runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: dir, isolate: false }));
      const onRound = (step: string, n: number) => (n === 1 ? `${run.id}-${step}` : `${run.id}-${step}-try${n}`);
      const toReview = async (n: number, again: boolean) => {
        b.settle(
          onRound('implement', n),
          'succeeded',
          n === 1 ? SIGNED : { ...SIGNED, replies: [{ finding: 'src/flag.ts:12', answer: 'fixed', why: 'parsed first' }] },
        );
        assert.deepEqual((await advanced(run.id)).checked, ['implement'], `round ${n}: implement's check`);
        b.settle(`${onRound('implement', n)}-check`, 'succeeded', undefined, 0);
        assert.deepEqual((await advanced(run.id)).filed, ['review'], `round ${n}: review`);
        b.settle(onRound('review', n), 'succeeded', { ...SIGNED, findings: FOUND, again });
      };
      await advanced(run.id);
      await toReview(1, true);
      assert.deepEqual((await advanced(run.id)).looped, ['review']);
      await toReview(2, false);
      assert.deepEqual(priorityByStep(run.id), {
        implement: 0,
        'implement-check': 1,
        review: 1,
        'implement-try2': 1,
        'implement-try2-check': 1,
        'review-try2': 1,
      });
    },
  );

  await s.test('a try `retries:` files, its check, and a try `nemia retry` asks for — each with 1', async () => {
    const run = await runPlaced(
      startRun({
        brief: 'add a flag',
        repo: aRepo(),
        workflowDir: folderOf({ implement: 'check: npm test\nretries: 1', review: 'after: implement' }),
        isolate: false,
      }),
    );
    await advanced(run.id);
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await advanced(run.id);
    b.settle(`${run.id}-implement-check`, 'failed', undefined, 1);
    assert.deepEqual((await advanced(run.id)).tried, ['implement']);
    b.settle(`${run.id}-implement-try2`, 'succeeded', SIGNED);
    assert.deepEqual((await advanced(run.id)).checked, ['implement']);
    b.settle(`${run.id}-implement-try2-check`, 'failed', undefined, 1);
    await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
    assert.deepEqual((await advanced(run.id)).tried, ['implement']);
    assert.deepEqual(priorityByStep(run.id), {
      implement: 0,
      'implement-check': 1,
      'implement-try2': 1,
      'implement-try2-check': 1,
      'implement-try3': 1,
    });
  });
});

test("the daemon's ceilings, as `nemia up`, `nemia tick` and `nemia ls` read them: said in words before the first pass — REFUSED by name, exit 2, a value that does not read, before the store is taken or the engine asked", async (t) => {
  emptyStore(undefined);
  t.after(() => {
    emptyStore(undefined);
    process.env.WF_VERIFY_REST = '1';
    delete process.env.WF_MAX_CONCURRENT;
  });
  const stop = Object.assign(new Error('the engine was asked to tick'), { exitCode: 9 });
  const daemon = path.join(ROOT, 'daemon.json');
  const daemonFile = () => (fs.existsSync(daemon) ? fs.readFileSync(daemon, 'utf8') : undefined);

  await t.test('`nemia up` says both ceilings in words before its first pass, and the store it takes, once per start', async (c) => {
    const { e } = stoppedBy(stop);
    process.env.WF_MAX_CONCURRENT = '4';
    const printed: string[] = [];
    const log = c.mock.method(console, 'log', (...args: unknown[]) => {
      printed.push(args.join(' '));
    });
    try {
      await assert.rejects(stage.main(['up'], e), (err) => err === stop);
      process.env.WF_MAX_RUNS = '2';
      await assert.rejects(stage.main(['up', '1000'], e), (err) => err === stop);
    } finally {
      log.mock.restore();
      delete process.env.WF_MAX_CONCURRENT;
      delete process.env.WF_MAX_RUNS;
    }
    const holds = `   holds ${ROOT} as pid ${process.pid} — a second daemon, the api or a nemia up, or a nemia tick, on this store is refused while it ticks (daemon.json)`;
    const startedLines = printed.filter((l) => / {2}daemon started {2}· /.test(l));
    assert.deepEqual(
      startedLines.map((l) => l.replace(/^\d\d:\d\d:\d\d {2}/, '').replace(/at \S+$/, 'at …')),
      [`pid ${process.pid}  daemon started  · first daemon on this store`, `pid ${process.pid}  daemon started  · last stopped at …`],
      'each start writes the feed its daemon started line, the second saying when the first stopped',
    );
    assert.deepEqual(
      printed.filter((l) => !startedLines.includes(l)),
      [
        'up — every 4000ms, ^C to stop',
        '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
        '   runs in flight: no cap (WF_MAX_RUNS)',
        holds,
        'up — every 1000ms, ^C to stop',
        '   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)',
        '   runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)',
        holds,
      ],
      'the store taken is said once per start; daemon.store.test.ts has the rest of it',
    );
  });

  await started('first', at(1));
  const rows: Array<[name: string, env: Record<string, string>, argv: string[] | 'pass', facts: string[], engineAskedFirst: boolean]> = [
    ['WF_MAX_RUNS=two, by `nemia up`', { WF_MAX_RUNS: 'two' }, ['up'], ['WF_MAX_RUNS=two', 'WF_MAX_RUNS=2'], false],
    ['WF_MAX_RUNS=two, by `nemia tick`', { WF_MAX_RUNS: 'two' }, ['tick'], ['WF_MAX_RUNS=two', 'WF_MAX_RUNS=2'], true],
    ['WF_MAX_RUNS=two, by `nemia ls`', { WF_MAX_RUNS: 'two' }, ['ls'], ['WF_MAX_RUNS=two', 'WF_MAX_RUNS=2'], true],
    ['WF_MAX_CONCURRENT=-3, by `nemia up`', { WF_MAX_CONCURRENT: '-3' }, ['up'], ['WF_MAX_CONCURRENT=-3', 'WF_MAX_CONCURRENT=4'], false],
    ['WF_MAX_CONCURRENT=-3, by `nemia tick`', { WF_MAX_CONCURRENT: '-3' }, ['tick'], ['WF_MAX_CONCURRENT=-3', 'WF_MAX_CONCURRENT=4'], true],
    ['WF_VERIFY_REST=true, by `nemia up`', { WF_VERIFY_REST: 'true' }, ['up'], ['WF_VERIFY_REST=true', 'WF_VERIFY_REST=1'], false],
    ['WF_VERIFY_REST=true, by `nemia tick`', { WF_VERIFY_REST: 'true' }, ['tick'], ['WF_VERIFY_REST=true', 'WF_VERIFY_REST=1'], false],
    ['WF_VERIFY_REST=true, by a pass', { WF_VERIFY_REST: 'true' }, 'pass', ['WF_VERIFY_REST=true', 'WF_VERIFY_REST=1'], false],
  ];
  for (const [name, env, argv, facts, engineAskedFirst] of rows)
    await t.test(`REFUSED: ${name}`, async (c) => {
      const held = daemonFile();
      const { e, own } = stoppedBy(stop);
      if (engineAskedFirst) Object.assign(e, { tick: () => Effect.succeed(QUIET) });
      Object.assign(process.env, env);
      c.mock.method(console, 'log', () => {});
      try {
        await assert.rejects(argv === 'pass' ? runWith(e, tickRun()) : stage.main(argv, e), (err: Error & { exitCode?: number }) => {
          assert.equal(err.exitCode, 2, err.message);
          names(err.message, ...facts);
          return true;
        });
      } finally {
        for (const key of Object.keys(env)) delete process.env[key];
        process.env.WF_VERIFY_REST = '1';
        c.mock.restoreAll();
      }
      assert.deepEqual(
        own.filings,
        [],
        engineAskedFirst ? 'nothing filed by the pass that refused' : 'nothing filed: the engine was not asked',
      );
      if (name.startsWith('WF_MAX_CONCURRENT') && argv[0] === 'up') assert.equal(daemonFile(), held, 'the store is not taken');
    });
});

test('a card becomes a run: filed with its factory and its gate, queued, it waits at a cap of 1 while a run is in flight, and starts when a slot frees, the oldest queued first, one a pass — removed, its run naming it, as `nemia tick`, `nemia decide` and `nemia up` say', async (t) => {
  const s = story(t);
  emptyStore('1');
  t.after(() => emptyStore(undefined));
  const b = ticking();
  const solo = aSoloFactory(['dev']);
  const repo = aRepoWith('dev');
  let name = '';
  let file = '';
  let busy: Run;
  let run: Run;

  await s.test('`nemia inbox add <file> --factory` files a card whose gate is in its file, and `nemia inbox` lists both', async (c) => {
    const idea = path.join(fs.mkdtempSync(path.join(ROOT, 'given-')), 'idea.md');
    fs.writeFileSync(idea, '---\nworkflow: dev\ngate: review\n---\nCache the views between passes\n');
    [name] = (await printedBy(c, ['inbox', 'add', idea, '--factory', 'solo']))[0].split('  ');
    file = path.join(INBOX, `${name}.md`);
    assert.equal(fs.readFileSync(file, 'utf8'), '---\nworkflow: dev\ngate: review\nfactory: solo\n---\nCache the views between passes\n');
    const [listed] = (await printedBy(c, ['inbox'])).filter((l) => l.startsWith(name));
    assert.ok(listed.includes('gate: review') && listed.includes('factory: solo'), listed);
  });

  await s.test(
    "`nemia inbox queue` marks it, says its place and that it starts on its factory's one repository, and keeps the card file's time — a queue is no edit of the idea, and `--off` takes it back as old still",
    async (c) => {
      const filed = new Date('2026-09-16T08:00:00.000Z');
      fs.utimesSync(file, filed, filed);
      const queued = await printedBy(c, ['inbox', 'queue', name]);
      const when = /^queued: (.*)$/m.exec(fs.readFileSync(file, 'utf8'))![1];
      assert.ok(queued[0].startsWith(`${name}  queued at ${when}, 1 of 1`), queued[0]);
      assert.equal(
        queued[1],
        `the tick starts it on its own once its turn comes and a run slot is free, on ${solo}, its factory's one repository — take it back with nemia inbox queue ${name} --off`,
      );
      assert.match(
        (await printedBy(c, ['inbox'])).find((l) => l.startsWith(name))!,
        /  queued 1 of 1$/,
      );
      assert.equal(fs.statSync(file).mtime.toISOString(), filed.toISOString(), 'as old as it was');
      await printedBy(c, ['inbox', 'queue', name, '--off']);
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^queued: /m, 'taken back');
      assert.equal(fs.statSync(file).mtime.toISOString(), filed.toISOString(), 'and as old still');
      await printedBy(c, ['inbox', 'queue', name]);
      assert.match(fs.readFileSync(file, 'utf8'), /^queued: /m, 'queued again');
      const fresh = addToInbox({ text: 'Filed now', workflow: 'dev', repo });
      assert.ok(
        fs.statSync(fresh.file).mtime > filed,
        'nemia inbox add writes a card at the time it is filed: it is the queue that keeps the time',
      );
      fs.rmSync(fresh.file);
    },
  );

  await s.test('at a cap of 1, with a run in flight, the queued cards wait, pass after pass', async () => {
    busy = await started('busy', at(1));
    aCard('z-old-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Old');
    aCard('m-parked-e5f6', { workflow: 'dev', repo }, 'Parked, not queued');
    const waited = await runWith(b.e, tickRun());
    assert.deepEqual([waited.queue, b.filings, fromCard('z-old-c3d4')], [undefined, [`${busy.id}-implement`], []]);
    assert.deepEqual((await runWith(b.e, tickRun())).queue, undefined, 'and on every pass the run is in flight');
    assert.ok(fs.existsSync(path.join(INBOX, 'z-old-c3d4.md')) && fs.existsSync(file));
  });

  await s.test(
    'the pass that sees that run finish starts the card queued first — by when it was queued, not by its name — and only it',
    async () => {
      b.settle(`${busy.id}-implement`, 'succeeded', SIGNED);
      const freed = await runWith(b.e, tickRun());
      const [old] = fromCard('z-old-c3d4');
      assert.deepEqual(freed.queue, { card: 'z-old-c3d4', run: old.id });
      assert.deepEqual([fs.existsSync(file), fromCard(name)], [true, []], 'one card a pass');
    },
  );

  await s.test(
    "the card's run is counted before any other card: the next pass files its roots, and the next card waits behind it",
    async () => {
      const [old] = fromCard('z-old-c3d4');
      const counted = await runWith(b.e, tickRun());
      assert.deepEqual([counted.queue, b.filings, fromCard(name)], [undefined, [`${busy.id}-implement`, `${old.id}-implement`], []]);
    },
  );

  await s.test(
    "once its slot frees, the factory's card starts in its factory, on its one repository: `nemia tick` says `started <card> as <run>`, the card is kept, listed as started, its run records where it came from and its gate, and its roots are filed on the pass after",
    async (c) => {
      const [old] = fromCard('z-old-c3d4');
      b.settle(`${old.id}-implement`, 'succeeded', SIGNED);
      const ticked = await printedBy(c, ['tick']);
      [run] = fromCard(name);
      assert.ok(run, 'a run started from the card');
      assert.equal(ticked[0], `started ${name} as ${run.id}`);
      assert.deepEqual(
        [run.brief, run.repo, run.workflowDir, run.factory, run.isolate, run.from, run.gates?.includes('review'), fs.existsSync(file)],
        ['Cache the views between passes', solo, path.join(solo, 'workflows', 'dev'), 'solo', true, { inbox: name }, true, true],
      );
      assert.deepEqual(
        [readInbox().find((l) => l.name === name)?.state, /^queued:/m.test(fs.readFileSync(file, 'utf8'))],
        ['started', false],
        'the card kept, listed as started, its queued: line taken off',
      );
      const next = await runWith(b.e, tickRun());
      assert.deepEqual(
        [next.queue, b.filings.at(-1)],
        [undefined, `${run.id}-implement`],
        'its roots filed on the next pass, and nothing more started',
      );
    },
  );

  await s.test('`nemia decide` names the card the run came from, under its line', async (c) => {
    assert.equal((await printedBy(c, ['decide', run.id]))[1], `  from inbox card ${name}`);
  });

  await s.test(
    '`--off` and `nemia inbox rm` take a card back, and a free slot starts nothing — nor a card never queued; `--workflow` writes both',
    async (c) => {
      await runWith(b.e, cancelRun(run.id));
      b.settle(`${run.id}-implement`, 'stopped');
      const bare = addToInbox({ text: 'No workflow yet', repo });
      assert.deepEqual(await printedBy(c, ['inbox', 'queue', bare.card.name, '--off']), [
        `${bare.card.name}  not queued — nothing to take back`,
      ]);
      await printedBy(c, ['inbox', 'queue', bare.card.name, '--workflow', 'dev']);
      assert.match(
        fs.readFileSync(bare.file, 'utf8'),
        new RegExp(`^---\\nworkflow: dev\\nrepo: ${escaped(repo)}\\nqueued: \\S+\\n---\\nNo workflow yet\\n$`),
        '--workflow writes both',
      );
      assert.deepEqual(await printedBy(c, ['inbox', 'queue', bare.card.name, '--off']), [
        `${bare.card.name}  taken back: it no longer starts on its own — start it with nemia start ${bare.file}`,
      ]);
      assert.equal(fs.readFileSync(bare.file, 'utf8'), `---\nworkflow: dev\nrepo: ${repo}\n---\nNo workflow yet\n`);
      const runs = listRuns().length;
      assert.deepEqual([(await runWith(b.e, tickRun())).queue, listRuns().length], [undefined, runs], 'taken back: not started');
      await printedBy(c, ['inbox', 'queue', bare.card.name]);
      await printedBy(c, ['inbox', 'rm', bare.card.name]);
      assert.deepEqual(
        [(await runWith(b.e, tickRun())).queue, listRuns().length],
        [undefined, runs],
        'queued, then dropped: nothing to start',
      );
      assert.ok(fs.existsSync(path.join(INBOX, 'm-parked-e5f6.md')), 'a card not queued is never started');
    },
  );

  await s.test(
    '`nemia inbox queue --workflow` given a path reads it from where it is typed, and writes it absolute on the card',
    async (c) => {
      const card = addToInbox({ text: 'Queued on a folder', repo });
      const folder = path.join(repo, 'workflows', 'dev');
      await printedBy(c, ['inbox', 'queue', card.card.name, '--workflow', path.relative(process.cwd(), folder)]);
      assert.match(fs.readFileSync(card.file, 'utf8'), new RegExp(`^---\\nworkflow: ${escaped(folder)}\\nrepo: `));
      await printedBy(c, ['inbox', 'rm', card.card.name]);
    },
  );

  await s.test(
    'a queued card that names no repository starts on the repository the daemon runs in, as `nemia start` takes `.`',
    async (c) => {
      const daemons = aRepoWith('dev');
      const { card } = addToInbox({ text: 'Anywhere the daemon is', workflow: 'dev' });
      await printedBy(c, ['inbox', 'queue', card.name]);
      const pass = await runWith(b.e, tickRun({ repo: daemons }));
      const [started] = fromCard(card.name);
      assert.deepEqual(
        [pass.queue, started?.repo, started?.workflowDir],
        [{ card: card.name, run: started.id }, daemons, path.join(daemons, 'workflows', 'dev')],
      );
      await runWith(b.e, cancelRun(started.id));
    },
  );

  await s.test('`nemia up` logs a card it starts as `nemia tick` does, a time before it', async (c) => {
    aCard('up-card-a1b2', { workflow: 'dev', repo, queued: at(30) }, 'Show the flag');
    let passes = 0;
    const stop = new Error('the test stops the daemon');
    Object.assign(b.e, { tick: () => (++passes > 1 ? Effect.die(stop) : Effect.succeed(QUIET)) });
    const printed: string[] = [];
    const log = c.mock.method(console, 'log', (...args: unknown[]) => {
      printed.push(args.join(' '));
    });
    try {
      await assert.rejects(stage.main(['up', '1']), (err) => err === stop);
    } finally {
      log.mock.restore();
      Object.assign(b.e, { tick: () => Effect.succeed(QUIET) });
    }
    const [upRun] = fromCard('up-card-a1b2');
    assert.ok(
      printed.some((l) => new RegExp(`^\\d\\d:\\d\\d:\\d\\d  started up-card-a1b2 as ${upRun.id}$`).test(l)),
      printed.join('\n'),
    );
  });
});

test("the queue's failures: a card whose start is refused — its workflow gone, its repository deleted, refused on the daemon's repository or its factory's — is left as it is, said once and passed over while it reads the same, and the card behind it has its turn", async (t) => {
  const s = story(t);
  t.after(() => emptyStore(undefined));
  const b = ticking();

  await s.test(
    'REFUSED: a card whose workflow is gone is left queued as it is, named on `nemia tick` and in `nemia inbox`, the card behind it starts on the next pass, and queued again with its workflow back it starts',
    async (c) => {
      emptyStore(undefined);
      const repo = aRepoWith('dev');
      const gone = aCard('gone-a1b2', { workflow: 'nope', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Its workflow is gone');
      aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');
      const text = fs.readFileSync(gone, 'utf8');

      const [line] = await printedBy(c, ['tick']);
      names(
        line,
        'gone-a1b2 not started: gone-a1b2.md: `workflow: nope`',
        `no workflow folder at ${path.join(INBOX, 'nope')}`,
        `nemia inbox queue gone-a1b2 --off, then nemia inbox queue gone-a1b2`,
      );
      assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []], 'the card as it was, and no run');
      const listed = (await printedBy(c, ['inbox'])).find((l) => l.startsWith('gone-a1b2'))!;
      names(listed, 'workflow: nope', 'queued 1 of 2 — not started at ', 'gone-a1b2.md: `workflow: nope`');

      const next = await runWith(b.e, tickRun());
      const [behind] = fromCard('behind-c3d4');
      assert.deepEqual(next.queue, { card: 'behind-c3d4', run: behind.id }, 'not tried again: the card behind it starts');
      assert.deepEqual(
        [(await runWith(b.e, tickRun())).queue, fromCard('gone-a1b2')],
        [undefined, []],
        'the refused card waits for a person',
      );

      fs.mkdirSync(path.join(repo, 'workflows', 'nope'));
      fs.writeFileSync(path.join(repo, 'workflows', 'nope', 'implement.md'), '---\nplace: git\n---\nimplement it\n');
      await printedBy(c, ['inbox', 'queue', 'gone-a1b2', '--off']);
      await printedBy(c, ['inbox', 'queue', 'gone-a1b2']);
      const retried = await runWith(b.e, tickRun());
      const [back] = fromCard('gone-a1b2');
      assert.deepEqual(retried.queue, { card: 'gone-a1b2', run: back.id });
      assert.deepEqual(fs.readdirSync(path.join(ROOT, 'queue')), [], 'its refusal removed once the card no longer read as refused');
    },
  );

  await s.test(
    'REFUSED: a card whose `repo:` folder was deleted keeps its place and is tried, refused by name; the card behind it starts on the next pass, `--off` takes it back, and it is queued again only once it reads',
    async (c) => {
      emptyStore(undefined);
      const repo = aRepoWith('dev');
      const doomed = aRepoWith('dev');
      const gone = aCard('gone-a1b2', { workflow: 'dev', repo: doomed, queued: '2026-09-16T09:00:00.000Z' }, 'Its repository is gone');
      aCard('behind-c3d4', { workflow: 'dev', repo, queued: '2026-09-16T09:05:00.000Z' }, 'Behind it');
      fs.rmSync(doomed, { recursive: true, force: true });
      const text = fs.readFileSync(gone, 'utf8');

      const ticked = await printedBy(c, ['tick']);
      assert.equal(ticked.length, 1, ticked.join('\n'));
      names(ticked[0], `gone-a1b2 not started: gone-a1b2.md: \`repo: ${doomed}\` names no directory`, 'nemia inbox queue gone-a1b2 --off');
      assert.deepEqual([fs.readFileSync(gone, 'utf8'), listRuns()], [text, []]);
      const listed = (await printedBy(c, ['inbox'])).find((l) => l.startsWith('gone-a1b2'))!;
      names(listed, `gone-a1b2.md: \`repo: ${doomed}\` names no directory`, 'queued 1 of 2 — not started at ');

      const next = await runWith(b.e, tickRun());
      const [behind] = fromCard('behind-c3d4');
      assert.deepEqual(next.queue, { card: 'behind-c3d4', run: behind.id });

      assert.deepEqual(
        await printedBy(c, ['inbox', 'queue', 'gone-a1b2', '--off']),
        [`gone-a1b2  taken back: it no longer starts on its own — start it with nemia start ${gone}`],
        'taken back though its repository is gone',
      );
      assert.equal(fs.readFileSync(gone, 'utf8'), `---\nworkflow: dev\nrepo: ${doomed}\n---\nIts repository is gone\n`);
      assert.equal(readInbox().find((l) => l.name === 'gone-a1b2')!.queued, undefined, 'and listed with why, out of the queue');
      await assert.rejects(
        stage.main(['inbox', 'queue', 'gone-a1b2']),
        refusedAs('Invalid', 'gone-a1b2.md: `repo: ', 'names no directory'),
      );
    },
  );

  await s.test(
    "REFUSED on the repository it was tried on: a card that names no repository, refused on the daemon's, is passed over by every pass there, and started by a pass in a repository that has its workflow",
    async (c) => {
      emptyStore(undefined);
      const none = aRepoWith();
      const dev = aRepoWith('dev');
      const { card } = addToInbox({ text: 'Wherever the daemon is', workflow: 'dev' });
      await printedBy(c, ['inbox', 'queue', card.name]);

      const refused = await runWith(b.e, tickRun({ repo: none }));
      assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
      assert.equal(refused.queue.on, none);
      const line = queueLine(refused.queue);
      assert.ok(line.startsWith(`${card.name} not started on ${none}: ${card.name}.md: `), line);
      names(line, '`workflow: dev`', 'no workflow folder at ', 'run nemia up in the repository it is about');
      assert.deepEqual(
        [(await runWith(b.e, tickRun({ repo: none }))).queue, listRuns()],
        [undefined, []],
        'passed over on the same repository',
      );
      assert.match((await printedBy(c, ['inbox']))[0], new RegExp(` — not started at \\S+ on ${escaped(none)}: `));

      const started = await runWith(b.e, tickRun({ repo: dev }));
      const [run] = fromCard(card.name);
      assert.deepEqual([started.queue, run?.repo], [{ card: card.name, run: run.id }, dev]);
    },
  );

  await s.test(
    "REFUSED on its factory's repository: a card of a workflow its factory has not attached is tried there, and passed over by every pass after, from a daemon anywhere",
    async (c) => {
      emptyStore(undefined);
      const solo = aSoloFactory([]);
      const daemons = aRepoWith('dev');
      aCard('unattached-card', { workflow: 'dev', factory: 'solo' }, 'Build it in solo.');
      await printedBy(c, ['inbox', 'queue', 'unattached-card']);
      const refused = await runWith(b.e, tickRun({ repo: daemons }));
      assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
      assert.equal(refused.queue.on, undefined, "the card's factory names the repository, not the daemon");
      assert.ok(refused.queue.refused.startsWith('dev: the factory solo does not offer this workflow'), refused.queue.refused);
      names(refused.queue.refused, 'nemia factory attach solo dev');
      assert.equal(filesStore.inbox.tries().get('unattached-card')?.repo, solo);
      assert.deepEqual(
        [(await runWith(b.e, tickRun({ repo: daemons }))).queue, listRuns()],
        [undefined, []],
        'passed over on the same repository',
      );
      const [line] = await printedBy(c, ['inbox']);
      names(line, ' — not started at ', `on ${solo}, its factory's one repository: dev: `);
      assert.doesNotMatch(line, /run nemia up/);
    },
  );

  await s.test(
    "REFUSED as shipped: a card that names no factory is refused from a daemon in a repository one factory alone holds, said with no start's flag, and not tried again; with `factory:` written it starts in it; one that names default is refused",
    async (c) => {
      asShipped(c);
      emptyStore(undefined);
      const solo = aSoloFactory(['dev']);
      const file = aCard('loose-card', { workflow: 'dev', queued: at(1) }, 'Build it, somewhere.');
      const refused = await runWith(b.e, tickRun({ repo: solo }));
      assert.ok(refused.queue && 'refused' in refused.queue, JSON.stringify(refused.queue));
      assert.equal(refused.queue.on, undefined, 'refused wherever the daemon runs');
      names(
        refused.queue.refused,
        '/inbox/loose-card.md: this card names no factory',
        '`factory: <name>`',
        'one of solo;',
        'nemia inbox add "<idea>" --factory <name>',
      );
      assert.doesNotMatch(refused.queue.refused, /--factory <name>;|at start/, 'a daemon has no flag to give');
      assert.doesNotMatch(queueLine(refused.queue), / not started on |run nemia up in the repository/);
      assert.deepEqual([(await runWith(b.e, tickRun({ repo: solo }))).queue, listRuns()], [undefined, []], 'the refusal lasts');
      const [line] = await printedBy(c, ['inbox']);
      assert.match(line, /^loose-card .* — not started at \S+: \S+\/inbox\/loose-card\.md: this card names no factory, /);
      assert.doesNotMatch(line, /run nemia up in the repository/);

      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('---\nworkflow: dev', '---\nworkflow: dev\nfactory: solo'));
      const pass = await runWith(b.e, tickRun({ repo: aRepoWith('dev') }));
      const [run] = fromCard('loose-card');
      assert.deepEqual([pass.queue, run?.factory, run?.repo], [{ card: 'loose-card', run: run?.id }, 'solo', solo]);

      aCard('default-card', { workflow: 'dev', factory: 'default', queued: at(2) }, 'Build it in the history.');
      const history = await runWith(b.e, tickRun({ repo: solo }));
      assert.ok(history.queue && 'refused' in history.queue, JSON.stringify(history.queue));
      assert.ok(history.queue.refused.startsWith('`default` is the default factory'), history.queue.refused);
      names(history.queue.refused, '`factory: <name>` in ', '/inbox/default-card.md, one of solo.');
      assert.deepEqual(fromCard('default-card'), []);
    },
  );
});

test('REFUSED by name at shipped defaults: `nemia inbox queue` of a name with no card, with no name, of a card with no workflow, of one already queued and of one a run was started from — and as shipped, of one that names no factory or default — writing nothing and starting nothing', async (t) => {
  emptyStore(undefined);
  t.after(() => emptyStore(undefined));
  aSoloFactory(['dev']);
  const repo = aRepoWith('dev');
  const bare = addToInbox({ text: 'No workflow yet', repo });
  aCard('queued-a1b2', { workflow: 'dev', repo, queued: '2026-09-16T09:00:00.000Z' }, 'Queued already');
  aCard('kept-a1b2', { workflow: 'dev', repo }, 'Started already');
  aCard('loose', { workflow: 'dev' }, 'Build it, somewhere.');
  aCard('history', { workflow: 'dev', factory: 'default' }, 'Build it in the history.');
  const x = await started('x', at(1));
  fs.writeFileSync(
    path.join(RUNS, 'started-already-zz99.json'),
    JSON.stringify({ ...readRun(x.id), id: 'started-already-zz99', from: { inbox: 'kept-a1b2' } }),
  );
  const cards = () => Object.fromEntries(fs.readdirSync(INBOX).map((f) => [f, fs.readFileSync(path.join(INBOX, f), 'utf8')]));
  const before = cards();
  const runs = listRuns().length;
  const queue = (...argv: string[]) => stage.main(['inbox', 'queue', ...argv]);
  const rows: Array<[string, () => Promise<unknown>, 'Missing' | 'Conflict' | 'Invalid', string[], shipped?: boolean]> = [
    [
      'a name with no card',
      () => queue('no-such-card'),
      'Missing',
      ['no card no-such-card in the inbox', bare.card.name, 'nemia inbox queue <name>', 'nemia inbox add "<idea>"'],
    ],
    ['no name', () => queue(), 'Invalid', ['the name of the card', 'nemia inbox queue <name> [--workflow <w>] [--off]']],
    ['a name that leaves the inbox', () => queue('../runs/x'), 'Invalid', ["`../runs/x` is not a card's name"]],
    [
      'a card with no workflow',
      () => queue(bare.card.name),
      'Invalid',
      [`${bare.card.name}.md: no workflow`, `nemia inbox queue ${bare.card.name} --workflow <w>`],
    ],
    [
      '--off and --workflow at once',
      () => queue(bare.card.name, '--off', '--workflow', 'dev'),
      'Invalid',
      ['--off', '--workflow', 'give one of them'],
    ],
    [
      '--workflow with no value',
      () => queue(bare.card.name, '--workflow'),
      'Invalid',
      ['--workflow takes the workflow the card starts on'],
    ],
    ['a second name', () => queue(bare.card.name, 'another'), 'Invalid', ['nemia inbox queue queues one card', 'another is a second']],
    [
      'a card already queued',
      () => queue('queued-a1b2'),
      'Conflict',
      ['queued-a1b2.md: already queued', '1 in the queue', 'nemia inbox queue queued-a1b2 --off'],
    ],
    [
      "a card a run's record names as started",
      () => queue('kept-a1b2'),
      'Conflict',
      ['kept-a1b2.md: this card was started as started-already-zz99', 'nemia inbox add'],
    ],
    [
      'and its start, of the same kind',
      async () => await runPlaced(startFromInbox({ name: 'kept-a1b2', callerRepo: repo })),
      'Conflict',
      ['kept-a1b2.md: this card was started as started-already-zz99'],
    ],
    [
      'a start of a card not there',
      async () => await runPlaced(startFromInbox({ name: 'no-such-card', callerRepo: repo })),
      'Missing',
      ['no card no-such-card in the inbox', 'nemia start '],
    ],
    [
      'as shipped, a card that names no factory',
      () => queue('loose'),
      'Invalid',
      [
        '/inbox/loose.md: this card names no factory',
        '`factory: <name>`',
        'one of solo',
        'nemia inbox queue loose.',
        'Nothing was queued.',
      ],
      true,
    ],
    [
      'as shipped, a card that names default',
      () => queue('history'),
      'Invalid',
      ['`default` is the default factory', '`factory: <name>` in ', '/inbox/history.md, one of solo.', 'Nothing was queued.'],
      true,
    ],
  ];
  for (const [name, refused, tag, facts, shipped] of rows)
    await t.test(name, async (c) => {
      if (shipped) asShipped(c);
      await assert.rejects(refused, refusedAs(tag, ...facts));
      assert.deepEqual(cards(), before, 'nothing written');
      assert.equal(listRuns().length, runs, 'nothing started');
    });

  await t.test(
    'as shipped, `--off` still takes back a card queued by hand that names no factory, and a card of a factory queues',
    async (c) => {
      asShipped(c);
      const older = aCard('older', { workflow: 'dev', queued: at(1) }, 'Queued before the rule.');
      await printedBy(c, ['inbox', 'queue', 'older', '--off']);
      assert.doesNotMatch(fs.readFileSync(older, 'utf8'), /queued:/);
      const placed = aCard('placed', { workflow: 'dev', factory: 'solo' }, 'Build it in solo.');
      await printedBy(c, ['inbox', 'queue', 'placed']);
      assert.match(fs.readFileSync(placed, 'utf8'), /^queued: \S+$/m);
    },
  );
});

test(
  'a card queued, then started by hand, is not started twice — nor once its run is forgotten, its queued: line gone — nor, when that line could not be taken off, by any pass after',
  { skip: process.getuid?.() === 0 && 'root removes a file from a folder it may not write' },
  async (t) => {
    emptyStore(undefined);
    t.after(() => emptyStore(undefined));
    const b = ticking();
    const repo = aRepoWith('dev');
    const removed = addToInbox({ text: 'Started by hand', workflow: 'dev', repo });
    await printedBy(t, ['inbox', 'queue', removed.card.name]);
    await printedBy(t, ['start', removed.file]);
    assert.equal(fromCard(removed.card.name).length, 1);
    assert.deepEqual(
      [(await runWith(b.e, tickRun())).queue, (await runWith(b.e, tickRun())).queue, fromCard(removed.card.name).length],
      [undefined, undefined, 1],
    );
    const [byHand] = fromCard(removed.card.name);
    fs.rmSync(path.join(ROOT, 'runs', `${byHand.id}.json`));
    assert.deepEqual(
      [readInbox().find((l) => l.name === removed.card.name)?.state, (await runWith(b.e, tickRun())).queue, fromCard(removed.card.name)],
      ['filed', undefined, []],
      'its run forgotten, the card reads filed, and the tick does not start it again',
    );

    const stuck = addToInbox({ text: 'Started by hand, and left behind', workflow: 'dev', repo });
    await printedBy(t, ['inbox', 'queue', stuck.card.name]);
    fs.chmodSync(INBOX, 0o555);
    try {
      await printedBy(t, ['start', stuck.file]);
    } finally {
      fs.chmodSync(INBOX, 0o755);
    }
    assert.deepEqual([fs.existsSync(stuck.file), fromCard(stuck.card.name).length], [true, 1], 'kept, and started once');
    assert.deepEqual(readInbox().find((l) => l.name === stuck.card.name)!.queued, {
      at: /^queued: (.*)$/m.exec(fs.readFileSync(stuck.file, 'utf8'))![1],
      place: null,
    });
    assert.deepEqual(
      [(await runWith(b.e, tickRun())).queue, (await runWith(b.e, tickRun())).queue, fromCard(stuck.card.name).length],
      [undefined, undefined, 1],
      'not started again',
    );
  },
);

test('a record that does not read as a run stops no other run: the pass files the rest, and says once, on stderr, which record it left out and why', async (t) => {
  emptyStore(undefined);
  t.after(() => emptyStore(undefined));
  const b = ticking();
  const run = await started('a run beside a broken one', at(1));
  const broken = path.join(RUNS, 'r-broken.json');
  fs.writeFileSync(broken, JSON.stringify({ id: 'r-broken', brief: 'written by hand' }));
  const errs: string[] = [];
  const err = t.mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
    errs.push(String(chunk));
    return true;
  });
  try {
    const ticked = await printedBy(t, ['tick']);
    assert.deepEqual(b.filings, [`${run.id}-implement`]);
    assert.ok(!ticked.some((l) => l.includes('r-broken')), ticked.join('\n'));
    const listed = await printedBy(t, ['ls']);
    assert.ok(
      listed.some((l) => l.startsWith(run.id)),
      listed.join('\n'),
    );
    await runWith(b.e, tickRun());
  } finally {
    err.mock.restore();
    fs.rmSync(broken);
  }
  const leftOut = errs.filter((l) => l.startsWith('left out: run r-broken: its record, '));
  assert.equal(leftOut.length, 1, `said once a process, pass after pass: ${errs.join('')}`);
  assert.ok(leftOut[0].includes('does not read as a run: its `workspace` is missing'), leftOut[0]);
});

test('a try the tick wrote down is read only as the tick writes it: a file whose `refused` is no boolean, or missing, or that is no try at all, is none — the card is tried again — and a key beside the five is left unread', () => {
  emptyStore(undefined);
  const queue = path.join(ROOT, 'queue');
  fs.mkdirSync(queue, { recursive: true });
  const kept = { at: '2026-09-16T09:00:00.000Z', text: 'the card', repo: '/r', why: 'no workflow', refused: true };
  const files: Record<string, unknown> = {
    kept: { ...kept, by: 'a newer tick' },
    yes: { ...kept, refused: 'yes' },
    unsaid: { at: kept.at, text: kept.text, repo: kept.repo, why: kept.why },
    unrepo: { ...kept, repo: 7 },
    list: [kept],
  };
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(queue, `${name}.json`), JSON.stringify(body));
  fs.writeFileSync(path.join(queue, 'torn.json'), '{"at": "2026');
  assert.deepEqual([...filesStore.inbox.tries()], [['kept', kept]]);
});
