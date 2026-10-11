/**
 * The harness every api test runs against, and never this machine's: a fake `claude` first on PATH that lists the sessions in `registry`
 * and notes every call, and a scratch directory where Claude Code keeps its sessions and transcripts (`CLAUDE_CONFIG_DIR`). The api reads
 * through the package's `engine()`, whose `claude` harness is the engine's own — a job (`claude -p`), or a background session (`claude
 * --bg`) — and that harness runs `claude` from PATH: the harness a test hands the api is that `claude`, as the engine's own tests hand
 * theirs. So the runner itself — the registry it observes, the transcripts it reads, the flags it spawns with — is what the api's tests
 * exercise, and not a stand-in for it. It sets `WF_VERIFY_REST=1`: every answer the list's memo of runs at rest gives (`RestingMemo`) is
 * judged afresh too, and a difference fails the request. And the store is a scratch folder too (`root`, `WF_ROOT`), never this machine's.
 * It sets the daemon's two ceilings, `WF_MAX_RUNS` and `WF_MAX_CONCURRENT`, to `set-it-in-the-test`, which the package refuses by name: a
 * run's check inherits the daemon's environment, so a test that reads a ceiling sets or deletes it itself. It sets
 * `WF_DEFAULT_FACTORY_STARTS=1`, so a start made in a scratch repository no factory holds, or of a card that names no factory, goes to the
 * default factory: a test of the refusal those starts meet as shipped deletes it first. And it sets `NEMIA_DAEMON_START=off`, so a `nemia`
 * a test spawns, or a command that ticks it types, starts no daemon of this checkout. And it deletes `OTEL_EXPORTER_OTLP_ENDPOINT`: the api
 * is the daemon, and one a test starts would post its spans to the collector the shell names; a test that exports sets the address of a
 * collector it made itself.
 *
 * Installed as this module loads. The api's test script loads it with `--import` before any test file, and `node --test` loads that in
 * each test file's process and not in its own; each test file imports it first as well, by its path from the file, so a file run by hand
 * with a bare `node --test` observes no more of this machine. The api, the package and the engine read all three as they load and run;
 * `harness.test.ts` refuses a script without the `--import` (`scriptUnharnessed`), a test file whose first import is not this
 * (`unharnessed`), and one that loads a module with `import()`: ESM evaluates a file's static imports in their order, so the api and the
 * package, imported after this, load over its store.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

/** Where the fake `claude` is, first on PATH. */
export const bin = scratch('nemia-api-harness-');
/** What `claude agents` lists: a JSON array of sessions, as Claude Code's registry lists them. None until a test writes some. */
export const registry = path.join(bin, 'registry.json');
/**
 * Every call the fake answered, a line each: its arguments. An ask for the quota adds a line when it ended, with its pid.
 */
export const calls = path.join(bin, 'calls');
/**
 * What the fake prints to a `get_usage` request (`claude -p`, as the engine's `quota` asks it): lines of stream-json, `@ID@` in them
 * replaced by the request's own id. Claude Code 2.1.278's answer as recorded until a test writes another (`usageAnswer`).
 */
export const answer = path.join(bin, 'usage-answer');
/** How the fake takes a `get_usage` request: `answer` (the default), or `exit`, 3 before it reads it. */
const mode = path.join(bin, 'usage-mode');

/** Claude Code 2.1.278's answers to `get_usage`, recorded by hand (`fixtures/get-usage-*.json`), their request id made `@ID@`. */
export const recorded = (name: 'plan' | 'no-plan' | 'unsupported' | 'unanswered'): string =>
  fs
    .readFileSync(path.join(import.meta.dirname, 'fixtures', `get-usage-${name === 'plan' ? '' : `${name}-`}2.1.278.json`), 'utf8')
    .replace('"request_id":"usage-1"', '"request_id":"@ID@"');

process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = 'set-it-in-the-test';
process.env.WF_MAX_CONCURRENT = 'set-it-in-the-test';
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

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
    `  case "$(cat '${mode}')" in`,
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
export const config = scratch('nemia-api-harness-claude-');
process.env.CLAUDE_CONFIG_DIR = config;
/** The store's root, `WF_ROOT`: the package fixes its root (`HOME`) as its modules load. */
export const root = scratch('nemia-api-store-');
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

/** What the fake prints to the next `get_usage` requests, and how it takes them. */
export function usageAnswer(text: string, how: 'answer' | 'exit' = 'answer'): void {
  fs.writeFileSync(answer, text);
  fs.writeFileSync(mode, how);
}

/**
 * Why a test file's text may observe this machine, or null when it may not: its first import is not this harness, named `harness` as the
 * file reaches it (`./harness.ts` from `test/`, `../../test/harness.ts` from a folder of `src/`) — a node builtin, the api, the package —
 * or it has none, or it imports something with `import()` before it.
 */
export function unharnessed(text: string, harness = './harness.ts'): string | null {
  const fix = `Make \`import '${harness}'\` first`;
  const first = /^\s*import\b[^;]*?['"]([^'"]+)['"]/m.exec(text);
  const dynamic = /\bimport\s*\(\s*['"`]/.exec(text);
  if (!first) return `it imports no harness. ${fix}.`;
  if (dynamic && dynamic.index < first.index) return `it imports a module with import() before any static import. ${fix}, above it.`;
  if (first[1] !== harness) return `its first import is ${first[1]}. ${fix}, above it.`;
  return null;
}

/**
 * Why the api's `test` script may run a test file before this harness is installed, or null when it may not: it loads
 * `./test/harness.ts` with `--import` (`--import ./test/harness.ts` or `--import=./test/harness.ts`) before the first test file it names.
 */
export function scriptUnharnessed(script: string): string | null {
  const words = script.trim().split(/\s+/);
  const at = words.findIndex((w, i) => w === '--import=./test/harness.ts' || (w === '--import' && words[i + 1] === './test/harness.ts'));
  const firstFile = words.findIndex((w, i) => i > 0 && !w.startsWith('-') && words[i - 1] !== '--import');
  if (words[0] === 'node' && at > 0 && (firstFile < 0 || at < firstFile)) return null;
  return `the test script (${script}) runs its test files without the harness. Make it \`node --import ./test/harness.ts --test …\`.`;
}
