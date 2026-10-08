/**
 * The site builds, so every check's `npm test` catches a broken page, a broken internal link or a diagram that does not draw: the
 * real site is built into a scratch folder, and its own configuration, pointed at scratch pages of which one links to nowhere, must fail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const APP = path.join(import.meta.dirname, '..');
const ROOT = path.join(APP, '..', '..');
const ASTRO = path.join(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');

/** `astro build` of the site at `root` into `outDir`, by its own configuration or by `config`: its exit status and all it printed. */
const build = (root: string, outDir: string, config?: string): { status: number | null; said: string } => {
  const ran = spawnSync(
    process.execPath,
    [ASTRO, 'build', '--root', root, '--outDir', outDir, ...(config ? ['--config', path.relative(root, config)] : [])],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return { status: ran.status, said: `${ran.stdout}${ran.stderr}` };
};

/** The SVGs of a built page. */
const svgsOf = (html: string): string[] => html.match(/<svg[\s\S]*?<\/svg>/g) ?? [];

test('the site builds, with its three pages and both code-drawn diagrams on the map', () => {
  const out = scratch('docs-build-');
  const { status, said } = build(APP, out);
  assert.equal(status, 0, said);
  for (const page of ['index.html', 'map/index.html', 'glossary/index.html']) assert.ok(fs.existsSync(path.join(out, page)), page);
  const html = fs.readFileSync(path.join(out, 'map', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /set:html/, 'no figure prints its style as an attribute');
  const map = svgsOf(html);
  assert.ok(
    map.some((svg) => svg.includes('input-required')),
    'the map draws the lifecycle',
  );
  assert.ok(
    map.some((svg) => svg.includes('untrusted')),
    "the map draws Nemia's machine",
  );
});

test('REFUSED: a page with a broken internal link fails the build', () => {
  const fixture = scratch('docs-broken-');
  const pages = path.join(fixture, 'src', 'content', 'docs');
  fs.mkdirSync(pages, { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'src', 'content.config.mjs'),
    `export { collections } from ${JSON.stringify(path.join(APP, 'src', 'content.config.mjs'))};\n`,
  );
  for (const [page, title] of [
    ['map.mdx', 'The map'],
    ['glossary.mdx', 'Glossary'],
  ])
    fs.writeFileSync(path.join(pages, page), `---\ntitle: ${title}\n---\n\nA page.\n`);
  fs.writeFileSync(path.join(pages, 'index.mdx'), '---\ntitle: What Nemia is\n---\n\nSee [the runs](/no-such-page/).\n');
  const config = path.join(fixture, 'astro.config.mjs');
  fs.writeFileSync(
    config,
    `import site from ${JSON.stringify(path.join(APP, 'astro.config.mjs'))};\n` +
      `export default { ...site, srcDir: ${JSON.stringify(path.join(fixture, 'src'))} };\n`,
  );
  const { status, said } = build(APP, path.join(fixture, 'out'), config);
  assert.notEqual(status, 0, said);
  assert.match(said, /Links validation failed/, 'the links validator refuses the build');
  assert.match(said, /\/no-such-page\//, 'the build names the broken link');
});
