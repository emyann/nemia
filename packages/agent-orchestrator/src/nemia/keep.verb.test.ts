/**
 * The keeper and `nemia level` over an engine board of the test's: her task filed long-lived in her folder, by her shipped definition and
 * the person's custom words, with the daemon's own bin first on her path, her fence derived from the table, her admission, and a deny
 * on the store but her folder;
 * subscribed once it is open, with her floor; nothing filed again on the next beat, nor after a stop from outside; stopped and unsubscribed
 * at manual, and once a factory's raise passes its end, with no write.
 * And her folder not trusted: the level written all the same, with the command that trusts it, and her session filed only once it is.
 * A store of its own, since `WF_ROOT` is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import { CONFIG_FOLDERS } from 'agent-runtime/vocabulary';
import { scratch } from '../../test/scratch.ts';
import { board } from '../../test/engine-board.ts';
import { runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-nemia-');
process.env.WF_ROOT = ROOT;
const CONFIG = scratch('wf-nemia-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
const { keepOnce } = await import('./keep.verb.ts');
const { LEVEL } = await import('./level.verb.ts');
const { MEMORY } = await import('./memory.verb.ts');
const { levelFile, memoryDir, nemiaDir, ownBin, promptFile, readLevel, readNemia, toldFile } = await import('./level.store.ts');
const { listSubscriptions } = await import('../subscription/subscription.store.ts');
const { customInstructionsFile } = await import('../agents/read.store.ts');
const { addFactory, factoryNames } = await import('../factory/factory.store.ts');
const { factoryLevelFile } = await import('../level/level.store.ts');
const { DEFAULT_HARNESS } = await import('../harness/harness.ts');
const { engineOf, runWith: runEngine } = await import('../runtime-client.ts');
const { gitPlaceLayer } = await import('../place/shipped.store.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const { nemiaFence } = await import('../admission/index.ts');
const { TABLE } = await import('../command/commands.verb.ts');

const b = board();

/** The board's engine, whose `view` says when a task was filed and whether a stop was asked of it, as the runtime's fold does. */
const e = {
  ...engineOf(b.layer),
  view: (id: string) =>
    Effect.sync(() => {
      const t = b.tasks.get(id);
      const settled = t && ['succeeded', 'failed', 'stopped'].includes(t.phase) ? t.phase : null;
      const attempts = [{ n: 1, endedAt: '2026-10-05T16:30:00.000Z', reason: null, usage: { costUsd: 0.42 } }];
      const state = t
        ? { filedAt: '2026-10-05T16:00:00.000Z', settled, stopRequested: b.stopped.includes(id), attempts }
        : { settled: null, attempts: [] };
      return { id, phase: t?.phase ?? 'pending', sessionId: t ? '0123456789abcdef' : null, state } as unknown as TaskView;
    }),
};

const beat = () => runWith(e, keepOnce());

/** Her folder trusted or not, as the harness keeps it in its config file. */
const trust = (trusted: boolean) =>
  fs.writeFileSync(
    path.join(CONFIG, `.${DEFAULT_HARNESS}.json`),
    JSON.stringify({ projects: { [nemiaDir()]: { hasTrustDialogAccepted: trusted } } }),
  );

/** The factory `pipao` in the store and her folder trusted, as the tests before leave them: a test of a factory's level runs alone too. */
const withPipao = () => {
  trust(true);
  if (!factoryNames().includes('pipao')) addFactory({ name: 'pipao', repos: [fs.mkdtempSync(path.join(ROOT, 'repo-'))] });
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

test('semi-auto while her folder is not trusted is written, naming the command that trusts it; her session is filed only once it is', async () => {
  assert.equal(LEVEL.check?.({ level: 'auto' }), null);
  assert.match(LEVEL.check?.({ level: 'on' }) ?? '', /^"on" is no level/);
  assert.equal(LEVEL.check?.({ level: 'manual' }), null);
  for (const trusted of [false, true]) {
    trust(trusted);
    assert.deepEqual(await beat(), [], 'no level set owes nothing, trusted or not');
    assert.equal(fs.existsSync(levelFile()), false, 'never automatic: the keeper writes no level');
  }
  fs.rmSync(path.join(CONFIG, `.${DEFAULT_HARNESS}.json`));
  const words = `mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`;
  const set = await runWith(e, LEVEL.handler({ level: 'semi-auto' }));
  assert.equal(set.level, 'semi-auto');
  assert.ok(set.task !== null && readLevel()?.task === set.task, 'her task named, for the keeper');
  assert.equal(set.trust, words);
  assert.ok(
    LEVEL.print(set, {}).some((line) => line.includes(words) && line.includes('accept the prompt')),
    'nemia level says the command',
  );
  const filings = b.filings.length;
  assert.deepEqual(await beat(), [], 'her session waits for her folder to be trusted');
  trust(false);
  assert.deepEqual(await beat(), []);
  assert.equal(b.filings.length, filings, 'nothing filed where her harness would refuse its start');
  trust(true);
  assert.equal((await runWith(e, LEVEL.handler({}))).trust, null, 'trusted: no command to run');
  assert.deepEqual(await beat(), ['file'], 'filed at the next beat, with no second level set');
  assert.deepEqual(b.filings.slice(filings), [set.task]);
  await runWith(e, LEVEL.handler({ level: 'manual' }));
  assert.deepEqual(await beat(), ['stop']);
  fs.rmSync(levelFile());
});

test("at semi-auto the keeper files her task long-lived in auto, the daemon's bin first on her path, every store write asked but her memory; subscribes it once open, and owes nothing on the next beat", async () => {
  fs.mkdirSync(path.dirname(customInstructionsFile(ROOT, 'nemia')), { recursive: true });
  fs.writeFileSync(customInstructionsFile(ROOT, 'nemia'), 'Answer in French. Times in Montreal.\n');
  trust(true);
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
  const set = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { task: string; phase: string | null };
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
    [`Edit(/${levelFile()})`, `Edit(/${promptFile()})`, `Edit(/${toldFile()})`],
    'her memory is denied and asked by no rule',
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
  assert.deepEqual(await beat(), ['subscribe']);
  assert.deepEqual(
    listSubscriptions().map((s) => [s.name, s.subscription.task]),
    [['nemia', set.task]],
  );
  assert.ok(listSubscriptions()[0].subscription.wake?.includes('denied:'), "a step's denied calls wake her");
  assert.deepEqual(listSubscriptions()[0].subscription.scope, { atLeast: 'semi-auto' }, 'told of no factory left alone');
  assert.deepEqual(await beat(), [], 'level-triggered: nothing filed again');
  assert.equal(b.filings.filter((id) => id === set.task).length, 1);
  const status = await runWith(e, LEVEL.handler({}));
  assert.equal(status.level, 'semi-auto');
  assert.deepEqual(status.allows, ['Bash(nemia cancel:*)', 'Bash(nemia approve:*)'], 'what the person allowed in her folder, shown');
  assert.deepEqual(status.spend, { usd: 0.42, measured: 1, unmeasured: 0 });
  assert.ok(LEVEL.print(status, {}).includes('spent $0.42 over 1 session ended; her open one counts once it ends'));
  assert.equal(status.reach[0], `${DEFAULT_HARNESS} attach 01234567`);
  const again = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { task: string };
  assert.equal(again.task, set.task, 'semi-auto again keeps her open task');
});

test('a task stopped from outside is never filed again, and semi-auto then starts a fresh one; manual stops and unsubscribes', async () => {
  const first = readLevel()!.task!;
  b.settle(first, 'stopped');
  assert.deepEqual(await beat(), ['drop']);
  assert.deepEqual(await beat(), [], 'never filed again');
  assert.equal(((await runWith(e, LEVEL.handler({}))) as { stopped: boolean }).stopped, true);
  await new Promise((resolve) => setTimeout(resolve, 2));
  const fresh = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { task: string };
  assert.notEqual(fresh.task, first);
  assert.deepEqual(await beat(), ['file']);
  assert.deepEqual(await beat(), ['subscribe']);
  await runWith(e, LEVEL.handler({ level: 'manual' }));
  assert.equal(readLevel()?.task, fresh.task, 'manual keeps the task named, for the keeper to stop');
  assert.deepEqual(await beat(), ['stop', 'drop']);
  assert.ok(b.stopped.includes(fresh.task));
  assert.deepEqual(listSubscriptions(), []);
  assert.deepEqual(await beat(), []);
});

test('REFUSED: a factory write that names no factory, the default one, a raise with no level or stretch, an end with no raise', async () => {
  withPipao();
  const check = (args: Record<string, string | boolean>) => LEVEL.check?.(args) ?? null;
  assert.match(check({ level: 'semi-auto', for: '2h' }) ?? '', /^--for and --end take the factory raised, --factory <name>/);
  assert.match(check({ factory: 'pipao', end: true, for: '2h' }) ?? '', /give one/);
  assert.match(
    check({ factory: 'pipao', for: '2h' }) ?? '',
    /--for takes the level the factory is raised to: nemia level semi-auto --factory pipao/,
  );
  assert.match(check({ factory: 'pipao', level: 'manual', end: true }) ?? '', /--end takes no level/);
  assert.match(check({ factory: 'default', level: 'semi-auto' }) ?? '', /: nemia level semi-auto\.$/);
  for (const stretch of ['0h', '-1h', '2x', '8d'])
    assert.match(check({ factory: 'pipao', level: 'semi-auto', for: stretch }) ?? '', /is not one/, stretch);
  assert.equal(check({ factory: 'pipao', level: 'semi-auto', for: '90m' }), null);
  assert.match(
    await refusal(() => runWith(e, LEVEL.handler({ factory: 'nope', level: 'semi-auto', for: '1h' }))),
    /^no factory is named nope: nemia factory ls/,
  );
  assert.match(await refusal(() => runWith(e, LEVEL.handler({ factory: 'pipao', end: true }))), /^pipao has no raise in force to end/);
  assert.match(
    await refusal(() => runWith(e, LEVEL.handler({ factory: 'pipao', level: 'manual', for: '1h' }))),
    /^pipao is at manual by default, so a raise to manual raises nothing/,
  );
  assert.equal(fs.existsSync(factoryLevelFile('pipao')), false, 'nothing written');
});

test("a factory raised for a stretch keeps her, the store at manual; once the raise's end passes she is stopped, with no write", async (t) => {
  withPipao();
  await new Promise((resolve) => setTimeout(resolve, 2));
  const raised = await runWith(e, LEVEL.handler({ factory: 'pipao', level: 'semi-auto', for: '1h' }));
  assert.equal(raised.level, 'manual', "the store's own level is untouched");
  const pipao = raised.factories.find((row) => row.factory === 'pipao');
  assert.equal(pipao?.level, 'semi-auto');
  assert.equal(pipao.default, 'manual');
  const until = pipao.raise?.until ?? '';
  assert.ok(Date.parse(until) > Date.now() + 3_500_000, 'raised for an hour');
  assert.ok(LEVEL.print(raised, {}).includes(`  pipao: semi-auto until ${until}, then manual (the store's)`));
  assert.deepEqual(await beat(), ['file']);
  assert.deepEqual(await beat(), ['subscribe']);
  assert.deepEqual(await beat(), []);
  const written = [levelFile(), factoryLevelFile('pipao')].map((f) => fs.readFileSync(f, 'utf8'));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 2 * 3_600_000 });
  assert.deepEqual(await beat(), ['stop', 'drop'], 'none above manual once the raise has passed');
  assert.deepEqual(
    [levelFile(), factoryLevelFile('pipao')].map((f) => fs.readFileSync(f, 'utf8')),
    written,
    'level-triggered: the raise reads as gone, with no write',
  );
  const after = await runWith(e, LEVEL.handler({}));
  assert.deepEqual(after.factories.find((row) => row.factory === 'pipao')?.raise, null);
});

test('a raise ended early stops her at the next beat; a raise to a level the factory has by default is refused', async () => {
  withPipao();
  const raised = await runWith(e, LEVEL.handler({ factory: 'pipao', level: 'semi-auto', for: '2h' }));
  assert.deepEqual(await beat(), ['file']);
  const ended = await runWith(e, LEVEL.handler({ factory: 'pipao', end: true }));
  assert.equal(ended.task, raised.task, 'the task stays named, for the keeper to stop');
  assert.deepEqual(ended.factories.find((row) => row.factory === 'pipao')?.raise, null);
  assert.equal(fs.existsSync(factoryLevelFile('pipao')), false, 'a factory with no level of its own follows the store');
  assert.deepEqual(await beat(), ['stop']);
  await runWith(e, LEVEL.handler({ factory: 'pipao', level: 'semi-auto' }));
  assert.deepEqual(await beat(), ['file'], "a factory's own default above manual keeps her");
  assert.match(
    await refusal(() => runWith(e, LEVEL.handler({ factory: 'pipao', level: 'semi-auto', for: '1h' }))),
    /^pipao is at semi-auto by default/,
  );
  await runWith(e, LEVEL.handler({ factory: 'pipao', level: 'manual' }));
  assert.deepEqual(await beat(), ['stop']);
});

test('nemia memory lists her facts and prints one; a fact she does not keep is refused, naming those she does', async () => {
  fs.mkdirSync(memoryDir(), { recursive: true });
  fs.writeFileSync(path.join(memoryDir(), 'feed-cursor'), '1234\n');
  fs.writeFileSync(path.join(memoryDir(), '.hidden'), 'no fact');
  assert.deepEqual(MEMORY.print((await runWith(e, MEMORY.handler({}))) as never, {}), [
    `Nemia keeps 1 fact in ${memoryDir()}:`,
    '  feed-cursor',
  ]);
  assert.deepEqual(MEMORY.print((await runWith(e, MEMORY.handler({ fact: 'feed-cursor' }))) as never, {}), ['1234']);
  assert.match(
    await refusal(() => runWith(e, MEMORY.handler({ fact: '../level.json' }))),
    /no fact named \.\.\/level\.json: she keeps feed-cursor/,
  );
});

test("a factory's raise or default above manual while her folder is not trusted is written, and files her only once it is", async () => {
  withPipao();
  fs.rmSync(levelFile(), { force: true });
  fs.rmSync(factoryLevelFile('pipao'), { force: true });
  trust(false);
  for (const ask of [
    { factory: 'pipao', level: 'semi-auto', for: '1h' },
    { factory: 'pipao', level: 'semi-auto' },
  ]) {
    const set = await runWith(e, LEVEL.handler(ask));
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
  await runWith(e, LEVEL.handler({ factory: 'pipao', level: 'manual' }));
  assert.deepEqual(await beat(), ['stop']);
});

/** The person's custom words for her written, their folder made where no test before made it: a test of her tell runs alone too. */
const writeCustom = (words: string) => {
  fs.mkdirSync(path.dirname(customInstructionsFile(ROOT, 'nemia')), { recursive: true });
  fs.writeFileSync(customInstructionsFile(ROOT, 'nemia'), words);
};

/** Her task kept anew: any she has stopped at manual, then the store's level at semi-auto, a fresh task filed and subscribed. Its id. */
const keptAnew = async (): Promise<string> => {
  withPipao();
  await runWith(e, LEVEL.handler({ level: 'manual' }));
  await beat();
  await new Promise((resolve) => setTimeout(resolve, 2));
  const { task } = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { task: string };
  assert.deepEqual(await beat(), ['file']);
  assert.deepEqual(await beat(), ['subscribe']);
  assert.deepEqual(await beat(), []);
  return task;
};

test('a custom instruction written while she is kept is told to her open task, never by a filing or a stop', async () => {
  const task = await keptAnew();
  const [filings, stops, told] = [b.filings.length, b.stopped.length, b.said.length];
  writeCustom('Answer in Spanish.\n');
  assert.deepEqual(await beat(), ['tell']);
  assert.deepEqual(
    b.said.slice(told).map((s) => s.taskId),
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

test('REFUSED: a tell the runtime refuses leaves her filed instruction and what she was told as they were, owed again on the next beat', async () => {
  const task = await keptAnew();
  const filed = fs.readFileSync(promptFile(), 'utf8');
  const record = fs.readFileSync(toldFile(), 'utf8');
  const told = b.said.length;
  writeCustom('Answer in German.\n');
  b.refuseSay(1);
  await assert.rejects(beat(), (err: Error) => {
    assert.match(err.message, /not running yet/);
    return true;
  });
  assert.equal(fs.readFileSync(promptFile(), 'utf8'), filed, 'nothing written of words she was not told');
  assert.equal(fs.readFileSync(toldFile(), 'utf8'), record, 'nothing recorded of words she was not told');
  assert.equal(b.said.length, told);
  assert.deepEqual(await beat(), ['tell'], 'owed again');
  assert.deepEqual(
    b.said.slice(told).map((s) => s.taskId),
    [task],
  );
  assert.ok(fs.readFileSync(promptFile(), 'utf8').trimEnd().endsWith('Answer in German.'));
  assert.deepEqual(await beat(), []);
  fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
});

test('REFUSED: custom words that do not read are told to no one while she is kept, naming the clear; a stop at manual is never held by them', async () => {
  await keptAnew();
  const filed = fs.readFileSync(promptFile(), 'utf8');
  const told = b.said.length;
  writeCustom('---\ntools: Bash\n---\nUse Bash.\n');
  await assert.rejects(beat(), (err: Error) => {
    assert.ok(err.message.includes('nemia agents custom nemia --clear'), err.message);
    return true;
  });
  assert.equal(b.said.length, told, 'told nothing');
  assert.equal(fs.readFileSync(promptFile(), 'utf8'), filed);
  await runWith(e, LEVEL.handler({ level: 'manual' }));
  assert.deepEqual(await beat(), ['stop', 'drop'], 'stopped all the same');
  fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
});

test('REFUSED: her shipped instruction changed while she is kept tells her nothing, with custom words or with none', async () => {
  fs.rmSync(customInstructionsFile(ROOT, 'nemia'), { force: true });
  await keptAnew();
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

test('a session kept before the keeper recorded what she was told is judged by the words her instruction ends with, never told a removal', async () => {
  writeCustom('Answer in Italian.\n');
  await keptAnew();
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
});

test('her task filed with custom words records them, so their removal is told to her', async () => {
  writeCustom('Answer in Polish.\n');
  await keptAnew();
  assert.equal(fs.readFileSync(toldFile(), 'utf8'), '{"words":"Answer in Polish."}\n', 'filed with them');
  const told = b.said.length;
  fs.rmSync(customInstructionsFile(ROOT, 'nemia'));
  assert.deepEqual(await beat(), ['tell']);
  assert.match(b.said.at(-1)!.text, /removed their custom instruction/);
  assert.equal(b.said.length, told + 1);
});
