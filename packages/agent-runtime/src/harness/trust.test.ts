import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { folderTrust, trustFolder, trustedFolder } from './trust.ts';
import { claudeTrust } from './claude/trust.ts';
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

/** What `file` holds, parsed. */
const held = (file: string): { projects: Record<string, Record<string, unknown>> } & Record<string, unknown> =>
  JSON.parse(fs.readFileSync(file, 'utf8'));

/** The names beside `file`, itself included. */
const beside = (file: string): string[] => fs.readdirSync(path.dirname(file)).sort();

test('a folder nobody trusted is given the one key under its own path, and under its repository where one is named', () => {
  const file = configWith({});
  const given = trustFolder('claude', '/srv/plain/x/..', file);
  assert.equal(held(file).projects['/srv/plain'].hasTrustDialogAccepted, true);
  assert.deepEqual([given?.wrote, given?.trusted, given?.refused, given?.folder], [true, true, null, '/srv/plain']);
  assert.equal(given?.harness, 'Claude Code');
  assert.match(given?.back ?? '', /projects\["\/srv\/plain"\]\.hasTrustDialogAccepted to false in /);
  assert.ok(given?.back.endsWith(file));
  assert.match(given?.grants ?? '', /\/srv\/plain\/\.claude\/settings\.json/);

  const inside = trustFolder('claude', '/srv/repo/.worktrees/one', file, '/srv/repo');
  assert.equal(inside?.folder, '/srv/repo');
  assert.equal(held(file).projects['/srv/repo'].hasTrustDialogAccepted, true);
  assert.equal(held(file).projects['/srv/repo/.worktrees/one'], undefined);
  assert.equal(trustedFolder('claude', '/srv/repo/.worktrees/one', file, '/srv/repo'), true);
  assert.equal(trustedFolder('claude', '/srv/repo/.worktrees/one', file), false);
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('only the one key changes: other projects, the entry\'s other keys and the top-level keys read back equal', () => {
  const file = path.join(scratch('ae-trust-'), '.claude.json');
  const before = {
    numStartups: 12,
    oauthAccount: { emailAddress: 'a@b.c' },
    projects: {
      '/srv/other': { hasTrustDialogAccepted: true, allowedTools: ['Bash(ls)'] },
      '/srv/mine': { hasTrustDialogAccepted: false, lastCost: 1.5, history: [{ display: 'hi' }] },
    },
    tipsHistory: { a: 1 },
  };
  fs.writeFileSync(file, `${JSON.stringify(before, null, 2)}\n`, { mode: 0o600 });
  assert.equal(trustFolder('claude', '/srv/mine', file)?.wrote, true);
  const after = held(file);
  assert.equal(after.projects['/srv/mine'].hasTrustDialogAccepted, true);
  after.projects['/srv/mine'].hasTrustDialogAccepted = false;
  assert.deepEqual(after, before);
  assert.ok(fs.readFileSync(file, 'utf8').endsWith('}\n'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('a folder already trusted leaves the file byte for byte, and nothing beside it', () => {
  const file = configWith({ '/srv/home': { hasTrustDialogAccepted: true, x: 1 } });
  const bytes = fs.readFileSync(file);
  const given = trustFolder('claude', '/srv/home', file);
  assert.deepEqual([given?.wrote, given?.trusted, given?.refused], [false, true, null]);
  assert.ok(fs.readFileSync(file).equals(bytes));
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('a write that lands between the read and the replace is not lost', () => {
  const file = configWith({ '/srv/a': { hasTrustDialogAccepted: true } });
  let reads = 0;
  const read = (at: string): Buffer => {
    const bytes = fs.readFileSync(at);
    reads += 1;
    if (reads === 1) fs.writeFileSync(at, JSON.stringify({ projects: { ...held(at).projects, '/srv/session': { lastCost: 2 } } }));
    return bytes;
  };
  assert.deepEqual(claudeTrust('/srv/mine', file, read), { wrote: true, refused: null });
  assert.deepEqual(held(file).projects, {
    '/srv/a': { hasTrustDialogAccepted: true },
    '/srv/session': { lastCost: 2 },
    '/srv/mine': { hasTrustDialogAccepted: true },
  });
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('REFUSED: a file that changes under every write is left as its other writer last wrote it, and the answer says what to do', () => {
  const file = configWith({});
  let reads = 0;
  const read = (at: string): Buffer => {
    const bytes = fs.readFileSync(at);
    reads += 1;
    fs.writeFileSync(at, JSON.stringify({ projects: {}, n: reads }));
    return bytes;
  };
  const answer = claudeTrust('/srv/mine', file, read);
  assert.equal(answer.wrote, false);
  assert.match(answer.refused ?? '', /changed under each of 5 writes and was left as it is: ask again, or run Claude Code in \/srv\/mine once/);
  assert.deepEqual(held(file), { projects: {}, n: reads });
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('REFUSED: a file that does not read is left byte for byte; one that is not there is made holding the key alone', () => {
  for (const text of ['{', '[]', '{"projects":[]}', '{"projects":{"/srv/mine":"yes"}}']) {
    const file = configWith({});
    fs.writeFileSync(file, text);
    const given = trustFolder('claude', '/srv/mine', file);
    assert.deepEqual([given?.wrote, given?.trusted], [false, false], text);
    assert.match(given?.refused ?? '', /was left as it is, since .*: run Claude Code in \/srv\/mine once and accept its prompt/, text);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
    assert.deepEqual(beside(file), ['.claude.json']);
  }
  const none = path.join(scratch('ae-trust-'), 'deeper', '.claude.json');
  assert.equal(trustFolder('claude', '/srv/mine', none)?.wrote, true);
  assert.deepEqual(held(none), { projects: { '/srv/mine': { hasTrustDialogAccepted: true } } });
});

test('a link to the file is followed, never replaced', () => {
  const file = configWith({});
  const link = path.join(scratch('ae-trust-'), '.claude.json');
  fs.symlinkSync(file, link);
  assert.equal(trustFolder('claude', '/srv/mine', link)?.wrote, true);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(held(file).projects['/srv/mine'].hasTrustDialogAccepted, true);
});

test('the home directory is never given a trust, and the answer says why; a harness that keeps none is given nothing', () => {
  const file = path.join(scratch('ae-trust-'), '.claude.json');
  const home = trustFolder('claude', os.homedir(), file);
  assert.deepEqual([home?.wrote, home?.trusted], [false, false]);
  assert.match(home?.never ?? '', /keeps no trust of a home directory past one session: name a folder inside/);
  assert.equal(home?.refused, home?.never);
  assert.equal(folderTrust('claude', '/srv/mine', file)?.never, null);
  assert.equal(trustFolder('codex', '/srv/mine', file), undefined);
  assert.equal(folderTrust('codex', '/srv/mine', file), undefined);
  assert.equal(fs.existsSync(file), false);
});

test('with no file named, the one written is in CLAUDE_CONFIG_DIR', () => {
  const dir = scratch('ae-trust-');
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    assert.equal(trustFolder('claude-detached', '/srv/mine')?.file, path.join(dir, '.claude.json'));
    assert.equal(trustedFolder('claude', '/srv/mine'), true);
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
  }
  assert.equal(held(path.join(dir, '.claude.json')).projects['/srv/mine'].hasTrustDialogAccepted, true);
});
