/**
 * Nemia kept, let go and talked to, told as a person's stories on the stage (`story.ts`): `nemia level` written while her folder is not
 * trusted and the keeper trusting it and filing her in one beat, and a harness's file that does not read leaving her unfiled, in words
 * naming the fix; the keeper's shipped five-second rest, on a steered clock; her task filed long-lived in her folder in auto, by her
 * shipped definition and the person's custom words, with the daemon's own bin first on her path, her fence derived from the table, her
 * admission and a deny on the store but her folder, subscribed once with her floor and owed nothing on the next beat; a stop from outside
 * marked and filed again only once the person speaks, continuing her last session, and manual ending her operating while the
 * conversation goes on. A factory raised for a stretch keeps her operating until the raise's end passes. Kept, she is told the person's
 * changed custom words once, and their chat words once she is live. In conversation, a message on a fresh store files her at manual, she
 * is put to rest once the conversation has been quiet fifteen minutes, never while operating, and the next message files a task that
 * continues her session; an older store's task is adopted. And the table of what `nemia level` refuses, and her task's mounts, from a
 * factory whose volume has its switches set, taken by the runtime's own check of a filed task's arguments (`argsRefusalOf`).
 *
 * Over the engine's stand-in, its `view` laid over to say each task's spend, and a scratch store of its own, at `ROOT`, given as `ENV`,
 * and a config folder of its own for the harness. Each story mocks `Date` at a moment written as a literal, so her task's id,
 * named for the moment she is filed, a raise's end and the quiet before her rest are the story's own. What the keeper owes on a beat is
 * the laws of `contracts/nemia-keep.contract.ts`; the stretches and what a write asks, `src/level/level.test.ts`.
 */
import { beforeAll, describe, test, vi } from 'vitest';
import { heldDate, teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import { argsRefusalOf, type TaskView } from 'agent-runtime';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { until } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';
import { keep, keepOnce, nemiaSpec } from '../src/nemia/keep.verb.ts';
import { LEVEL } from '../src/nemia/level.verb.ts';
import { typed } from './typed.ts';
import { MEMORY } from '../src/nemia/memory.verb.ts';
import { appendOutbox, chatDir, stopsFile } from '../src/chat/chat.store.ts';
import { framedFor } from '../src/chat/chat.ts';
import {
  herTasks,
  levelFile,
  memoryDir,
  nemiaChatPlace,
  nemiaDir,
  ownBin,
  promptFile,
  readLevel,
  readNemia,
  readSession,
  sessionFile,
  toldFile,
  untrustedFile,
  writeLevel,
} from '../src/nemia/level.store.ts';
import { listSubscriptions } from '../src/subscription/subscription.store.ts';
import { StoreRoot } from '../src/config/root.store.ts';
import { customInstructionsFile } from '../src/agents/read.store.ts';
import { AgentDoor } from '../src/agents/agent-door.store.ts';
import { agentDoorMemory } from '../src/agents/agent-memory.store.ts';
import { AgentName } from '../src/agents/agents.model.ts';
import { addFactoryAt, dropRecord, factoryNamesAt, readFactoriesAt, recordText, rewriteFactoryAt } from '../testing.ts';
import { levelKey } from '../src/factory/door/index.ts';
import { DEFAULT_HARNESS } from '../src/harness/harness.ts';
import { nemiaFence } from '../src/admission/index.ts';
import { TABLE } from '../src/command/commands.verb.ts';
import { CLI_VERBS } from '../src/command/command.ts';
import { engineOf, over, runWith } from '../src/runtime-client.ts';
import { SESSION_TOKEN } from '../src/filed/filed.ts';
import { readToken } from '../src/token/token.store.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-nemia-keeper-');
const CONFIG = scratch('wf-nemia-keeper-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const stage = staged({ runWith, main: typed, engineOf, env: ENV });

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
    JSON.stringify({ projects: { [nemiaDir(ROOT)]: { hasTrustDialogAccepted: trusted } } }),
  );

/** The factory `pipao` in the store and her folder trusted: a story of a factory's level starts from it. */
const withPipao = () => {
  trust(true);
  if (!factoryNamesAt(ROOT).includes('pipao'))
    addFactoryAt(ROOT, { name: 'pipao', volumes: [fs.mkdtempSync(path.join(ROOT, 'repo-'))].map((r) => `${r}:rw`) });
};

/** The person's custom words for her written, their folder made where none was. */
const writeCustom = (words: string) => {
  fs.mkdirSync(path.dirname(customInstructionsFile(ROOT, 'nemia')), { recursive: true });
  fs.writeFileSync(customInstructionsFile(ROOT, 'nemia'), words);
};

/** The message `f` refuses with, at exit 2. */
const refusal = async (f: () => Promise<unknown>) => {
  try {
    await f();
  } catch (err) {
    assert.equal((err as { exitCode?: number }).exitCode, 2, String(err));
    return (err as Error).message;
  }
  assert.fail('no refusal');
};

/** Her current task, the last of the keeper's record; empty where she has none. */
const herTask = () => herTasks(ROOT).at(-1) ?? '';

/**
 * Her let go in the story told in `t`: every level at manual, her open task stopped from outside, and the keeper's beats run until it
 * owes nothing — her subscription dropped and her end marked — then a moment passed, so a word of the person's comes after the mark.
 */
const letGo = async () => {
  await level({ level: 'manual' });
  const b = stage.board();
  const task = b.tasks.get(herTask());
  if (task !== undefined && !['succeeded', 'failed', 'stopped'].includes(task.phase)) b.settle(herTask(), 'stopped');
  for (let i = 0; i < 4 && (await beat()).length > 0; i++);
  assert.deepEqual(await beat(), [], 'let go: nothing owed');
  vi.advanceTimersByTime(1);
};

/**
 * Her task kept anew in the story told in `t`: any she has let go, then the store's level at semi-auto, a moment later, a fresh task
 * filed, subscribed and at work. Its id.
 */
const keptAnew = async () => {
  withPipao();
  await letGo();
  vi.advanceTimersByTime(2);
  await level({ level: 'semi-auto' });
  assert.deepEqual(await beat(), ['file']);
  const task = herTask();
  assert.deepEqual(await beat(), ['subscribe']);
  assert.deepEqual(await beat(), []);
  stage.board().settle(task, 'starting');
  return task;
};

describe("Nemia kept and let go: trusted late, filed long-lived in auto with the daemon's bin first, subscribed once, stopped from outside, let go at manual", () => {
  heldDate(Date.parse('2026-10-05T16:00:00.000Z'));
  const s = story(test);
  let first = '';
  s.test('no level set owes nothing, trusted or not: the keeper writes no level', async () => {
    for (const trusted of [false, true]) {
      trust(trusted);
      assert.deepEqual(await beat(), [], 'no level set owes nothing, trusted or not');
      assert.equal(fs.existsSync(levelFile(ROOT)), false, 'never automatic: the keeper writes no level');
    }
  });
  s.test('semi-auto while her folder is not trusted: the keeper trusts it and files her in the same beat, no person asked', async () => {
    const config = path.join(CONFIG, `.${DEFAULT_HARNESS}.json`);
    fs.rmSync(config);
    fs.rmSync(nemiaDir(ROOT), { recursive: true, force: true });
    const set = await level({ level: 'semi-auto' });
    assert.equal(set.level, 'semi-auto');
    assert.equal(set.task, null, 'no task named by the level: the keeper names her tasks');
    assert.equal(readLevel(ROOT)?.task, undefined);
    assert.equal(set.untrusted, null, 'nothing refused, nothing for a person to do');
    assert.ok(!('trust' in set), 'no command is answered');
    const b = stage.board();
    const filings = b.filings.length;
    assert.deepEqual(await beat(), ['trust', 'file'], 'her folder trusted, then her session filed, in one beat');
    assert.deepEqual(b.filings.slice(filings), [herTask()]);
    assert.deepEqual(readSession(ROOT)?.tasks, [herTask()], "the keeper's record names her task");
    assert.equal(fs.statSync(nemiaDir(ROOT)).isDirectory(), true, 'her folder made');
    assert.equal(
      (JSON.parse(fs.readFileSync(config, 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted?: boolean }> }).projects[
        nemiaDir(ROOT)
      ]?.hasTrustDialogAccepted,
      true,
      "the trust written in the harness's own file",
    );
    assert.equal((await level({})).untrusted, null);
    await letGo();
    fs.rmSync(levelFile(ROOT));
  });
  s.test(
    "REFUSED: a harness's file that does not read leaves her untrusted and unfiled, in words naming the fix and no command; mended, the next beat trusts and files her",
    async () => {
      const config = path.join(CONFIG, `.${DEFAULT_HARNESS}.json`);
      fs.writeFileSync(config, '{ not json');
      vi.advanceTimersByTime(1);
      await level({ level: 'semi-auto' });
      const b = stage.board();
      const filings = b.filings.length;
      assert.deepEqual(await beat(), [], 'the trust refused: nothing done, nothing filed');
      assert.deepEqual(await beat(), [], 'asked again each beat, and refused again');
      assert.equal(b.filings.length, filings, 'nothing filed where her harness would refuse its start');
      assert.equal(fs.readFileSync(config, 'utf8'), '{ not json', "the harness's file left as it was");
      const words = (await level({})).untrusted;
      assert.ok(words !== null && words.includes(config), `the refusal names the file to mend: ${String(words)}`);
      assert.match(words, /not JSON/, "and the runtime's reason");
      assert.doesNotMatch(words, /&&|\bcd |mkdir|accept its prompt/, 'no command to run the harness by hand');
      fs.rmSync(config);
      assert.deepEqual(await beat(), ['trust', 'file'], 'mended: trusted and filed at the next beat, with no second level set');
      assert.deepEqual(b.filings.slice(filings), [herTask()]);
      assert.equal((await level({})).untrusted, null, 'trusted: nothing said');
      trust(false);
      assert.equal((await level({})).untrusted, null, 'a trust taken back by hand, with nothing refused, is no refusal');
      trust(true);
      await letGo();
      fs.rmSync(levelFile(ROOT));
    },
  );
  s.test(
    'REFUSED at shipped defaults: a level set after a beat files her task not before five seconds, and at the next beat',
    async (sub) => {
      const b = stage.board();
      const clock = stage.clock();
      const keeper = Effect.runFork(over(viewed())(keep()).pipe(Effect.provide(clock.layer), Effect.provideService(StoreRoot, ROOT)));
      const stopped = () => Effect.runPromise(Fiber.interrupt(keeper));
      try {
        await until(sub, () => clock.asked.length === 1, 'the first beat done', { bell: clock.bell });
        assert.deepEqual(clock.asked, [5_000], 'the keeper rests the shipped five seconds');
        vi.advanceTimersByTime(1);
        const filings = b.filings.length;
        await level({ level: 'semi-auto' });
        await clock.adjust(4_999);
        assert.deepEqual([clock.woken, b.filings.length], [[], filings], 'a millisecond early, no beat');
        await clock.adjust(1);
        await until(sub, () => clock.asked.length === 2, 'the second beat done', { bell: clock.bell });
        assert.deepEqual(b.filings.slice(filings), [herTask()], 'filed by the beat at five seconds');
      } finally {
        await stopped();
      }
      await letGo();
      fs.rmSync(levelFile(ROOT));
    },
  );
  s.test(
    "at semi-auto the keeper files her task long-lived in auto, the daemon's bin first on her path, every store write asked but her memory",
    async () => {
      const b = stage.board();
      writeCustom('Answer in French. Times in Montreal.\n');
      const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
      addFactoryAt(ROOT, { name: 'pipao', volumes: [repo].map((r) => `${r}:rw`) });
      const daemon = {
        pid: process.pid,
        by: 'api',
        url: 'http://127.0.0.1:8787',
        startedAt: '2026-10-05T15:00:00.000Z',
        cwd: ROOT,
        every: 2000,
      };
      fs.writeFileSync(path.join(ROOT, 'daemon.json'), JSON.stringify(daemon));
      vi.advanceTimersByTime(1);
      const set = await level({ level: 'semi-auto' });
      assert.equal(set.rests, true, 'not filed until the keeper beats');
      fs.mkdirSync(path.join(ROOT, 'brand-new'));
      const local = path.join(nemiaDir(ROOT), CONFIG_FOLDERS[0], 'settings.local.json');
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
      first = herTask();
      const spec = b.specs.at(-1) as unknown as { id: string; cwd: string; restartPolicy: string; config: Record<string, unknown> };
      assert.equal(spec.id, first);
      assert.equal(spec.cwd, nemiaDir(ROOT));
      assert.equal(spec.restartPolicy, 'Always');
      const shipped = readNemia();
      assert.equal(spec.config.permissionMode, 'auto');
      assert.equal('background' in spec.config, false, 'a long-lived session is its restart policy, on the Agent SDK');
      assert.equal(spec.config.mayAsk, true);
      assert.deepEqual(spec.config.disallowedTools, shipped.disallowedTools);
      assert.deepEqual(spec.config.mounts, [{ path: repo, readOnly: true }], "every factory's folders, read-only");
      assert.equal('closeoutSchema' in spec || 'closeoutSchema' in spec.config, false, 'no closeout: she never ends');
      assert.ok((spec.config.allowedTools as string[]).includes(`Edit(/${memoryDir(ROOT)}/**)`), 'her memory hers to write');
      const allowed = spec.config.allowedTools as string[];
      assert.ok(allowed.includes('Bash(nemia quota)'), 'the quota hers to read, by its verb');
      assert.ok(allowed.includes('Bash(nemia decide)'), 'the verbs the api serves beside the table are in her fence');
      const reads = ['get', 'explain', 'library', 'lines', 'server version', 'server upgrades', 'capabilities', 'repository', 'store'];
      for (const name of [...reads, 'milestones', 'factory commands', 'factory server sign-in', 'workflows keys'])
        assert.ok(allowed.includes(`Bash(nemia ${name}:*)`), `nemia ${name} hers to read, by its verb`);
      const curls = allowed.filter((rule) => /^Bash\(curl\b/.test(rule));
      assert.deepEqual(curls, [], 'no call of hers reaches the api but through a verb');
      const token = (spec.config.env as Record<string, string>)[SESSION_TOKEN] ?? '';
      assert.match(token, /^[A-Za-z0-9_-]{43}$/, 'her session token in her environment');
      assert.deepEqual(readToken(ROOT, token), { agent: 'nemia', factory: null, run: null, step: null, attempt: 1, task: first });
      const brief = (spec as unknown as { brief: string }).brief;
      assert.match(brief, /`nemia quota`/);
      assert.ok(!brief.includes('curl') && !brief.includes('/api/'), 'her brief hands her no call of the api but a verb');
      assert.match((spec as unknown as { brief: string }).brief, /feed/, 'operating: told the feed is said to her');
      const own = spec.config[DEFAULT_HARNESS] as { remoteControl: boolean; appendSystemPromptFile: string; settings: string };
      assert.equal(own.remoteControl, true);
      const settings = JSON.parse(own.settings) as { permissions: { ask: string[]; deny: string[] }; env: Record<string, string> };
      assert.equal(settings.env.PATH, [bin, '/usr/local/bin', '/usr/bin'].join(path.delimiter), "the daemon's own bin first, and once");
      assert.equal(settings.env.NEMIA_DAEMON_START, 'off', 'a nemia she types starts no daemon beside the one that keeps her');
      const fence = nemiaFence([...TABLE, ...CLI_VERBS]);
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
        [levelFile(ROOT), promptFile(ROOT), toldFile(ROOT), untrustedFile(ROOT), sessionFile(ROOT)].every((file) =>
          denies.includes(`Edit(/${file})`),
        ),
        "her level, her instruction and the keeper's records of the words she was told, of a trust refused and of her session are denied",
      );
      assert.deepEqual(
        [...settings.permissions.ask, ...denies].filter((rule) => rule.startsWith(`Edit(/${nemiaDir(ROOT)}`)),
        [
          `Edit(/${levelFile(ROOT)})`,
          `Edit(/${promptFile(ROOT)})`,
          `Edit(/${toldFile(ROOT)})`,
          `Edit(/${untrustedFile(ROOT)})`,
          `Edit(/${sessionFile(ROOT)})`,
          `Edit(/${chatDir(nemiaDir(ROOT))}/**)`,
        ],
        "her memory is denied and asked by no rule, and the person's chat files are denied",
      );
      assert.ok(
        stopsFile(nemiaDir(ROOT)).startsWith(`${chatDir(nemiaDir(ROOT))}${path.sep}`),
        'the stop marker her chat draws is one of those files: the record of a turn the person ended is theirs, never hers to write',
      );
      for (const rule of fence.allow) assert.ok((spec.config.allowedTools as string[]).includes(rule), `${rule} allowed`);
      assert.deepEqual(
        spec.config.callAdmission,
        { command: [path.join(bin, 'nemia'), 'admit', '--at-least', 'semi-auto', '--auto', 'nemia'], tools: ['Bash'] },
        "her shell calls admitted by the daemon's own nemia",
      );
      assert.equal(own.appendSystemPromptFile, promptFile(ROOT));
      const prompt = fs.readFileSync(promptFile(ROOT), 'utf8');
      assert.ok(prompt.startsWith(shipped.body.trim().slice(0, 40)), 'her shipped instruction first');
      assert.ok(prompt.trimEnd().endsWith('Answer in French. Times in Montreal.'), "the person's words last");
    },
  );
  s.test(
    'her task is subscribed once it is open, with her floor, and owes nothing on the next beat; nemia level says her spend and reach',
    async () => {
      const b = stage.board();
      assert.deepEqual(await beat(), ['subscribe']);
      assert.deepEqual(
        listSubscriptions(ROOT).map((one) => [one.name, one.subscription.task]),
        [['nemia', first]],
      );
      assert.deepEqual(
        listSubscriptions(ROOT)[0].subscription.selectors,
        ['waits=person', 'reason=ToolDenied', 'reason=LevelChanged', 'reason=ConflictsPending'],
        "the lines that wait on a person, a step's denied calls, a factory's level changed and its conflicts pending",
      );
      assert.deepEqual(listSubscriptions(ROOT)[0].subscription.scope, { atLeast: 'semi-auto' }, 'told of no factory left alone');
      assert.deepEqual(await beat(), [], 'level-triggered: nothing filed again');
      assert.equal(b.filings.filter((id) => id === first).length, 1);
      const status = await level({});
      assert.equal(status.level, 'semi-auto');
      assert.deepEqual(status.allows, ['Bash(nemia cancel:*)', 'Bash(nemia approve:*)'], 'what the person allowed in her folder, shown');
      assert.deepEqual(status.spend, { usd: 0.42, measured: 1, unmeasured: 0 });
      assert.equal(status.reach[0], `${DEFAULT_HARNESS} attach 01234567`);
      const again = await level({ level: 'semi-auto' });
      assert.equal(again.task, first, 'semi-auto again keeps her open task');
    },
  );
  s.test(
    'a task stopped from outside is marked and not filed again; a level set then files one continuing her session; manual drops her subscription and keeps the conversation',
    async () => {
      const b = stage.board();
      b.settle(first, 'stopped');
      assert.deepEqual(await beat(), ['drop', 'markStopped']);
      assert.deepEqual(await beat(), [], 'not filed again until the person speaks');
      assert.equal((await level({})).stopped, true);
      vi.advanceTimersByTime(2);
      await level({ level: 'semi-auto' });
      assert.deepEqual(await beat(), ['file'], 'a level set after the stop is the person speaking');
      const fresh = herTask();
      assert.notEqual(fresh, first);
      assert.deepEqual(readSession(ROOT)?.tasks.slice(-2), [first, fresh], 'both her tasks, in order');
      assert.equal((b.specs.at(-1) as unknown as { resumeFrom?: string }).resumeFrom, '0123456789abcdef', 'her last session continued');
      assert.deepEqual(await beat(), ['subscribe']);
      await level({ level: 'manual' });
      assert.deepEqual(await beat(), ['drop'], 'operating ends at once');
      assert.ok(!b.stopped.includes(fresh), 'the conversation is not cut');
      assert.deepEqual(listSubscriptions(ROOT), []);
      assert.deepEqual(await beat(), []);
      await letGo();
    },
  );
  s.test('nemia memory lists her facts and prints one; a fact she does not keep is refused, naming those she does', async () => {
    fs.mkdirSync(memoryDir(ROOT), { recursive: true });
    fs.writeFileSync(path.join(memoryDir(ROOT), 'feed-cursor'), '1234\n');
    fs.writeFileSync(path.join(memoryDir(ROOT), '.hidden'), 'no fact');
    assert.deepEqual(await stage.runWith(viewed(), MEMORY.handler({})), { dir: memoryDir(ROOT), facts: ['feed-cursor'], fact: null });
    assert.deepEqual((await stage.runWith(viewed(), MEMORY.handler({ fact: 'feed-cursor' }))).fact, {
      name: 'feed-cursor',
      text: '1234\n',
    });
    names(
      await refusal(() => stage.runWith(viewed(), MEMORY.handler({ fact: '../level.json' }))),
      'no fact named ../level.json',
      'feed-cursor',
    );
  });
});

describe('A factory raised for a stretch keeps her, the store at manual; its end passing stops her with no write; an end, a default, an untrusted folder', () => {
  heldDate(Date.parse('2026-10-06T08:00:00.000Z'));
  const s = story(test);
  s.test("a factory raised for an hour keeps her; once the raise's end passes she stops operating, with no write", async () => {
    withPipao();
    const raised = await level({ factory: 'pipao', level: 'semi-auto', for: '1h' });
    assert.equal(raised.level, 'manual', "the store's own level is untouched");
    const pipao = raised.factories.find((row) => row.factory === 'pipao');
    assert.equal(pipao?.level, 'semi-auto');
    assert.equal(pipao.default, 'manual');
    assert.equal(pipao.raise?.until, '2026-10-06T09:00:00.000Z', 'raised for an hour');
    assert.equal(pipao.own, null, "it follows the store's level once its raise ends");
    assert.deepEqual(await beat(), ['file']);
    assert.deepEqual(await beat(), ['subscribe']);
    assert.deepEqual(await beat(), []);
    const written = [fs.readFileSync(levelFile(ROOT), 'utf8'), recordText(ROOT, levelKey('pipao'))];
    vi.setSystemTime(Date.parse('2026-10-06T10:00:00.000Z'));
    assert.deepEqual(await beat(), ['drop'], 'none above manual once the raise has passed: her subscription dropped');
    assert.deepEqual(
      [fs.readFileSync(levelFile(ROOT), 'utf8'), recordText(ROOT, levelKey('pipao'))],
      written,
      'level-triggered: the raise reads as gone, with no write',
    );
    const after = await level({});
    assert.deepEqual(after.factories.find((row) => row.factory === 'pipao')?.raise, null);
  });
  s.test('a raise ended early ends her operating at the next beat; a raise to a level the factory has by default is refused', async () => {
    vi.advanceTimersByTime(1);
    const raised = await level({ factory: 'pipao', level: 'semi-auto', for: '2h' });
    assert.deepEqual(await beat(), ['subscribe'], 'her task still open from the conversation: subscribed again');
    const ended = await level({ factory: 'pipao', end: true });
    assert.equal(ended.task, raised.task, 'her task is the same');
    assert.deepEqual(ended.factories.find((row) => row.factory === 'pipao')?.raise, null);
    assert.equal(recordText(ROOT, levelKey('pipao')) !== undefined, false, 'a factory with no level of its own follows the store');
    assert.deepEqual(await beat(), ['drop']);
    vi.advanceTimersByTime(1);
    await level({ factory: 'pipao', level: 'semi-auto' });
    assert.deepEqual(await beat(), ['subscribe'], "a factory's own default above manual keeps her");
    names(await refusal(() => level({ factory: 'pipao', level: 'semi-auto', for: '1h' })), 'pipao is at semi-auto by default');
    await level({ factory: 'pipao', level: 'manual' });
    assert.deepEqual(await beat(), ['drop']);
    await letGo();
  });
  s.test(
    "a factory's raise or default above manual while her folder is not trusted is written, and the keeper trusts it and files her at once",
    async () => {
      fs.rmSync(levelFile(ROOT), { force: true });
      dropRecord(ROOT, levelKey('pipao'));
      const b = stage.board();
      const asks: Record<string, string>[] = [
        { factory: 'pipao', level: 'semi-auto', for: '1h' },
        { factory: 'pipao', level: 'semi-auto' },
      ];
      for (const ask of asks) {
        trust(false);
        vi.advanceTimersByTime(1);
        const set = await level(ask);
        assert.equal(set.factories.find((row) => row.factory === 'pipao')?.level, 'semi-auto', JSON.stringify(ask));
        assert.ok(recordText(ROOT, levelKey('pipao')) !== undefined, `${JSON.stringify(ask)} writes the factory's level record`);
        assert.ok(readLevel(ROOT)?.asked !== undefined, `${JSON.stringify(ask)} says when the person set it`);
        assert.equal(set.untrusted, null, `${JSON.stringify(ask)}: nothing refused`);
        const filings = b.filings.length;
        assert.deepEqual(await beat(), ['trust', 'file'], `${JSON.stringify(ask)}: trusted and filed in one beat`);
        assert.deepEqual(b.filings.slice(filings), [herTask()]);
        const factory = String(ask.factory);
        await level(ask.for === undefined ? { factory, level: 'manual' } : { factory, end: true });
        await letGo();
        dropRecord(ROOT, levelKey(factory));
      }
    },
  );
});

describe("Kept, she is told what changed: the person's custom words once, never by a filing or a stop, and their chat words once she is live", () => {
  heldDate(Date.parse('2026-10-07T08:00:00.000Z'));
  beforeAll(() => {
    const t = teardowns();
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'), { force: true });
    return t.end;
  });
  const s = story(test);
  s.test('a custom instruction written while she is kept is told to her open task, never by a filing or a stop', async () => {
    const b = stage.board();
    const task = await keptAnew();
    const [filings, stops, told] = [b.filings.length, b.stopped.length, b.said.length];
    writeCustom('Answer in Spanish.\n');
    assert.deepEqual(await beat(), ['sayCustom']);
    assert.deepEqual(
      b.said.slice(told).map((one) => one.taskId),
      [task],
      'told once, to her open task',
    );
    assert.ok(b.said.at(-1)!.text.includes('Answer in Spanish.'), b.said.at(-1)!.text);
    assert.equal(b.filings.length, filings, 'never filed again');
    assert.equal(b.stopped.length, stops, 'never stopped');
    assert.ok(fs.readFileSync(promptFile(ROOT), 'utf8').trimEnd().endsWith('Answer in Spanish.'), 'her filed instruction now holds them');
    assert.deepEqual(await beat(), [], 'told once: level-triggered off the record of what she was told');
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    assert.deepEqual(await beat(), ['sayCustom']);
    assert.match(b.said.at(-1)!.text, /removed their custom instruction/);
    assert.equal(fs.readFileSync(promptFile(ROOT), 'utf8'), `${readNemia().body.trim()}\n`, 'her shipped instruction alone');
    assert.deepEqual(await beat(), []);
    assert.equal(b.said.length, told + 2);
  });
  s.test("the person's chat words are delivered once she is kept and her session is live, and once only", async () => {
    const b = stage.board();
    const task = await keptAnew();
    const told = b.said.length;
    appendOutbox(nemiaDir(ROOT), { id: 'kept-o1', at: new Date().toISOString(), text: 'Hi' });
    assert.deepEqual(await beat(), [], 'kept, her session not live: kept for later');
    b.settle(task, 'working');
    assert.deepEqual(await beat(), ['sayOutbox']);
    assert.deepEqual(
      b.said.slice(told).map((one) => [one.taskId, one.text]),
      [[task, framedFor({ kind: 'person' }, 'Hi')]],
    );
    assert.deepEqual(await beat(), [], 'delivered once: level-triggered off the marks');
  });
  s.test(
    'REFUSED: a sayCustom the runtime refuses leaves her filed instruction and what she was told as they were, owed again on the next beat',
    async () => {
      const b = stage.board();
      const task = await keptAnew();
      const filed = fs.readFileSync(promptFile(ROOT), 'utf8');
      const record = fs.readFileSync(toldFile(ROOT), 'utf8');
      const told = b.said.length;
      writeCustom('Answer in German.\n');
      b.refuseSay(1);
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'not running yet');
        return true;
      });
      assert.equal(fs.readFileSync(promptFile(ROOT), 'utf8'), filed, 'nothing written of words she was not told');
      assert.equal(fs.readFileSync(toldFile(ROOT), 'utf8'), record, 'nothing recorded of words she was not told');
      assert.equal(b.said.length, told);
      assert.deepEqual(await beat(), ['sayCustom'], 'owed again');
      assert.deepEqual(
        b.said.slice(told).map((one) => one.taskId),
        [task],
      );
      assert.ok(fs.readFileSync(promptFile(ROOT), 'utf8').trimEnd().endsWith('Answer in German.'));
      assert.deepEqual(await beat(), []);
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    },
  );
  s.test(
    'REFUSED: custom words that do not read are told to no one while she is kept, naming the clear; at manual her chat and her rest are never held by them',
    async () => {
      const b = stage.board();
      await keptAnew();
      const filed = fs.readFileSync(promptFile(ROOT), 'utf8');
      const told = b.said.length;
      writeCustom('---\ntools: Bash\n---\nUse Bash.\n');
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'nemia agents custom nemia --clear');
        return true;
      });
      assert.equal(b.said.length, told, 'told nothing');
      assert.equal(fs.readFileSync(promptFile(ROOT), 'utf8'), filed);
      await level({ level: 'manual' });
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'nemia agents custom nemia --clear');
        return true;
      });
      assert.deepEqual(listSubscriptions(ROOT), [], 'her operating ended all the same');
      const task = herTask();
      b.settle(task, 'working');
      appendOutbox(nemiaDir(ROOT), { id: 'unread-o1', at: new Date().toISOString(), text: 'Still with me?' });
      await assert.rejects(beat(), (err: Error) => {
        names(err.message, 'nemia agents custom nemia --clear');
        return true;
      });
      assert.equal(b.said.length, told + 1, 'the message said to her all the same, and nothing else');
      b.settle(task, 'idle');
      vi.advanceTimersByTime(1_000);
      await assert.rejects(beat());
      const idleSince = readSession(ROOT)?.idleSince;
      assert.equal(idleSince, new Date().toISOString(), 'her idle marked all the same');
      vi.advanceTimersByTime(15 * 60_000);
      assert.deepEqual(await beat(), ['rest'], 'quiet: she rests, the words unread or not');
      assert.ok(b.stopped.includes(task));
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    },
  );
  s.test('REFUSED: her shipped instruction changed while she is kept tells her nothing, with custom words or with none', async () => {
    const b = stage.board();
    await keptAnew();
    const told = b.said.length;
    fs.writeFileSync(promptFile(ROOT), 'An older instruction of hers.\n');
    assert.deepEqual(await beat(), [], 'no custom words then or now: nothing to tell');
    assert.equal(b.said.length, told, 'never told she removed words she never had');
    writeCustom('Answer in Dutch.\n');
    assert.deepEqual(await beat(), ['sayCustom'], 'the words changed: told');
    fs.writeFileSync(promptFile(ROOT), 'An older instruction of hers.\n\nAnswer in Dutch.\n');
    assert.deepEqual(await beat(), [], 'the same words, under another instruction: nothing to tell');
    assert.equal(b.said.length, told + 1);
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
  });
  s.test(
    'a session kept before the keeper recorded what she was told is judged by the words her instruction ends with, never told a removal',
    async () => {
      const b = stage.board();
      writeCustom('Answer in Italian.\n');
      await keptAnew();
      const told = b.said.length;
      fs.rmSync(toldFile(ROOT));
      assert.deepEqual(await beat(), [], 'her instruction ends with the words as they read: nothing to tell');
      writeCustom('Answer in Greek.\n');
      assert.deepEqual(await beat(), ['sayCustom'], 'other words than those she was filed with: told');
      assert.equal(fs.readFileSync(toldFile(ROOT), 'utf8'), '{"words":"Answer in Greek."}\n', 'and recorded');
      fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
      fs.rmSync(toldFile(ROOT));
      assert.deepEqual(await beat(), [], 'no words, and none known told: no removal owed');
      assert.equal(b.said.length, told + 1);
      fs.writeFileSync(toldFile(ROOT), '["not", "a record"]\n');
      assert.deepEqual(await beat(), [], 'a record that does not read is none');
    },
  );
  s.test('her task filed with custom words records them, so their removal is told to her', async () => {
    const b = stage.board();
    writeCustom('Answer in Polish.\n');
    await keptAnew();
    assert.equal(fs.readFileSync(toldFile(ROOT), 'utf8'), '{"words":"Answer in Polish."}\n', 'filed with them');
    const told = b.said.length;
    fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
    assert.deepEqual(await beat(), ['sayCustom']);
    assert.match(b.said.at(-1)!.text, /removed their custom instruction/);
    assert.equal(b.said.length, told + 1);
    await level({ level: 'manual' });
    assert.deepEqual(await beat(), ['drop']);
  });
  s.test('her custom words held by the Agent door alone, none on disk, are told to her and written into her instruction', async () => {
    const b = stage.board();
    const task = await keptAnew();
    const agents = agentDoorMemory();
    Effect.runSync(
      Effect.provide(
        Effect.flatMap(AgentDoor, (d) => d.custom.write(AgentName.read('nemia'), 'Answer in Basque.', ROOT)),
        agents,
      ),
    );
    assert.equal(fs.existsSync(customInstructionsFile(ROOT, 'nemia')), false, 'her words are on no disk');
    const doorBeat = () => stage.runWith(viewed(), Effect.provide(keepOnce(), agents));
    const told = b.said.length;
    assert.deepEqual(await doorBeat(), ['sayCustom']);
    assert.deepEqual(
      b.said.slice(told).map((one) => one.taskId),
      [task],
    );
    assert.ok(b.said.at(-1)!.text.includes('Answer in Basque.'), b.said.at(-1)!.text);
    assert.ok(fs.readFileSync(promptFile(ROOT), 'utf8').trimEnd().endsWith('Answer in Basque.'), 'her filed instruction holds them');
    assert.deepEqual(await doorBeat(), [], 'told once');
    await level({ level: 'manual' });
    assert.deepEqual(await doorBeat(), ['drop']);
  });
});

describe('`nemia level` refuses a level that is none, a factory write that names no factory or the default one, a raise of nothing and an end of none', () => {
  beforeAll(() => {
    withPipao();
    dropRecord(ROOT, levelKey('pipao'));
  });
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
    test(`REFUSED by its check: ${JSON.stringify(args)}`, () => {
      names(check(args), ...facts);
    });
  const passing: Record<string, string>[] = [{ level: 'auto' }, { level: 'manual' }, { factory: 'pipao', level: 'semi-auto', for: '90m' }];
  for (const args of passing)
    test(`passes its check: ${JSON.stringify(args)}`, () => {
      assert.equal(check(args), null);
    });
  test('REFUSED at exit 2: a factory that is none, naming the command that lists them', async () => {
    names(await refusal(() => level({ factory: 'nope', level: 'semi-auto', for: '1h' })), 'no factory is named nope', 'nemia factory ls');
  });
  test('REFUSED at exit 2: an end of no raise in force', async () => {
    names(await refusal(() => level({ factory: 'pipao', end: true })), 'pipao has no raise in force to end');
  });
  test('REFUSED at exit 2: a raise to the level the factory has by default raises nothing, naming the command that sets it', async () => {
    const nothing = await refusal(() => level({ factory: 'pipao', level: 'manual', for: '1h' }));
    names(nothing, 'pipao is at manual by default', 'raises nothing', 'nemia level manual --factory pipao');
  });
  test('nothing is written of a write refused', () => {
    assert.equal(recordText(ROOT, levelKey('pipao')) !== undefined, false, 'nothing written');
  });
});

describe('She answers her chat at any level: a message files her, she rests once the conversation is quiet, and the next message wakes her with her memory', () => {
  let QUIET!: number;
  let b!: import('./story.ts').Board;
  let factory!: string;
  heldDate(Date.parse('2026-10-09T08:00:00.000Z'));
  beforeAll(() => {
    const t = teardowns();
    QUIET = 15 * 60_000;
    b = stage.board();
    withPipao();
    [factory = ''] = factoryNamesAt(ROOT);
    fs.rmSync(nemiaDir(ROOT), { recursive: true, force: true });
    dropRecord(ROOT, levelKey(factory));
    return t.end;
  });
  const s = story(test);
  const lastSpec = () => b.specs.at(-1) as unknown as { id: string; brief: string; resumeFrom?: string };
  const say = (id: string, text: string) => appendOutbox(nemiaDir(ROOT), { id, at: new Date().toISOString(), text });
  let [one, two] = ['', ''];
  s.test('a fresh store: a message in her chat files her under a new id, at manual, with no subscription', async () => {
    assert.deepEqual(await beat(), [], 'nobody wants her: nothing runs');
    assert.equal(nemiaChatPlace(ROOT).wakes, true, 'her chat says a message wakes her');
    say('c-o1', 'Hello?');
    assert.deepEqual(await beat(), ['file']);
    one = herTask();
    assert.deepEqual(readSession(ROOT)?.tasks, [one]);
    assert.equal(lastSpec().id, one);
    assert.equal(lastSpec().resumeFrom, undefined, 'her first session starts cold');
    assert.doesNotMatch(lastSpec().brief, /feed/, 'in conversation: not told of the feed');
    assert.equal(readLevel(ROOT), undefined, 'no level written');
    assert.deepEqual(listSubscriptions(ROOT), []);
    b.settle(one, 'working');
    assert.deepEqual(await beat(), ['sayOutbox'], 'the message said to her');
  });
  s.test('her session idle: the keeper marks it once', async () => {
    b.settle(one, 'idle');
    vi.advanceTimersByTime(1_000);
    assert.deepEqual(await beat(), ['markIdle']);
    assert.equal(readSession(ROOT)?.idleSince, new Date().toISOString());
    assert.deepEqual(await beat(), []);
  });
  s.test('quiet a millisecond short of fifteen minutes she stays; at fifteen she is put to rest, the record marked', async () => {
    vi.advanceTimersByTime(QUIET - 1);
    assert.deepEqual(await beat(), [], 'a millisecond short');
    vi.advanceTimersByTime(1);
    assert.deepEqual(await beat(), ['rest']);
    assert.ok(readSession(ROOT)?.rested !== undefined, 'marked rested');
    assert.ok(b.stopped.includes(one), 'her task stopped: the runtime’s one end of a long-lived session');
    assert.deepEqual(await beat(), [], 'resting: nothing runs');
    const now = await level({});
    assert.deepEqual([now.rests, now.stopped], [true, false], 'resting, not stopped');
  });
  s.test('a new message files a second task continuing the first’s session; the record lists both', async () => {
    vi.advanceTimersByTime(1);
    say('c-o2', 'Still there?');
    assert.deepEqual(await beat(), ['file']);
    two = herTask();
    assert.deepEqual(readSession(ROOT)?.tasks, [one, two]);
    assert.equal(lastSpec().resumeFrom, '0123456789abcdef', 'her last session continued, with her memory');
    assert.deepEqual(nemiaChatPlace(ROOT).tasks, [one, two], 'her chat spans both');
  });
  s.test('a factory raised: subscribed, and quiet past fifteen minutes she never rests', async () => {
    await level({ factory, level: 'semi-auto' });
    b.settle(two, 'working');
    assert.deepEqual(await beat(), ['subscribe']);
    assert.deepEqual(await beat(), ['sayOutbox']);
    b.settle(two, 'idle');
    vi.advanceTimersByTime(1_000);
    assert.deepEqual(await beat(), ['markIdle']);
    vi.advanceTimersByTime(QUIET + 60_000);
    assert.deepEqual(await beat(), [], 'operating: never put to rest');
  });
  s.test('back to manual: her subscription dropped, and she rests once quiet — at once, quiet already', async () => {
    await level({ factory, level: 'manual' });
    assert.deepEqual(await beat(), ['rest', 'drop']);
    assert.deepEqual(listSubscriptions(ROOT), []);
    assert.ok(b.stopped.includes(two));
  });
  s.test(
    'a stop from outside is marked; a message written before it does not file her again, one after does, and so does a level set',
    async () => {
      vi.advanceTimersByTime(1);
      say('c-o3', 'One more thing.');
      assert.deepEqual(await beat(), ['file']);
      const three = herTask();
      b.settle(three, 'working');
      assert.deepEqual(await beat(), ['sayOutbox']);
      say('c-o4', 'Before the stop.');
      vi.advanceTimersByTime(1);
      b.settle(three, 'stopped');
      assert.deepEqual(await beat(), ['markStopped']);
      assert.deepEqual(await beat(), [], 'a word written before the stop does not file her');
      assert.equal((await level({})).stopped, true);
      vi.advanceTimersByTime(1);
      say('c-o5', 'After the stop.');
      assert.deepEqual(await beat(), ['file'], 'a word after the stop does');
      const four = herTask();
      b.settle(four, 'stopped');
      assert.deepEqual(await beat(), ['markStopped']);
      assert.deepEqual(await beat(), []);
      vi.advanceTimersByTime(1);
      await level({ level: 'manual' });
      assert.deepEqual(await beat(), ['file'], 'a level set after the stop is the person speaking too');
      assert.notEqual(herTask(), four);
    },
  );
  s.test('a store whose level file names her task and whose keeper kept no record adopts it as her first', async () => {
    fs.rmSync(sessionFile(ROOT));
    writeLevel(ROOT, { level: 'manual', since: '2026-10-09T08:00:00.000Z', task: 'nemia-older' });
    assert.deepEqual(herTasks(ROOT), ['nemia-older']);
    assert.deepEqual(nemiaChatPlace(ROOT).tasks, ['nemia-older']);
    assert.equal((await level({})).task, 'nemia-older');
  });
});

describe("Her task's mounts are those the runtime takes, whatever switches a factory's volume has", () => {
  test("a volume with its CLAUDE.md on and its skills off: her task's config is one the runtime's file takes", () => {
    const home = scratch('wf-nemia-mounts-');
    const repo = fs.mkdtempSync(path.join(home, 'repo-'));
    const { factory } = addFactoryAt(home, { name: 'acme', volumes: [`${repo}:rw`] });
    rewriteFactoryAt(home, { ...factory, volumes: factory.volumes.map((v) => ({ ...v, claudeMd: true, skills: false })) });
    const spec = nemiaSpec('nemia-mounts', undefined, 'token', home, readFactoriesAt(home));
    assert.deepEqual(spec.config.mounts, [{ path: repo, readOnly: true }]);
    assert.equal(argsRefusalOf(spec), undefined);
  });
});
