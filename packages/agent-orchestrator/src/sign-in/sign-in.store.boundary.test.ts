/**
 * The person's Claude token file on a scratch store: `nemia claude-token set` keeps what is piped in at mode 0600 and prints none of
 * it, `status` says it is set and its mode and never the token, `rm` removes it; the daemon's load sets `CLAUDE_CODE_OAUTH_TOKEN` only
 * where it is unset, and refuses a file another user can read, naming `chmod 600`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { scratch } from 'test-kit/scratch';
import { Invalid } from '../refusal/refusal.ts';
import { claudeTokenFile, claudeTokenStatus, loadClaudeToken, removeClaudeToken, writeClaudeToken } from './sign-in.store.ts';
import { CLAUDE_TOKEN_RM, CLAUDE_TOKEN_STATUS } from './sign-in.verb.ts';

const TOKEN = 'sk-ant-oat01-test-token-never-shown';
const BIN = path.join(import.meta.dirname, '..', '..', 'bin', 'nemia.ts');

/** `nemia <argv>` on the store `root` with `input` piped to it: its exit code and what it printed, waited on to its end. */
function nemia(root: string, argv: string[], input: string): Promise<{ code: number | null; out: string }> {
  const child = spawn(process.execPath, [BIN, ...argv], { env: { ...process.env, WF_ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.stdin.end(input);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, out }));
  });
}

const mode = (file: string): number => fs.statSync(file).mode & 0o777;

test('nemia claude-token set keeps the piped token at 0600 and never prints it; status says set and its mode, never the token', async () => {
  const root = scratch('wf-claude-token-');
  const set = await nemia(root, ['claude-token', 'set'], `${TOKEN}\n`);
  assert.equal(set.code, 0, set.out);
  assert.equal(set.out.includes(TOKEN), false, 'the token is not printed');
  const file = claudeTokenFile(root);
  assert.equal(fs.readFileSync(file, 'utf8').trim(), TOKEN);
  assert.equal(mode(file), 0o600);
  assert.deepEqual(
    fs.readdirSync(root).filter((f) => f.startsWith('.claude-token')),
    [],
    'no temporary file left',
  );
  const status = claudeTokenStatus(root);
  assert.deepEqual(status, { state: 'set', file, mode: '0600' });
  const lines = CLAUDE_TOKEN_STATUS.print(status, {}).join('\n');
  assert.ok(lines.includes('0600'), lines);
  assert.equal(lines.includes(TOKEN), false);
  const printed = await nemia(root, ['claude-token', 'status'], '');
  assert.equal(printed.code, 0, printed.out);
  assert.equal(printed.out.includes(TOKEN), false);
});

test('REFUSED: an empty token is not kept, exit 2', async () => {
  const root = scratch('wf-claude-token-empty-');
  const set = await nemia(root, ['claude-token', 'set'], '\n');
  assert.equal(set.code, 2, set.out);
  assert.equal(fs.existsSync(claudeTokenFile(root)), false);
});

test('the daemon loads the token where CLAUDE_CODE_OAUTH_TOKEN is unset, leaves one already set, and finds none with no file', () => {
  const root = scratch('wf-claude-token-load-');
  const none: Record<string, string | undefined> = { WF_ROOT: root };
  assert.equal(loadClaudeToken(none), 'none');
  assert.equal(none.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  writeClaudeToken(root, TOKEN);
  const unset: Record<string, string | undefined> = { WF_ROOT: root, CLAUDE_CODE_OAUTH_TOKEN: '' };
  assert.equal(loadClaudeToken(unset), 'loaded');
  assert.equal(unset.CLAUDE_CODE_OAUTH_TOKEN, TOKEN);
  const given: Record<string, string | undefined> = { WF_ROOT: root, CLAUDE_CODE_OAUTH_TOKEN: 'the-one-set' };
  assert.equal(loadClaudeToken(given), 'given');
  assert.equal(given.CLAUDE_CODE_OAUTH_TOKEN, 'the-one-set');
});

test('REFUSED: a token file of mode 0644 is not loaded, exit 2, naming chmod 600 and the file', () => {
  const root = scratch('wf-claude-token-open-');
  const file = writeClaudeToken(root, TOKEN);
  fs.chmodSync(file, 0o644);
  const env: Record<string, string | undefined> = { WF_ROOT: root };
  assert.throws(
    () => loadClaudeToken(env),
    (err: unknown) => err instanceof Invalid && err.exitCode === 2 && err.message.includes(`chmod 600 ${file}`),
  );
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined, 'nothing set');
  assert.ok(CLAUDE_TOKEN_STATUS.print(claudeTokenStatus(root), {}).join('\n').includes(`chmod 600 ${file}`));
});

test('nemia claude-token rm removes the file, and says when there was none', () => {
  const root = scratch('wf-claude-token-rm-');
  writeClaudeToken(root, TOKEN);
  assert.equal(removeClaudeToken(root), true);
  assert.equal(claudeTokenStatus(root).state, 'unset');
  assert.equal(removeClaudeToken(root), false);
  assert.match(CLAUDE_TOKEN_RM.print({ removed: false, file: claudeTokenFile(root) }, {}).join('\n'), /nothing to remove/);
});
