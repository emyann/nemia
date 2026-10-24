/**
 * Codex, through `codex exec`: the sandboxes and efforts it takes, the trust it is extended, and its spec.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { McpServer, SpawnRequest } from '../seam.ts';
import type { HarnessSpec } from '../detached/detached.ts';
import { CODEX_START, codexOutput, codexPartials } from './stream.ts';
import { CODEX_DEFAULT_SANDBOX, CODEX_EFFORTS, CODEX_SANDBOXES } from './vocabulary.ts';
import { codexRolloutEvents, codexRolloutFile } from './transcript.ts';
import { codexMcpServerNames, codexMcpServers, mcpRefuses, pickedCheckoutMcp } from '../mcp.ts';

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
const sandboxOf = (r: Pick<SpawnRequest, 'config'>): string => {
  if (r.config?.tools && !r.config?.tools.some((t) => WRITES.includes(t))) return 'read-only';
  const asked = r.config?.permissionMode === 'bypassPermissions' ? 'danger-full-access' : r.config?.permissionMode;
  return asked !== undefined && CODEX_SANDBOXES.includes(asked) ? asked : CODEX_DEFAULT_SANDBOX;
};

/**
 * Why Codex cannot hold a task's mounts — or `undefined`. Codex reads the whole disk in its `read-only` and `workspace-write`
 * sandboxes, so a read-only mount is held as it is and given no flag. It refuses a writable mount, which only `--add-dir` would
 * give and `exec resume` rejects after the id, and a read-only one in `danger-full-access`, which writes everywhere.
 */
const codexMountRefusal = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const mounts = task.config?.mounts ?? [];
  const writable = mounts.find((m) => !m.readOnly);
  if (writable) {
    return `\`mounts\` gives the session ${writable.path} writable, and Codex can write only its workspace: \`--add-dir\`, which would widen it, is rejected when a session is resumed. Mount the folder read-only, or file the task on Claude Code.`;
  }
  const held = mounts.find((m) => m.readOnly);
  if (held && sandboxOf(task) === 'danger-full-access') {
    return `\`mounts\` gives the session ${held.path} read-only, and Codex's \`danger-full-access\` sandbox writes everywhere. Name the \`workspace-write\` or \`read-only\` sandbox as \`permissionMode\`, or leave the mount off.`;
  }
  return undefined;
};

/** A session's servers as Codex's one `mcp_servers` override, or no argument when it has none. */
const codexMcpArgs = (mcp: Record<string, McpServer>): string[] =>
  Object.keys(mcp).length ? ['-c', `mcp_servers=${codexMcpServers(mcp)}`] : [];

/** Why Codex cannot connect to one of these servers, or `undefined`: an SSE server, which it has no transport for. */
const sseRefusal = (mcp: Record<string, McpServer> | undefined): string | undefined => {
  const sse = Object.entries(mcp ?? {}).find(([, s]) => 'url' in s && s.type === 'sse');
  return sse
    ? `\`mcp.${sse[0]}\` is an SSE server, and Codex connects only to stdio and streamable HTTP servers. Give \`type: "http"\` if the server speaks it, or leave the server off a Codex task.`
    : undefined;
};

/**
 * The entries a task's `checkoutMcp` picks from its checkout's `.mcp.json`, as servers Codex can be handed, or `undefined` for a
 * task that names none. Refused: an entry not in the shape a task's own `mcp` takes (`mcpRefuses`), which Codex's table cannot
 * say, and an SSE server.
 */
const codexPicked = (r: SpawnRequest): Record<string, McpServer> | undefined => {
  const names = r.config?.checkoutMcp;
  if (!names?.length) return undefined;
  const picked = pickedCheckoutMcp(r.cwd, names);
  const refused = mcpRefuses(picked) ?? sseRefusal(picked as Record<string, McpServer>);
  if (refused) throw new Error(`${refused} It is an entry of ${path.resolve(r.cwd, '.mcp.json')}, picked by \`checkoutMcp\`.`);
  return picked as Record<string, McpServer>;
};

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
 *    own `.codex/rules` load in a worktree. The directory is the task's `config.codex.trustFrom`, and the `cwd` beside
 *    it.
 * 9. `resume <id>`, last after every flag: its own usage is `[SESSION_ID] [PROMPT]`, and it rejects `-C`, `-s` and
 *    `--add-dir` after the id ("unexpected argument").
 * 10. The brief.
 *
 * A read-only mount (`config.mounts`) is given nothing: the sandbox reads the whole disk and writes only the workspace.
 *
 * It refuses what Codex would drop without a word: a deny or an allow list, as Codex has no tool list, only a sandbox; a
 * spend cap, as `codex exec` has none and its stream counts tokens, not dollars — its config's budgets are token
 * budgets; Claude Code's flags, as `codex exec` is another CLI. It reads what a session consumed from the same JSONL
 * (`codexOutput`: tokens from `turn.completed`, tool calls by item), each event it reads decoded by `CodexEventSchema` — a
 * line that does not decode leaves that session unread while it runs, and failed once it has ended — and the conversation from Codex's
 * own rollout of the thread rather than the stream: the rollout dates every record, and `exec --json` dates none. Its `start` is
 * the stream's `thread.started`, whose `thread_id` the worker reads as the session's id, which a resume and the rollout are found by.
 * Its worker keeps stdout apart (`streams`), so a session is followed live (`follow`): its state, then its rollout's events as Codex
 * writes them, each message whole (`codexPartials`), its stdout decoded as it comes.
 */
export const codex: HarnessSpec = {
  name: 'codex',
  codexArgs: true,
  checkoutMcp: true,
  env: true,
  mounts: { readOnly: true },
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
      ...(io?.closeoutFile && io.closeoutSchemaFile ? ['--output-schema', io.closeoutSchemaFile, '-o', io.closeoutFile] : []),
      ...(r.config?.effort ? ['-c', `model_reasoning_effort="${r.config?.effort}"`] : []),
      ...codexMcpArgs({ ...io?.pickedMcp, ...r.config?.mcp }),
      ...(io?.trustedDirs ?? []).flatMap((dir) => ['-c', `projects."${dir}".trust_level="trusted"`]),
      ...(r.resumeFrom ? ['resume', r.resumeFrom] : []),
      r.brief,
    ],
    ...(r.config?.env ? { env: r.config.env } : {}),
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
      return `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap in dollars, and \`codex exec\` has none: it takes no such flag, and reports no cost to cap. Leave \`budgetUsd\` off a Codex task, or file it on \`claude-detached\`, which ends a session at its cap.`;
    }
    if (task.config?.claude !== undefined) {
      return `\`claude: ${JSON.stringify(task.config.claude)}\` gives Claude Code flags of its own, and \`codex exec\` is not Claude Code. Leave \`claude\` off a Codex task, and say what the session must know in its brief.`;
    }
    const mounted = codexMountRefusal(task);
    if (mounted) return mounted;
    return sseRefusal(mcp);
  },
  readOutput: codexOutput,
  streams: true,
  partials: codexPartials,
  transcript: { file: codexRolloutFile, events: codexRolloutEvents },
  noChannel:
    '`codex exec` reads its prompt once and takes nothing while it runs: there is no channel into a running Codex session. Continue its thread with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.',
  start: CODEX_START,
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
   * The directory trust is extended from is the task's `config.codex.trustFrom`, and it decides
   * alone: trusted, it and the `cwd` are; not, nothing is. A task that names none is extended no trust.
   *
   * The same config is read for the MCP servers it names. Codex merges a task's `mcp_servers` into
   * the operator's, so a task server with one of their names becomes a mix of the two — the task's
   * command with the operator's args and env — or fails to load when the
   * transports differ. Such a task is refused here, at spawn, where the config is read as it is now.
   */
  prepare: (r) => {
    const pickedMcp = codexPicked(r);
    const picked = pickedMcp ? { pickedMcp } : {};
    const config = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'config.toml');
    let toml: string;
    try {
      toml = fs.readFileSync(config, 'utf8');
    } catch {
      return picked;
    }
    const operators = codexMcpServerNames(toml);
    const taken = Object.keys({ ...pickedMcp, ...r.config?.mcp }).filter((name) => operators.has(name));
    if (taken.length) {
      throw new Error(
        `${taken.map((n) => `\`mcp.${n}\``).join(', ')}: ${config} already has a server by that name, and Codex merges a task's server into the operator's — keeping the operator's args and env beside the task's — rather than replacing it. Give the task's server another name.`,
      );
    }
    const named = r.config?.codex?.trustFrom;
    if (named === undefined) return picked;
    const from = path.resolve(named);
    return trustedProjects(toml).has(from) ? { ...picked, trustedDirs: [...new Set([from, r.cwd])] } : picked;
  },
};
