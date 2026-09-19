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
/** Every call the fake answered, a line each: its arguments. An ask for the quota adds a line of what it ran in, and one when it ended. */
export const calls = path.join(bin, 'calls');
/**
 * What the fake prints to a `get_usage` request (`claude -p`, the api's `askUsage`): lines of stream-json, `@ID@` in them replaced by the
 * request's own id. Claude Code 2.1.278's answer as recorded until a test writes another (`usageAnswer`).
 */
export const answer = path.join(bin, 'usage-answer');
/** How the fake takes a `get_usage` request: `answer` (the default), `silent` — it never answers — or `exit`, 3 before it reads it. */
const mode = path.join(bin, 'usage-mode');

/** Claude Code 2.1.278's answers to `get_usage`, recorded by hand (`fixtures/get-usage-*.json`), their request id made `@ID@`. */
export const recorded = (name: 'plan' | 'no-plan' | 'unsupported'): string =>
  fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `get-usage-${name === 'plan' ? '' : `${name}-`}2.1.278.json`), 'utf8')
    .replace('"request_id":"usage-1"', '"request_id":"@ID@"');

fs.writeFileSync(registry, '[]');
fs.writeFileSync(calls, '');
fs.writeFileSync(answer, recorded('plan'));
fs.writeFileSync(mode, 'answer');
fs.writeFileSync(path.join(bin, 'claude'), [
  '#!/bin/sh',
  `echo "$*" >> '${calls}'`,
  `if [ "$1" = agents ]; then cat '${registry}'; fi`,
  'if [ "$1" = -p ]; then',
  `  echo "usage-env CLAUDECODE=\${CLAUDECODE-unset} CLAUDE_CODE_ENTRYPOINT=\${CLAUDE_CODE_ENTRYPOINT-unset} CLAUDE_CONFIG_DIR=\${CLAUDE_CONFIG_DIR-unset} cwd=$(pwd -P) pid=$$" >> '${calls}'`,
  `  case "$(cat '${mode}')" in`,
  '    silent) exec sleep 30 ;;',
  "    exit) echo 'claude: the harness was told to fail' >&2; exit 3 ;;",
  '  esac',
  '  read -r line',
  `  id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\\([^"]*\\)".*/\\1/p')`,
  `  sed "s/@ID@/$id/g" '${answer}'`,
  '  cat > /dev/null',
  `  echo 'usage-ended' >> '${calls}'`,
  'fi',
  '',
].join('\n'), { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
process.env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-harness-claude-'));

/** How many calls of `verb` the fake has answered. */
const callsOf = (verb: string): number =>
  fs.readFileSync(calls, 'utf8').split('\n').filter((line) => line === verb || line.startsWith(`${verb} `)).length;

/** How many times `claude agents` has run: an observation of the harness each. */
export const observations = (): number => callsOf('agents');

/** How many times `claude stop` has run: a session stopped, which is the tick's to do, and never the api's. */
export const stops = (): number => callsOf('stop');

/** How many times the quota has been asked of the fake: a `claude -p` each. */
export const asks = (): number => callsOf('-p');

/** How many asks ended once their stdin was closed. */
export const asksEnded = (): number => callsOf('usage-ended');

/** What the last ask ran in: `{ CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CONFIG_DIR, cwd, pid }`, `unset` for a variable it did not have. */
export function lastAskEnv(): Record<string, string> {
  const line = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('usage-env ')).pop() ?? '';
  return Object.fromEntries(line.slice('usage-env '.length).split(' ').map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
}

/** What the fake prints to the next `get_usage` requests, and how it takes them. */
export function usageAnswer(text: string, how: 'answer' | 'silent' | 'exit' = 'answer'): void {
  fs.writeFileSync(answer, text);
  fs.writeFileSync(mode, how);
}

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
