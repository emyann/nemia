/**
 * A page of agents, skills, factories or MCP servers as a table (kind-table.ts): per kind, its columns by priority, a row's cells for a
 * planted object — a definition that does not read, one shadowed; the default factory, one with an error, one with a place untrusted; a
 * server never read — every cell one line, each row's object the item's metadata alone, and the page's `continue` carried. Cells are
 * asserted as the values an object gives them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Agent, Factory, McpServer, Skill, Table } from 'objects';
import {
  AGENT_COLUMNS,
  FACTORY_COLUMNS,
  MCP_SERVER_COLUMNS,
  SKILL_COLUMNS,
  agentTable,
  factoryTable,
  mcpServerTable,
  skillTable,
} from './kind-table.ts';

const meta = (name: string) => ({ name, namespace: 'default', creationTimestamp: '2026-11-01T00:00:00Z', resourceVersion: '1' });

const page = <K extends string, I>(kind: K, items: readonly I[], cont?: string) => ({
  apiVersion: 'nemia/v1' as const,
  kind,
  metadata: cont === undefined ? {} : { continue: cont },
  items,
});

const agentOf = (name: string, more: { spec?: Partial<Agent['spec']>; status?: Partial<Agent['status']> } = {}): Agent => ({
  apiVersion: 'nemia/v1',
  kind: 'Agent',
  metadata: meta(name),
  spec: { description: `Does ${name}.`, instructions: 'Long instructions\nthat a table leaves out.', ...more.spec },
  status: {
    origin: 'repo',
    dir: '/d',
    file: '/d/a.md',
    source: '---\nname: a\n---\nthe whole file',
    usedBy: [],
    fills: [],
    factories: [],
    given: [],
    copied: null,
    untried: null,
    card: null,
    cardError: null,
    error: null,
    ...more.status,
  },
});

const skillOf = (name: string, more: { spec?: Partial<Skill['spec']>; status?: Partial<Skill['status']> } = {}): Skill => ({
  apiVersion: 'nemia/v1',
  kind: 'Skill',
  metadata: meta(name),
  spec: { body: 'The whole body\nof the skill.', ...more.spec },
  status: {
    origin: 'yours',
    dir: '/s',
    entry: null,
    error: null,
    preload: false,
    cost: null,
    usedBy: [],
    found: null,
    copyHint: null,
    ...more.status,
  },
});

const factoryOf = (name: string, more: { spec?: Partial<Factory['spec']>; status?: Partial<Factory['status']> } = {}): Factory => ({
  apiVersion: 'nemia/v1',
  kind: 'Factory',
  metadata: meta(name),
  spec: { repos: [], hires: {}, volumes: [], ...more.spec },
  status: { conditions: [], untrusted: [], ...more.status },
});

const serverOf = (name: string, spec: Partial<McpServer['spec']> = {}, status?: McpServer['status']): McpServer => ({
  apiVersion: 'nemia/v1',
  kind: 'McpServer',
  metadata: meta(name),
  spec: { type: 'http', url: `https://${name}.example/mcp`, ...spec },
  ...(status === undefined ? {} : { status }),
});

/** The cells of `table`'s row `at`, by column name. */
const cellsOf = (table: Table, at: number): Record<string, unknown> => {
  const row = table.rows[at];
  assert.ok(row, `the table has a row ${at}`);
  return Object.fromEntries(table.columnDefinitions.map((c, i) => [c.name, row.cells[i]]));
};

/** Every cell of `table` is a string of one line. */
const oneLineEach = (table: Table) => {
  for (const row of table.rows) {
    assert.equal(row.cells.length, table.columnDefinitions.length);
    for (const cell of row.cells) {
      assert.equal(typeof cell, 'string');
      assert.ok(!String(cell).includes('\n'), `a cell is one line: ${JSON.stringify(cell)}`);
    }
  }
};

const shown = (columns: Table['columnDefinitions']) => columns.filter((c) => c.priority === 0).map((c) => c.name);

test('each kind shows by default the columns a person scans, the rest wide', () => {
  assert.deepEqual(shown(AGENT_COLUMNS), ['Name', 'Origin', 'Description', 'Note']);
  assert.deepEqual(shown(SKILL_COLUMNS), ['Name', 'Origin', 'Description', 'Note']);
  assert.deepEqual(shown(FACTORY_COLUMNS), ['Name', 'Repositories', 'Note']);
  assert.deepEqual(shown(MCP_SERVER_COLUMNS), ['Name', 'Type', 'URL', 'State', 'Tools', 'Error']);
  for (const columns of [AGENT_COLUMNS, SKILL_COLUMNS, FACTORY_COLUMNS, MCP_SERVER_COLUMNS])
    assert.ok(columns.every((c) => c.priority === 0 || c.priority === 1));
});

test("an agent's row: its words, why it does not read, what shadows it, its card, its users and its copy", () => {
  const table = agentTable(
    page('AgentList', [
      agentOf('reviewer', {
        spec: { description: 'Reviews a change.\nAt length.', skills: 'git, look', mcp: 'github', harnessPrompt: 'keep' },
        status: {
          card: [{ id: 'review', name: 'Review', description: 'Reviews.', tags: [] }],
          usedBy: [{ from: 'repo', workflow: 'build', step: 'review' }],
          copied: { source: '/t/reviewer.md', version: 'abc', now: 'changed' },
        },
      }),
      agentOf('broken', { status: { error: 'its frontmatter is not YAML\nline 2', shadowedBy: 'yours', cardError: 'no output' } }),
    ]),
  );
  oneLineEach(table);
  assert.deepEqual(cellsOf(table, 0), {
    Name: 'reviewer',
    Origin: 'repo',
    Description: 'Reviews a change.',
    Note: '',
    Skills: 'git, look',
    'Can do': 'review',
    MCP: 'github',
    'Harness prompt': '',
    'Used by': 'build/review',
    Copied: 'from /t/reviewer.md at abc; the source has changed since',
  });
  const broken = cellsOf(table, 1);
  assert.match(String(broken.Note), /^does not read: its frontmatter is not YAML; shadowed by yours$/);
  assert.match(String(broken['Can do']), /no output/);
});

test("a skill's row: its description from its entry where its spec has none, its preload, cost, users and tags", () => {
  const table = skillTable(
    page('SkillList', [
      skillOf('git', {
        spec: { tags: ['vcs', 'git'] },
        status: {
          entry: { id: 'git', name: 'git', description: 'Keep work in git.', tags: [] },
          preload: true,
          cost: { preload: true, listed: 10, body: 900, perTurn: 910 },
          usedBy: [{ from: 'repo', name: 'grace' }],
          shadowedBy: 'factory',
        },
      }),
    ]),
  );
  oneLineEach(table);
  assert.deepEqual(cellsOf(table, 0), {
    Name: 'git',
    Origin: 'yours',
    Description: 'Keep work in git.',
    Note: 'shadowed by factory',
    Preload: 'preload',
    Cost: '910 tokens a turn',
    'Used by': 'repo/grace',
    Tags: 'vcs, git',
  });
});

test("a factory's row: the default's sentence, one that does not read, one with a place untrusted and a condition amiss", () => {
  const table = factoryTable(
    page('FactoryList', [
      factoryOf('default'),
      factoryOf('broken', { status: { error: 'factory.yaml does not parse\nat line 3' } }),
      factoryOf('nemia', {
        spec: {
          repos: ['/r/one', '/r/two'],
          workflows: ['quick', 'build'],
          hires: { review: 'agora', implement: 'grace' },
          template: { source: 'sdlc', version: '1.2.0', params: {} },
          revisions: 'follow',
          costLines: { build: 80 },
          volumes: [{ name: 'cache', path: '/v', readOnly: true }],
        },
        status: {
          applied: '1.2.0',
          untrusted: [{ place: '/r/one', harness: 'Claude Code', withheld: 'its settings' }],
          conditions: [
            { type: 'Applied', status: 'True', reason: 'Rendered', message: 'fine' },
            { type: 'ConflictsPending', status: 'True', reason: 'Conflicts', message: 'two files conflict' },
          ],
        },
      }),
    ]),
  );
  oneLineEach(table);
  assert.match(String(cellsOf(table, 0).Note), /names no factory/);
  assert.equal(cellsOf(table, 0).Workflows, 'all');
  assert.equal(cellsOf(table, 1).Note, 'factory.yaml does not parse');
  const nemia = cellsOf(table, 2);
  assert.equal(nemia.Repositories, '/r/one, /r/two');
  assert.match(String(nemia.Note), /Claude Code: \/r\/one/);
  assert.match(String(nemia.Note), /ConflictsPending True/);
  assert.doesNotMatch(String(nemia.Note), /Applied True/);
  assert.equal(nemia.Workflows, 'build, quick');
  assert.equal(nemia.Hires, 'implement ← grace, review ← agora');
  assert.match(String(nemia.Template), /^sdlc 1\.2\.0, applied at 1\.2\.0$/);
  assert.equal(nemia['Cost lines'], 'build $80.00');
  assert.match(String(nemia.Volumes), /\/v/);
});

test("an MCP server's row: unread where never read, its tools counted, its headers named and never their values", () => {
  const table = mcpServerTable(
    page('McpServerList', [
      serverOf('docs', { headers: { 'X-Key': 'secret-value', Authorization: 'Bearer t' } }),
      serverOf('tracker', {}, { state: 'connected', tools: 4 }),
    ]),
  );
  oneLineEach(table);
  assert.deepEqual(cellsOf(table, 0), {
    Name: 'docs',
    Type: 'http',
    URL: 'https://docs.example/mcp',
    State: 'unread',
    Tools: '',
    Error: '',
    Headers: 'Authorization, X-Key',
  });
  assert.ok(!JSON.stringify(table.rows).includes('secret-value'));
  assert.equal(cellsOf(table, 1).State, 'connected');
  assert.equal(cellsOf(table, 1).Tools, '4');
});

test("each row's object is the item's metadata alone, and the page's continue is carried where it has one", () => {
  const agent = agentOf('a');
  const tables = [
    agentTable(page('AgentList', [agent], 'next')),
    skillTable(page('SkillList', [skillOf('a')], 'next')),
    factoryTable(page('FactoryList', [factoryOf('a')], 'next')),
    mcpServerTable(page('McpServerList', [serverOf('a')], 'next')),
  ];
  for (const table of tables) {
    assert.equal(table.kind, 'Table');
    assert.deepEqual(table.metadata, { continue: 'next' });
    assert.deepEqual(table.rows[0]?.object, { kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata: meta('a') });
  }
  assert.deepEqual(agentTable(page('AgentList', [agent])).metadata, {});
});
