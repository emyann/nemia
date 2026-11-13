/**
 * Which run of this store a process is of, by its environment (`runOfEnvironment`): the rows of what a session and a check are given,
 * and of what another store's process, a path that climbs out, and a process of no run carry.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOfEnvironment } from './prune.ts';

const HOME = '/srv/ann/.agent-workflows';

test('runOfEnvironment: the run a process is of, by a WF_STEP_FILES, else a WF_ARTIFACTS, under this store', async (t) => {
  const rows: ReadonlyArray<{ name: string; env: Record<string, string>; run: string | undefined }> = [
    {
      name: 'a WF_STEP_FILES under this home wins over another WF_RUN beside it',
      env: { WF_RUN: 'r-other', WF_STEP_FILES: `${HOME}/runs/r-session/artifacts/plan` },
      run: 'r-session',
    },
    { name: 'a bare WF_RUN, which names no store, attributes nothing', env: { WF_RUN: 'r-check' }, run: undefined },
    {
      name: "a check's WF_ARTIFACTS under this home",
      env: { WF_RUN: 'r-check', WF_ARTIFACTS: `${HOME}/runs/r-check/artifacts/review` },
      run: 'r-check',
    },
    {
      name: "a session's WF_STEP_FILES wins over a WF_ARTIFACTS",
      env: { WF_STEP_FILES: `${HOME}/runs/r-1/artifacts/plan`, WF_ARTIFACTS: `${HOME}/runs/r-2/artifacts/plan` },
      run: 'r-1',
    },
    {
      name: "another store's check",
      env: { WF_RUN: 'r-1', WF_ARTIFACTS: '/srv/bob/.agent-workflows/runs/r-1/artifacts/review' },
      run: undefined,
    },
    { name: "a session's WF_STEP_FILES under this home", env: { WF_STEP_FILES: `${HOME}/runs/r-1/artifacts/plan` }, run: 'r-1' },
    { name: 'the run folder itself', env: { WF_STEP_FILES: `${HOME}/runs/r-1` }, run: 'r-1' },
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
