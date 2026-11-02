/**
 * A session the SDK runs is fenced the same for the same task — a held session and a job alike, since `bin/ae-claude-job.ts` builds
 * its options with this very function: every fact of a task is in `attachedOptions`, held here as written (the facts `claude -p`'s
 * argv carried for it, before that road was taken away), on the SDK's own option where it has one and on `extraArgs` where it has
 * none, the closing statement's schema is
 * handed on unread, and the session is given Claude Code's own system prompt, which a job has by default, with the agent's appended
 * to it.
 *
 * Which keys are on which is the subject: the servers and their fence, the agent's prompt and the context window are typed options,
 * and `extraArgs` holds exactly the two flags the SDK 0.3.316 has no option for beside whatever `config.claude` gives of its own, with
 * the window beside them for the one task whose settings are a file the runtime will not rewrite. So each typed
 * option is asserted by its own name, and the whole of `extraArgs` is read in one `deepEqual`: a key moved back onto the command line
 * fails by its own name, and a key added to the bag fails as a question — has the SDK an option for it?
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { attachedOptions } from './attached-options.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import type { SpawnRequest } from '../seam.ts';
import type { ClaudeFlags } from './vocabulary.ts';
import { scratch } from '../../../test/scratch.ts';
import { story } from '../../../test/checkpoints.ts';

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

test('attachedOptions: a rich task is fenced on the SDK’s own options, each fact of it in its place', async (t) => {
  const s = story(t);
  const given = attachedOptions(RICH);

  await s.test(
    'the options carry these keys and no other: a key added is a question — what is it, and has the SDK an option for it?',
    () => {
      assert.deepEqual(Object.keys(given).sort(), [
        'additionalDirectories',
        'allowedTools',
        'cwd',
        'disallowedTools',
        'effort',
        'env',
        'extraArgs',
        'includePartialMessages',
        'maxBudgetUsd',
        'mcpServers',
        'model',
        'outputFormat',
        'permissionMode',
        'plugins',
        'resume',
        'settingSources',
        'settings',
        'strictMcpConfig',
        'systemPrompt',
        'tools',
      ]);
    },
  );

  await s.test('every deny, allow, tool and added folder of the task is in the options, a mount an edit denied or allowed under it', () => {
    assert.deepEqual(given.disallowedTools, ['Bash(git push:*)', 'WebFetch', 'Edit(//ro/**)']);
    assert.deepEqual(given.allowedTools, ['Edit(**)', 'Bash(npm test)', 'Edit(//rw/**)']);
    assert.deepEqual(given.tools, ['Read', 'Bash']);
    assert.deepEqual(given.additionalDirectories, ['/ro', '/rw']);
  });

  await s.test('the mode, model, effort, budget, resume, worktree, settings and window of the task are in the options', () => {
    assert.equal(given.permissionMode, 'dontAsk');
    assert.equal(given.model, 'opus');
    assert.equal(given.effort, 'high');
    assert.equal(given.maxBudgetUsd, 3);
    assert.equal(given.resume, 'parent-session');
    assert.deepEqual(given.settingSources, ['project']);
    assert.equal(given.extraArgs?.worktree, 'tree');
    assert.equal(
      attachedOptions({ name: 'ae/t-abc/2', brief: 'b', cwd: '/r', config: { worktree: true } }).extraArgs?.worktree,
      'ae-t-abc-2',
      'a worktree the task did not name is named after the session',
    );
    assert.deepEqual(
      given.settings,
      { env: {}, autoMemoryEnabled: false, autoCompactWindow: 200_000 },
      "the task's settings, on the SDK's own option, auto-memory off and the window in them",
    );
    assert.deepEqual(given.plugins, [{ type: 'local', path: path.resolve(CWD, 'plug') }]);
  });

  await s.test('the closing statement schema is handed on as given, and the environment is a job’s with the task’s under it', () => {
    assert.equal(given.outputFormat?.type, 'json_schema');
    assert.equal(given.outputFormat?.schema, SCHEMA, 'the same object, unread');
    assert.equal(given.env?.MINE, '1');
    for (const [k, v] of Object.entries(CLAUDE_JOB_ENV)) assert.equal(given.env?.[k], v);
  });

  await s.test('the session’s servers are the SDK’s own option, the task’s server winning a name the checkout gives too', () => {
    assert.deepEqual(
      given.mcpServers,
      { repo: { command: 'repo-server' }, both: { command: 'ours' }, mine: { command: 'my-server' } },
      'the checkout’s `.mcp.json` whole, the task’s own laid over it — on `mcpServers`, never a `--mcp-config` file',
    );
  });

  await s.test('the servers’ fence is the SDK’s own option, strict for every task', () => {
    assert.equal(given.strictMcpConfig, true, 'a job and a held session alike, on `strictMcpConfig`');
  });

  await s.test('an attached session is given Claude Code’s own system prompt, the agent’s appended to it', () => {
    assert.deepEqual(
      given.systemPrompt,
      { type: 'preset', preset: 'claude_code', append: 'you are the agent' },
      'the preset, so Claude Code renders its own prompt, with the agent’s text appended to it — never the file’s path on a flag',
    );
  });

  await s.test('the context window is a key of those same settings, and no flag of its own', () => {
    assert.equal(given.settings && typeof given.settings === 'object' && given.settings.autoCompactWindow, 200_000);
    assert.equal(given.extraArgs?.autocompact, undefined, 'the window is no longer spelled onto the command line');
  });

  await s.test('extraArgs holds the flags the SDK has no option for, and nothing else', () => {
    assert.deepEqual(
      given.extraArgs,
      { 'mcp-debug': null, 'no-chrome': null, worktree: 'tree' },
      'the task’s own unmapped flag, and the two of 0.3.316: no Chrome and the worktree',
    );
  });
});

/** A refusal's words hold every one of `names`. */
const refusedNaming =
  (...names: string[]) =>
  (err: Error) =>
    names.every((name) => err.message.includes(name));

const ROWS: { name: string; check: () => void }[] = [
  {
    name: 'a task that closes its skills is given exactly those on `Options.skills`, and one that does not is left Claude Code’s own set',
    check: () => {
      const closed = attachedOptions({ ...RICH, config: { ...RICH.config, enabledSkills: ['plug:review', 'plug:ship'] } });
      assert.deepEqual(closed.skills, ['plug:review', 'plug:ship']);
      assert.deepEqual(attachedOptions({ ...RICH, config: { ...RICH.config, enabledSkills: [] } }).skills, [], 'none at all');
      for (const open of [RICH, { ...RICH, config: { ...RICH.config, enabledSkills: 'default' as const } }]) {
        assert.equal(Object.hasOwn(attachedOptions(open), 'skills'), false, "left out, which is Claude Code's own set, never 'all'");
      }
    },
  },
  {
    name: 'a task with no server of its own and no .mcp.json is given no servers at all, and no file is written for it',
    check: () => {
      const bare = scratch('ae-attached-options-bare-');
      const given = attachedOptions({ name: 'ae/t/1', brief: 'work', cwd: bare });
      assert.equal(given.mcpServers, undefined, 'absent, not an empty map: there is nothing to name');
      assert.equal(given.strictMcpConfig, true, 'still strict: no server is loaded for it either way');
      assert.deepEqual(fs.readdirSync(bare), [], 'and the options write no file: the servers are a value now');
    },
  },
  {
    name: 'a task with systemPromptFile is given that file’s text in place of Claude Code’s prompt',
    check: () =>
      assert.equal(
        attachedOptions(withClaude({ systemPromptFile: REPLACE })).systemPrompt,
        'you are nobody Claude Code knows',
        'the text alone replaces the preset, as `--system-prompt-file` replaced Claude Code’s prompt',
      ),
  },
  {
    name: 'a task naming no prompt file still asks for the bare preset: the SDK sends an empty system prompt when it is unasked',
    check: () => assert.deepEqual(attachedOptions(withClaude({})).systemPrompt, { type: 'preset', preset: 'claude_code' }),
  },
  {
    name: 'an appended prompt file named relatively is read from the session’s own cwd, as Claude Code read the flag’s path',
    check: () =>
      assert.deepEqual(
        attachedOptions(withClaude({ appendSystemPromptFile: 'beside.md' })).systemPrompt,
        { type: 'preset', preset: 'claude_code', append: 'you are the agent beside the work' },
        'the file in the task’s cwd, never one beside whatever process the engine runs in',
      ),
  },
  {
    name: 'and the same for the prompt that replaces Claude Code’s own',
    check: () =>
      assert.equal(attachedOptions(withClaude({ systemPromptFile: 'beside.md' })).systemPrompt, 'you are the agent beside the work'),
  },
  {
    name: 'REFUSED: a task giving both prompt files, naming both keys',
    check: () =>
      assert.throws(
        () => attachedOptions(withClaude({ appendSystemPromptFile: APPEND, systemPromptFile: REPLACE })),
        refusedNaming('appendSystemPromptFile', 'systemPromptFile'),
      ),
  },
  {
    name: 'REFUSED: a prompt file that cannot be read, naming the key and the path',
    check: () => {
      const absent = path.join(CWD, 'not-there.md');
      assert.throws(() => attachedOptions(withClaude({ appendSystemPromptFile: absent })), refusedNaming('appendSystemPromptFile', absent));
    },
  },
  {
    name: 'a task whose settings are a file’s path keeps the window as a flag: the runtime rewrites no settings file',
    check: () => {
      const given = attachedOptions(withClaude({ settings: '/a/settings.json', appendSystemPromptFile: APPEND }));
      assert.equal(given.settings, '/a/settings.json', 'the path as given, as `auto-memory.test.ts` holds for the settings themselves');
      assert.equal(given.extraArgs?.autocompact, '200000', 'and the window on the one flag left that reaches it');
    },
  },
  {
    name: 'REFUSED: a flag of config.claude given twice, naming the flag',
    check: () =>
      assert.throws(
        () => attachedOptions({ ...RICH, config: { claude: { mcpDebug: ['a', 'b'] } } }),
        refusedNaming('`config.claude.mcpDebug`'),
      ),
  },
];

test('attachedOptions: a bare task, the prompt files and the refusals of what the options cannot carry', async (t) => {
  for (const row of ROWS) await t.test(row.name, row.check);
});
