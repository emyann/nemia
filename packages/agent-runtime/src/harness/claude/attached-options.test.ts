/**
 * An attached session is fenced as a `claude -p` job is for the same task: every fact of `claudePrintFlags`' argv is in
 * `attachedOptions`, on the SDK's own option or on `extraArgs`, and the closing statement's schema is handed on unread.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { attachedOptions } from './attached-options.ts';
import { claudePrintFlags } from './code.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import type { SpawnRequest } from '../seam.ts';

const SCHEMA = { type: 'object', properties: { anything: { 'x-no-runtime-reads-this': true } } };

const RICH: SpawnRequest = {
  name: 'ae/t/1',
  brief: 'work',
  cwd: '/work',
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
    claude: { settings: '{"env":{}}', appendSystemPromptFile: '/p.md', pluginDir: ['plug'] },
  },
};

/** The values `flag` takes in `argv`, each split on its commas where the flag joins a list. */
const valuesOf = (argv: string[], flag: string): string[] => {
  const at = argv.indexOf(flag);
  return at < 0 ? [] : [argv[at + 1]];
};

test('every deny, allow, tool and added folder of the job is in the attached options', () => {
  const argv = claudePrintFlags(RICH, undefined);
  const given = attachedOptions(RICH, '/nowhere/mcp.json');
  assert.deepEqual(given.disallowedTools, valuesOf(argv, '--disallowedTools')[0].split(','));
  assert.deepEqual(given.allowedTools, valuesOf(argv, '--allowedTools')[0].split(','));
  assert.deepEqual(given.tools, valuesOf(argv, '--tools')[0].split(','));
  assert.deepEqual(given.additionalDirectories, argv.slice(argv.indexOf('--add-dir') + 1, argv.indexOf('--add-dir') + 3));
});

test('the mode, model, effort, budget, resume, context window, worktree and flags of the job are in the attached options', () => {
  const argv = claudePrintFlags(RICH, undefined);
  const given = attachedOptions(RICH, '/nowhere/mcp.json');
  assert.equal(given.permissionMode, valuesOf(argv, '--permission-mode')[0]);
  assert.equal(given.model, valuesOf(argv, '--model')[0]);
  assert.equal(given.effort, valuesOf(argv, '--effort')[0]);
  assert.equal(String(given.maxBudgetUsd), valuesOf(argv, '--max-budget-usd')[0]);
  assert.equal(given.resume, valuesOf(argv, '--resume')[0]);
  assert.deepEqual(given.settingSources, valuesOf(argv, '--setting-sources'));
  assert.equal(given.extraArgs?.autocompact, valuesOf(argv, '--autocompact')[0]);
  assert.equal(given.extraArgs?.worktree, valuesOf(argv, '--worktree')[0]);
  assert.equal(given.extraArgs?.settings, valuesOf(argv, '--settings')[0]);
  assert.equal(given.extraArgs?.['append-system-prompt-file'], valuesOf(argv, '--append-system-prompt-file')[0]);
  assert.deepEqual(given.plugins, [{ type: 'local', path: path.resolve('/work', valuesOf(argv, '--plugin-dir')[0]) }]);
  assert.ok(argv.includes('--strict-mcp-config') && 'strict-mcp-config' in (given.extraArgs ?? {}));
});

test('the closing statement schema is handed on as given, and the environment is a job’s with the task’s under it', () => {
  const given = attachedOptions(RICH, '/nowhere/mcp.json');
  assert.equal(given.outputFormat?.type, 'json_schema');
  assert.equal(given.outputFormat?.schema, SCHEMA, 'the same object, unread');
  assert.equal(given.env?.MINE, '1');
  for (const [k, v] of Object.entries(CLAUDE_JOB_ENV)) assert.equal(given.env?.[k], v);
});

test('a flag of config.claude given twice is refused, naming the detached job', () => {
  assert.throws(
    () => attachedOptions({ ...RICH, config: { claude: { mcpDebug: ['a', 'b'] } } }, '/nowhere/mcp.json'),
    (err: Error) => err.message.includes('claude-detached'),
  );
});
