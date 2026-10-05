import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { trustedFolder } from './trust.ts';
import { scratch } from '../../test/scratch.ts';

/** A `.claude.json` in a scratch folder holding `projects`, and its path. */
const configWith = (projects: unknown): string => {
  const file = path.join(scratch('ae-trust-'), '.claude.json');
  fs.writeFileSync(file, JSON.stringify({ projects }));
  return file;
};

test('a folder is trusted only by its own entry with the prompt accepted: never by a parent, a refusal, or a file that does not read', () => {
  const file = configWith({ '/srv/home': { hasTrustDialogAccepted: true }, '/srv/home/no': { hasTrustDialogAccepted: false } });
  assert.equal(trustedFolder('claude', '/srv/home', file), true);
  assert.equal(trustedFolder('claude', '/srv/home/x/..', file), true);
  assert.equal(trustedFolder('claude', '/srv/home/nemia', file), false);
  assert.equal(trustedFolder('claude', '/srv/home/no', file), false);
  assert.equal(trustedFolder('claude', '/srv/home', path.join(path.dirname(file), 'none.json')), false);
  const bad = configWith(null);
  fs.writeFileSync(bad, '{');
  assert.equal(trustedFolder('claude', '/srv/home', bad), false);
});

test('the file read is in CLAUDE_CONFIG_DIR when it is set, and a harness that keeps no trust answers undefined', () => {
  const file = configWith({ '/srv/home': { hasTrustDialogAccepted: true } });
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.dirname(file);
  try {
    assert.equal(trustedFolder('claude', '/srv/home'), true);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
  }
  assert.equal(trustedFolder('codex', '/srv/home', file), undefined);
});
