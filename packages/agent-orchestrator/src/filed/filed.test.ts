/**
 * The step's files directory in its session's environment: every local step is filed `STEP_FILES` naming the run's artifacts folder
 * of that step, and a background step, whose process ignores its asker's environment, is filed no `env`.
 *
 * And the MCP servers it is filed: a name the factory records rides the task's own `mcp`, as the servers themselves, and is left out of
 * `projectMcp`, which is what keeps the runtime's "one would hide the other" refusal untripped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflow, type Workflow } from '../workflow.ts';
import { filedConfig, STEP_FILES } from './filed.ts';
import type { FactoryServers } from '../servers/servers.ts';

const stepOf = (lines = ''): Workflow => parseWorkflow('look', `---\nplace: git\n${lines}---\nLook.\n`);
const filed = (step: Workflow, servers?: FactoryServers) =>
  filedConfig(
    step,
    [step],
    { gates: [] },
    {
      model: undefined,
      budgetUsd: undefined,
      runArtifacts: '/runs/r/artifacts',
      inbox: '/inbox',
      own: {},
      landingDenied: () => [],
      ...(servers === undefined ? {} : { servers }),
    },
  );

test("a step's session is filed its files directory, the run's artifacts folder of that step, as WF_STEP_FILES", () => {
  assert.equal(STEP_FILES, 'WF_STEP_FILES');
  assert.deepEqual(filed(stepOf()).env, { WF_STEP_FILES: '/runs/r/artifacts/look' });
});

test("a background step is filed no env: its session runs in a process that ignores its asker's environment", () => {
  const step = stepOf('background: true\npermissionMode: auto\n');
  assert.equal(step.background, true);
  assert.equal(Object.hasOwn(filed(step), 'env'), false);
});

/** An agent on the step, with the `mcp:` names it was frozen with. */
const withAgent = (mcp: string | undefined): Workflow =>
  ({
    ...stepOf(),
    agent: { name: 'ada', ...(mcp === undefined ? {} : { mcp: mcp.split(', ') }) },
  }) as Workflow;

/** The hosted GitHub server as a factory records it. */
const GITHUB = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'actions,repos' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
} as const;

test("a name the factory records is filed as the server, and left off projectMcp; the rest stay the checkout's", () => {
  const config = filed(withAgent('github, repo'), { github: GITHUB });
  assert.deepEqual(config.mcp, { github: GITHUB }, "the factory's server rides the task's own mcp, spelled by the one producer");
  assert.deepEqual(
    config.projectMcp,
    ['repo'],
    'and `github` is off projectMcp: on both lists the runtime refuses the step with "one would hide the other" rather than resolving it',
  );
});

test('a name the factory does not record resolves against the checkout exactly as it did', () => {
  const config = filed(withAgent('repo, docs'), { github: GITHUB });
  assert.equal(Object.hasOwn(config, 'mcp'), false, 'no server of its own');
  assert.deepEqual(config.projectMcp, ['repo', 'docs']);
  assert.deepEqual(filed(withAgent('repo'), {}).projectMcp, ['repo'], 'a factory that records none changes nothing');
  assert.deepEqual(filed(withAgent('repo')).projectMcp, ['repo'], 'nor does a caller handed no record at all');
});

test("a step with no agent loads no server, and an agent frozen before it named any still loads the checkout's file whole", () => {
  assert.deepEqual(filed(stepOf(), { github: GITHUB }).projectMcp, [], 'no agent, no server');
  const older = filed(withAgent(undefined), { github: GITHUB });
  assert.equal(Object.hasOwn(older, 'projectMcp'), false, 'no key at all: its sessions load the whole file as they did');
  assert.equal(Object.hasOwn(older, 'mcp'), false);
});
