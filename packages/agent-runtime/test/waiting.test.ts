/**
 * What a blocked session is waiting for, at shipped defaults — a fake `claude` that keeps a registry, read through
 * the real `observe` and the real `view`.
 *
 * `claude agents --json` lists a session held by a prompt as `"status": "waiting", "waitingFor": "permission prompt",
 * "state": "blocked"`. The sighting carries `waitingFor`, the task's view carries it where the phase is `needs-human`, and
 * the engine judges none of it: the word is the harness's, and a harness that says nothing leaves it unset.
 *
 * Where Claude Code keeps transcripts, `CLAUDE_CONFIG_DIR`, is read when the runner is loaded, so it is set before the
 * runner's import.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';

const tmp = (label: string) => scratch(`ae-waiting-${label}-`);

process.env.CLAUDE_CONFIG_DIR = tmp('config');
const { Engine } = await import('../src/index.ts');

const { builtEngine } = await import('./engine.ts');

type Row = { name: string; sessionId: string; state: string; status: string; waitingFor?: unknown; startedAt: number };

/** A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and idle. */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'idle', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
}
`,
    { mode: 0o755 },
  );
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
  };
};

test("a session blocked on a person carries what its harness says it waits for onto the task's view, read afresh on each look, and nothing once it stops waiting or says nothing", async (t) => {
  const s = story(t);
  const claude = fakeClaude();
  const prev = process.env.PATH;
  process.env.PATH = `${claude.bin}:${prev}`;
  t.after(() => {
    process.env.PATH = prev;
  });
  const engine = builtEngine(Engine.layer({ root: tmp('root') }));
  let id = '';
  let name = '';
  const view = () => Effect.runPromise(engine.view(id));

  await s.test("blocked, it carries what its harness says it waits for, in the harness's own words, beside the phase", async () => {
    id = await Effect.runPromise(engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') }));
    await Effect.runPromise(engine.tick());
    [{ name }] = claude.rows();
    claude.set(name, { state: 'blocked', status: 'waiting', waitingFor: 'permission prompt' });
    const v = await view();
    assert.equal(v.phase, 'needs-human', 'the phase is the word everything above judges on, and it is unchanged');
    assert.equal(v.waitingFor, 'permission prompt', 'and beside it, what the harness says it waits for');
  });

  await s.test('level-triggered: the next look shows the new word and none of the old — nothing is carried between passes', async () => {
    claude.set(name, { waitingFor: 'workspace trust dialog' });
    const second = await view();
    assert.equal(second.waitingFor, 'workspace trust dialog', 'the second pass shows the new word');
    assert.equal(second.waitingFor?.includes('permission'), false, 'and none of the old: nothing is carried between passes');
  });

  await s.test(
    'a harness that says nothing, a blank word, or one that is not a string carries nothing: the field is absent, not empty',
    async () => {
      claude.set(name, { waitingFor: undefined });
      const v = await view();
      assert.equal(v.phase, 'needs-human');
      assert.equal(Object.hasOwn(v, 'waitingFor'), false, 'nothing said is nothing carried');
      claude.set(name, { waitingFor: '   ' });
      assert.equal(Object.hasOwn(await view(), 'waitingFor'), false, 'a blank word is no word');
      claude.set(name, { waitingFor: { reason: 'permission prompt' } });
      assert.equal(Object.hasOwn(await view(), 'waitingFor'), false, 'and neither is one that is not a string');
    },
  );

  await s.test('working again, it carries no word though its harness still says one: the field rides on needs-human alone', async () => {
    claude.set(name, { state: 'working', status: 'busy', waitingFor: 'permission prompt' });
    const third = await view();
    assert.notEqual(third.phase, 'needs-human', 'it is working again');
    assert.equal(Object.hasOwn(third, 'waitingFor'), false, 'and carries no word: the field rides on needs-human alone');
  });
});
