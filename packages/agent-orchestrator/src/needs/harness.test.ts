/**
 * A harness's declaration as two needs (`harnessNeedsOf`), a table of declarations: an install need whose first fix puts the program in
 * place and whose second takes it away (`kind: removes`) — the install taking away the mark a removal leaves (`DEACTIVATED`) before it
 * runs, the removal leaving it after — a sign-in need whose fixes a person types carry `kind: typed`, the token's
 * maker offered with the command that keeps the token, and none of a harness that declares no needs. And each need named back to its
 * harness and part (`harnessOfNeed`), and the version a command printed (`versionIn`). The laws of `harnessesOfRun`,
 * `runsHoldingRemoval` and `harnessVersionWord` are proved by `contracts/harness-needs.contract.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { HarnessDeclaration, HarnessNeeds } from 'agent-runtime/vocabulary';
import { harnessNeedsOf, harnessOfNeed, versionIn } from './harness.ts';

/** A harness's needs as an adapter declares them, its sign-in's fixes `fixes`. */
const needsWith = (fixes: HarnessNeeds['signIn']['fixes']): HarnessNeeds => ({
  program: 'tool',
  title: 'Tool',
  pin: '1.2.3',
  version: 'tool --version',
  check: 'command -v tool',
  install: 'install-tool',
  remove: 'remove-tool',
  signIn: { check: 'tool auth status', fixes },
});

/** A declaration that can nothing but declares `needs`. */
const declared = (needs?: HarnessNeeds): HarnessDeclaration => ({ can: [], ...(needs === undefined ? {} : { needs }) });

const TOKEN = { harness: 'tool', maker: 'tool make-token', keep: 'nemia tool-token set' };

test('a harness declaration gives two needs, each fix of its kind', async (t) => {
  const rows: {
    readonly name: string;
    readonly declarations: Record<string, HarnessDeclaration>;
    readonly needs: readonly string[];
    readonly kinds: Record<string, readonly (string | undefined)[]>;
    readonly commands?: Record<string, readonly string[]>;
  }[] = [
    {
      name: 'a typed sign-in fix carries kind typed, and the removal kind removes',
      declarations: { tool: declared(needsWith([{ command: 'tool login', message: 'sign in', typed: true }])) },
      needs: ['tool', 'tool-sign-in'],
      kinds: { tool: [undefined, 'removes'], 'tool-sign-in': ['typed'] },
      commands: {
        tool: [
          'rm -f "$NEMIA_TOOLS/harnesses/tool/deactivated" && {\ninstall-tool\n}',
          '{\nremove-tool\n} && mkdir -p "$NEMIA_TOOLS/harnesses/tool" && : > "$NEMIA_TOOLS/harnesses/tool/deactivated"',
        ],
        'tool-sign-in': ['tool login'],
      },
    },
    {
      name: 'a sign-in the server starts is a puts, its code pattern kept',
      declarations: { tool: declared(needsWith([{ command: 'tool login --device', message: 'sign in', code: '[A-Z]{4}' }])) },
      needs: ['tool', 'tool-sign-in'],
      kinds: { tool: [undefined, 'removes'], 'tool-sign-in': [undefined] },
    },
    {
      name: "the default harness's token maker is offered with the command that keeps the token",
      declarations: {
        tool: declared(
          needsWith([
            { command: 'tool login', message: 'sign in', typed: true },
            { command: 'tool make-token', message: 'make a token', typed: true },
          ]),
        ),
      },
      needs: ['tool', 'tool-sign-in'],
      kinds: { tool: [undefined, 'removes'], 'tool-sign-in': ['typed', 'typed'] },
      commands: { 'tool-sign-in': ['tool login', 'tool make-token && nemia tool-token set'] },
    },
    {
      name: 'a command harness, which declares no needs, gives none',
      declarations: { command: declared() },
      needs: [],
      kinds: {},
    },
    {
      name: 'two harnesses give two needs each, in their order',
      declarations: { command: declared(), tool: declared(needsWith([])), other: declared(needsWith([])) },
      needs: ['tool', 'tool-sign-in', 'other', 'other-sign-in'],
      kinds: { tool: [undefined, 'removes'], 'tool-sign-in': [], other: [undefined, 'removes'], 'other-sign-in': [] },
    },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const needs = harnessNeedsOf(row.declarations, TOKEN);
      assert.deepEqual(
        needs.map((n) => n.name),
        row.needs,
      );
      for (const [name, kinds] of Object.entries(row.kinds))
        assert.deepEqual(
          needs.find((n) => n.name === name)?.fixes?.map((f) => f.kind),
          kinds,
          name,
        );
      for (const [name, commands] of Object.entries(row.commands ?? {}))
        assert.deepEqual(
          needs.find((n) => n.name === name)?.fixes?.map((f) => f.command),
          commands,
          name,
        );
    });
});

test('each need is named back to its harness and part, and a version is read off what a command printed', () => {
  const declarations = { command: declared(), tool: declared(needsWith([])) };
  assert.deepEqual([harnessOfNeed('tool', declarations)?.part, harnessOfNeed('tool-sign-in', declarations)?.part], ['install', 'sign-in']);
  assert.equal(harnessOfNeed('command', declarations), undefined);
  assert.equal(harnessOfNeed('git-identity', declarations), undefined);
  assert.equal(versionIn('2.1.322 (Claude Code)\n'), '2.1.322');
  assert.equal(versionIn('codex-cli 0.154.0'), '0.154.0');
  assert.equal(versionIn('no version here'), undefined);
});
