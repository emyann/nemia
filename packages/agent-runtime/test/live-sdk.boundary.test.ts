/**
 * What the Agent SDK's own bundled Claude Code resolves the model alias `opus` to — against the real harness, skipped unless
 * `AE_LIVE=1`, because it spends money.
 *
 * A boundary test: the real Claude Code the SDK bundles is its whole subject, and it is a file of its own rather than a case of
 * `live.test.ts`, so that one measurement can be run alone: `AE_LIVE=1 node --test test/live-sdk.boundary.test.ts` from
 * `packages/agent-runtime`.
 *
 * Only a real session can answer this. The model a session runs on is chosen inside Claude Code, and `opus` is an alias it resolves
 * at start: `@anthropic-ai/claude-agent-sdk` 0.3.270 bundled Claude Code 2.1.270, where `opus` was `claude-opus-5`, while the
 * owner's own terminal on 2.1.308 had it as `claude-opus-5-5` — so every agent of the team asked for `opus` and got a model nobody
 * chose, and nothing failed. Reading the alias out of a changelog proves nothing about the binary that is installed; a
 * `workflows/build/probe.ts` session proves less still, since that starts the `claude` on PATH and not the one the SDK bundles.
 *
 * So the measurement is a job filed through the runtime's own road, `config: { model: 'opus' }`, on the attached harness a step's
 * session runs on — the SDK's `query()`, through `bin/ae-claude-job.ts`. Its `init` line says the model, and the runtime now carries
 * that onto the attempt (`Sighting.model`), so the assertion is on the attempt's record and the raw line is kept beside it for a
 * person to read. The whole `init` line, and the attempt as the engine recorded it, are written to `WF_ARTIFACTS` when it is set.
 *
 * Its control is the old SDK: the same job on 0.3.270 records `claude-opus-5`, which is the measurement the card was filed on.
 *
 * `OPUS_TODAY` in `sdk-pin.ts` is what this asserts, and the one constant of the three a bump cannot infer: an alias can move under a
 * version that did not.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine as EngineService, nameFor, type TaskView } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { filesOf } from '../src/harness/claude/attached-file.ts';
import { scratch } from './scratch.ts';
import { until, WAITED } from '../src/waits/index.ts';
import { OPUS_TODAY, SDK_VERSION } from './sdk-pin.ts';

const skip = process.env.AE_LIVE === '1' ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';

/** The `{"type":"system","subtype":"init",…}` line of the session `name`'s kept stdout under `root`, whole, as Claude Code printed it. */
const initLine = (root: string, name: string): string | undefined =>
  fs
    .readFileSync(filesOf(root, name).out, 'utf8')
    .split('\n')
    .find((l) => l.includes('"subtype":"init"'));

/** `what` handed over where the step that runs this has a files directory, so its reader is not this test's stdout alone. */
const handOver = (file: string, what: string): void => {
  const dir = process.env.WF_ARTIFACTS;
  if (dir) fs.writeFileSync(path.join(dir, file), what);
};

test(
  'a job asking for the model alias `opus` starts on the model the bundled Claude Code resolves it to',
  { ...WAITED, skip, timeout: 10 * 60_000 },
  async (t: TestContext) => {
    const root = scratch('ae-live-sdk-root-');
    const cwd = scratch('ae-live-sdk-cwd-');
    const engine = builtEngine(EngineService.layer({ root }));
    const id = await Effect.runPromise(
      engine.file({
        brief: 'Give your closing statement at once, with ok as its word. Do nothing else.',
        cwd,
        harness: 'claude',
        deadlineSeconds: 300,
        config: { model: 'opus', effort: 'low', tools: [] },
        closeoutSchema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false },
      }),
    );

    let view: TaskView | undefined;
    try {
      await until(
        t,
        async () => {
          await Effect.runPromise(engine.tick());
          view = await Effect.runPromise(engine.view(id));
          return view.state.settled !== null;
        },
        'the job settled',
        { everyMs: 5_000 },
      );

      const attempt = (view as TaskView | undefined)?.state.attempts.at(-1);
      assert.ok(attempt, `the job ran an attempt: ${view?.phase}`);
      const name = nameFor(id, attempt.n);
      const line = initLine(root, name);
      handOver(`sdk-${SDK_VERSION}-init.txt`, `${line ?? 'no init line kept'}\n`);
      handOver(`sdk-${SDK_VERSION}-attempt.json`, `${JSON.stringify(attempt, null, 2)}\n`);

      assert.ok(line, `the session printed an \`init\` line; its kept stdout is ${filesOf(root, name).out}`);
      assert.equal(
        (JSON.parse(line) as { model?: string }).model,
        OPUS_TODAY,
        `the \`init\` line of a session asked for \`opus\`, on the Claude Code ${SDK_VERSION} bundles: ${line}`,
      );
      assert.equal(
        attempt.ranOn,
        OPUS_TODAY,
        'and the runtime recorded it on the attempt, so which model a session ran on is a fact of the record and not a grep',
      );
    } finally {
      const session = view?.sessionId;
      if (session)
        for (const verb of ['stop', 'rm'])
          try {
            execFileSync('claude', [verb, session.split('-')[0]], { stdio: 'ignore', timeout: 30_000 });
          } catch {}
    }
  },
);
