/**
 * A need's fix, started by the server (`startFix`) and read back (`fixOf`, `followFix`), on the runtime's stand-in (`testEngine`) and the
 * test place given a need of its own and a repository need: a place's fix is filed as a command task in the store's folder, the tools
 * folder first on its PATH, each answer as its variable; a harness's install is found by its name alone and filed, and its typed sign-in
 * refused (`Invalid`); an answer left out, a need no place declares and a fix of a workflow of a factory whose places are not trusted are
 * refused, nothing filed; a repository need named by its factory alone is filed in that factory's repository once its places are trusted,
 * and refused, naming the trust, before; and the fix's phase, output and exit code are read off its task as it settles. The test's store
 * is its own, at `ROOT`, given as `ENV`, and the harness's trust file a folder of its own, so no place is trusted until a test trusts it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import type { Need } from 'objects';
import { testPlace } from '../../place/memory/index.ts';
import { declared } from '../../place/memory/place.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { engineOf, runWith, type EngineService } from '../runtime-client.ts';
import { PlaceService } from '../place/place.store.ts';
import { createFactoryAt } from '../factory/factory.store.ts';
import { toolsDir, type StoreRoot } from '../config/root.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { trustPlaces } from '../trust/trust.verb.ts';
import { DEFAULT_HARNESS } from 'agent-runtime/vocabulary';
import { signInNeedOf } from './harness.ts';
import { answerVariable, fixOf, followFix, startFix } from './fix.verb.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-fix-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
process.env.CLAUDE_CONFIG_DIR = scratch('wf-fix-harness-');

/** The place need the test place declares here: an identity, asked of the person, fixed by a command that writes it. */
const IDENTITY: Need = {
  name: 'identity',
  message: 'an identity is set',
  check: 'exit 1',
  fixes: [
    {
      command: 'echo "$NEMIA_ANSWER_NAME <$NEMIA_ANSWER_EMAIL>"',
      message: 'set it',
      asks: [
        { name: 'name', message: 'your name' },
        { name: 'email', message: 'your email' },
      ],
    },
  ],
};

/** The repository need the test place declares here: a toolchain, checked and fixed in each factory's repository. */
const TOOLCHAIN: Need = {
  name: 'toolchain',
  message: 'the toolchain is installed',
  check: 'exit 1',
  scope: 'repository',
  fixes: [{ command: 'echo installed', message: 'install it' }],
};

/** What the programs here ask. */
type Needs = PlaceService | StoreRoot | EngineService;

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
/** `program` over this test's engine and the test place, declaring `IDENTITY`. */
const run = <A, E>(program: Effect.Effect<A, E, Needs>) =>
  runOver(
    runWith,
    () => PlaceService.layer({ ...stand().place, declared: { ...declared, needs: [IDENTITY, TOOLCHAIN] } }),
    ENV,
  )(engineOf(engine().layer), program);

/** What `program` was refused with, which must be a refusal. */
const refusedBy = async (program: Effect.Effect<unknown, unknown, Needs>) => {
  try {
    await run(program);
  } catch (err) {
    return err;
  }
  assert.fail('the program was not refused');
};

test("a place's fix is filed as a command task with the tools folder on its PATH and each answer, and read back as it settles", async () => {
  const fix = await run(startFix({ need: 'identity', answers: { name: 'Lin', email: 'lin@example.com' } }));
  assert.equal(fix.phase, 'pending');
  const filed = engine().tasks.get(fix.id)?.spec;
  assert.ok(filed);
  assert.equal(filed.harness, 'command');
  assert.equal(filed.cwd, ROOT);
  const env = (filed.config as { env: Record<string, string> }).env;
  assert.equal(env.PATH?.split(path.delimiter)[0], path.join(toolsDir(ROOT), 'bin'));
  assert.equal(env.NEMIA_TOOLS, toolsDir(ROOT));
  assert.equal(env[answerVariable('name')], 'Lin');
  assert.equal(env[answerVariable('email')], 'lin@example.com');

  engine().settle(fix.id, 'working');
  assert.equal((await run(fixOf(fix.id))).phase, 'running');
  engine().settle(fix.id, 'succeeded', { exitCode: 0, printed: { stdout: 'Lin <lin@example.com>\n' } });
  const ended = await run(fixOf(fix.id));
  assert.equal(ended.phase, 'succeeded');
  assert.equal(ended.exitCode, 0);
  assert.equal(ended.output, 'Lin <lin@example.com>\n');

  const followed = await run(Effect.flatMap(followFix(fix.id, 1), (s) => Stream.runCollect(s)));
  assert.deepEqual(
    followed.map((f) => f.kind),
    ['output', 'ended'],
  );
});

test('a fix is refused, nothing filed, where an answer is left out, no place declares the need, or no fix was started', async () => {
  const left = await refusedBy(startFix({ need: 'identity', answers: { name: 'Lin' } }));
  assert.ok(left instanceof Invalid);
  assert.equal(left.exitCode, 2);
  const none = await refusedBy(startFix({ need: 'nothing' }));
  assert.ok(none instanceof Missing);
  const index = await refusedBy(startFix({ need: 'identity', index: 3, answers: { name: 'Lin', email: 'a@b' } }));
  assert.ok(index instanceof Invalid);
  const halfNamed = await refusedBy(startFix({ need: 'identity', factory: 'acme' }));
  assert.ok(halfNamed instanceof Invalid);
  assert.ok((await refusedBy(fixOf('fix-none'))) instanceof Missing);
  assert.deepEqual(engine().filings, []);
});

test("a workflow's fix of a factory whose places are not trusted is refused, naming the trust, and nothing is filed", async () => {
  const repo = scratch('wf-fix-repo-');
  stand().world.repository(repo, { 'a.txt': 'one\n' });
  const dir = path.join(repo, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    '---\nneeds:\n  - name: tool\n    message: the tool\n    check: exit 1\n    fixes:\n      - command: echo installed\n        message: install it\n---\n',
  );
  createFactoryAt(ROOT, { name: 'acme', repos: [repo], workflows: ['dev'], hires: {}, schedules: {} });
  const refused = await refusedBy(startFix({ need: 'tool', factory: 'acme', workflow: 'dev' }));
  assert.ok(refused instanceof Invalid);
  assert.match(refused.message, /nemia factory trust acme/);
  assert.deepEqual(engine().filings, []);
});

test("a harness's install is found by its name and filed; a fix a person types is refused, naming it, and nothing is filed", async () => {
  const typed = await refusedBy(startFix({ need: signInNeedOf(DEFAULT_HARNESS) }));
  assert.ok(typed instanceof Invalid);
  assert.equal(typed.exitCode, 2);
  assert.deepEqual(engine().filings, []);
  const fix = await run(startFix({ need: DEFAULT_HARNESS }));
  assert.equal(engine().tasks.get(fix.id)?.spec.harness, 'command');
  assert.equal(engine().tasks.get(fix.id)?.spec.cwd, ROOT);
});

test("a repository need named by its factory alone runs in the factory's repository once trusted, and is refused, naming the trust, before", async () => {
  const repo = scratch('wf-fix-toolchain-');
  stand().world.repository(repo, { 'a.txt': 'one\n' });
  createFactoryAt(ROOT, { name: 'tooled', repos: [repo], workflows: [], hires: {}, schedules: {} });
  const refused = await refusedBy(startFix({ need: 'toolchain', factory: 'tooled' }));
  assert.ok(refused instanceof Invalid);
  assert.match(refused.message, /nemia factory trust tooled/);
  assert.deepEqual(engine().filings, []);
  await run(trustPlaces([repo]));
  const fix = await run(startFix({ need: 'toolchain', factory: 'tooled' }));
  assert.equal(engine().tasks.get(fix.id)?.spec.cwd, repo);
  assert.equal(fix.factory, 'tooled');
  assert.equal(fix.workflow, undefined);
  const machine = await refusedBy(startFix({ need: 'toolchain' }));
  assert.ok(machine instanceof Missing, 'a repository need is no need of the machine alone');
});
