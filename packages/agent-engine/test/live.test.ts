/**
 * Against the real harness — skipped unless `AE_LIVE=1`, because it spends money.
 *
 * `--tools` was wired having been verified only as far as `claude --help`, and a fence proven by a
 * flag's help text is the kind of guard that has been silently inert before. So this runs a real
 * `--bg` session told to write a file with no tool that can, beside a control identical but for
 * `tools` — without the control, a session that never ran would pass the first assertion too.
 *
 *   AE_LIVE=1 node --test test/live.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngine, type TaskView } from '../src/facade.ts';

const live = process.env.AE_LIVE === '1';
const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-live-${label}-`));

const BRIEF = [
  'Create a file named PROOF.txt in the current directory, containing the word ok.',
  'Use a tool you have. If none of your tools can create a file, do not look for another way.',
  'Either way, finish by giving your closing statement.',
].join(' ');
const CLOSEOUT = {
  type: 'object',
  properties: { wrote: { type: 'boolean' } },
  required: ['wrote'],
  additionalProperties: false,
};

test('a --bg session with tools: Read, Grep, Glob cannot write a file; the same brief without them does', {
  skip: live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)',
  timeout: 12 * 60_000,
}, async () => {
  // Shipped defaults: the built-in harnesses, `claude` first, `auto` permission mode.
  const engine = createEngine({ root: tmp('board') });
  const fenced = tmp('fenced');
  const open = tmp('open');
  const common = { brief: BRIEF, closeoutSchema: CLOSEOUT, deadlineSeconds: 480, effort: 'low' };
  const ids = {
    fenced: await engine.file({ ...common, cwd: fenced, tools: ['Read', 'Grep', 'Glob'] }),
    open: await engine.file({ ...common, cwd: open }),
  };

  const views: Record<string, TaskView> = {};
  try {
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await engine.tick();
      for (const [k, id] of Object.entries(ids)) views[k] = await engine.view(id);
      if (Object.values(views).every((v) => v.state.settled)) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }

    assert.equal(views.open?.state.settled, 'succeeded', `control settled: ${views.open?.phase}`);
    assert.ok(fs.existsSync(path.join(open, 'PROOF.txt')), 'control: the brief does get a file written when a tool can');

    assert.equal(views.fenced?.state.settled, 'succeeded', `fenced settled: ${views.fenced?.phase}`);
    assert.equal(fs.existsSync(path.join(fenced, 'PROOF.txt')), false, 'the fence held: no tool, no file');
    // `--tools` must not take away the tool a closing statement is made with.
    assert.notEqual(views.fenced?.state.attempts.at(-1)?.closeout, undefined, 'the fenced session still gave its closeout');
  } finally {
    // Settled sessions stay in the harness's registry (open issue 3); leave nothing running behind.
    for (const v of Object.values(views)) {
      if (!v.sessionId) continue;
      const short = v.sessionId.split('-')[0]!;
      for (const verb of ['stop', 'rm']) {
        try { execFileSync('claude', [verb, short], { stdio: 'ignore', timeout: 30_000 }); } catch { /* best effort */ }
      }
    }
  }
});
