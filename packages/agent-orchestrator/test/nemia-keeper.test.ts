/**
 * Nemia kept and let go, told as a person's stories on the stage (`story.ts`): `nemia level` written while her folder is not trusted and
 * her session filed only once it is; the keeper's shipped five-second rest, on a steered clock; her task filed long-lived in her folder
 * in auto, by her shipped definition and the person's custom words, with the daemon's own bin first on her path, her fence derived from
 * the table, her admission and a deny on the store but her folder, subscribed once with her floor and owed nothing on the next beat; a
 * stop from outside never filed again, and manual stopping and unsubscribing her. A factory raised for a stretch keeps her until the
 * raise's end passes, and then she is stopped with no write. Kept, she is told the person's changed custom words once, and their chat
 * words once she is live. And the table of what `nemia level` refuses.
 *
 * Over the engine's stand-in, its `view` laid over to say each task's spend, and a scratch store of its own, since `WF_ROOT` and the
 * harness's config folder are read as the modules load. Each story mocks `Date` at a moment written as a literal, so her task's id,
 * named for the moment she is raised, and a raise's end are the story's own. What the keeper owes at each state is the table of
 * `src/nemia/nemia.test.ts`; the stretches and what a write asks, `src/level/level.test.ts`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import type { TaskView } from 'agent-runtime';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { until } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-nemia-keeper-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const CONFIG = scratch('wf-nemia-keeper-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
const { keep, keepOnce } = await import('../src/nemia/keep.verb.ts');
const { LEVEL } = await import('../src/nemia/level.verb.ts');
const { MEMORY } = await import('../src/nemia/memory.verb.ts');
const { appendOutbox, chatDir, stopsFile } = await import('../src/chat/chat.store.ts');
const { framedForHer } = await import('../src/chat/chat.ts');
const { levelFile, memoryDir, nemiaDir, ownBin, promptFile, readLevel, readNemia, toldFile } = await import('../src/nemia/level.store.ts');
const { listSubscriptions } = await import('../src/subscription/subscription.store.ts');
const { customInstructionsFile } = await import('../src/agents/read.store.ts');
const { addFactory, factoryNames } = await import('../src/factory/factory.store.ts');
const { factoryLevelFile } = await import('../src/level/level.store.ts');
const { DEFAULT_HARNESS } = await import('../src/harness/harness.ts');
const { nemiaFence } = await import('../src/admission/index.ts');
const { TABLE } = await import('../src/command/commands.verb.ts');
const { engineOf, over, runWith } = await import('../src/runtime-client.ts');
/** The CLI's `main`, loaded only if a checkpoint types a command: these stories call the verbs, and its import is the slowest. */
const main: Parameters<typeof staged>[0]['main'] = async (...argv) => (await import('../src/cli/main.ts')).main(...argv);
const stage = staged({ runWith, main, engineOf });

/** The board's engine, its `view` saying when a task was filed, whether a stop was asked of it and what it spent, as a fold does. */
const viewed = () => {
  const b = stage.board();
  return {
    ...b.e,
    view: (id: string) =>
      Effect.sync(() => {
        const t = b.tasks.get(id);
        const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
        const attempts = [{ n: 1, endedAt: '2026-10-05T16:30:00.000Z', reason: null, usage: { costUsd: 0.42 } }];
        const state = t
          ? { filedAt: '2026-10-05T16:00:00.000Z', settled, stopRequested: b.stopped.includes(id), attempts, said: t.said }
          : { settled: null, attempts: [] };
        return { id, phase: t?.phase ?? 'pending', sessionId: t ? '0123456789abcdef' : null, state } as unknown as TaskView;
      }),
  };
};

/** One beat of the keeper, and what it did. */
const beat = () => stage.runWith(viewed(), keepOnce());
/** `nemia level` with `args`, as its handler answers it. */
const level = (args: Record<string, string | boolean>) => stage.runWith(viewed(), LEVEL.handler(args));

/** Her folder trusted or not, as the harness keeps it in its config file. */
const trust = (trusted: boolean) =>
  fs.writeFileSync(
    path.join(CONFIG, `.${DEFAULT_HARNESS}.json`),
    JSON.stringify({ projects: { [nemiaDir()]: { hasTrustDialogAccepted: trusted } } }),
  );

/** The factory `pipao` in the store and her folder trusted: a story of a factory's level starts from it. */
const withPipao = () => {
  trust(true);
  if (!factoryNames().includes('pipao')) addFactory({ name: 'pipao', repos: [fs.mkdtempSync(path.join(ROOT, 'repo-'))] });
};

/** The person's custom words for her written, their folder made where none was. */
const writeCustom = (words: string) => {
  fs.mkdirSync(path.dirname(customInstructionsFile(ROOT, 'nemia')), { recursive: true });
  fs.writeFileSync(customInstructionsFile(ROOT, 'nemia'), words);
};

/** The message `f` refuses with, at exit 2. */
const refusal = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
    return (err as Error).message;
  }
  assert.fail('no refusal');
};

/**
 * Her task kept anew in the story told in `t`: any she has stopped at manual, then the store's level at semi-auto, a moment later, a
 * fresh task filed, subscribed and at work. Its id.
 */
const keptAnew = async (t: TestContext): Promise<string> => {
  withPipao();
  await level({ level: 'manual' });
  await beat();
  t.mock.timers.tick(2);
  const { task } = (await level({ level: 'semi-auto' })) as { task: string };
  assert.deepEqual(await beat(), ['file']);
  assert.deepEqual(await beat(), ['subscribe']);
  assert.deepEqual(await beat(), []);
  stage.board().settle(task, 'running');
  return task;
};

/** `Date` mocked for the story told in `t`, at `now`: her task is named for the moment she is raised, and a raise ends on the wall. */
const mockedAt = (t: TestContext, now: string) => t.mock.timers.enable({ apis: ['Date'], now: Date.parse(now) });

test("Nemia kept and let go: trusted late, filed long-lived in auto with the daemon's bin first, subscribed once, stopped from outside, let go at manual", async (t) => {
  const s = story(t);
  mockedAt(t, '2026-10-05T16:00:00.000Z');
  let first = '';
  await s.test('no level set owes nothing, trusted or not: the keeper writes no level', async () => {
    for (const trusted of [false, true]) {
      trust(trusted);
      assert.deepEqual(await beat(), [], 'no level set owes nothing, trusted or not');
      assert.equal(fs.existsSync(levelFile()), false, 'never automatic: the keeper writes no level');
    }
  });
  await s.test(
    'semi-auto while her folder is not trusted is written, naming the command that trusts it; her session is filed only once it is',
    async () => {
      fs.rmSync(path.join(CONFIG, `.${DEFAULT_HARNESS}.json`));
      const words = `mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`;
      const set = await level({ level: 'semi-auto' });
      assert.equal(set.level, 'semi-auto');
      assert.ok(set.task !== null && readLevel()?.task === set.task, 'her task named, for the keeper');
      assert.equal(set.trust, words);
      assert.ok(
        LEVEL.print(set, {}).some((line) => line.includes(words) && line.includes('accept the prompt')),
        'nemia level says the command',
      );
      const b = stage.board();
      const filings = b.filings.length;
      assert.deepEqual(await beat(), [], 'her session waits for her folder to be trusted');
      trust(false);
      assert.deepEqual(await beat(), []);
      assert.equal(b.filings.length, filings, 'nothing filed where her harness would refuse its start');
      trust(true);
      assert.equal((await level({})).trust, null, 'trusted: no command to run');
      assert.deepEqual(await beat(), ['file'], 'filed at the next beat, with no second level set');
      assert.deepEqual(b.filings.slice(filings), [set.task]);
      await level({ level: 'manual' });
      assert.deepEqual(await beat(), ['stop']);
      fs.rmSync(levelFile());
    },
  );
  await s.test(
    'REFUSED at shipped defaults: a level set after a beat files her task not before five seconds, and at the next beat',
    async (sub) => {
      const b = stage.board();
      const clock = stage.clock();
      const keeper = Effect.runFork(over(viewed())(keep()).pipe(Effect.provide(clock.layer)));
      const stopped = () => Effect.runPromise(Fiber.interrupt(keeper));
      try {
        await until(sub, () => clock.asked.length === 1, 'the first beat done', { bell: clock.bell });
        assert.deepEqual(clock.asked, [5_000], 'the keeper rests the shipped five seconds');
        t.mock.timers.tick(1);
        const filings = b.filings.length;
        const set = await level({ level: 'semi-auto' });
        await clock.adjust(4_999);
        assert.deepEqual([clock.woken, b.filings.length], [[], filings], 'a millisecond early, no beat');
        await clock.adjust(1);
        await until(sub, () => clock.asked.length === 2, 'the second beat done', { bell: clock.bell });
        assert.deepEqual(b.filings.slice(filings), [set.task], 'filed by the beat at five seconds');
      } finally {
        await stopped();
      }
      await level({ level: 'manual' });
      assert.deepEqual(await beat(), ['stop']);
      fs.rmSync(levelFile());
    },
  );
  await s.test(
    "at semi-auto the keeper files her task long-lived in auto, the daemon's bin first on her path, every store write asked but her memory",
    async () => {
      const b = stage.board();
      writeCustom('Answer in French. Times in Montreal.\n');
      const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
      addFactory({ name: 'pipao', repos: [repo] });
      const daemon = {
        pid: process.pid,
        by: 'api',
        url: 'http://127.0.0.1:8787',
        startedAt: '2026-10-05T15:00:00.000Z',
        cwd: ROOT,
        every: 2000,
      };
      fs.writeFileSync(path.join(ROOT, 'daemon.json'), JSON.stringify(daemon));
      t.mock.timers.tick(1);
      const set = (await level({ level: 'semi-auto' })) as { task: string; phase: string | null };
      first = set.task;
      assert.equal(set.phase, null, 'not filed until the keeper beats');
      fs.mkdirSync(path.join(ROOT, 'brand-new'));
      const local = path.join(nemiaDir(), CONFIG_FOLDERS[0], 'settings.local.json');
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, JSON.stringify({ permissions: { allow: ['Bash(nemia cancel:*)', 'Bash(nemia approve:*)'] } }));
      const bin = ownBin();
      assert.ok(bin !== undefined, "the checkout's own nemia");
      const searched = process.env.PATH;
      process.env.PATH = ['/usr/local/bin', bin, '/usr/bin'].join(path.delimiter);
      try {
        assert.deepEqual(await beat(), ['file']);
      } finally {
        process.env.PATH = searched;
      }
      const spec = b.specs.at(-1) as unknown as { id: string; cwd: string; restartPolicy: string; config: Record<string, unknown> };
      assert.equal(spec.id, set.task);
      assert.equal(spec.cwd, nemiaDir());
      assert.equal(spec.restartPolicy, 'Always');
      const shipped = readNemia();
      assert.equal(spec.config.permissionMode, 'auto');
      assert.equal(spec.config.background, true);
      assert.deepEqual(spec.config.disallowedTools, shipped.disallowedTools);
      assert.deepEqual(spec.config.mounts, [{ path: repo, readOnly: true }], "every factory's folders, read-only");
      assert.equal('closeoutSchema' in spec || 'closeoutSchema' in spec.config, false, 'no closeout: she never ends');
      assert.ok((spec.config.allowedTools as string[]).includes(`Edit(/${memoryDir()}/**)`), 'her memory hers to write');
      assert.ok((spec.config.allowedTools as string[]).includes('Bash(curl -s http://127.0.0.1:8787/api/quota)'), 'the quota hers to read');
      assert.match((spec as unknown as { brief: string }).brief, /`curl -s http:\/\/127\.0\.0\.1:8787\/api\/quota`/);
      const own = spec.config[DEFAULT_HARNESS] as { remoteControl: boolean; appendSystemPromptFile: string; settings: string };
      assert.equal(own.remoteControl, true);
      const settings = JSON.parse(own.settings) as { permissions: { ask: string[]; deny: string[] }; env: Record<string, string> };
      assert.equal(settings.env.PATH, [bin, '/usr/local/bin', '/usr/bin'].join(path.delimiter), "the daemon's own bin first, and once");
      assert.equal(settings.env.NEMIA_DAEMON_START, 'off', 'a nemia she types starts no daemon beside the one that keeps her');
      const fence = nemiaFence(TABLE);
      assert.deepEqual(
        settings.permissions.ask,
        fence.ask.filter((rule) => rule !== 'Bash(nemia cancel:*)'),
        'her asks, derived from the table, less the prompt the person allowed in her folder',
      );
      const denies = settings.permissions.deny;
      assert.deepEqual(denies.slice(0, fence.deny.length), fence.deny, 'tick and up out of her reach');
      assert.ok(fence.deny.includes('Bash(nemia tick:*)') && fence.deny.includes('Bash(nemia up:*)'));
      assert.ok(denies.includes(`Edit(/${path.join(ROOT, 'brand-new')}/**)`), 'a folder the store gained is denied');
      assert.ok(denies.includes(`Edit(/${path.join(ROOT, 'daemon.json')})`), 'a file at the store top is denied');
      assert.ok(
        [levelFile(), promptFile(), toldFile()].every((file) => denies.includes(`Edit(/${file})`)),
        'her level, her instruction and the record of the words she was told are denied',
      );
      assert.deepEqual(
        [...settings.permissions.ask, ...denies].filter((rule) => rule.startsWith(`Edit(/${nemiaDir()}`)),
        [`Edit(/${levelFile()})`, `Edit(/${promptFile()})`, `Edit(/${toldFile()})`, `Edit(/${chatDir(nemiaDir())}/**)`],
        "her memory is denied and asked by no rule, and the person's chat files are denied",
      );
      assert.ok(
        stopsFile(nemiaDir()).startsWith(`${chatDir(nemiaDir())}${path.sep}`),
        'the stop marker her chat draws is one of those files: the record of a turn the person ended is theirs, never hers to write',
      );
      for (const rule of fence.allow) assert.ok((spec.config.allowedTools as string[]).includes(rule), `${rule} allowed`);
      assert.deepEqual(
        spec.config.callAdmission,
        { command: [path.join(bin, 'nemia'), 'admit', '--at-least', 'semi-auto', '--auto', 'nemia'], tools: ['Bash'] },
        "her shell calls admitted by the daemon's own nemia",
      );
      assert.equal(own.appendSystemPromptFile, promptFile());
      const prompt = fs.readFileSync(promptFile(), 'utf8');
      assert.ok(prompt.startsWith(shipped.body.trim().slice(0, 40)), 'her shipped instruction first');
      assert.ok(prompt.trimEnd().endsWith('Answer in French. Times in Montreal.'), "the person's words last");
    },
  );
  await s.test(
    'her task is subscribed once it is open, with her floor, and owes nothing on the next beat; nemia level says her spend and reach',
    async () => {
      const b = stage.board();
      assert.deepEqual(await beat(), ['subscribe']);
      assert.deepEqual(
        listSubscriptions().map((one) => [one.name, one.subscription.task]),
        [['nemia', first]],
      );
      assert.deepEqual(
        listSubscriptions()[0].subscription.selectors,
        ['waits=person', 'reason=ToolDenied'],
        "the lines that wait on a person, and a step's denied calls",
      );
      assert.deepEqual(listSubscriptions()[0].subscription.scope, { atLeast: 'semi-auto' }, 'told of no factory left alone');
      assert.deepEqual(await beat(), [], 'level-triggered: nothing filed again');
      assert.equal(b.filings.filter((id) => id === first).length, 1);
      const status = await level({});
      assert.equal(status.level, 'semi-auto');
      assert.deepEqual(status.allows, ['Bash(nemia cancel:*)', 'Bash(nemia approve:*)'], 'what the person allowed in her folder, shown');
      assert.deepEqual(status.spend, { usd: 0.42, measured: 1, unmeasured: 0 });
      assert.ok(LEVEL.print(status, {}).includes('spent $0.42 over 1 session ended; her open one counts once it ends'));
      assert.equal(status.reach[0], `${DEFAULT_HARNESS} attach 01234567`);
      const again = (await level({ level: 'semi-auto' })) as { task: string };
      assert.equal(again.task, first, 'semi-auto again keeps her open task');
    },
  );
  await s.test(
    'a task stopped from outside is never filed again, and semi-auto then starts a fresh one; manual stops and unsubscribes',
    async () => {
      const b = stage.board();
      b.settle(first, 'stopped');
      assert.deepEqual(await beat(), ['drop']);
      assert.deepEqual(await beat(), [], 'never filed again');
      assert.equal(((await level({})) as { stopped: boolean }).stopped, true);
      t.mock.timers.tick(2);
      const fresh = (await level({ level: 'semi-auto' })) as { task: string };
      assert.notEqual(fresh.task, first);
      assert.deepEqual(await beat(), ['file']);
      assert.deepEqual(await beat(), ['subscribe']);
      await level({ level: 'manual' });
      assert.equal(readLevel()?.task, fresh.task, 'manual keeps the task named, for the keeper to stop');
      assert.deepEqual(await beat(), ['stop', 'drop']);
      assert.ok(b.stopped.includes(fresh.task));
      assert.deepEqual(listSubscriptions(), []);
      assert.deepEqual(await beat(), []);
    },
  );
  await s.test('nemia memory lists her facts and prints one; a fact she does not keep is refused, naming those she does', async () => {
    fs.mkdirSync(memoryDir(), { recursive: true });
    fs.writeFileSync(path.join(memoryDir(), 'feed-cursor'), '1234\n');
    fs.writeFileSync(path.join(memoryDir(), '.hidden'), 'no fact');
    assert.deepEqual(MEMORY.print((await stage.runWith(viewed(), MEMORY.handler({}))) as never, {}), [
      `Nemia keeps 1 fact in ${memoryDir()}:`,
      '  feed-cursor',
    ]);
    assert.deepEqual(MEMORY.print((await stage.runWith(viewed(), MEMORY.handler({ fact: 'feed-cursor' }))) as never, {}), ['1234']);
    names(
      await refusal(() => stage.runWith(viewed(), MEMORY.handler({ fact: '../level.json' }))),
      'no fact named ../level.json',
      'feed-cursor',
    );
  });
});

test('A factory raised for a stretch keeps her, the store at manual; its end passing stops her with no write; an end, a default, an untrusted folder', async (t) => {
  const s = story(t);
  mockedAt(t, '2026-10-06T08:00:00.000Z');
  await s.test("a factory raised for an hour keeps her; once the raise's end passes she is stopped, with no write", async () => {
    withPipao();
    const raised = await level({ factory: 'pipao', level: 'semi-auto', for: '1h' });
    assert.equal(raised.level, 'manual', "the store's own level is untouched");
    const pipao = raised.factories.find((row) => row.factory === 'pipao');
    assert.equal(pipao?.level, 'semi-auto');
    assert.equal(pipao.default, 'manual');
    assert.equal(pipao.raise?.until, '2026-10-06T09:00:00.000Z', 'raised for an hour');
    assert.ok(LEVEL.print(raised, {}).includes(`  pipao: semi-auto until 2026-10-06T09:00:00.000Z, then manual (the store's)`));
    assert.deepEqual(await beat(), ['file']);
    assert.deepEqual(await beat(), ['subscribe']);
    assert.deepEqual(await beat(), []);
    const written = [levelFile(), factoryLevelFile('pipao')].map((f) => fs.readFileSync(f, 'utf8'));
    t.mock.timers.setTime(Date.parse('2026-10-06T10:00:00.000Z'));
    assert.deepEqual(await beat(), ['stop', 'drop'], 'none above manual once the raise has passed');
    assert.deepEqual(
      [levelFile(), factoryLevelFile('pipao')].map((f) => fs.readFileSync(f, 'utf8')),
      written,
      'level-triggered: the raise reads as gone, with no write',
    );
    const after = await level({});
    assert.deepEqual(after.factories.find((row) => row.factory === 'pipao')?.raise, null);
  });
  await s.test('a raise ended early stops her at the next beat; a raise to a level the factory has by default is refused', async () => {
    t.mock.timers.tick(1);
    const raised = await level({ factory: 'pipao', level: 'semi-auto', for: '2h' });
    assert.deepEqual(await beat(), ['file']);
    const ended = await level({ factory: 'pipao', end: true });
    assert.equal(ended.task, raised.task, 'the task stays named, for the keeper to stop');
    assert.deepEqual(ended.factories.find((row) => row.factory === 'pipao')?.raise, null);
    assert.equal(fs.existsSync(factoryLevelFile('pipao')), false, 'a factory with no level of its own follows the store');
    assert.deepEqual(await beat(), ['stop']);
    t.mock.timers.tick(1);
    await level({ factory: 'pipao', level: 'semi-auto' });
    assert.deepEqual(await beat(), ['file'], "a factory's own default above manual keeps her");
    names(await refusal(() => level({ factory: 'pipao', level: 'semi-auto', for: '1h' })), 'pipao is at semi-auto by default');
    await level({ factory: 'pipao', level: 'manual' });
    assert.deepEqual(await beat(), ['stop']);
  });
  await s.test(
    "a factory's raise or default above manual while her folder is not trusted is written, and files her only once it is",
    async () => {
      fs.rmSync(levelFile(), { force: true });
      fs.rmSync(factoryLevelFile('pipao'), { force: true });
      trust(false);
      const b = stage.board();
      const asks: Record<string, string>[] = [
        { factory: 'pipao', level: 'semi-auto', for: '1h' },
        { factory: 'pipao', level: 'semi-auto' },
      ];
      for (const ask of asks) {
        t.mock.timers.tick(1);
        const set = await level(ask);
        assert.equal(set.factories.find((row) => row.factory === 'pipao')?.level, 'semi-auto', JSON.stringify(ask));
        assert.ok(fs.existsSync(factoryLevelFile('pipao')), `${JSON.stringify(ask)} writes the factory's file`);
        assert.equal(readLevel()?.task, set.task, `${JSON.stringify(ask)} names her task`);
        assert.equal(set.trust, `mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`);
        const filings = b.filings.length;
        assert.deepEqual(await beat(), [], `${JSON.stringify(ask)}: her session waits`);
        assert.equal(b.filings.length, filings);
      }
      trust(true);
      assert.deepEqual(await beat(), ['file']);
      await level({ factory: 'pipao', level: 'manual' });
      assert.deepEqual(await beat(), ['stop']);
    },
  );
});

test("Kept, she is told what changed: the person's custom words once, never by a filing or a stop, and their chat words once she is live", async (t) => {
  const s = story(t);
  mockedAt(t, '2026-10-07T08:00:00.000Z');
  fs.rmSync(customInstructionsFile(ROOT, 'nemia'), { force: true });
  await s.test('a custom instruction written while she is kept is told to her open task, never by a filing or a stop', async () => {
    const b = stage.board();
    const task = await keptAnew(t);
    const [filings, stops, told] = [b.filings.length, b.stopped.length, b.said.length];
    writeCustom('Answer in Spanish.\n');
    assert.deepEqual(await beat(), ['tell']);
    assert.deepEqual(
      b.said.slice(told).map((one) => one.taskId),
      [task],
      'told once, to her open task',
    );
    assert.ok(b.said.at(-1)!.text.includes('Answer in Spanish.'), b.said.at(-1)!.text);
    assert.equal(b.filings.length, filings, 'never filed again');
    assert.equal(b.stopped.length, stops, 'never stopped');
    assert.ok(fs.readFileSync(promptFile(), 'utf8').trimEnd().endsWith('Answer in Spanish.'), 'her filed instruction now holds them');
    assert.deepEqual(await beat(), [], 'told once: level-triggered off the record of what she was told');
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    assert.deepEqual(await beat(), ['tell']);
    assert.match(b.said.at(-1)!.text, /removed their custom instruction/);
    assert.equal(fs.readFileSync(promptFile(), 'utf8'), `${readNemia().body.trim()}\n`, 'her shipped instruction alone');
    assert.deepEqual(await beat(), []);
    assert.equal(b.said.length, told + 2);
  });
  await s.test("the person's chat words are delivered once she is kept and her session is live, and once only", async () => {
    const b = stage.board();
    const task = await keptAnew(t);
    const told = b.said.length;
    appendOutbox(nemiaDir(), { id: 'kept-o1', at: new Date().toISOString(), text: 'Hi' });
    assert.deepEqual(await beat(), [], 'kept, her session not live: kept for later');
    b.settle(task, 'running (working)');
    assert.deepEqual(await beat(), ['deliver']);
    assert.deepEqual(
      b.said.slice(told).map((one) => [one.taskId, one.text]),
      [[task, framedForHer('Hi')]],
    );
    assert.deepEqual(await beat(), [], 'delivered once: level-triggered off the marks');
  });
  await s.test(
    'REFUSED: a tell the runtime refuses leaves her filed instruction and what she was told as they were, owed again on the next beat',
    async () => {
      const b = stage.board();
      const task = await keptAnew(t);
      const filed = fs.readFileSync(promptFile(), 'utf8');
      const record = fs.readFileSync(toldFile(), 'utf8');
      const told = b.said.length;
      writeCustom('Answer in German.\n');
      b.refuseSay(1);
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'not running yet');
        return true;
      });
      assert.equal(fs.readFileSync(promptFile(), 'utf8'), filed, 'nothing written of words she was not told');
      assert.equal(fs.readFileSync(toldFile(), 'utf8'), record, 'nothing recorded of words she was not told');
      assert.equal(b.said.length, told);
      assert.deepEqual(await beat(), ['tell'], 'owed again');
      assert.deepEqual(
        b.said.slice(told).map((one) => one.taskId),
        [task],
      );
      assert.ok(fs.readFileSync(promptFile(), 'utf8').trimEnd().endsWith('Answer in German.'));
      assert.deepEqual(await beat(), []);
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    },
  );
  await s.test(
    'REFUSED: custom words that do not read are told to no one while she is kept, naming the clear; a stop at manual is never held by them',
    async () => {
      const b = stage.board();
      await keptAnew(t);
      const filed = fs.readFileSync(promptFile(), 'utf8');
      const told = b.said.length;
      writeCustom('---\ntools: Bash\n---\nUse Bash.\n');
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'nemia agents custom nemia --clear');
        return true;
      });
      assert.equal(b.said.length, told, 'told nothing');
      assert.equal(fs.readFileSync(promptFile(), 'utf8'), filed);
      await level({ level: 'manual' });
      assert.deepEqual(await beat(), ['stop', 'drop'], 'stopped all the same');
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    },
  );
  await s.test('REFUSED: her shipped instruction changed while she is kept tells her nothing, with custom words or with none', async () => {
    const b = stage.board();
    await keptAnew(t);
    const told = b.said.length;
    fs.writeFileSync(promptFile(), 'An older instruction of hers.\n');
    assert.deepEqual(await beat(), [], 'no custom words then or now: nothing to tell');
    assert.equal(b.said.length, told, 'never told she removed words she never had');
    writeCustom('Answer in Dutch.\n');
    assert.deepEqual(await beat(), ['tell'], 'the words changed: told');
    fs.writeFileSync(promptFile(), 'An older instruction of hers.\n\nAnswer in Dutch.\n');
    assert.deepEqual(await beat(), [], 'the same words, under another instruction: nothing to tell');
    assert.equal(b.said.length, told + 1);
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
  });
  await s.test(
    'a session kept before the keeper recorded what she was told is judged by the words her instruction ends with, never told a removal',
    async () => {
      const b = stage.board();
      writeCustom('Answer in Italian.\n');
      await keptAnew(t);
      const told = b.said.length;
      fs.rmSync(toldFile());
      assert.deepEqual(await beat(), [], 'her instruction ends with the words as they read: nothing to tell');
      writeCustom('Answer in Greek.\n');
      assert.deepEqual(await beat(), ['tell'], 'other words than those she was filed with: told');
      assert.equal(fs.readFileSync(toldFile(), 'utf8'), '{"words":"Answer in Greek."}\n', 'and recorded');
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
      fs.rmSync(toldFile());
      assert.deepEqual(await beat(), [], 'no words, and none known told: no removal owed');
      assert.equal(b.said.length, told + 1);
      fs.writeFileSync(toldFile(), '["not", "a record"]\n');
      assert.deepEqual(await beat(), [], 'a record that does not read is none');
    },
  );
  await s.test('her task filed with custom words records them, so their removal is told to her', async () => {
    const b = stage.board();
    writeCustom('Answer in Polish.\n');
    await keptAnew(t);
    assert.equal(fs.readFileSync(toldFile(), 'utf8'), '{"words":"Answer in Polish."}\n', 'filed with them');
    const told = b.said.length;
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    assert.deepEqual(await beat(), ['tell']);
    assert.match(b.said.at(-1)!.text, /removed their custom instruction/);
    assert.equal(b.said.length, told + 1);
    await level({ level: 'manual' });
    assert.deepEqual(await beat(), ['stop', 'drop']);
  });
});

test('`nemia level` refuses a level that is none, a factory write that names no factory or the default one, a raise of nothing and an end of none', async (t) => {
  withPipao();
  fs.rmSync(factoryLevelFile('pipao'), { force: true });
  const check = (args: Record<string, string | boolean>) => LEVEL.check?.(args) ?? null;
  for (const [args, facts] of [
    [{ level: 'on' }, ['"on" is no level']],
    [{ level: 'semi-auto', for: '2h' }, ['--for and --end take the factory raised', '--factory <name>']],
    [{ factory: 'pipao', end: true, for: '2h' }, ['give one']],
    [{ factory: 'pipao', for: '2h' }, ['--for takes the level', 'nemia level semi-auto --factory pipao']],
    [{ factory: 'pipao', level: 'manual', end: true }, ['--end takes no level']],
    [{ factory: 'default', level: 'semi-auto' }, [': nemia level semi-auto.']],
    ...['0h', '-1h', '2x', '8d'].map(
      (stretch) => [{ factory: 'pipao', level: 'semi-auto', for: stretch }, [stretch, 'is not one']] as const,
    ),
  ] as const)
    await t.test(`REFUSED by its check: ${JSON.stringify(args)}`, () => {
      names(check(args), ...facts);
    });
  const passing: Record<string, string>[] = [{ level: 'auto' }, { level: 'manual' }, { factory: 'pipao', level: 'semi-auto', for: '90m' }];
  for (const args of passing)
    await t.test(`passes its check: ${JSON.stringify(args)}`, () => {
      assert.equal(check(args), null);
    });
  await t.test('REFUSED at exit 2: a factory that is none, naming the command that lists them', async () => {
    names(await refusal(() => level({ factory: 'nope', level: 'semi-auto', for: '1h' })), 'no factory is named nope', 'nemia factory ls');
  });
  await t.test('REFUSED at exit 2: an end of no raise in force', async () => {
    names(await refusal(() => level({ factory: 'pipao', end: true })), 'pipao has no raise in force to end');
  });
  await t.test(
    'REFUSED at exit 2: a raise to the level the factory has by default raises nothing, naming the command that sets it',
    async () => {
      const nothing = await refusal(() => level({ factory: 'pipao', level: 'manual', for: '1h' }));
      names(nothing, 'pipao is at manual by default', 'raises nothing', 'nemia level manual --factory pipao');
    },
  );
  await t.test('nothing is written of a write refused', () => {
    assert.equal(fs.existsSync(factoryLevelFile('pipao')), false, 'nothing written');
  });
});
