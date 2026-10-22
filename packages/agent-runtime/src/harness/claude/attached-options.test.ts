/**
 * A session the SDK runs is fenced as `claude -p` is for the same task — a held session and a job alike, since
 * `bin/ae-claude-job.ts` builds its options with this very function: every fact of `claudePrintFlags`' argv (`claude-detached`'s,
 * the one spec that still spells a command line) is in
 * `attachedOptions`, on the SDK's own option where it has one and on `extraArgs` where it has none, the closing statement's schema is
 * handed on unread, and the session is given Claude Code's own system prompt, which a job has by default, with the agent's appended
 * to it.
 *
 * Which keys are on which is the subject: the servers and their fence, the agent's prompt and the context window are typed options,
 * and `extraArgs` holds exactly the two flags the SDK 0.3.308 has no option for beside whatever `config.claude` gives of its own, with
 * the window beside them for the one task whose settings are a file the runtime will not rewrite. So each typed
 * option is asserted by its own name, and the whole of `extraArgs` is read in one `deepEqual`: a key moved back onto the command line
 * fails by its own name, and a key added to the bag fails as a question — has the SDK an option for it?
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { attachedOptions } from './attached-options.ts';
import { claudePrintFlags } from './code.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import type { SpawnRequest } from '../seam.ts';
import type { ClaudeFlags } from './vocabulary.ts';
import { scratch } from '../../../test/scratch.ts';

const SCHEMA = { type: 'object', properties: { anything: { 'x-no-runtime-reads-this': true } } };

/** The agent's own prompt, and the checkout's servers: a task's cwd, as a session really finds it. */
const CWD = scratch('ae-attached-options-');
const APPEND = path.join(CWD, 'agent.md');
const REPLACE = path.join(CWD, 'whole.md');
fs.writeFileSync(APPEND, 'you are the agent');
fs.writeFileSync(REPLACE, 'you are nobody Claude Code knows');
fs.writeFileSync(path.join(CWD, 'beside.md'), 'you are the agent beside the work');
fs.writeFileSync(
  path.join(CWD, '.mcp.json'),
  JSON.stringify({ mcpServers: { repo: { command: 'repo-server' }, both: { command: 'theirs' } } }),
);

const RICH: SpawnRequest = {
  name: 'ae/t/1',
  brief: 'work',
  cwd: CWD,
  resumeFrom: 'parent-session',
  closeoutSchema: SCHEMA,
  config: {
    tools: ['Read', 'Bash'],
    disallowedTools: ['Bash(git push:*)', 'WebFetch'],
    allowedTools: ['Edit(**)', 'Bash(npm test)'],
    mounts: [
      { path: '/ro', readOnly: true },
      { path: '/rw', readOnly: false },
    ],
    permissionMode: 'dontAsk',
    model: 'opus',
    effort: 'high',
    contextTokens: 200_000,
    worktree: 'tree',
    budgetUsd: 3,
    env: { MINE: '1' },
    mcp: { mine: { command: 'my-server' }, both: { command: 'ours' } },
    claude: { settings: '{"env":{}}', appendSystemPromptFile: APPEND, pluginDir: ['plug'], mcpDebug: true },
  },
};

/** `RICH` with `claude` as given and nothing else of it changed. */
const withClaude = (claude: ClaudeFlags): SpawnRequest => ({ ...RICH, config: { ...RICH.config, claude } });

/** The values `flag` takes in `argv`, each split on its commas where the flag joins a list. */
const valuesOf = (argv: string[], flag: string): string[] => {
  const at = argv.indexOf(flag);
  return at < 0 ? [] : [argv[at + 1]];
};

test('every deny, allow, tool and added folder of the job is in the attached options', () => {
  const argv = claudePrintFlags(RICH, undefined);
  const given = attachedOptions(RICH);
  assert.deepEqual(given.disallowedTools, valuesOf(argv, '--disallowedTools')[0].split(','));
  assert.deepEqual(given.allowedTools, valuesOf(argv, '--allowedTools')[0].split(','));
  assert.deepEqual(given.tools, valuesOf(argv, '--tools')[0].split(','));
  assert.deepEqual(given.additionalDirectories, argv.slice(argv.indexOf('--add-dir') + 1, argv.indexOf('--add-dir') + 3));
});

test('the mode, model, effort, budget, resume, worktree, settings and window of the job are in the attached options', () => {
  const argv = claudePrintFlags(RICH, undefined);
  const given = attachedOptions(RICH);
  assert.equal(given.permissionMode, valuesOf(argv, '--permission-mode')[0]);
  assert.equal(given.model, valuesOf(argv, '--model')[0]);
  assert.equal(given.effort, valuesOf(argv, '--effort')[0]);
  assert.equal(String(given.maxBudgetUsd), valuesOf(argv, '--max-budget-usd')[0]);
  assert.equal(given.resume, valuesOf(argv, '--resume')[0]);
  assert.deepEqual(given.settingSources, valuesOf(argv, '--setting-sources'));
  assert.equal(given.extraArgs?.worktree, valuesOf(argv, '--worktree')[0]);
  assert.deepEqual(
    given.settings,
    { ...(JSON.parse(valuesOf(argv, '--settings')[0]) as object), autoCompactWindow: Number(valuesOf(argv, '--autocompact')[0]) },
    "the job's settings, on the SDK's own option, the window the job spells as a flag in them",
  );
  assert.deepEqual(given.plugins, [{ type: 'local', path: path.resolve(CWD, valuesOf(argv, '--plugin-dir')[0]) }]);
});

test('the closing statement schema is handed on as given, and the environment is a job’s with the task’s under it', () => {
  const given = attachedOptions(RICH);
  assert.equal(given.outputFormat?.type, 'json_schema');
  assert.equal(given.outputFormat?.schema, SCHEMA, 'the same object, unread');
  assert.equal(given.env?.MINE, '1');
  for (const [k, v] of Object.entries(CLAUDE_JOB_ENV)) assert.equal(given.env?.[k], v);
});

test('the session’s servers are the SDK’s own option, the task’s server winning a name the checkout gives too', () => {
  const given = attachedOptions(RICH);
  assert.deepEqual(
    given.mcpServers,
    { repo: { command: 'repo-server' }, both: { command: 'ours' }, mine: { command: 'my-server' } },
    'the checkout’s `.mcp.json` whole, the task’s own laid over it — on `mcpServers`, never a `--mcp-config` file',
  );
});

test('the servers’ fence is the SDK’s own option, strict for every task', () => {
  const argv = claudePrintFlags(RICH, undefined);
  assert.ok(argv.includes('--strict-mcp-config'), 'a job is spawned strict');
  assert.equal(attachedOptions(RICH).strictMcpConfig, true, 'and so is an attached session, on `strictMcpConfig`');
});

test('a task with no server of its own and no .mcp.json is given no servers at all, and no file is written for it', () => {
  const bare = scratch('ae-attached-options-bare-');
  const given = attachedOptions({ name: 'ae/t/1', brief: 'work', cwd: bare });
  assert.equal(given.mcpServers, undefined, 'absent, not an empty map: there is nothing to name');
  assert.equal(given.strictMcpConfig, true, 'still strict: no server is loaded for it either way');
  assert.deepEqual(fs.readdirSync(bare), [], 'and the options write no file: the servers are a value now');
});

test('an attached session is given Claude Code’s own system prompt, the agent’s appended to it', () => {
  const given = attachedOptions(RICH);
  assert.deepEqual(
    given.systemPrompt,
    { type: 'preset', preset: 'claude_code', append: 'you are the agent' },
    'the preset, so Claude Code renders its own prompt, with the agent’s text appended to it — never the file’s path on a flag',
  );
});

test('a task with systemPromptFile is given that file’s text in place of Claude Code’s prompt, and one with neither the bare preset', () => {
  assert.equal(
    attachedOptions(withClaude({ systemPromptFile: REPLACE })).systemPrompt,
    'you are nobody Claude Code knows',
    'the text alone replaces the preset, as `--system-prompt-file` replaced Claude Code’s prompt',
  );
  assert.deepEqual(
    attachedOptions(withClaude({})).systemPrompt,
    { type: 'preset', preset: 'claude_code' },
    'and a task naming no prompt file still asks for the preset: the SDK sends an empty system prompt when it is unasked',
  );
});

test('a prompt file named relatively is read from the session’s own cwd, as Claude Code read the flag’s path and as a plugin folder is', () => {
  assert.deepEqual(
    attachedOptions(withClaude({ appendSystemPromptFile: 'beside.md' })).systemPrompt,
    { type: 'preset', preset: 'claude_code', append: 'you are the agent beside the work' },
    'the file in the task’s cwd, never one beside whatever process the engine runs in',
  );
  assert.equal(
    attachedOptions(withClaude({ systemPromptFile: 'beside.md' })).systemPrompt,
    'you are the agent beside the work',
    'and the same for the prompt that replaces Claude Code’s own',
  );
});

test('a task giving both prompt files is refused, naming both keys and the harness that takes both flags', () => {
  assert.throws(
    () => attachedOptions(withClaude({ appendSystemPromptFile: APPEND, systemPromptFile: REPLACE })),
    (err: Error) =>
      err.message.includes('appendSystemPromptFile') && err.message.includes('systemPromptFile') && err.message.includes('claude-detached'),
  );
});

test('a prompt file that cannot be read is refused, naming the key and the path', () => {
  const absent = path.join(CWD, 'not-there.md');
  assert.throws(
    () => attachedOptions(withClaude({ appendSystemPromptFile: absent })),
    (err: Error) => err.message.includes('appendSystemPromptFile') && err.message.includes(absent),
  );
});

test('the context window is a key of those same settings, and no flag of its own', () => {
  const given = attachedOptions(RICH);
  assert.equal(given.settings && typeof given.settings === 'object' && given.settings.autoCompactWindow, 200_000);
  assert.equal(given.extraArgs?.autocompact, undefined, 'the window is no longer spelled onto the command line');
});

test('a task whose settings are a file’s path keeps the window as a flag: the runtime rewrites no settings file', () => {
  const given = attachedOptions(withClaude({ settings: '/a/settings.json', appendSystemPromptFile: APPEND }));
  assert.equal(given.settings, '/a/settings.json', 'the path as given, as `auto-memory.test.ts` holds for the settings themselves');
  assert.equal(given.extraArgs?.autocompact, '200000', 'and the window on the one flag left that reaches it');
});

test('extraArgs holds the flags the SDK has no option for, and nothing else', () => {
  assert.deepEqual(
    attachedOptions(RICH).extraArgs,
    { 'mcp-debug': null, 'no-chrome': null, worktree: 'tree' },
    'the task’s own unmapped flag, and the two of 0.3.308: no Chrome and the worktree',
  );
});

test('a flag of config.claude given twice is refused, naming the detached job', () => {
  assert.throws(
    () => attachedOptions({ ...RICH, config: { claude: { mcpDebug: ['a', 'b'] } } }),
    (err: Error) => err.message.includes('claude-detached'),
  );
});
