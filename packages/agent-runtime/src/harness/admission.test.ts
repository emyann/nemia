import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine } from '../index.ts';
import { codex } from './codex/codex.ts';
import { commandHarness } from './command/command.ts';
import { attachedOptions } from './claude/attached-options.ts';
import { claudeRefuses } from './claude/vocabulary.ts';
import { admitCall, type AdmissionRun } from './claude/admission.ts';
import type { SpawnRequest } from './seam.ts';
import { scratch } from '../../test/scratch.ts';
import { builtEngine } from '../../test/engine.ts';

/** The tag a refusal is failed with, or the class of an error that has none. */
const tagOf = (err: unknown): string => (err as { _tag?: string })._tag ?? (err as Error).constructor.name;

/**
 * What `file` says of a task with `config` on `harness`: `filed`, or its refusal's tag and words; and how many tasks the store then
 * holds.
 */
const filed = async (config: unknown, harness = 'claude') => {
  const root = scratch('ae-admission-');
  const harnesses = { claude: 'claude', codex, command: commandHarness, remote: { url: 'https://agent.example' } } as const;
  const engine = builtEngine(Engine.layer({ root, harnesses }));
  const said = await Effect.runPromise(engine.file({ brief: 'b', cwd: root, harness, config } as never)).then(
    () => ({ tag: 'filed', message: '' }),
    (err: Error) => ({ tag: tagOf(err), message: err.message }),
  );
  return { ...said, journalled: (await Effect.runPromise(engine.list())).views.length };
};

const ADMISSION = { command: ['my-admit', "it's"], tools: ['Bash'] };

const NUL = `x${String.fromCharCode(0)}`;

/** A task's admission `file` refuses at shipped defaults, and the names its refusal gives the fix. */
const FILE_REFUSALS: readonly { name: string; config: unknown; harness?: string; names: readonly string[] }[] = [
  {
    name: 'no object',
    config: { callAdmission: 'my-admit' },
    names: ['`callAdmission: "my-admit"` is not admission', 'Give an object', 'leave it out'],
  },
  { name: 'a list', config: { callAdmission: ['my-admit'] }, names: ['`callAdmission: ["my-admit"]` is not admission', 'Give an object'] },
  {
    name: 'a key it has not',
    config: { callAdmission: { ...ADMISSION, matcher: 'Bash' } },
    names: ['`callAdmission.matcher`', '`command` and `tools` alone'],
  },
  {
    name: 'an empty command',
    config: { callAdmission: { command: [], tools: ['Bash'] } },
    names: ['`callAdmission.command: []` is not a command', 'a list of strings with no NUL, the program first'],
  },
  {
    name: 'a NUL in the command',
    config: { callAdmission: { command: [NUL], tools: ['Bash'] } },
    names: [`\`callAdmission.command: ${JSON.stringify([NUL])}\` is not a command`, 'with no NUL'],
  },
  {
    name: 'no tools',
    config: { callAdmission: { command: ['a'], tools: [] } },
    names: ['`callAdmission.tools: []` names no tool', 'by name, like ["Bash"]'],
  },
  {
    name: 'a tool that is no name',
    config: { callAdmission: { command: ['a'], tools: ['Bash|Edit'] } },
    names: ['`callAdmission.tools: ["Bash|Edit"]` names no tool', 'by name, like ["Bash"]'],
  },
  ...['codex', 'command', 'remote'].map((harness) => ({
    name: `on the \`${harness}\` harness, which runs no command before a call, naming the harness that does`,
    config: { callAdmission: ADMISSION },
    harness,
    names: [`the \`${harness}\` harness runs none before a call`, 'File the task on `claude`', 'leave `callAdmission` off'],
  })),
];

/**
 * The settings a Claude Code session is given for `config`, read back as the SDK's own `Options.settings` carries them
 * (`attachedOptions`): a job's and a held session's alike.
 */
const settingsGiven = (config: SpawnRequest['config']): [string, Record<string, unknown>][] => [
  ['a session', attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config }).settings as Record<string, unknown>],
];

test("admission is a PreToolUse hook merged into the caller's settings, matched to its tools alone, running `ae admission -- <command>`", () => {
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
    attachedOptions({ name: 'ae/t/1', brief: 'b', cwd: '/r', config: { claude } }).settings,
    { ...(JSON.parse(claude.settings) as object), autoMemoryEnabled: false },
    "no admission: the settings as given, the session's auto-memory off beside them",
  );
});

test('REFUSED: admission that is not one, or on a harness or beside settings that cannot carry it, each naming the fix, and nothing journalled', async (t) => {
  for (const row of FILE_REFUSALS)
    await t.test(row.name, async () => {
      const { tag, message, journalled } = await filed(row.config, row.harness);
      assert.equal(tag, 'FileRefused', message);
      for (const name of row.names) assert.ok(message.includes(name), `${name} in: ${message}`);
      assert.equal(journalled, 0, 'nothing journalled');
    });
  await t.test('a command and the tools it sees are filed on Claude Code', async () => {
    const { tag, message, journalled } = await filed({ callAdmission: ADMISSION });
    assert.equal(tag, 'filed', message);
    assert.equal(journalled, 1);
  });
  await t.test(
    'beside Claude Code settings given as a file, which the runtime does not rewrite, naming the key, the file and the fix',
    () => {
      const said = claudeRefuses({ brief: 'b', cwd: '/r', config: { callAdmission: ADMISSION, claude: { settings: '/a/settings.json' } } });
      for (const name of [
        '`claude.settings`',
        '"/a/settings.json"',
        'the runtime rewrites no file',
        'as a JSON object',
        'leave admission off',
      ])
        assert.ok(said?.includes(name), `${name} in: ${said}`);
    },
  );
  await t.test('taken beside settings given as JSON', () => {
    assert.equal(
      claudeRefuses({ brief: 'b', cwd: '/r', config: { callAdmission: ADMISSION, claude: { settings: '{"env":{}}' } } }),
      undefined,
    );
  });
  await t.test('no admission, a file: nothing to refuse', () => {
    assert.equal(claudeRefuses({ brief: 'b', cwd: '/r', config: { claude: { settings: '/a/settings.json' } } }), undefined);
  });
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
    return { status: 0, stdout: '{"decision":"deny","message":"not hers"}\n', failed: false };
  });
  assert.deepEqual(JSON.parse(seen), { tool: 'Bash', input: { command: 'ls' }, cwd: '/w' });
  assert.deepEqual(JSON.parse(out), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'not hers' },
  });
  for (const decision of ['allow', 'ask'])
    assert.equal(decisionOf(admitCall(HOOK_INPUT, ['a'], ran(JSON.stringify({ decision, message: 'r' })))), decision);
  assert.equal(admitCall(HOOK_INPUT, ['a'], ran('')), '', 'no opinion: the call meets the session’s own rules');
});

test('an answer that says its sentence as `reason`, as a command written before `message` prints it, is read, and the fix is said', () => {
  const warned: string[] = [];
  const out = admitCall(HOOK_INPUT, ['old-admit'], ran('{"decision":"deny","reason":"not hers"}'), (line) => warned.push(line));
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, 'not hers');
  assert.equal(warned.length, 1, 'the retired spelling is warned of once');
  assert.ok(warned[0].includes('old-admit') && warned[0].includes('message'), 'the warning names the command and the field to print');
  const now: string[] = [];
  admitCall(HOOK_INPUT, ['a'], ran('{"decision":"deny","message":"m","reason":"r"}'), (line) => now.push(line));
  assert.deepEqual(now, [], '`message` given: nothing is warned, whatever else the answer carries');
});

test('REFUSED to allow on a fault: admission that fails, hangs, prints garbage or an unknown decision, or a call that is no call, asks the person', () => {
  const faults: [string, () => AdmissionRun][] = [
    ['exit 1', ran('{"decision":"allow","message":"r"}', 1)],
    ['a signal', ran('', null)],
    ['did not start or ran past its bound', ran('', null, true)],
    ['garbage', ran('allow')],
    ['an unknown decision', ran('{"decision":"yes","message":"r"}')],
    ['no message', ran('{"decision":"allow"}')],
  ];
  for (const [what, run] of faults) assert.equal(decisionOf(admitCall(HOOK_INPUT, ['a'], run)), 'ask', what);
  assert.equal(decisionOf(admitCall('not json', ['a'], ran('{"decision":"allow","message":"r"}'))), 'ask', 'a call that is not JSON');
  assert.equal(decisionOf(admitCall('{}', ['a'], ran('{"decision":"allow","message":"r"}'))), 'ask', 'a call that names no tool');
});

test('`ae admission -- <command>` runs the command on the call and prints the hook output; a command that does not start asks', () => {
  const ae = path.join(import.meta.dirname, '..', '..', 'bin', 'ae.ts');
  const answer = `process.stdin.on('data', (d) => process.stdout.write(JSON.stringify({ decision: 'ask', message: JSON.parse(d).tool })))`;
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
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:14999',
    OTEL_RESOURCE_ATTRIBUTES: 'run=r,step=s,task=t',
    TRACEPARENT: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
  };
  const seen = `const seen = ${JSON.stringify(['ADMISSION_OWN', ...Object.keys(handed)])}.filter((k) => k in process.env).join(' ');
process.stdin.on('data', () => process.stdout.write(JSON.stringify({ decision: 'ask', message: seen })))`;
  const out = execFileSync(process.execPath, [ae, 'admission', '--', process.execPath, '-e', seen], {
    input: HOOK_INPUT,
    encoding: 'utf8',
    env: { ...process.env, ...handed, ADMISSION_OWN: 'mine' },
  });
  assert.equal(JSON.parse(out).hookSpecificOutput.permissionDecisionReason, 'ADMISSION_OWN');
});
