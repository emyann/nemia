/**
 * The site builds, so every check's `npm test` catches a broken page, a broken internal link or a diagram that does not draw: the
 * real site is built into a scratch folder, and its own configuration, pointed at scratch pages of which one links to nowhere, must fail.
 * After the builds, the dev server starts through `dev()` in a child (`test/dev.ts`) and must say no error of its prerender server.
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
const LOCK = path.join(APP, '.astro', 'dev.json');

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

/** The site's pages, in the sidebar's order: each built as its own `index.html`. */
const PAGES = ['', 'map', 'runtime', 'a2a', 'workflows', 'agents', 'factories', 'how-a-run-lives', 'nemia', 'glossary', 'getting-started'];

test('the site builds, with its eleven pages, the lifecycle on the runtime page alone and Nemia’s machine on hers alone', () => {
  const out = scratch('docs-build-');
  const { status, said } = build(APP, out);
  assert.equal(status, 0, said);
  const built = PAGES.map((page) => path.join(out, page, 'index.html'));
  assert.deepEqual(
    built.filter((page) => !fs.existsSync(page)),
    [],
    'every page is built',
  );
  for (const page of built)
    assert.doesNotMatch(fs.readFileSync(page, 'utf8'), /set:html/, `no figure of ${page} prints its style as an attribute`);
  const figures = (page: string) => svgsOf(fs.readFileSync(path.join(out, page, 'index.html'), 'utf8'));
  assert.ok(
    figures('runtime').some((svg) => svg.includes('input-required')),
    'the runtime page draws the lifecycle',
  );
  assert.ok(
    figures('nemia').some((svg) => svg.includes('untrusted')),
    "Nemia's page draws her machine",
  );
  assert.ok(figures('how-a-run-lives').length > 0, 'how a run lives draws its sequence');
  const drawing = (word: string) => PAGES.filter((page) => figures(page).some((svg) => svg.includes(word)));
  assert.deepEqual(drawing('input-required'), ['runtime'], 'the lifecycle has one home, the runtime page');
  assert.deepEqual(drawing('untrusted'), ['nemia'], 'Nemia’s machine has one home, her page');
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

test('dev starts without the prerender server’s error, renders a page, and leaves the dev server’s record as it found it', () => {
  const record = () => (fs.existsSync(LOCK) ? fs.readFileSync(LOCK, 'utf8') : null);
  const before = record();
  const ran = spawnSync(process.execPath, [path.join(import.meta.dirname, 'dev.ts'), APP], {
    cwd: APP,
    encoding: 'utf8',
    timeout: 100_000,
    killSignal: 'SIGKILL',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true', NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const said = `${ran.stdout}${ran.stderr}`;
  assert.equal(ran.status, 0, said);
  assert.doesNotMatch(said, /Failed to create the prerender server app/, 'the prerender server starts');
  const result = /^RESULT (.*)$/m.exec(said)?.[1];
  assert.ok(result, said);
  assert.deepEqual(JSON.parse(result), { status: 200, drawn: true }, 'the runtime page renders in dev, its lifecycle drawn');
  assert.equal(record(), before, 'the dev server’s record is as it was');
});
