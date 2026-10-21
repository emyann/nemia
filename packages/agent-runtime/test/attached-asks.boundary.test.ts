/**
 * A question of an attached session's, held open while it waits on a person and answered from outside it, against the stand-in Claude
 * Code (`fixtures/stand-in-claude.ts`), which asks `can_use_tool` and `hook_callback` as the SDK's own CLI does.
 *
 * What each test pins: the ask written down while it waits (`openAsks`) and said by the sighting; the answer written by the runner's
 * `answer` verb and the held call let through with it, asserted key by key as the SDK's page documents the flow — `behavior: 'allow'`,
 * the input's own questions, and `answers` keyed by each question's text and valued by the chosen label; the ask closed `taken`
 * afterwards; a multi-select's labels joined with `", "` and own words carried as the answer's value rather than the word 'Other';
 * a question whose holder died is closed as cut when the next holder adopts the session, so nothing waits on a person twice;
 * a turn ended with a question open (the interrupt path) leaves no wait reading the answers file, its call denied `ASK_CUT`;
 * and the guard made to refuse — a session whose task does not say a person can be asked (`config.mayAsk`) denies the same call with
 * `DENIED_HERE` and writes no ask, and every other tool is denied in a session that does.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Scope } from 'effect';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { Engine } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { alive, appendAsk, crashNote, filesOf, openAsks, readRun, writeRun } from '../src/harness/claude/attached-file.ts';
import { processStart } from '../src/harness/claude/inbox.ts';
import { ASK_ANSWERED, ASK_CUT, askHookOutput, DENIED_HERE } from '../src/harness/claude/attached-session.ts';
import type { AskQuestion } from '../src/core/index.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from '../src/waits/index.ts';

const STAND_IN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stand-in-claude.ts');
const NAME = 'ae/asker/1';

/** The one question the plain asks carry, as `AskUserQuestion`'s input gives it. */
const ONE: AskQuestion = {
  question: 'What the board shows as an old closeout’s one line?',
  header: 'Summary',
  options: [
    { label: 'Cut it on read (Recommended)', description: 'The first line, cut at a word to 120 characters.' },
    { label: 'First line as it is', description: 'The board cuts it by its layout.' },
  ],
  multiSelect: false,
};

/**
 * A store, the stand-in's folder and a long-lived spawn whose session works there on `plan`, `config` laid over the request's own: the
 * shape a session she is runs in (`restartPolicy: 'Always'` with `background: true`).
 */
const place = (plan: object, config: Record<string, unknown> = {}) => {
  const root = scratch('ae-asks-');
  const dir = path.join(root, 'stand-in');
  fs.mkdirSync(dir, { recursive: true });
  const request: SpawnRequest = {
    name: NAME,
    brief: 'do the work',
    cwd: dir,
    restartPolicy: 'Always',
    config: { background: true, ...config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify({ turns: 'many', ...plan }) } },
  };
  return { root, dir, request };
};

/** A holder of the sessions under `root`, for a scope the test closes. */
const holder = async (root: string) => {
  const attached = attachedSessions(root, STAND_IN);
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  return { attached, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

/** The lines of the stand-in's `file`, each parsed. */
const lines = (dir: string, file: string): unknown[] => {
  const at = path.join(dir, file);
  return fs.existsSync(at)
    ? fs
        .readFileSync(at, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];
};

/** What the SDK answered the stand-in's control requests, the latest first. */
const answered = (dir: string): { event: string; answer: unknown }[] => lines(dir, 'answers.jsonl') as { event: string; answer: unknown }[];

/** Waits until the session under `root` holds an ask open, and answers it. */
const waiting = (t: TestContext, root: string) =>
  until(t, () => openAsks(root, NAME)[0], 'the session holding a question', { everyMs: 50 });

test('an `AskUserQuestion` call at the hook is held open, answered from outside, and let through with the answers', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const ask = await waiting(t, root);
  assert.deepEqual(ask.questions, [ONE], 'the ask is written down as the call asked it');
  const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
  assert.deepEqual(seen.asks, [ask], 'the sighting says the question waits on a person');
  assert.equal(seen.asksTaken, undefined, 'nothing has taken an answer yet');

  const answers = { [ONE.question]: 'Cut it on read (Recommended)' };
  await Effect.runPromise(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: ask.id, answers }));
  await until(t, () => answered(dir).some((a) => a.event === 'PreToolUse'), 'the held call answered', { everyMs: 50 });
  assert.deepEqual(
    answered(dir).find((a) => a.event === 'PreToolUse')?.answer,
    {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: ASK_ANSWERED,
        updatedInput: { questions: [ONE], answers },
      },
    },
    "the call is let through with the person's answers in its input, keyed by the question's own text",
  );
  assert.deepEqual(openAsks(root, NAME), [], 'the ask is closed');
  const after = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
  assert.deepEqual(after.asksTaken, [ask.id], 'the sighting says the held call took the answer');
  fs.writeFileSync(path.join(dir, 'release'), '');
  await h.close();
});

test('REFUSED: a session whose task does not say a person can be asked denies the same call, and writes no ask', WAITED, async (t) => {
  const { root, dir, request } = place({ ask: 'AskUserQuestion', askInput: { questions: [ONE] } });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the call answered', { everyMs: 50 });
  assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
    behavior: 'deny',
    message: DENIED_HERE,
    toolUseID: 'asked-1',
  });
  assert.deepEqual(openAsks(root, NAME), [], 'no ask is written down: no person can be asked through this session');
  assert.equal(fs.existsSync(filesOf(root, NAME).asks), false);
  await h.close();
});

test('REFUSED: in a session that may ask a person, every other tool is still denied', WAITED, async (t) => {
  const { root, dir, request } = place({ ask: 'WebFetch' }, { mayAsk: true });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the call answered', { everyMs: 50 });
  assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
    behavior: 'deny',
    message: DENIED_HERE,
    toolUseID: 'asked-1',
  });
  assert.deepEqual(openAsks(root, NAME), []);
  await h.close();
});

test('a question held at `can_use_tool` is answered the same way, a multi-select joined and own words carried', WAITED, async (t) => {
  const many: AskQuestion = {
    question: 'Which pages does it touch?',
    header: 'Pages',
    options: [
      { label: 'The runs page', description: '' },
      { label: 'The chat', description: '' },
    ],
    multiSelect: true,
  };
  const { root, dir, request } = place({ ask: 'AskUserQuestion', askInput: { questions: [ONE, many] } }, { mayAsk: true });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const ask = await waiting(t, root);
  assert.deepEqual(ask.questions, [ONE, many]);
  const answers = { [ONE.question]: 'Neither of those, in my own words', [many.question]: 'The runs page, The chat' };
  await Effect.runPromise(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: ask.id, answers }));
  await until(t, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the held call answered', { everyMs: 50 });
  assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
    behavior: 'allow',
    updatedInput: { questions: [ONE, many], answers },
    toolUseID: 'asked-1',
  });
  await h.close();
});

test('an ask whose holder let the session go is closed as cut, so its answer is owed as words', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const ask = await waiting(t, root);
  await h.close();
  assert.equal(readRun(filesOf(root, NAME).run)?.state, 'parked');
  assert.deepEqual(openAsks(root, NAME), [], 'the park closes the ask: no call of it is waiting any more');
  const taken = (await Effect.runPromise(attachedSessions(root, STAND_IN).ops.observe)).get(NAME)!;
  assert.equal(taken.asksTaken, undefined, 'and no call of it took an answer');
  assert.equal(ask.questions.length, 1);
  assert.deepEqual(openAsks(root, NAME), [], 'and a holder that takes the session up again finds none waiting');
  fs.rmSync(path.join(dir, 'nothing'), { force: true });
});

test('a question whose holder died is closed as cut when the next holder adopts the session', WAITED, async (t) => {
  const { root, dir, request } = place({ output: { done: 1 } }, { mayAsk: true });
  const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((r) => dead.once('exit', r));
  const left = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
  t.after(() => void (left.pid && alive(left.pid) && process.kill(-left.pid, 'SIGKILL')));
  writeRun(root, {
    name: NAME,
    state: 'working',
    owner: dead.pid!,
    startedAt: new Date().toISOString(),
    sessionId: 'crashed-asker',
    childPid: left.pid!,
    childStart: processStart(left.pid!),
    calling: { tool: 'AskUserQuestion', since: new Date().toISOString() },
    request: { ...request, brief: undefined },
  });
  appendAsk(root, NAME, { id: 'asked-1', at: new Date().toISOString(), questions: [ONE] });
  assert.deepEqual(
    openAsks(root, NAME).map((ask) => ask.id),
    ['asked-1'],
    'the ask the dead holder wrote waits on a person',
  );
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.observe);
  await until(t, () => lines(dir, 'said.jsonl').length, 'the adopted session told something', { everyMs: 50 });
  assert.equal(alive(left.pid!), false, "the dead holder's Claude Code is killed before the resume");
  assert.deepEqual(lines(dir, 'said.jsonl'), [crashNote('AskUserQuestion')]);
  assert.deepEqual(openAsks(root, NAME), [], 'the adopt closes the ask: no call of it is waiting on a person any more');
  const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
  assert.deepEqual(seen.asks, [], 'the sighting says nothing waits');
  assert.equal(seen.asksTaken, undefined, 'and no call of it took an answer: it is owed as words');
});

test('a turn ended with a question open stops waiting for an answer, its call told the answer comes as words', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
  const h = await holder(root);
  t.after(h.close);
  await Effect.runPromise(h.attached.ops.spawn(request));
  const ask = await waiting(t, root);
  await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: NAME }));
  const cut = await until(t, () => readRun(filesOf(root, NAME).run)?.state === 'idle', 'the interrupted turn ended', { everyMs: 50 });
  assert.equal(cut, true);
  assert.deepEqual(openAsks(root, NAME), [], "the turn's end closes the ask: no call of it is waiting on a person any more");
  const told = await until(t, () => answered(dir).find((a) => a.event === 'PreToolUse'), 'the held call let go', { everyMs: 50 });
  assert.deepEqual(
    told.answer,
    askHookOutput(undefined),
    'the wait left with the turn, and its call is denied, told the answer comes as words',
  );
  const refused = await Effect.runPromise(
    Effect.flip(
      h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: ask.id, answers: { [ONE.question]: 'First line as it is' } }),
    ),
  );
  assert.match(
    refused.message,
    /has no ask `.+` waiting on a person/,
    'and no answer can reach that call again, which is why the wait is pointless',
  );
});

test('a question whose answer never came is denied at its hook, told the answer comes as words', () => {
  assert.deepEqual(askHookOutput(undefined), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: ASK_CUT },
  });
  const answers = { [ONE.question]: 'First line as it is' };
  assert.deepEqual(askHookOutput({ questions: [ONE], answers }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: ASK_ANSWERED,
      updatedInput: { questions: [ONE], answers },
    },
  });
});

test('REFUSED: an answer to an ask the session does not hold open is refused, naming what to read again', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await waiting(t, root);
  const refused = await Effect.runPromise(
    Effect.flip(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: 'not-an-ask', answers: {} })),
  );
  assert.match(refused.message, /has no ask `not-an-ask` waiting on a person/);
  assert.equal(
    refused.refused,
    true,
    'and it is marked the refusal it is, which is what tells `answerAsk` to fail `AnswerRefused` rather than the `AnswerUnsent` a caller asks again on',
  );
  fs.rmSync(path.join(dir, 'nothing'), { force: true });
  await h.close();
});

test(
  'an ask of a `claude` task is answered through `Engine.answerAsk`, the verb carried whole down the engine’s own seam',
  WAITED,
  async (t) => {
    const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
    const own = { ...process.env };
    Object.assign(process.env, request.config!.env);
    t.after(() => void Object.assign(process.env, { STANDIN_DIR: own.STANDIN_DIR, STANDIN_PLAN: own.STANDIN_PLAN }));
    const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude' }, claudeExecutable: STAND_IN }));
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(Scope.provide(engine.hold(), scope));
    t.after(async () => {
      fs.writeFileSync(path.join(dir, 'release'), '');
      await Effect.runPromise(Scope.close(scope, Exit.void));
    });
    const id = await Effect.runPromise(
      engine.file({
        brief: request.brief,
        cwd: dir,
        harness: 'claude',
        restartPolicy: 'Always',
        config: { background: true, mayAsk: true },
      }),
    );
    const ask = await until(
      t,
      async () => {
        await Effect.runPromise(engine.tick());
        return (await Effect.runPromise(engine.view(id))).asks?.[0];
      },
      'the task’s view holding a question',
      { everyMs: 100 },
    );
    assert.deepEqual(ask.questions, [ONE], 'the ask reaches the layer above through the view, as the view carries it');

    const answers = { [ONE.question]: 'First line as it is' };
    const taken = await Effect.runPromise(engine.answerAsk(id, { id: ask.id, answers }));
    assert.equal(taken.attempt, 1, 'the answer names the attempt whose session held the call');
    await until(t, () => answered(dir).some((a) => a.event === 'PreToolUse'), 'the held call answered', { everyMs: 50 });
    const let_through = answered(dir).find((a) => a.event === 'PreToolUse')?.answer as
      | { hookSpecificOutput: { updatedInput: unknown } }
      | undefined;
    assert.deepEqual(
      let_through?.hookSpecificOutput.updatedInput,
      { questions: [ONE], answers },
      'the person’s answer reaches the session’s own call through the engine’s door, not through the holder’s ops',
    );
  },
);
