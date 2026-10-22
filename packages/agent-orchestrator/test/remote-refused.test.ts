/**
 * A store's `a2a-agents.json` refused — as it stands, or one entry of it — stops only a step that names what is refused. `engine()`, which
 * every command and the api make, leaves it out and says why on stderr, so `nemia ls` and `nemia tick` of a run with no remote step go on
 * as before, at shipped defaults: `main` with the engine it makes itself. A fake `claude` and `codex` first on PATH, so nothing real is
 * asked. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-remote-refused-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const BIN = scratch('wf-remote-refused-bin-');
for (const name of ['claude', 'codex']) fs.writeFileSync(path.join(BIN, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');

const FILE = path.join(ROOT, 'a2a-agents.json');

/** What `main` printed, on stdout and on stderr, while it ran with the engine it makes itself. */
async function said(argv: string[]): Promise<{ out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const { log, error } = console;
  console.log = (...args: unknown[]) => {
    out.push(args.join(' '));
  };
  console.error = (...args: unknown[]) => {
    err.push(args.join(' '));
  };
  try {
    await main(argv);
  } finally {
    Object.assign(console, { log, error });
  }
  return { out: out.join('\n'), err: err.join('\n') };
}

/** A folder team with a local step, and one with a step on the remote agent `agent`. */
function team(name: string, harness: string): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'work.md'), `---\nworkspace: folder\nharness: ${harness}\n---\nWrite a note on tides.\n`);
  return dir;
}

/** `nemia start` of `dir`, from the store, and the run's id. */
async function started(dir: string): Promise<string> {
  const cwd = process.cwd();
  process.chdir(ROOT);
  try {
    return (await said(['start', 'a note on tides', '--workflows', dir])).out.split(/\s+/)[0];
  } finally {
    process.chdir(cwd);
  }
}

const LOCAL = team('local', 'claude');
const REMOTE = team('remote', 'a2a:reviewer');

for (const [what, text, why] of [
  ['refused as it stands', '{ reviewer: ', /a2a-agents\.json: is not JSON/],
  [
    'with an entry the runtime refuses',
    JSON.stringify({ reviewer: { url: 'ftp://a.example' } }),
    /a2a-agents\.json: `reviewer`: .*the `a2a:reviewer` harness/,
  ],
] as const) {
  test(`a2a-agents.json ${what} leaves the engine made, nemia ls and nemia tick of a local run working, and refuses only a step that names it`, async () => {
    fs.rmSync(FILE, { force: true });
    const id = await started(LOCAL);
    fs.writeFileSync(FILE, text);
    try {
      const made = await said(['ls']);
      assert.match(made.out, new RegExp(id), made.out);
      assert.match(made.err, why, 'engine() says why it left the file or the entry out');
      assert.ok(made.err.includes('until the file is fixed and this process restarts'), made.err);
      assert.ok(made.err.includes('refused by `nemia start`'), made.err);
      const ticked = await said(['tick']);
      assert.match(ticked.err, why);
      assert.ok(readRun(id).steps.work, `the local step was filed: ${JSON.stringify(readRun(id).steps)}`);
      const runs = fs.readdirSync(path.join(ROOT, 'runs')).length;
      await assert.rejects(
        said(['start', 'a review', '--workflows', REMOTE]),
        (err: Error & { exitCode?: number }) => err.exitCode === 2 && why.test(err.message),
        "nemia start of a step on the agent is refused, in the file's words",
      );
      assert.equal(fs.readdirSync(path.join(ROOT, 'runs')).length, runs, 'no run was written');
    } finally {
      fs.rmSync(FILE, { force: true });
    }
  });
}
