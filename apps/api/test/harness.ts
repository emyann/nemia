/**
 * The harness every api test runs against, and never this machine's: a fake `claude` first on PATH that lists the sessions in `registry`
 * and notes every call, and a scratch directory where Claude Code keeps its sessions and transcripts (`CLAUDE_CONFIG_DIR`). The api reads
 * through the package's `engine()`, whose `claude` harness is the engine's own — a job (`claude -p`), or a background session (`claude
 * --bg`) — and that harness runs `claude` from PATH: the harness a test hands the api is that `claude`, as the engine's own tests hand
 * theirs. So the runner itself — the registry it observes, the transcripts it reads, the flags it spawns with — is what the api's tests
 * exercise, and not a stand-in for it. It sets `WF_VERIFY_REST=1`: every answer the list's memo of runs at rest gives (`resting.ts`) is
 * judged afresh too, and a difference fails the request. And the store is a scratch folder too (`root`, `WF_ROOT`), never this machine's.
 *
 * Installed as this module loads, so every api test file imports it first, before the api, the package or the engine, which read all three
 * as they load and run; `harness.test.ts` refuses a file that does not (`unharnessed`), and one that loads a module with `import()`: ESM
 * evaluates a file's static imports in their order, so the api and the package, imported after this, load over its store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

/** Where the fake `claude` is, first on PATH. */
export const bin = scratch('hkb-api-harness-');
/** What `claude agents` lists: a JSON array of sessions, as Claude Code's registry lists them. None until a test writes some. */
export const registry = path.join(bin, 'registry.json');
/** Every call the fake answered, a line each: its arguments. An ask for the quota adds a line of what it ran in, and one when it ended, each with its pid. */
export const calls = path.join(bin, 'calls');
/**
 * What the fake prints to a `get_usage` request (`claude -p`, the api's `askUsage`): lines of stream-json, `@ID@` in them replaced by the
 * request's own id. Claude Code 2.1.278's answer as recorded until a test writes another (`usageAnswer`).
 */
export const answer = path.join(bin, 'usage-answer');
/** How the fake takes a `get_usage` request: `answer` (the default), `silent` — it never answers — or `exit`, 3 before it reads it. */
const mode = path.join(bin, 'usage-mode');

/** Claude Code 2.1.278's answers to `get_usage`, recorded by hand (`fixtures/get-usage-*.json`), their request id made `@ID@`. */
export const recorded = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered'): string =>
  fs
    .readFileSync(path.join(import.meta.dirname, 'fixtures', `get-usage-${name === 'plan' ? '' : `${name}-`}2.1.278.json`), 'utf8')
    .replace('"request_id":"usage-1"', '"request_id":"@ID@"');

process.env.WF_VERIFY_REST = '1';

fs.writeFileSync(registry, '[]');
fs.writeFileSync(calls, '');
fs.writeFileSync(answer, recorded('plan'));
fs.writeFileSync(mode, 'answer');
fs.writeFileSync(
  path.join(bin, 'claude'),
  [
    '#!/bin/sh',
    `echo "$*" >> '${calls}'`,
    `if [ "$1" = agents ]; then cat '${registry}'; fi`,
    'if [ "$1" = -p ]; then',
    `  echo "usage-env CLAUDECODE=\${CLAUDECODE-unset} CLAUDE_CODE_ENTRYPOINT=\${CLAUDE_CODE_ENTRYPOINT-unset} CLAUDE_CONFIG_DIR=\${CLAUDE_CONFIG_DIR-unset} CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN-unset} CLAUDE_CODE_USE_BEDROCK=\${CLAUDE_CODE_USE_BEDROCK-unset} cwd=$(pwd -P) pid=$$" >> '${calls}'`,
    `  case "$(cat '${mode}')" in`,
    '    silent) exec sleep 30 ;;',
    "    exit) echo 'claude: the harness was told to fail' >&2; exit 3 ;;",
    '  esac',
    '  read -r line',
    `  id=$(printf '%s' "$line" | sed -n 's/.*"request_id":"\\([^"]*\\)".*/\\1/p')`,
    `  sed "s/@ID@/$id/g" '${answer}'`,
    '  cat > /dev/null',
    `  echo "usage-ended pid=$$" >> '${calls}'`,
    'fi',
    '',
  ].join('\n'),
  { mode: 0o755 },
);
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
/** Where Claude Code keeps its sessions and transcripts: `CLAUDE_CONFIG_DIR`, which the Claude runner reads as its module loads. */
export const config = scratch('hkb-api-harness-claude-');
process.env.CLAUDE_CONFIG_DIR = config;
/** The store's root, `WF_ROOT`: the package fixes its root (`HOME`) as its modules load. */
export const root = scratch('hkb-api-store-');
process.env.WF_ROOT = root;

/** How many calls of `verb` the fake has answered. */
const callsOf = (verb: string): number =>
  fs
    .readFileSync(calls, 'utf8')
    .split('\n')
    .filter((line) => line === verb || line.startsWith(`${verb} `)).length;

/** How many times `claude agents` has run: an observation of the harness each. */
export const observations = (): number => callsOf('agents');

/** How many times `claude stop` has run: a session stopped, which is the tick's to do, and never the api's. */
export const stops = (): number => callsOf('stop');

/** How many times the quota has been asked of the fake: a `claude -p` each. */
export const asks = (): number => callsOf('-p');

/**
 * Whether the ask whose process is `pid` ended once its stdin was closed. By pid, not by a count: an ask an earlier test started may end
 * after a later test has read a count, and move it by two.
 */
export const askEnded = (pid: number): boolean => fs.readFileSync(calls, 'utf8').split('\n').includes(`usage-ended pid=${pid}`);

/** What the last ask ran in: `{ CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, CLAUDE_CONFIG_DIR, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CODE_USE_BEDROCK, cwd, pid }`, `unset` for a variable it did not have. */
export function lastAskEnv(): Record<string, string> {
  const line =
    fs
      .readFileSync(calls, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('usage-env '))
      .pop() ?? '';
  return Object.fromEntries(
    line
      .slice('usage-env '.length)
      .split(' ')
      .map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]),
  );
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
