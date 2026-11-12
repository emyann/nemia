/**
 * Codex's sign-in as the runtime reads it (`codexSignIn`, src/harness/codex/codex.ts), on a stub `codex` first on PATH: exit 0 is
 * signed in, any other exit signed out with the last line Codex printed, an answer past the bound and a `codex` that is not there
 * unknown. The bound is shortened here (the shipped one is `CODEX_SIGN_IN_MS`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { codexSignIn } from '../src/index.ts';

/** A folder holding a `codex` whose body is `script`, and the environment that finds it first. */
const stubbed = (script: string): NodeJS.ProcessEnv => {
  const bin = scratch('ae-codex-sign-in-');
  fs.writeFileSync(path.join(bin, 'codex'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { PATH: `${bin}:/usr/bin:/bin` };
};

test('codexSignIn: signed in, signed out with its last line, unknown past the bound or with no codex', () => {
  assert.deepEqual(codexSignIn(stubbed('echo "Logged in using ChatGPT"; exit 0'), 5_000), { state: 'signed-in' });
  assert.deepEqual(codexSignIn(stubbed('echo "Not logged in" >&2; exit 1'), 5_000), {
    state: 'signed-out',
    said: 'Not logged in',
    code: 1,
  });
  assert.deepEqual(codexSignIn(stubbed('exec sleep 5'), 300), { state: 'unknown' });
  assert.deepEqual(codexSignIn({ PATH: scratch('ae-codex-none-') }, 5_000), { state: 'unknown' });
});
