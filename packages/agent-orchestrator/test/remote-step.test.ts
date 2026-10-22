/**
 * A workflow step on a remote A2A agent, end to end: `nemia start` on a folder team whose step says `harness: a2a:reviewer`, the store's
 * `a2a-agents.json` naming an agent the SDK's own server runs over HTTP (`a2a-server.ts`), and ticks of the engine `nemia up` makes
 * (`engine()`), each run at rest judged in full as well (`WF_VERIFY_REST`): a difference throws (`verifyRest` in tick.verb.ts). The agent
 * is sent the brief as a message, with the secret its card asks for read from the variable `envNameOf` names, WF_A2A_REVIEWER_TOKEN here,
 * and never written to the store; the brief names nothing of this machine; the Task it completes is the step's sign-off, and a data part on
 * it is read as a closeout. A secret not given sends nothing, and the step's failure names the variable to set. `WF_ROOT` is set before the
 * import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { a2aServer, type Answer } from './a2a-server.ts';
import { scratch } from './scratch.ts';
import { until, WAITED, type Waiter } from 'agent-runtime/testing';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-remote-step-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { engine, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);

type Engine = ReturnType<typeof engine>;

/** What `main` printed, line by line, while it ran. */
const printed = async (argv: string[], e?: Engine): Promise<string[]> => {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '));
  };
  try {
    await main(argv, e);
  } finally {
    console.log = log;
  }
  return lines.join('\n').split('\n');
};

/** A folder team of one step on the remote agent `name`. */
function team(name: string, agent: string): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'ask.md'),
    `---\nworkspace: folder\nharness: a2a:${agent}\n---\nRead the note and say whether it is right.\n`,
  );
  return dir;
}

const declare = (agents: Record<string, { url: string }>): void =>
  fs.writeFileSync(path.join(ROOT, 'a2a-agents.json'), JSON.stringify(agents));

const GIVEN = path.join(ROOT, 'tides.md');
fs.writeFileSync(GIVEN, '# Tides\n');

/** `nemia start`, from a directory that is no repository, and the run's id. */
async function started(dir: string): Promise<string> {
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    const lines = await printed(['start', 'a note on tides', '--workflows', dir, '--input', GIVEN]);
    return lines[0].split(/\s+/)[0];
  } finally {
    process.chdir(cwd);
  }
}

/** Ticks in test `t`, every 100ms, until the step's task settles, a pass after, and once more so the run reads what it came to. */
async function settle(t: Waiter, e: Engine, id: string): Promise<void> {
  let seen = 'not read yet';
  await until(
    t,
    async () => {
      await runWith(e, tickRun({ repo: ROOT }));
      const v = await Effect.runPromise(e.view(`${id}-ask`));
      seen = JSON.stringify(v);
      return v.state.settled;
    },
    () => `${id}-ask settled; it reads ${seen}`,
    { everyMs: 100 },
  );
  await runWith(e, tickRun({ repo: ROOT }));
  await runWith(e, tickRun({ repo: ROOT }));
}

/** An agent that asks for a bearer secret, declared as `name`, answering each message with `answer`; and its run, settled in test `t`. */
async function remoteRun(t: Waiter, name: string, answer: Answer, secret: string | undefined) {
  const server = await a2aServer({ token: 's3cret', answer: () => answer });
  const variable = `WF_A2A_${name.toUpperCase()}_TOKEN`;
  if (secret === undefined) delete process.env[variable];
  else process.env[variable] = secret;
  try {
    declare({ [name]: { url: server.url } });
    const id = await started(team(`${name}-team`, name));
    const e = engine();
    await settle(t, e, id);
    return { server, id, e, decided: await printed(['decide', id], e), listed: await printed(['ls'], e) };
  } finally {
    delete process.env[variable];
    await server.close();
  }
}

test(
  'a step on a remote agent is sent its brief, with the secret its card asks for, and the Task it completes signs it off',
  WAITED,
  async (t) => {
    const { server, id, e, decided, listed } = await remoteRun(t, 'reviewer', { text: 'It is right.' }, 's3cret');
    assert.equal(server.sent.length, 1, 'one message, one Task');
    const brief = server.sent[0];
    assert.match(brief, /^Read the note and say whether it is right\.\n\n## What was asked for\n\na note on tides\n/);
    assert.match(
      brief,
      /Files were given with it \(`nemia start --input`\): `tides\.md`\. They stay on the machine that runs this workflow/,
    );
    assert.equal(brief.includes(ROOT), false, `the brief names no path of this machine: ${brief}`);
    assert.ok(
      server.headers.some((h) => h.authorization === 'Bearer s3cret'),
      'the secret went in the header its card asks for',
    );

    const view = await Effect.runPromise(e.view(`${id}-ask`));
    assert.equal(view.phase, 'succeeded');
    const run = readRun(id);
    assert.ok(run.steps.ask?.taskId, 'filed');
    assert.ok(decided.join('\n').includes('ask'), decided.join('\n'));
    assert.match(listed.join('\n'), /^\s+ask\s+unverified\s*$/m, listed.join('\n'));
    const everything = (dir: string): string[] =>
      fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((d) => (d.isDirectory() ? everything(path.join(dir, d.name)) : [path.join(dir, d.name)]));
    for (const file of everything(ROOT))
      assert.equal(fs.readFileSync(file, 'utf8').includes('s3cret'), false, `the secret is in no file of the store, and ${file} holds it`);
  },
);

test(
  'a data part on the Task the agent completes is its closeout: `blocked` there reads blocked, with what it needs',
  WAITED,
  async (t) => {
    const { server, decided } = await remoteRun(
      t,
      'blocker',
      { data: { outcome: 'blocked', summary: 'The note cites no source.', needs: 'a source for the tide tables', artifacts: [] } },
      's3cret',
    );
    assert.equal(server.sent.length, 1);
    const said = decided.join('\n');
    assert.match(said, /blocked/, said);
    assert.match(said, /a source for the tide tables/, said);
  },
);

test('a secret not given sends nothing, and the step fails naming the variable to set', WAITED, async (t) => {
  const { server, id, e, decided } = await remoteRun(t, 'critic', { text: 'never sent' }, undefined);
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
});

test(
  'a Task the agent leaves waiting on a question reads as waiting on you: nemia logs prints the question, and nemia say answers it',
  WAITED,
  async (t) => {
    const server = await a2aServer({
      answer: (text) => (text.includes('Brest') ? { text: 'Right, for Brest.' } : { asks: 'Which tide tables — Brest or Dover?' }),
    });
    try {
      declare({ asker: { url: server.url } });
      const id = await started(team('asker-team', 'asker'));
      const e = engine();
      let seen = 'not read yet';
      await until(
        t,
        async () => {
          const v = await Effect.runPromise(e.view(`${id}-ask`));
          if (v.phase === 'needs-human') return true;
          seen = JSON.stringify(v);
          await runWith(e, tickRun({ repo: ROOT }));
          return false;
        },
        () => `${id}-ask waiting on a question; it reads ${seen}`,
        { everyMs: 100 },
      );
      await runWith(e, tickRun({ repo: ROOT }));
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
      await settle(t, e, id);
      assert.deepEqual(server.sent.slice(1), ['Brest, please.'], 'the answer went as a follow-up on the Task');
      assert.equal((await Effect.runPromise(e.view(`${id}-ask`))).phase, 'succeeded');
      assert.match((await printed(['ls'], e)).join('\n'), /^\s+ask\s+unverified\s+· said to 1×\s*$/m);
    } finally {
      await server.close();
    }
  },
);
