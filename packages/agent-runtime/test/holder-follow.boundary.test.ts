/**
 * Two engines, in two processes, over the store they share: one holds and serves its own sessions on its port
 * (`engine.hold()`), and the other, given that port's card and its token, follows one live session across processes and sees
 * its text in progress — then reads the same session from the files with the holder gone.
 *
 * Two processes and not two engines in one: a follow of a session this process runs is answered here, off the files and the
 * holder's own fan-out, so an engine in the same process would never dial anything and the slice would go untested.
 *
 * A boundary test: a real store, a real worker, a real socket and a second real engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { Effect, Exit, Scope } from 'effect';
import { Engine } from '../src/index.ts';
import { HARNESS, standSpec } from './holder-stand.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from './waits.ts';

const VIEWER = path.join(import.meta.dirname, 'fixtures', 'viewer-engine.ts');

/** Every file under `dir`, by its path from it: the store whole, journals, feed, run files, captures and the transcript. */
const filesUnder = (dir: string, at = ''): string[] =>
  fs
    .readdirSync(path.join(dir, at), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? filesUnder(dir, path.join(at, e.name)) : [path.join(at, e.name)]));

/** A holder: an engine that runs Claude Code attached — which is what makes it one — beside the harness the test drives. */
const holder = async () => {
  const root = scratch('ae-holder-');
  const cwd = path.join(root, 'work');
  fs.mkdirSync(cwd, { recursive: true });
  const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude', [HARNESS]: standSpec(root) }, defaultHarness: HARNESS }));
  const scope = Scope.makeUnsafe();
  const served = await Effect.runPromise(Scope.provide(engine.hold(), scope));
  return { root, cwd, engine, served, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

/** What the viewer's process said, line by line, ringing `rung` as each comes; `ended` resolves with its exit code. */
const viewer = (told: object, token: string, rung: ReturnType<typeof bell>) => {
  const said: string[] = [];
  const child: ChildProcess = spawn(process.execPath, [VIEWER], {
    env: { ...process.env, VIEWER_TOKEN: token },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let rest = '';
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => {
    rest += chunk;
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    said.push(...lines);
    rung.ring();
  });
  const stderr: string[] = [];
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => void stderr.push(chunk));
  child.stdin!.end(JSON.stringify(told));
  const ended = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { said, stderr, child, ended, stop: () => void child.kill('SIGKILL') };
};

/** What one `what` line of the viewer said, parsed; `undefined` where it said none. */
const lineOf = (said: readonly string[], what: string): unknown => {
  const line = said.find((l) => l.startsWith(`${what} `));
  return line === undefined ? undefined : (JSON.parse(line.slice(what.length + 1)) as unknown);
};

test(
  'a viewer follows a holder’s live session across processes, and reads it from the files once the holder is gone',
  WAITED,
  async (t) => {
    const rung = bell();
    const held = await holder();
    const { root, cwd, engine, served } = held;
    t.after(() => {
      fs.writeFileSync(path.join(root, 'go'), '');
      return held.close();
    });
    assert.ok(served, 'an engine that runs Claude Code attached serves its own sessions while it holds');
    assert.deepEqual(Object.keys(served.cards).sort(), ['claude', HARNESS].sort(), 'it serves every harness it runs itself');

    const taskId = await Effect.runPromise(engine.file({ brief: 'say it', cwd, harness: HARNESS }));
    await Effect.runPromise(engine.tick());
    const live = viewer({ root, taskId, card: served.cards[HARNESS], what: 'follow' }, served.token, rung);
    t.after(() => live.stop());
    await until(
      t,
      () => live.said.some((l) => l.includes('Rivers')),
      () => `the text so far: ${live.said.join(' | ')}${live.stderr.join('')}`,
      { bell: rung },
    );
    fs.writeFileSync(path.join(root, 'go'), '');
    assert.equal(await live.ended, 0, `the viewer ended well: ${live.said.join(' | ')}${live.stderr.join('')}`);
    const moments = live.said
      .filter((l) => l.startsWith('moment '))
      .map((l) => JSON.parse(l.slice('moment '.length)) as { kind: string; text?: string; state?: string });
    assert.deepEqual(moments[0], { kind: 'state', state: 'working' }, `the first moment is the session’s state: ${live.said.join(' | ')}`);
    assert.ok(
      moments.some((m) => m.kind === 'partial' && m.text === 'Rivers'),
      `the text in progress came over the wire: ${JSON.stringify(moments)}`,
    );
    assert.ok(
      moments.some((m) => m.kind === 'partial' && m.text === ' run.'),
      `and the rest of it as it was written: ${JSON.stringify(moments)}`,
    );
    assert.deepEqual(
      lineOf(live.said, 'asked'),
      [{ scheme: 'bearer', agentUrl: `${served.url}/${HARNESS}`, harness: HARNESS }],
      'the secret was asked for once, for the one request the follow made: the follow is the only thing dialled',
    );

    const holds = filesUnder(root).filter((f) => fs.readFileSync(path.join(root, f), 'latin1').includes(served.token));
    assert.deepEqual(
      holds,
      [path.join('a2a', 'holder-token')],
      'the token is in the one file that keeps it and nowhere else under the store: no log, no journal, no feed line, no capture',
    );
    assert.ok(filesUnder(root).length > 5, `and the store was read whole: ${filesUnder(root).join(', ')}`);

    await held.close();
    const read = viewer({ root, taskId, card: served.cards[HARNESS], what: 'read' }, served.token, rung);
    t.after(() => read.stop());
    assert.equal(await read.ended, 0, `the viewer still answers with the holder gone: ${read.said.join(' | ')}${read.stderr.join('')}`);
    const transcript = lineOf(read.said, 'transcript') as { events?: Array<{ text?: string }> };
    assert.ok(
      transcript.events?.some((e) => e.text === 'Rivers run.'),
      `the conversation is read from the files, with no holder to ask: ${JSON.stringify(transcript)}`,
    );
    assert.deepEqual(lineOf(read.said, 'asked'), [], 'and nothing was dialled for it');
    assert.ok(lineOf(read.said, 'view'), 'the task is still read whole');
  },
);
