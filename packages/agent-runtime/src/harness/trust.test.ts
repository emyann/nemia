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

/** `body` run with `CLAUDE_CONFIG_DIR` set to `dir`, and the variable put back as it was. */
const inConfigDir = <T>(dir: string, body: () => T): T => {
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = before;
  }
};

/** The file of the trustedFolder rows: one folder trusted, one refused. */
const TRUSTED = (): string =>
  configWith({ '/srv/home': { hasTrustDialogAccepted: true }, '/srv/home/no': { hasTrustDialogAccepted: false } });

test('trustedFolder: a folder is trusted only by its own entry with the prompt accepted, in the file its harness reads', async (t) => {
  const rows: { name: string; check: () => void }[] = [
    { name: 'its own entry, the prompt accepted', check: () => assert.equal(trustedFolder('claude', '/srv/home', TRUSTED()), true) },
    { name: 'a path that comes back to it', check: () => assert.equal(trustedFolder('claude', '/srv/home/x/..', TRUSTED()), true) },
    { name: 'never by a parent', check: () => assert.equal(trustedFolder('claude', '/srv/home/nemia', TRUSTED()), false) },
    { name: 'never by a refusal', check: () => assert.equal(trustedFolder('claude', '/srv/home/no', TRUSTED()), false) },
    {
      name: 'never by a file that is not there',
      check: () => assert.equal(trustedFolder('claude', '/srv/home', path.join(path.dirname(TRUSTED()), 'none.json')), false),
    },
    {
      name: 'never by a file that does not read',
      check: () => {
        const bad = TRUSTED();
        fs.writeFileSync(bad, '{');
        assert.equal(trustedFolder('claude', '/srv/home', bad), false);
      },
    },
    {
      name: 'the file read is in CLAUDE_CONFIG_DIR when it is set',
      check: () => {
        const file = configWith({ '/srv/home': { hasTrustDialogAccepted: true } });
        assert.equal(
          inConfigDir(path.dirname(file), () => trustedFolder('claude', '/srv/home')),
          true,
        );
      },
    },
    {
      name: 'a harness that keeps no trust answers undefined',
      check: () => assert.equal(trustedFolder('codex', '/srv/home', TRUSTED()), undefined),
    },
  ];
  for (const row of rows) await t.test(row.name, row.check);
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

test("only the one key changes: other projects, the entry's other keys and the top-level keys read back equal", () => {
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

test('trustFolder: what a folder is given, what a file that cannot take the key is left as, and what is never given', async (t) => {
  const rows: { name: string; check: () => void }[] = [
    {
      name: 'a folder already trusted leaves the file byte for byte, and nothing beside it',
      check: () => {
        const file = configWith({ '/srv/home': { hasTrustDialogAccepted: true, x: 1 } });
        const bytes = fs.readFileSync(file);
        const given = trustFolder('claude', '/srv/home', file);
        assert.deepEqual([given?.wrote, given?.trusted, given?.refused], [false, true, null]);
        assert.ok(fs.readFileSync(file).equals(bytes));
        assert.deepEqual(beside(file), ['.claude.json']);
      },
    },
    ...['{', '[]', '{"projects":[]}', '{"projects":{"/srv/mine":"yes"}}'].map((text) => ({
      name: `REFUSED: a file that does not read is left byte for byte: ${text}`,
      check: () => {
        const file = configWith({});
        fs.writeFileSync(file, text);
        const given = trustFolder('claude', '/srv/mine', file);
        assert.deepEqual([given?.wrote, given?.trusted], [false, false]);
        assert.match(given?.refused ?? '', /was left as it is/);
        assert.match(given?.refused ?? '', /run Claude Code in \/srv\/mine once/);
        assert.equal(fs.readFileSync(file, 'utf8'), text);
        assert.deepEqual(beside(file), ['.claude.json']);
      },
    })),
    {
      name: 'a file that is not there is made holding the key alone',
      check: () => {
        const none = path.join(scratch('ae-trust-'), 'deeper', '.claude.json');
        assert.equal(trustFolder('claude', '/srv/mine', none)?.wrote, true);
        assert.deepEqual(held(none), { projects: { '/srv/mine': { hasTrustDialogAccepted: true } } });
      },
    },
    {
      name: 'the home directory is never given a trust, and the answer says why',
      check: () => {
        const file = path.join(scratch('ae-trust-'), '.claude.json');
        const home = trustFolder('claude', os.homedir(), file);
        assert.deepEqual([home?.wrote, home?.trusted], [false, false]);
        assert.match(home?.never ?? '', /home directory/);
        assert.match(home?.never ?? '', /name a folder inside/);
        assert.equal(home?.refused, home?.never);
        assert.equal(folderTrust('claude', '/srv/mine', file)?.never, null);
        assert.equal(fs.existsSync(file), false);
      },
    },
    {
      name: 'a harness that keeps no trust is given nothing',
      check: () => {
        const file = path.join(scratch('ae-trust-'), '.claude.json');
        assert.equal(trustFolder('codex', '/srv/mine', file), undefined);
        assert.equal(folderTrust('codex', '/srv/mine', file), undefined);
        assert.equal(fs.existsSync(file), false);
      },
    },
    {
      name: 'with no file named, the one written is in CLAUDE_CONFIG_DIR',
      check: () => {
        const dir = scratch('ae-trust-');
        inConfigDir(dir, () => {
          assert.equal(trustFolder('claude-detached', '/srv/mine')?.file, path.join(dir, '.claude.json'));
          assert.equal(trustedFolder('claude', '/srv/mine'), true);
        });
        assert.equal(held(path.join(dir, '.claude.json')).projects['/srv/mine'].hasTrustDialogAccepted, true);
      },
    },
  ];
  for (const row of rows) await t.test(row.name, row.check);
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
  assert.match(answer.refused ?? '', /changed under each of 5 writes/);
  assert.match(answer.refused ?? '', /run Claude Code in \/srv\/mine once/);
  assert.deepEqual(held(file), { projects: {}, n: reads });
  assert.deepEqual(beside(file), ['.claude.json']);
});

test('a link to the file is followed, never replaced', () => {
  const file = configWith({});
  const link = path.join(scratch('ae-trust-'), '.claude.json');
  fs.symlinkSync(file, link);
  assert.equal(trustFolder('claude', '/srv/mine', link)?.wrote, true);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(held(file).projects['/srv/mine'].hasTrustDialogAccepted, true);
});
