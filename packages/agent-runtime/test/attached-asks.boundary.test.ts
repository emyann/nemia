/**
 * A question of an attached session's, held open while it waits on a person and answered from outside it, against the stand-in Claude
 * Code (`fixtures/stand-in-claude.ts`), which asks `can_use_tool` and `hook_callback` as the SDK's own CLI does: a story of one
 * session asking at both, a table of the asks whose wait ended with no answer, a table of the refusals, and the answer carried
 * through `Engine.answerAsk`.
 *
 * What they pin: the ask written down while it waits (`openAsks`) and said by the sighting; the answer written by the runner's
 * `answer` verb and the held call let through with it, asserted key by key as the SDK's page documents the flow — `behavior: 'allow'`,
 * the input's own questions, and `answers` keyed by each question's text and valued by the chosen label; the ask closed `taken`
 * afterwards; a multi-select's labels joined with `", "` and own words carried as the answer's value rather than the word 'Other';
 * a question whose holder died is closed as cut when the next holder adopts the session, so nothing waits on a person twice;
 * a turn ended with a question open (the interrupt path) leaves no wait reading the answers file, its call denied `ASK_CUT`;
 * and the guard made to refuse — a session whose task does not say a person can be asked (`config.mayAsk`) denies the same call, and a
 * call Claude Code would prompt for, with `DENIED_HERE` and writes no ask.
 *
 * And a permission: a call Claude Code would prompt for, in a session that may ask a person, held as an ask of kind `permission`
 * carrying the SDK's words and the command as typed, answered allow once, always allow and in the person's own words, and cut by a
 * turn's end, each as the stand-in receives it; and how an asks line is read by its kind.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Scope } from 'effect';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { Engine } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { alive, appendAsk, crashNote, filesOf, openAsks, processStart, readRun, writeRun } from '../src/harness/claude/attached-file.ts';
import { ASK_ANSWERED, ASK_CUT, askHookOutput, DENIED_HERE } from '../src/harness/claude/attached-session.ts';
import { PERMISSION_ALWAYS, PERMISSION_DENY, PERMISSION_ONCE } from '../src/harness/claude/permission.ts';
import type { AskQuestion, PermissionFacts } from '../src/core/index.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

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
 * shape a session she is runs in (`restartPolicy: 'Always'`).
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
    config: { ...config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify({ turns: 'many', ...plan }) } },
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
const waiting = (t: Waiter, root: string) => until(t, () => openAsks(root, NAME)[0], 'the session holding a question', { everyMs: 50 });

/** A question whose answers are many, chosen together. */
const MANY: AskQuestion = {
  question: 'Which pages does it touch?',
  header: 'Pages',
  options: [
    { label: 'The runs page', description: '' },
    { label: 'The chat', description: '' },
  ],
  multiSelect: true,
};

test(
  'a person answers the questions a session holds at `can_use_tool` and at its hook, each let through with the answers',
  WAITED,
  async (t) => {
    const s = story(t);
    const { root, dir, request } = place(
      { ask: 'AskUserQuestion', askInput: { questions: [ONE, MANY] }, call: 'AskUserQuestion', callInput: { questions: [ONE] } },
      { mayAsk: true },
    );
    const h = await holder(root);
    t.after(() => {
      fs.writeFileSync(path.join(dir, 'release'), '');
      return h.close();
    });
    let first = '';

    await s.test('a question held at `can_use_tool` is written down as the call asked it, and said by the sighting', async (st) => {
      await Effect.runPromise(h.attached.ops.spawn(request));
      const ask = await waiting(st, root);
      first = ask.id;
      assert.deepEqual(ask.questions, [ONE, MANY], 'the ask is written down as the call asked it');
      const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
      assert.deepEqual(seen.asks, [ask], 'the sighting says the question waits on a person');
      assert.equal(seen.asksTaken, undefined, 'nothing has taken an answer yet');
    });

    await s.test('REFUSED: an answer to an ask the session does not hold open is refused, naming what to read again', async () => {
      const refused = await Effect.runPromise(
        Effect.flip(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: 'not-an-ask', answers: {} })),
      );
      assert.match(refused.message, /has no ask `not-an-ask` waiting on a person/);
      assert.equal(
        refused.refused,
        true,
        'and it is marked the refusal it is, which is what tells `answerAsk` to fail `AnswerRefused` rather than the `AnswerUnsent` a caller asks again on',
      );
    });

    await s.test('it is answered from outside, a multi-select joined and own words carried', async (st) => {
      const answers = { [ONE.question]: 'Neither of those, in my own words', [MANY.question]: 'The runs page, The chat' };
      await Effect.runPromise(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: first, answers }));
      await until(st, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the held call answered', { everyMs: 50 });
      assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
        behavior: 'allow',
        updatedInput: { questions: [ONE, MANY], answers },
        toolUseID: 'asked-1',
      });
    });

    await s.test(
      'an `AskUserQuestion` call at the hook is held open, answered from outside, and let through with the answers',
      async (st) => {
        const ask = await waiting(st, root);
        assert.notEqual(ask.id, first, 'the call at the hook is an ask of its own');
        assert.deepEqual(ask.questions, [ONE], 'the ask is written down as the call asked it');
        const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
        assert.deepEqual(seen.asks, [ask], 'the sighting says the question waits on a person');
        assert.deepEqual(seen.asksTaken, [first], 'the question answered before is the only one taken yet');

        const answers = { [ONE.question]: 'Cut it on read (Recommended)' };
        await Effect.runPromise(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id: ask.id, answers }));
        await until(st, () => answered(dir).some((a) => a.event === 'PreToolUse'), 'the held call answered', { everyMs: 50 });
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
        assert.deepEqual(after.asksTaken, [first, ask.id], 'the sighting says the held call took the answer');
      },
    );
  },
);

test('an ask whose wait ended with no answer is closed as cut, so its answer is owed as words', WAITED, async (t) => {
  await t.test('an ask whose holder let the session go is closed as cut', async (rt) => {
    const { root, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
    const h = await holder(root);
    await Effect.runPromise(h.attached.ops.spawn(request));
    const ask = await waiting(rt, root);
    await h.close();
    assert.equal(readRun(filesOf(root, NAME).run)?.state, 'parked');
    assert.deepEqual(openAsks(root, NAME), [], 'the park closes the ask: no call of it is waiting any more');
    const taken = (await Effect.runPromise(attachedSessions(root, STAND_IN).ops.observe)).get(NAME)!;
    assert.equal(taken.asksTaken, undefined, 'and no call of it took an answer');
    assert.equal(ask.questions.length, 1);
    assert.deepEqual(openAsks(root, NAME), [], 'and a holder that takes the session up again finds none waiting');
  });

  await t.test('a question whose holder died is closed as cut when the next holder adopts the session', async (rt) => {
    const { root, dir, request } = place({ output: { done: 1 } }, { mayAsk: true });
    const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((r) => dead.once('exit', r));
    const left = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
    rt.after(() => void (left.pid && alive(left.pid) && process.kill(-left.pid, 'SIGKILL')));
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
    rt.after(h.close);
    await Effect.runPromise(h.attached.ops.observe);
    await until(rt, () => lines(dir, 'said.jsonl').length, 'the adopted session told something', { everyMs: 50 });
    assert.equal(alive(left.pid!), false, "the dead holder's Claude Code is killed before the resume");
    assert.deepEqual(lines(dir, 'said.jsonl'), [crashNote('AskUserQuestion')]);
    assert.deepEqual(openAsks(root, NAME), [], 'the adopt closes the ask: no call of it is waiting on a person any more');
    const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
    assert.deepEqual(seen.asks, [], 'the sighting says nothing waits');
    assert.equal(seen.asksTaken, undefined, 'and no call of it took an answer: it is owed as words');
  });

  await t.test('a turn ended with a question open stops waiting for an answer, its call told the answer comes as words', async (rt) => {
    const { root, dir, request } = place({ call: 'AskUserQuestion', callInput: { questions: [ONE] } }, { mayAsk: true });
    const h = await holder(root);
    rt.after(h.close);
    await Effect.runPromise(h.attached.ops.spawn(request));
    const ask = await waiting(rt, root);
    await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: NAME }));
    const cut = await until(rt, () => readRun(filesOf(root, NAME).run)?.state === 'idle', 'the interrupted turn ended', { everyMs: 50 });
    assert.equal(cut, true);
    assert.deepEqual(openAsks(root, NAME), [], "the turn's end closes the ask: no call of it is waiting on a person any more");
    const told = await until(rt, () => answered(dir).find((a) => a.event === 'PreToolUse'), 'the held call let go', { everyMs: 50 });
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
});

test(
  'REFUSED: what is denied of a question — asked where no person may be asked, any other tool, an answer that never came',
  WAITED,
  async (t) => {
    await t.test('a session whose task does not say a person can be asked denies the call, and writes no ask', async (rt) => {
      const { root, dir, request } = place({ ask: 'AskUserQuestion', askInput: { questions: [ONE] } });
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      await until(rt, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the call answered', { everyMs: 50 });
      assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
        behavior: 'deny',
        message: DENIED_HERE,
        toolUseID: 'asked-1',
      });
      assert.deepEqual(openAsks(root, NAME), [], 'no ask is written down: no person can be asked through this session');
      assert.equal(fs.existsSync(filesOf(root, NAME).asks), false);
    });

    await t.test('a session whose task does not say a person can be asked denies a call Claude Code would prompt for', async (rt) => {
      const { root, dir, request } = place({ ask: 'Bash', askInput: BASH, askOptions: PROMPT });
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      await until(rt, () => answered(dir).some((a) => a.event === 'can_use_tool'), 'the call answered', { everyMs: 50 });
      assert.deepEqual(answered(dir).find((a) => a.event === 'can_use_tool')?.answer, {
        behavior: 'deny',
        message: DENIED_HERE,
        toolUseID: 'asked-1',
      });
      assert.deepEqual(openAsks(root, NAME), []);
      assert.equal(fs.existsSync(filesOf(root, NAME).asks), false, 'no permission is written down: no person can be asked');
    });

    await t.test(
      'a question whose answer never came is denied at its hook, told the answer comes as words; one answered is let through',
      () => {
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
      },
    );
  },
);

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
        config: { mayAsk: true },
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

/** A shell call Claude Code would prompt for, as its input gives it. */
const BASH = { command: 'nemia agents custom implementer --file ./implementer.md', description: 'Files the implementer from its file' };

/** The rules Claude Code suggests saving for it, as the SDK hands them over. */
const SUGGESTED = [
  {
    type: 'addRules',
    rules: [{ toolName: 'Bash', ruleContent: 'nemia agents custom *' }],
    behavior: 'allow',
    destination: 'localSettings',
  },
  { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
];

/** What else the `can_use_tool` request carries about the prompt, by the wire's names (`sdk.mjs`). */
const PROMPT = {
  title: 'Claude wants to run nemia agents custom implementer --file ./implementer.md',
  display_name: 'Run command',
  description: 'Files the implementer from its file',
  decision_reason: 'A rule of the project asks before this command',
  blocked_path: '/elsewhere/implementer.md',
  permission_suggestions: SUGGESTED,
};

test('a person answers the permissions a session holds: allow once, always allow, in their own words, and one cut', WAITED, async (t) => {
  const s = story(t);
  const { root, dir, request } = place({ ask: 'Bash', askInput: BASH, askOptions: PROMPT }, { mayAsk: true });
  const h = await holder(root);
  t.after(h.close);
  const calls = () => answered(dir).filter((a) => a.event === 'can_use_tool');
  const told = (st: Waiter, id: string) =>
    until(st, () => calls().find((a) => (a.answer as { toolUseID?: string }).toolUseID === id)?.answer, `the call ${id} answered`, {
      everyMs: 50,
    });
  const answer = async (st: Waiter, id: string, given: string) => {
    const ask = await waiting(st, root);
    assert.equal(ask.id, id, 'the permission waiting is the call asked now');
    const question = ask.questions[0]?.question ?? '';
    await Effect.runPromise(h.attached.ops.answer!({ name: NAME, sessionId: NAME }, { id, answers: { [question]: given } }));
    return told(st, id);
  };
  const again = () => Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'and again'));

  await s.test('a call Claude Code would prompt for is held as a permission, with the SDK’s words and the command as typed', async (st) => {
    await Effect.runPromise(h.attached.ops.spawn(request));
    const ask = await waiting(st, root);
    assert.equal(ask.kind, 'permission');
    assert.equal(ask.questions.length, 1, 'a permission asks one question');
    assert.equal(ask.questions[0]?.question, PROMPT.title, 'the question is the title the SDK gave, read off the wire');
    assert.deepEqual(
      ask.questions[0]?.options.map((o) => o.label),
      [PERMISSION_ONCE, PERMISSION_ALWAYS, PERMISSION_DENY],
    );
    const facts: PermissionFacts = {
      tool: 'Bash',
      command: BASH.command,
      title: PROMPT.title,
      displayName: PROMPT.display_name,
      description: PROMPT.description,
      decisionReason: PROMPT.decision_reason,
      blockedPath: PROMPT.blocked_path,
      always: true,
      defaultToNo: false,
    };
    assert.deepEqual(ask.kind === 'permission' && ask.permission, facts, 'it carries the SDK’s words as it gave them');
    const seen = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
    assert.deepEqual(seen.asks, [ask], 'the sighting says the permission waits on a person');
  });

  await s.test('allowed once, the call runs with its own input, and no rule is saved', async (st) => {
    assert.deepEqual(await answer(st, 'asked-1', PERMISSION_ONCE), { behavior: 'allow', updatedInput: BASH, toolUseID: 'asked-1' });
    assert.deepEqual(openAsks(root, NAME), [], 'the permission is closed');
    const after = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
    assert.deepEqual(after.asksTaken, ['asked-1'], 'its held call took the answer');
  });

  await s.test('always allowed, the call runs and the SDK’s suggestions are returned to be saved, as it gave them', async (st) => {
    await again();
    assert.deepEqual(await answer(st, 'asked-2', PERMISSION_ALWAYS), {
      behavior: 'allow',
      updatedInput: BASH,
      updatedPermissions: SUGGESTED,
      toolUseID: 'asked-2',
    });
  });

  await s.test('answered in the person’s own words, the call is denied, and their words are what the session reads', async (st) => {
    await again();
    const words = 'Not that one, file the reviewer first';
    assert.deepEqual(await answer(st, 'asked-3', words), { behavior: 'deny', message: words, toolUseID: 'asked-3' });
    const after = (await Effect.runPromise(h.attached.ops.observe)).get(NAME)!;
    assert.deepEqual(after.asksTaken, ['asked-1', 'asked-2', 'asked-3'], 'each answered permission was taken by its call');
  });

  await s.test('a turn ended while a permission waits cuts it, as a question is cut', async (st) => {
    await again();
    const ask = await waiting(st, root);
    assert.equal(ask.id, 'asked-4');
    await Effect.runPromise(h.attached.ops.interrupt!({ name: NAME, sessionId: NAME }));
    assert.deepEqual(await told(st, 'asked-4'), { behavior: 'deny', message: ASK_CUT, toolUseID: 'asked-4' });
    assert.deepEqual(openAsks(root, NAME), [], 'the turn’s end closes the permission');
    const closed = lines(path.dirname(filesOf(root, NAME).asks), path.basename(filesOf(root, NAME).asks)) as { id: string; how?: string }[];
    assert.deepEqual(
      closed.filter((l) => l.how !== undefined).map((l) => [l.id, l.how]),
      [
        ['asked-1', 'taken'],
        ['asked-2', 'taken'],
        ['asked-3', 'taken'],
        ['asked-4', 'cut'],
      ],
      'each closed as it ended: three answered, the last cut',
    );
  });
});

test('an asks line is read by its kind: a question where it says none, a permission only where its facts decode', async (t) => {
  const at = new Date().toISOString();
  const facts: PermissionFacts = { tool: 'Bash', command: 'ls', always: false, defaultToNo: true };
  const read = (line: object) => {
    const root = scratch('ae-ask-lines-');
    appendAsk(root, NAME, { id: 'call-1', at, questions: [ONE], ...line });
    return openAsks(root, NAME);
  };
  await t.test('a line with no kind, as every line was before a permission, is a question', () => {
    assert.deepEqual(read({}), [{ id: 'call-1', at, kind: 'question', questions: [ONE] }]);
  });
  await t.test('a permission line whose facts decode is a permission', () => {
    assert.deepEqual(read({ kind: 'permission', permission: facts }), [
      { id: 'call-1', at, kind: 'permission', questions: [ONE], permission: facts },
    ]);
  });
  await t.test('a permission line whose facts do not decode is unread', () => {
    assert.deepEqual(read({ kind: 'permission', permission: { ...facts, always: 'yes' } }), []);
    assert.deepEqual(read({ kind: 'permission' }), []);
  });
});
