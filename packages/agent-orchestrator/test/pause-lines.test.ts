/**
 * The store's pause as the CLI says it (`pausedWords`): first on `nemia watch --once`, after how to start the run on `nemia start`, and on `nemia
 * up` once when it is put, again each time its words change — Pausing with fewer finishing, then Paused, then a landing held staged — and
 * `resumed` once when it is resumed (`pauseSaid`); none of them while no pause stands.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest } from './placed.ts';
import { heldUnasked } from './unasked.ts';

const ROOT = scratch('wf-pause-lines-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { main } = await import('../src/cli/main.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { pauseSaid } = await import('../src/daemon/up.verb.ts');
const { resumePause, putPause } = await import('../src/pause/pause.store.ts');
const { pausedWords, RESUMED } = await import('../src/pause/pause.ts');
const { addFactory, attachWorkflow, hireAgent } = await import('../src/runner.ts');

/** What `fn` printed on stdout, line by line. */
const printed = async (t: TestContext, fn: () => unknown): Promise<string[]> => {
  const lines: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    lines.push(args.join(' '));
  });
  try {
    await fn();
  } finally {
    log.mock.restore();
  }
  return lines.join('\n').split('\n');
};

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
heldUnasked(engine);
let factories = 0;

/** A repository with one commit, a team of one step and one agent, and a factory of its own on the repository that offers it, hired. */
const aStart = (): string[] => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
  const dir = path.join(team, 'lines');
  fs.mkdirSync(dir);
  fs.mkdirSync(path.join(team, 'agents'));
  fs.writeFileSync(path.join(team, 'agents', 'worker.md'), '---\nharness: codex\n---\nDo the work.\n');
  fs.writeFileSync(path.join(dir, 'work.md'), '---\nplace: git\n---\nwork it\n');
  const factory = `lines${++factories}`;
  addFactory({ name: factory, repos: [repo] });
  attachWorkflow({ factory, workflow: 'lines' });
  hireAgent({ factory, agent: 'worker', step: 'lines/work' });
  return ['start', 'a paused start', '--workflows', dir, '--repo', repo, '--factory', factory, '--no-worktree'];
};

test('nemia watch --once opens with the pause while one stands, Paused with nothing at work, and says none once it is resumed', async (t) => {
  const pause = putPause({ why: 'merging by hand', by: 'ann' });
  try {
    const feed = await printed(t, () => main(['watch', '--once'], engineOf(engine().layer), undefined, stand().place));
    assert.equal(feed[0], pausedWords({ pause, finishing: [], staged: [], held: [] }), feed.join('\n'));
    assert.match(feed[0], /^Paused since /);
  } finally {
    resumePause();
  }
  const lifted = await printed(t, () => main(['watch', '--once'], engineOf(engine().layer), undefined, stand().place));
  assert.equal(
    lifted.some((l) => l.startsWith('Paus')),
    false,
    lifted.join('\n'),
  );
});

test('nemia start says, after how to start the run, that nothing of it is filed until it resumes, and nothing of a pause with none', async (t) => {
  const pause = putPause({ by: 'ann' });
  let started: string[];
  try {
    started = await printed(t, () => main(aStart(), engineOf(engine().layer), undefined, stand().place));
  } finally {
    resumePause();
  }
  const at = started.indexOf("run 'nemia tick' (or 'nemia up') to start it");
  assert.ok(at > 0, started.join('\n'));
  assert.equal(started[at + 1], `${pausedWords({ pause, finishing: [], staged: [], held: [] })}: nothing of this run is filed until then`);
  const free = await printed(t, () => main(aStart(), engineOf(engine().layer), undefined, stand().place));
  assert.equal(
    free.some((l) => l.includes('nothing of this run is filed')),
    false,
    free.join('\n'),
  );
});

test('nemia up says the pause once across passes, again each time its words change, and resumed once when it is resumed', () => {
  const pause = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
  const two = {
    pause,
    finishing: [
      { run: 'r-1', step: 'a', kind: 'session' as const },
      { run: 'r-2', step: 'b', kind: 'check' as const },
    ],
    staged: [],
    held: [],
  };
  const one = { ...two, finishing: two.finishing.slice(1) };
  const none = { ...two, finishing: [] };
  const held = { ...none, staged: [{ run: 'r-3', step: 'ship', repo: '/code/app' }] };
  const signed = { ...held, held: [{ run: 'r-4', step: 'land' }] };
  let said: string | undefined;
  const lines: string[] = [];
  for (const standing of [undefined, two, two, one, none, none, held, held, signed, signed, undefined, undefined]) {
    const now = pauseSaid(standing, said);
    lines.push(...now.lines);
    said = now.said;
  }
  assert.deepEqual(lines, [
    pausedWords(two),
    pausedWords(one),
    pausedWords(none),
    pausedWords(held),
    "   r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on nemia resume",
    pausedWords(signed),
    "   r-3's ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on nemia resume",
    "   r-4's land has signed off, and its check waits on nemia resume",
    RESUMED,
  ]);
  assert.deepEqual(
    lines.map((l) => l.slice(0, 7)),
    ['Pausing', 'Pausing', 'Paused ', 'Paused ', "   r-3'", 'Paused ', "   r-3'", "   r-4'", 'the sto'],
  );
});
