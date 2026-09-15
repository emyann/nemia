/**
 * The harness every api test runs against, and never this machine's: a fake `claude` first on PATH that lists the sessions in `registry` and
 * notes every call, and a scratch directory where Claude Code keeps its sessions and transcripts (CLAUDE_CONFIG_DIR). The api reads through the
 * package's `engine()`, whose `claude` harness is the engine's own `claude --bg` runner, and that runner runs `claude` from PATH: the harness a
 * test hands the api is that `claude`, as the engine's own tests hand theirs. So the runner itself — the registry it observes, the transcripts it
 * reads, the flags it spawns with — is what the api's tests exercise, and not a stand-in for it.
 *
 * Installed as this module loads, so every api test file imports it first, before the api, the package or the engine, which read both as they
 * load and run; `harness.test.ts` refuses a file that does not (`unharnessed`). A file that keeps its sessions elsewhere points
 * CLAUDE_CONFIG_DIR there before it imports the api. Before this, `app.test.ts` asked this machine's registry 154 times a run (measured
 * 2026-09-14, a `claude` in front of PATH that noted which test file called it), and the api's test process died beside other packages' tests
 * under parallel turbo (plan §4b).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the fake `claude` is, first on PATH. */
export const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-harness-'));
/** What `claude agents` lists: a JSON array of sessions, as Claude Code's registry lists them. None until a test writes some. */
export const registry = path.join(bin, 'registry.json');
/** Every call the fake answered, a line each: its arguments. */
export const calls = path.join(bin, 'calls');

fs.writeFileSync(registry, '[]');
fs.writeFileSync(calls, '');
fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$*" >> '${calls}'\nif [ "$1" = agents ]; then cat '${registry}'; fi\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
process.env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-harness-claude-'));

/** How many calls of `verb` the fake has answered. */
const callsOf = (verb: string): number =>
  fs.readFileSync(calls, 'utf8').split('\n').filter((line) => line === verb || line.startsWith(`${verb} `)).length;

/** How many times `claude agents` has run: an observation of the harness each. */
export const observations = (): number => callsOf('agents');

/** How many times `claude stop` has run: a session stopped, which is the tick's to do, and never the api's. */
export const stops = (): number => callsOf('stop');

/**
 * Why a test file's text may observe this machine, or null when it may not: its first import is not this harness — a node builtin, the api,
 * the package — or it has none, or it imports something with `import()` before it.
 */
export function unharnessed(text: string): string | null {
  const fix = "Make `import './harness.ts'` first";
  const first = /^\s*import\b[^;]*?['"]([^'"]+)['"]/m.exec(text);
  const dynamic = /\bimport\s*\(\s*['"`]/.exec(text);
  if (!first) return `it imports no harness. ${fix}.`;
  if (dynamic && dynamic.index < first.index) return `it imports a module with import() before any static import. ${fix}, above it.`;
  if (first[1] !== './harness.ts') return `its first import is ${first[1]}. ${fix}, above it.`;
  return null;
}
