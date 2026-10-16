import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine } from '../index.ts';
import { codex } from './codex/codex.ts';
import { commandHarness } from './command/command.ts';
import { claudeDetached, claudeJob } from './claude/code.ts';
import { claudeArgv } from './claude/bg.ts';
import { claudeRefuses } from './claude/vocabulary.ts';
import { admitCall, type AdmissionRun } from './claude/admission.ts';
import type { SpawnRequest } from './seam.ts';
import { scratch } from '../../test/scratch.ts';
import { builtEngine } from '../../test/engine.ts';

/** What `file` says of a task with `config` on `harness`: `filed`, or its refusal; and how many tasks the store then holds. */
const filed = async (config: unknown, harness = 'claude') => {
  const root = scratch('ae-admission-');
  const harnesses = { claude: 'claude', codex, command: commandHarness, remote: { url: 'https://agent.example' } } as const;
  const engine = builtEngine(Engine.layer({ root, harnesses }));
  const said = await Effect.runPromise(
    engine.file({ brief: 'b', cwd: root, harness, config } as never).pipe(
      Effect.map(() => 'filed'),
      Effect.catchTag('FileRefused', (err) => Effect.succeed(err.message)),
    ),
  );
  return { said, journalled: (await Effect.runPromise(engine.list())).views.length };
};

const ADMISSION = { command: ['my-admit', "it's"], tools: ['Bash'] };

test('REFUSED at shipped defaults: admission that is not one — no object, a key it has not, an empty command, a NUL, no tools, a tool that is no name — and nothing is journalled', async () => {
  const nul = `x${String.fromCharCode(0)}`;
  const cases: [unknown, string][] = [
    [
      'my-admit',
      '`callAdmission: "my-admit"` is not admission. Give an object, like { "command": ["my-admit"], "tools": ["Bash"] }, or leave it out.',
    ],
    [{ ...ADMISSION, matcher: 'Bash' }, "`callAdmission.matcher` is not one of admission's keys. It has `command` and `tools` alone."],
    [
      { command: [], tools: ['Bash'] },
      '`callAdmission.command: []` is not a command. Give the program and its arguments as a list of strings with no NUL, the program first, like ["my-admit", "--strict"].',
    ],
    [
      { command: [nul], tools: ['Bash'] },
      `\`callAdmission.command: ${JSON.stringify([nul])}\` is not a command. Give the program and its arguments as a list of strings with no NUL, the program first, like ["my-admit", "--strict"].`,
    ],
    [
      { command: ['a'], tools: [] },
      '`callAdmission.tools: []` names no tool admission sees. Give the tools whose calls it decides, by name, like ["Bash"].',
    ],
    [
      { command: ['a'], tools: ['Bash|Edit'] },
      '`callAdmission.tools: ["Bash|Edit"]` names no tool admission sees. Give the tools whose calls it decides, by name, like ["Bash"].',
    ],
  ];
  for (const [admission, words] of cases) {
    const { said, journalled } = await filed({ callAdmission: admission });
    assert.equal(said, words, JSON.stringify(admission));
    assert.equal(journalled, 0, 'nothing journalled');
  }
  assert.equal((await filed({ callAdmission: ADMISSION })).said, 'filed', 'a command and the tools it sees are filed on Claude Code');
});

test('REFUSED at shipped defaults: admission on a harness that runs no command before a call — Codex, a command, a remote agent — naming the harnesses that do', async () => {
  for (const harness of ['codex', 'command', 'remote']) {
    assert.equal(
      (await filed({ callAdmission: ADMISSION }, harness)).said,
      `\`callAdmission\` asks a command before each of the session's calls, and the \`${harness}\` harness runs none before a call: its session would make every call unadmitted. File the task on \`claude\`, or leave \`callAdmission\` off.`,
      harness,
    );
  }
});

/** The `--settings` each Claude Code spawn gives `config`, read back: a job, `claude-detached` and a background session. */
const settingsGiven = (config: SpawnRequest['config']): [string, Record<string, unknown>][] =>
  (
    [
      ['a job', claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config }).args],
      ['claude-detached', claudeDetached.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config }).args],
      ['a background session', claudeArgv({ name: 'ae/t/1', brief: 'b', cwd: '/r', config }, [])],
    ] as const
  ).map(([what, args]) => {
    assert.equal(args.filter((a) => a === '--settings').length, 1, `${what}: one --settings`);
    return [what, JSON.parse(args[args.indexOf('--settings') + 1]) as Record<string, unknown>];
  });

test("admission is a PreToolUse hook merged into the caller's --settings, matched to its tools alone, running `ae admission -- <command>` — on a job, on claude-detached and on a background session", () => {
  const ae = path.join(import.meta.dirname, '..', '..', 'bin', 'ae.ts');
  const before = { matcher: 'Edit', hooks: [{ type: 'command', command: 'mine' }] };
  const claude = { settings: JSON.stringify({ env: { CI: '1' }, hooks: { PreToolUse: [before] } }) };
  for (const [what, settings] of settingsGiven({ callAdmission: { ...ADMISSION, tools: ['Bash', 'mcp__x__y'] }, claude })) {
    assert.deepEqual(settings.env, { CI: '1' }, `${what}: the caller's settings are kept`);
    assert.deepEqual(
      (settings.hooks as { PreToolUse: unknown[] }).PreToolUse,
      [
        before,
        {
          matcher: 'Bash|mcp__x__y',
          hooks: [{ type: 'command', command: `'${process.execPath}' '${ae}' 'admission' '--' 'my-admit' 'it'\\''s'`, timeout: 30 }],
        },
      ],
      `${what}: after the caller's own hooks, quoted for the shell`,
    );
  }
  for (const [what, settings] of settingsGiven({ callAdmission: ADMISSION })) {
    assert.deepEqual(
      Object.keys(settings),
      ['hooks', 'autoMemoryEnabled'],
      `${what}: no settings of the caller's, the hook and the session's auto-memory off`,
    );
  }
  assert.deepEqual(
    claudeJob.command({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude } }).args.filter((a) => a.includes('PreToolUse')),
    [JSON.stringify({ ...(JSON.parse(claude.settings) as object), autoMemoryEnabled: false })],
    "no admission: the settings as given, the session's auto-memory off beside them",
  );
});

test('REFUSED: admission beside Claude Code settings given as a file, which the runtime does not rewrite; taken beside settings given as JSON', () => {
  assert.equal(
    claudeRefuses({ brief: 'b', cwd: '/r', config: { callAdmission: ADMISSION, claude: { settings: '/a/settings.json' } } }),
    '`claude.settings` is given as "/a/settings.json", and admission is merged into the session\'s settings as a hook: the runtime rewrites no file. Give the settings as a JSON object, like {"env":{"CI":"1"}}, or leave admission off.',
  );
  assert.equal(
    claudeRefuses({ brief: 'b', cwd: '/r', config: { callAdmission: ADMISSION, claude: { settings: '{"env":{}}' } } }),
    undefined,
  );
  assert.equal(
    claudeRefuses({ brief: 'b', cwd: '/r', config: { claude: { settings: '/a/settings.json' } } }),
    undefined,
    'no admission, a file',
  );
});

/** Claude Code's hook input for a `Bash` call. */
const HOOK_INPUT = JSON.stringify({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'ls' },
  cwd: '/w',
  session_id: 's',
});

/** A run of admission that printed `stdout` and exited `status`. */
const ran =
  (stdout: string, status: number | null = 0, failed = false) =>
  (): AdmissionRun => ({ status, stdout, failed });

/** The decision a hook output says, or undefined for none. */
const decisionOf = (out: string): string | undefined =>
  out === ''
    ? undefined
    : (JSON.parse(out) as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision;

test("the adapter hands admission the neutral call and maps its answer to the hook's decision; nothing printed is no opinion", () => {
  let seen = '';
  const out = admitCall(HOOK_INPUT, ['my-admit'], (_command, call) => {
    seen = call;
    return { status: 0, stdout: '{"decision":"deny","reason":"not hers"}\n', failed: false };
  });
  assert.deepEqual(JSON.parse(seen), { tool: 'Bash', input: { command: 'ls' }, cwd: '/w' });
  assert.deepEqual(JSON.parse(out), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'not hers' },
  });
  for (const decision of ['allow', 'ask'])
    assert.equal(decisionOf(admitCall(HOOK_INPUT, ['a'], ran(JSON.stringify({ decision, reason: 'r' })))), decision);
  assert.equal(admitCall(HOOK_INPUT, ['a'], ran('')), '', 'no opinion: the call meets the session’s own rules');
});

test('REFUSED to allow on a fault: admission that fails, hangs, prints garbage or an unknown decision, or a call that is no call, asks the person', () => {
  const faults: [string, () => AdmissionRun][] = [
    ['exit 1', ran('{"decision":"allow","reason":"r"}', 1)],
    ['a signal', ran('', null)],
    ['did not start or ran past its bound', ran('', null, true)],
    ['garbage', ran('allow')],
    ['an unknown decision', ran('{"decision":"yes","reason":"r"}')],
    ['no reason', ran('{"decision":"allow"}')],
  ];
  for (const [what, run] of faults) assert.equal(decisionOf(admitCall(HOOK_INPUT, ['a'], run)), 'ask', what);
  assert.equal(decisionOf(admitCall('not json', ['a'], ran('{"decision":"allow","reason":"r"}'))), 'ask', 'a call that is not JSON');
  assert.equal(decisionOf(admitCall('{}', ['a'], ran('{"decision":"allow","reason":"r"}'))), 'ask', 'a call that names no tool');
});

test('`ae admission -- <command>` runs the command on the call and prints the hook output; a command that does not start asks', () => {
  const ae = path.join(import.meta.dirname, '..', '..', 'bin', 'ae.ts');
  const answer = `process.stdin.on('data', (d) => process.stdout.write(JSON.stringify({ decision: 'ask', reason: JSON.parse(d).tool })))`;
  const out = execFileSync(process.execPath, [ae, 'admission', '--', process.execPath, '-e', answer], {
    input: HOOK_INPUT,
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(out).hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: 'Bash',
  });
  const none = execFileSync(process.execPath, [ae, 'admission', '--', path.join(scratch('ae-admission-'), 'none')], {
    input: HOOK_INPUT,
    encoding: 'utf8',
  });
  assert.equal(decisionOf(none.trim()), 'ask');
});

test("REFUSED: `ae admission`'s command inherits none of the telemetry its session was handed; the rest of its environment still reaches it", () => {
  const ae = path.join(import.meta.dirname, '..', '..', 'bin', 'ae.ts');
  const handed = {
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
    OTEL_RESOURCE_ATTRIBUTES: 'run=r,step=s,task=t',
    TRACEPARENT: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
  };
  const seen = `const seen = ${JSON.stringify(['ADMISSION_OWN', ...Object.keys(handed)])}.filter((k) => k in process.env).join(' ');
process.stdin.on('data', () => process.stdout.write(JSON.stringify({ decision: 'ask', reason: seen })))`;
  const out = execFileSync(process.execPath, [ae, 'admission', '--', process.execPath, '-e', seen], {
    input: HOOK_INPUT,
    encoding: 'utf8',
    env: { ...process.env, ...handed, ADMISSION_OWN: 'mine' },
  });
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, 'ADMISSION_OWN');
});
