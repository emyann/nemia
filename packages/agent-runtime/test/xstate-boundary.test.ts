/**
 * XState stays inside the lifecycle: `src/core/lifecycle.ts` is the one file that imports it, no other
 * package of the workspace depends on it or imports it, and neither of the runtime's entries hands a consumer an XState name
 * or value, the machine, or the readings `decide` moves by. The machine is the runtime's judgement, as `decide` is, and a
 * consumer that could call it would be deciding beside the pass. One value of the lifecycle's leaves, by name: `lifecycleGraph`,
 * while it is a function whose answer is plain data, which a board draws and nothing can move a task by.
 *
 * Each rule is made to refuse planted source first: a scan that read nothing, or matched nothing, passes too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');
const ROOT = path.join(PKG, '..', '..');
const XSTATE = 'xstate';
const LIFECYCLE = 'src/core/lifecycle.ts';
/** This file reads XState's exports to refuse them, and is the one test let import it. */
const SELF = 'packages/agent-runtime/test/xstate-boundary.test.ts';

/** A line of prose read as nothing, as `contract.test.ts` reads one, the line kept so numbers still count. */
const withoutComments = (text: string): string =>
  text
    .split('\n')
    .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line))
    .join('\n');

/**
 * Every module a piece of source names: imports and re-exports, type-only included, `import()` and `require()` (as `a2a-boundary.test.ts`).
 */
function specifiersIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(m[1]);
  for (const m of text.matchAll(/\b(?:import|require|import\.meta\.resolve|require\.resolve)\s*\(\s*['"`]([^'"`]+)['"`]/g)) found.add(m[1]);
  return [...found].sort();
}

/** Where `file` (a path from the repository's root) reaches XState outside the lifecycle: each breach, worded with what to do instead. */
function xstateBreaches(file: string, text: string): string[] {
  if (file === `packages/agent-runtime/${LIFECYCLE}` || file === SELF) return [];
  return specifiersIn(withoutComments(text))
    .filter((spec) => spec === XSTATE || spec.startsWith(`${XSTATE}/`) || spec.startsWith('@xstate/'))
    .map(
      (spec) =>
        `${file} imports ${spec}: only agent-runtime's src/core/lifecycle.ts knows XState — ask decide, or the lifecycle's transition, and keep the machine there`,
    );
}

/** Every workspace's code, tests included, by its path from the root: a test of another package importing XState is a second user of it. */
const workspaceFiles = (): string[] =>
  ['packages', 'apps'].flatMap((top) =>
    fs.readdirSync(path.join(ROOT, top)).flatMap((ws) =>
      ['src', 'bin', 'test'].flatMap((dir) => {
        const at = path.join(ROOT, top, ws, dir);
        if (!fs.existsSync(at)) return [];
        return (fs.readdirSync(at, { recursive: true }) as string[])
          .filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && !f.includes('node_modules'))
          .map((f) => `${top}/${ws}/${dir}/${f}`);
      }),
    ),
  );

test('the scan reads every workspace, and the lifecycle imports XState — or it would pass by reading nothing', () => {
  const files = workspaceFiles();
  for (const f of [
    'packages/agent-runtime/src/core/engine/engine.ts',
    'packages/agent-orchestrator/src/tick/tick.verb.ts',
    'apps/api/src/app.ts',
    'packages/agent-runtime/bin/ae.ts',
  ])
    assert.ok(files.includes(f), f);
  assert.ok(
    specifiersIn(fs.readFileSync(path.join(PKG, LIFECYCLE), 'utf8')).includes(XSTATE),
    'the pattern matches the one import there is',
  );
});

test('only src/core/lifecycle.ts imports XState, in any workspace', () => {
  assert.deepEqual(
    workspaceFiles().flatMap((f) => xstateBreaches(f, fs.readFileSync(path.join(ROOT, f), 'utf8'))),
    [],
  );
});

test('REFUSED: XState imported outside the lifecycle — the root, a subpath, a type, a re-export, a dynamic import, another package', () => {
  const why =
    "only agent-runtime's src/core/lifecycle.ts knows XState — ask decide, or the lifecycle's transition, and keep the machine there";
  const planted: Array<[string, string, string]> = [
    ['packages/agent-runtime/src/core/engine/engine.ts', "import { transition } from 'xstate';", 'xstate'],
    ['packages/agent-runtime/src/core/domain.ts', "import type { AnyStateMachine } from 'xstate';", 'xstate'],
    ['packages/agent-runtime/src/index.ts', "export { setup } from 'xstate';", 'xstate'],
    ['packages/agent-runtime/bin/ae.ts', "const x = await import('xstate');", 'xstate'],
    ['packages/agent-runtime/test/engine.test.ts', "import { createActor } from 'xstate';", 'xstate'],
    ['packages/agent-orchestrator/src/tick/tick.verb.ts', "import { setup } from 'xstate/guards';", 'xstate/guards'],
    ['apps/web/src/lib/status.ts', "import { useMachine } from '@xstate/react';", '@xstate/react'],
  ];
  for (const [file, line, spec] of planted) {
    assert.deepEqual(xstateBreaches(file, `// the lifecycle\n${line}\n`), [`${file} imports ${spec}: ${why}`], `${file}: ${line}`);
  }
  assert.deepEqual(
    xstateBreaches(`packages/agent-runtime/${LIFECYCLE}`, "import { setup } from 'xstate';"),
    [],
    'not refused: the lifecycle itself',
  );
  assert.deepEqual(
    xstateBreaches('packages/agent-runtime/src/core/engine/engine.ts', "// import { transition } from 'xstate';\n * from 'xstate'"),
    [],
    'not refused: prose that names XState',
  );
});

/** The workspaces whose package.json names XState in any dependency list. */
const dependents = (
  manifests: Record<string, { dependencies?: object; devDependencies?: object; peerDependencies?: object; optionalDependencies?: object }>,
) =>
  Object.entries(manifests)
    .filter(([, m]) =>
      [m.dependencies, m.devDependencies, m.peerDependencies, m.optionalDependencies].some((deps) =>
        Object.keys(deps ?? {}).some((d) => d === XSTATE || d.startsWith('@xstate/')),
      ),
    )
    .map(([name]) => name);

test('XState is a dependency of the runtime alone, pinned', () => {
  const manifests = Object.fromEntries(
    ['packages', 'apps'].flatMap((top) =>
      fs
        .readdirSync(path.join(ROOT, top))
        .filter((ws) => fs.existsSync(path.join(ROOT, top, ws, 'package.json')))
        .map((ws) => [`${top}/${ws}`, JSON.parse(fs.readFileSync(path.join(ROOT, top, ws, 'package.json'), 'utf8'))]),
    ),
  );
  manifests['(root)'] = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(Object.keys(manifests).length >= 5, 'every workspace read');
  assert.deepEqual(dependents(manifests), ['packages/agent-runtime']);
  assert.match(
    manifests['packages/agent-runtime'].dependencies.xstate,
    /^\d+\.\d+\.\d+$/,
    'an exact version: the lifecycle leans on how its `transition` answers a missing edge',
  );
  assert.deepEqual(
    dependents({
      a: { dependencies: { xstate: '5' } },
      b: { devDependencies: { '@xstate/react': '5' } },
      c: { dependencies: { effect: '4' } },
    }),
    ['a', 'b'],
    'REFUSED: a second workspace that depends on it, as a dev dependency or a scoped package',
  );
});

/** The readings and the move a consumer must not be handed: they are `decide`'s, which no entry exports either. */
const JUDGEMENT = ['lifecycleOf', 'observe', 'spawnRefused', 'settledQuiet', 'Lifecycle'];

/** The lifecycle's values an entry may export by name: each a function that takes nothing and answers plain data. */
const AS_DATA = ['lifecycleGraph'];

/** Whether `value` is a function that takes nothing and answers what a JSON round trip gives back unchanged: no machine, no move. */
const answersPlainData = (value: unknown): boolean => {
  if (typeof value !== 'function' || value.length !== 0) return false;
  try {
    const answer: unknown = value();
    return answer !== undefined && isDeepStrictEqual(answer, JSON.parse(JSON.stringify(answer)));
  } catch {
    return false;
  }
};

/**
 * What an entry hands a consumer of the lifecycle's: an XState name or value, a value `src/core/lifecycle.ts` exports, or a
 * reading `decide` moves by. A name of `AS_DATA` is refused unless its value answers plain data.
 */
function exportBreaches(entry: string, exported: Record<string, unknown>, inside: { names: Set<string>; values: Set<unknown> }): string[] {
  const lifecycles = (name: string, value: unknown) =>
    AS_DATA.includes(name) ? !answersPlainData(value) : inside.names.has(name) || inside.values.has(value);
  return Object.entries(exported).flatMap(([name, value]) =>
    JUDGEMENT.includes(name) || lifecycles(name, value)
      ? [
          `${entry} exports ${name}, which is the lifecycle's: a consumer reads what was decided (fold, views, the report), never the machine`,
        ]
      : [],
  );
}

/**
 * Every name and value XState exports, and every value `src/core/lifecycle.ts` does (its names are too common to refuse by: `transition`,
 * `STATES`).
 */
const insides = async () => {
  const names = new Set<string>();
  const values = new Set<unknown>();
  for (const [name, value] of Object.entries(await import(XSTATE))) {
    names.add(name);
    if ((typeof value === 'function' || typeof value === 'object') && value !== null) values.add(value);
  }
  for (const value of Object.values(await import('../src/core/lifecycle.ts'))) values.add(value);
  return { names, values };
};

test("neither of the runtime's entries exports XState, the machine, or what decide reads", async () => {
  const inside = await insides();
  assert.ok(inside.names.has('setup') && inside.names.has('transition') && inside.names.has('createActor'), 'XState was read');
  for (const entry of ['agent-runtime', 'agent-runtime/vocabulary', 'agent-runtime/testing']) {
    assert.deepEqual(exportBreaches(entry, { ...(await import(entry)) }, inside), [], entry);
  }
});

test('REFUSED: an entry that exports an XState name, the machine or its move renamed, or a reading of decide', async () => {
  const inside = await insides();
  const { setup } = await import(XSTATE);
  const lifecycle = await import('../src/core/lifecycle.ts');
  const { lifecycleOf } = await import('../src/core/domain.ts');
  const root = { ...(await import('agent-runtime')) };
  const says = (entry: string, name: string) =>
    `${entry} exports ${name}, which is the lifecycle's: a consumer reads what was decided (fold, views, the report), never the machine`;
  assert.deepEqual(exportBreaches('agent-runtime', { ...root, setup }, inside), [says('agent-runtime', 'setup')]);
  assert.deepEqual(exportBreaches('agent-runtime', { taskMachine: lifecycle.MACHINE, move: lifecycle.transition }, inside), [
    says('agent-runtime', 'taskMachine'),
    says('agent-runtime', 'move'),
  ]);
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleOf }, inside), [says('agent-runtime', 'lifecycleOf')]);
});

test('REFUSED: the machine under the name let through as data, as a value or as what a function answers', async () => {
  const inside = await insides();
  const lifecycle = await import('../src/core/lifecycle.ts');
  const says = (name: string) =>
    `agent-runtime exports ${name}, which is the lifecycle's: a consumer reads what was decided (fold, views, the report), never the machine`;
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleGraph: lifecycle.lifecycleGraph }, inside), [], 'not refused: the graph');
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleGraph: () => lifecycle.MACHINE }, inside), [says('lifecycleGraph')]);
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleGraph: lifecycle.MACHINE }, inside), [says('lifecycleGraph')]);
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleGraph: () => lifecycle.transition }, inside), [says('lifecycleGraph')]);
  assert.deepEqual(exportBreaches('agent-runtime', { lifecycleGraph: lifecycle.transition }, inside), [says('lifecycleGraph')]);
  assert.deepEqual(exportBreaches('agent-runtime', { graph: lifecycle.lifecycleGraph }, inside), [says('graph')], 'by its name only');
  assert.deepEqual(exportBreaches('agent-runtime', { MACHINE: lifecycle.MACHINE }, inside), [says('MACHINE')]);
});
