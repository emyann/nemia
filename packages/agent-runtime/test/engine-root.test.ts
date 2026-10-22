/**
 * The engine's store is named in one place. `root` is required on `EngineOptions`, `ClaudeOptions`, `claudeCodeOps`'s options,
 * `Journal.files` and `Journal.filesOps`, with no default: whoever builds an engine says where its records go. So no module of `src`
 * may read `AE_ROOT`, or spell the default store `~/.agent-engine`, but `src/cli/main.ts`, the CLI's entry, which reads the variable
 * once and hands the root down (`AE_ROOT_READER`). A second reader is the load-time read that wrote
 * `~/.agent-engine/parent/ae_t_1.json` on the person's own machine while a test ran.
 *
 * And `os.homedir()` is read in six files and no more (`HOMEDIR_ALLOWED`): the CLI's entry, for the store's default, and the five
 * that find a harness's own configuration — Claude Code's `~/.claude` and `~/.claude.json`, Codex's `~/.codex`. Those are the
 * harness's home and not the engine's store: a harness really does keep its sessions there, and `CLAUDE_CONFIG_DIR` and `CODEX_HOME`
 * are what move them. A new `os.homedir()` in a store, a service or a core file is refused here, since that is where a silent fallback
 * to the person's own store would live.
 *
 * Each rule is a pure function over a file's text, proven first on planted sources it must refuse.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

/** The one module that reads `AE_ROOT` and names the store it defaults to. */
const AE_ROOT_READER = 'cli/main.ts';

/**
 * The modules that may read `os.homedir()`, each with what home it reads: the CLI's entry, for the engine's store, and the three that
 * find a harness's own configuration, which lives in the person's home whatever the engine's root is.
 */
const HOMEDIR_ALLOWED: Readonly<Record<string, string>> = {
  'cli/main.ts': "the engine's store, AE_ROOT's default",
  'harness/claude/bg.ts': "Claude Code's own sessions directory, under CLAUDE_CONFIG_DIR or ~/.claude",
  'harness/claude/transcript.ts': "Claude Code's own transcripts, under CLAUDE_CONFIG_DIR or ~/.claude",
  'harness/claude/trust.ts': "Claude Code's own ~/.claude.json, and the home it never keeps a trust for",
  'harness/codex/codex.ts': "Codex's own configuration, under CODEX_HOME or ~/.codex",
  'harness/codex/transcript.ts': "Codex's own sessions, under CODEX_HOME or ~/.codex",
};

/** `text` with every comment blanked and its line breaks kept, so a store named in prose is passed over. */
const uncommented = (text: string): string => {
  const out = [...text];
  let at = 0;
  while (at < out.length) {
    if (text.startsWith('//', at)) {
      while (at < out.length && out[at] !== '\n') out[at++] = ' ';
    } else if (text.startsWith('/*', at)) {
      const end = text.indexOf('*/', at + 2);
      const stop = end === -1 ? out.length : end + 2;
      for (; at < stop; at++) if (out[at] !== '\n') out[at] = ' ';
    } else at++;
  }
  return out.join('');
};

/** Each line of `text` outside a comment that matches `what`, by its line and the line's own words. */
const linesMatching = (text: string, what: RegExp): string[] => {
  const clean = uncommented(text);
  return clean.split('\n').flatMap((line, i) => (what.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
};

/** Each line of `text` that names the engine's default store, or reads `AE_ROOT`. */
export const engineStoreNamed = (text: string): string[] => linesMatching(text, /\.agent-engine|AE_ROOT/);

/** Each line of `text` that reads the person's home directory. */
export const homedirRead = (text: string): string[] => linesMatching(text, /\bos\.homedir\s*\(/);

test('REFUSED: a store named or a home read in a source file is found, by line; one named in a comment is passed over', () => {
  const store = '.agent-' + 'engine';
  const variable = 'AE_' + 'ROOT';
  assert.deepEqual(engineStoreNamed(`const a = 1;\nconst root = path.join(os.homedir(), '${store}');\n`), [
    `2: const root = path.join(os.homedir(), '${store}');`,
  ]);
  assert.deepEqual(engineStoreNamed(`const root = options.root ?? '${store}';\n`), [`1: const root = options.root ?? '${store}';`]);
  assert.deepEqual(engineStoreNamed(`const root = process.env.${variable} ?? home;\n`), [
    `1: const root = process.env.${variable} ?? home;`,
  ]);
  assert.deepEqual(
    engineStoreNamed(`/**\n * Where the store lives: \`~/${store}\` unless \`${variable}\` says otherwise.\n */\nexport const x = 1;\n`),
    [],
    'a store named in a comment is passed over',
  );
  assert.deepEqual(engineStoreNamed(`// const root = '${store}';\n`), [], 'and one commented out');
  assert.deepEqual(homedirRead('const home = os.homedir();\n'), ['1: const home = os.homedir();']);
  assert.deepEqual(homedirRead("/** os.homedir() is the person's own. */\n"), [], 'a home named in a comment is passed over');
  assert.deepEqual(homedirRead('const home = given.homedir;\n'), [], 'a home given, not read');
});

/** Every file of `src` that is no test, by its path from `src`. */
const sources = (): string[] =>
  fs
    .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.ts$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => f.split(path.sep).join('/'));

test("src/cli/main.ts is the one module that reads AE_ROOT or names the engine's default store", () => {
  const files = sources();
  assert.ok(files.length > 20, 'the sweep reads the sources');
  const refused = files
    .filter((f) => f !== AE_ROOT_READER)
    .flatMap((f) => engineStoreNamed(fs.readFileSync(path.join(SRC, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(
    refused,
    [],
    `take the root as a required option and let the caller name it: src/${AE_ROOT_READER} reads AE_ROOT once and hands it down`,
  );
  assert.ok(
    engineStoreNamed(fs.readFileSync(path.join(SRC, AE_ROOT_READER), 'utf8')).length > 0,
    `src/${AE_ROOT_READER} no longer reads AE_ROOT: the CLI must read it somewhere, or nothing names the store's default`,
  );
});

test("os.homedir() is read in the CLI's entry and the harnesses' own homes, and nowhere else", () => {
  const refused = sources()
    .filter((f) => !(f in HOMEDIR_ALLOWED))
    .flatMap((f) => homedirRead(fs.readFileSync(path.join(SRC, f), 'utf8')).map((l) => `${f}:${l}`));
  assert.deepEqual(
    refused,
    [],
    "a root is given, never read from the person's home: take it as a required option, as EngineOptions and ClaudeOptions do",
  );
  const stale = Object.keys(HOMEDIR_ALLOWED).filter((f) => homedirRead(fs.readFileSync(path.join(SRC, f), 'utf8')).length === 0);
  assert.deepEqual(stale, [], 'these read no home any more: take them out of HOMEDIR_ALLOWED, which only shrinks');
});
