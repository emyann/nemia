/**
 * `nemia factory home` as a person types it, on a store served by its api (`served.ts`) holding `mill`, a factory made from a template
 * whose tree holds a home: a memory file, a skill and an executable script. The person's `claude` is a stub first on PATH that writes
 * the folder it was started in, its arguments and the memory variable to a file, and exits 7. Opened, the home is rendered under the
 * client's cache by its digest, no file of it writable, and the session started there with the repository added beside it, the copy's
 * edits denied and the project's settings alone, its exit code the command's; `--claude-md on` turns the repository's memory on. A home
 * changed renders a new copy and removes the old one, a render in flight kept. Refused: a repository inside the copy, exit 2 naming the
 * command, nothing started; no `claude` on PATH, exit 2 naming the install, the copy rendered all the same; a factory with no home, its
 * refusal's exit 2 naming the takeover. Each refusal asserts its code and the command it names, never its sentence.
 */
import { afterAll, test } from 'vitest';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { type Said, servedStore, write } from './served.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** The home `mill`'s tree holds, by path: its text and its mode. */
const HOME: Record<string, { text: string; mode: number }> = {
  'CLAUDE.md': { text: '# the mill\n', mode: 0o644 },
  '.claude/skills/grind/SKILL.md': { text: '---\nname: grind\n---\nGrind it.\n', mode: 0o644 },
  'bin/run.sh': { text: '#!/bin/sh\necho run\n', mode: 0o755 },
};

/** The store: `mill`, made from a template, its tree's home planted; `hand`, made by hand, which has none. */
const store = await servedStore('nemia-home-', (root) => {
  write(
    path.join(root, 'factories', 'mill.json'),
    JSON.stringify({ volumes: [], template: { source: '/templates/mill', version: '1.0.0', params: {} } }),
  );
  write(path.join(root, 'factories', 'mill', 'tree', 'factory.json'), JSON.stringify({ workflows: [], hires: {} }));
  for (const [at, { text, mode }] of Object.entries(HOME)) {
    const file = path.join(root, 'factories', 'mill', 'tree', 'home', at);
    write(file, text);
    fs.chmodSync(file, mode);
  }
  write(path.join(root, 'factories', 'hand.json'), JSON.stringify({ volumes: [] }));
});
afterAll(store.stop);

/** The home's memory file in the store's tree, which a second open reads changed. */
const TREE_MEMORY = path.join(store.env.WF_ROOT ?? assert.fail('the store has a root'), 'factories', 'mill', 'tree', 'home', 'CLAUDE.md');

/** A stub `claude`, alone in its folder: it writes what it was started with to `$STUB_SAW` and exits 7. */
const STUB_BIN = scratch('nemia-home-stub-');
write(
  path.join(STUB_BIN, 'claude'),
  `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.STUB_SAW, JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), memory: process.env.CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD ?? null }));\nprocess.exit(7);\n`,
);
fs.chmodSync(path.join(STUB_BIN, 'claude'), 0o755);

const CACHE = scratch('nemia-home-cache-');
const SAW = path.join(scratch('nemia-home-saw-'), 'saw.json');
const REPO = scratch('nemia-home-repo-');

/** The person's machine: the store in use, the cache under `CACHE`, and the stub first on PATH. */
const person: NodeJS.ProcessEnv = { ...store.env, XDG_CACHE_HOME: CACHE, STUB_SAW: SAW, PATH: `${STUB_BIN}:${store.env.PATH ?? ''}` };

/** The folder of `mill`'s copies under the context `local`. */
const COPIES = path.join(CACHE, 'nemia', 'homes', 'local', 'mill');

/** `nemia <argv>` on `env` in the folder `cwd`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv, cwd: string) {
  const child = spawn(process.execPath, [CLI, ...argv], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  }) satisfies Promise<Said>;
}

/** `nemia <argv>` on `env`, typed in `cwd`, its exit code asserted `code`. */
async function typed(argv: readonly string[], code: number, env: NodeJS.ProcessEnv = person, cwd: string = REPO) {
  fs.rmSync(SAW, { force: true });
  const said = await nemia(argv, env, cwd);
  assert.equal(said.code, code, `nemia ${argv.join(' ')}: ${said.err}${said.out}`);
  return said;
}

/** What the stub was started with, or none where it was not started. */
const saw = () =>
  fs.existsSync(SAW) ? (JSON.parse(fs.readFileSync(SAW, 'utf8')) as { cwd: string; argv: string[]; memory: string | null }) : undefined;

/** The copies of `mill`'s home in the cache, by name. */
const copies = () => (fs.existsSync(COPIES) ? fs.readdirSync(COPIES).sort() : []);

/** Each file under `dir` by its path from it, with its text and whether any write bit is set. */
function filesIn(dir: string, rel = '') {
  const found: Record<string, { text: string; writable: boolean }> = {};
  for (const name of fs.readdirSync(path.join(dir, rel))) {
    const at = rel ? `${rel}/${name}` : name;
    const st = fs.statSync(path.join(dir, at));
    if (st.isDirectory()) Object.assign(found, filesIn(dir, at));
    else found[at] = { text: fs.readFileSync(path.join(dir, at), 'utf8'), writable: (st.mode & 0o222) !== 0 };
  }
  return found;
}

test("opened, mill's home is rendered by its digest, read-only, and the session started there, the repository beside it", async () => {
  await typed(['factory', 'home', 'mill', REPO], 7);
  const [copy, ...more] = copies();
  assert.ok(copy !== undefined && /^[0-9a-f]{64}$/.test(copy) && more.length === 0, `one copy named by a digest: ${copies().join(', ')}`);
  const at = path.join(COPIES, copy);
  assert.deepEqual(
    filesIn(at),
    Object.fromEntries(Object.entries(HOME).map(([p, { text }]) => [p, { text, writable: false }])),
    "the tree's home byte for byte, no file writable",
  );
  assert.equal((fs.statSync(path.join(at, 'bin', 'run.sh')).mode & 0o111) !== 0, true, 'a script stays executable');
  const started = saw() ?? assert.fail('the session was started');
  assert.equal(fs.realpathSync(started.cwd), fs.realpathSync(at), 'started in the copy');
  assert.deepEqual(started.argv, ['--add-dir', REPO, '--disallowedTools', `Edit(/${at}/**)`, '--setting-sources', 'project']);
  assert.equal(started.memory, null, "the repository's memory is off by default");
});

test("--claude-md on loads the repository's memory files; with no repository typed, the folder typed in is the one added", async () => {
  await typed(['factory', 'home', 'mill', REPO, '--claude-md', 'on'], 7);
  assert.equal(saw()?.memory, '1');
  await typed(['factory', 'home', 'mill'], 7);
  assert.equal(fs.realpathSync(saw()?.argv[1] ?? ''), fs.realpathSync(REPO), 'this folder, added beside the home');
});

test('a home changed renders a new copy and removes the earlier one; a render in flight is kept', async () => {
  const [before] = copies();
  fs.mkdirSync(path.join(COPIES, '.abc-in-flight'));
  fs.writeFileSync(TREE_MEMORY, '# the mill, changed\n');
  await typed(['factory', 'home', 'mill', REPO], 7);
  const now = copies().filter((name) => !name.startsWith('.'));
  assert.equal(now.length, 1, now.join(', '));
  assert.notEqual(now[0], before, 'a new digest');
  assert.ok(copies().includes('.abc-in-flight'), 'the render in flight is kept');
  assert.equal(fs.readFileSync(path.join(COPIES, now[0] ?? '', 'CLAUDE.md'), 'utf8'), '# the mill, changed\n');
});

test('REFUSED: a repository inside the copy, exit 2 naming the command, and no session started', async () => {
  const [copy] = copies().filter((name) => !name.startsWith('.'));
  const inside = path.join(COPIES, copy ?? assert.fail('a copy'), 'bin');
  const said = await typed(['factory', 'home', 'mill', inside], 2);
  assert.ok(said.err.includes('nemia factory home mill'), said.err);
  assert.equal(saw(), undefined, 'nothing was started');
});

test('REFUSED: no claude on PATH, exit 2 naming the install, the copy rendered all the same', async () => {
  fs.rmSync(COPIES, { recursive: true, force: true });
  const said = await typed(['factory', 'home', 'mill', REPO], 2, { ...person, PATH: scratch('nemia-home-nopath-') });
  assert.ok(said.err.includes('npm install -g'), said.err);
  assert.equal(copies().length, 1, 'rendered before the session was started');
});

test('REFUSED: a factory with no home, exit 2 naming its takeover by a template', async () => {
  const said = await typed(['factory', 'home', 'hand', REPO], 2);
  assert.ok(said.err.includes('nemia factory adopt'), said.err);
  assert.equal(saw(), undefined);
});
