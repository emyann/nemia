/**
 * Claude Code's permission matching and measured tool sets (`src/harness/claude/rules.ts`), as its declaration carries them: a Bash rule
 * covering another, a server's tool refused by a deny, deny then ask then allow, the modes a job was measured denying what asks in, and
 * the measured sets held to their date, their version and the ledger that records them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from 'test-kit/repo';
import { CLAUDE_DECLARATION } from '../src/harness/claude/vocabulary.ts';
import {
  CLAUDE_RULES,
  MEASURED_TOOLS,
  READ_ONLY_COMMANDS,
  bashCovers,
  dated,
  denyingRule,
  jobDeniesAsksIn,
  narrowerRules,
  readOnlyCommands,
  takenBackBy,
} from '../src/harness/claude/rules.ts';
import { HARNESS_DECLARATIONS } from '../src/harness/declaration.ts';

test("Claude Code's declaration carries its rules, and no other harness's declares any", () => {
  assert.equal(CLAUDE_DECLARATION.rules, CLAUDE_RULES);
  assert.deepEqual(
    Object.entries(HARNESS_DECLARATIONS)
      .filter(([, d]) => d.rules !== undefined)
      .map(([name]) => name),
    ['claude'],
  );
});

test("a Bash rule covers another as Claude Code matches them: `*` any text, spaces included; `:*` a trailing ` *`, which matches the bare command too; no `*`, one command — the permissions docs' own examples, a colon anywhere but the end a colon, and a rule against a rule covering every command of the inner one", async (t) => {
  const cases: Array<[outer: string, inner: string, covers: boolean]> = [
    ['ls *', 'ls -la', true],
    ['ls *', 'ls', true],
    ['ls *', 'lsof', false],
    ['ls*', 'lsof', true],
    ['ls:*', 'ls -la', true],
    ['git log *', 'git log', true],
    ['* --help *', 'npm --help x', true],
    ['* --help *', 'npm --help', false],
    ['* --help *', 'npm --help *', false],
    ['git:* push', 'git push', false],
    ['git:* push', 'git:x push', true],
    ['git:*', 'git diff:*', true],
    ['git diff:*', 'git:*', false],
    ['npm run:*', 'npm run build', true],
    ['npm run build', 'npm run:*', false],
    ['npm test *', 'npm test', true],
    ['npm test', 'npm test *', false],
    ['npm run build', 'npm run build', true],
    ['npx turbo run test:*', 'npx turbo run test build', true],
    ['npx turbo run test build', 'npx turbo run test:*', false],
    ['git *', 'git log *', true],
    ['git log *', 'git *', false],
  ];
  for (const [outer, inner, covers] of cases)
    await t.test(`${outer} covers ${inner}: ${covers}`, () => assert.equal(bashCovers(outer, inner), covers));
});

test("a deny rule refuses a server's tool by the tool's name, the server's, or every tool of the server — and by nothing else", () => {
  const tool = ['playwright', 'browser_click'] as const;
  assert.equal(denyingRule(['Read', 'mcp__playwright__browser_click'], ...tool), 'mcp__playwright__browser_click');
  assert.equal(denyingRule(['mcp__playwright'], ...tool), 'mcp__playwright');
  assert.equal(denyingRule(['mcp__playwright__*'], ...tool), 'mcp__playwright__*');
  for (const rule of [
    'mcp__play',
    'mcp__playwrightx',
    'mcp__playwright__browser',
    'mcp__playwright__browser_click_',
    'mcp__other__browser_click',
    'Bash(git push)',
    '*',
  ]) {
    assert.equal(denyingRule([rule], ...tool), null, rule);
  }
});

test('a deny takes back an allow it matches the whole of, whatever either is scoped to; a narrower one is an exception to it', async (t) => {
  const over = (...rules: string[]) => rules.map((rule) => ({ rule, source: 'settings' }));
  const rows: Array<[allow: string, deny: string, takes: boolean, narrower: boolean]> = [
    ['Bash(git diff:*)', 'Bash(git:*)', true, false],
    ['Bash(git diff:*)', 'Bash', true, false],
    ['Bash(git diff:*)', 'Bash(*)', true, false],
    ['Bash(git:*)', 'Bash(git push:*)', false, true],
    ['Bash', 'Bash(git push:*)', false, true],
    ['Bash(npm test)', 'Bash(npm test)', true, false],
    ['Read', 'Bash(git:*)', false, false],
    ['mcp__fixture__echo', 'mcp__fixture', true, false],
    ['mcp__fixture__echo', 'mcp__fixture__*', true, false],
    ['mcp__fixture', 'mcp__fixture__wipe', false, true],
    ['mcp__fixture', 'mcp__other', false, false],
  ];
  for (const [allow, deny, takes, narrower] of rows)
    await t.test(`${allow} under ${deny}`, () => {
      assert.equal(takenBackBy(allow, over(deny))?.rule, takes ? deny : undefined);
      if (!takes) assert.deepEqual(narrowerRules(allow, over(deny)), narrower ? [deny] : [], 'asked only of an allow that stands');
    });
});

test('a job denies what asks in each mode it was measured in, none given among them, and is claimed neither way in bypassPermissions', async (t) => {
  const rows: Array<[mode: string | null, denies: boolean]> = [
    ['dontAsk', true],
    [null, true],
    ['auto', true],
    ['default', true],
    ['acceptEdits', true],
    ['bypassPermissions', false],
    ['plan', false],
  ];
  for (const [mode, denies] of rows) await t.test(String(mode), () => assert.equal(jobDeniesAsksIn(mode), denies));
});

/** The `names` the ledger's `bullet` does not write as a tool of its own, in backticks of their own. */
const unnamedIn = (bullet: string, names: readonly string[]): string[] => names.filter((name) => !bullet.includes(`\`${name}\``));

test("REFUSED: the measured set holds only what the ledger's measurement names, as a tool of its own — a tool it does not name is inferred, with why, or not there", () => {
  const plan = fs.readFileSync(path.join(REPO, 'docs', 'plan-hold-the-bar.md'), 'utf8');
  const at = plan.indexOf('- **what a worker gets, measured');
  assert.ok(at >= 0, 'the ledger has the bullet MEASURED_TOOLS cites');
  const next = plan.indexOf('\n- **', at + 1);
  const bullet = plan.slice(at, next < 0 ? undefined : next);
  assert.ok(bullet.includes(MEASURED_TOOLS.measuredAt), 'measured on the day the bullet says');
  const unnamed = (names: readonly string[]) => unnamedIn(bullet, names);
  assert.deepEqual(unnamed(MEASURED_TOOLS.tools), []);
  assert.deepEqual(unnamed(MEASURED_TOOLS.lacks), []);
  assert.deepEqual(
    unnamed([...MEASURED_TOOLS.tools, 'Edit', 'Bash']),
    ['Edit', 'Bash'],
    "refused: Edit, which the bullet never names, and Bash, which it names only in the fenced reviewer's list — each would read as measured",
  );
  const inferred = MEASURED_TOOLS.inferred.map((t: { name: string }) => t.name);
  assert.deepEqual(
    inferred.filter((name: string) => (MEASURED_TOOLS.tools as readonly string[]).includes(name)),
    [],
    'no tool is both measured and inferred',
  );
  for (const { name, why } of MEASURED_TOOLS.inferred) assert.ok(why.length > 0, `${name} says why it is inferred`);
});

test('the read-only commands are data of the day they were measured: the shape and the date pinned, and the shipped lists pass their own guards', () => {
  assert.deepEqual(Object.keys(READ_ONLY_COMMANDS), ['harness', 'version', 'measuredAt', 'source', 'measured', 'documented', 'docs']);
  assert.deepEqual(
    { harness: READ_ONLY_COMMANDS.harness, version: READ_ONLY_COMMANDS.version, measuredAt: READ_ONLY_COMMANDS.measuredAt },
    { harness: 'Claude Code', version: '2.1.272', measuredAt: '2026-09-15' },
  );
  assert.deepEqual(READ_ONLY_COMMANDS.measured, ['cat', 'grep', 'head', 'ls', 'tail']);
  assert.equal(readOnlyCommands('READ_ONLY_COMMANDS', READ_ONLY_COMMANDS), READ_ONLY_COMMANDS);
  assert.deepEqual(
    { harness: MEASURED_TOOLS.harness, version: MEASURED_TOOLS.version, measuredAt: MEASURED_TOOLS.measuredAt },
    { harness: 'Claude Code', version: '2.1.270', measuredAt: '2026-09-14' },
  );
  assert.equal(dated('MEASURED_TOOLS', MEASURED_TOOLS), MEASURED_TOOLS);
});

/**
 * The shipped list `of`, with `key` set to `value` — or left out, for undefined — returned `as never`: not a measurement, on purpose,
 * so the readers are handed what their type refuses, to prove they refuse it at run time too.
 */
const edited = (of: object, key: string, value?: unknown): never => {
  const copy: Record<string, unknown> = { ...of };
  if (value === undefined) delete copy[key];
  else copy[key] = value;
  return copy as never;
};

test('REFUSED: a measurement without a date, or a version, is refused by name, exit 2 — and a day not on the calendar, a list naming a command twice, or docs with no day read', () => {
  const refuses = (run: () => unknown, named: RegExp) =>
    assert.throws(run, (err: Error & { exitCode?: number }) => err.exitCode === 2 && named.test(err.message));
  const R = READ_ONLY_COMMANDS;
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measuredAt')), /^READ_ONLY_COMMANDS .*`measuredAt`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'version')), /^READ_ONLY_COMMANDS .*`version`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(edited(R, 'version', ''), 'measuredAt')), /`version`.*`measuredAt`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'version', 'latest')), /`version`.*"latest"/);
  for (const day of ['2026-02-30', '2026-13-01', 'September 15', '2026-9-15', 'today']) {
    refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measuredAt', day)), /`measuredAt`/);
  }
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'measuredAt')), /^MEASURED_TOOLS .*`measuredAt`/);
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'version')), /^MEASURED_TOOLS .*`version`/);
  refuses(() => dated('MEASURED_TOOLS', edited(MEASURED_TOOLS, 'source', ' ')), /^MEASURED_TOOLS .*`source`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'documented', [...R.documented, 'cat'])), /\bcat\b/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measured', [])), /`measured`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'measured', ['cat -n'])), /`measured`/);
  refuses(() => readOnlyCommands('READ_ONLY_COMMANDS', edited(R, 'docs', 'code.claude.com/docs/en/permissions')), /`docs`/);
});
