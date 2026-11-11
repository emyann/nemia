/**
 * The session token, as a run meets it: a step's session is filed a token of its try's own in its environment (`SESSION_TOKEN`), the
 * store keeps only its digest's record, and the api's question — who a request is from (`sessionCaller`) — answers the step's agent while
 * the try is the live one, `session-ended` once it settled or a later try replaced it, `unknown-token` for one the store never minted,
 * and the person for none. Nemia's session is filed one too, in no factory. Kinds are asserted, never sentences.
 *
 * Its store is its own at `ROOT`, given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { advanceRun, startRun, runWith, retryRun } from '../src/runner.ts';
import { runRecord } from '../src/record/record.store.ts';
import { SESSION_TOKEN } from '../src/filed/filed.ts';
import { engineOf } from '../src/runtime-client.ts';
import { sessionCaller } from '../src/token/caller.verb.ts';
import { tokenDigest, tokensDir, mintToken } from '../src/token/token.store.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';
import { writeSpeakers } from '../src/chat/chat.store.ts';

const ROOT = scratch('wf-session-token-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.NEMIA_DAEMON_START = 'off';
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_DEFAULT_FACTORY_STARTS: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
const stage = staged({ runWith, main, engineOf, env: ENV });

/** A repository of the stage's place with one file, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'a.txt': 'one\n' });
  return repo;
};

/** A workflow folder of one step, `implement`, then `review` after it. */
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** One pass over the run `id` on the stage's engine. */
const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(runRecord(ROOT, id)));

/** The token the engine's task `id` was filed in its environment. */
const tokenOf = (id: string): string | undefined => stage.board().tasks.get(id)?.spec.config?.env?.[SESSION_TOKEN];

/** Who a request presenting `token` is from, over the stage's engine and the store's root. */
const callerBy = (token: string | undefined) => stage.runWith(stage.board().e, sessionCaller(token));

/** Every file under the store's tokens folder, with its text. */
const tokenFiles = (): Array<{ name: string; text: string }> => {
  const dir = tokensDir(ROOT);
  return fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') })) : [];
};

test('a step is filed a session token, which names its agent while its try is live and is refused once it ends', async (t) => {
  const s = story(t);
  let id = '';
  let token = '';

  await s.test("the filed session's environment carries a token of its own, 32 bytes in base64url", async () => {
    const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder() }));
    id = run.id;
    assert.deepEqual((await pass(id)).filed, ['implement']);
    token = tokenOf(`${id}-implement`) ?? '';
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  await s.test('the store keeps only the record its digest names, never the token in the clear', () => {
    const files = tokenFiles();
    const mine = files.filter((f) => f.name === `${tokenDigest(token)}.json`);
    assert.equal(mine.length, 1);
    assert.deepEqual(JSON.parse(mine[0].text), {
      agent: 'implement',
      factory: 'default',
      run: id,
      step: 'implement',
      attempt: 1,
      task: `${id}-implement`,
    });
    assert.ok(
      files.every((f) => !f.name.includes(token) && !f.text.includes(token)),
      'no file holds the token itself',
    );
  });

  await s.test('a request presenting it is the agent of its step, in its factory and run', async () => {
    assert.deepEqual(await callerBy(token), { kind: 'agent', agent: 'implement', factory: 'default', run: id, step: 'implement' });
  });

  await s.test('a request presenting none is the person', async () => {
    assert.deepEqual(await callerBy(undefined), { kind: 'person' });
  });

  await s.test('once its try settled, the token is refused session-ended', async () => {
    stage.board().settle(`${id}-implement`, 'failed', { outcome: 'blocked', summary: 'stuck', artifacts: [], needs: null });
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'session-ended' });
  });

  await s.test('a later try is filed a new token, live, while the first stays refused', async () => {
    await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh' }));
    await pass(id);
    const second = tokenOf(`${id}-implement-try2`) ?? '';
    assert.match(second, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(second, token);
    assert.equal((await callerBy(second)).kind, 'agent');
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'session-ended' });
  });

  await s.test('a token whose record the store does not hold is refused unknown-token', async () => {
    fs.rmSync(path.join(tokensDir(ROOT), `${tokenDigest(token)}.json`));
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'unknown-token' });
  });
});

test("a session that is no run's is live while its task has not settled, in no factory", async (t) => {
  await t.test('live while filed and unsettled, ended once settled', async () => {
    const task = 'nemia-session-token';
    const token = mintToken(ROOT, { agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task });
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'session-ended' });
    await Effect.runPromise(stage.board().e.file({ id: task, brief: 'be on', cwd: ROOT, restartPolicy: 'Always' }));
    assert.deepEqual(await callerBy(token), { kind: 'agent', agent: 'nemia', factory: null, run: null, step: null });
    stage.board().settle(task, 'succeeded', undefined);
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'session-ended' });
  });
});

test("`nemia say` from a step's session says its words as its agent's, by the token in its environment; an ended one is refused", async (t) => {
  const s = story(t);
  let id = '';
  let token = '';
  const sayAs = (env: Env, ...words: string[]) =>
    main(['say', id, 'implement', ...words], stage.board().e, undefined, stage.place().place, env);
  const heard = () =>
    stage
      .board()
      .tasks.get(`${id}-implement`)
      ?.said.map((x) => x.text) ?? [];

  await s.test("a live step's token frames the words under its agent", async () => {
    const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder() }));
    id = run.id;
    await pass(id);
    stage.board().settle(`${id}-implement`, 'working');
    token = tokenOf(`${id}-implement`) ?? '';
    await sayAs({ ...ENV, [SESSION_TOKEN]: token }, 'Start', 'with', 'the', 'parser.');
    assert.deepEqual(heard(), ['The agent implement writes, not the person: Start with the parser.']);
  });

  await s.test('with no token, `--as` an allowed name frames them under it; the person says them as ever', async () => {
    writeSpeakers(path.join(ROOT, 'nemia'), ['operator']);
    await sayAs(ENV, '--as', 'operator', 'Cut', 'it.');
    await sayAs({ ...ENV, [SESSION_TOKEN]: '' }, 'Widen', 'it.');
    assert.deepEqual(heard().slice(1), ['The agent operator writes, not the person: Cut it.', 'Widen it.']);
  });

  await s.test('REFUSED: a token whose try ended is a Conflict, never taken as the person, and nothing is said', async () => {
    stage.board().settle(`${id}-implement`, 'failed', { outcome: 'blocked', summary: 'stuck', artifacts: [], needs: null });
    await assert.rejects(sayAs({ ...ENV, [SESSION_TOKEN]: token }, 'hello'), (err: Error & { exitCode?: number }) => {
      assert.equal(err.name, 'Conflict');
      assert.equal(err.exitCode, 2);
      return true;
    });
    assert.equal(heard().length, 3);
  });
});
