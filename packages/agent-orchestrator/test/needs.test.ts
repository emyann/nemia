/**
 * A workflow's machine need, told on the stage (`story.ts`): a fresh run of a workflow whose README declares a need its check reads
 * missing waits before its first session — nothing filed, no slot held, its listing saying `waiting on <need>: <fix>` beside its phase —
 * and the pass after its check reads met files its first step; a run that has filed a step is never held when the need lapses. The
 * sweep's memory (`NeedsMemory`) is this file's own, given to each pass as the daemon gives its own, and read again by `needsOnce` as the
 * daemon's sweep does. The test's store is its own, at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { advanceRun, list, runWith, startRun } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import { runRecord } from '../src/record/record.store.ts';
import { readRun } from '../src/tick/told.verb.ts';
import { assess } from '../src/tick/assess.ts';
import { slotNeed } from '../src/cap/cap.ts';
import { NeedsMemory, needsMemo, needsOnce } from '../src/needs/needs.verb.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-needs-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const stage = staged({ runWith, main, engineOf, env: ENV });

/** The file whose presence the need's check reads: missing until a checkpoint makes it. */
const FLAG = path.join(ROOT, 'tool-installed');

/** A workflow of one step whose README declares the need `tool`, met while `FLAG` is there. */
const needing = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'needing-'));
  fs.writeFileSync(
    path.join(dir, 'README.md'),
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
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A repository with one commit. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'README.md': 'readme\n' });
  return repo;
};

test('a fresh run waits on a missing need of its workflow, starts once it is met, and a run under way is never held by one', async (t) => {
  const s = story(t);
  const memo = needsMemo(ROOT, 2_000);
  const b = stage.board();
  const tick = (id: string) => stage.runWith(b.e, advanceRun(runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
  const listed = async (id: string) =>
    (await stage.runWith(b.e, list(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)))).steps.map((r) => r.message);
  let id = '';

  await s.test('a fresh run of a workflow whose need reads missing files nothing, holds no slot, and says what it waits on', async () => {
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

  await s.test('once the sweep reads the need met, the next pass files the first step', async () => {
    fs.writeFileSync(FLAG, '');
    await stage.runPlaced(needsOnce(memo));
    await tick(id);
    assert.deepEqual(b.filings, [`${id}-implement`]);
  });

  await s.test('a run that has filed a step is not held when the need lapses', async () => {
    fs.rmSync(FLAG, { force: true });
    await stage.runPlaced(needsOnce(memo));
    const { read } = await stage.runWith(b.e, readRun(b.e, runRecord(ROOT, id)).pipe(Effect.provideService(NeedsMemory, memo)));
    assert.equal(assess(read).waitingOnNeeds, undefined);
    assert.ok(!(await listed(id)).some((w) => w.includes('waiting on tool')));
  });
});
