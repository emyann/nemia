/**
 * `nemia start` on a folder that still writes a list under its former name — `disallow:`, `allow:` — starts the run, and says which lines
 * to rename. The parsing and the frozen records are held in `workflow.test.ts` and `store.test.ts`; this is what a person is told.
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.ts';
import { promised } from './promised.ts';

const ROOT = scratch('wf-former-keys-');
process.env.WF_ROOT = ROOT;
const { readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');

type Mock = { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } };

/** What `main` printed on stdout, a line each. `nemia start` files nothing, so it asks the engine nothing. */
const printedBy = async (t: Mock, argv: string[]): Promise<string[]> => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    out.push(args.join(' '));
  });
  try {
    await main(argv, promised({}));
  } finally {
    log.mock.restore();
  }
  return out;
};

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return repo;
};

/** `<root>/team`, a workflow whose `write` step names the agent `writer`, and `<root>/agents/writer.md`: each with the lines given. */
const team = (write: string, writer: string): string => {
  const root = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.mkdirSync(path.join(root, 'team'));
  fs.mkdirSync(path.join(root, 'agents'));
  fs.writeFileSync(path.join(root, 'team', 'write.md'), `---\nplace: git\nagent: writer\n${write}\n---\n`);
  fs.writeFileSync(path.join(root, 'agents', 'writer.md'), `---\n${writer}\n---\nWrite it.\n`);
  return path.join(root, 'team');
};

test('`nemia start` on a folder that writes `disallow:` or `allow:` starts the run under the new names, and names each file and line to rename', async (t) => {
  const dir = team('disallow: SendMessage', 'allow: Edit(**)');
  const printed = await printedBy(t, ['start', 'write it', '--workflows', dir, '--repo', aRepo(), '--no-worktree']);
  const id = printed[0].split(' ')[0];
  const write = readRun(id).workflow!.find((s) => s.name === 'write')!;
  assert.deepEqual([write.disallowedTools, write.allowedTools], [['SendMessage'], ['Edit(**)']], 'the run started, its lists read');
  const said = printed.join('\n');
  assert.ok(said.includes(`${path.join(dir, 'write.md')}: \`disallow:\` is read as \`disallowedTools:\`, Claude Code's name for it`), said);
  assert.ok(said.includes(`${path.join(dir, '..', 'agents', 'writer.md')}: \`allow:\` is read as \`allowedTools:\``), said);
  assert.match(said, /rename the line, or save the file from the board, which writes the new name\./);
});

test('`nemia start` on a folder on the new names says nothing of former ones', async (t) => {
  const printed = await printedBy(t, [
    'start',
    'write it',
    '--workflows',
    team('disallowedTools: SendMessage', 'allowedTools: Edit(**)'),
    '--repo',
    aRepo(),
    '--no-worktree',
  ]);
  assert.doesNotMatch(printed.join('\n'), /former name|is read as `/);
});
