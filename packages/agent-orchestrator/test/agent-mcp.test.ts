/**
 * An agent's `mcp:` line and a step's: the MCP servers of the checkout a session loads, by name. Each is read and written back as its
 * file's own line and refused where it names no server or reaches no session; the step's adds to its agent's, frozen as one list on every
 * step with an agent and filed as the names alone. No step loads a server neither names, naming one changes nothing of the fence, and a
 * record frozen before the key loads the whole file as it did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { agentDraftOf, parseAgent, parseWorkflow, renderAgent, renderStep, WorkflowError, type Workflow } from '../src/workflow.ts';
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

/** That the refusal `words` opens with `head` and names each of `facts`: what it refused and the line that fixes it. */
const says = (words: string, head: string, ...facts: string[]) => {
  assert.ok(words.startsWith(head), words);
  for (const fact of facts) assert.ok(words.includes(fact), `${fact} — not in: ${words}`);
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
  says(
    refusal(() => renderAgent({ name: 'scout', keys: { mcp: 'a' } as never, body: 'x' })),
    'agents/scout.md: `mcp` is the agent',
    'not one of its role keys',
    'the MCP servers, once',
  );
});

test("mcpServers, Claude Code's own key, is refused naming the mcp: line that does the work", () => {
  says(
    refusal(() => agentOf('mcpServers: github\n')),
    'agents/scout.md: `mcpServers` is Claude Code',
    '`.mcp.json`',
    'an `mcp:` line',
    'as `mcp: playwright`',
  );
});

test("a step's mcp: adds to its agent's: the session's servers are the agent's, then the step's, each once, and the step keeps its own line", () => {
  const alone = stepOf(agentOf(''), 'mcp: playwright\n');
  assert.deepEqual(alone.agent?.mcp, ['playwright'], 'an agent that names none loads what its step names');
  assert.deepEqual(alone.mcp, ['playwright']);
  const both = stepOf(agentOf('mcp: a, b\n'), 'mcp: c, a\n');
  assert.deepEqual(both.agent?.mcp, ['a', 'b', 'c'], "the agent's first, and one both name once");
  assert.deepEqual(both.mcp, ['c', 'a'], "the step's own line, as written");
  assert.deepEqual(filed(both).projectMcp, ['a', 'b', 'c']);
  const read = Schema.decodeUnknownSync(FrozenStepSchema)(JSON.parse(JSON.stringify(both))) as Workflow;
  assert.deepEqual(
    [read.agent?.mcp, read.mcp],
    [
      ['a', 'b', 'c'],
      ['c', 'a'],
    ],
    'both read back off a run record',
  );
  assert.equal(stepOf(agentOf('mcp: a\n')).mcp, undefined, 'a step with no line has none of its own');
});

test("a step's mcp: line is refused as an agent's is, under the step's name, and on a step with no agent", () => {
  const of = (line: string) => refusal(() => stepOf(agentOf(''), `mcp: ${line}\n`));
  assert.match(of('a,, b'), /^look: `mcp: a,, b` has an empty name\. Each is a server's name in the checkout's `\.mcp\.json`/);
  assert.match(of('a, b c'), /^look: `mcp: a, b c` has `b c`, which is not a server's name\./);
  assert.equal(of('a, a'), 'look: `mcp: a, a` names `a` twice. Name it once.');
  says(
    refusal(() => stepOf(undefined, 'mcp: playwright\n')),
    'look: `mcp: playwright`',
    'this step has none',
    '`agent: <name>`',
    'or delete the line',
  );
});

test("renderStep writes a step's own mcp: line, never its agent's servers, and no line for none", () => {
  const step = stepOf(agentOf('mcp: playwright\n'), 'mcp: docs\n');
  assert.match(renderStep(step), /^mcp: docs$/m);
  assert.doesNotMatch(renderStep(step), /playwright/);
  assert.doesNotMatch(renderStep(stepOf(agentOf('mcp: playwright\n'))), /^mcp:/m);
  assert.doesNotMatch(renderStep({ ...step, mcp: [] }), /^mcp:/m, 'an empty list is no line');
});

test('naming a server allows none of its tools: a dontAsk step that names one is filed as the same step naming none, but for the servers', () => {
  const agent = agentOf('permissionMode: dontAsk\nallowedTools: Read\n');
  const { projectMcp: named, ...withServer } = filed(stepOf(agent, 'mcp: playwright\n'));
  const { projectMcp: none, ...without } = filed(stepOf(agent));
  assert.deepEqual([named, none], [['playwright'], []]);
  assert.deepEqual(withServer, without, 'the mode, the allow rules and the deny rules are those of the step that names none');
  assert.equal(withServer.permissionMode, 'dontAsk');
  assert.doesNotMatch(JSON.stringify(withServer), /mcp__/, 'no rule names a tool of the server');
});

test('an agent that names a server cannot fill a step a remote agent runs, nor may such a step name one itself', () => {
  says(
    refusal(() => stepOf(agentOf(''), 'harness: a2a:helper\nmcp: playwright\n')),
    'look: `mcp: playwright`',
    '`.mcp.json`',
    '`harness: a2a:helper` is a remote A2A agent',
    'Delete the line',
  );
  says(
    refusal(() => agentOf('harness: a2a:helper\nmcp: playwright\n')),
    'agents/scout.md: `mcp: playwright`',
    '`.mcp.json`',
    '`harness: a2a:helper` is a remote A2A agent',
    'Delete the line',
  );
  says(
    refusal(() => stepOf(agentOf('mcp: playwright\n'), 'harness: a2a:helper\n')),
    'look: `agent: scout`: `mcp: playwright`',
    '`harness: a2a:helper` is a remote A2A agent',
    'Delete the line',
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
  assert.deepEqual(filed(stepOf(agentOf('mcp: playwright\n'))).projectMcp, ['playwright']);
  assert.deepEqual(filed(stepOf(agentOf(''))).projectMcp, [], 'an agent that names none loads none');
  assert.deepEqual(filed(stepOf(undefined)).projectMcp, [], 'nor does a step with no agent');
  const { mcp: _, ...before } = stepOf(agentOf('mcp: playwright\n')).agent!;
  const old = filed({ ...stepOf(agentOf('')), agent: before });
  assert.equal(Object.hasOwn(old, 'projectMcp'), false, 'the whole file, as the run was started');
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
