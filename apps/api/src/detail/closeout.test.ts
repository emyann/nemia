/**
 * A step's closeout on a run's detail (`closeoutIn`), read in either version: a v1 closeout's body, its values, each linked only where it
 * is an http(s) address (`valueOf`), and what the run refuses of its envelope; a v0 closeout converted, its first line the summary and
 * its whole text the body. The run's own `closeout.json` is no file of the step's folder listing (`folderFiles`).
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir, type Views } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { closeoutIn } from './tries.ts';
import { folderFiles, valueOf } from '../steps/artifacts.ts';

const RUN = { id: 'r-closeout', steps: {} } as unknown as Run;
const STEP = { name: 'implement', after: [], body: 'x' } as unknown as Workflow;

/** The closeout `said` as the step's detail reads it, off an engine whose task holds it as its last attempt's. */
const read = (said: unknown) =>
  closeoutIn(RUN, 'implement', STEP, 't1', new Map([['t1', { state: { attempts: [{ closeout: said }] } }]]) as unknown as Views);

test('a v1 closeout gives its body and its values, linked only where a value is an http(s) address, and its envelope refused', () => {
  const c = read({
    apiVersion: 'nemia/v1',
    outcome: 'done',
    summary: 'Opened the pull request.',
    body: '## What\n\nAll of it.',
    artifacts: [
      { name: 'PR', value: 'https://example.com/pr/1' },
      { name: 'script', value: 'javascript:alert(1)' },
      { name: 'version', value: '0.4.0' },
    ],
    needs: 'look at it',
  })!;
  assert.deepEqual([c.apiVersion, c.summary, c.body], ['nemia/v1', 'Opened the pull request.', '## What\n\nAll of it.']);
  assert.deepEqual(c.values, [
    { name: 'PR', value: 'https://example.com/pr/1', link: 'https://example.com/pr/1' },
    { name: 'script', value: 'javascript:alert(1)', link: null },
    { name: 'version', value: '0.4.0', link: null },
  ]);
  assert.equal(c.refused.length, 1);
  assert.match(c.refused[0], /`needs` is set on a `done` closeout/);
});

test('a v0 closeout is converted on read: its first line the summary, its whole text the body, nothing refused', () => {
  const c = read({ outcome: 'done', summary: 'First line.\n\nMore.', artifacts: ['a.md'], needs: 'x' })!;
  assert.deepEqual(
    [c.apiVersion, c.summary, c.body, c.values, c.refused, c.artifacts],
    [null, 'First line.', 'First line.\n\nMore.', [], [], [{ path: 'a.md' }]],
  );
});

test('valueOf links an http(s) address alone', () => {
  assert.equal(valueOf({ name: 'a', value: 'http://x.test/a' }).link, 'http://x.test/a');
  assert.equal(valueOf({ name: 'a', value: 'ftp://x.test/a' }).link, null);
  assert.equal(valueOf({ name: 'a', value: 'see https://x.test' }).link, null);
});

test("a step's folder listing leaves out the closeout.json the run wrote there", () => {
  const dir = artifactsDir(RUN, 'implement');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'closeout.json'), '{}');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'n');
  assert.deepEqual(
    folderFiles(RUN, 'implement', dir).files.map((f) => f.path),
    [path.join(dir, 'notes.md')],
  );
});
