/**
 * A workflow step on a remote A2A agent, on the real engine `nemia up` makes (`engine()`) and the SDK's own server over HTTP
 * (`a2a-server.ts`): the A2A talk is the runtime's, so no stand-in tells it. Two tests.
 *
 * The remote step end to end, a story: `nemia start` on a folder team whose step says `harness: a2a:<name>`, the store's
 * `a2a-agents.json` naming the agent, and ticks, each run at rest judged in full as well (`WF_VERIFY_REST`). The agent is sent the brief
 * as a message, with the secret its card asks for read from the variable `envNameOf` names and never written to the store; the brief
 * names nothing of this machine, and the step is filed with no harness arguments, schema, hold or session (`localFields`); the Task it
 * completes is the step's sign-off, and a data part on it is read as a closeout. A secret not given sends nothing, and the step's failure
 * names the variable to set; a question waits on a person, who answers it with `nemia say`; and the step is followed live
 * (`followStep`), from the agent's own stream when its card says it streams, else from the runtime's reads of its Task.
 *
 * A broken `a2a-agents.json`, a table: refused as it stands, an entry of it refused, or the entry removed, with `main` making its engine
 * itself as a restarted `nemia up` would. A local run goes on; a remote step at work is held, neither there nor gone, and followed again
 * once the file is fixed; a queued one is refused its start; neither is handed to Claude Code, the engine's first harness. A fake
 * `claude` and `codex` first on PATH write down every call, so nothing real is asked and any call is seen.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads. Each row leaves a step held at work on its agent, so the
 * file sets `WF_MAX_CONCURRENT` itself, since a check the run executes inherits the daemon's ceiling.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Layer, Logger, ManagedRuntime, References, Stream } from 'effect';
import { a2aServer, type Answer } from './a2a-server.ts';
import { scratch } from './scratch.ts';
import { story, staged } from './story.ts';
import { bell, until, WAITED, type Waiter } from 'agent-runtime/testing';

const ROOT = scratch('wf-remote-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
process.env.WF_MAX_CONCURRENT = '10';
const BIN = scratch('wf-remote-bin-');
const CALLS = path.join(BIN, 'calls.log');
for (const name of ['claude', 'codex'])
  fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\necho "${name} $*" >> '${CALLS}'\nexit 1\n`, { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const { EngineService, engine, feedHubLayer, followStep, retryRun, tickRun, runWith } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { storeRootLayer } = await import('../src/config/root.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main: cli, engineOf });

type Engine = ReturnType<typeof engine>;
type Moment = Stream.Success<ReturnType<typeof followStep>>;

const FILE = path.join(ROOT, 'a2a-agents.json');
/**
 * `agents` added to the store's `a2a-agents.json`, the ones declared before kept: a try asked of an earlier checkpoint's agent is
 * filed on a later tick, and an engine with no such harness refuses the tick.
 */
const declare = (agents: Record<string, { url: string }>): void =>
  fs.writeFileSync(FILE, JSON.stringify({ ...(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {}), ...agents }));

/** What `run` printed on stdout, line by line, and on stderr, while it ran. */
async function said(run: () => Promise<unknown>): Promise<{ out: string[]; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const { log, error } = console;
  console.log = (...args: unknown[]) => void out.push(args.join(' '));
  console.error = (...args: unknown[]) => void err.push(args.join(' '));
  try {
    await run();
  } finally {
    Object.assign(console, { log, error });
  }
  return { out: out.join('\n').split('\n'), err: err.join('\n') };
}

/** `nemia argv` on the stage's place over the engine `e`, and what it printed on stdout. */
const printed = async (argv: string[], e: Engine): Promise<string[]> => (await said(() => stage.main(argv, e))).out;

/** A folder team of one step `step` on `harness`, telling it `told`. */
function team(name: string, harness: string, step = 'ask', told = 'Read the note and say whether it is right.'): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${step}.md`), `---\nworkspace: folder\nharness: ${harness}\n---\n${told}\n`);
  return dir;
}

const GIVEN = path.join(ROOT, 'tides.md');
fs.writeFileSync(GIVEN, '# Tides\n');

/** `nemia start` of `dir` as `start` types it, from the store, a directory that is no repository, and the run's id. */
async function startedBy(start: (argv: string[]) => Promise<unknown>, dir: string, given = true): Promise<string> {
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    const argv = ['start', 'a note on tides', '--workflows', dir, ...(given ? ['--input', GIVEN] : [])];
    return (await said(() => start(argv))).out[0].split(/\s+/)[0];
  } finally {
    process.chdir(cwd);
  }
}
const started = (dir: string, given = true) => startedBy((argv) => stage.main(argv), dir, given);

/** The engine's journal of a task, as it stands on disk. */
const journal = (task: string): Array<Record<string, unknown>> => {
  const file = path.join(ROOT, 'engine', 'tasks', `${task}.jsonl`);
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
};

const tick = (e: Engine) => stage.runWith(e, tickRun({ repo: ROOT }));

/** Ticks in test `t`, every 100ms, until the step's task settles, a pass after, and once more so the run reads what it came to. */
async function settle(t: Waiter, e: Engine, id: string): Promise<void> {
  let seen = 'not read yet';
  await until(
    t,
    async () => {
      await tick(e);
      const v = await Effect.runPromise(e.view(`${id}-ask`));
      seen = JSON.stringify(v);
      return v.state.settled;
    },
    () => `${id}-ask settled; it reads ${seen}`,
    { everyMs: 100 },
  );
  await tick(e);
  await tick(e);
}

/** An agent that asks for a bearer secret, declared as `name`, answering each message with `answer`; and its run, settled in test `t`. */
async function remoteRun(t: Waiter, name: string, answer: Answer, secret: string | undefined) {
  const server = await a2aServer({ token: 's3cret', answer: () => answer });
  const variable = `WF_A2A_${name.toUpperCase()}_TOKEN`;
  if (secret === undefined) delete process.env[variable];
  else process.env[variable] = secret;
  try {
    declare({ [name]: { url: server.url } });
    const id = await started(team(`${name}-team`, `a2a:${name}`));
    const e = engine();
    await settle(t, e, id);
    return { server, id, e, decided: await printed(['decide', id], e), listed: await printed(['ls'], e) };
  } finally {
    delete process.env[variable];
    await server.close();
  }
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
 * The run of a one-step team on an agent at `url`, ticked on a runtime of its own, with the feed's hub, until its step is at work, and
 * `followStep` of that step: each moment pushed to `got` as it comes, ringing `rung`. The ticks run on that runtime, so the feed's
 * lines they write wake the follower; it is let go once `t` ends.
 */
async function following(t: TestContext, agent: string, url: string) {
  declare({ [agent]: { url } });
  const id = await started(team(`${agent}-team`, `a2a:${agent}`, 'ask', 'Read the note.'), false);
  const e = engine();
  const rt = ManagedRuntime.make(
    Layer.mergeAll(
      feedHubLayer(),
      Logger.layer([]),
      EngineService.layer(e),
      stage.place().layer,
      Layer.succeed(References.MinimumLogLevel, 'Warn'),
    ),
  );
  t.after(() => rt.dispose());
  const ticked = () => rt.runPromise(tickRun({ repo: ROOT }).pipe(Effect.provide(storeRootLayer(process.env))));
  await until(
    t,
    async () => {
      await ticked();
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
  return { got, rung, ended, tick: ticked };
}

/** A gate the agent's answer waits behind, and the hand that opens it. */
function gate(): { held: Promise<void>; go: () => void } {
  let go = () => {};
  const held = new Promise<void>((resolve) => (go = resolve));
  return { held, go };
}

test(
  'a step on a remote agent: sent its brief and its secret, signed off by its Task, asked and answered, and followed',
  WAITED,
  async (t) => {
    const s = story(t);
    t.after(() => {
      for (const dir of ['runs', 'engine']) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
      fs.rmSync(FILE, { force: true });
    });

    await s.test(
      'a step on a remote agent is sent its brief, with the secret its card asks for, and the Task it completes signs it off',
      async (c) => {
        const { server, id, e, decided, listed } = await remoteRun(c, 'reviewer', { text: 'It is right.' }, 's3cret');
        assert.equal(server.sent.length, 1, 'one message, one Task');
        const brief = server.sent[0];
        assert.match(brief, /^Read the note and say whether it is right\.\n\n## What was asked for\n\na note on tides\n/);
        assert.match(
          brief,
          /Files were given with it \(`nemia start --input`\): `tides\.md`\. They stay on the machine that runs this workflow/,
        );
        assert.equal(brief.includes(ROOT), false, `the brief names no path of this machine: ${brief}`);
        assert.doesNotMatch(brief, /closeout|artifacts|## Finishing/i, 'no contract a remote agent could not keep');
        assert.ok(
          server.headers.some((h) => h.authorization === 'Bearer s3cret'),
          'the secret went in the header its card asks for',
        );
        const filed = journal(`${id}-ask`).find((ev) => ev.kind === 'filed');
        assert.ok(filed, `filed: ${JSON.stringify(journal(`${id}-ask`))}`);
        assert.equal(filed.harness, 'a2a:reviewer');
        for (const key of ['config', 'closeoutSchema', 'holdOpen', 'resumeFrom'])
          assert.equal(key in filed, false, `${key} is not on a remote filing at all: ${JSON.stringify(filed)}`);

        const view = await Effect.runPromise(e.view(`${id}-ask`));
        assert.equal(view.phase, 'succeeded');
        assert.ok(readRun(id).steps.ask?.taskId, 'filed');
        assert.ok(decided.join('\n').includes('ask'), decided.join('\n'));
        assert.match(listed.join('\n'), /^\s+ask\s+unverified\s*$/m, listed.join('\n'));
        const everything = (dir: string): string[] =>
          fs
            .readdirSync(dir, { withFileTypes: true })
            .flatMap((d) => (d.isDirectory() ? everything(path.join(dir, d.name)) : [path.join(dir, d.name)]));
        for (const file of everything(ROOT))
          assert.equal(
            fs.readFileSync(file, 'utf8').includes('s3cret'),
            false,
            `the secret is in no file of the store, and ${file} holds it`,
          );
      },
    );

    await s.test(
      'a data part on the Task the agent completes is its closeout: `blocked` there reads blocked, with what it needs',
      async (c) => {
        const { server, decided } = await remoteRun(
          c,
          'blocker',
          { data: { outcome: 'blocked', summary: 'The note cites no source.', needs: 'a source for the tide tables', artifacts: [] } },
          's3cret',
        );
        assert.equal(server.sent.length, 1);
        const words = decided.join('\n');
        assert.match(words, /blocked/, words);
        assert.match(words, /a source for the tide tables/, words);
      },
    );

    await s.test(
      'a secret not given sends nothing, the step fails naming the variable to set, and it is tried again as a new Task, never with --model or --budget',
      async (c) => {
        const { server, id, e, decided } = await remoteRun(c, 'critic', { text: 'never sent' }, undefined);
        assert.equal(server.sent.length, 0, 'no message went out without its secret');
        const view = await Effect.runPromise(e.view(`${id}-ask`));
        assert.equal(view.phase, 'failed');
        const words = JSON.stringify(view.state.attempts) + decided.join('\n');
        assert.ok(words.includes('set WF_A2A_CRITIC_TOKEN to the secret'), words);
        assert.ok(words.includes("the scheme `token` critic's card declares"), words);
        assert.ok(words.includes('`nemia retry`'), words);
        assert.ok(
          decided.some((line) => line.trim() === `ask: failed. Send it again, as a new Task told what happened:  nemia retry ${id} ask`),
          `offered a new Task, not a session continued nor a model, which nemia retry refuses on a remote step:\n${decided.join('\n')}`,
        );
        assert.doesNotMatch(decided.join('\n'), /--model|Continue its session/);

        for (const [flag, asked] of [
          ['--model haiku', { mode: 'fresh', model: 'haiku' }],
          ['--budget 5', { mode: 'continue', budget: 5 }],
        ] as const)
          await assert.rejects(
            stage.runWith(e, retryRun(id, 'ask', asked)),
            (err: Error & { exitCode?: number }) =>
              err.exitCode === 2 && err.message.startsWith(`\`${flag}\` `) && err.message.includes(`nemia retry ${id} ask`),
            `nemia retry ${flag} is refused on a remote step, asking a try without it`,
          );
        const again = await stage.runWith(e, retryRun(id, 'ask', { mode: 'fresh' }));
        assert.equal(again.ask.try, 2, 'without them, the same try is asked for');
      },
    );

    await s.test(
      'a Task the agent leaves waiting on a question reads as waiting on you: nemia logs prints the question, and nemia say answers it',
      async (c) => {
        const server = await a2aServer({
          answer: (text) => (text.includes('Brest') ? { text: 'Right, for Brest.' } : { asks: 'Which tide tables — Brest or Dover?' }),
        });
        try {
          declare({ asker: { url: server.url } });
          const id = await started(team('asker-team', 'a2a:asker'));
          const e = engine();
          let seen = 'not read yet';
          await until(
            c,
            async () => {
              const v = await Effect.runPromise(e.view(`${id}-ask`));
              if (v.phase === 'needs-human') return true;
              seen = JSON.stringify(v);
              await tick(e);
              return false;
            },
            () => `${id}-ask waiting on a question; it reads ${seen}`,
            { everyMs: 100 },
          );
          await tick(e);
          const listed = (await printed(['ls'], e)).join('\n');
          assert.match(listed, /^\s+ask\s+needs-human: waiting for an input\s*$/m, listed);
          const decided = (await printed(['decide', id], e)).join('\n');
          assert.match(
            decided,
            new RegExp(
              `ask: waiting for an input — read its question with nemia logs ${id} ask, and answer it with nemia say ${id} ask "<your answer>"`,
            ),
            `a person answers with nemia say, not in a Claude Code session a remote agent is not in:\n${decided}`,
          );
          assert.equal(decided.includes('claude agents'), false, decided);
          assert.match((await printed(['logs', id, 'ask'], e)).join('\n'), /Which tide tables — Brest or Dover\?/);

          await printed(['say', id, 'ask', 'Brest, please.'], e);
          await settle(c, e, id);
          assert.deepEqual(server.sent.slice(1), ['Brest, please.'], 'the answer went as a follow-up on the Task');
          assert.equal((await Effect.runPromise(e.view(`${id}-ask`))).phase, 'succeeded');
          assert.match((await printed(['ls'], e)).join('\n'), /^\s+ask\s+unverified\s+· said to 1×\s*$/m);
        } finally {
          await server.close();
        }
      },
    );

    await s.test(
      "a step on an agent that streams is followed from the agent's own stream: each event in order, once, to the step's end",
      async (c) => {
        const { held, go } = gate();
        const server = await a2aServer({ streaming: true, held, answer: () => ({ text: 'It is right.' }) });
        c.after(() => server.close());
        const { got, rung, ended, tick: ticked } = await following(c, 'streamer', server.url);
        await until(
          c,
          () => got.length >= 2,
          () => `the follow open: ${shown(got)}`,
          { bell: rung },
        );
        go();
        await until(
          c,
          () => got.some((m) => m.kind === 'state' && m.state === 'completed'),
          () => `the turn over: ${shown(got)}`,
          { bell: rung },
        );
        await until(
          c,
          async () => {
            await ticked();
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

    await s.test(
      "a step on an agent whose card does not say it streams is followed from the runtime's reads of its Task: each event once, to the step's end",
      async (c) => {
        const { held, go } = gate();
        const server = await a2aServer({ held, answer: () => ({ text: 'It is right.' }) });
        c.after(() => {
          go();
          return server.close();
        });
        const { got, rung, ended, tick: ticked } = await following(c, 'quiet', server.url);
        await until(
          c,
          () => got.length >= 2,
          () => `the follow open: ${shown(got)}`,
          { bell: rung },
        );
        go();
        await until(
          c,
          async () => {
            await ticked();
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
  },
);

/** `nemia argv` with the engine `main` makes itself, as a restarted `nemia up` would, and what it printed. */
const own = (argv: string[]) => said(() => cli(argv));

const LOCAL = team('local', 'claude', 'work', 'Write a note on tides.');
const REMOTE = team('remote', 'a2a:reviewer', 'work');
const ended = (task: string) => journal(task).filter((ev) => ev.kind === 'ended');

test(
  'a broken a2a-agents.json holds the remote steps that name it and refuses their start, and leaves local runs working',
  WAITED,
  async (t) => {
    for (const [what, text, why] of [
      ['refused as it stands', '{ reviewer: ', /a2a-agents\.json: is not JSON/],
      [
        'with its entry refused',
        JSON.stringify({ reviewer: { url: 'ftp://a.example' } }),
        /a2a-agents\.json: `reviewer`: .*the `a2a:reviewer` harness/,
      ],
      ['with its entry removed', '{}', undefined],
    ] as const)
      await t.test(
        `a2a-agents.json ${what}: a remote step at work is held, not ended lost, a queued one is refused, neither is handed to Claude Code, and a local run goes on`,
        async (row) => {
          const server = await a2aServer({ answer: () => ({ asks: 'Which note?' }) });
          const good = JSON.stringify({ reviewer: { url: server.url } });
          const start = (dir: string) => startedBy((argv) => cli(argv), dir, false);
          try {
            fs.writeFileSync(FILE, good);
            const away = await start(REMOTE);
            await until(
              row,
              async () => {
                if (journal(`${away}-work`).some((ev) => ev.kind === 'spawned') && server.sent.length >= 1) return true;
                await own(['tick']);
                return false;
              },
              () =>
                `${away} spawned and sent to the agent; ${server.sent.length} sent, its journal ${JSON.stringify(journal(`${away}-work`))}`,
              { everyMs: 0 },
            );
            const queued = await start(REMOTE);
            await own(['tick']);
            assert.ok(
              journal(`${queued}-work`).some((ev) => ev.kind === 'filed'),
              'the second step is filed, queued, before the file changes',
            );
            assert.equal(ended(`${away}-work`).length, 0, 'the first is at work on the agent');

            fs.writeFileSync(FILE, text);
            fs.rmSync(CALLS, { force: true });
            for (let i = 0; i < 4; i++) {
              await own(['tick']);
              await own(['ls']);
            }
            assert.equal(
              fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8') : '',
              '',
              'Claude Code was asked nothing: no job spawned, and no listing looked in for a remote session',
            );
            assert.equal(
              ended(`${away}-work`).length,
              0,
              `the step at work is held, neither there nor gone: ${JSON.stringify(journal(`${away}-work`))}`,
            );
            assert.equal(
              journal(`${queued}-work`).some((ev) => ev.kind === 'spawned'),
              false,
              `the queued step was never spawned: ${JSON.stringify(journal(`${queued}-work`))}`,
            );
            const refused = ended(`${queued}-work`);
            assert.equal(refused.length, 1, JSON.stringify(journal(`${queued}-work`)));
            assert.equal(refused[0].reason, 'unstartable');
            const error = String(refused[0].error);
            assert.ok(error.startsWith('`harness: a2a:reviewer` is not a harness'), error);
            assert.ok(error.includes('nothing was started'), error);
            assert.ok(error.includes('Its harnesses are: '), error);
            assert.equal(server.sent.length, 1, 'and nothing more was sent to the agent');

            fs.rmSync(FILE, { force: true });
            const local = await start(LOCAL);
            fs.writeFileSync(FILE, text);
            const made = await own(['ls']);
            assert.match(made.out.join('\n'), new RegExp(local), made.out.join('\n'));
            if (why !== undefined) {
              assert.match(made.err, why, 'engine() says why it left the file or the entry out');
              assert.ok(made.err.includes('until the file is fixed and this process restarts'), made.err);
              assert.ok(made.err.includes('refused by `nemia start`'), made.err);
            }
            const ticked = await own(['tick']);
            if (why !== undefined) assert.match(ticked.err, why);
            assert.ok(readRun(local).steps.work, `the local step was filed: ${JSON.stringify(readRun(local).steps)}`);
            const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
            await assert.rejects(
              start(REMOTE),
              (err: Error & { exitCode?: number }) => err.exitCode === 2 && (why === undefined || why.test(err.message)),
              "nemia start of a step on the agent is refused, in the file's words",
            );
            assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs, 'no run was written');

            fs.writeFileSync(FILE, good);
            await own(['tick']);
            assert.equal(
              ended(`${away}-work`).length,
              0,
              `once the file is fixed, the step at work is followed again on the agent, not ended: ${JSON.stringify(journal(`${away}-work`))}`,
            );
            assert.ok(journal(`${away}-work`).every((ev) => ev.kind !== 'ended' || ev.observed !== 'lost'));
          } finally {
            fs.rmSync(FILE, { force: true });
            await server.close();
          }
        },
      );
  },
);
