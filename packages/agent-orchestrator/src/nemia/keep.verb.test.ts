/**
 * The keeper and `nemia level` over an engine board of the test's: her task filed long-lived in her folder, by her shipped definition and
 * the person's custom words, with the daemon's own bin first on her path and an ask on every write in the store but her memory;
 * subscribed once it is open; nothing filed again on the next beat, nor after a stop from outside; stopped and unsubscribed at manual.
 * And `nemia level`'s refusals: a folder not trusted, naming the command that trusts it. A store of its own, since `WF_ROOT` is read as
 * the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';
import { board } from '../../test/engine-board.ts';

const ROOT = scratch('wf-nemia-');
process.env.WF_ROOT = ROOT;
const CONFIG = scratch('wf-nemia-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
const { keepOnce } = await import('./keep.verb.ts');
const { LEVEL } = await import('./level.verb.ts');
const { MEMORY } = await import('./memory.verb.ts');
const { levelFile, memoryDir, nemiaDir, ownBin, promptFile, readLevel, readNemia } = await import('./level.store.ts');
const { listSubscriptions } = await import('../subscription/subscription.store.ts');
const { customInstructionsFile } = await import('../folder/folder.store.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { DEFAULT_HARNESS } = await import('../harness/harness.ts');
const { engineOf, runWith } = await import('../runtime-client.ts');
const { nemiaFence } = await import('./fence.ts');
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

test('REFUSED: semi-auto while her folder is not trusted, naming the command that trusts it; nothing written', async () => {
  for (const trusted of [undefined, false]) {
    if (trusted === false) trust(false);
    const said = await refusal(() => runWith(e, LEVEL.handler({ level: 'semi-auto' })));
    assert.match(said, /is not trusted/);
    assert.ok(said.includes(`mkdir -p ${nemiaDir()} && cd ${nemiaDir()} && ${DEFAULT_HARNESS}`), said);
    assert.equal(readLevel(), undefined);
  }
  assert.match(LEVEL.check?.({ level: 'auto' }) ?? '', /^auto is not built yet/);
  assert.equal(LEVEL.check?.({ level: 'manual' }), null);
  assert.equal(await beat().then((owed) => owed.length), 0, 'no level set owes nothing');
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
  const settings = JSON.parse(own.settings) as { permissions: { ask: string[]; deny: string[] }; env: { PATH: string } };
  assert.equal(settings.env.PATH, [bin, '/usr/local/bin', '/usr/bin'].join(path.delimiter), "the daemon's own bin first, and once");
  const fence = nemiaFence(TABLE);
  assert.deepEqual(settings.permissions.ask, fence.ask, 'her asks, derived from the table');
  const denies = settings.permissions.deny;
  assert.deepEqual(denies.slice(0, fence.deny.length), fence.deny, 'tick and up out of her reach');
  assert.ok(fence.deny.includes('Bash(nemia tick:*)') && fence.deny.includes('Bash(nemia up:*)'));
  assert.ok(denies.includes(`Edit(/${path.join(ROOT, 'brand-new')}/**)`), 'a folder the store gained is denied');
  assert.ok(denies.includes(`Edit(/${path.join(ROOT, 'daemon.json')})`), 'a file at the store top is denied');
  assert.ok(denies.includes(`Edit(/${levelFile()})`) && denies.includes(`Edit(/${promptFile()})`), 'her level and her instruction are denied');
  assert.deepEqual(
    [...settings.permissions.ask, ...denies].filter((rule) => rule.startsWith(`Edit(/${nemiaDir()}`)),
    [`Edit(/${levelFile()})`, `Edit(/${promptFile()})`],
    'her memory is denied and asked by no rule',
  );
  for (const rule of fence.allow) assert.ok((spec.config.allowedTools as string[]).includes(rule), `${rule} allowed`);
  assert.deepEqual(
    spec.config.admission,
    { command: [path.join(bin, 'nemia'), 'admit'], tools: ['Bash'] },
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
  assert.deepEqual(await beat(), [], 'level-triggered: nothing filed again');
  assert.equal(b.filings.filter((id) => id === set.task).length, 1);
  const status = await runWith(e, LEVEL.handler({}));
  assert.equal(status.level, 'semi-auto');
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
