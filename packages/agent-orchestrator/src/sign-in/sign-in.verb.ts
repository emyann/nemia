/**
 * `nemia <TOKEN_NAME> set`, `status` and `rm`, entries of the command table: the person's sign-in token file (`sign-in.store.ts`).
 * `set` reads the token off stdin — at a terminal without showing it as it is typed, else whatever is piped in — and never prints it;
 * `status` says whether one is kept, its file's mode and its age, warning of one near or past its year, never the token. Served on
 * the CLI alone, where the store's machine is, and out of an agent's reach (class `none`) but for the status, which reads no token.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { awaited, tried } from '../runtime-client.ts';
import {
  claudeTokenStatus,
  removeClaudeToken,
  TOKEN_MAKER,
  TOKEN_NAME,
  TOKEN_VARIABLE,
  tokenAgeWords,
  tokenWarningLine,
  writeClaudeToken,
  type ClaudeTokenStatus,
} from './sign-in.store.ts';

/** Why the sign-in token's commands are served on the CLI alone. */
const CLI_ONLY = {
  side: 'cli',
  why: "the token is the person's own, kept on the machine the store is on and read there from the terminal; no caller of the port reads or writes it",
} as const;

/** The character a terminal sends for Ctrl-C, which stops the hidden read, and the two it sends to erase one. */
const STOP = '\u0003';
const ERASE = ['\u007f', '\b'];

/** A line read off the terminal, not shown as it is typed: the terminal in raw mode until Enter, Ctrl-C refusing (`Invalid`). */
function hiddenLine(prompt: string): Promise<string> {
  const input = process.stdin;
  return new Promise((resolve, reject) => {
    let line = '';
    const done = (err?: Invalid) => {
      input.off('data', typed);
      input.setRawMode(false);
      input.pause();
      process.stderr.write('\n');
      if (err) reject(err);
      else resolve(line);
    };
    const typed = (chunk: Buffer | string) => {
      for (const ch of chunk.toString()) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === STOP) return done(new Invalid({ message: `nemia ${TOKEN_NAME} set: stopped, and nothing was written: run it again.` }));
        line = ERASE.includes(ch) ? line.slice(0, -1) : line + ch;
      }
    };
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.on('data', typed);
    input.resume();
  });
}

/** Everything piped into stdin. */
async function piped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

/** The token as the person gives it: typed hidden at a terminal, else piped in. */
const tokenGiven = (): Promise<string> =>
  process.stdin.isTTY ? hiddenLine(`the token ${TOKEN_MAKER} printed (it is not shown as you type): `) : piped();

/** What `set` did: the file it wrote. */
export type ClaudeTokenSet = { readonly file: string };

/** `nemia <TOKEN_NAME> set`: the token read off stdin and kept, mode 0600. */
export const CLAUDE_TOKEN_SET: Command<ClaudeTokenSet> = {
  name: `${TOKEN_NAME} set`,
  usage: '',
  help: [
    `keep your subscription token, the one ${TOKEN_MAKER} prints, in the`,
    `store's ${TOKEN_NAME} file, readable by you alone (0600): typed at the`,
    `terminal without being shown, or piped in (nemia ${TOKEN_NAME} set <`,
    `token.txt). The daemon loads it into ${TOKEN_VARIABLE} where that`,
    'is unset, at its next start: nemia service restart. Never printed',
  ],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia ${TOKEN_NAME} set takes nothing, not ${arg}: nemia ${TOKEN_NAME} set < token.txt.`,
  },
  writes: true,
  class: 'none',
  only: CLI_ONLY,
  handler: () =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.flatMap(awaited(tokenGiven), (token) => tried(() => ({ file: writeClaudeToken(home, token) }))),
    ),
  print: ({ file }) => [`kept your token in ${file} (0600): the daemon loads it at its next start (nemia service restart)`],
};

/**
 * `nemia <TOKEN_NAME> status`: whether a token is kept, its file and mode, when it was set and the days left of its year, and the warning
 * of one near or past it (`tokenWarningLine`); never the token.
 */
export const CLAUDE_TOKEN_STATUS: Command<ClaudeTokenStatus> = {
  name: `${TOKEN_NAME} status`,
  usage: '',
  help: [
    'whether your subscription token is kept, its file and its mode, when it',
    'was set and the days left of its year, warned of a month before it ends:',
    'never the token',
  ],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia ${TOKEN_NAME} status takes nothing, not ${arg}: nemia ${TOKEN_NAME} status.`,
  },
  writes: false,
  class: 'read',
  only: CLI_ONLY,
  handler: () => Effect.flatMap(StoreRoot, (home) => tried(() => claudeTokenStatus(home))),
  print: (status) =>
    status.state === 'set'
      ? [
          `token: set, in ${status.file} (mode ${status.mode ?? 'unread'})`,
          ...(tokenAgeWords(status) === undefined ? [] : [`${tokenAgeWords(status)} (the file's write time)`]),
          ...(status.mode === '0600' ? [] : [`it is readable by more than you, and the daemon refuses it: chmod 600 ${status.file}`]),
          ...(tokenWarningLine(status) === undefined ? [] : [`warning: ${tokenWarningLine(status)}`]),
        ]
      : [`token: not set (${status.file}); nemia ${TOKEN_NAME} set keeps the one ${TOKEN_MAKER} prints`],
};

/** What `rm` did: whether a token was kept, and its file. */
export type ClaudeTokenRemoved = { readonly removed: boolean; readonly file: string };

/** `nemia <TOKEN_NAME> rm`: the token file removed. */
export const CLAUDE_TOKEN_RM: Command<ClaudeTokenRemoved> = {
  name: `${TOKEN_NAME} rm`,
  usage: '',
  help: ['remove your subscription token file; the daemon keeps the token it', 'loaded until its next start'],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia ${TOKEN_NAME} rm takes nothing, not ${arg}: nemia ${TOKEN_NAME} rm.`,
  },
  writes: true,
  class: 'none',
  only: CLI_ONLY,
  handler: () =>
    Effect.flatMap(StoreRoot, (home) => tried(() => ({ removed: removeClaudeToken(home), file: claudeTokenStatus(home).file }))),
  print: ({ removed, file }) => [
    removed
      ? `removed ${file}: the daemon keeps the token it loaded until its next start`
      : `no token is kept (${file}): nothing to remove`,
  ],
};

/** The sign-in token's commands, in the order `nemia`'s help lists them. */
export const CLAUDE_TOKEN_COMMANDS: readonly Command[] = [CLAUDE_TOKEN_SET, CLAUDE_TOKEN_STATUS, CLAUDE_TOKEN_RM];
