/**
 * What a harness declares it needs on a machine (`HarnessNeeds`, `src/harness/declaration.ts`), and where the runtime finds the program
 * those needs put in place (`claudeExecutableOf`, `codexHarness`).
 *
 * Claude Code's pin is the one the Agent SDK this runtime is pinned to bundles: its `package.json`'s `claudeCodeVersion`, installed as
 * the SDK's own platform package at the SDK's `version`. Moving the SDK's pin without the declaration fails here, before a release
 * installs a Claude Code its sessions were never measured on.
 *
 * The order a Claude Code is found in is read on folders planted here: the one named, then `<harnessBin>/claude` where it exists, read
 * at every call, then the SDK's bundled one, then `claude` on PATH.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { CLAUDE_PIN, CLAUDE_SDK_VERSION, HARNESS_DECLARATIONS } from '../src/vocabulary.ts';
import { claudeExecutableOf } from '../src/harness/mcp-sign-in.ts';
import { codexHarness, codexProgramOf } from '../src/harness/codex/codex.ts';
import type { HarnessSpec } from '../src/harness/detached/detached.ts';

const SDK = '@anthropic-ai/claude-agent-sdk';

/** The installed SDK's `package.json`, found by resolving the SDK as the runtime does and walking up to its package's folder. */
const installedSdk = (): { version: string; claudeCodeVersion?: string } => {
  let dir = path.dirname(createRequire(import.meta.url).resolve(SDK));
  while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string; claudeCodeVersion?: string };
};

test("Claude Code's pin is the Claude Code the pinned Agent SDK bundles, installed as the SDK's own platform package", () => {
  const sdk = installedSdk();
  assert.equal(CLAUDE_PIN, sdk.claudeCodeVersion, "the declared pin is the SDK's `claudeCodeVersion`");
  assert.equal(CLAUDE_SDK_VERSION, sdk.version, "the platform package is installed at the SDK's own version");
  const needs = HARNESS_DECLARATIONS.claude?.needs;
  assert.ok(needs, 'Claude Code declares its needs');
  assert.equal(needs.pin, CLAUDE_PIN);
  assert.ok(needs.install.includes(`@${CLAUDE_SDK_VERSION}`), "the install names the SDK's version");
  assert.ok(needs.install.includes(`${SDK}-`), "the install takes the SDK's platform package");
});

test('each harness that runs a brief declares what it needs on a machine, and a command needs nothing', async (t) => {
  for (const [name, declared] of Object.entries(HARNESS_DECLARATIONS)) {
    await t.test(name, () => {
      if (declared.runsBrief !== true) return assert.equal(declared.needs, undefined, `${name} runs no brief and needs nothing`);
      const needs = declared.needs;
      assert.ok(needs, `${name} runs a brief and declares its needs`);
      for (const [field, command] of Object.entries({
        install: needs.install,
        remove: needs.remove,
        check: needs.check,
        'sign-in check': needs.signIn.check,
      }))
        assert.ok(command.trim().length > 0, `${name}'s ${field} is a command`);
      assert.ok(needs.signIn.fixes.length > 0, `${name} says how to sign in`);
    });
  }
  assert.equal(HARNESS_DECLARATIONS.command?.needs, undefined);
});

/** An executable file at `at`, its folder made. */
const planted = (at: string): string => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return at;
};

/**
 * A folder an SDK is resolved from: with `bundled`, it holds the Agent SDK and its platform package, whose `claude` is planted, as
 * an install lays them out; without, nothing, as a release's tree with no bundled binary. Answers the file the SDK is resolved from,
 * and the bundled `claude` where there is one.
 */
const sdkFrom = (bundled: boolean): { from: string; claude?: string } => {
  const root = scratch('ae-harness-needs-sdk-');
  const from = path.join(root, 'from.mjs');
  if (!bundled) return { from };
  const sdk = path.join(root, 'node_modules', SDK);
  fs.mkdirSync(sdk, { recursive: true });
  fs.writeFileSync(path.join(sdk, 'package.json'), JSON.stringify({ name: SDK, main: 'sdk.mjs' }));
  fs.writeFileSync(path.join(sdk, 'sdk.mjs'), '');
  const platform = path.join(root, 'node_modules', `${SDK}-${process.platform}-${process.arch}`);
  const claude = planted(path.join(platform, process.platform === 'win32' ? 'claude.exe' : 'claude'));
  fs.writeFileSync(path.join(platform, 'package.json'), JSON.stringify({ name: `${SDK}-${process.platform}-${process.arch}` }));
  return { from, claude };
};

/** `run` with `PATH` set to `dir` alone, the process's own put back after. */
const withPath = <A>(dir: string, run: () => A): A => {
  const was = process.env.PATH;
  process.env.PATH = dir;
  try {
    return run();
  } finally {
    process.env.PATH = was;
  }
};

test('claudeExecutableOf: the one named, then the harnessBin, then the SDK bundled, then PATH', async (t) => {
  const bin = scratch('ae-harness-needs-bin-');
  const inBin = planted(path.join(bin, 'claude'));
  const emptyBin = scratch('ae-harness-needs-empty-bin-');
  const onPath = scratch('ae-harness-needs-path-');
  const pathClaude = planted(path.join(onPath, 'claude'));
  const emptyPath = scratch('ae-harness-needs-empty-path-');
  const sdk = sdkFrom(true);
  const none = sdkFrom(false);
  const rows: { case: string; named?: string; harnessBin?: string; from: string; path: string; found: string | undefined }[] = [
    {
      case: 'the one named, over the harnessBin',
      named: '/named/claude',
      harnessBin: bin,
      from: sdk.from,
      path: onPath,
      found: '/named/claude',
    },
    { case: 'the harnessBin, over the SDK bundled and PATH', harnessBin: bin, from: sdk.from, path: onPath, found: inBin },
    { case: 'a harnessBin with no claude: the SDK bundled', harnessBin: emptyBin, from: sdk.from, path: onPath, found: sdk.claude },
    { case: 'no harnessBin: the SDK bundled', from: sdk.from, path: onPath, found: sdk.claude },
    { case: 'none bundled: the claude on PATH', harnessBin: emptyBin, from: none.from, path: onPath, found: pathClaude },
    { case: 'none anywhere: none', harnessBin: emptyBin, from: none.from, path: emptyPath, found: undefined },
  ];
  for (const row of rows)
    await t.test(row.case, () => {
      assert.equal(
        withPath(row.path, () => claudeExecutableOf(row.named, row.harnessBin, row.from)),
        row.found,
      );
    });
  await t.test('the harnessBin is read at every call: a claude put there after the first is found by the next', () => {
    const later = scratch('ae-harness-needs-later-');
    assert.equal(
      withPath(emptyPath, () => claudeExecutableOf(undefined, later, none.from)),
      undefined,
    );
    const put = planted(path.join(later, 'claude'));
    assert.equal(
      withPath(emptyPath, () => claudeExecutableOf(undefined, later, none.from)),
      put,
    );
  });
});

test("Codex's spawn runs the codex in the harnessBin where there is one, else the codex on PATH", () => {
  const r = { name: 'ae/t/1', brief: 'b', cwd: scratch('ae-harness-needs-codex-cwd-') };
  const bin = scratch('ae-harness-needs-codex-');
  const codex = planted(path.join(bin, 'codex'));
  const spawned = (spec: HarnessSpec | undefined) =>
    spec?.command(
      r,
      spec.prepare?.(r, (end) => end),
    ).cmd;
  assert.equal(spawned(codexHarness().inHarnessBin?.(bin)), codex, 'the engine gives its harnessBin, and the codex there is run');
  assert.equal(codexProgramOf(scratch('ae-harness-needs-no-codex-')), 'codex', 'a harnessBin with no codex: the one on PATH');
  assert.equal(codexProgramOf(undefined), 'codex', 'no harnessBin: the one on PATH');
  assert.equal(codexHarness().command(r).cmd, 'codex', 'none found by a prepare: the one on PATH');
});
