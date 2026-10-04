/**
 * The store's cordon as the CLI says it: first on `wf feed`, after how to start the run on `wf start`, and on `wf up` once when it is
 * put, again when it changes, and `uncordoned` once when it is lifted (`cordonSaid`); none of them while no cordon stands.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from 'agent-runtime';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-cordon-lines-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { main, cordonSaid } = await import('../src/cli/main.ts');
const { liftCordon, putCordon } = await import('../src/cordon/cordon.store.ts');
const { cordonWords, UNCORDONED } = await import('../src/cordon/cordon.ts');

/** What `fn` printed on stdout, line by line. */
const printed = async (t: TestContext, fn: () => unknown): Promise<string[]> => {
  const lines: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await fn();
  } finally {
    log.mock.restore();
  }
  return lines.join('\n').split('\n');
};

/** A repository with one commit, and a workflow folder of one step on it. */
const aStart = (): string[] => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nharness: codex\n---\nwork it\n');
  return ['start', 'a cordoned start', '--workflows', dir, '--repo', repo, '--no-worktree'];
};

test('wf feed opens with the cordon while one stands, and says none once it is lifted', async (t) => {
  const cordon = putCordon({ why: 'merging by hand', by: 'ann' });
  try {
    const feed = await printed(t, () => main(['feed'], {} as Engine));
    assert.equal(feed[0], cordonWords(cordon), feed.join('\n'));
  } finally {
    liftCordon();
  }
  const lifted = await printed(t, () => main(['feed'], {} as Engine));
  assert.equal(
    lifted.some((l) => l.startsWith('the store is cordoned')),
    false,
    lifted.join('\n'),
  );
});

test('wf start says, after how to start the run, that nothing of it is filed until the lift, and nothing of a cordon with none', async (t) => {
  const cordon = putCordon({ by: 'ann' });
  let started: string[];
  try {
    started = await printed(t, () => main(aStart(), {} as Engine));
  } finally {
    liftCordon();
  }
  const at = started.indexOf("run 'wf tick' (or 'wf up') to start it");
  assert.ok(at > 0, started.join('\n'));
  assert.equal(started[at + 1], `${cordonWords(cordon)}: nothing of this run is filed until then`);
  const free = await printed(t, () => main(aStart(), {} as Engine));
  assert.equal(
    free.some((l) => l.includes('nothing of this run is filed')),
    false,
    free.join('\n'),
  );
});

test('wf up says the cordon once across passes, again when it changes, and uncordoned once when it is lifted', async (t) => {
  const first = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
  const second = { ...first, by: 'bob' };
  let said: string | undefined;
  const lines = await printed(t, () => {
    for (const cordon of [undefined, first, first, second, second, undefined, undefined]) said = cordonSaid(cordon, said);
  });
  assert.deepEqual(
    lines.map((l) => l.slice(10)),
    [cordonWords(first), cordonWords(second), UNCORDONED],
  );
});
