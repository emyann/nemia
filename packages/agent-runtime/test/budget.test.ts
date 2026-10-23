/**
 * A spend cap on the task, at shipped defaults — fake `claude`s on PATH that answer as Claude Code does.
 *
 * `claude -p --max-budget-usd` ends a session that crosses its cap with exit 1 and a result whose `subtype` is
 * `error_max_budget_usd` (`test/live.test.ts` runs it with `AE_LIVE=1`); a `claude --bg` session given the same flag keeps
 * no cap, runs on past it, and ends `done`. So `claude-detached` hands a task's cap (`config.budgetUsd`, one of the
 * harness's arguments) to the harness on every attempt and records the end it prints — `failed`, and the limit the harness
 * says it stopped at, as a fact: the runtime judges no budget, and the orchestrator says `budget exhausted` of it.
 * The engine's `file` refuses a cap on a `claude --bg` session, which would keep none. The `claude --bg` runner is
 * still given the flag when a task reaches it with one: its argv, every option set, is pinned in `completion.test.ts`, and a
 * later turn of a task held open is spawned from the record the same way (`engine.test.ts`).
 *
 * The `claude -p` fake prints the result `claude -p --output-format json` prints for a session that crosses its cap, keys
 * trimmed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED } from '../src/waits/index.ts';

const tmp = (label: string) => scratch(`ae-budget-${label}-`);

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    return await f();
  } finally {
    process.env.PATH = prev;
  }
};

/** The arguments of every run the fake recorded, in order. */
const runsIn = (log: string) =>
  fs
    .readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as string[]);
const valueOf = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

test(
  'claude-detached at shipped defaults: a session that stops at its cap ends its attempt failed, at the limit `budget` its harness named, with what it cost — and its task settles failed, with no attempt 2 and no word of a budget of its own',
  WAITED,
  async (t) => {
    const bin = tmp('bin');
    const runs = path.join(bin, 'runs.jsonl');
    const result = {
      type: 'result',
      subtype: 'error_max_budget_usd',
      is_error: true,
      terminal_reason: 'budget_exhausted',
      errors: ['Reached maximum budget ($0.01)'],
      total_cost_usd: 0.01804,
      duration_api_ms: 718,
      num_turns: 2,
      session_id: '5e551011-0000-4000-8000-00000000b0d9',
    };
    fs.writeFileSync(
      path.join(bin, 'claude'),
      `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'agents') { process.stdout.write('[]'); process.exit(0); }
require('node:fs').appendFileSync(${JSON.stringify(runs)}, JSON.stringify(args) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(result))} + '\\n');
process.exitCode = 1;
`,
      { mode: 0o755 },
    );

    await onPath(bin, async () => {
      const engine = builtEngine(Engine.layer({ root: tmp('root') }));
      const id = await Effect.runPromise(
        engine.file({ brief: 'the prompt', cwd: tmp('cwd'), harness: 'claude-detached', config: { budgetUsd: 0.01 } }),
      );
      await until(
        t,
        async () => {
          if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
          await Effect.runPromise(engine.tick());
          return false;
        },
        `${id} settled`,
        { everyMs: 100 },
      );
      for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
      const { state } = await Effect.runPromise(engine.view(id));
      assert.equal(state.settled, 'failed');
      assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
      const [a] = state.attempts;
      assert.deepEqual(
        [a.ended, a.reason, a.limit, a.exitCode],
        ['failed', 'harness', 'budget', 1],
        'it ended at its cap, as its harness said',
      );
      assert.deepEqual(a.usage, { costUsd: 0.01804, apiMs: 718 }, 'with what it spent getting there');
      assert.equal(a.nativeId, result.session_id, 'a session a new filing could continue');
      const settled = (await Effect.runPromise(engine.feed(0))).entries.find((e) => e.taskId === id && e.event.kind === 'settled')?.event;
      const note = settled?.kind === 'settled' ? (settled.note ?? '') : '';
      assert.equal(note, '1 attempt(s), none succeeded', 'settled as any failed attempt is');
      assert.doesNotMatch(
        note,
        /budget/,
        "the runtime says nothing of a budget: whether a cap reached is the reason is the caller's to say",
      );

      const argvs = runsIn(runs);
      assert.equal(argvs.length, 1, 'claude -p ran once');
      assert.equal(valueOf(argvs[0], '--max-budget-usd'), '0.01', 'with the cap');
    });
  },
);
