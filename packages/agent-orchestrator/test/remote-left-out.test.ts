/**
 * A remote step filed, and then its agent left out of the engine: `a2a-agents.json` refused as it stands, its entry refused, or the entry
 * removed, and `nemia tick` run with the engine `main` makes itself, as a restarted `nemia up` would. One step is at work on the agent (its
 * Task waits on a question), one is filed and queued behind it. Neither may be handed to Claude Code, the engine's first harness: a runtime
 * that falls back to it for a harness it does not have spawns the queued one as a `claude -p` job in the step's workspace, and looks for
 * the one at work in Claude Code's listing and, past the grace, ends it `lost`. The one at work is held, neither there nor gone, and
 * followed again once the file is fixed; the queued one is refused its start in words that say why. A fake `claude` and `codex` first on
 * PATH write down every call, so nothing real is asked and any call is seen.
 *
 * `WF_ROOT` is set before the import, since the module reads it as it loads. Each case leaves its step held at work on the agent, so by
 * the second a pool of two sessions, the default, is full and the queued step is never admitted to be refused: the test sets
 * `WF_MAX_CONCURRENT` itself, since a check the run executes inherits the daemon's ceiling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { a2aServer } from './a2a-server.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from 'agent-runtime/testing';

const ROOT = scratch('wf-remote-left-out-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
process.env.WF_MAX_CONCURRENT = '10';
const BIN = scratch('wf-remote-left-out-bin-');
const CALLS = path.join(BIN, 'calls.log');
for (const name of ['claude', 'codex'])
  fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\necho "${name} $*" >> '${CALLS}'\nexit 1\n`, { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const { main } = await import('../src/cli/main.ts');

const FILE = path.join(ROOT, 'a2a-agents.json');

/** What `main` printed on stderr while it ran with the engine it makes itself; stdout is not this test's. */
async function said(argv: string[]): Promise<string> {
  const err: string[] = [];
  const { log, error } = console;
  console.log = () => {};
  console.error = (...args: unknown[]) => {
    err.push(args.join(' '));
  };
  try {
    await main(argv);
  } finally {
    Object.assign(console, { log, error });
  }
  return err.join('\n');
}

const DIR = path.join(ROOT, 'workflows', 'remote');
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(
  path.join(DIR, 'work.md'),
  '---\nworkspace: folder\nharness: a2a:reviewer\n---\nRead the note and say whether it is right.\n',
);

/** `nemia start` of the remote team, from the store, and the run's id. */
async function started(): Promise<string> {
  const cwd = process.cwd();
  process.chdir(ROOT);
  const out: string[] = [];
  const { log } = console;
  console.log = (...args: unknown[]) => {
    out.push(args.join(' '));
  };
  try {
    await main(['start', 'a note on tides', '--workflows', DIR]);
    return out.join('\n').split(/\s+/)[0];
  } finally {
    console.log = log;
    process.chdir(cwd);
  }
}

/** The engine's journal of a run's step, as it stands on disk. */
const journal = (run: string): Array<Record<string, unknown>> => {
  const file = path.join(ROOT, 'engine', 'tasks', `${run}-work.jsonl`);
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
};
const ended = (run: string) => journal(run).filter((e) => e.kind === 'ended');

for (const [what, text] of [
  ['refused as it stands', '{ reviewer: '],
  ['with its entry refused', JSON.stringify({ reviewer: { url: 'ftp://a.example' } })],
  ['with its entry removed', '{}'],
] as const) {
  test(
    `a2a-agents.json ${what}: a remote step at work is held, not ended lost, and a queued one is refused, and neither is handed to Claude Code`,
    WAITED,
    async (t) => {
      const server = await a2aServer({ answer: () => ({ asks: 'Which note?' }) });
      const good = JSON.stringify({ reviewer: { url: server.url } });
      try {
        fs.writeFileSync(FILE, good);
        const away = await started();
        await until(
          t,
          async () => {
            if (journal(away).some((e) => e.kind === 'spawned') && server.sent.length >= 1) return true;
            await said(['tick']);
            return false;
          },
          () => `${away} spawned and sent to the agent; ${server.sent.length} sent, its journal ${JSON.stringify(journal(away))}`,
          { everyMs: 0 },
        );
        const queued = await started();
        await said(['tick']);
        assert.ok(
          journal(queued).some((e) => e.kind === 'filed'),
          'the second step is filed, queued, before the file changes',
        );
        assert.equal(ended(away).length, 0, 'the first is at work on the agent');

        fs.writeFileSync(FILE, text);
        fs.rmSync(CALLS, { force: true });
        for (let i = 0; i < 4; i++) {
          await said(['tick']);
          await said(['ls']);
        }
        assert.equal(
          fs.existsSync(CALLS) ? fs.readFileSync(CALLS, 'utf8') : '',
          '',
          'Claude Code was asked nothing: no job spawned, and no listing looked in for a remote session',
        );
        assert.equal(ended(away).length, 0, `the step at work is held, neither there nor gone: ${JSON.stringify(journal(away))}`);
        assert.equal(
          journal(queued).some((e) => e.kind === 'spawned'),
          false,
          `the queued step was never spawned: ${JSON.stringify(journal(queued))}`,
        );
        const refused = ended(queued);
        assert.equal(refused.length, 1, JSON.stringify(journal(queued)));
        assert.equal(refused[0].reason, 'unstartable');
        assert.match(String(refused[0].error), /^`harness: a2a:reviewer` is not a harness this engine has, so nothing was started/);
        assert.equal(server.sent.length, 1, 'and nothing more was sent to the agent');

        fs.writeFileSync(FILE, good);
        await said(['tick']);
        assert.equal(
          ended(away).length,
          0,
          `once the file is fixed, the step at work is followed again on the agent, not ended: ${JSON.stringify(journal(away))}`,
        );
        assert.ok(journal(away).every((e) => e.kind !== 'ended' || e.observed !== 'lost'));
      } finally {
        fs.rmSync(FILE, { force: true });
        await server.close();
      }
    },
  );
}
