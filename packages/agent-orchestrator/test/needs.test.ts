/**
 * A machine's needs, told on the stage (`story.ts`). A harness's: a fresh run of a workflow whose steps name no harness waits before its
 * first session on the default harness's two needs while the tools folder holds no program of it — nothing filed, its listing saying
 * `waiting on <harness>: nemia doctor fix <harness>` — and starts once a stand-in program, signed in, is there and swept; a step on
 * another harness adds that harness's two needs; the harness's removal is refused (`Conflict`) while an unfinished run needs it, naming
 * `nemia cancel` for it, and let through once that run is cancelled; and a sign-in a person types is refused (`Invalid`). A workflow's:
 * a fresh run of a workflow whose README declares a need its check reads missing waits before its first session — nothing filed, no slot
 * held — and the pass after its check reads met files its first step; a run that has filed a step is never held when the need lapses.
 * A workflow's need of `scope: repository` is checked in the run's repository: met there, it holds nothing, where the same check with
 * no scope, read in the store's folder, holds the run; and a run in a folder, which has no repository, is held by it, never checked.
 * The sweep's memory (`NeedsMemory`) is this file's own, given to each pass as the daemon gives its own, and read again by `needsOnce`
 * as the daemon's sweep does. The test's store is its own, at `ROOT`, given as `ENV`; the PATH its checks inherit holds no harness's
 * program of the machine's, so only what a checkpoint plants is found.
 */
import { runRecord } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { DEFAULT_HARNESS, HARNESS_DECLARATIONS } from 'agent-runtime/vocabulary';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { advanceRun, list, runWith, startRun } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { typed as onHandler } from './typed.ts';
import { readRun } from '../src/tick/told.verb.ts';
import { assess } from '../src/tick/assess.ts';
import { slotNeed } from '../src/cap/cap.ts';
import { cancelRun } from '../src/cancel/cancel.verb.ts';
import { toolsBinDir } from '../src/config/root.store.ts';
import { Conflict, Invalid } from '../src/refusal/refusal.ts';
import { harnessesWithNeeds, signInNeedOf } from '../src/needs/harness.ts';
import { startFix } from '../src/needs/fix.verb.ts';
import { NeedsMemory, needsMemo, needsOnce } from '../src/needs/needs.verb.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-needs-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const stage = staged({ runWith, main: onHandler, engineOf, env: ENV });

/** The harnesses whose programs a check could find, by the names their adapters run them by. */
const PROGRAMS = Object.values(HARNESS_DECLARATIONS).flatMap((d) => (d.needs === undefined ? [] : [d.needs.program]));
process.env.PATH = (process.env.PATH ?? '')
  .split(path.delimiter)
  .filter((dir) => !PROGRAMS.some((program) => fs.existsSync(path.join(dir, program))))
  .join(path.delimiter);

/** The harness a step names where it is not the default: the first other one whose adapter declares needs. */
const OTHER = harnessesWithNeeds(HARNESS_DECLARATIONS).find((h) => h !== DEFAULT_HARNESS) ?? '';

/** The file whose presence the need's check reads: missing until a checkpoint makes it. */
const FLAG = path.join(ROOT, 'tool-installed');

/** A workflow of one step, its README `readme`, its step's frontmatter `head`. */
const workflow = (readme: string, head = 'place: git') => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'workflow-'));
  fs.writeFileSync(path.join(dir, 'README.md'), readme);
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\n${head}\n---\nimplement it\n`);
  return dir;
};

/** A workflow of one step whose README declares the need `tool`, met while `FLAG` is there. */
const needing = () =>
  workflow(
    [
      '---',
      'needs:',
      '  - name: tool',
      '    message: the tool is installed',
      `    check: test -f ${FLAG}`,
      '    fixes:',
      `      - command: touch ${FLAG}`,
      '        message: install the tool',
      '---',
      'Builds a thing with the tool.',
      '',
    ].join('\n'),
  );

/** A repository with one commit. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

/** What `promise` was refused with, which must be a refusal. */
const refusedBy = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return assert.fail('it was not refused');
};

describe("a fresh run waits on its harness's needs until a signed-in program is in the tools folder, and a removal waits on the runs that need it", () => {
  let memo!: import('../src/runner.ts').NeedsMemo;
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    memo = needsMemo(ROOT, 2_000);
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  const given = <A, E, R>(program: Effect.Effect<A, E, R>) => program.pipe(Effect.provideService(NeedsMemory, memo));
  const tick = (id: string) => stage.runWith(b.e, given(advanceRun(runRecord(ROOT, id))));
  const read = async (id: string) => (await stage.runWith(b.e, given(readRun(b.e, runRecord(ROOT, id))))).read;
  const listed = async (id: string) => (await stage.runWith(b.e, given(list(b.e, runRecord(ROOT, id))))).steps.map((r) => r.message);
  const sweep = () => stage.runPlaced(needsOnce(memo));
  let id = '';
  s.test('a fresh run of a workflow naming no harness waits on the default harness while the tools folder has none', async () => {
    id = (await stage.runPlaced(startRun({ brief: 'build it', repo: aRepo(), workflowDir: workflow('Builds a thing.\n') }))).id;
    await sweep();
    await tick(id);
    assert.deepEqual(b.filings, [], 'nothing is filed while the harness is missing');
    assert.deepEqual(
      assess(await read(id)).waitingOnNeeds?.map((w) => w.name),
      [DEFAULT_HARNESS, signInNeedOf(DEFAULT_HARNESS)],
    );
    const [words] = await listed(id);
    assert.ok((words ?? '').startsWith(`waiting on ${DEFAULT_HARNESS}: nemia doctor fix ${DEFAULT_HARNESS}`), words);
  });
  s.test('a signed-in program planted in the tools folder starts it on the pass after the sweep', async () => {
    fs.mkdirSync(toolsBinDir(ROOT), { recursive: true });
    fs.writeFileSync(path.join(toolsBinDir(ROOT), DEFAULT_HARNESS), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await sweep();
    await tick(id);
    assert.deepEqual(b.filings, [`${id}-implement`]);
  });
  s.test("a step on another harness adds that harness's two needs", async () => {
    const other = (
      await stage.runPlaced(
        startRun({ brief: 'build it', repo: aRepo(), workflowDir: workflow('Builds.\n', `place: git\nharness: ${OTHER}`) }),
      )
    ).id;
    await sweep();
    const names = (await read(other)).needs?.map((n) => n.name) ?? [];
    assert.ok(names.includes(OTHER) && names.includes(signInNeedOf(OTHER)), names.join(', '));
    assert.ok(!names.includes(DEFAULT_HARNESS), 'and none of a harness it does not run on');
    await stage.runWith(b.e, cancelRun(other));
  });
  s.test(
    'the removal of the harness is refused while a run that needs it is unfinished, naming its cancel, and let through once it is',
    async () => {
      const removal = { need: DEFAULT_HARNESS, index: 1 };
      const held = await refusedBy(stage.runWith(b.e, given(startFix(removal))));
      assert.ok(held instanceof Conflict, String(held));
      assert.equal(held.exitCode, 2);
      assert.deepEqual(held.users, [id]);
      assert.match(held.message, new RegExp(`nemia cancel ${id}`));
      const before = b.filings.length;
      await stage.runWith(b.e, cancelRun(id));
      const fix = await stage.runWith(b.e, given(startFix(removal)));
      assert.equal(b.filings.length, before + 1);
      assert.equal(fix.need, DEFAULT_HARNESS);
    },
  );
  s.test('a sign-in a person types is refused, never started', async () => {
    const typed = await refusedBy(stage.runWith(b.e, given(startFix({ need: signInNeedOf(DEFAULT_HARNESS) }))));
    assert.ok(typed instanceof Invalid, String(typed));
    assert.equal(typed.exitCode, 2);
  });
});

describe('a fresh run waits on a missing need of its workflow, starts once it is met, and a run under way is never held by one', () => {
  let memo!: import('../src/runner.ts').NeedsMemo;
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    memo = needsMemo(ROOT, 2_000);
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  const tick = (id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
  const listed = async (id: string) =>
    (await stage.runWith(b.e, list(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)))).steps.map((r) => r.message);
  let id = '';
  s.test('a fresh run of a workflow whose need reads missing files nothing, holds no slot, and says what it waits on', async () => {
    fs.rmSync(FLAG, { force: true });
    id = (await stage.runPlaced(startRun({ brief: 'build it', repo: aRepo(), workflowDir: needing() }))).id;
    await tick(id);
    assert.deepEqual(b.filings, [], 'nothing is filed while the need is missing');
    const { read } = await stage.runWith(b.e, readRun(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
    const assessed = assess(read);
    assert.deepEqual(
      assessed.waitingOnNeeds?.map((w) => w.name),
      ['tool'],
    );
    assert.equal(assessed.status, 'running');
    assert.deepEqual(
      slotNeed(read.run, read.phaseOf, assessed, () => true, read.steps),
      { inFlight: false, wants: false },
    );
    const [words] = await listed(id);
    assert.match(words ?? '', /^waiting on tool: /);
  });
  s.test('once the sweep reads the need met, the next pass files the first step', async () => {
    fs.writeFileSync(FLAG, '');
    await stage.runPlaced(needsOnce(memo));
    await tick(id);
    assert.deepEqual(b.filings, [`${id}-implement`]);
  });
  s.test('a run that has filed a step is not held when the need lapses', async () => {
    fs.rmSync(FLAG, { force: true });
    await stage.runPlaced(needsOnce(memo));
    const { read } = await stage.runWith(b.e, readRun(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
    assert.equal(assess(read).waitingOnNeeds, undefined);
    assert.ok(!(await listed(id)).some((w) => w.includes('waiting on tool')));
  });
});

describe("a run's workflow need of scope repository is checked in the run's repository, where the same check unscoped holds it", () => {
  let memo!: import('../src/runner.ts').NeedsMemo;
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    memo = needsMemo(ROOT, 2_000);
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  const tick = (id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
  const marked = () => {
    const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    stage.place().world.repository(repo, { 'README.md': 'readme\n', 'only-here': '' });
    return repo;
  };
  const scoped = (scope: string[]) =>
    workflow(
      [
        '---',
        'needs:',
        '  - name: inside',
        '    message: met inside the repository',
        '    check: test -f only-here',
        ...scope,
        '---',
        '',
      ].join('\n'),
    );
  s.test("scoped to the repository, the need reads met in the run's repository and the first step is filed", async () => {
    const id = (await stage.runPlaced(startRun({ brief: 'build it', repo: marked(), workflowDir: scoped(['    scope: repository']) }))).id;
    await tick(id);
    assert.deepEqual(b.filings, [`${id}-implement`]);
  });
  s.test("with no scope, the same check reads the store's folder, and the run waits on it", async () => {
    const before = b.filings.length;
    const id = (await stage.runPlaced(startRun({ brief: 'build it', repo: marked(), workflowDir: scoped([]) }))).id;
    await tick(id);
    assert.equal(b.filings.length, before, 'nothing is filed');
    const { read } = await stage.runWith(b.e, readRun(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
    assert.deepEqual(
      assess(read).waitingOnNeeds?.map((w) => w.name),
      ['inside'],
    );
  });
  s.test('scoped to the repository, a run in a folder, which has no repository, waits on it, never checked', async () => {
    const before = b.filings.length;
    const dir = workflow(
      [
        '---',
        'needs:',
        '  - name: inside',
        '    message: met wherever it runs',
        '    check: "true"',
        '    scope: repository',
        '---',
        '',
      ].join('\n'),
      'place: folder',
    );
    const id = (await stage.runPlaced(startRun({ brief: 'write it', repo: fs.mkdtempSync(path.join(ROOT, 'plain-')), workflowDir: dir })))
      .id;
    await tick(id);
    assert.equal(b.filings.length, before, 'nothing is filed');
    const { read } = await stage.runWith(b.e, readRun(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
    assert.deepEqual(
      assess(read).waitingOnNeeds?.map((w) => w.name),
      ['inside'],
      'a check met wherever it runs, yet missing: it was never run, there being no repository',
    );
  });
});
