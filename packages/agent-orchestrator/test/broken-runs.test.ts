/**
 * One broken run does not stop the others, as one story on the stage (`story.ts`): a store holding a run whose task journal holds an
 * entry no runtime wrote — its current try's, its check's or an earlier try's — a run that froze no workflow and whose folder says no
 * `place:` or is gone, and a record that is not JSON, beside runs whose tasks and folders read. The tick leaves each broken run unjudged,
 * out of the feed's `removed`, counted in flight and said once, while every other run is filed; `nemia tick`, `nemia ls`, `nemia decide`,
 * the board, a pause and `nemia up` each go on; mended, the next pass reads the run and it goes on, nothing remembered.
 *
 * Told on the engine's stand-in, which models each break as the runtime answers it: a task whose journal does not read is refused by
 * `view` with the runtime's `JournalError`, left out of `list`'s views and named in its `unreadable`, and said by the runtime's own pass
 * (`TickReport.unreadable`), as `plainEngine` over a journal holding a miswritten entry answers. What the runtime says of the entry
 * itself is the runtime's to test. The folders and the torn record are files, as they are on a store.
 *
 * `WF_ROOT` is set before the runner is imported: it is read as the module loads. `WF_MAX_CONCURRENT` admits sessions enough for every
 * run, and no cap is set on runs but in the checkpoint that counts the slots.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { JournalError } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-broken-runs-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
process.env.WF_MAX_CONCURRENT = '10';
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { retryRun, runWith, startRun, tickRun } = await import('../src/runner.ts');
const { readRun, runFile } = await import('../src/record/record.store.ts');
const { slotsRead } = await import('../src/cap/cap.verb.ts');
const { readFeed } = await import('../src/feed/feed.store.ts');
const { REMOVED } = await import('../src/feed/feed.ts');
const { putPause, resumePause } = await import('../src/pause/pause.store.ts');
const { judgedNow } = await import('../src/summary/summary.verb.ts');
const { workflowsOf } = await import('../src/summary/reads.verb.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
const PLACED = '---\nplace: git\nharness: codex\n---\nwork it\n';
const FOLDER = path.join(ROOT, 'wf-placed');
fs.mkdirSync(FOLDER);
fs.writeFileSync(path.join(FOLDER, 'work.md'), PLACED);
const CHECKED = path.join(ROOT, 'wf-checked');
fs.mkdirSync(CHECKED);
fs.writeFileSync(path.join(CHECKED, 'work.md'), '---\nplace: git\nharness: codex\ncheck: npm test\n---\nwork it\n');
/** A folder whose one step says no `place:`, as the folders of the runs started before a workflow was frozen on the record say. */
const UNPLACED = path.join(ROOT, 'wf-unplaced');
fs.mkdirSync(UNPLACED);
fs.writeFileSync(path.join(UNPLACED, 'work.md'), '---\nharness: codex\n---\nwork it\n');
const REPO = path.join(ROOT, 'repo');
fs.mkdirSync(REPO);

/** Each task whose journal does not read, and the runtime's words for why. */
const spoiled = new Map<string, string>();
const spoil = (taskId: string) =>
  spoiled.set(taskId, `${taskId}'s journal, entry 6 is a \`measured\` event, and its \`usage.responses\` is "three"`);

/**
 * The stage's engine as the runtime answers a store holding a spoiled journal: its pass says each such task, `view` refuses it with a
 * `JournalError`, and `list` leaves it out of its views and names it unreadable. Its own pass admits and starts nothing.
 */
const broken = () => {
  const b = stage.board();
  const { view, list } = b.e;
  Object.assign(b.e, {
    tallied: undefined,
    tick: () => Effect.succeed({ tasks: 0, actions: [], running: {}, views: [], unreadable: [...spoiled.values()] }),
    view: (taskId: string) => {
      const why = spoiled.get(taskId);
      return why === undefined ? view(taskId) : Effect.fail(new JournalError({ taskId, message: why }));
    },
    list: (...args: Parameters<typeof list>) =>
      Effect.map(list(...args), (read) => ({
        views: read.views.filter((v) => !spoiled.has(v.id)),
        unreadable: [
          ...read.unreadable,
          ...read.views.filter((v) => spoiled.has(v.id)).map((v) => ({ taskId: v.id, why: spoiled.get(v.id)! })),
        ],
      })),
  });
  return { b, e: b.e };
};

const started = (brief: string, dir = FOLDER, more: { after?: string[]; isolate?: boolean } = {}) =>
  stage.runPlaced(startRun({ brief, repo: REPO, workflowDir: dir, isolate: false, ...more }));

/** The run's record as an early tick wrote it: no workflow frozen on it, its steps read off `dir` on every pass. */
const unfrozen = (id: string, dir: string): void => {
  const { workflow: _, ...record } = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Record<string, unknown>;
  fs.writeFileSync(runFile(id), `${JSON.stringify({ ...record, workflowDir: dir }, null, 2)}\n`);
};

const LEFT_OUT = (id: string) => `${id} is not advanced while its workflow folder does not load: run ${id}: it froze no workflow`;
const JOURNAL_OUT = (id: string) => `${id} is not advanced while a task it reads is unreadable: `;

/** What `nemia argv` printed, a line each, and what it threw, over `engine`. */
const printedBy = async (t: test.TestContext, argv: string[], engine: Parameters<typeof stage.main>[1]) => {
  const out: string[] = [];
  const err: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(...a.map(String).join(' ').split('\n')));
  const error = t.mock.method(console, 'error', (...a: unknown[]) => void err.push(a.map(String).join(' ')));
  let threw: unknown;
  try {
    await stage.main(argv, engine);
  } catch (caught) {
    threw = caught;
  } finally {
    log.mock.restore();
    error.mock.restore();
  }
  return { out, err, threw };
};

/** The lines `nemia ls` printed for one run: its own line and those under it, up to the next run's. */
const blockOf = (lines: readonly string[], id: string): string[] => {
  const from = lines.findIndex((l) => l.startsWith(`${id}  `));
  assert.ok(from >= 0, `nemia ls lists ${id}:\n${lines.join('\n')}`);
  const to = lines.findIndex((l, i) => i > from && !l.startsWith(' '));
  return lines.slice(from, to < 0 ? undefined : to);
};

const unreadableLine = (block: readonly string[]) =>
  block.find((l) => l.startsWith('   → unreadable: '))?.slice('   → unreadable: '.length);

/** Whether the feed says `id` was removed. */
const saidRemoved = (id: string) => readFeed().lines.some((l) => 'run' in l && l.run === id && l.word === REMOVED);

test('one broken run does not stop the others: each left out and said once, the others filed, and mended, it goes on', async (t) => {
  const s = story(t);
  const { b, e } = broken();
  stage.place().world.repository(REPO, {});
  const pass = () => stage.runWith(e, tickRun({ repo: ROOT }));
  const runs: Record<'journal' | 'gone' | 'unplaced' | 'checked' | 'tried' | 'waiting' | 'good', string> = {
    journal: '',
    gone: '',
    unplaced: '',
    checked: '',
    tried: '',
    waiting: '',
    good: '',
  };

  await s.test('every run is at work before anything breaks, but the one whose unfrozen folder says no `place:`', async () => {
    runs.journal = (await started('the journal spoiled')).id;
    runs.gone = (await started('the folder taken away')).id;
    runs.checked = (await started('the check spoiled', CHECKED, { isolate: true })).id;
    runs.tried = (await started('the earlier try spoiled')).id;
    runs.unplaced = (await started('the unfrozen one')).id;
    unfrozen(runs.unplaced, UNPLACED);
    runs.waiting = (await started('waits on the check', FOLDER, { after: [runs.checked] })).id;

    const first = await pass();
    for (const id of [runs.journal, runs.gone, runs.checked, runs.tried])
      assert.deepEqual(first.runs.find((a) => a.run.id === id)?.filed, ['work'], `${id} filed its step`);
    assert.equal(
      first.runs.find((a) => a.run.id === runs.unplaced),
      undefined,
      'the unfrozen run is not judged',
    );
    const said = first.unreadable?.filter((w) => w.startsWith(LEFT_OUT(runs.unplaced))) ?? [];
    assert.equal(said.length, 1, JSON.stringify(first.unreadable));
    assert.match(said[0], /work: says no `place:`/);
    assert.match(said[0], new RegExp(`or nemia rm ${runs.unplaced}\\.$`));
    assert.equal(readRun(runs.unplaced).steps.work?.taskId ?? null, null, 'nothing of it filed');

    b.settle(`${runs.checked}-work`, 'succeeded', SIGNED);
    b.settle(`${runs.tried}-work`, 'failed');
    await pass();
    await stage.runWith(e, retryRun(runs.tried, 'work', { mode: 'fresh' }));
    await pass();
    const check = readRun(runs.checked).steps.work.check?.taskId;
    assert.ok(check, 'the checked run filed its check');
    assert.equal(readRun(runs.tried).steps.work.tries?.length, 1, 'the retried run holds an earlier try');
  });

  await s.test(
    'a journal no runtime wrote, a folder gone and a torn record leave their runs out, each said once, while a run beside them files',
    async (c) => {
      spoil(readRun(runs.journal).steps.work.taskId!);
      spoil(readRun(runs.checked).steps.work.check!.taskId);
      spoil(readRun(runs.tried).steps.work.tries![0].taskId);
      unfrozen(runs.gone, path.join(ROOT, 'no-such-folder'));
      fs.writeFileSync(runFile('torn'), '{ "id": "torn", "repo"');
      runs.good = (await started('the good one')).id;

      const wrote: string[] = [];
      const stderr = c.mock.method(process.stderr, 'write', (line: string) => {
        wrote.push(String(line));
        return true;
      });
      const now = await pass().finally(() => stderr.mock.restore());

      assert.deepEqual(now.runs.find((a) => a.run.id === runs.good)?.filed, ['work'], 'the good run filed its step');
      for (const id of [runs.journal, runs.gone, runs.unplaced])
        assert.equal(
          now.runs.find((a) => a.run.id === id),
          undefined,
          `${id} is not judged`,
        );
      const journal = spoiled.get(readRun(runs.journal).steps.work.taskId!)!;
      assert.ok(
        now.unreadable?.some((w) => w.startsWith(`${JOURNAL_OUT(runs.journal)}${journal}`)),
        JSON.stringify(now.unreadable),
      );
      assert.equal(
        now.unreadable?.filter((w) => w.includes(journal)).length,
        1,
        `said once, by the run: ${JSON.stringify(now.unreadable)}`,
      );
      assert.ok(
        now.unreadable?.some((w) => w.startsWith(LEFT_OUT(runs.gone)) && w.includes('no workflow folder at')),
        JSON.stringify(now.unreadable),
      );
      assert.equal(wrote.filter((l) => l.startsWith('left out: run torn: its record, ')).length, 1, wrote.join(''));
      for (const id of [runs.journal, runs.gone, runs.unplaced])
        assert.equal(saidRemoved(id), false, `the feed does not say ${id} removed`);
    },
  );

  await s.test('`nemia tick` says each run left out on stderr, lists the others, and fails nothing', async (c) => {
    const { out, err, threw } = await printedBy(c, ['tick'], e);
    assert.equal(threw, undefined);
    assert.ok(
      err.some((l) => l.startsWith(`left out: ${LEFT_OUT(runs.unplaced)}`)),
      err.join('\n'),
    );
    assert.ok(
      err.some((l) => l.startsWith(`left out: ${JOURNAL_OUT(runs.journal)}`)),
      err.join('\n'),
    );
    assert.ok(
      out.some((l) => l.startsWith(`${runs.good}  `)),
      out.join('\n'),
    );
  });

  await s.test('`nemia ls` says each broken run unreadable, on the step whose task does not read, and lists every other run', async (c) => {
    const { out: lines, threw } = await printedBy(c, ['ls'], e);
    assert.equal(threw, undefined);
    for (const [id, task] of [
      [runs.checked, readRun(runs.checked).steps.work.check!.taskId],
      [runs.tried, readRun(runs.tried).steps.work.tries![0].taskId],
    ]) {
      const block = blockOf(lines, id);
      const said = unreadableLine(block);
      assert.ok(
        said?.startsWith(`${id}'s record reads, but the journal of its task ${task} does not: ${spoiled.get(task)}`),
        block.join('\n'),
      );
      assert.ok(said?.includes('So nemia ls does not judge the run, and the tick does not advance it'), said);
      assert.match(
        block.find((l) => l.startsWith('   work'))!,
        /^ {3}work\s+unreadable\s/,
        block.join('\n'),
      );
    }
    const waiting = unreadableLine(blockOf(lines, runs.waiting));
    assert.ok(waiting?.startsWith(`${runs.waiting}'s record reads, but the journal of a task of a run it waits on does not: `), waiting);
    for (const id of [runs.unplaced, runs.gone])
      assert.ok(
        unreadableLine(blockOf(lines, id))?.startsWith(`${id}'s workflow folder does not load, so nemia ls does not judge the run`),
      );
    assert.doesNotMatch(blockOf(lines, runs.good).join('\n'), /unreadable/);

    const one = await printedBy(c, ['ls', runs.tried], e);
    assert.ok(
      unreadableLine(blockOf(one.out, runs.tried))?.startsWith(`${runs.tried}'s record reads, but the journal of its task `),
      one.out.join('\n'),
    );
  });

  await s.test("`nemia decide` refuses a broken run in the list's words, and decides a run whose tasks read", async (c) => {
    const { out: listed } = await printedBy(c, ['ls'], e);
    for (const id of [runs.checked, runs.tried]) {
      const { threw } = await printedBy(c, ['decide', id], e);
      assert.equal(
        (threw as Error)?.message,
        unreadableLine(blockOf(listed, id))!.replace('So nemia ls does not', 'So nemia decide does not'),
      );
    }
    const good = await printedBy(c, ['decide', runs.good], e);
    assert.ok(good.out[0].startsWith(`${runs.good}  the good one`), good.out.join('\n'));
  });

  await s.test(
    "the board answers an unfrozen run unjudged and running, in the folder's words alone, its steps off its record",
    async () => {
      const [one] = await stage.runWith(e, judgedNow(e, ROOT, [readRun(runs.unplaced)]));
      assert.equal(one.status, 'running');
      assert.ok(
        one.unreadable?.startsWith(`${runs.unplaced}'s workflow folder does not load, so the board does not judge the run`),
        one.unreadable ?? '',
      );
      assert.match(one.unreadable ?? '', /work: says no `place:`/);
      assert.deepEqual(
        one.steps.map((step) => step.name),
        ['work'],
      );

      const run = readRun(runs.unplaced);
      const loaded = (() => {
        try {
          loadWorkflows(UNPLACED, { repo: run.repo, home: ROOT });
          return 'it loaded';
        } catch (err) {
          return (err as Error).message;
        }
      })();
      assert.deepEqual(workflowsOf(run, ROOT), {
        steps: null,
        warning: `The workflow folder ${UNPLACED} no longer reads as a workflow: ${/[.!?]$/.test(loaded) ? loaded : `${loaded}.`}`,
      });
      const gone = path.join(ROOT, 'no-such-folder');
      assert.deepEqual(workflowsOf({ ...run, workflowDir: gone }, ROOT), { steps: null, warning: `The workflow folder ${gone} is gone.` });
    },
  );

  await s.test('the cap counts a broken run in flight, as the pass does', async (c) => {
    process.env.WF_MAX_RUNS = '20';
    c.after(() => delete process.env.WF_MAX_RUNS);
    await pass();
    const slots = await stage.runWith(e, slotsRead());
    for (const id of [runs.unplaced, runs.journal]) assert.ok(slots.inFlight?.includes(id), `${id}: ${JSON.stringify(slots.inFlight)}`);
  });

  await s.test(
    'under a pause, a pass and `nemia ls` over a run at work whose folder stops loading finish, its finishing tasks read without it',
    async (c) => {
      putPause({ why: 'a test pauses', by: 'ann' });
      c.after(() => resumePause());
      const paused = await pass();
      assert.ok(paused.pause, 'the pass read the pause');
      assert.ok(
        paused.unreadable?.some((w) => w.startsWith(LEFT_OUT(runs.gone))),
        JSON.stringify(paused.unreadable),
      );
      assert.ok(!paused.pause.finishing.some((f) => f.run === runs.gone));
      const { out, threw } = await printedBy(c, ['ls'], e);
      assert.equal(threw, undefined);
      assert.ok(unreadableLine(blockOf(out, runs.gone))?.startsWith(`${runs.gone}'s workflow folder does not load`), out.join('\n'));
    },
  );

  await s.test('`nemia up` over the broken runs ends no daemon: it passes again and again, and says each once', async (c) => {
    const STOP = new Error('the test stops the daemon');
    let ticks = 0;
    const counted = Object.assign({ ...e }, { tick: () => (++ticks > 3 ? Effect.die(STOP) : e.tick()) });
    const { out, err, threw } = await printedBy(c, ['up', '1'], counted);
    assert.equal(threw, STOP, `the daemon ended of what stopped it, after three passes: ${String(threw)}`);
    const all = [...out, ...err];
    assert.equal(all.filter((l) => l.includes(`left out: ${LEFT_OUT(runs.unplaced)}`)).length, 1, all.join('\n'));
    assert.equal(all.filter((l) => l.includes(`left out: ${JOURNAL_OUT(runs.journal)}`)).length, 1, all.join('\n'));
  });

  await s.test('mended, each run goes on at the next pass, with nothing remembered', async () => {
    fs.writeFileSync(path.join(UNPLACED, 'work.md'), PLACED);
    spoiled.delete(readRun(runs.journal).steps.work.taskId!);
    const mended = await pass();
    assert.deepEqual(mended.runs.find((a) => a.run.id === runs.unplaced)?.filed, ['work']);
    assert.ok(
      mended.runs.some((a) => a.run.id === runs.journal),
      'the run whose journal reads again is judged',
    );
    assert.ok(
      !mended.unreadable?.some((w) => w.startsWith(LEFT_OUT(runs.unplaced)) || w.startsWith(JOURNAL_OUT(runs.journal))),
      JSON.stringify(mended.unreadable),
    );
  });

  await s.test(
    "an unfrozen run whose step names an agent only its repository's, or only the store's, agents hold is read with its places, and filed",
    async () => {
      const repoOwn = path.join(ROOT, 'wf-repo-agent');
      fs.mkdirSync(repoOwn);
      fs.writeFileSync(path.join(repoOwn, 'work.md'), '---\nplace: git\nagent: repo-only\n---\nwork it\n');
      fs.mkdirSync(path.join(REPO, '.claude', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(REPO, '.claude', 'agents', 'repo-only.md'), '---\nharness: codex\n---\nYou work.\n');
      assert.throws(() => loadWorkflows(repoOwn), 'nothing beside the folder holds the agent');
      const storeOwn = path.join(ROOT, 'wf-store-agent');
      fs.mkdirSync(storeOwn);
      fs.writeFileSync(path.join(storeOwn, 'work.md'), '---\nplace: git\nagent: store-only\n---\nwork it\n');
      fs.mkdirSync(path.join(ROOT, 'workflows', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'workflows', 'agents', 'store-only.md'), '---\nharness: codex\n---\nYou work.\n');
      assert.throws(() => loadWorkflows(storeOwn, { repo: REPO }), 'the store alone holds the agent');
      const ids = [(await started('the agent is the repository own')).id, (await started('the agent is the store own')).id];
      unfrozen(ids[0], repoOwn);
      unfrozen(ids[1], storeOwn);

      const now = await pass();
      for (const id of ids) {
        assert.ok(!now.unreadable?.some((w) => w.startsWith(LEFT_OUT(id))), JSON.stringify(now.unreadable));
        assert.deepEqual(now.runs.find((a) => a.run.id === id)?.filed, ['work']);
      }
    },
  );
});
