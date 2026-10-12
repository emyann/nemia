/**
 * The real shape of Claude Code's `.claude.json`, walked: the text that sets one folder's trust (`claudeTrustText`) is run over this
 * machine's own file, read into memory, and must parse equal to it but for the one key. The function is handed text and writes nothing; a machine with no
 * such file skips the walk by name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeTrustText } from '../src/harness/claude/trust.ts';

/** This machine's own file, whatever `CLAUDE_CONFIG_DIR` a test seat set. */
const REAL = path.join(os.homedir(), '.claude.json');

/** A path no machine has a project at. */
const KEY = '/no-such-folder/trust-file-walk';

test("the real file's text with one folder trusted parses equal but for that key", (t) => {
  if (!fs.existsSync(REAL)) return t.skip(`no ${REAL} on this machine`);
  const bytes = fs.readFileSync(REAL);
  const next = claudeTrustText(bytes.toString('utf8'), KEY);
  assert.ok('text' in next, `the real file does not read: ${JSON.stringify(next)}`);
  const [was, now] = [JSON.parse(bytes.toString('utf8')), JSON.parse(next.text)];
  assert.deepEqual(now.projects[KEY], { hasTrustDialogAccepted: true });
  delete now.projects[KEY];
  if (was.projects === undefined) delete now.projects;
  assert.deepEqual(now, was);
});
