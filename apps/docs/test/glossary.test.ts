/**
 * The Glossary page is drawn from the contexts' tables: one section per context in the fence's order, each term with its type and its
 * link. A table the fence omits, an id of the fence no table has, and a type its workspace does not export are each refused, naming
 * the context and the type; the repository's own tables and page hold none of them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Code, Heading, List, Root, RootContent } from 'mdast';
import { fenceFaults, glossarySections, idsOf, remarkGlossary, tablesIn, typeFaults, type Fault } from '../src/glossary.ts';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');
const PAGE = path.join(ROOT, 'apps', 'docs', 'src', 'content', 'docs', 'glossary.mdx');

/** A scratch repository holding `files`, by path from its root. */
const repoWith = (files: Record<string, unknown>): string => {
  const root = scratch('docs-glossary-');
  for (const [file, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return root;
};

/** A table of `context` at the door `door`, its terms `terms`. */
const table = (context: string, door: string, terms: object[]) => ({
  context,
  title: `The ${context}`,
  about: `What the \`${context}\` owns.`,
  paths: [door],
  terms,
});

/** Two contexts: the runtime's table at its package's door, the inbox's below the orchestrator's source, each type exported. */
const FIXTURE = {
  'packages/rt/glossary.json': table('runtime', 'packages/rt', [
    { term: 'Task', meaning: 'the unit of work, read by `decide`.', type: 'Task', see: { label: 'A task', href: '/runtime/#a-task' } },
    { term: 'Attempt', meaning: 'one start of a task.', type: 'Attempt', retired: [{ spelling: 'try', card: 'a card' }] },
  ]),
  'packages/rt/src/task.ts': 'export interface Task { id: string }\nexport type Attempt = { n: number };\n',
  'packages/orch/src/inbox/glossary.json': table('planning', 'packages/orch/src/inbox', [
    { term: 'Card', meaning: 'a brief.', type: 'Card', see: { label: 'Cards', href: '/how-a-run-lives/' } },
    { term: 'Inbox', meaning: 'where cards wait.', type: 'Inbox' },
  ]),
  'packages/orch/src/card.ts': "class Card {}\nexport { Card };\nexport const Inbox = 'inbox';\n",
};

/** The faults' facts, its words left out. */
const facts = (faults: Fault[]) => faults.map(({ kind, context, type }) => ({ kind, context, ...(type ? { type } : {}) }));

/** The text of a node, its children's put together. */
const textOf = (node: RootContent): string =>
  'value' in node ? node.value : 'children' in node ? node.children.map((c) => textOf(c as RootContent)).join('') : '';

test('the page is drawn one section per context, in the fence’s order, each term with its type and its link', () => {
  const root = repoWith(FIXTURE);
  const tables = tablesIn(root);
  assert.deepEqual(
    tables.map((t) => [t.context, t.file]),
    [
      ['planning', 'packages/orch/src/inbox/glossary.json'],
      ['runtime', 'packages/rt/glossary.json'],
    ],
  );
  const sections = glossarySections(tables, ['runtime', 'planning']);
  const headings = sections.filter((n): n is Heading => n.type === 'heading');
  assert.deepEqual(
    headings.map((h) => [h.depth, textOf(h)]),
    [
      [2, 'The runtime'],
      [2, 'The planning'],
    ],
  );
  assert.deepEqual(
    sections.map((n) => n.type),
    ['heading', 'paragraph', 'list', 'heading', 'paragraph', 'list'],
  );
  assert.ok(JSON.stringify(sections[1]).includes('{"type":"inlineCode","value":"runtime"}'), 'the about keeps its backticks as code');
  const runtime = sections[2] as List;
  assert.equal(runtime.children.length, 2);
  const task = JSON.stringify(runtime.children[0]);
  assert.ok(task.includes('{"type":"strong","children":[{"type":"text","value":"Task"}]}'), 'the term is strong');
  assert.ok(task.includes('{"type":"inlineCode","value":"decide"}'), 'the meaning keeps its backticks as code');
  assert.ok(task.includes('{"type":"inlineCode","value":"Task"}'), 'the type is code');
  assert.ok(task.includes('"type":"link","url":"/runtime/#a-task"'), 'the term links to its page');
  assert.ok(!JSON.stringify(runtime.children[1]).includes('"link"'), 'a term with no page has no link');
  assert.ok(JSON.stringify(runtime.children[1]).includes('{"type":"inlineCode","value":"try"}'), 'a retired spelling is said, as code');
  assert.ok(!task.includes('Retired'), 'a term that retired nothing says no retired spelling');
  assert.deepEqual(facts([...fenceFaults(tables, ['runtime', 'planning']), ...typeFaults(root, tables)]), []);
});

test('the plugin replaces the fence by the sections, and refuses a fence that is wrong', () => {
  const root = repoWith(FIXTURE);
  const page = (fence: string): Root => ({
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: 'Intro.' }] },
      { type: 'code', lang: 'glossary', meta: null, value: fence } satisfies Code,
    ],
  });
  const tree = page('runtime\nplanning\n');
  remarkGlossary({ root })(tree, { path: path.join(root, 'apps/docs/src/content/docs/glossary.mdx') });
  assert.deepEqual(
    tree.children.map((n) => n.type),
    ['paragraph', 'heading', 'paragraph', 'list', 'heading', 'paragraph', 'list'],
  );
  assert.throws(() => remarkGlossary({ root })(page('runtime\n'), { path: path.join(root, 'page.mdx') }), /planning/);
});

test('REFUSED: a table the fence omits', () => {
  const root = repoWith(FIXTURE);
  assert.deepEqual(facts(fenceFaults(tablesIn(root), ['runtime'])), [{ kind: 'omitted', context: 'planning' }]);
});

test('REFUSED: an id of the fence that no table has', () => {
  const root = repoWith(FIXTURE);
  assert.deepEqual(facts(fenceFaults(tablesIn(root), ['runtime', 'planning', 'nowhere'])), [{ kind: 'no-table', context: 'nowhere' }]);
});

test('REFUSED: two tables that give one context id, of which the page would draw only the first', () => {
  const root = repoWith({ ...FIXTURE, 'packages/orch/src/plan/glossary.json': table('planning', 'packages/orch/src/plan', []) });
  assert.deepEqual(facts(fenceFaults(tablesIn(root), ['runtime', 'planning'])), [{ kind: 'twice', context: 'planning' }]);
});

test('REFUSED: a type no source of the table’s workspace exports', () => {
  const root = repoWith({
    ...FIXTURE,
    'packages/rt/glossary.json': table('runtime', 'packages/rt', [
      { term: 'Task', meaning: 'the unit of work.', type: 'Task' },
      { term: 'Lease', meaning: 'declared and not exported.', type: 'Lease' },
      { term: 'Probe', meaning: 'exported by a test alone.', type: 'Probe' },
      { term: 'Card', meaning: 'exported by another workspace.', type: 'Card' },
    ]),
    'packages/rt/src/lease.ts': 'type Lease = { until: number };\nexport const lease = (l: Lease) => l;\n',
    'packages/rt/test/probe.ts': 'export const Probe = 1;\n',
    'packages/rt/src/probe.test.ts': 'export const Probe = 1;\n',
  });
  assert.deepEqual(facts(typeFaults(root, tablesIn(root))), [
    { kind: 'no-export', context: 'runtime', type: 'Lease' },
    { kind: 'no-export', context: 'runtime', type: 'Probe' },
    { kind: 'no-export', context: 'runtime', type: 'Card' },
  ]);
});

test('the repository’s page lists every table in the map’s order, and every type of a table is exported by its workspace', () => {
  const fence = /^```glossary\n([\s\S]*?)^```$/m.exec(fs.readFileSync(PAGE, 'utf8'))?.[1];
  assert.ok(fence !== undefined, 'the glossary page holds a ```glossary fence');
  const order = idsOf(fence);
  assert.deepEqual(order, ['runtime', 'run-core', 'api', 'board', 'place', 'planning', 'factory', 'agents', 'nemia', 'feed', 'operations']);
  const tables = tablesIn(ROOT);
  assert.deepEqual(facts(fenceFaults(tables, order)), [], 'add each context to the fence, and take off an id with no table');
  assert.deepEqual(
    typeFaults(ROOT, tables).map((f) => f.says),
    [],
    'name a type the workspace exports, or take the type off',
  );
  const headings = glossarySections(tables, order).filter((n) => n.type === 'heading');
  assert.equal(headings.length, order.length, 'one section per context');
});
