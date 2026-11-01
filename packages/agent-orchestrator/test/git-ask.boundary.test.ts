/**
 * How the git place runs git (`place/git/git.ts`), both ways of asking, against scratch repositories: `ask`, off the event loop, and
 * `askNow` answer the same; a question is git processes and no other between; a verb that throws is unread in one sentence naming it; a
 * git held past its deadline is unread in the deadline's words, with everything it started gone, a child deaf to SIGTERM killed after
 * the grace the ask gave and named, and the next question answered; an ask interrupted leaves nothing running; and the shipped place
 * counts each question, and each git process it starts, in the pass's `place` phase.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect, Fiber } from 'effect';
import { gitPlace } from '../place/git/place.ts';
import { PLACE_DEADLINE_MS, PLACE_VERBS, type PlaceOutcome, type PlaceVerb } from '../src/place/place.ts';
import { STOP_GRACE_MS } from '../src/place/place.store.ts';
import { builtinGitPlace } from '../src/place/builtin.store.ts';
import { meteredPass } from '../src/meter/tally.store.ts';
import { running } from './running.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from 'agent-runtime/testing';

/** The environment git runs in: this process's, without its git variables, with no configuration read and one identity. */
const ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'place',
  GIT_AUTHOR_EMAIL: 'place@example.test',
  GIT_COMMITTER_NAME: 'place',
  GIT_COMMITTER_EMAIL: 'place@example.test',
};

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** A repository on `main` with one commit. */
function repository(): string {
  const dir = scratch('wf-git-place-');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  return dir;
}

const PLACE = gitPlace({ env: ENV });

/** What an unread outcome said; fails on any other. */
function saidOf(outcome: PlaceOutcome<PlaceVerb>, verb: PlaceVerb): string {
  assert.ok('unread' in outcome, `unread expected, got ${JSON.stringify(outcome)}`);
  assert.equal(outcome.unread.verb, verb);
  assert.ok(!Number.isNaN(Date.parse(outcome.unread.at)), `at is a time: ${outcome.unread.at}`);
  return outcome.unread.said;
}

/**
 * A repository whose `handoff` is held: a clean filter runs `/bin/sh` on a script that starts a child deaf to SIGTERM, which writes its
 * pid to `marker` once deaf, and waits on it. The repository, the child's script and the marker.
 */
function heldByDeaf(): { dir: string; child: string; marker: string } {
  const dir = repository();
  const held = scratch('wf-git-place-held-');
  const marker = path.join(held, 'deaf');
  const child = path.join(held, 'child.mjs');
  const shell = path.join(held, 'held.sh');
  fs.writeFileSync(
    child,
    [
      "import fs from 'node:fs';",
      "process.on('SIGTERM', () => {});",
      'fs.writeFileSync(process.argv[2], String(process.pid));',
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  );
  fs.writeFileSync(shell, `'${process.execPath}' '${child}' '${marker}' &\nwait\n`);
  git(dir, 'config', 'filter.held.clean', `/bin/sh '${shell}'`);
  fs.writeFileSync(path.join(dir, '.gitattributes'), 'f filter=held\n');
  fs.writeFileSync(path.join(dir, 'f'), 'left by the step\n');
  return { dir, child, marker };
}

/** The most tries a deadline test makes, each with twice the deadline of the one before, for its child to be deaf in time. */
const DEAF_TRIES = 6;

/**
 * The grace the deadline tests give a stopped group (`AskOptions.graceMs`), shorter than the shipped `STOP_GRACE_MS`, which the test of
 * the deadlines names: waiting the shipped one out cost every try of each test two seconds.
 */
const GRACE_MS = 200;

/** The first deadline of a deadline test: long enough for its deaf child to start, mostly; a try that missed doubles it. */
const FIRST_DEADLINE_MS = 500;

/** The deadline's words for a group that outlived SIGTERM for the grace the tests give. */
const killedWords = (deadlineMs: number): string =>
  `it gave no answer within ${deadlineMs / 1000} s, its deadline, and was stopped, and a process it started outlived SIGTERM for ` +
  `${GRACE_MS / 1000} s and was killed, so a lock it held may be left`;

test('the two ways of asking answer the same, in the environment the place was given, and a refusal is a refusal either way', async () => {
  const dir = repository();
  const now = PLACE.askNow('open', { root: dir, isolate: false });
  assert.deepEqual(await Effect.runPromise(PLACE.ask('open', { root: dir, isolate: false })), now);
  assert.ok('answer' in now && now.answer.branch === 'main', JSON.stringify(now));
  fs.writeFileSync(path.join(dir, 'f'), 'left\n');
  const handed = await Effect.runPromise(PLACE.ask('handoff', { workspace: dir, step: 'build', why: '' }));
  assert.ok('answer' in handed, JSON.stringify(handed));
  assert.equal(git(dir, 'log', '-1', '--format=%an <%ae>'), 'place <place@example.test>', 'git ran in the environment given');
  const none = scratch('wf-git-place-none-');
  const refused = PLACE.askNow('open', { root: none, isolate: false });
  assert.ok('refused' in refused, JSON.stringify(refused));
  assert.deepEqual(await Effect.runPromise(PLACE.ask('open', { root: none, isolate: false })), refused);
});

test('REFUSED: a verb that throws is unread in one sentence naming the verb and what was thrown, either way of asking', async () => {
  const dir = repository();
  const lost = gitPlace({ env: { ...ENV, PATH: scratch('wf-git-place-no-git-') } });
  const request = { repo: dir, under: dir, run: 'x', base: 'main' };
  const now = saidOf(lost.askNow('inventory', request), 'inventory');
  const later = saidOf(await Effect.runPromise(lost.ask('inventory', request)), 'inventory');
  assert.equal(now, 'inventory threw before it answered: spawnSync git ENOENT');
  assert.equal(later, 'inventory threw before it answered: spawn git ENOENT');
});

test('the deadline is two minutes a verb, ten for make, and it is what the place holds git to when given none', () => {
  for (const verb of PLACE_VERBS) assert.equal(PLACE_DEADLINE_MS[verb], verb === 'make' ? 600_000 : 120_000, verb);
  assert.equal(STOP_GRACE_MS, 2000);
  assert.ok(GRACE_MS < STOP_GRACE_MS, 'the deadline tests give a shorter grace, never a longer one');
});

test('REFUSED: a git held past its deadline, asked while the process waits, is unread in the deadline words — the child deaf to SIGTERM killed, gone and named, and the next question answered', (t) => {
  let deadlineMs = FIRST_DEADLINE_MS;
  for (let tries = 1; ; tries++, deadlineMs *= 2) {
    const { dir, child, marker } = heldByDeaf();
    t.after(() => {
      for (const pid of running(child)) process.kill(pid, 'SIGKILL');
    });
    const said = saidOf(PLACE.askNow('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs, graceMs: GRACE_MS }), 'handoff');
    assert.deepEqual(running(child), [], `try ${tries}: no child left running`);
    if (!fs.existsSync(marker)) {
      assert.ok(tries < DEAF_TRIES, `the child ignored SIGTERM before the deadline, on one of ${DEAF_TRIES} tries: ${said}`);
      continue;
    }
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone, not even a zombie`);
    assert.ok(said.startsWith(killedWords(deadlineMs)), said);
    const next = PLACE.askNow('status', { repo: dir, tips: {} });
    assert.ok('answer' in next && next.answer.merging === 'none', `the next question is answered: ${JSON.stringify(next)}`);
    return;
  }
});

test('REFUSED: a git held past its deadline, asked off the loop, is unread in the same words — the deaf child killed, gone and named, and the next question answered', async (t) => {
  let deadlineMs = FIRST_DEADLINE_MS;
  for (let tries = 1; ; tries++, deadlineMs *= 2) {
    const { dir, child, marker } = heldByDeaf();
    t.after(() => {
      for (const pid of running(child)) process.kill(pid, 'SIGKILL');
    });
    const asked = PLACE.ask('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs, graceMs: GRACE_MS });
    const said = saidOf(await Effect.runPromise(asked), 'handoff');
    assert.deepEqual(running(child), [], `try ${tries}: no child left running`);
    if (!fs.existsSync(marker)) {
      assert.ok(tries < DEAF_TRIES, `the child ignored SIGTERM before the deadline, on one of ${DEAF_TRIES} tries: ${said}`);
      continue;
    }
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone`);
    assert.ok(said.startsWith(killedWords(deadlineMs)), said);
    const next = await Effect.runPromise(PLACE.ask('status', { repo: dir, tips: {} }));
    assert.ok('answer' in next && next.answer.merging === 'none', `the next question is answered: ${JSON.stringify(next)}`);
    return;
  }
});

test(
  'an ask interrupted, as a pass is when the api is stopped, leaves nothing of its group running, the deaf child too',
  WAITED,
  async (t) => {
    const { dir, child, marker } = heldByDeaf();
    t.after(() => {
      for (const pid of running(child)) process.kill(pid, 'SIGKILL');
    });
    const fiber = Effect.runFork(
      PLACE.ask('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs: 600_000, graceMs: GRACE_MS }),
    );
    await until(t, () => fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') !== '', 'the child, deaf, writes its pid', {
      everyMs: 10,
    });
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    await Effect.runPromise(Fiber.interrupt(fiber));
    assert.deepEqual(running(child), [], 'no child left running');
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone`);
    assert.equal(fs.existsSync(path.join(dir, '.git', 'index.lock')), false, 'and git took its lock away');
  },
);

test('the loop runs other work while git runs: a handoff waits in a filter for a file only a callback of this process writes', async () => {
  const dir = repository();
  const go = path.join(scratch('wf-git-place-go-'), 'go');
  const shell = `${go}.sh`;
  fs.writeFileSync(shell, `while [ ! -f '${go}' ]; do sleep 0.01; done\ncat\n`);
  git(dir, 'config', 'filter.held.clean', `/bin/sh '${shell}'`);
  fs.writeFileSync(path.join(dir, '.gitattributes'), 'f filter=held\n');
  fs.writeFileSync(path.join(dir, 'f'), 'left by the step\n');
  const outcome = Effect.runPromise(PLACE.ask('handoff', { workspace: dir, step: 'build', why: '' }, { deadlineMs: 60_000 }));
  setImmediate(() => fs.writeFileSync(go, 'written by the loop'));
  const answered = await outcome;
  assert.ok('answer' in answered && answered.answer.commit, JSON.stringify(answered));
  assert.equal(git(dir, 'status', '--porcelain'), '');
});

test("the shipped place counts each question in the pass's place phase, and each git process it starts, and no other process", async () => {
  const dir = repository();
  const asked = Effect.gen(function* () {
    const first = yield* builtinGitPlace.ask('seal', { tree: path.join(dir, 'no-such-tree') });
    const second = builtinGitPlace.askNow('status', { repo: path.join(dir, 'no-such-checkout'), tips: {} });
    return [first, second];
  });
  const none = await Effect.runPromise(meteredPass(asked));
  assert.ok(none.tallies);
  assert.equal(none.tallies.kinds.place.calls, 2, 'a question is a call');
  assert.equal(none.tallies.kinds.place.spawned, 0, 'and a question git is not asked for starts no process at all');

  const two = Effect.gen(function* () {
    yield* builtinGitPlace.ask('open', { root: dir, isolate: false });
    return builtinGitPlace.askNow('open', { root: dir, isolate: false });
  });
  const counted: string[] = [];
  const bin = scratch('wf-git-place-bin-');
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const log = path.join(bin, 'ran');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho git >> '${log}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
  const was = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${was ?? ''}`;
  try {
    const { tallies } = await Effect.runPromise(meteredPass(two));
    assert.ok(tallies);
    counted.push(...fs.readFileSync(log, 'utf8').split('\n').filter(Boolean));
    assert.equal(tallies.kinds.place.calls, 2);
    assert.ok(counted.length >= 2, `open ran git: ${counted.length}`);
    assert.equal(tallies.kinds.place.spawned, counted.length, 'spawned is the git processes the place started, each counted once');
    assert.ok(tallies.kinds.place.ms > 0, "its time is the place's");
  } finally {
    process.env.PATH = was;
  }
});
