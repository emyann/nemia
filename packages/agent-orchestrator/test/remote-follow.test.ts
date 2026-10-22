/**
 * A step on a remote A2A agent followed live (`followStep`), as the api's follower reads it, over the engine `nemia up` makes and the
 * SDK's own server (`a2a-server.ts`): an agent whose card says it streams has each event of its Task relayed, in order, from the
 * subscription the runtime holds, to the step's end; one whose card does not is followed as the runtime reads its Task whole, every
 * second, to the step's end. The ticks run on the follower's runtime, so the feed's lines they write wake it. `WF_ROOT` is set
 * before the import, since the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Layer, Logger, ManagedRuntime, References, Stream } from 'effect';
import { a2aServer } from './a2a-server.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest } from './placed.ts';
import { storeRootLayer } from '../src/config/root.store.ts';

const stand = eachTest(testPlace);
const ROOT = scratch('wf-remote-follow-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { EngineService, engine, feedHubLayer, followStep, tickRun } = await import('../src/runner.ts');
const { main } = await import('../src/cli/main.ts');

type Engine = ReturnType<typeof engine>;
type Moment = Stream.Success<ReturnType<typeof followStep>>;

/** `nemia start` of a one-step folder team on the remote agent `agent`, declared at `url`, from a directory that is no repository. */
async function started(agent: string, url: string): Promise<string> {
  fs.writeFileSync(path.join(ROOT, 'a2a-agents.json'), JSON.stringify({ [agent]: { url } }));
  const dir = path.join(ROOT, 'workflows', `${agent}-team`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ask.md'), `---\nworkspace: folder\nharness: a2a:${agent}\n---\nRead the note.\n`);
  const lines: string[] = [];
  const log = console.log;
  const cwd = process.cwd();
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  process.chdir(ROOT);
  try {
    await main(['start', `a note for ${agent}`, '--workflows', dir], undefined, undefined, stand().place);
  } finally {
    console.log = log;
    process.chdir(cwd);
  }
  return lines[0].split(/\s+/)[0];
}

/** A runtime with the feed's hub over the engine `e`, its logs at warnings: let go once the test `t` ends. */
function runtimeOf(t: TestContext, e: Engine) {
  const rt = ManagedRuntime.make(
    Layer.mergeAll(
      feedHubLayer(),
      Logger.layer([]),
      EngineService.layer(e),
      stand().layer,
      Layer.succeed(References.MinimumLogLevel, 'Warn'),
    ),
  );
  t.after(() => rt.dispose());
  return rt;
}

/** Each moment as a line a reader can compare. */
const shown = (got: Moment[]): string[] =>
  got.map((m) =>
    m.kind === 'events'
      ? `events ${m.events.map((ev) => `${ev.role} ${JSON.stringify(ev.text)}`).join(', ')}`
      : m.kind === 'state'
        ? `state ${m.state}`
        : m.kind === 'partial'
          ? `partial ${JSON.stringify(m.text)}${m.last ? ' last' : ''}`
          : m.kind === 'streamed'
            ? `streamed ${m.yes}`
            : m.kind,
  );

/**
 * The run of a one-step team on an agent at `url`, ticked on its own runtime until its step's session is at work, and `followStep` of
 * that step: each moment pushed to `got` as it comes, ringing `rung`.
 */
async function following(t: TestContext, agent: string, url: string) {
  const id = await started(agent, url);
  const e = engine();
  const rt = runtimeOf(t, e);
  const tick = () => rt.runPromise(tickRun({ repo: ROOT }).pipe(Effect.provide(storeRootLayer(process.env))));
  await until(
    t,
    async () => {
      await tick();
      const v = await Effect.runPromise(e.view(`${id}-ask`));
      return v.state.attempts.at(-1)?.endedAt === null;
    },
    'the step at work on the agent',
    { everyMs: 50 },
  );
  const got: Moment[] = [];
  const rung = bell();
  const ended = rt.runPromiseExit(
    Stream.runForEach(followStep(id, 'ask'), (m) =>
      Effect.sync(() => {
        got.push(m);
        rung.ring();
      }),
    ),
  );
  return { got, rung, ended, tick };
}

test(
  "a step on an agent that streams is followed from the agent's own stream: each event in order, once, to the step's end",
  WAITED,
  async (t) => {
    let go = () => {};
    const held = new Promise<void>((resolve) => (go = resolve));
    const server = await a2aServer({ streaming: true, held, answer: () => ({ text: 'It is right.' }) });
    t.after(() => server.close());
    const { got, rung, ended, tick } = await following(t, 'streamer', server.url);
    await until(
      t,
      () => got.length >= 2,
      () => `the follow open: ${shown(got)}`,
      { bell: rung },
    );
    go();
    await until(
      t,
      () => got.some((m) => m.kind === 'state' && m.state === 'completed'),
      () => `the turn over: ${shown(got)}`,
      {
        bell: rung,
      },
    );
    await until(
      t,
      async () => {
        await tick();
        return got.at(-1)?.kind === 'settled';
      },
      () => `the step settled: ${shown(got)}`,
      { everyMs: 50 },
    );
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(shown(got), [
      'streamed true',
      'state working',
      'events assistant "reading the note"',
      'partial "It is "',
      'partial "right." last',
      'events assistant "It is right."',
      'state completed',
      'settled',
    ]);
  },
);

test(
  "a step on an agent whose card does not say it streams is followed from the runtime's reads of its Task: each event once, to the step's end",
  WAITED,
  async (t) => {
    let go = () => {};
    const held = new Promise<void>((resolve) => (go = resolve));
    const server = await a2aServer({ held, answer: () => ({ text: 'It is right.' }) });
    t.after(() => {
      go();
      return server.close();
    });
    const { got, rung, ended, tick } = await following(t, 'quiet', server.url);
    await until(
      t,
      () => got.length >= 2,
      () => `the follow open: ${shown(got)}`,
      { bell: rung },
    );
    go();
    await until(
      t,
      async () => {
        await tick();
        return got.at(-1)?.kind === 'settled';
      },
      () => `the step settled: ${shown(got)}`,
      { everyMs: 50 },
    );
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(
      shown(got).filter((line) => !line.startsWith('events')),
      ['streamed true', 'state working', 'state completed', 'settled'],
    );
    assert.deepEqual(
      got.flatMap((m) => (m.kind === 'events' ? m.events.map((ev) => `${ev.role} ${ev.text}`) : [])),
      ['assistant reading the note', 'assistant It is right.'],
      'each event once and in order, however the reads fell',
    );
  },
);
