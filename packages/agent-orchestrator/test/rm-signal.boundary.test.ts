/**
 * `nemia rm` removes a repository run's worktrees through its place's `remove`, whose git runs in a process group of its own. A SIGINT to
 * `nemia rm` ends it and is not passed on to that group, which outlives it: a `git worktree remove` a person's ^C reached would stop
 * halfway. Once that group is gone, `nemia rm` again forgets the run: what the first left is read again by the place's inventory. The run
 * is started in this process on a scratch store, then forgotten by its entry's handler in a child whose `git` hangs on `worktree remove`
 * alone.
 * The run's store is the test's own, at `STORE`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { nodeChild } from './child.ts';
import { scratch } from 'test-kit/scratch';
import { runGiven } from './placed.ts';
import { startRun } from '../src/start/start.verb.ts';
import { gitPlaceLayer } from '../src/place/builtin.store.ts';
import { markCancelled } from '../src/record/record.store.ts';
import { LINE_NAME } from '../src/run.ts';
import type { Env } from '../src/config/config.store.ts';

const DIR = scratch('wf-rm-signal-');
const STORE = path.join(DIR, 'store');
const ENV: Env = { ...process.env, WF_ROOT: STORE };
const runPlaced = runGiven(gitPlaceLayer, ENV);

/** `nemia rm`'s entry and the helper that runs it on its handler, as the api runs it (`handled`), imported by the child that forgets. */
const TYPED = path.join(import.meta.dirname, 'typed.ts');
const RUNNER = path.join(import.meta.dirname, '..', 'src', 'runner.ts');
const FORGET = path.join(import.meta.dirname, '..', 'src', 'forget', 'commands.verb.ts');

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
 * A cancelled run of one step, `implement`, on a scratch repository, with its worktree where a pass puts it — `worktrees/<id>/run`, on
 * `wf/<id>/run`, the run's own line of work, named for the run and not for the step that cut it — clean, so `nemia rm` asks its place to
 * remove it without a hand-off.
 */
async function aCancelledRun() {
  const repo = fs.mkdtempSync(path.join(DIR, 'repo-'));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'base');
  const workflowDir = fs.mkdtempSync(path.join(DIR, 'one-'));
  fs.writeFileSync(path.join(workflowDir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const run = await runPlaced(startRun({ brief: 'add a flag', repo, workflowDir }));
  const wt = path.join(STORE, 'worktrees', run.id, LINE_NAME);
  git(repo, 'worktree', 'add', '-q', '-b', `wf/${run.id}/${LINE_NAME}`, wt);
  markCancelled(STORE, run.id);
  return { id: run.id, repo, wt };
}

test("a SIGINT to nemia rm is not passed on to the git its place's remove runs: the rm ends by the signal, and that git's process group is still there; once it is gone, nemia rm again forgets the run", async (t) => {
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
      `const { handled } = await import(${JSON.stringify(TYPED)}); const { RM } = await import(${JSON.stringify(FORGET)});` +
        ` const { engine, builtinGitPlace } = await import(${JSON.stringify(RUNNER)});` +
        ` await handled(RM, { runId: ${JSON.stringify(id)} }, { e: engine(process.env), place: builtinGitPlace }); process.exit(0);`,
      envOf,
    );
  const rm = rmIn(env);
  let pgid = 0;
  t.after(() => {
    rm.child.kill('SIGKILL');
    if (pgid > 0) killGroup(pgid);
  });
  await rm.until(() => fs.existsSync(said), 'the fake git, run by remove, says its pid and its parent');
  const [pid, parent] = fs.readFileSync(said, 'utf8').trim().split(' ').map(Number);
  pgid = pid!;
  assert.equal(parent, rm.child.pid, 'the git that hangs is run by nemia rm itself, no process between');
  assert.equal(spawnSync('ps', ['-o', 'pgid=', '-p', String(pgid)], { encoding: 'utf8' }).stdout.trim(), String(pgid));
  rm.child.kill('SIGINT');
  const ended = await rm.closed;
  assert.equal(ended.signal, 'SIGINT', `nemia rm ended by SIGINT; it said: ${rm.err()}`);
  assert.ok(groupOf(pgid).includes(String(pgid)), "the group of remove's git outlives the rm");
  assert.ok(fs.existsSync(wt) && fs.existsSync(path.join(STORE, 'runs', `${id}.json`)), 'the worktree and the record are still there');
  assert.ok(killGroup(pgid), "the group of remove's git is killed");
  await waitFor(() => groupOf(pgid).length === 0);
  const again = rmIn({ ...env, PATH: process.env.PATH });
  t.after(() => again.child.kill('SIGKILL'));
  const ended2 = await again.closed;
  assert.equal(ended2.code, 0, `nemia rm again forgets the run; it said: ${again.err()}`);
  assert.ok(!fs.existsSync(wt), 'its worktree is gone');
  assert.ok(!fs.existsSync(path.join(STORE, 'runs', `${id}.json`)), 'its record is gone');
});
