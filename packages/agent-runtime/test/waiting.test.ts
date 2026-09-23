/**
 * What a blocked session is waiting for, at shipped defaults — a fake `claude` that keeps a registry, read through
 * the real `observe` and the real `view`.
 *
 * Seen by the owner on 2026-09-19, the shipped `note` team's first real session: the board said "blocked by the
 * harness" and nothing else a person could use, while `claude agents --json` had read that same session as
 * `"status": "waiting", "waitingFor": "permission prompt", "state": "blocked"`. Nothing read `waitingFor`. Now the
 * sighting carries it, the task's view carries it where the phase is `needs-human`, and the engine judges none of
 * it: the word is the harness's, and a harness that says nothing leaves it unset.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-waiting-${label}-`));

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
process.env.CLAUDE_CONFIG_DIR = tmp('config');
const { createEngine } = await import('../src/facade.ts');

type Row = { name: string; sessionId: string; state: string; status: string; waitingFor?: unknown; startedAt: number };

/** A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and idle. */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'idle', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
}
`, { mode: 0o755 });
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

/** A task whose one session the registry lists blocked, and the engine that reads it. */
const blocked = async (bin: string) => {
  const engine = createEngine({ root: tmp('root') });
  const id = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd') });
  await engine.tick();
  return { engine, id };
};

test('a blocked session carries what its harness says it waits for, in the harness\'s own words, onto the task\'s view', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const { engine, id } = await blocked(claude.bin);
    const [row] = claude.rows();
    claude.set(row!.name, { state: 'blocked', status: 'waiting', waitingFor: 'permission prompt' });

    const v = await engine.view(id);
    assert.equal(v.phase, 'needs-human', 'the phase is the word everything above judges on, and it is unchanged');
    assert.equal(v.waitingFor, 'permission prompt', 'and beside it, what the harness says it waits for');
  });
});

test('a blocked session whose harness says nothing carries nothing: the field is absent, not empty', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const { engine, id } = await blocked(claude.bin);
    const [row] = claude.rows();
    claude.set(row!.name, { state: 'blocked', status: 'waiting' });

    const v = await engine.view(id);
    assert.equal(v.phase, 'needs-human');
    assert.equal(Object.hasOwn(v, 'waitingFor'), false, 'nothing said is nothing carried');

    // Nor does a harness that says it in a shape we have no reading of, or says it blank.
    claude.set(row!.name, { waitingFor: '   ' });
    assert.equal(Object.hasOwn(await engine.view(id), 'waitingFor'), false, 'a blank word is no word');
    claude.set(row!.name, { waitingFor: { reason: 'permission prompt' } });
    assert.equal(Object.hasOwn(await engine.view(id), 'waitingFor'), false, 'and neither is one that is not a string');
  });
});

test('level-triggered: the word is read afresh each pass — the second pass shows the new one and none of the old, and a session that stops waiting loses it', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const { engine, id } = await blocked(claude.bin);
    const [row] = claude.rows();

    claude.set(row!.name, { state: 'blocked', status: 'waiting', waitingFor: 'permission prompt' });
    assert.equal((await engine.view(id)).waitingFor, 'permission prompt');

    claude.set(row!.name, { waitingFor: 'workspace trust dialog' });
    const second = await engine.view(id);
    assert.equal(second.waitingFor, 'workspace trust dialog', 'the second pass shows the new word');
    assert.equal(second.waitingFor?.includes('permission'), false, 'and none of the old: nothing is carried between passes');

    // It moved again. Nobody is waiting on anybody, so there is no question for the word to answer.
    claude.set(row!.name, { state: 'working', status: 'busy', waitingFor: 'permission prompt' });
    const third = await engine.view(id);
    assert.equal(third.phase.startsWith('needs-human'), false, 'it is working again');
    assert.equal(Object.hasOwn(third, 'waitingFor'), false, 'and carries no word: the field rides on needs-human alone');
  });
});
