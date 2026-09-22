/**
 * Saying words into a running Claude Code session: the line its inbox reads, what cannot be said, where a session's
 * inbox is, and the post itself — and finding a running session by its name, from the registration Claude Code writes
 * for it, which is where its inbox is named.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * The longest line Claude Code's inbox reads, in characters. A longer one drops the connection and
 * delivers nothing, and says so to nobody (`Ftt` in 2.1.270's inbox), so `say` refuses it first.
 */
export const CLAUDE_INBOX_LINE_MAX = 1_048_576;

/**
 * The one line a person's words are posted as, to a session's inbox: a `user` message, as Claude Code's
 * own inbox documents it, naming the session it is for. The inbox drops a line whose `session_id` is not
 * its session's, so a socket that has passed to another session since it was observed hears nothing.
 */
export const claudeInboxLine = (sessionId: string, text: string): string =>
  `${JSON.stringify({ type: 'user', session_id: sessionId, message: { role: 'user', content: text } })}\n`;

/**
 * What cannot be said to a Claude Code task's session, as a sentence that says what to do instead — or `undefined`.
 *
 * `bypassPermissions`: Claude Code holds a message from outside for a person to approve when the session it
 * reaches bypasses permission prompts, and a background session nobody has attached to keeps that approval
 * open for ever (the cross-session messaging docs, and 2.1.270's inbound gate). Words sent there reach nobody.
 */
export const claudeSayRefuses = (task: { permissionMode?: string }, text: string): string | undefined => {
  if (task.permissionMode === 'bypassPermissions') {
    return "the task runs in `permissionMode: bypassPermissions`, and Claude Code holds a message sent into such a session for a person to approve — in a background session nobody has attached to, for ever. Nothing said would reach it. Continue its session with a new task that carries the words (`resumeFrom`), as `wf retry --message` does.";
  }
  const length = claudeInboxLine('00000000-0000-0000-0000-000000000000', text).length;
  if (length > CLAUDE_INBOX_LINE_MAX) {
    return `\`text\` makes a line of ${length} characters, and Claude Code's inbox drops a line over ${CLAUDE_INBOX_LINE_MAX} without delivering it. Say less: put the rest in a file, and name the file.`;
  }
  return undefined;
};

/**
 * A running session's inbox, as Claude Code registered it: `<sessions>/<pid>.json`, whose
 * `messagingSocketPath` is the socket it listens on. The pid is the one `claude agents` lists for the
 * session. Refused rather than guessed — the path is the process's, and a pid outlives nothing:
 *
 * - a registration that is not a file this user owns, or that is now another session's;
 * - no absolute `messagingSocketPath`: the session runs without an inbox (Claude Code could not set one up);
 * - a path that is not a socket — a symlink, or anything else put in its place — or one this user does not
 *   own. Claude Code refuses the same before it sends, and so does this.
 *
 * `uid` is who "this user" is: the process's own, passed only by a test, which cannot make a file another's.
 */
export const claudeInbox = async (sessionsDir: string, pid: number, sessionId: string, uid = process.getuid?.()): Promise<string> => {
  const file = path.join(sessionsDir, `${pid}.json`);
  let registration: { sessionId?: unknown; messagingSocketPath?: unknown };
  try {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || (uid !== undefined && stat.uid !== uid)) throw new Error('not a file of yours');
    registration = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (e) {
    throw new Error(`the session's registration, ${file}, cannot be read (${e instanceof Error ? e.message : String(e)}): it has exited, or runs somewhere this process cannot see.`);
  }
  if (registration?.sessionId !== sessionId) {
    throw new Error(`pid ${pid} is registered to ${String(registration?.sessionId)} now, not ${sessionId}: the session has exited.`);
  }
  const socket = registration.messagingSocketPath;
  if (typeof socket !== 'string' || !path.isAbsolute(socket)) {
    throw new Error(`session ${sessionId} has no inbox (its registration names no socket): Claude Code could not set one up for it, and \`/status\` in the session says why.`);
  }
  let stat: fs.Stats;
  try { stat = await fs.promises.lstat(socket); } catch (e) {
    throw new Error(`session ${sessionId}'s inbox, ${socket}, is not there (${e instanceof Error ? e.message : String(e)}): it has exited.`);
  }
  const refused = inboxSocketRefuses(socket, stat, uid);
  if (refused) throw new Error(refused);
  return socket;
};

/**
 * Why a session's inbox is not a socket to send to, as a sentence — or `undefined`: a path that is not a socket
 * (`lstat` does not follow a symlink, so a link to a real socket is refused too), or one another user owns. Given
 * what `lstat` said and who "this user" is, and pure, so a test can hand it a socket of another user's, which no
 * test can make without root.
 */
export const inboxSocketRefuses = (socket: string, stat: { isSocket(): boolean; uid: number }, uid: number | undefined): string | undefined => {
  if (!stat.isSocket()) return `${socket} is not a socket — a symlink, or something else in its place. Refusing to send.`;
  if (uid !== undefined && stat.uid !== uid) return `${socket} is owned by uid ${stat.uid}, not by you. Refusing to send.`;
  return undefined;
};

/** Whether a process runs under `pid` that this one may signal. One another user's process holds (EPERM) counts as none. */
const signalable = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

/**
 * When a process started, as `/proc/<pid>/stat` counts it (its 22nd field): what Claude Code writes in a session's
 * registration as `procStart` (measured on the live `--bg` sessions of 2.1.271). `undefined` where there is no `/proc`.
 */
export const processStart = (pid: number): string | undefined => {
  let stat: string;
  try { stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { return undefined; }
  // The second field is the command's name in parentheses, which may hold spaces and parentheses: count from the last.
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
};

/**
 * The running background session Claude Code has registered under `name` — from `<sessionsDir>/<pid>.json`, which the
 * session writes for itself (`pid`, `sessionId`, `name`, `kind`) and `say` reads an inbox from — or `undefined`. A few
 * milliseconds, where `claude agents --json` takes a third of a second (2.1.271).
 *
 * Which session it is, and nothing of its state: the file does not say whether a session is working, idle or blocked,
 * and that stays the registry's. And a running session only, because a registration outlives its process (18 of the
 * 21 on the machine this was written on had none). So a file is taken only when:
 *
 * - it is a file this user owns, named for the `pid` it holds, of a `bg` session: an interactive one is never ours;
 * - a process this user may signal runs under that pid;
 * - where the system says when a process started (`/proc`), it started when the registration says (`procStart`): a pid
 *   another process has taken since is not the session. Without `/proc` (macOS) that check is not made.
 *
 * `uid` is who "this user" is, and `startOf` when a process started: both passed only by a test.
 */
export const claudeRegistered = async (
  sessionsDir: string,
  name: string,
  { uid = process.getuid?.(), startOf = processStart }: { uid?: number; startOf?: (pid: number) => string | undefined } = {},
): Promise<{ sessionId: string; pid: number } | undefined> => {
  let files: string[];
  try { files = await fs.promises.readdir(sessionsDir); } catch { return undefined; }
  for (const f of files) {
    const pid = Number(/^([1-9]\d*)\.json$/.exec(f)?.[1]);
    if (!pid) continue;
    let r: { pid?: unknown; sessionId?: unknown; name?: unknown; kind?: unknown; procStart?: unknown } | null;
    try {
      const file = path.join(sessionsDir, f);
      const stat = await fs.promises.lstat(file);
      if (!stat.isFile() || (uid !== undefined && stat.uid !== uid)) continue;
      r = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch { continue; } // gone since the directory was read, or read mid-write: not found this time
    if (r?.name !== name || r.kind !== 'bg' || r.pid !== pid || typeof r.sessionId !== 'string' || !r.sessionId) continue;
    if (!signalable(pid)) continue;
    const started = startOf(pid);
    if (started !== undefined && String(r.procStart) !== started) continue;
    return { sessionId: r.sessionId, pid };
  }
  return undefined;
};

/** How long a post to a session's inbox may take. The inbox answers nothing, so this bounds a connection that hangs. */
const SAY_TIMEOUT_MS = 5_000;

/**
 * One line, written to a session's inbox socket and the connection ended.
 *
 * Resolves once the whole line is written: from then on it is in the socket's queue, and Claude Code reads it
 * when its loop comes back to the connection. So an inbox slow to close its end — a process busy past the
 * deadline — has still been given the words, and this says so, rather than reporting words it handed over as
 * words it did not (found in review). Rejects when the line was not all written: the connection refused or
 * reset, or still being written at the deadline. An inbox drops a line cut short, so then nothing was given.
 */
export const claudeInboxPost = (socket: string, line: string, timeoutMs = SAY_TIMEOUT_MS) => new Promise<void>((resolve, reject) => {
  let written = false;
  let done = false;
  const finish = (error?: Error) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (error) reject(error); else resolve();
  };
  const c = net.createConnection({ path: socket });
  const timer = setTimeout(() => {
    c.destroy();
    finish(written ? undefined : new Error(`${socket} took only part of the line within ${timeoutMs} ms, and an inbox drops a line cut short`));
  }, timeoutMs);
  c.on('connect', () => c.end(line, () => { written = true; }));
  c.on('data', () => { /* the inbox answers nothing; anything it did say is not ours to read */ });
  c.on('error', (e) => finish(e));
  c.on('close', () => finish(written ? undefined : new Error(`${socket} closed the connection before the words were written`)));
});
