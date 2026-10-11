/**
 * An agent's `mcp:` line: the MCP servers of the checkout its sessions load, by name. Read and written back as the file's own line, refused
 * where it names no server or reaches no session, frozen on every step with an agent, and filed as the names alone: no step loads a server
 * its agent does not name, and a record frozen before the key loads the whole file as it did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { agentDraftOf, parseAgent, parseWorkflow, renderAgent, WorkflowError, type Workflow } from '../src/workflow.ts';
import { filedConfig } from '../src/filed/filed.ts';
import { FrozenStepSchema } from '../src/folder/folder.store.ts';
import { agentsLines } from '../src/roster/roster.ts';

const refusal = (f: () => unknown): string => {
  try {
    f();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  throw new Error('it did not refuse');
};

const agentOf = (lines: string) => parseAgent('scout', `---\ndescription: Looks.\n${lines}---\nYou look.\n`);
const stepOf = (agent: ReturnType<typeof parseAgent> | undefined, lines = ''): Workflow =>
  parseWorkflow(
    'look',
    `---\nplace: git\n${agent ? `agent: ${agent.name}\n` : ''}${lines}---\nLook.\n`,
    undefined,
    agent && new Map([[agent.name, agent]]),
  );
const filed = (step: Workflow) =>
  filedConfig(
    step,
    [step],
    { gates: [] },
    { model: undefined, budgetUsd: undefined, runArtifacts: '/runs/r/artifacts', inbox: '/inbox', own: {}, landingDenied: () => [] },
  );

test('mcp: is read as the server names it lists, and written back as the line it was', () => {
  const agent = agentOf('mcp: playwright, docs_2\n');
  assert.deepEqual(agent.mcp, ['playwright', 'docs_2']);
  assert.equal(Object.hasOwn(agent.keys, 'mcp'), false, "the agent's own line, and no role key a step takes");
  const draft = agentDraftOf(
    'scout',
    renderAgent(agentDraftOf('scout', '---\ndescription: Looks.\nmcp: playwright, docs_2\n---\nYou look.\n')),
  );
  assert.equal(draft.mcp, 'playwright, docs_2');
  assert.match(renderAgent(draft), /^mcp: playwright, docs_2$/m);
  assert.equal(agentOf('').mcp, undefined, 'no line');
  assert.equal(agentDraftOf('scout', 'You look.\n').mcp, null);
  assert.doesNotMatch(renderAgent({ name: 'scout', mcp: null, keys: {}, body: 'You look.' }), /mcp/);
});

test('an mcp: line that names no server, an empty name, what is no name, or a name twice is refused, saying what one is', () => {
  for (const [line, why] of [
    ['mcp: a,, b', /`mcp: a,, b` has an empty name\. Each is a server's name in the checkout's `\.mcp\.json`/],
    ['mcp: a, b c', /has `b c`, which is not a server's name/],
    ['mcp: a, b, a', /names `a` twice\. Name it once\./],
  ] as const) {
    assert.match(
      refusal(() => agentOf(`${line}\n`)),
      why,
      line,
    );
  }
  assert.match(
    refusal(() => renderAgent({ name: 'scout', keys: { mcp: 'a' } as never, body: 'x' })),
    /`mcp` is the agent's own line, not one of its role keys — give it as the MCP servers, once\./,
  );
});

test("mcpServers, Claude Code's own key, is refused naming the mcp: line that does the work", () => {
  assert.match(
    refusal(() => agentOf('mcpServers: github\n')),
    /`mcpServers` is Claude Code's own subagent key.* name the servers of the repository's `\.mcp\.json` its sessions load on an `mcp:` line, as `mcp: playwright`/,
  );
});

test('a step is no place for mcp:, and an agent that names a server cannot fill a step a remote agent runs', () => {
  assert.match(
    refusal(() => stepOf(agentOf(''), 'mcp: playwright\n')),
    /look: `mcp` is not a key a step has\./,
  );
  assert.match(
    refusal(() => agentOf('harness: a2a:helper\nmcp: playwright\n')),
    /agents\/scout\.md: `mcp: playwright` names servers of the checkout's `\.mcp\.json`.*`harness: a2a:helper` is a remote A2A agent, which loads the servers its operator configured and none of ours\. Delete the line/,
  );
  assert.match(
    refusal(() => stepOf(agentOf('mcp: playwright\n'), 'harness: a2a:helper\n')),
    /look: `agent: scout`: `mcp: playwright` names servers.*`harness: a2a:helper` is a remote A2A agent/,
  );
  assert.equal(stepOf(agentOf(''), 'harness: a2a:helper\n').agent?.name, 'scout', 'an agent that names none fills it');
});

test("the freeze writes the names on every step with an agent, [] for an agent with no line, and the record's schema keeps them", () => {
  assert.deepEqual(stepOf(agentOf('mcp: playwright, docs\n')).agent?.mcp, ['playwright', 'docs']);
  assert.deepEqual(stepOf(agentOf('')).agent?.mcp, []);
  assert.equal(stepOf(undefined).agent, undefined);
  const frozen = stepOf(agentOf('mcp: playwright\n'));
  const read = Schema.decodeUnknownSync(FrozenStepSchema)(JSON.parse(JSON.stringify(frozen))) as Workflow;
  assert.deepEqual(read.agent?.mcp, ['playwright'], 'read back off a run record');
});

test('a step is filed the names its agent gives, none with no agent, and no key on a record frozen before the line', () => {
  assert.deepEqual(filed(stepOf(agentOf('mcp: playwright\n'))).checkoutMcp, ['playwright']);
  assert.deepEqual(filed(stepOf(agentOf(''))).checkoutMcp, [], 'an agent that names none loads none');
  assert.deepEqual(filed(stepOf(undefined)).checkoutMcp, [], 'nor does a step with no agent');
  const { mcp: _, ...before } = stepOf(agentOf('mcp: playwright\n')).agent!;
  const old = filed({ ...stepOf(agentOf('')), agent: before });
  assert.equal(Object.hasOwn(old, 'checkoutMcp'), false, 'the whole file, as the run was started');
});

test('nemia agents says the servers an agent loads, and nothing for one that names none', () => {
  const reading = { name: 'scout', from: 'repo', error: null, description: 'Looks.', cardError: null, card: [], skills: null };
  const lines = (mcp: string | null) =>
    agentsLines({ agents: [{ ...reading, harnessPrompt: null, custom: null, copied: null, mcp }], places: [] } as never);
  assert.ok(lines('playwright, docs').includes('   loads the MCP servers playwright, docs'));
  assert.equal(
    lines(null).some((l) => /MCP/.test(l)),
    false,
  );
});
