/**
 * The parser's words are the engine's.
 *
 * `workflow.ts` refuses a permission mode or an effort its step's harness does not take, at load, before a run
 * exists. It cannot ask the engine — it is pure, and imports no runtime (`docs/architecture.md`) — so it keeps a
 * copy, and this holds the copy to the lists the runtime exports: the source. The first copies differed for months,
 * unnoticed: the engine took `manual` on Claude Code and `bypassPermissions` on codex, and the parser refused both.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_CONTEXT_TOKENS, CLAUDE_EFFORTS, CLAUDE_PERMISSION_MODES, CODEX_EFFORTS, CODEX_SANDBOXES, claudeDetached, codex } from 'agent-runtime';
import { CONTEXT_WINDOWS, EFFORTS, HARNESSES, PERMISSION_MODES } from '../src/workflow.ts';

type Lists = Readonly<Record<string, readonly string[]>>;

/** What the engine takes, by the harness a step names. Codex's `refuses` also takes `bypassPermissions`, as its widest sandbox. */
const ENGINE: { permissionMode: Lists; effort: Lists } = {
  permissionMode: { claude: CLAUDE_PERMISSION_MODES, codex: [...CODEX_SANDBOXES, 'bypassPermissions'], 'claude-detached': CLAUDE_PERMISSION_MODES },
  effort: { claude: CLAUDE_EFFORTS, codex: CODEX_EFFORTS, 'claude-detached': CLAUDE_EFFORTS },
};

/** Every way the parser's lists differ from the engine's, one line each — `[]` when a word is refused at load exactly when the engine would refuse it. */
function drift(parser: { permissionMode: Lists; effort: Lists }): string[] {
  const lines: string[] = [];
  for (const key of ['permissionMode', 'effort'] as const) {
    for (const h of new Set([...Object.keys(parser[key]), ...Object.keys(ENGINE[key])])) {
      const ours = parser[key][h] ?? [];
      const theirs = ENGINE[key][h] ?? [];
      const refused = theirs.filter((w) => !ours.includes(w));
      const taken = ours.filter((w) => !theirs.includes(w));
      if (refused.length) lines.push(`${key} on ${h}: the engine takes ${refused.join(', ')}, and the parser refuses it at load`);
      if (taken.length) lines.push(`${key} on ${h}: the parser takes ${taken.join(', ')}, and the engine refuses it when the step is filed`);
    }
  }
  return lines;
}

test('the lists are exported by the runtime, and are there to compare', () => {
  assert.ok(CLAUDE_PERMISSION_MODES.length && CLAUDE_EFFORTS.length && CODEX_SANDBOXES.length && CODEX_EFFORTS.length);
});

test("the parser's permission modes and efforts are the engine's, harness by harness", () => {
  assert.deepEqual(drift({ permissionMode: PERMISSION_MODES, effort: EFFORTS }), []);
  assert.deepEqual([...HARNESSES].sort(), Object.keys(ENGINE.permissionMode).sort(), 'the harnesses a step may name');
});

test('REFUSED: the pin fails on a deliberate drift — a word dropped, a word added, a harness forgotten', () => {
  const without = (list: readonly string[], word: string) => list.filter((w) => w !== word);
  assert.deepEqual(drift({ permissionMode: { ...PERMISSION_MODES, claude: without(PERMISSION_MODES.claude!, 'manual') }, effort: EFFORTS }),
    ['permissionMode on claude: the engine takes manual, and the parser refuses it at load']);
  assert.deepEqual(drift({ permissionMode: { ...PERMISSION_MODES, codex: without(PERMISSION_MODES.codex!, 'bypassPermissions') }, effort: EFFORTS }),
    ['permissionMode on codex: the engine takes bypassPermissions, and the parser refuses it at load']);
  assert.deepEqual(drift({ permissionMode: PERMISSION_MODES, effort: { ...EFFORTS, 'claude-detached': [...EFFORTS['claude-detached']!, 'minimal'] } }),
    ['effort on claude-detached: the parser takes minimal, and the engine refuses it when the step is filed']);
  const { codex: _, ...forgotten } = EFFORTS;
  assert.deepEqual(drift({ permissionMode: PERMISSION_MODES, effort: forgotten }), [`effort on codex: the engine takes ${CODEX_EFFORTS.join(', ')}, and the parser refuses it at load`]);
  // The first copies, as they shipped.
  const shipped = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan'];
  assert.deepEqual(drift({ permissionMode: { claude: shipped, codex: ['workspace-write', 'danger-full-access', 'read-only'], 'claude-detached': shipped }, effort: EFFORTS }), [
    'permissionMode on claude: the engine takes manual, and the parser refuses it at load',
    'permissionMode on codex: the engine takes bypassPermissions, and the parser refuses it at load',
    'permissionMode on claude-detached: the engine takes manual, and the parser refuses it at load',
  ]);
});

test("the parser's context windows are the engine's, harness by harness — and codex has none on either side", () => {
  // `claude` is the engine's `claude-bg`, whose range is `CLAUDE_CONTEXT_TOKENS`; a spec declares its own.
  const engine: Record<string, unknown> = { claude: CLAUDE_CONTEXT_TOKENS, 'claude-detached': claudeDetached.contextTokens, codex: codex.contextTokens };
  for (const h of HARNESSES) assert.deepEqual(CONTEXT_WINDOWS[h], engine[h], h);
  assert.deepEqual(CLAUDE_CONTEXT_TOKENS, { least: 100_000, most: 1_000_000 }, 'and the engine still has the range the CLI was measured to take');
});

test("every word the parser takes, the engine's own refusal takes too — asked of the harness, not only its list", () => {
  for (const [h, refuses] of [['codex', codex.refuses!], ['claude-detached', claudeDetached.refuses!]] as const) {
    for (const permissionMode of PERMISSION_MODES[h]!) assert.equal(refuses({ brief: 'b', cwd: '/w', permissionMode }), undefined, `${h} ${permissionMode}`);
    for (const effort of EFFORTS[h]!) assert.equal(refuses({ brief: 'b', cwd: '/w', effort }), undefined, `${h} ${effort}`);
  }
  // `claude` is `claude-bg`, whose refusal is Claude Code's lists — the same `claudeDetached.refuses` is.
  assert.deepEqual(PERMISSION_MODES.claude, PERMISSION_MODES['claude-detached']);
  assert.deepEqual(EFFORTS.claude, EFFORTS['claude-detached']);
});

test("REFUSED at load in the engine's words: a `budget:` on a codex step, which `codex exec` has no spend cap to keep", async () => {
  const { parseWorkflow } = await import('../src/workflow.ts');
  const engine = codex.refuses!({ brief: 'b', cwd: '/w', budgetUsd: 5 });
  assert.ok(engine, 'the engine refuses a budget on codex');
  const reason = /^`budgetUsd: 5` (.*?)\. Leave/.exec(engine)?.[1];
  assert.ok(reason, engine);
  assert.throws(() => parseWorkflow('review', '---\nharness: codex\nbudget: 5\n---\nreview it\n'), (e: Error) => e.message.startsWith(`review: \`budget: 5\` ${reason}.`));
  // The harnesses a budget is taken on: `claude`, whose cap the run holds between tries, and `claude-detached`, whose harness keeps it too.
  assert.equal(claudeDetached.refuses!({ brief: 'b', cwd: '/w', budgetUsd: 5 }), undefined);
  for (const harness of ['claude', 'claude-detached']) assert.equal(parseWorkflow('x', `---\nharness: ${harness}\nbudget: 5\n---\ndo it\n`).budget, 5, harness);
});
