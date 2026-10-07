/**
 * A place verb run off the event loop (`runPlaceVerbAsync`), against scripts planted in a scratch skill: it answers, refuses and is unread
 * as `runPlaceVerb` is; the loop runs other work while a script sleeps; and a script past its deadline is unread, saying so, with nothing
 * it started left running, a child deaf to SIGTERM killed and named.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import { setTimeout as sleep } from 'node:timers/promises';
import { runPlaceVerbAsync } from './place-async.store.ts';
import type { PlaceOutcome, PlaceRequests, PlaceVerb } from './place.ts';
import { running } from '../../test/running.ts';
import { scratch } from '../../test/scratch.ts';
import { meteredPass } from '../meter/tally.store.ts';

/** A skill folder holding one script, `scripts/<verb>.ts`, whose body is `body`. */
function planted(verb: PlaceVerb, body: string): string {
  const dir = scratch('wf-place-async-');
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.writeFileSync(path.join(dir, 'scripts', `${verb}.ts`), body);
  return dir;
}

const MAKE: PlaceRequests['make'] = { repo: '/r', at: '/w', name: 'wf/x/a', from: 'main', also: ['wf/x/b'] };

/** `verb` run off the loop, awaited. */
const ran = <V extends PlaceVerb>(dir: string, verb: V, request: PlaceRequests[V], deadlineMs?: number): Promise<PlaceOutcome<V>> =>
  Effect.runPromise(runPlaceVerbAsync(dir, verb, request, deadlineMs === undefined ? {} : { deadlineMs }));

/** Resolves once `seen` holds, asked every 10 ms. */
async function waitFor(seen: () => boolean): Promise<void> {
  while (!seen()) await sleep(10);
}

/** What an unread outcome said; fails on any other. */
function saidOf(outcome: PlaceOutcome<PlaceVerb>): string {
  assert.ok('unread' in outcome, JSON.stringify(outcome));
  return outcome.unread.said;
}

test('make answers off the loop as runPlaceVerb answers: the request handed with v 1, in the skill folder, its answer decoded', async () => {
  const dir = planted(
    'make',
    [
      "import fs from 'node:fs';",
      "const request = JSON.parse(fs.readFileSync(0, 'utf8'));",
      'process.stdout.write(JSON.stringify({ workspace: process.cwd(), branch: request.name, conflicts: request.also, notes: [String(request.v)] }));',
    ].join('\n'),
  );
  const outcome = await ran(dir, 'make', MAKE);
  assert.ok('answer' in outcome, JSON.stringify(outcome));
  assert.deepEqual(outcome.answer, { workspace: fs.realpathSync(dir), branch: 'wf/x/a', conflicts: ['wf/x/b'], notes: ['1'] });
});

test('a verb run off the loop in a pass is counted in its place phase, its process and its time; one with no script starts nothing', async () => {
  const answer = { workspace: '/w', branch: 'wf/x/a', conflicts: [], notes: [] };
  const dir = planted('make', `process.stdout.write(${JSON.stringify(JSON.stringify(answer))});\n`);
  const { tallies } = await Effect.runPromise(meteredPass(runPlaceVerbAsync(dir, 'make', MAKE)));
  assert.ok(tallies);
  const { spawned, calls, ms } = tallies.kinds.place;
  assert.deepEqual({ spawned, calls }, { spawned: 1, calls: 1 });
  assert.ok(ms > 0, "its time is the place's");
  const none = await Effect.runPromise(meteredPass(runPlaceVerbAsync(scratch('wf-place-async-none-'), 'make', MAKE)));
  assert.ok(none.tallies);
  assert.deepEqual(
    Object.values(none.tallies.kinds).map((k) => k.spawned),
    Object.values(none.tallies.kinds).map(() => 0),
  );
});

test('REFUSED: a refusal at exit 0 is the refusal; a non-zero exit, an answer of another shape and no script are each unread, with why', async () => {
  assert.deepEqual(await ran(planted('make', `process.stdout.write('{"refused":"no"}');\n`), 'make', MAKE), { refused: 'no' });
  const failed = planted('make', "process.stderr.write('fatal: one\\nfatal: two\\n');\nprocess.exitCode = 1;\n");
  assert.equal(saidOf(await ran(failed, 'make', MAKE)), 'fatal: one / fatal: two');
  const shaped = planted('make', `process.stdout.write('{"workspace":1}');\n`);
  assert.match(saidOf(await ran(shaped, 'make', MAKE)), /^its answer does not read as make's: `workspace` is 1, where /);
  const none = scratch('wf-place-async-');
  assert.equal(
    saidOf(await ran(none, 'make', MAKE)),
    `the place has no script for make: ${path.join(none, 'scripts', 'make.ts')} is not there`,
  );
});

test('the loop runs other work while a make sleeps: the script waits for a file only a callback of this process writes', async () => {
  const dir = planted(
    'make',
    [
      "import fs from 'node:fs';",
      "const go = new URL('../go', import.meta.url);",
      'const wait = () => {',
      '  if (!fs.existsSync(go)) return setTimeout(wait, 10);',
      "  process.stdout.write(JSON.stringify({ workspace: '/w', branch: 'b', conflicts: [], notes: [fs.readFileSync(go, 'utf8')] }));",
      '};',
      'wait();',
    ].join('\n'),
  );
  const outcome = ran(dir, 'make', MAKE, 60_000);
  setImmediate(() => fs.writeFileSync(path.join(dir, 'go'), 'written by the loop'));
  const answered = await outcome;
  assert.ok('answer' in answered, JSON.stringify(answered));
  assert.deepEqual(answered.answer.notes, ['written by the loop']);
});

/** A script that starts one child deaf to SIGTERM, which writes its pid to `deaf` once deaf, and then waits forever. */
const DEAF = [
  "import { spawn } from 'node:child_process';",
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "const child = path.resolve('scripts', 'child.mjs');",
  `fs.writeFileSync(child, ${JSON.stringify(
    [
      "import fs from 'node:fs';",
      "process.on('SIGTERM', () => {});",
      'fs.writeFileSync(process.argv[2], String(process.pid));',
      'setInterval(() => {}, 1000);',
    ].join('\n'),
  )});`,
  "spawn(process.execPath, [child, path.resolve('deaf')], { stdio: 'inherit' });",
  'setInterval(() => {}, 1000);',
].join('\n');

/** The most tries the deadline test makes, each with twice the deadline of the one before, for its child to be deaf in time. */
const DEAF_TRIES = 6;

test('a make past its deadline is unread, saying so, its script and the child deaf to SIGTERM it started gone, and named', async (t) => {
  let deadlineMs = 1500;
  for (let tries = 1; ; tries++, deadlineMs *= 2) {
    const dir = planted('make', DEAF);
    const child = path.join(dir, 'scripts', 'child.mjs');
    t.after(() => {
      for (const pid of running(child)) process.kill(pid, 'SIGKILL');
    });
    const said = saidOf(await ran(dir, 'make', MAKE, deadlineMs));
    assert.deepEqual(running(child), [], `try ${tries}: no child left running`);
    assert.deepEqual(running(path.join(dir, 'scripts', 'make.ts')), [], `try ${tries}: the script is not left running`);
    const marker = path.join(dir, 'deaf');
    if (!fs.existsSync(marker)) {
      assert.ok(tries < DEAF_TRIES, `the child ignored SIGTERM before the deadline, on one of ${DEAF_TRIES} tries: ${said}`);
      continue;
    }
    const pid = Number(fs.readFileSync(marker, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone`);
    const seconds = String(deadlineMs / 1000).replace('.', '\\.');
    assert.match(
      said,
      new RegExp(
        `^it gave no answer within ${seconds} s, its deadline, and was stopped, and a process it started outlived SIGTERM for 2 s and was killed`,
      ),
    );
    return;
  }
});

test('a make whose ask is interrupted, as a pass is when the api is stopped, leaves nothing of its group running, the deaf child too', async (t) => {
  const dir = planted('make', DEAF);
  const child = path.join(dir, 'scripts', 'child.mjs');
  t.after(() => {
    for (const pid of running(child)) process.kill(pid, 'SIGKILL');
  });
  const marker = path.join(dir, 'deaf');
  const fiber = Effect.runFork(runPlaceVerbAsync(dir, 'make', MAKE, { deadlineMs: 600_000 }));
  await waitFor(() => fs.existsSync(marker));
  const pid = Number(fs.readFileSync(marker, 'utf8'));
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.deepEqual(running(path.join(dir, 'scripts', 'make.ts')), [], 'the script is not left running');
  assert.deepEqual(running(child), [], 'no child left running');
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `the child ${pid} is gone`);
});
