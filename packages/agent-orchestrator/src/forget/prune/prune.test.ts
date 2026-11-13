/**
 * Which run of this store a process is of, by its environment (`runOfEnvironment`): the rows of what a session and a check are given,
 * and of what another store's process, a path that climbs out, and a process of no run carry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOfEnvironment } from './prune.ts';

const HOME = '/srv/ann/.agent-workflows';

test('runOfEnvironment: the run a process is of, by WF_RUN, else by a WF_STEP_FILES under this store', async (t) => {
  const rows: ReadonlyArray<{ name: string; env: Record<string, string>; run: string | undefined }> = [
    {
      name: 'WF_RUN wins over a WF_STEP_FILES',
      env: { WF_RUN: 'r-check', WF_STEP_FILES: `${HOME}/runs/r-session/artifacts/plan` },
      run: 'r-check',
    },
    { name: "a check's WF_RUN alone", env: { WF_RUN: 'r-check' }, run: 'r-check' },
    { name: "a session's WF_STEP_FILES under this home", env: { WF_STEP_FILES: `${HOME}/runs/r-1/artifacts/plan` }, run: 'r-1' },
    { name: 'the run folder itself', env: { WF_STEP_FILES: `${HOME}/runs/r-1` }, run: 'r-1' },
    { name: 'an empty WF_RUN is none, and the files are read', env: { WF_RUN: '', WF_STEP_FILES: `${HOME}/runs/r-1/x` }, run: 'r-1' },
    { name: "another store's home", env: { WF_STEP_FILES: '/srv/bob/.agent-workflows/runs/r-1/artifacts/plan' }, run: undefined },
    { name: 'a home named alike beside it', env: { WF_STEP_FILES: `${HOME}2/runs/r-1/artifacts/plan` }, run: undefined },
    { name: 'a path that climbs out by ..', env: { WF_STEP_FILES: `${HOME}/runs/../runs/r-1/artifacts` }, run: undefined },
    { name: 'a path that climbs into this store by ..', env: { WF_STEP_FILES: `/tmp/../${HOME}/runs/r-1` }, run: undefined },
    { name: 'a relative path', env: { WF_STEP_FILES: 'runs/r-1/artifacts/plan' }, run: undefined },
    { name: 'the runs folder with no run', env: { WF_STEP_FILES: `${HOME}/runs/` }, run: undefined },
    { name: 'neither variable', env: { PATH: '/usr/bin' }, run: undefined },
  ];
  for (const row of rows) await t.test(row.name, () => assert.equal(runOfEnvironment(row.env, HOME), row.run));
  await t.test('a home given with a trailing slash reads the same', () =>
    assert.equal(runOfEnvironment({ WF_STEP_FILES: `${HOME}/runs/r-1/artifacts` }, `${HOME}/`), 'r-1'),
  );
});
