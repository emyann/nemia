/**
 * Codex, through `codex exec`: the sandboxes and efforts it takes, the trust it is extended, and its spec.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { SpawnRequest } from './runner.ts';
import type { HarnessSpec } from './runner-detached.ts';
import { codexOutput } from './runner-detached-output.ts';
import { codexRolloutEvents, codexRolloutFile } from './runner-codex-transcript.ts';
import { codexMcpServerNames, codexMcpServers } from './runner-mcp.ts';
import { countSpawn } from './io-tally.ts';

/**
 * The project paths a Codex config trusts.
 *
 * Reads only `[projects."<path>"]` tables holding `trust_level = "trusted"` — the shape Codex writes
 * itself — not TOML in general. A config it cannot read trusts nothing.
 */
export const trustedProjects = (toml: string): Set<string> => {
  const trusted = new Set<string>();
  let current: string | undefined;
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const table = /^\[projects\."((?:[^"\\]|\\.)*)"\]$/.exec(line);
    if (table) {
      current = table[1];
      continue;
    }
    if (line.startsWith('[')) {
      current = undefined;
      continue;
    }
    if (current !== undefined && /^trust_level\s*=\s*"trusted"$/.test(line)) trusted.add(current);
  }
  return trusted;
};

/** The repository a directory's commits land in: the parent of its git common dir. */
const repositoryOf = (cwd: string): string | undefined => {
  try {
    countSpawn();
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return path.dirname(path.resolve(cwd, common));
  } catch {
    return undefined;
  }
};

/**
 * Codex's sandboxes, which a task names as its `permissionMode`. `bypassPermissions`, Claude's
 * word, is also taken, as the widest: `danger-full-access`.
 */
export const CODEX_SANDBOXES: readonly string[] = ['read-only', 'workspace-write', 'danger-full-access'];

/** The tools that change files. Codex has no tool list — one shell, three sandboxes — so these decide. */
const WRITES: readonly string[] = ['Bash', 'Write', 'Edit'];

/**
 * The sandbox a task runs in: the one it named, `workspace-write` when it named none — and
 * `read-only` whenever its `tools` has none of Bash, Write or Edit, whatever it named, because the
 * narrower of two fences is the one that was asked for. A list that has one of them does not
 * narrow Codex at all: Codex cannot take its shell away and leave its edits.
 *
 * A word that is not a sandbox never arrives through `file()`, which refuses it; a direct caller
 * gets the default.
 */
const sandboxOf = (r: SpawnRequest): string => {
  if (r.config?.tools && !r.config?.tools.some((t) => WRITES.includes(t))) return 'read-only';
  const asked = r.config?.permissionMode === 'bypassPermissions' ? 'danger-full-access' : r.config?.permissionMode;
  return asked !== undefined && CODEX_SANDBOXES.includes(asked) ? asked : 'workspace-write';
};

/**
 * The reasoning efforts the Codex API names for its default model. Codex checks
 * none itself: a bad one is sent, refused by the API, and the session exits 1 — so `file()` refuses
 * it first.
 */
export const CODEX_EFFORTS: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Codex, through `codex exec`. Its argv, in order:
 *
 * 1. `exec --json --skip-git-repo-check -C <cwd>`: JSONL events on stdout, run outside a git repository too, in the
 *    task's working root.
 * 2. `-s <sandbox>`: the sandbox the task named, as itself (`sandboxOf`), so a task that asks for a reviewer that cannot
 *    write gets one.
 * 3. `-m <model>`, where the task names one.
 * 4. `--worktree`, where the task asks for one. Codex's worktree flag takes no value, so it is safe immediately before
 *    the prompt, unlike Claude's; the spec is where that difference lives, so the engine never learns that harnesses
 *    disagree about anything.
 * 5. `--output-schema <file> -o <file>`, when the task asked for a closing statement: the final message conforms to the
 *    schema, which Codex holds strict, and is written where the runner chose, outside the workspace, so it cannot travel
 *    into the next step's branch.
 * 6. `-c model_reasoning_effort="<effort>"`: effort is a config override, as `codex exec` has no flag for it.
 * 7. `-c mcp_servers=<table>`: the task's MCP servers, as one override of the whole table. Codex merges it into the
 *    operator's own `mcp_servers`, never puts it in their place — `-c mcp_servers={}` leaves every one of them loaded —
 *    so, unlike Claude Code, a Codex task still has the operator's servers.
 * 8. `-c projects."<dir>".trust_level="trusted"` for each directory `prepare` found trusted: what lets a repository's
 *    own `.codex/rules` load in a worktree.
 * 9. `resume <id>`, last after every flag: its own usage is `[SESSION_ID] [PROMPT]`, and it rejects `-C`, `-s` and
 *    `--add-dir` after the id ("unexpected argument").
 * 10. The brief.
 *
 * It refuses what Codex would drop without a word: a deny or an allow list, as Codex has no tool list, only a sandbox; a
 * spend cap, as `codex exec` has none and its stream counts tokens, not dollars — its config's budgets are token
 * budgets; Claude Code's flags, as `codex exec` is another CLI. It reads what a session consumed from the same JSONL
 * (`codexOutput`: tokens from `turn.completed`, tool calls by item), and the conversation from Codex's own rollout of the
 * thread rather than the stream: the rollout dates every record, and `exec --json` dates none. Its `nativeIdPattern`
 * finds the thread id Codex prints in its JSONL, which a resume and the rollout are found by.
 */
export const codex: HarnessSpec = {
  name: 'codex',
  command: (r, io) => ({
    cmd: 'codex',
    args: [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '-C',
      r.cwd,
      '-s',
      sandboxOf(r),
      ...(r.config?.model ? ['-m', r.config?.model] : []),
      ...(r.config?.worktree ? ['--worktree'] : []),
      ...(io?.closeoutFile ? ['--output-schema', io.closeoutSchemaFile!, '-o', io.closeoutFile] : []),
      ...(r.config?.effort ? ['-c', `model_reasoning_effort="${r.config?.effort}"`] : []),
      ...(r.config?.mcp && Object.keys(r.config?.mcp).length ? ['-c', `mcp_servers=${codexMcpServers(r.config?.mcp)}`] : []),
      ...(io?.trustedDirs ?? []).flatMap((dir) => ['-c', `projects."${dir}".trust_level="trusted"`]),
      ...(r.resumeFrom ? ['resume', r.resumeFrom] : []),
      r.brief,
    ],
  }),
  refuses: (task) => {
    const { permissionMode, effort, disallowedTools, allowedTools, mcp } = task.config ?? {};
    if (permissionMode !== undefined && permissionMode !== 'bypassPermissions' && !CODEX_SANDBOXES.includes(permissionMode)) {
      return `\`permissionMode: ${permissionMode}\` is not a sandbox Codex has. Its modes are: ${CODEX_SANDBOXES.join(', ')} (and bypassPermissions, meaning danger-full-access).`;
    }
    if (effort !== undefined && !CODEX_EFFORTS.includes(effort)) {
      return `\`effort: ${effort}\` is not a reasoning effort Codex has. Its efforts are: ${CODEX_EFFORTS.join(', ')}.`;
    }
    if (disallowedTools?.length) {
      return `\`disallowedTools: ${JSON.stringify(disallowedTools)}\` is a deny list, and Codex has no tool list to take from: one shell, fenced by its sandbox. The sandbox is \`permissionMode\` — \`read-only\` runs commands and writes nothing. Leave \`disallowedTools\` off a Codex task, and name the sandbox.`;
    }
    if (allowedTools?.length) {
      return `\`allowedTools: ${JSON.stringify(allowedTools)}\` is an allow list, and Codex has no tool list to allow from: one shell, fenced by its sandbox. The sandbox is \`permissionMode\` — \`workspace-write\` writes in the workspace and asks nobody. Leave \`allowedTools\` off a Codex task, and name the sandbox.`;
    }
    if (task.config?.budgetUsd !== undefined) {
      return `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap in dollars, and \`codex exec\` has none: 0.154.0 has no such flag, and reports no cost to cap. Leave \`budgetUsd\` off a Codex task, or file it on \`claude-detached\`, which ends a session at its cap.`;
    }
    if (task.config?.claude !== undefined) {
      return `\`claude: ${JSON.stringify(task.config.claude)}\` gives Claude Code flags of its own, and \`codex exec\` is not Claude Code. Leave \`claude\` off a Codex task, and say what the session must know in its brief.`;
    }
    const sse = Object.entries(mcp ?? {}).find(([, s]) => 'url' in s && s.type === 'sse');
    if (sse) {
      return `\`mcp.${sse[0]}\` is an SSE server, and Codex connects only to stdio and streamable HTTP servers. Give \`type: "http"\` if the server speaks it, or leave the server off a Codex task.`;
    }
    return undefined;
  },
  readOutput: codexOutput,
  transcript: { file: codexRolloutFile, events: codexRolloutEvents },
  noChannel:
    '`codex exec` reads its prompt once and takes nothing while it runs: there is no channel into a running Codex session. Continue its thread with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.',
  nativeIdPattern: '"(?:thread_id|session_id|id)"\\s*:\\s*"([0-9a-f-]{16,})"',
  /**
   * Trust is extended, never granted.
   *
   * Codex keeps `.git` read-only inside its sandbox on purpose, so a step can only commit its own
   * work when a rule lets `git add`/`git commit` run outside it — and Codex loads a project's rules
   * only when the project is trusted: in a worktree, when the repository and the worktree both are. A
   * worktree is a new path, so it is never trusted on its own.
   *
   * So a worktree whose repository you already trust in your own Codex config is trusted for the
   * run, and nothing else is. Trusting a repository you never trusted would also load whatever other
   * Codex settings it ships, and that is not a decision this engine gets to make for you.
   *
   * The same config is read for the MCP servers it names. Codex merges a task's `mcp_servers` into
   * the operator's, so a task server with one of their names becomes a mix of the two — the task's
   * command with the operator's args and env — or fails to load when the
   * transports differ. Such a task is refused here, at spawn, where the config is read as it is now.
   */
  prepare: (r) => {
    const config = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml');
    let toml: string;
    try {
      toml = fs.readFileSync(config, 'utf8');
    } catch {
      return {};
    }
    const operators = codexMcpServerNames(toml);
    const taken = Object.keys(r.config?.mcp ?? {}).filter((name) => operators.has(name));
    if (taken.length) {
      throw new Error(
        `${taken.map((n) => `\`mcp.${n}\``).join(', ')}: ${config} already has a server by that name, and Codex merges a task's server into the operator's — keeping the operator's args and env beside the task's — rather than replacing it. Give the task's server another name.`,
      );
    }
    const repo = repositoryOf(r.cwd);
    if (!repo) return {};
    return trustedProjects(toml).has(repo) ? { trustedDirs: [...new Set([repo, r.cwd])] } : {};
  },
};
