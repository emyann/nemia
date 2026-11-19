/**
 * What the Agent SDK's own bundled Claude Code resolves the model alias `opus` to — against the real harness, skipped unless
 * `AE_LIVE=1`, because it spends money.
 *
 * A boundary test: the real Claude Code the SDK bundles is its whole subject, and it is a file of its own rather than a case of
 * `live.test.ts`, so that one measurement can be run alone: `AE_LIVE=1 npx vitest run test/live-sdk.boundary.test.ts` from
 * `packages/agent-runtime`.
 *
 * Only a real session can answer this. The model a session runs on is chosen inside Claude Code, and `opus` is an alias it resolves
 * at start: `@anthropic-ai/claude-agent-sdk` 0.3.270 bundled Claude Code 2.1.270, where `opus` was `claude-opus-5`, while the
 * owner's own terminal on 2.1.308 had it as `claude-opus-5-5` — so every agent of the team asked for `opus` and got a model nobody
 * chose, and nothing failed. Reading the alias out of a changelog proves nothing about the binary that is installed; a
 * `workflows/build/probe.ts` session proves less still, since that starts the `claude` on PATH and not the one the SDK bundles.
 *
 * So the measurement is a job filed through the runtime's own road, `config: { model: 'opus' }`, on the attached harness a step's
 * session runs on — the SDK's `query()`, through `bin/ae-claude-job.ts`. The session's own
 * `{"type":"system","subtype":"init",…}` line says the model, `claudeStreamOutput` reads it off that line and nowhere else
 * (`test/detached.test.ts` holds that), and the runtime carries it onto the attempt as `ranOn`. So the assertion here is on the
 * attempt's record, which is the `init` line's word arrived at its resting place, and the attempt as the engine recorded it is
 * written to `WF_ARTIFACTS` when that is set.
 *
 * The engine's job does not keep the raw line: the holder writes the capture as the session ends and the engine releases the
 * session in the same tick it reads that end from, so there is no pass of any wait at which the file is on disk — watched at 100 ms
 * through a whole session, never seen, while `ranOn` was read all the same. So the second case runs the process the worker spawns for
 * a step, `bin/ae-claude-job.ts`, itself, on the same request shape and the SDK's own Claude Code (no `AE_CLAUDE_EXECUTABLE`), and
 * keeps its stdout, ending its stdin at the session's `result` line as the worker does (`closesOn`). The session's `system`/`init`
 * line, whose `model` and `claude_code_version` are asserted, is the one `claudeStreamOutput` — the reader the engine uses — reads as
 * `ranOn`, and its version as `harnessVersion`, which the engine records on the attempt with the runtime's own folder (`image`). That line
 * is written to `WF_ARTIFACTS` as
 * `sdk-<version>-init.json`, beside the engine's attempt, so the record and the line it came from are handed over together.
 *
 * Its control is the old SDK: the same job on 0.3.270 records `claude-opus-5`, which is the measurement the card was filed on.
 *
 * The third case measures, on the same process, which models Claude Code drops `auto` on: each model `CLAUDE_AUTO_DROPPED` lists and
 * each alias the refusals advise as keeping it, filed in `auto`, its mode read by the reader the engine uses (`ranIn`): the last its
 * `init` or `status` lines name. Not the `init` line's alone: Claude Code can print it before it settles the mode, and say the settled
 * one on a `status` line after it — on 2.1.322, `claude-haiku-4-5` and `claude-sonnet-4-5` each printed `init` with
 * `auto` and then `status` with `default` in 1 run of 10, and `default` on both in the other 9, so a case that read the `init` line
 * failed on a coin flip. Both ran in `default` in all 10, and `haiku` and `sonnet` in `auto` in all 10. The list is a measurement of
 * one Claude Code, so it is made again at each bump by this case rather than carried; each `init` line is handed over as
 * `sdk-<version>-auto-<model>.json`.
 *
 * The last two measure what a session in a factory's home meets (`docs/harness.md`, *A session in one folder, working on another*):
 * whether, its added folders' memory files loaded (`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`), the settings'
 * `claudeMdExcludes` skips one by `<path>/**`, as the orchestrator writes it, beside a control that loads both; and whether a session
 * started in a folder Claude Code was never asked to trust takes its `.claude/settings.json` (an output style, read off the `init`
 * line) and lists its skills. Each answer is handed over as `sdk-<version>-excludes.json` and `sdk-<version>-untrusted-home.json`.
 *
 * The last measures what the orchestrator's trust of a run's home is for: a home whose `.claude/settings.json` allows one command, run
 * in `dontAsk`, is refused it while Claude Code was never asked to trust the folder, and runs it once `trustFolder` has written the
 * folder's record; the record still reads trusted after the session, and `untrustFolder` takes back every record under both folders,
 * in a `finally`, so the machine's `.claude.json` is left with none of them whatever failed. The two result lines are handed over as
 * `sdk-<version>-trusted-home.json`.
 *
 * `OPUS_TODAY` in `sdk-pin.ts` is what this asserts, and the one constant of the three a bump cannot infer: an alias can move under a
 * version that did not.
 */
import { test, type TestContext } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { Engine as EngineService, type TaskView, trustedFolder, trustFolder, untrustFolder } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { scratch } from 'test-kit/scratch';
import { until, WAITED } from '../src/waits/index.ts';
import { claudeStreamOutput } from '../src/harness/detached/output.ts';
import { CLAUDE_CODE_VERSION, OPUS_TODAY, SDK_VERSION } from './sdk-pin.ts';
import { CLAUDE_AUTO_DROPPED, fenceReach } from '../src/vocabulary.ts';

const skip = process.env.AE_LIVE === '1' ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';

/** `what` handed over where the step that runs this has a files directory, so its reader is not this test's stdout alone. */
const handOver = (file: string, what: string) => {
  const dir = process.env.WF_ARTIFACTS;
  if (dir) fs.writeFileSync(path.join(dir, file), what);
};

test.skipIf(skip)(
  'a job asking for the model alias `opus` starts on the model the bundled Claude Code resolves it to',
  { ...WAITED, timeout: 10 * 60_000 },
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
        { everyMs: 500 },
      );

      const attempt = view?.state.attempts.at(-1);
      assert.ok(attempt, `the job ran an attempt: ${view?.phase}`);
      handOver(`sdk-${SDK_VERSION}-attempt.json`, `${JSON.stringify(attempt, null, 2)}\n`);

      assert.equal(
        attempt.ranOn,
        OPUS_TODAY,
        `a session asked for \`opus\`, on the Claude Code ${SDK_VERSION} bundles, ran on ${attempt.ranOn}; it ended ${attempt.reason}`,
      );
      assert.equal(attempt.ended, 'succeeded', `and it ran: ${view?.phase}`);
      assert.equal(attempt.harnessVersion, CLAUDE_CODE_VERSION, 'the attempt records the Claude Code its init line names');
      assert.equal(attempt.image, fs.realpathSync(path.join(import.meta.dirname, '..')), 'and the real folder of the runtime that ran it');
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

/**
 * Each JSON line of a job's stdout. The `init` line is looked for rather than taken first: on 0.3.308 and 0.3.316 the SDK prints its
 * command lifecycle lines for the queued prompt ahead of it, and a `result` line does not open with its `type`.
 */
type Line = {
  type?: string;
  subtype?: string;
  model?: string;
  claude_code_version?: string;
  permissionMode?: string;
  output_style?: string;
  skills?: string[];
  result?: string;
  permission_denials?: unknown[];
};
const linesOf = (out: string) =>
  out.split('\n').flatMap((text) => {
    try {
      return [JSON.parse(text) as Line];
    } catch {
      return [];
    }
  }) satisfies Line[];

const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ae-claude-job.ts');

/**
 * Runs the process the worker spawns for a step, `bin/ae-claude-job.ts`, on `config` and the SDK's own Claude Code (no
 * `AE_CLAUDE_EXECUTABLE`), and keeps its stdout, ending its stdin at the session's `result` line as the worker does (`closesOn`). The
 * session starts in a scratch folder of its own, or in `given.cwd`, and is told to answer ok, or `given.brief`.
 */
const jobRun = async (name: string, config: object, given: { cwd?: string; brief?: string } = {}) => {
  const dir = scratch('ae-live-sdk-bin-');
  const at = path.join(dir, 'spawn.request.json');
  const brief = given.brief ?? 'Answer with the single word ok. Do nothing else.';
  fs.writeFileSync(at, JSON.stringify({ request: { name, brief, cwd: given.cwd ?? dir, config }, io: {} }));
  const env = { ...process.env };
  delete env.AE_CLAUDE_EXECUTABLE;
  return new Promise<{ stdout: string; code: number | null; err: string }>((done) => {
    const child = spawn(process.execPath, [BIN, at], { cwd: dir, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let errs = '';
    child.stderr.on('data', (d: Buffer) => (errs += d.toString()));
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
      if (linesOf(out).some((line) => line.type === 'result')) child.stdin.end();
    });
    child.stdin.write(`${JSON.stringify({ type: 'user', message: { content: brief } })}\n`);
    child.on('close', (c) => done({ stdout: out, code: c, err: errs }));
  });
};

const initOf = (stdout: string) =>
  linesOf(stdout).find((line) => line.type === 'system' && line.subtype === 'init') satisfies Line | undefined;

test.skipIf(skip)(
  "a step's job process, asked for `opus`, says on its `init` line the model and the Claude Code it started on, and its reader records that model",
  { timeout: 10 * 60_000 },
  async () => {
    const { stdout, code, err } = await jobRun('ae/live/init', { model: 'opus', effort: 'low', tools: [] });

    const init = initOf(stdout);
    assert.ok(init, `the session printed its init line: ${stdout.slice(0, 300)} ${err}`);
    handOver(`sdk-${SDK_VERSION}-init.json`, `${JSON.stringify(init)}\n`);
    assert.equal(init.model, OPUS_TODAY, `\`opus\` on the Claude Code ${SDK_VERSION} bundles started on ${init.model}`);
    assert.equal(init.claude_code_version, CLAUDE_CODE_VERSION, `the session ran the Claude Code ${SDK_VERSION} bundles`);
    assert.equal(claudeStreamOutput(stdout).ranOn, init.model, 'the reader the engine uses records the model the init line says');
    assert.equal(claudeStreamOutput(stdout).harnessVersion, init.claude_code_version, 'and the Claude Code it names');
    assert.equal(code, 0, `and the session ran to a result: ${err}`);
  },
);

/**
 * The models measured for `auto`: every one `CLAUDE_AUTO_DROPPED` lists, and every alias the refusals advise as keeping it. A model
 * names its own `init` file, so the list and its measurement are handed over together.
 */
const AUTO_MEASURED: readonly string[] = [...CLAUDE_AUTO_DROPPED, 'haiku', 'sonnet', 'opus', 'fable'];

test.skipIf(skip)(
  'each model, filed in `auto`, runs in `auto`, or in `default` exactly where `CLAUDE_AUTO_DROPPED` lists it',
  { timeout: 10 * 60_000 },
  async () => {
    const runs = await Promise.all(
      AUTO_MEASURED.map(async (model) => ({
        model,
        ...(await jobRun(`ae/live/auto/${model}`, { model, permissionMode: 'auto', tools: [] })),
      })),
    );
    for (const { model, stdout, code, err } of runs) {
      const init = initOf(stdout);
      assert.ok(init, `${model} printed its init line (exit ${code}): ${stdout.slice(0, 300)} ${err}`);
      handOver(`sdk-${SDK_VERSION}-auto-${model}.json`, `${JSON.stringify(init)}\n`);
      const dropped = fenceReach('claude', model)?.dropped.includes('auto') === true;
      const ranIn = claudeStreamOutput(stdout).ranIn;
      assert.equal(
        ranIn,
        dropped ? 'default' : 'auto',
        `${model} (${init.model}) was filed in \`auto\`, and ran in ${ranIn} (its init line said ${init.permissionMode}), on Claude Code ` +
          `${init.claude_code_version}. Measure it 10 times as packages/agent-runtime/docs/harness.md says (\`auto\` on haiku) before ` +
          `CLAUDE_AUTO_DROPPED (src/harness/claude/vocabulary.ts) moves, and move it, with the docs that repeat it, on a card of its own`,
      );
      assert.equal(code, 0, `and ${model} ran to a result: ${err}`);
    }
  },
);

/** The session's last answer, off its `result` line. */
const answerOf = (stdout: string) =>
  linesOf(stdout)
    .filter((line) => line.type === 'result')
    .at(-1)?.result ?? '';

/** A folder holding `files`, each by its path from it. */
const folderOf = (prefix: string, files: Record<string, string>) => {
  const dir = scratch(prefix);
  for (const [at, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, at)), { recursive: true });
    fs.writeFileSync(path.join(dir, at), text);
  }
  return dir;
};

const WORDS_BRIEF =
  'Use no tool. Your memory files (CLAUDE.md) may each give a folder its word. Answer with every such word you were given, in capitals, ' +
  'separated by spaces, and nothing else; answer NONE where you were given none.';

test.skipIf(skip)(
  "a session in one folder, with two folders added and their memory files loaded, skips the one its settings' `claudeMdExcludes` names " +
    '(`<path>/**`, as the orchestrator writes it), and reads the other',
  async () => {
    const home = folderOf('ae-live-home-', {});
    const read = folderOf('ae-live-read-', { 'CLAUDE.md': 'The word of this folder is PLUM.\n' });
    const skipped = folderOf('ae-live-skipped-', { 'CLAUDE.md': 'The word of this folder is PEAR.\n' });
    const config = (settings: object) => ({
      model: 'haiku',
      effort: 'low',
      tools: [],
      mounts: [read, skipped].map((p) => ({ path: p, readOnly: true })),
      env: { CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' },
      claude: { settings: JSON.stringify(settings) },
    });
    const [excluded, control] = await Promise.all([
      jobRun('ae/live/excludes', config({ claudeMdExcludes: [`${skipped}/**`] }), { cwd: home, brief: WORDS_BRIEF }),
      jobRun('ae/live/excludes-control', config({}), { cwd: home, brief: WORDS_BRIEF }),
    ]);
    const words = { excluded: answerOf(excluded.stdout), control: answerOf(control.stdout) };
    handOver(`sdk-${SDK_VERSION}-excludes.json`, `${JSON.stringify(words)}\n`);
    assert.match(
      words.control,
      /PEAR/,
      `without the exclude, the added folder's CLAUDE.md loads (the control): ${words.control} ${control.err}`,
    );
    assert.match(words.excluded, /PLUM/, `the folder not excluded is read: ${words.excluded} ${excluded.err}`);
    assert.doesNotMatch(words.excluded, /PEAR/, `the folder its settings exclude by \`<path>/**\` is skipped: ${words.excluded}`);
  },
);

test.skipIf(skip)(
  "a session started in a folder Claude Code was never asked to trust takes that folder's `.claude/settings.json` and lists its skills",
  async () => {
    const home = folderOf('ae-live-untrusted-home-', {
      '.claude/settings.json': `${JSON.stringify({ outputStyle: 'Explanatory' })}\n`,
      '.claude/skills/steer/SKILL.md': '---\nname: steer\ndescription: Where a session stands, for a test.\n---\nSay where you stand.\n',
    });
    const { stdout, code, err } = await jobRun('ae/live/untrusted-home', { model: 'haiku', effort: 'low' }, { cwd: home });
    const init = initOf(stdout);
    assert.ok(init, `the session printed its init line: ${stdout.slice(0, 300)} ${err}`);
    handOver(`sdk-${SDK_VERSION}-untrusted-home.json`, `${JSON.stringify(init)}\n`);
    assert.equal(init.output_style, 'Explanatory', "the folder's settings are applied: its output style");
    assert.ok(init.skills?.includes('steer'), `and its skills listed: ${JSON.stringify(init.skills)}`);
    assert.equal(code, 0, `and the session ran to a result: ${err}`);
  },
);

/** The one command the probe's home allows, and the brief that asks for it. */
const PROBE = 'echo nemia-trust-probe';
const PROBE_BRIEF = `Run exactly this command with the Bash tool, once: ${PROBE}. Then answer with what it printed, or DENIED where it was refused.`;

test.skipIf(skip)(
  "a home's `permissions.allow` is refused while Claude Code was never asked to trust it, and applies once `trustFolder` trusts it",
  async () => {
    const settings = { '.claude/settings.json': `${JSON.stringify({ permissions: { allow: [`Bash(${PROBE}:*)`] } })}\n` };
    const untrusted = fs.realpathSync(folderOf('ae-live-allow-untrusted-', settings));
    const trusted = fs.realpathSync(folderOf('ae-live-allow-trusted-', settings));
    const config = { model: 'haiku', effort: 'low', tools: ['Bash'], permissionMode: 'dontAsk' };
    try {
      assert.equal(trustFolder('claude', trusted)?.trusted, true, 'the trusted home is given its record');
      const [refused, ran] = await Promise.all([
        jobRun('ae/live/allow-untrusted', config, { cwd: untrusted, brief: PROBE_BRIEF }),
        jobRun('ae/live/allow-trusted', config, { cwd: trusted, brief: PROBE_BRIEF }),
      ]);
      const resultOf = (stdout: string) =>
        linesOf(stdout)
          .filter((line) => line.type === 'result')
          .at(-1);
      const results = { untrusted: resultOf(refused.stdout), trusted: resultOf(ran.stdout) };
      handOver(`sdk-${SDK_VERSION}-trusted-home.json`, `${JSON.stringify(results)}\n`);
      assert.ok(
        (results.untrusted?.permission_denials?.length ?? 0) > 0,
        `the untrusted home's allow is dropped, and the command refused (the control): ${JSON.stringify(results.untrusted)} ${refused.err}`,
      );
      assert.deepEqual(
        results.trusted?.permission_denials ?? [],
        [],
        `the trusted home's allow applies: ${JSON.stringify(results.trusted)} ${ran.err}`,
      );
      assert.match(answerOf(ran.stdout), /nemia-trust-probe/, 'and the command ran');
      assert.equal(trustFolder('claude', trusted)?.wrote, false, 'the record still reads trusted after the session');
    } finally {
      const taken = [untrusted, trusted].map((dir) => untrustFolder('claude', dir));
      assert.deepEqual(
        taken.map((t) => t?.refused),
        [null, null],
        'every record under both homes is taken back',
      );
    }
    assert.equal(trustedFolder('claude', trusted), false, 'and the record is gone');
  },
);
