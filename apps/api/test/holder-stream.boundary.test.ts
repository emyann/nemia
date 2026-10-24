/**
 * The holder's stream reaches the board the owner works on: a holder api and a viewer api on one store, two processes, and a session
 * the holder runs followed live through the viewer's own stream route.
 *
 * The holder is a child process (`fixtures/holder-api.ts`): it takes the store's lease as an api does, holds its engine's attached
 * Claude Code sessions, writes what that hold serves onto the lease, and files and ticks one session. The viewer is this process's
 * api, whose engine is the package's own (`engine()`): it reads the lease at each follow, is configured with the holder's card for
 * the `claude` harness, and asks the runtime for the holder's token as it dials.
 *
 * Two processes, because a follow of a session this process holds is answered here, off the files: an engine in the same process
 * would dial nothing and the slice would go untested (`packages/agent-runtime/test/holder-follow.boundary.test.ts` says the same of
 * its own half).
 *
 * The session is a real attached one, the Agent SDK driving the seat's stand-in Claude Code, told a plan that writes its turn's text
 * in two pieces: the first at once, the second only once the test writes `more`. Until then the files hold nothing of the turn, so
 * text the viewer's stream carried came over the wire and nowhere else.
 *
 * A boundary test: a real store, a real second process, the SDK with a real child of its own, a real socket and a real engine.
 */
import { config, root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { Layer, Logger } from 'effect';
import { appOf, liveOf } from '../src/app.ts';
import { bell, until, WAITED } from './waits.ts';

const HOLDER = path.join(import.meta.dirname, 'fixtures', 'holder-api.ts');
const RUN = 'r-holder';
const STEP = 'implement';

/** What the holder does with its one session: one turn, its text in two pieces, and a line of Claude Code's own transcript. */
const PLAN = { stream: true, transcript: true };

/** What the holder said of itself once it held: its task, its port and the cards it serves. */
type Held = { what: 'held'; taskId: string; url: string; cards: Record<string, Record<string, unknown>> };

/** Every file under `dir`, by its path from it: the store whole, the lease, journals, feed, run files and captures. */
const filesUnder = (dir: string, at = ''): string[] =>
  fs
    .readdirSync(path.join(dir, at), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesUnder(dir, path.join(at, e.name)) : [path.join(at, e.name)]));

/** The run's record, its one step on the task the holder filed. */
function writeRun(taskId: string): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${RUN}.json`),
    JSON.stringify({
      id: RUN,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Follow the holder',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-10-20T12:00:00.000Z',
      workflow: [{ name: STEP, after: [], body: 'do it.' }],
      steps: { [STEP]: { taskId } },
    }),
  );
}

/** A child spawned with all three of its streams piped, so each is there to read and to write. */
type Piped = ChildProcess & {
  stdin: NonNullable<ChildProcess['stdin']>;
  stdout: NonNullable<ChildProcess['stdout']>;
  stderr: NonNullable<ChildProcess['stderr']>;
};

/**
 * The holder, up and holding: its child, what it said of itself, everything it wrote on either stream — both searched for the
 * token, since its engine logs on its stdout and the SDK's child writes on its stderr — and the way to tell it to go.
 */
async function holder(cwd: string): Promise<{ child: ChildProcess; held: Held; said: () => string; stop: () => void }> {
  const child = spawn(process.execPath, [HOLDER], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: config, WF_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as Piped;
  const out: string[] = [];
  const err: string[] = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => void out.push(chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => void err.push(chunk));
  child.stdin.end(JSON.stringify({ root, cwd, plan: PLAN }));
  const held = async (): Promise<Held> => {
    for (;;) {
      const line = out
        .join('')
        .split('\n')
        .find((l) => l.startsWith('{'));
      if (line) return JSON.parse(line) as Held;
      if (child.exitCode !== null) throw new Error(`the holder ended ${child.exitCode}: ${out.join('')}${err.join('')}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { child, held: await held(), said: () => `${out.join('')}\n${err.join('')}`, stop: () => void child.kill('SIGKILL') };
}

test(
  'a viewer api follows a holder api’s live session through its own stream route, and reads it from the files with the holder gone',
  WAITED,
  async (t) => {
    const cwd = path.join(root, 'holder-work');
    const up = await holder(cwd);
    t.after(() => up.stop());
    assert.deepEqual(Object.keys(up.held.cards), ['claude'], `the holder serves the one harness it runs attached: ${up.said()}`);
    writeRun(up.held.taskId);

    const lease = JSON.parse(fs.readFileSync(path.join(root, 'daemon.json'), 'utf8')) as { pid: number; serves?: object };
    assert.equal(lease.pid, up.child.pid, 'the lease is the holder’s');
    assert.deepEqual(lease.serves, up.held.cards, 'and names what it serves, by harness');

    const tokenFile = path.join(root, 'engine', 'a2a', 'holder-token');
    const token = fs.readFileSync(tokenFile, 'utf8').trim();
    assert.ok(token.length > 0, 'the holder minted a token for the port it serves, read while it holds: the hold forgets it as it ends');
    assert.equal(fs.statSync(tokenFile).mode & 0o777, 0o600, 'kept to its own user');

    const said: string[] = [];
    const keeper = Logger.make(({ message }) => void said.push((Array.isArray(message) ? message : [message]).join(' ')));
    const viewer = appOf(Layer.merge(liveOf(), Logger.layer([keeper])));
    t.after(() => viewer.runtime.dispose());

    const res = await viewer.app.request(`/api/runs/${RUN}/steps/${STEP}/transcript/stream`);
    if (res.status !== 200) assert.fail(`the viewer follows the step: ${await res.text()}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const rung = bell();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) return;
      text += decoder.decode(value, { stream: true });
      rung.ring();
      return pump();
    };
    const pumped = pump();
    t.after(() => reader.cancel());

    await until(
      t,
      () => text.includes('Half '),
      () => `the first piece over the wire: ${text}`,
      { bell: rung },
    );
    assert.equal(
      fs.existsSync(path.join(config, 'projects', 'stand-in')),
      false,
      'and it came over the wire and nowhere else: the files hold nothing of the turn until it ends',
    );

    fs.writeFileSync(path.join(cwd, 'more'), '');
    await until(
      t,
      () => text.includes('a thought'),
      () => `the rest of it as it was written: ${text}`,
      { bell: rung },
    );

    const answered = async (route: string): Promise<string> => (await viewer.app.request(route)).text();
    const answers = [await answered('/api/daemon'), await answered(`/api/runs/${RUN}`), text];

    const holds = filesUnder(root).filter((f) => fs.readFileSync(path.join(root, f), 'latin1').includes(token));
    assert.deepEqual(
      holds,
      [path.join('engine', 'a2a', 'holder-token')],
      'the one file that keeps the token is the only one under the store that holds it: not the lease, no journal, no feed line, no capture',
    );
    assert.ok(filesUnder(root).length > 5, `and the store was read whole: ${filesUnder(root).length} files`);

    up.child.kill('SIGTERM');
    await new Promise((resolve) => up.child.on('exit', resolve));
    await reader.cancel();
    await pumped;

    const gone = appOf(Layer.merge(liveOf(), Logger.layer([])));
    t.after(() => gone.runtime.dispose());
    const read = await gone.app.request(`/api/runs/${RUN}/steps/${STEP}/transcript`);
    if (read.status !== 200) assert.fail(`the viewer still answers with the holder gone: ${await read.text()}`);
    const transcript = (await read.json()) as { events?: Array<{ text?: string }> };
    assert.ok(
      transcript.events?.some((e) => e.text?.includes('Half a thought')),
      `and reads the session from the files, with no holder to ask: ${JSON.stringify(transcript)}`,
    );

    for (const [what, answer] of [
      ['the daemon', answers[0]],
      ['the run’s detail', answers[1]],
      ['the step’s stream', answers[2]],
      ['the transcript answered from the files', JSON.stringify(transcript)],
    ] as const) {
      assert.equal(answer.includes(token), false, `no answer carries the token: ${what}`);
    }
    assert.ok(
      said.some((l) => l.includes(`/api/runs/${RUN}/steps/${STEP}/transcript/stream`)),
      `the viewer's own lines are kept and there to search — the request line of the very follow that dialled the holder among them: ${JSON.stringify(said)}`,
    );
    assert.equal(said.join('\n').includes(token), false, 'and no log line of the api carries the token');
    assert.ok(up.said().includes('"what":"held"'), 'the holder’s own streams are kept and there to search');
    assert.equal(up.said().includes(token), false, 'nor any line the holder wrote, on either of its streams');
    assert.equal(fs.existsSync(tokenFile), false, 'and the hold forgot its token as it ended');
  },
);
