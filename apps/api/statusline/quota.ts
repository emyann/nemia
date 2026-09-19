/**
 * Claude Code's statusline command, and the one writer of `$WF_ROOT/quota.json`: what the subscription has used of its limits, as the
 * session that runs it last heard, for the api to read (`src/quota.ts`) and the Factory to show.
 *
 * Claude Code runs it in an interactive session's terminal, after each answer and on its own events, with a JSON payload on stdin
 * (verified against Claude Code 2.1.278; packages/agent-workflows/docs/features.md, *the quota on the board*). Its `rate_limits` are
 * `five_hour` and `seven_day`, each `{ used_percentage, resets_at }` with `resets_at` in Unix seconds, and, behind a gateway, `spend_limit`;
 * absent for an API-key session, before a session's first answer, and for a window whose reset has passed. The script:
 *
 *  1. runs the command given after it, if any — a person's own statusline, wrapped — with the same stdin, and prints its output first;
 *  2. writes `{ written_at, claude_code_version, rate_limits, heard }` to `$WF_ROOT/quota.json` (`~/.agent-workflows` without it, as the
 *     package finds its store), through a hidden file beside it renamed over it, so a reader never reads half of it. `rate_limits` is
 *     Claude Code's object as it came, or null when a session that has had an answer has none. It writes only numbers just heard, so that
 *     `written_at` is when they were: Claude Code runs a statusline on events that are no answer too — a repaint, a resize, and of its own
 *     accord at a window's reset, where it drops the window gone by and repeats the week as it last heard it, hours ago perhaps. So it
 *     writes nothing
 *       - before a session's first answer, which would say no limits over the last reading;
 *       - when the session has had no answer since it last wrote: `heard` keeps, for the last sessions to write, their
 *         `cost.total_api_duration_ms`, which moves with each answer and with nothing else. An idle session's repaint neither stamps its
 *         old numbers as new nor puts them over a busier session's newer ones;
 *       - of no limits over a reading that has them: a subscriber's session has limits after every answer, so a session without them is
 *         another sign-in (an API key), and says nothing of the subscription's;
 *  3. prints a line of its own: `5h 38% · 7d 71% · resets 16:40`, the nearer reset in this machine's time.
 *
 * It must never fail a session: any error of its own prints nothing of its own and exits 0. Node only, no dependency: Claude Code runs it,
 * no package imports it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Whatever escapes what follows — a stdout closed under the write among it — ends the script quietly.
process.on('uncaughtException', () => process.exit(0));

/** How long a wrapped statusline may take before its output is given up on. */
const WRAPPED_MS = 3_000;

/** How many sessions' last answers `heard` keeps: more than a person has open at once. */
const SESSIONS_KEPT = 32;

type Window = { used_percentage?: unknown; resets_at?: unknown };
type Payload = {
  session_id?: unknown;
  version?: unknown;
  rate_limits?: Record<string, Window> | null;
  context_window?: { current_usage?: unknown };
  cost?: { total_api_duration_ms?: unknown };
};
type Written = { rate_limits?: unknown; heard?: unknown };

/** The wrapped command's output, or nothing when there is none, it failed to start, or it took too long. */
function wrapped(command: string, input: string): string {
  if (!command.trim()) return '';
  try {
    const run = spawnSync(command, { input, shell: true, encoding: 'utf8', timeout: WRAPPED_MS, stdio: ['pipe', 'pipe', 'ignore'] });
    return (run.stdout ?? '').replace(/\n+$/, '');
  } catch {
    return '';
  }
}

/** Where the package keeps its store: `$WF_ROOT`, or `~/.agent-workflows`. */
const store = (): string => process.env.WF_ROOT || path.join(os.homedir(), '.agent-workflows');

/** What the script last wrote, or null when there is nothing it can read. */
function previous(file: string): Written | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Written) : null;
  } catch {
    return null;
  }
}

/** Write the quota part of the payload when it is news: see 2. above. */
function record(payload: Payload): void {
  const limits = payload.rate_limits && typeof payload.rate_limits === 'object' ? payload.rate_limits : null;
  if (!limits && !payload.context_window?.current_usage) return;
  const root = store();
  const file = path.join(root, 'quota.json');
  const last = previous(file);
  const session = typeof payload.session_id === 'string' ? payload.session_id : '';
  const answered = payload.cost?.total_api_duration_ms;
  const heard: Record<string, unknown> = last?.heard && typeof last.heard === 'object' ? { ...last.heard } : {};
  // Without the counter — another version's payload — every run is taken as news, as before there was one.
  if (typeof answered === 'number' && heard[session] === answered) return;
  if (!limits && last?.rate_limits && typeof last.rate_limits === 'object') return;
  delete heard[session];
  if (typeof answered === 'number') heard[session] = answered;
  const kept = Object.entries(heard).slice(-SESSIONS_KEPT);
  fs.mkdirSync(root, { recursive: true });
  const hidden = path.join(root, `.quota.json.${process.pid}`);
  const text = JSON.stringify({
    written_at: new Date().toISOString(),
    claude_code_version: typeof payload.version === 'string' ? payload.version : null,
    rate_limits: limits,
    heard: Object.fromEntries(kept),
  }, null, 2);
  try {
    fs.writeFileSync(hidden, `${text}\n`);
    fs.renameSync(hidden, file);
  } catch (err) {
    fs.rmSync(hidden, { force: true });
    throw err;
  }
}

/** `16:40` today, `Tue 09:00` on another day, in this machine's time zone. */
function when(at: Date, now: Date): string {
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

/** `5h 38% · 7d 71% · resets 16:40`, or nothing without a window to show. */
function line(limits: Record<string, Window> | null | undefined, now: Date): string {
  if (!limits) return '';
  const parts: string[] = [];
  const resets: number[] = [];
  for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d']] as const) {
    const w = limits[key];
    if (!w || typeof w.used_percentage !== 'number') continue;
    parts.push(`${label} ${Math.round(w.used_percentage)}%`);
    if (typeof w.resets_at === 'number' && w.resets_at * 1000 > now.getTime()) resets.push(w.resets_at * 1000);
  }
  if (!parts.length) return '';
  if (resets.length) parts.push(`resets ${when(new Date(Math.min(...resets)), now)}`);
  return parts.join(' · ');
}

let input = '';
try {
  input = fs.readFileSync(0, 'utf8');
} catch { /* no stdin: nothing to wrap or record */ }
const theirs = wrapped(process.argv.slice(2).join(' '), input);
let ours = '';
try {
  const payload = JSON.parse(input) as Payload;
  record(payload);
  ours = line(payload.rate_limits, new Date());
} catch {
  ours = '';
}
const out = [theirs, ours].filter(Boolean).join('\n');
if (out) process.stdout.write(`${out}\n`);
process.exitCode = 0;
