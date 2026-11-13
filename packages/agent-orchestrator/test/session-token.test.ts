/**
 * The session token, as a run meets it: a step's session is filed a token of its try's own in its environment (`SESSION_TOKEN`), the
 * store keeps only its digest's record, and the api's question — who a request is from (`sessionCaller`) — answers the step's agent while
 * the try is the live one, `session-ended` once it settled or a later try replaced it, `unknown-token` for one the store never minted,
 * and the person for none. Nemia's session is filed one too, in no factory. A standing token is its holder — the person, or an agent —
 * whatever the route needs, until it is retired by name; none, where the route needs one, is refused. `nemia token add`, `ls` and `rm` as
 * the api calls them. Kinds are asserted, never sentences.
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
import type { TokenNeed } from '../src/token/token.ts';
import { tokenDigest, tokensDir, mintToken, mintPersonToken, personTokensDir, revokePersonToken } from '../src/token/token.store.ts';
import { TOKEN_ADD, TOKEN_LS, TOKEN_RM } from '../src/token/commands.verb.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';
import { writeSpeakers } from '../src/chat/chat.store.ts';
import { handled, typed } from './typed.ts';
import { SAY } from '../src/say/commands.verb.ts';
import { Conflict } from '../src/runner.ts';
import { COMMAND_WORDS } from 'objects';
import type { Place } from '../src/runner.ts';
import type { Engine } from '../src/cli/flags.ts';

const ROOT = scratch('wf-session-token-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.NEMIA_DAEMON_START = 'off';
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_DEFAULT_FACTORY_STARTS: '1', WF_MAX_CONCURRENT: undefined, WF_MAX_RUNS: undefined };
/**
 * A command line as a person types it: a verb the client holds (`objects`' `COMMAND_WORDS`) run on its entry's handler (`typed`), as the
 * api runs it; any other through this CLI's `main`.
 */
const typedOrMain = (argv: string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env): Promise<unknown> =>
  COMMAND_WORDS.some((w) => w.name === argv[0]) ? typed(argv, e, undefined, place, env) : main(argv, e, undefined, place, env);
const stage = staged({ runWith, main: typedOrMain, engineOf, env: ENV });

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

/** Who a request presenting `token` is from, to a route that needs `need` of it, over the stage's engine and the store's root. */
const callerBy = (token: string | undefined, need?: TokenNeed) => stage.runWith(stage.board().e, sessionCaller(token, need));

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
    assert.deepEqual(await callerBy(token), {
      kind: 'agent',
      agent: 'implement',
      factory: 'default',
      run: id,
      step: 'implement',
      token: null,
      narrowed: null,
    });
  });

  await s.test('a program presenting none, to what needs none, is the person under no token', async () => {
    assert.deepEqual(await callerBy(undefined), { kind: 'person', token: null });
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
    assert.deepEqual(await callerBy(token), {
      kind: 'agent',
      agent: 'nemia',
      factory: null,
      run: null,
      step: null,
      token: null,
      narrowed: null,
    });
    stage.board().settle(task, 'succeeded', undefined);
    assert.deepEqual(await callerBy(token), { kind: 'refused', reason: 'session-ended' });
  });
});

test('a standing token is its holder whatever the route needs, until retired by name; none is refused where a route needs one', async (t) => {
  await t.test('no token: the person where the route needs none, refused token-required where it needs any', async () => {
    assert.deepEqual(await callerBy(undefined, 'none'), { kind: 'person', token: null });
    for (const need of ['token', 'standing'] as const)
      assert.deepEqual(await callerBy(undefined, need), { kind: 'refused', reason: 'token-required' }, need);
  });

  await t.test("a person's token is the person under its name, on a route that needs none, any token, or a standing one", async () => {
    const token = mintPersonToken(ROOT, 'laptop');
    for (const need of ['none', 'token', 'standing'] as const)
      assert.deepEqual(await callerBy(token, need), { kind: 'person', token: 'laptop' }, need);
    revokePersonToken(ROOT, 'laptop');
    for (const need of ['none', 'token', 'standing'] as const)
      assert.deepEqual(await callerBy(token, need), { kind: 'refused', reason: 'unknown-token' }, `${need}, once removed`);
  });

  await t.test('a token minted before holders were said, a record with no holder, is the person under its name', async () => {
    const token = mintPersonToken(ROOT, 'old-laptop');
    const file = path.join(personTokensDir(ROOT), `${tokenDigest(token)}.json`);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')) as object).sort(), ['createdAt', 'name']);
    fs.writeFileSync(file, `${JSON.stringify({ name: 'old-laptop', createdAt: '2026-01-01T00:00:00.000Z' })}\n`);
    assert.deepEqual(await callerBy(token, 'standing'), { kind: 'person', token: 'old-laptop' });
  });

  await t.test(
    "an agent's token is its agent under the token's name, in the factory it is bound to, with its narrowing, in no run",
    async () => {
      const token = mintPersonToken(ROOT, 'ops', new Date(), { kind: 'agent', agent: 'operator', factory: 'a', narrowed: 'act' });
      for (const need of ['token', 'standing'] as const)
        assert.deepEqual(
          await callerBy(token, need),
          { kind: 'agent', agent: 'operator', factory: 'a', run: null, step: null, token: 'ops', narrowed: 'act' },
          need,
        );
    },
  );

  await t.test("a live session's token is refused person-token-required where the route needs a standing one", async () => {
    const task = 'nemia-person-need';
    const token = mintToken(ROOT, { agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task });
    await Effect.runPromise(stage.board().e.file({ id: task, brief: 'be on', cwd: ROOT, restartPolicy: 'Always' }));
    assert.equal((await callerBy(token, 'token')).kind, 'agent');
    assert.deepEqual(await callerBy(token, 'standing'), { kind: 'refused', reason: 'person-token-required' });
  });
});

test('nemia token add mints a token for a holder, answered once; ls lists it by name and holder alone; rm retires it', async () => {
  const over = { env: ENV };
  const added = await handled(TOKEN_ADD, { name: 'cli-ops', agent: 'operator', narrowed: 'read' }, over);
  assert.match(added.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(
    { ...added, token: '', createdAt: '' },
    { name: 'cli-ops', holder: 'agent', agent: 'operator', narrowed: 'read', token: '', createdAt: '' },
  );
  assert.equal((await callerBy(added.token, 'standing')).kind, 'agent');

  const listed = await handled(TOKEN_LS, {}, over);
  const mine = listed.tokens.find((t) => t.name === 'cli-ops');
  assert.deepEqual(mine && { ...mine, createdAt: '' }, {
    name: 'cli-ops',
    holder: 'agent',
    agent: 'operator',
    narrowed: 'read',
    createdAt: '',
  });
  const text = JSON.stringify(listed);
  assert.ok(!text.includes(added.token) && !text.includes(tokenDigest(added.token)), 'neither the token nor its digest is listed');

  await assert.rejects(handled(TOKEN_ADD, { name: 'cli-ops' }, over), (err: unknown) => (err as { _tag?: string })._tag === 'Conflict');
  await assert.rejects(
    handled(TOKEN_ADD, { name: 'cli-x', factory: 'a' }, over),
    (err: unknown) => (err as { _tag?: string })._tag === 'Invalid',
  );
  await handled(TOKEN_RM, { name: 'cli-ops' }, over);
  assert.deepEqual(await callerBy(added.token), { kind: 'refused', reason: 'unknown-token' });
  await assert.rejects(handled(TOKEN_RM, { name: 'cli-ops' }, over), (err: unknown) => (err as { _tag?: string })._tag === 'Missing');
});

/**
 * `nemia say` to `runId`'s `implement` as the api takes it from a client in `env`: who calls read off the session token it presents
 * (`sessionCaller`), refused (`Conflict`) where it names no live try, and `--as` the name the words say they are from.
 */
const sayAs = async (runId: string, env: Env, ...words: string[]) => {
  const token = env[SESSION_TOKEN];
  const caller = await callerBy(token === undefined || token === '' ? undefined : token);
  if (caller.kind === 'refused') throw new Conflict({ message: `the session's token is refused: ${caller.reason}` });
  const as = words[0] === '--as' ? words[1] : undefined;
  const text = (as === undefined ? words : words.slice(2)).join(' ');
  return stage.runWith(
    stage.board().e,
    SAY.handler({
      runId,
      step: 'implement',
      text,
      caller: caller.kind === 'agent' ? { kind: 'agent', agent: caller.agent, factory: caller.factory } : { kind: 'person' },
      ...(as === undefined ? {} : { from: { kind: 'agent', name: as } }),
    }),
  );
};

test("`nemia say` from a step's session says its words as its agent's, by the token in its environment; an ended one is refused", async (t) => {
  const s = story(t);
  let id = '';
  let token = '';
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
    await sayAs(id, { ...ENV, [SESSION_TOKEN]: token }, 'Start', 'with', 'the', 'parser.');
    assert.deepEqual(heard(), ['The agent implement writes, not the person: Start with the parser.']);
  });

  await s.test('with no token, `--as` an allowed name frames them under it; the person says them as ever', async () => {
    writeSpeakers(path.join(ROOT, 'nemia'), ['operator']);
    await sayAs(id, ENV, '--as', 'operator', 'Cut', 'it.');
    await sayAs(id, { ...ENV, [SESSION_TOKEN]: '' }, 'Widen', 'it.');
    assert.deepEqual(heard().slice(1), ['The agent operator writes, not the person: Cut it.', 'Widen it.']);
  });

  await s.test('REFUSED: a token whose try ended is a Conflict, never taken as the person, and nothing is said', async () => {
    stage.board().settle(`${id}-implement`, 'failed', { outcome: 'blocked', summary: 'stuck', artifacts: [], needs: null });
    await assert.rejects(sayAs(id, { ...ENV, [SESSION_TOKEN]: token }, 'hello'), (err: Error & { exitCode?: number }) => {
      assert.equal(err.name, 'Conflict');
      assert.equal(err.exitCode, 2);
      return true;
    });
    assert.equal(heard().length, 3);
  });
});
