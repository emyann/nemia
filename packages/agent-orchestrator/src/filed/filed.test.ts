/**
 * What a step's session is filed (`filedConfig`), and the runtime's refusal of it said as the step's (`filedRefusal`). Two tables.
 *
 * The first: every local step is filed `STEP_FILES` naming the run's artifacts folder of that step, and the MCP servers it is filed: a
 * name the factory records rides the task's own `mcp`, as the servers themselves, and is left out of `projectMcp`, which is what keeps
 * the runtime's "one would hide the other" refusal untripped.
 *
 * The second: a refusal after the line a person wrote, the flag a retry typed, or none, where two fields refuse together or the field
 * came from no line of the step's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkflow, type Workflow } from '../workflow.ts';
import { filedConfig, STEP_FILES } from './filed.ts';
import type { FactoryServers } from '../servers/servers.ts';
import { configRefusal } from '../runtime-client.ts';
import { filedRefusal, lineOf, type FiledFlags, type FiledStep } from '../keys/index.ts';
import { names } from '../../test/assessed.ts';

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

test('filedConfig: what a local step is filed beside its fence, its files directory and its servers', async (t) => {
  await t.test("a step's session is filed its files directory, the run's artifacts folder of that step, as WF_STEP_FILES", () => {
    assert.equal(STEP_FILES, 'WF_STEP_FILES');
    assert.deepEqual(filed(stepOf()).env, { WF_STEP_FILES: '/runs/r/artifacts/look' });
  });

  await t.test("a name the factory records is filed as the server, and left off projectMcp; the rest stay the checkout's", () => {
    const config = filed(withAgent('github, repo'), { github: GITHUB });
    assert.deepEqual(config.mcp, { github: GITHUB }, "the factory's server rides the task's own mcp, spelled by the one producer");
    assert.deepEqual(config.projectMcp, ['repo'], 'and `github` is off projectMcp: on both lists the runtime refuses the step');
  });

  await t.test('a name the factory does not record resolves against the checkout exactly as it did', () => {
    const config = filed(withAgent('repo, docs'), { github: GITHUB });
    assert.equal(Object.hasOwn(config, 'mcp'), false, 'no server of its own');
    assert.deepEqual(config.projectMcp, ['repo', 'docs']);
    assert.deepEqual(filed(withAgent('repo'), {}).projectMcp, ['repo'], 'a factory that records none changes nothing');
    assert.deepEqual(filed(withAgent('repo')).projectMcp, ['repo'], 'nor does a caller handed no record at all');
  });

  await t.test(
    "a step with no agent loads no server, and an agent frozen before it named any still loads the checkout's file whole",
    () => {
      assert.deepEqual(filed(stepOf(), { github: GITHUB }).projectMcp, [], 'no agent, no server');
      const older = filed(withAgent(undefined), { github: GITHUB });
      assert.equal(Object.hasOwn(older, 'projectMcp'), false, 'no key at all: its sessions load the whole file as they did');
      assert.equal(Object.hasOwn(older, 'mcp'), false);
    },
  );
});

/** The refusal of `config` on `harness`, said as the step `implement`'s, its lines read off `step` and `flags`. */
const said = (harness: string, step: FiledStep, config: Parameters<typeof configRefusal>[1], flags?: FiledFlags): string | undefined =>
  filedRefusal((c) => configRefusal(harness, c), 'implement', config, lineOf(step, flags));

test("filedRefusal: the runtime's refusal of a filed config, after the step's line it comes from, the flag a retry typed, or none", async (t) => {
  await t.test("a field the runtime refuses alone is named by the step's line it comes from, and the field it is filed as", () => {
    const ultra = said('claude', { model: 'opus', effort: 'ultra' }, { model: 'opus', effort: 'ultra' })!;
    assert.ok(ultra.startsWith('implement: `effort: ultra` (filed as `effort`): '), ultra);
    names(ultra, configRefusal('claude', { effort: 'ultra' })!);
    assert.match(
      said('codex', { sandbox: 'nope' }, { permissionMode: 'nope' })!,
      /^implement: `sandbox: nope` \(filed as `permissionMode`\): /,
    );
    assert.match(
      said('codex', { context: 200_000 }, { contextTokens: 200_000 })!,
      /^implement: `context: 200k` \(filed as `contextTokens`\): /,
    );
  });

  await t.test(
    'REFUSED: a mount refused of a step with both `writable:` and `reads: inbox` quotes both lines, as `mounts` is filed from both',
    () => {
      const mounts = [
        { path: '/srv/web(1)', readOnly: false },
        { path: '/srv/wf/inbox', readOnly: true },
      ];
      assert.match(
        said('claude', { writable: ['web(1)'], reads: ['inbox'] }, { mounts })!,
        /^implement: `writable: web\(1\)` and `reads: inbox` \(filed as `mounts`\): `mounts` gives the session /,
      );
    },
  );

  await t.test('a field a retry chose is named by the flag as typed, before the line of the step it replaces', () => {
    assert.match(said('codex', { budget: 3 }, { budgetUsd: 5 }, { budget: 5 })!, /^implement: `--budget 5` \(filed as `budgetUsd`\): /);
    assert.match(
      said('claude', { model: 'opus' }, { model: '' }, { model: '' })!,
      /^implement: `--model ''` \(filed as `model`\): `model` is empty/,
    );
  });

  await t.test('REFUSED with no line: two fields that refuse only together, and a field no line of the step gave', () => {
    const together = (c: { model?: string; budgetUsd?: number }) =>
      c.model !== undefined && c.budgetUsd !== undefined ? 'a cap and a model together' : undefined;
    const both = filedRefusal(together, 'implement', { model: 'opus', budgetUsd: 5 }, lineOf({ model: 'opus', budget: 5 }));
    assert.equal(both, 'implement: a cap and a model together', 'the step, then the refusal, with no line between');
    const denied = { disallowedTools: ['Bash(git commit:*)'] };
    assert.equal(said('codex', {}, denied), `implement: ${configRefusal('codex', denied)}`);
  });

  await t.test('a config the runtime takes is no refusal', () => {
    assert.equal(said('claude', { model: 'opus', effort: 'high' }, { model: 'opus', effort: 'high', budgetUsd: undefined }), undefined);
  });
});
