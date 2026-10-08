/**
 * The docs reach no layer: their manifest names no workspace package, and their code imports none, by its name or by a relative path out
 * of `apps/docs`. They read the repository's text at build, by path from its root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..', '..');

/** The names of the workspace's packages and apps, the docs' own but. */
const workspaceNames = (): string[] =>
  ['packages', 'apps']
    .flatMap((top) => fs.readdirSync(path.join(ROOT, top)).map((dir) => path.join(ROOT, top, dir, 'package.json')))
    .filter((file) => fs.existsSync(file) && path.dirname(file) !== APP)
    .map((file) => (JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string }).name);

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

/** Each workspace package a manifest depends on, worded with the fix. */
const dependedOn = (manifest: Manifest, names: string[]): string[] =>
  [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]
    .filter((dep) => names.includes(dep))
    .map((dep) => `apps/docs/package.json depends on ${dep}: the docs import no package, they read its docs as text at build`);

/** Each module a piece of code names that is a workspace package, or a relative path out of `apps/docs`, with its file. */
const reachedFrom = (file: string, text: string, names: string[]): string[] =>
  [...text.matchAll(/\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((spec) =>
      spec.startsWith('.')
        ? path.relative(APP, path.resolve(path.dirname(path.join(APP, file)), spec)).startsWith('..')
        : names.some((name) => spec === name || spec.startsWith(`${name}/`)),
    )
    .map((spec) => `${file} imports ${spec}: the docs import no package, they read its docs as text at build`);

/** The docs' own code, by path from `apps/docs`: its configs at the root and every source under `src/`. */
const docsCode = (): string[] => [
  ...fs.readdirSync(APP).filter((f) => /\.(?:mjs|js|ts)$/.test(f)),
  ...(fs.readdirSync(path.join(APP, 'src'), { recursive: true }) as string[])
    .filter((f) => /\.(?:mjs|js|ts|tsx|astro|mdx)$/.test(f))
    .map((f) => path.join('src', f)),
];

test('REFUSED: a dependency on, or an import of, a workspace package', () => {
  const names = ['agent-orchestrator', 'agent-runtime'];
  assert.deepEqual(dependedOn({ dependencies: { astro: '7.3.7', 'agent-orchestrator': '*' } }, names), [
    'apps/docs/package.json depends on agent-orchestrator: the docs import no package, they read its docs as text at build',
  ]);
  assert.equal(dependedOn({ devDependencies: { 'agent-runtime': '*' } }, names).length, 1, 'a dev dependency too');
  const code = [
    "import { x } from 'agent-runtime';",
    "import { y } from 'agent-runtime/vocabulary';",
    "const z = await import('../../packages/agent-runtime/src/index.ts');",
    "import { mermaid } from './mermaid.ts';",
    "import starlight from '@astrojs/starlight';",
    "import { agentRuntimeLike } from 'agent-runtimes';",
  ].join('\n');
  assert.deepEqual(reachedFrom('src/x.ts', code, names), [
    'src/x.ts imports agent-runtime: the docs import no package, they read its docs as text at build',
    'src/x.ts imports agent-runtime/vocabulary: the docs import no package, they read its docs as text at build',
    'src/x.ts imports ../../packages/agent-runtime/src/index.ts: the docs import no package, they read its docs as text at build',
  ]);
});

test('the docs depend on no workspace package and import none', () => {
  const names = workspaceNames();
  assert.ok(names.includes('agent-runtime') && names.includes('web'), `the names were read from nothing: ${names.join(', ')}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')) as Manifest;
  assert.deepEqual(dependedOn(manifest, names), []);
  const files = docsCode();
  assert.ok(files.includes('astro.config.mjs') && files.includes(path.join('src', 'mermaid.ts')), 'the scan reads the docs’ code');
  assert.deepEqual(
    files.flatMap((f) => reachedFrom(f, fs.readFileSync(path.join(APP, f), 'utf8'), names)),
    [],
  );
});
