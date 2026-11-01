/**
 * `nemia start` opens a repository run's place (`openPlace`), the one its program is given (`PlaceService`). Its `open` answers the
 * record's base, branch and repository, and the record names no place: a record written when it named one (`placeSkill`) still reads. A
 * place that refuses the start refuses it in its words, and nothing is written. A SIGINT to `nemia start` is not passed on to the
 * process group of the git `open` runs, which outlives it. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Effect } from 'effect';
import { nodeChild } from './child.ts';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { placeOver } from './place-over.ts';

const ROOT = scratch('wf-start-place-');
process.env.WF_ROOT = ROOT;
const { startRun } = await import('../src/start/start.verb.ts');
const { PlaceService } = await import('../src/place/place.store.ts');
const { gitPlaceLayer, builtinGitPlace } = await import('../src/place/builtin.store.ts');
const { runFile } = await import('../src/record/record.store.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { Invalid } = await import('../src/refusal/refusal.ts');

const BIN = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** A workflow folder of `implement`, and, when `landing`, an ending `ship` that lands on its check once approved. */
function workflow(name: string, landing: boolean): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\neffort: high\n---\nBuild it.\n');
  if (landing)
    fs.writeFileSync(
      path.join(dir, 'ship.md'),
      '---\nafter: implement\nplace: git\nworkspace: base\ngate: true\ncheck: npm test\n---\nShip it.\n',
    );
  return dir;
}

const LANDING = workflow('landing', true);
const PLAIN = workflow('plain', false);

/** A repository with one commit on `trunk`, so a run has a base and a branch to record. */
function aRepo(): string {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'trunk');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
}

/** The run ids the store holds, and the directories under its `runs/`. */
const written = (): { runs: string[]; dirs: string[] } => {
  const runs = path.join(ROOT, 'runs');
  return {
    runs: runStore.runs.list().map((r) => r.id),
    dirs: fs.existsSync(runs) ? fs.readdirSync(runs).filter((f) => fs.statSync(path.join(runs, f)).isDirectory()) : [],
  };
};

/**
 * `startRun` of `workflowDir` on `repo`, given the place `layer` holds, the package's git place by default: the run's record, or the
 * refusal it failed with.
 */
function started(workflowDir: string, repo: string, layer = gitPlaceLayer) {
  const program = startRun({ brief: 'add a flag', repo, workflowDir, isolate: true });
  const exit = Effect.runSyncExit(program.pipe(Effect.provide(layer)));
  if (exit._tag === 'Success') return exit.value;
  throw Effect.runSync(Effect.flip(Effect.failCause(exit.cause)));
}

/** What `started` is refused with, as `Invalid` with exit 2. */
function refusedWith(workflowDir: string, repo: string, layer = gitPlaceLayer): string {
  try {
    started(workflowDir, repo, layer);
  } catch (err) {
    assert.ok(err instanceof Invalid, `Invalid expected, got ${String(err)}`);
    assert.equal(err.exitCode, 2);
    return err.message;
  }
  return assert.fail('the start was not refused');
}

test("a start opens the place it is given: the record's base, branch and repository are open's, and it names no place", () => {
  const repo = aRepo();
  const run = started(LANDING, repo);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  assert.ok(!run.place);
  assert.equal(run.baseRef, head);
  assert.equal(run.branch, 'trunk');
  assert.equal(run.repo, repo);
  assert.equal(run.workspace, repo);
  assert.ok(!('placeSkill' in run) && !('placeSkill' in runStore.runs.read(run.id)), 'no place is named on a new record');
});

test('a record written when a run named its place still reads, the name kept as it was written', () => {
  const run = started(PLAIN, aRepo());
  const file = runFile(run.id);
  const named = { skill: 'git', version: 'a'.repeat(64) };
  fs.writeFileSync(file, JSON.stringify({ ...(JSON.parse(fs.readFileSync(file, 'utf8')) as object), placeSkill: named }));
  const read = runStore.runs.read(run.id);
  assert.deepEqual([read.id, read.placeSkill], [run.id, named]);
});

test("REFUSED: a start on a directory that is no repository, in the place's words, and nothing is written", () => {
  const before = written();
  const plain = fs.mkdtempSync(path.join(ROOT, 'plain-'));
  assert.equal(
    refusedWith(PLAIN, plain),
    `${plain} is not a git repository: run git init there and commit once, or name a repository with --repo`,
  );
  assert.deepEqual(written(), before);
});

test('REFUSED: a start whose place refuses its open is refused in the words of the place it was given, and nothing is written', () => {
  const repo = aRepo();
  const before = written();
  const asked: string[] = [];
  const refusing = PlaceService.layer(
    placeOver(builtinGitPlace, {
      open: (request) => {
        asked.push(request.root);
        return { refused: 'this place takes no run today: ask again tomorrow' };
      },
    }),
  );
  assert.equal(refusedWith(PLAIN, repo, refusing), 'this place takes no run today: ask again tomorrow');
  assert.deepEqual([asked, written()], [[repo], before]);
  assert.equal(started(PLAIN, repo).repo, repo, 'and the git place opens the same repository');
});

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

test('a SIGINT to nemia start is not passed on to the group of the git open runs: the start ends, nothing is written, and that group is still there', async (t) => {
  const dir = scratch('wf-start-place-signal-');
  const store = path.join(dir, 'store');
  const bin = path.join(dir, 'bin');
  const said = path.join(dir, 'git-said');
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, 'git'),
    `#!/bin/sh\necho "$$ $PPID" > ${JSON.stringify(`${said}.tmp`)}\nmv ${JSON.stringify(`${said}.tmp`)} ${JSON.stringify(said)}\nexec sleep 120\n`,
    { mode: 0o755 },
  );
  const repo = aRepo();
  const env = {
    ...process.env,
    WF_ROOT: store,
    AE_ROOT: path.join(dir, 'engine'),
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
  };
  for (const args of [
    ['factory', 'add', 'signal', '--repo', repo],
    ['factory', 'attach', 'signal', 'dev'],
  ])
    execFileSync(process.execPath, [BIN, ...args], { env: { ...env, PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
  const argv = ['start', 'add a flag', '--workflows', path.join(teamCopy(), 'dev'), '--repo', repo, '--factory', 'signal'];
  const start = nodeChild(
    `process.argv = [process.argv[0], ${JSON.stringify(BIN)}, ...${JSON.stringify(argv)}]; await import(${JSON.stringify(BIN)});`,
    env,
  );
  let pgid = 0;
  t.after(() => {
    start.child.kill('SIGKILL');
    if (pgid > 0) killGroup(pgid);
  });
  await start.until(() => fs.existsSync(said), 'the fake git, run by open, says its pid and its parent');
  const [pid, parent] = fs.readFileSync(said, 'utf8').trim().split(' ').map(Number);
  pgid = pid!;
  assert.equal(parent, start.child.pid, 'the git that hangs is run by nemia start itself, no process between');
  assert.equal(spawnSync('ps', ['-o', 'pgid=', '-p', String(pgid)], { encoding: 'utf8' }).stdout.trim(), String(pgid));
  start.child.kill('SIGINT');
  const ended = await start.closed;
  assert.equal(ended.signal, 'SIGINT', `nemia start ended by SIGINT; it said: ${start.err()}`);
  assert.ok(groupOf(pgid).includes(String(pgid)), "the group of open's git outlives the start");
  assert.deepEqual(fs.existsSync(path.join(store, 'runs')) ? fs.readdirSync(path.join(store, 'runs')) : [], [], 'no run written');
});
