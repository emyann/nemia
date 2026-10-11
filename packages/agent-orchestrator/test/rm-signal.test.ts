/**
 * `nemia rm` removes a repository run's worktrees through its place's `remove`, which runs in a process group of its own. A SIGINT to
 * `nemia rm` ends it and is not passed on to that group, which outlives it: a `git worktree remove` a person's ^C reached would stop
 * halfway. Once that group is gone, `nemia rm` again forgets the run: what the first left is read again by the place's inventory. The run
 * is started in this process on a scratch store, then forgotten by the CLI in a child whose `git` hangs on `worktree remove` alone.
 * `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { nodeChild } from './child.ts';
import { scratch } from './scratch.ts';
import { runGiven } from './placed.ts';

const DIR = scratch('wf-rm-signal-');
const STORE = path.join(DIR, 'store');
process.env.WF_ROOT = STORE;
const { startRun } = await import('../src/start/start.verb.ts');
const { gitPlaceLayer } = await import('../src/place/shipped.store.ts');
const runPlaced = runGiven(gitPlaceLayer);
const { markCancelled } = await import('../src/record/record.store.ts');

const BIN = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** Git in `cwd`, with a fixed identity, its stdout trimmed. */
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** The processes of the group `pgid` leads, by pid, as `ps` lists them now. */
const groupOf = (pgid: number): string[] =>
  spawnSync('ps', ['-o', 'pid=', '-g', String(pgid)], { encoding: 'utf8' })
    .stdout.split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Kill the group `pgid` leads: false when it has no process left. */
function killGroup(pgid: number): boolean {
  try {
    process.kill(-pgid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

/** Until `ok()` holds, asked every 20ms: a group killed is gone once `ps` no longer lists it. */
async function waitFor(ok: () => boolean): Promise<void> {
  while (!ok()) await new Promise((resolve) => setTimeout(resolve, 20));
}

/**
 * A cancelled run of one step, `implement`, on a scratch repository, with its worktree where a pass puts it — `worktrees/<id>/implement`,
 * on `wf/<id>/implement` — clean, so `nemia rm` asks its place to remove it without a hand-off.
 */
async function aCancelledRun() {
  const repo = fs.mkdtempSync(path.join(DIR, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  const workflowDir = fs.mkdtempSync(path.join(DIR, 'one-'));
  fs.writeFileSync(path.join(workflowDir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir }));
  const wt = path.join(STORE, 'worktrees', run.id, 'implement');
  git(repo, 'worktree', 'add', '-q', '-b', `wf/${run.id}/implement`, wt);
  markCancelled(run.id);
  return { id: run.id, repo, wt };
}

test("a SIGINT to nemia rm is not passed on to its place's remove: the rm ends by the signal, and remove's process group is still there; once it is gone, nemia rm again forgets the run", async (t) => {
  const { id, wt } = await aCancelledRun();
  const bin = path.join(DIR, 'bin');
  const said = path.join(DIR, 'git-said');
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'git'),
    [
      '#!/bin/sh',
      'if [ "$1 $2" = "worktree remove" ]; then',
      `  echo "$$ $PPID" > ${JSON.stringify(`${said}.tmp`)}`,
      `  mv ${JSON.stringify(`${said}.tmp`)} ${JSON.stringify(said)}`,
      '  exec sleep 120',
      'fi',
      `exec ${JSON.stringify(realGit)} "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const env = { ...process.env, WF_ROOT: STORE, AE_ROOT: path.join(DIR, 'engine'), PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const rmIn = (envOf: NodeJS.ProcessEnv) =>
    nodeChild(
      `process.argv = [process.argv[0], ${JSON.stringify(BIN)}, 'rm', ${JSON.stringify(id)}]; await import(${JSON.stringify(BIN)});`,
      envOf,
    );
  const rm = rmIn(env);
  let pgid = 0;
  t.after(() => {
    rm.child.kill('SIGKILL');
    if (pgid > 0) killGroup(pgid);
  });
  await rm.until(() => fs.existsSync(said), 'the fake git, run under remove, says its pid and its parent');
  pgid = Number(fs.readFileSync(said, 'utf8').trim().split(' ')[1]);
  const parent = spawnSync('ps', ['-o', 'args=', '-p', String(pgid)], { encoding: 'utf8' }).stdout;
  assert.match(parent, /scripts\/remove\.ts/, `the git that hangs is remove's: its parent is ${parent}`);
  assert.equal(spawnSync('ps', ['-o', 'pgid=', '-p', String(pgid)], { encoding: 'utf8' }).stdout.trim(), String(pgid));
  rm.child.kill('SIGINT');
  const ended = await rm.closed;
  assert.equal(ended.signal, 'SIGINT', `nemia rm ended by SIGINT; it said: ${rm.err()}`);
  assert.ok(groupOf(pgid).includes(String(pgid)), "remove's group outlives the rm");
  assert.ok(fs.existsSync(wt) && fs.existsSync(path.join(STORE, 'runs', `${id}.json`)), 'the worktree and the record are still there');
  assert.ok(killGroup(pgid), "remove's group is killed");
  await waitFor(() => groupOf(pgid).length === 0);
  const again = rmIn({ ...env, PATH: process.env.PATH });
  t.after(() => again.child.kill('SIGKILL'));
  const ended2 = await again.closed;
  assert.equal(ended2.code, 0, `nemia rm again forgets the run; it said: ${again.err()}`);
  assert.ok(!fs.existsSync(wt), 'its worktree is gone');
  assert.ok(!fs.existsSync(path.join(STORE, 'runs', `${id}.json`)), 'its record is gone');
});
