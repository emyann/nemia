/**
 * The build refuses what it must: its own configuration, pointed at scratch pages of which one links to nowhere, must fail. What the
 * real site's build writes is asserted where the repository builds it, by `built.ts` on `npm run build`, never by a build made here.
 * After it, the dev server starts through `dev()` in a child (`test/dev.ts`) and must say no error of its prerender server.
 *
 * The dev child is waited on by what it says (`until` on a `bell` its streams and its end ring), never under a bound of its own: the
 * dev toolchain's start is as slow as the machine is loaded. And what it is held to of the checkout's dev-server record is the pid
 * that record names: a record another process writes while the child runs is not the child's doing, and an equality on the whole
 * record read before and after made a neighbour's write this test's failure.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from './waits.ts';

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

/** What `test/dev.ts` says on its `RESULT` line. */
type Result = { status: number; drawn: boolean; pid: number; registered: number | null };

test(
  'dev starts without the prerender server’s error, renders a page, and leaves the dev server’s record as it found it',
  WAITED,
  async (t) => {
    const rang = bell();
    let said = '';
    let ended: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    const child = spawn(process.execPath, [path.join(import.meta.dirname, 'dev.ts'), APP], {
      cwd: APP,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    t.after(() => void child.kill('SIGKILL'));
    child.stdin.on('error', () => undefined);
    for (const stream of [child.stdout, child.stderr])
      stream.on('data', (chunk: Buffer) => {
        said += chunk;
        rang.ring();
      });
    child.once('close', (code, signal) => {
      ended = { code, signal };
      rang.ring();
    });

    const line = await until(
      t,
      () => {
        const got = /^RESULT (.*)$/m.exec(said)?.[1];
        if (got === undefined && ended) assert.fail(`the dev child ended before its RESULT line (${JSON.stringify(ended)}):\n${said}`);
        return got;
      },
      () => `the dev child’s RESULT line; it has said:\n${said || '(nothing)'}`,
      { bell: rang },
    );
    await until(
      t,
      () => ended,
      () => `the dev child’s end; it has said:\n${said}`,
      { bell: rang },
    );
    assert.deepEqual(ended, { code: 0, signal: null }, said);
    assert.doesNotMatch(said, /Failed to create the prerender server app/, 'the prerender server starts');
    const result = JSON.parse(line) as Result;
    assert.deepEqual(
      { status: result.status, drawn: result.drawn },
      { status: 200, drawn: true },
      'the runtime page renders in dev, its lifecycle drawn',
    );
    assert.notEqual(
      result.registered,
      result.pid,
      `the dev server it started named itself the checkout’s in ${LOCK}, which a person’s own \`npm run dev\` owns`,
    );
  },
);
