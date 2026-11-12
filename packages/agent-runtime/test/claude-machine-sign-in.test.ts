/**
 * Claude Code's sign-in as a caller that is no session asks it (`claudeSignIn`, src/harness/claude/sign-in.ts), on a stub Claude Code
 * named by `AE_CLAUDE_EXECUTABLE`: `loggedIn: true` with exit 0 signed in, `loggedIn: false` signed out, an answer past the bound timed
 * out, and a Claude Code that does not start unknown. The bound is shortened here (the shipped one is `CLAUDE_SIGN_IN_MS`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { claudeSignIn } from '../src/index.ts';

/** The environment naming a Claude Code whose body is `script`. */
const stubbed = (script: string): NodeJS.ProcessEnv => {
  const bin = scratch('ae-claude-machine-');
  const claude = path.join(bin, 'claude');
  fs.writeFileSync(claude, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { PATH: '/usr/bin:/bin', AE_CLAUDE_EXECUTABLE: claude };
};

test('claudeSignIn: signed in, signed out, timed out past the bound, unknown where it does not start', () => {
  assert.equal(claudeSignIn(stubbed(`echo '{"loggedIn":true,"authMethod":"claude.ai"}'; exit 0`), 5_000), 'signed-in');
  assert.equal(claudeSignIn(stubbed(`echo '{"loggedIn":false,"authMethod":"none"}'; exit 1`), 5_000), 'signed-out');
  assert.equal(claudeSignIn(stubbed('exec sleep 5'), 300), 'timed-out');
  assert.equal(claudeSignIn({ AE_CLAUDE_EXECUTABLE: path.join(scratch('ae-claude-none-'), 'claude') }, 5_000), 'unknown');
});
