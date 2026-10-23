/**
 * Claude Code attached on the Agent SDK, against a stand-in CLI (`fixtures/stand-in-claude.ts`) the SDK spawns as it would Claude
 * Code. It pins the protocol the SDK speaks to its CLI: an SDK update that moves it fails here first.
 *
 * Two stories of a long-lived attached request (`restartPolicy: 'Always'`), which runs here by the runtime's own rule: one session
 * walked through its life — started on Claude Code's own system prompt with the agent's appended as text on the `initialize`
 * request, a turn's end that is not the session's end, the claude.ai bridge opened after its first turn, words that begin a turn of
 * their own, an interrupt that never fails it, words said while a turn runs, an interrupt asked by another process honoured on the
 * next look and one that came too late dropped, then let go between turns and resumed by the next holder under the same Claude
 * Code id, its bridge re-attached — and one asked for no bridge, whose words said into a call's turn are folded into it.
 *
 * A story of a job-road session spawned as its task asked: its prompt, its servers riding the child's argv as inline JSON with the
 * window a key of the one settings object, its parent's cost left out, a call that would ask a person denied in the holder; and one
 * of an engine that holds nothing reaching the session another holds, by its words and its stop.
 *
 * Tables of what each row builds alone: a look at a run file; the next holder taking up a session left behind (parked, cut at the
 * bound, its holder dead mid-call, its holder's pid or its Claude Code's pid taken by another process since); a drain, and whom it
 * holds; a let-go, and its bound; a spawn whose options are refused, which leaves no run file. Kept focused, each a race of its own:
 * a call held at its hook as the holder lets go, and a denial journalled while the attempt is at work.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { Effect, Exit, Logger, Scope } from 'effect';
import { attachedSessions, letGoOf, type Attached } from '../src/harness/claude/attached.ts';
import {
  alive,
  attachedDir,
  attachedStateOf,
  crashNote,
  CARRY_ON,
  filesOf,
  putDrain,
  thisHolder,
  writeRun,
  type AttachedRun,
} from '../src/harness/claude/attached-file.ts';
import { fold, idleOf, type Event, type Sighting } from '../src/core/index.ts';
import { respawning } from '../src/core/domain.ts';
import { processStart } from '../src/harness/claude/inbox.ts';
import { purseOf } from '../src/core/clock.ts';
import { instantNow } from '../src/core/engine/now.ts';
import type { Live } from '../src/harness/claude/attached-session.ts';
import { claudeCodeOps } from '../src/harness/claude/code.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { sdkArgValue } from './sdk-argv.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { holder, inCall, kept, lines, NAME, place, run, STAND_IN } from './attached-held.ts';

/**
 * How many results the session's capture holds, as its holder wrote them: each is written in the same take as the run file it leaves
 * behind, so a test that reads one reads the state it left.
 */
const resultsOf = (root: string): number => {
  const out = filesOf(root, NAME).out;
  if (!fs.existsSync(out)) return 0;
  return fs
    .readFileSync(out, 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((l) => (JSON.parse(l) as { type?: string }).type === 'result').length;
};

/** A long-lived task filed and its one attempt in flight, as its journal folds: what `decide` reads a sighting against. */
const LONG_LIVED: readonly Event[] = [
  {
    kind: 'filed',
    at: '2026-01-01T00:00:00.000Z',
    brief: 'be there',
    cwd: '/r',
    harness: 'claude',
    restartPolicy: 'Always',
    config: { background: true },
  },
  { kind: 'starting', at: '2026-01-01T00:00:01.000Z', attempt: 1 },
  { kind: 'spawned', at: '2026-01-01T00:00:02.000Z', attempt: 1 },
];

/** What `decide` makes of the sighting `s` of a long-lived task: whether its session is idle, and whether its harness is taking it up. */
const read = (s: Sighting) => ({ idle: idleOf(fold('t1', LONG_LIVED), s), respawning: respawning(fold('t1', LONG_LIVED), s) });

/** Waits until the session's run file says it is idle between turns. */
const idle = (t: Waiter, root: string, why = 'the session idle between turns') =>
  until(t, () => run(root)?.state === 'idle' && run(root)!, why, { everyMs: 50 });

/** The control requests the SDK sent the stand-in, each with what it carried. */
const taken = (dir: string) => lines(dir, 'taken.jsonl') as { subtype: string | null; reattach_session_id?: string }[];

/** How many `interrupt` control requests the SDK sent the stand-in. */
const interrupts = (dir: string) => taken(dir).filter((r) => r.subtype === 'interrupt').length;

/** What the stand-in's session said it was handed, as text. */
const saidIn = (dir: string) => lines(dir, 'said.jsonl') as string[];

/** The sighting of the session the holder `h` looks at. */
const sighted = async (h: { attached: Attached }) => (await Effect.runPromise(h.attached.ops.observe)).get(NAME);

/** A process that idles until killed, in a group of its own: what takes a pid a run file names. */
const squatter = (t: TestContext) => {
  const p = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
  t.after(() => void (p.pid && alive(p.pid) && process.kill(-p.pid, 'SIGKILL')));
  return p.pid!;
};

test(
  'a long-lived attached session takes turns, is interrupted, parks between turns and resumes under the next holder',
  WAITED,
  async (t) => {
    const s = story(t);
    const prompt = path.join(scratch('ae-attached-kept-prompt-'), 'agent.md');
    fs.writeFileSync(prompt, 'you are the agent');
    const { root, dir, request } = kept({ hold: true, output: {} }, { claude: { remoteControl: true, appendSystemPromptFile: prompt } });
    const end = () => fs.writeFileSync(path.join(dir, 'end'), '');
    const say = (h: Awaited<ReturnType<typeof holder>>, words: string) =>
      Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, words));
    const first = await holder(root);
    let firstHeld = true;
    let second: Awaited<ReturnType<typeof holder>> | undefined;
    t.after(async () => {
      end();
      if (firstHeld) await first.close();
      await second?.close();
    });
    let sessionId = '';
    let bridgeSessionId: string | undefined;

    await s.test("it is started on Claude Code's own system prompt, the agent's appended as text and never as a flag", async (st) => {
      await Effect.runPromise(first.attached.ops.spawn(request));
      const init = await until(
        st,
        () => lines(dir, 'initialize.jsonl')[0] as { systemPrompt?: unknown; appendSystemPrompt?: unknown } | undefined,
        'the SDK sent an initialize request',
        { everyMs: 50 },
      );
      assert.equal(
        init.systemPrompt,
        undefined,
        `the preset sends no prompt of ours, so Claude Code renders its own; it sent ${JSON.stringify(init.systemPrompt)}`,
      );
      assert.equal(
        init.appendSystemPrompt,
        'you are the agent',
        "the agent's own prompt is appended on the initialize request (`sdk.d.ts:4687`), as its text and not its file's path",
      );
      const [argv] = lines(dir, 'argv.jsonl') as string[][];
      assert.ok(!argv.includes('--append-system-prompt-file'), "the prompt is no flag: the SDK carries it in the session's init");
      assert.ok(!argv.includes('--system-prompt'), "no prompt of ours is spawned: the preset is Claude Code's own");
    });

    await s.test('its first turn ends without ending it: idle, held by this process, read by decide as open between turns', async (st) => {
      end();
      const firstIdle = await idle(st, root);
      assert.ok(firstIdle.sessionId, 'the idle run file keeps the session id a resume continues');
      sessionId = firstIdle.sessionId;
      const seen = (await sighted(first))!;
      assert.deepEqual(
        [seen.state, seen.held, seen.pid],
        ['input-required', true, process.pid],
        'its sighting says a person is waited on and this process holds it',
      );
      assert.deepEqual(read(seen), { idle: true, respawning: false }, 'and `decide` reads it as a session open between turns');
    });

    await s.test('the claude.ai bridge it asked for is opened after that first turn, its state kept and its link sighted', async (st) => {
      const bridged = await until(st, () => run(root)?.bridge?.url && run(root)!, 'the bridge opened', { everyMs: 50 });
      assert.equal(bridged.bridge?.bridgeSessionId, 'cse_stand-in-session');
      assert.equal(bridged.bridge?.url, 'https://claude.ai/s/cse_stand-in-session');
      assert.equal(bridged.bridge?.environmentId, 'env-stand-in');
      assert.equal(bridged.bridge?.epoch, 1);
      bridgeSessionId = bridged.bridge?.bridgeSessionId;
      await until(st, () => run(root)?.bridge?.state === 'connected', 'the bridge connected, as its stream said', { everyMs: 50 });
      assert.equal(taken(dir).filter((r) => r.subtype === 'remote_control').length, 1, 'one bridge control request, after its first turn');
      assert.deepEqual(
        (await sighted(first))!.bridge,
        { url: 'https://claude.ai/s/cse_stand-in-session' },
        'its sighting carries the link',
      );
    });

    await s.test('words said begin a turn of their own, written working as they are pushed, on the one Claude Code', async (st) => {
      await say(first, 'one more thing');
      assert.equal(run(root)?.state, 'working', 'the words it heard began a turn of their own, written as they were pushed');
      assert.equal(
        (await sighted(first))?.state,
        'working',
        'a session answering again is no session waiting on a person: its turn can be ended',
      );
      await until(st, () => saidIn(dir).includes('one more thing'), 'the second turn heard', { everyMs: 50 });
      assert.deepEqual(saidIn(dir), ['do the work', 'one more thing'], 'one session, two turns');
      assert.equal(lines(dir, 'argv.jsonl').length, 1, 'and one Claude Code, never restarted between them');
    });

    await s.test('an interrupt ends the turn and never the session: idle under the same id, one interrupt request sent', async (st) => {
      await Effect.runPromise(first.attached.ops.interrupt!({ name: NAME, sessionId: NAME }));
      const cut = await idle(st, root, 'the interrupted turn ended');
      assert.equal(cut.state, 'idle', 'an `error_during_execution` result ends the turn, not the session');
      assert.equal((await sighted(first))?.state, 'input-required');
      assert.equal(cut.sessionId, sessionId, 'the same session, interrupted');
      assert.equal(interrupts(dir), 1, 'one interrupt control request, and one only');
    });

    await s.test('words said while a turn runs leave it answering until the turn that answered them ends', async (st) => {
      await say(first, 'carry on then');
      await say(first, 'and this too');
      await until(st, () => saidIn(dir).length === 4, 'the words it heard are worked as a turn of their own', { everyMs: 50 });
      const before = resultsOf(root);
      end();
      await until(st, () => resultsOf(root) === before + 1, 'the turn ended, with a result that did not name the words', {
        everyMs: 50,
      });
      assert.equal(run(root)?.state, 'working', 'the turn ended, and the words it did not answer leave the session answering');
      assert.equal(
        (await sighted(first))?.state,
        'working',
        'so its sighting says a turn of it can still be ended, never that it waits on a person',
      );
      end();
      const after = await idle(st, root, 'and it is idle once the turn that answered them ends');
      assert.ok(saidIn(dir).includes('carry on then'), 'the turn after the interrupt heard the words');
      assert.equal(after.sessionId, sessionId, 'the same session answered after the interrupt');
    });

    await s.test("an interrupt asked by another process is honoured on the holder's next look, and its file goes", async (st) => {
      await say(first, 'one last turn');
      await until(st, () => saidIn(dir).includes('one last turn'), 'the next turn heard', { everyMs: 50 });
      const other = claudeCodeOps({ root }, attachedSessions(root, STAND_IN));
      await Effect.runPromise(other.interrupt!({ name: NAME, sessionId: NAME }));
      assert.ok(fs.existsSync(filesOf(root, NAME).interrupt), 'a process that holds nothing leaves the ask on a file of its own');
      await until(
        st,
        async () => {
          await sighted(first);
          return run(root)?.state === 'idle';
        },
        "the holder's look honoured the ask",
        { everyMs: 50 },
      );
      assert.equal(fs.existsSync(filesOf(root, NAME).interrupt), false, 'the ask goes once the request was sent');
      assert.equal(interrupts(dir), 2, 'the ask was sent as one interrupt control request');
      const refused = await Effect.runPromise(Effect.flip(other.interrupt!({ name: NAME, sessionId: NAME })));
      assert.match(refused.message, /is idle, so it has no turn to end/, 'and an idle session has no turn to end');
    });

    await s.test("REFUSED: an ask that reached the file after its turn ended is dropped on the holder's look, never kept", async () => {
      fs.writeFileSync(filesOf(root, NAME).interrupt, '4242');
      await sighted(first);
      assert.equal(fs.existsSync(filesOf(root, NAME).interrupt), false, 'the ask goes: there is no turn to end');
      assert.equal(interrupts(dir), 2, 'and nothing was asked of the session, so its next turn runs to its own end');
    });

    await s.test('let go between turns, it is parked, and the next holder resumes it under the same Claude Code id', async (st) => {
      firstHeld = false;
      await first.close();
      assert.equal(run(root)?.state, 'parked', 'a session let go between turns is parked for the next holder');
      const parked = run(root)!;
      const { epoch, ...bridgeKept } = parked.bridge!;
      assert.notEqual(epoch, undefined, 'the parked run file keeps the bridge the first holder opened');
      writeRun(root, { ...parked, bridge: bridgeKept });
      second = await holder(root);
      await sighted(second);
      await until(st, () => lines(dir, 'argv.jsonl').length === 2, 'the next holder started its Claude Code', { everyMs: 50 });
      const [, argv] = lines(dir, 'argv.jsonl') as string[][];
      assert.ok(argv.includes(`--resume=${sessionId}`), 'resumed by its own id');
      end();
      const after = await idle(st, root, 'the resumed session idle again');
      assert.equal(after.sessionId, sessionId, 'the same Claude Code session, resumed');
      assert.equal(after.carried?.costUsd ?? null, null, 'and a session resumed by its own holder carries nothing of a parent');
      await say(second, 'and now this');
      await until(st, () => saidIn(dir).includes('and now this'), 'and she answers the next words', { everyMs: 50 });
    });

    await s.test('the resume re-attaches the claude.ai session its run file kept', async (st) => {
      const asked = await until(
        st,
        () => taken(dir).filter((r) => r.subtype === 'remote_control')[1],
        'the bridge asked for again by the next holder',
        { everyMs: 50 },
      );
      assert.ok(bridgeSessionId, 'the first holder kept a claude.ai session');
      assert.equal(asked.reattach_session_id, bridgeSessionId, 'the request names the kept claude.ai session, not a new one');
      const again = await until(st, () => run(root)?.bridge?.epoch !== undefined && run(root)!, 'the bridge opened again', {
        everyMs: 50,
      });
      assert.equal(again.bridge?.bridgeSessionId, bridgeSessionId, 'the kept claude.ai session is re-attached');
    });
  },
);

test('a long-lived session asked for no bridge folds words said into its call’s turn, one result answering both', WAITED, async (t) => {
  const s = story(t);
  const { root, dir, request } = kept({ hold: true, fold: true, output: {} });
  const h = await holder(root);
  t.after(h.close);

  await s.test('words folded into the turn in flight are answered by its one result, which leaves the session idle', async (st) => {
    await Effect.runPromise(h.attached.ops.spawn(request));
    await until(st, () => run(root)?.sessionId, 'the session started its first turn', { everyMs: 50 });
    await Effect.runPromise(h.attached.ops.say!({ name: NAME, sessionId: NAME }, 'and this too'));
    assert.equal(run(root)?.state, 'working', 'the words it heard are a turn of its own until a result says otherwise');
    assert.deepEqual(
      await until(st, () => saidIn(dir).length === 2 && saidIn(dir), 'the turn in flight heard the words', { everyMs: 50 }),
      ['do the work', 'and this too'],
      'both were said, into the turn in flight',
    );
    fs.writeFileSync(path.join(dir, 'end'), '');
    const results = await until(st, () => resultsOf(root) || undefined, 'the turn ended, with a result', { everyMs: 50 });
    assert.equal(results, 1, 'the words it folded in ended in the turn it folded them into, so one result answers both');
    assert.equal(run(root)?.state, 'idle', 'one result named both messages, so nothing of it is left unanswered');
  });

  await s.test('a request that asks for no bridge never sends the bridge control request', () => {
    assert.deepEqual(
      taken(dir).map((r) => r.subtype),
      ['initialize'],
      'the SDK asked it to initialize and nothing else',
    );
    assert.equal(run(root)?.bridge, undefined, 'and its run file says nothing of a bridge');
  });
});

test(
  'a look at a run file: the harness’s words translated, a non-holder adopting nothing, a holder gone said not held',
  WAITED,
  async (t) => {
    await t.test('attachedStateOf: idle is input-required, parked is working, every other state is itself', () => {
      const of = (state: AttachedRun['state']) =>
        attachedStateOf({ name: NAME, state, owner: 1, startedAt: '2026-01-01T00:00:00.000Z', request: {} });
      assert.equal(of('idle'), 'input-required', 'a long-lived session between turns waits on a person');
      assert.equal(of('parked'), 'working', 'a session let go is taken up on the next look');
      assert.deepEqual((['working', 'completed', 'failed', 'canceled'] as const).map(of), ['working', 'completed', 'failed', 'canceled']);
    });

    await t.test('a non-holder sees an orphaned session at work and adopts nothing', async () => {
      const { root, dir, request } = place({});
      writeRun(root, {
        name: NAME,
        state: 'parked',
        owner: process.pid,
        startedAt: new Date().toISOString(),
        sessionId: 'left-alone',
        request: { ...request, brief: undefined },
      });
      const attached = attachedSessions(root, STAND_IN);
      const ops = claudeCodeOps({ root }, attached);
      assert.equal((await Effect.runPromise(ops.observe)).get(NAME)?.state, 'working');
      assert.deepEqual(lines(dir, 'argv.jsonl'), [], 'no session was started');
      assert.equal(run(root)?.state, 'parked');
      assert.equal(attached.holding(), false);
    });

    await t.test(
      'a long-lived session whose holder is gone says its process is not held, so decide reads it as one being taken up',
      async () => {
        const { root, request } = kept({ output: {} });
        writeRun(root, {
          name: NAME,
          state: 'idle',
          owner: 2_147_483_600,
          ownerStart: 'a holder long gone',
          startedAt: new Date().toISOString(),
          sessionId: 'left-idle',
          request: { ...request, brief: undefined },
        });
        const seen = (await Effect.runPromise(attachedSessions(root, STAND_IN).ops.observe)).get(NAME)!;
        assert.deepEqual([seen.state, seen.held, seen.pid], ['input-required', false, undefined]);
        assert.deepEqual(read(seen), { idle: false, respawning: true }, 'never idle, so no end of it is recorded under its feet');
      },
    );
  },
);

test(
  'a session is spawned as its task asked: its prompt, its servers and window, its parent’s cost left out, a call that would ask denied',
  WAITED,
  async (t) => {
    const s = story(t);
    const prompt = path.join(scratch('ae-attached-prompt-'), 'agent.md');
    fs.writeFileSync(prompt, 'you are the agent');
    const { root, dir, request } = place(
      { ask: 'Write', output: {}, cost: 0.4 },
      { claude: { appendSystemPromptFile: prompt }, contextTokens: 150_000, mcp: { probe: { command: 'probe-server', args: ['--once'] } } },
    );
    const stale = filesOf(root, NAME).mcp;
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.writeFileSync(stale, JSON.stringify({ mcpServers: { gone: { command: 'a server it was not given' } } }));
    const parent = 'ae/t0/1';
    writeRun(root, {
      name: parent,
      state: 'completed',
      owner: process.pid,
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      sessionId: 'parent-session',
      request: {},
    });
    const result = {
      type: 'result',
      subtype: 'success',
      is_error: false,
      session_id: 'parent-session',
      num_turns: 1,
      total_cost_usd: 0.25,
    };
    fs.writeFileSync(filesOf(root, parent).out, `${JSON.stringify(result)}\n`);
    const h = await holder(root);
    t.after(h.close);
    let seen: Sighting | undefined;

    await s.test('it runs to its end, resumed from its parent', async (st) => {
      await Effect.runPromise(h.attached.ops.spawn({ ...request, resumeFrom: 'parent-session' }));
      seen = await until(
        st,
        async () => {
          const got = await sighted(h);
          return got?.state === 'completed' && got;
        },
        'the session completed',
        { everyMs: 50 },
      );
    });

    await s.test("it is started on Claude Code's own system prompt, the agent's appended to it", () => {
      const [init] = lines(dir, 'initialize.jsonl') as { systemPrompt?: unknown; appendSystemPrompt?: unknown }[];
      assert.ok(init, 'the SDK sent an initialize request');
      assert.equal(
        init.systemPrompt,
        undefined,
        `the preset sends no prompt of ours, so Claude Code renders its own; it sent ${JSON.stringify(init.systemPrompt)}`,
      );
      assert.equal(init.appendSystemPrompt, 'you are the agent', "the agent's own prompt is appended on the initialize request");
      const [argv] = lines(dir, 'argv.jsonl') as string[][];
      assert.ok(!argv.includes('--append-system-prompt-file'), "the prompt is no longer a flag: the SDK carries it in the session's init");
      assert.ok(!argv.includes('--system-prompt'), "no prompt of ours is spawned: the preset is Claude Code's own");
    });

    await s.test('its servers ride the child’s argv as inline JSON, strict, and the window rides the settings', () => {
      const [argv] = lines(dir, 'argv.jsonl') as string[][];
      assert.deepEqual(
        JSON.parse(sdkArgValue(argv, '--mcp-config')),
        { mcpServers: { probe: { command: 'probe-server', args: ['--once'] } } },
        'the servers themselves, inline, where the runtime used to name a file of its own',
      );
      assert.ok(argv.includes('--strict-mcp-config'), '`strictMcpConfig` is still the fence');
      assert.equal(fs.existsSync(stale), false, 'a config an older runtime left under this name is cleared at the spawn, never read');
      assert.ok(!argv.includes('--autocompact'), 'the window is no flag of ours any more');
      assert.deepEqual(
        JSON.parse(sdkArgValue(argv, '--settings')),
        { autoMemoryEnabled: false, autoCompactWindow: 150_000 },
        'it rides the one settings object, beside auto-memory off: `Settings.autoCompactWindow`, which the SDK spells as `--settings`',
      );
    });

    await s.test("resuming another, it reports its own cost, its parent's left out", () => {
      assert.ok(Math.abs((seen?.usage?.costUsd ?? 0) - 0.15) < 1e-9, `its own cost, not ${seen?.usage?.costUsd}`);
    });

    await s.test('a call that would ask a person is denied in the holder, and written as a denial', () => {
      const [asked] = lines(dir, 'answers.jsonl') as { answer: { behavior: string; message: string } }[];
      assert.equal(asked.answer.behavior, 'deny');
      assert.deepEqual(
        seen?.denials?.map((d) => d.tool),
        ['Write'],
      );
    });
  },
);

test(
  'an engine that holds nothing reaches the session another holds: its words heard, refused to no session, its stop cancelling it',
  WAITED,
  async (t) => {
    const s = story(t);
    const { root, dir, request } = place({ hold: true, output: {} });
    t.after(() => fs.writeFileSync(path.join(dir, 'end'), ''));
    const h = await holder(root);
    t.after(h.close);
    const other = claudeCodeOps({ root }, attachedSessions(root, STAND_IN));

    await s.test('words said by an engine that holds nothing reach the session its holder runs, each heard once', async (st) => {
      await Effect.runPromise(h.attached.ops.spawn(request));
      await until(st, () => run(root)?.sessionId, 'the session started', { everyMs: 50 });
      await Effect.runPromise(other.say!({ name: NAME, sessionId: NAME }, 'one more thing'));
      await until(
        st,
        async () => {
          await sighted(h);
          return saidIn(dir).includes('one more thing');
        },
        'the words heard',
        { everyMs: 50 },
      );
      await sighted(h);
      assert.deepEqual(saidIn(dir), ['do the work', 'one more thing'], 'each word heard once');
    });

    await s.test('REFUSED: words to no session are refused', async () => {
      const refused = await Effect.runPromise(Effect.flip(h.attached.ops.say!({ name: 'ae/none/1', sessionId: 'ae/none/1' }, 'hello')));
      assert.ok(refused.message.includes('not an attached session'));
    });

    await s.test('a stop from an engine that holds nothing cancels the session its holder runs', async (st) => {
      await Effect.runPromise(other.stop(NAME));
      await until(st, async () => (await sighted(h))?.state === 'canceled', 'the session canceled', { everyMs: 50 });
    });
  },
);

test('the next holder takes up a session left behind: what it tells the session, and which process it kills', WAITED, async (t) => {
  await t.test('a parked session is resumed under the same id, told to carry on', async (rt) => {
    const { root, dir, request } = place({ output: { done: 1 } });
    writeRun(root, {
      name: NAME,
      state: 'parked',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'the-same-session',
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    rt.after(h.close);
    const seen = await until(
      rt,
      async () => {
        const got = await sighted(h);
        return got?.state === 'completed' && got;
      },
      'the resumed session completed',
      { everyMs: 50 },
    );
    assert.equal(seen.nativeId, 'the-same-session');
    const [argv] = lines(dir, 'argv.jsonl') as string[][];
    assert.ok(argv.includes('--resume=the-same-session'), 'the session is resumed by its own id');
    assert.ok(!argv.includes('--fork-session'), 'a resume continues the session, never forks it');
    assert.deepEqual(saidIn(dir), [CARRY_ON]);
    assert.deepEqual(seen.closeout, { payload: { done: 1 } });
  });

  await t.test("a session cut at its holder's bound is resumed told which call did not finish", async (rt) => {
    const { root, dir, request } = place({ output: { done: 1 } });
    writeRun(root, {
      name: NAME,
      state: 'parked',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'cut-session',
      calling: { tool: 'Agent', since: new Date().toISOString() },
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    rt.after(h.close);
    await sighted(h);
    await until(rt, () => saidIn(dir).length, 'the resumed session told something', { everyMs: 50 });
    assert.deepEqual(saidIn(dir), [crashNote('Agent')]);
    assert.notDeepEqual(saidIn(dir), [CARRY_ON], 'a session whose call was cut is never told to carry on');
  });

  await t.test(
    'a session whose holder died mid-call is resumed told which call did not finish, its old Claude Code killed first',
    async (rt) => {
      const { root, dir, request } = place({ output: { done: 1 } });
      const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
      await new Promise((r) => dead.once('exit', r));
      const left = squatter(rt);
      writeRun(root, {
        name: NAME,
        state: 'working',
        owner: dead.pid!,
        startedAt: new Date().toISOString(),
        sessionId: 'crashed-session',
        childPid: left,
        childStart: processStart(left),
        calling: { tool: 'Bash', since: new Date().toISOString() },
        request: { ...request, brief: undefined },
      });
      const h = await holder(root);
      rt.after(h.close);
      await sighted(h);
      await until(rt, () => saidIn(dir).length, 'the resumed session told something', { everyMs: 50 });
      assert.equal(alive(left), false, "the dead holder's Claude Code is killed before the resume");
      assert.deepEqual(saidIn(dir), [crashNote('Bash')]);
      assert.deepEqual(saidIn(dir), ['the daemon stopped during its call to Bash and the call did not finish']);
    },
  );

  await t.test('a session at work under a pid another process has taken since is adopted, its holder gone', async (rt) => {
    const { root, dir, request } = place({ output: { done: 1 } });
    const taker = squatter(rt);
    writeRun(root, {
      name: NAME,
      state: 'working',
      owner: taker,
      ownerStart: 'when its holder started, not this process',
      startedAt: new Date().toISOString(),
      sessionId: 'reused-pid',
      calling: { tool: 'Bash', since: new Date().toISOString() },
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    rt.after(h.close);
    await sighted(h);
    await until(rt, () => saidIn(dir).length, 'the adopted session told something', { everyMs: 50 });
    assert.deepEqual(saidIn(dir), [crashNote('Bash')]);
    assert.equal(alive(taker), true, "the process that took the pid is not the session's, and is left alone");
    assert.equal(run(root)?.owner, thisHolder().owner);
    assert.equal(run(root)?.ownerStart, thisHolder().ownerStart);
  });

  await t.test("adopting a session leaves alone a process that has taken its Claude Code's pid since", async (rt) => {
    const { root, dir, request } = place({ output: { done: 1 } });
    const taker = squatter(rt);
    writeRun(root, {
      name: NAME,
      state: 'parked',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'pid-taken',
      childPid: taker,
      childStart: "when the session's Claude Code started, not this process",
      request: { ...request, brief: undefined },
    });
    const h = await holder(root);
    rt.after(h.close);
    await sighted(h);
    await until(rt, () => run(root)?.state === 'completed', 'the session resumed and completed', { everyMs: 50 });
    assert.deepEqual(saidIn(dir), [CARRY_ON]);
    assert.equal(alive(taker), true, 'the process that took the pid is not killed');
  });
});

test(
  'a drain holds the new calls of the holder it names, and none of another process, a pid gone since, a nested or a sub-agent’s call',
  WAITED,
  async (t) => {
    await t.test('a drain naming the holder holds its new call until lifted; one naming another process holds nothing', async (rt) => {
      const { root, dir, request } = place({ call: 'Read', output: {} });
      fs.writeFileSync(path.join(dir, 'release'), '');
      putDrain(root, process.pid);
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      assert.equal(await until(rt, () => run(root)?.heldBack, 'the call held at its hook', { everyMs: 50 }), 1);
      assert.deepEqual(lines(dir, 'answers.jsonl'), [], 'the call waits at its hook while drained');
      assert.equal(run(root)?.calling, undefined, 'a call held is not in flight');
      putDrain(root, process.pid + 1_000_000);
      await until(rt, () => run(root)?.state === 'completed', 'the call let through and the session completed', { everyMs: 50 });
      assert.equal(run(root)?.heldBack, undefined, 'no call waits once the drain names another process');
    });

    await t.test('a drain naming this pid with another start time holds nothing: it was put for a process gone since', async (rt) => {
      const { root, dir, request } = place({ call: 'Read', output: {} });
      fs.writeFileSync(path.join(dir, 'release'), '');
      putDrain(root, process.pid);
      assert.ok(
        JSON.parse(fs.readFileSync(path.join(attachedDir(root), 'drain.json'), 'utf8')).start,
        'a drain says when its holder started',
      );
      fs.writeFileSync(path.join(attachedDir(root), 'drain.json'), JSON.stringify({ pid: process.pid, start: 'an earlier process' }));
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      await until(rt, () => run(root)?.state === 'completed', 'the call let through and the session completed', { everyMs: 50 });
    });

    await t.test('a drain answers a call nested in one in flight, so the call in flight can end and the holder can let go', async (rt) => {
      const { root, dir, request } = place({ call: 'Bash', nested: 'Grep', output: {} });
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      assert.equal((await inCall(rt, root)).tool, 'Bash');
      putDrain(root, process.pid);
      fs.writeFileSync(path.join(dir, 'nest'), '');
      await until(rt, () => lines(dir, 'answers.jsonl').length >= 2, "the nested call's hook answered", { everyMs: 50 });
      assert.deepEqual(
        (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
        ['PreToolUse', 'PreToolUse'],
        'the nested call is answered while the drain names this holder',
      );
      assert.equal(run(root)?.calling?.tool, 'Bash', 'the call in flight is still the first of the two');
      fs.writeFileSync(path.join(dir, 'release'), '');
      await until(rt, () => run(root)?.state === 'completed', 'the call in flight ran to its end', { everyMs: 50 });
    });

    await t.test("a drain answers a sub-agent's call, which belongs to a call it cannot see in flight", async (rt) => {
      const { root, dir, request } = place({ nested: 'Grep', fromSubAgent: true, output: {} });
      fs.writeFileSync(path.join(dir, 'nest'), '');
      putDrain(root, process.pid);
      const h = await holder(root);
      rt.after(h.close);
      await Effect.runPromise(h.attached.ops.spawn(request));
      await until(rt, () => run(root)?.state === 'completed', "the sub-agent's call let through and the session completed", {
        everyMs: 50,
      });
      assert.deepEqual(
        (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
        ['PreToolUse'],
        "the sub-agent's call never waited at its hook",
      );
      assert.equal(run(root)?.heldBack, undefined, "a call marked as a sub-agent's is never counted as held back");
    });
  },
);

test('a call held at its hook as the holder lets go is never written in flight: the session is parked with no call', WAITED, async (t) => {
  const { root, dir, request } = place({ call: 'Read', output: {} });
  fs.writeFileSync(path.join(dir, 'release'), '');
  putDrain(root, process.pid);
  const h = await holder(root);
  await Effect.runPromise(h.attached.ops.spawn(request));
  await until(t, () => lines(dir, 'asked.jsonl').length, 'the call asked its hook', { everyMs: 50 });
  await h.close();
  assert.equal(run(root)?.state, 'parked');
  assert.equal(run(root)?.calling, undefined, 'the next holder is told of no call that did not finish');
});

/**
 * A session its holder can never wait out, as the let-go finds it in `live`: a call in flight that never ends, a `done` that never
 * settles and a call held at a hook that never lets go, so each of the let-go's three waits runs to whatever it was given. `facts`
 * are written on its run file. Nothing of the session's input is modelled: the let-go reads none of it.
 *
 * The budget is the purse's, and the purse spends it on the clock: a wait given 800 ms whose elapsed `monoNow` reads as 799 — it
 * keeps whole milliseconds — leaves 201 for the next, so what was given can stand one millisecond per take above the budget. The
 * sum is held to that, never to a wall-clock bound: the share is a ceiling on the long wait, never a floor on the short ones
 * (`letGoOf`, `harness/claude/attached.ts`), so a take debited its whole allowance would leave the last wait nothing.
 */
const stuck = (facts: Partial<Parameters<typeof writeRun>[1]> = {}): Live =>
  ({
    run: {
      name: NAME,
      state: 'working',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'never-ends',
      calling: { tool: 'Agent', since: new Date().toISOString() },
      request: {},
      ...facts,
    },
    abort: new AbortController(),
    calls: new Map([['call-1', { tool: 'Agent', since: new Date().toISOString() }]]),
    letGo: false,
    waiting: 1,
    done: new Promise<void>(() => undefined),
  }) as unknown as Live;

/** The let-go of `live` under a budget of `ms`, its lines dropped, and the purse its waits took from. */
const letGone = async (root: string, live: Map<string, Live>, ms: number) => {
  const purse = purseOf(ms, instantNow);
  const quiet = Logger.make(() => undefined);
  await Effect.runPromise(letGoOf(root, live, ms, purse).pipe(Effect.provide(Logger.layer([quiet]))));
  return purse;
};

test(
  'a let-go: it waits for the call in flight, and within its one budget, cuts what never ends and parks the session',
  WAITED,
  async (t) => {
    await t.test('a holder let go waits for the call in flight, then parks the session, its Claude Code gone', async (rt) => {
      const { root, dir, request } = place({ call: 'Bash', hold: true, output: { ok: true } });
      const h = await holder(root);
      await Effect.runPromise(h.attached.ops.spawn(request));
      assert.equal((await inCall(rt, root)).tool, 'Bash');
      let closed = false;
      const closing = h.close().then(() => (closed = true));
      await until(rt, () => lines(dir, 'answers.jsonl').length >= 1, 'the call asked its hook', { everyMs: 50 });
      assert.equal(closed, false, 'the let-go waits for the call in flight');
      assert.equal(run(root)?.state, 'working');
      fs.writeFileSync(path.join(dir, 'release'), '');
      await closing;
      assert.deepEqual(
        lines(dir, 'asked.jsonl'),
        ['PreToolUse', 'PostToolUse'],
        "the call ran to its end, its end asked of the session's hook, before the let-go parked it",
      );
      assert.equal(run(root)?.state, 'parked');
      assert.equal(run(root)?.calling, undefined);
      assert.equal(run(root)?.childPid, undefined, 'a parked session names no Claude Code: the let-go ended it');
      assert.equal(alive(Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'))), false, "the session's Claude Code is gone");
    });

    await t.test(
      'a holder that cannot let go within its bound cuts the call, keeps it on the run file, and parks the session',
      async (rt) => {
        const { root, dir, request } = place({ call: 'Bash', output: {} });
        const h = await holder(root, 1_000);
        await Effect.runPromise(h.attached.ops.spawn(request));
        assert.equal((await inCall(rt, root)).tool, 'Bash');
        await h.close();
        assert.equal(run(root)?.state, 'parked', 'the let-go returned rather than wait for a call that never ends');
        assert.equal(run(root)?.calling?.tool, 'Bash', 'the call it cut is kept, so the next holder knows which did not finish');
        assert.deepEqual(
          (lines(dir, 'answers.jsonl') as { event: string }[]).map((a) => a.event),
          ['PreToolUse'],
          'the call never ended: its PostToolUse was never asked',
        );
        const child = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
        await until(rt, () => !alive(child), "the session's Claude Code gone: the park ended it", { everyMs: 20 });
        assert.deepEqual(
          h.said,
          [
            'Info letting go of 1 session(s): waiting at most 1000 ms for 1 call(s) in flight (ae/t1/1 Bash)',
            'Warn ae/t1/1 is cut in its call to Bash: it did not end within 1000 ms, and the next holder resumes the session told the call ' +
              'did not finish',
          ],
          'it says it is letting go and how many calls it waits for, then names each session it cut and the call it cut it in',
        );
      },
    );

    await t.test('a let-go whose session never ends returns all the same, its three waits inside one budget', async () => {
      const { root } = place({});
      const purse = await letGone(root, new Map([[NAME, stuck()]]), 1_000);
      assert.equal(purse.given.length, 3, 'each of its three waits took from the one purse, so each of them is bounded');
      assert.ok(
        purse.given.reduce((a, b) => a + b, 0) <= 1_000 + purse.given.length,
        `the waits of one let-go add up to no more than its budget, not ${purse.given.join(' + ')}`,
      );
      assert.ok(purse.given[0] > 0 && purse.given[1] > 0, 'and the waits before the last each had something to wait with');
      assert.equal(run(root)?.state, 'parked', 'it parked the session it could not wait out');
      assert.equal(run(root)?.calling?.tool, 'Agent', 'keeping the call it cut');
    });

    await t.test("the park leaves alone a process that has taken the session's Claude Code's pid since", async (rt) => {
      const { root } = place({});
      const taker = squatter(rt);
      const facts = { childPid: taker, childStart: "when the session's Claude Code started, not this process" };
      await letGone(root, new Map([[NAME, stuck(facts)]]), 1_000);
      assert.equal(alive(taker), true, "the process that took the pid is not the session's, and the park left it alone");
      assert.equal(run(root)?.state, 'parked');
      assert.equal(run(root)?.childPid, undefined, 'and the parked file names no Claude Code of its own');
    });
  },
);

/** The results of the session's capture, each its `subtype` and the `total_cost_usd` it printed, in order. */
const resultsIn = (root: string) =>
  (fs.existsSync(filesOf(root, NAME).out) ? fs.readFileSync(filesOf(root, NAME).out, 'utf8').split('\n').filter(Boolean) : [])
    .map((l) => JSON.parse(l) as { type?: string; subtype?: string; total_cost_usd?: number })
    .filter((l) => l.type === 'result')
    .map((l) => ({ subtype: l.subtype, total: l.total_cost_usd }));

/** The running totals the stand-in saved as it exited cleanly, in order (`fixtures/stand-in-claude.ts`). */
const costStates = (dir: string) => (lines(dir, 'cost-state.jsonl') as { totalCostUSD: number }[]).map((l) => l.totalCostUSD);

/** Whether two costs are the same, to the cent's billionth: a sum of floats is not exact. */
const sameCost = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;

test("a session cut by its holder's let-go and resumed by the next holder costs what both of its processes spent", WAITED, async (t) => {
  const s = story(t);
  const { root, dir, request } = place({ call: 'Bash', cost: 0.5, output: {} });
  const first = await holder(root, 1_000);
  let next: Awaited<ReturnType<typeof holder>> | undefined;
  t.after(async () => {
    await next?.close();
  });

  await s.test('cut in its call, its Claude Code prints the turn it spent and saves its total before it is gone', async (st) => {
    await Effect.runPromise(first.attached.ops.spawn(request));
    assert.equal((await inCall(st, root)).tool, 'Bash');
    const child = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8'));
    await first.close();
    assert.equal(run(root)?.state, 'parked');
    assert.equal(run(root)?.calling?.tool, 'Bash', 'the call it cut is kept');
    assert.deepEqual(resultsIn(root), [{ subtype: 'error_during_execution', total: 0.5 }], 'the interrupted turn printed what it spent');
    assert.deepEqual(costStates(dir), [0.5], 'and Claude Code saved its running total as it ended');
    assert.equal(alive(child), false, "the session's Claude Code is gone once the let-go returns");
    assert.equal(run(root)?.childPid, undefined, 'and the parked file names it no more');
  });

  await s.test("the next holder resumes it, and the attempt's cost is the sum of both processes", async (st) => {
    fs.writeFileSync(path.join(dir, 'release'), '');
    next = await holder(root);
    const seen = await until(
      st,
      async () => {
        const got = await sighted(next!);
        return got?.state === 'completed' && got;
      },
      'the resumed session completed',
      { everyMs: 50 },
    );
    const [, argv] = lines(dir, 'argv.jsonl') as string[][];
    assert.ok(argv.includes('--resume=stand-in-session'), 'the session is resumed by its own id');
    assert.ok(sameCost(seen.usage?.costUsd, 1), `0.5 for the cut process and 0.5 for its resume, not ${seen.usage?.costUsd}`);
  });
});

test("what the next holder's sighting counts of a session's cost, by how its last holder ended", WAITED, async (t) => {
  await t.test('let go between turns, its spend is counted once: carried on by the resume, never added again', async (rt) => {
    const { root, dir, request } = kept({ cost: 0.5, output: {} });
    const first = await holder(root);
    await Effect.runPromise(first.attached.ops.spawn(request));
    await idle(rt, root);
    await first.close();
    assert.deepEqual(costStates(dir), [0.5], 'the session parked between turns saved its total as its input ended');
    const next = await holder(root);
    rt.after(next.close);
    await sighted(next);
    await until(rt, () => resultsIn(root).length === 2, 'the resumed turn ended', { everyMs: 50 });
    const seen = await sighted(next);
    assert.ok(sameCost(seen?.usage?.costUsd, 1), `0.5 a turn, twice, not ${seen?.usage?.costUsd}`);
  });

  await t.test('its holder killed outright, the spend of the process it cut is lost: an undercount, never a double count', async (rt) => {
    const { root, request } = kept({ cost: 0.5, output: {} });
    const killed = { type: 'result', subtype: 'success', is_error: false, session_id: 'stand-in-session', total_cost_usd: 0.5 };
    fs.mkdirSync(path.dirname(filesOf(root, NAME).out), { recursive: true });
    fs.writeFileSync(filesOf(root, NAME).out, `${JSON.stringify(killed)}\n`);
    writeRun(root, {
      name: NAME,
      state: 'parked',
      owner: process.pid,
      startedAt: new Date().toISOString(),
      sessionId: 'stand-in-session',
      request: { ...request, brief: undefined },
    });
    const next = await holder(root);
    rt.after(next.close);
    await sighted(next);
    await until(rt, () => resultsIn(root).length === 2, 'the resumed turn ended', { everyMs: 50 });
    const seen = await sighted(next);
    assert.ok(sameCost(seen?.usage?.costUsd, 0.5), `the resume's own 0.5, its killed parent's saved nowhere, not ${seen?.usage?.costUsd}`);
  });
});

test('a denial is journalled while the attempt is at work, before its result', WAITED, async (t) => {
  const { root, dir, request } = place({ deny: 'WebFetch', hold: true, output: {} });
  const attached = attachedSessions(root, STAND_IN);
  const scope = Scope.makeUnsafe();
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  const layer = Engine.layer({ root, harnesses: { claude: claudeCodeOps({ root }, attached) } });
  const go = <A>(f: (e: Engine['Service']) => Effect.Effect<A, unknown>) =>
    Effect.runPromise(Effect.flatMap(Engine, f).pipe(Effect.provide(layer)) as Effect.Effect<A>);
  const id = await go((e) => e.file({ brief: request.brief, cwd: dir, config: request.config }));
  t.after(async () => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
  const denied = await until(
    t,
    async () => {
      await go((e) => e.tick());
      const view = await go((e) => e.view(id));
      return view.state.attempts.at(-1)?.denials?.length ? view : undefined;
    },
    'the denial journalled',
    { everyMs: 100 },
  );
  assert.equal(denied.phase.startsWith('running'), true, 'the attempt is still at work');
  assert.deepEqual(
    denied.state.attempts.at(-1)?.denials?.map((d) => d.tool),
    ['WebFetch'],
  );
});

test('a spawn whose options are refused leaves no run file behind: no held sighting of a session that never started', async (t) => {
  const rows: { what: string; config: SpawnRequest['config']; mcp?: string }[] = [
    { what: 'a prompt file that cannot be read', config: { claude: { appendSystemPromptFile: 'not-there.md' } } },
    { what: 'a `config.claude` flag given two values', config: { claude: { someFlag: ['one', 'two'] } } },
    { what: 'a checkout `.mcp.json` that is not JSON', config: {}, mcp: '{ not json' },
  ];
  for (const row of rows)
    await t.test(row.what, async (rt) => {
      const { root, dir, request } = place({ output: {} }, row.config);
      if (row.mcp !== undefined) fs.writeFileSync(path.join(dir, '.mcp.json'), row.mcp);
      const h = await holder(root);
      rt.after(h.close);
      const exit = await Effect.runPromiseExit(h.attached.ops.spawn(request));
      assert.ok(Exit.isFailure(exit), 'the spawn is refused');
      assert.equal(fs.existsSync(filesOf(root, NAME).run), false, 'no run file is left for a session query() never started');
      assert.deepEqual(
        [...(await Effect.runPromise(h.attached.ops.observe)).keys()],
        [],
        'and a later pass reads no sighting at all, held or otherwise',
      );
    });
});
