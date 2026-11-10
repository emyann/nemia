/**
 * At every door, a field that names a state or a kind — `phase`, `status`, `state`, `kind`, `type`, `reason` — is a closed union of its
 * words, never `string`: a reader compares it to its words, and a `string` lets any sentence through where a word was meant, which no
 * type then refuses. A sentence a person reads is a `message`.
 *
 * `openStates` (`closed-state.ts`) reads each door's exported types through the TypeScript checker and finds each such field whose type,
 * null and undefined taken off, is `string` or a union with a `string` member, and refuses every one: the rule has no exception.
 *
 * The test reads files outside this package; the api's source is among `guards#test`'s inputs in `turbo.json`, and the packages' reach
 * it through its dependency on `agent-orchestrator`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openStates, repositoryHits } from './closed-state.ts';
import { REPO } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';

const FIX = 'type it as a closed union of its words, named in its context’s glossary.json, and carry a sentence as `message`';

/** Each field of `hits` refused, as a sentence naming the fix. */
export const breaks = (hits: ReadonlyArray<{ key: string }>): string[] =>
  hits.map(({ key }) => `${key} says a state or a kind as a string: ${FIX}`);

/** A scratch root holding `files`, an ES module package; `effect` linked in for a fixture that imports it. */
const fixture = (files: Record<string, string>): string => {
  const root = scratch('closed-state-');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.symlinkSync(path.join(REPO, 'node_modules', 'effect'), path.join(root, 'node_modules', 'effect'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
};

/** The keys of the open fields `door.ts` of a fixture of `files` reaches. */
const openIn = (files: Record<string, string>): string[] =>
  openStates(['door.ts'], fixture(files))
    .hits.map(({ key }) => key)
    .sort();

test('a closed union, a nullable one, a template literal and a branded string are let through', () => {
  const door = [
    "export type Door = { phase: 'a' | 'b'; status?: 'x' | null; kind: `k-${string}`; type: string & { readonly brand: 'Id' } };",
    'export type Said = { message: string; reasons: string[] };',
  ].join('\n');
  assert.deepEqual(openIn({ 'door.ts': door }), []);
});

test('REFUSED: a field named for a state or a kind, typed string', () => {
  const door = 'export type Door = { phase: string; status: string; state: string; kind: string; type: string; reason: string };';
  const hits = openIn({ 'door.ts': door });
  assert.deepEqual(hits, [
    'door.ts#Door.kind',
    'door.ts#Door.phase',
    'door.ts#Door.reason',
    'door.ts#Door.state',
    'door.ts#Door.status',
    'door.ts#Door.type',
  ]);
  assert.equal(breaks(hits.map((key) => ({ key }))).length, hits.length, 'each open field is refused');
});

test('REFUSED: a nullable string, and a union with a string member', () => {
  const door = "export type Door = { reason: string | null; kind?: 'a' | string; status: number | string | undefined };";
  assert.deepEqual(openIn({ 'door.ts': door }), ['door.ts#Door.kind', 'door.ts#Door.reason', 'door.ts#Door.status']);
});

test('REFUSED: a string reached through an alias, an intersection, an array, an Omit and a schema’s Type', () => {
  const door = [
    "import { Schema } from 'effect';",
    'type Word = string;',
    'type Full = { status: Word; drop: number };',
    "export type Picked = Omit<Full, 'drop'>;",
    'export type Door = { a: 1 } & { kind: Word; items: Array<{ type: string }>; pairs: [{ phase: string }] };',
    'const S = Schema.Struct({ type: Schema.String, reason: Schema.NullOr(Schema.String) });',
    'export type FromSchema = typeof S.Type;',
  ].join('\n');
  assert.deepEqual(openIn({ 'door.ts': door }), [
    'door.ts#Door.items[].type',
    'door.ts#Door.kind',
    'door.ts#Door.pairs[].phase',
    'door.ts#FromSchema.reason',
    'door.ts#FromSchema.type',
    'door.ts#Picked.status',
  ]);
});

test('REFUSED: a field on a type the door reaches by a property, an index signature or a type argument, keyed by its own name', () => {
  const door = [
    "import type { Inner } from './inner.ts';",
    'type Page<T> = { items: T[]; status: string };',
    'type Run = { state: string };',
    'export type Door = { inner: Inner; byName: Record<string, { kind: string }>; runs: Page<Run> };',
  ].join('\n');
  const inner = 'export type Inner = { reason: string };';
  assert.deepEqual(openIn({ 'door.ts': door, 'inner.ts': inner }), [
    'door.ts#Door.byName{}.kind',
    'door.ts#Page.status',
    'door.ts#Run.state',
    'inner.ts#Inner.reason',
  ]);
});

test('REFUSED: a field typed by a type parameter, at each instantiation, whichever the walk reaches first', () => {
  const door = ['export type Page<K> = { kind: K };', "export type Door = { closed: Page<'a'>; open: Page<string> };"].join('\n');
  assert.deepEqual(openIn({ 'door.ts': door }), ['door.ts#Page.kind']);
});

test('a type no door reaches, one under node_modules, and a function’s parameters and answer are not read', () => {
  const door = [
    "import type { Foreign } from 'foreign';",
    "export type { Foreign } from 'foreign';",
    "export type { Unread } from './unread.ts';",
    'type Hidden = { status: string };',
    'export type Holds = { foreign: Foreign };',
    'export type Fn = (x: { status: string }) => { kind: string };',
    'export interface Face { go(x: { state: string }): { type: string }; run: (r: { reason: string }) => void }',
    'export class Engine { stop(why: { reason: string }): void {} }',
  ].join('\n');
  const files = {
    'door.ts': door,
    'unread.ts': "import type { Hidden } from './hidden.ts';\nexport type Unread = Hidden;\n",
    'hidden.ts': 'export type Hidden = { kind: number };\nexport type Elsewhere = { status: string };\n',
    'node_modules/foreign/package.json': JSON.stringify({ name: 'foreign', types: 'index.d.ts' }),
    'node_modules/foreign/index.d.ts': 'export type Foreign = { status: string; kind: string };\n',
  };
  assert.deepEqual(openIn(files), []);
});

/** The repository's measure, read once for the tests below: one Program over every door. */
const repository = repositoryHits();

test('the walk reads the doors: the runtime’s, the orchestrator’s and the api’s fields, a TaskView’s phase found closed', () => {
  const phase = 'packages/agent-runtime/src/core/engine/engine.ts#TaskView.phase';
  assert.ok(repository.visited.includes(phase), `the walk read ${phase}`);
  assert.ok(!repository.hits.some(({ key }) => key === phase), `${phase} is closed`);
  for (const dir of ['packages/agent-runtime/', 'packages/agent-orchestrator/', 'apps/api/'])
    assert.ok(
      repository.visited.some((key) => key.startsWith(dir)),
      `the walk read a field of ${dir}`,
    );
});

test('the repository: no door says a state or a kind as a string', () => {
  assert.deepEqual(breaks(repository.hits), []);
});
