/**
 * The parser's words are the engine's.
 *
 * `workflow.ts` refuses a permission mode, a sandbox or an effort its step's harness does not take, at load, before a run
 * exists. It cannot ask the engine — it is pure, and imports no runtime (`docs/architecture.md`) — so it keeps a
 * copy, and this holds the copy to the lists the runtime exports: the source. The first copies differed for months,
 * unnoticed: the engine took `manual` on Claude Code and `bypassPermissions` on codex, and the parser refused both.
 *
 * Since 2026-09-23 a codex step names its sandbox as `sandbox:`, and the engine's task still calls it `permissionMode`: the tick hands
 * one to the other (`modeOf`). The engine's `bypassPermissions` on codex is its alias for `danger-full-access`, which a step writes under
 * Codex's own name: the parser reads it only on a line from before (`permissionMode: bypassPermissions` on codex), as `danger-full-access`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLAUDE_CONTEXT_TOKENS,
  CLAUDE_EFFORTS,
  CLAUDE_PERMISSION_MODES,
  CODEX_EFFORTS,
  CODEX_SANDBOXES,
  claudeDetached,
  codex,
  createEngine,
} from 'agent-runtime';
import { CONTEXT_WINDOWS, EFFORTS, HARNESSES, modeOf, parseWorkflow, PERMISSION_MODES, SANDBOXES } from '../src/workflow.ts';
import { scratch } from './scratch.ts';

type Lists = Readonly<Record<string, readonly string[]>>;

/**
 * What the engine takes, by the harness a step names, under the step's key: Claude Code's permission modes as `permissionMode:`, Codex's
 * sandboxes as `sandbox:`. Codex's `refuses` also takes `bypassPermissions`, as its widest sandbox: the engine's alias, not Codex's word.
 */
const ENGINE: { permissionMode: Lists; sandbox: Lists; effort: Lists } = {
  permissionMode: { claude: CLAUDE_PERMISSION_MODES, 'claude-detached': CLAUDE_PERMISSION_MODES },
  sandbox: { codex: CODEX_SANDBOXES },
  effort: { claude: CLAUDE_EFFORTS, codex: CODEX_EFFORTS, 'claude-detached': CLAUDE_EFFORTS },
};

/** Every way the parser's lists differ from the engine's, one line each — `[]` when a word is refused at load exactly when the engine would refuse it. */
function drift(parser: { permissionMode: Lists; sandbox: Lists; effort: Lists }): string[] {
  const lines: string[] = [];
  for (const key of ['permissionMode', 'sandbox', 'effort'] as const) {
    for (const h of new Set([...Object.keys(parser[key]), ...Object.keys(ENGINE[key])])) {
      const ours = parser[key][h] ?? [];
      const theirs = ENGINE[key][h] ?? [];
      const refused = theirs.filter((w) => !ours.includes(w));
      const taken = ours.filter((w) => !theirs.includes(w));
      if (refused.length) lines.push(`${key} on ${h}: the engine takes ${refused.join(', ')}, and the parser refuses it at load`);
      if (taken.length)
        lines.push(`${key} on ${h}: the parser takes ${taken.join(', ')}, and the engine refuses it when the step is filed`);
    }
  }
  return lines;
}

test('the lists are exported by the runtime, and are there to compare', () => {
  assert.ok(CLAUDE_PERMISSION_MODES.length && CLAUDE_EFFORTS.length && CODEX_SANDBOXES.length && CODEX_EFFORTS.length);
});

test("the parser's permission modes, sandboxes and efforts are the engine's, harness by harness", () => {
  assert.deepEqual(drift({ permissionMode: PERMISSION_MODES, sandbox: SANDBOXES, effort: EFFORTS }), []);
  assert.deepEqual([...HARNESSES].sort(), Object.keys(ENGINE.effort).sort(), 'the harnesses a step may name');
  // Each harness has one fence, under one key: a permission mode or a sandbox, never both and never neither.
  for (const h of HARNESSES) assert.equal(Object.hasOwn(PERMISSION_MODES, h) !== Object.hasOwn(SANDBOXES, h), true, h);
});

test('REFUSED: the pin fails on a deliberate drift — a word dropped, a word added, a harness forgotten', () => {
  const without = (list: readonly string[], word: string) => list.filter((w) => w !== word);
  const lists = { permissionMode: PERMISSION_MODES, sandbox: SANDBOXES, effort: EFFORTS };
  assert.deepEqual(drift({ ...lists, permissionMode: { ...PERMISSION_MODES, claude: without(PERMISSION_MODES.claude, 'manual') } }), [
    'permissionMode on claude: the engine takes manual, and the parser refuses it at load',
  ]);
  assert.deepEqual(drift({ ...lists, sandbox: { codex: without(SANDBOXES.codex, 'read-only') } }), [
    'sandbox on codex: the engine takes read-only, and the parser refuses it at load',
  ]);
  assert.deepEqual(drift({ ...lists, sandbox: { codex: [...SANDBOXES.codex, 'bypassPermissions'] } }), [
    'sandbox on codex: the parser takes bypassPermissions, and the engine refuses it when the step is filed',
  ]);
  assert.deepEqual(drift({ ...lists, effort: { ...EFFORTS, 'claude-detached': [...EFFORTS['claude-detached'], 'minimal'] } }), [
    'effort on claude-detached: the parser takes minimal, and the engine refuses it when the step is filed',
  ]);
  const { codex: _, ...forgotten } = EFFORTS;
  assert.deepEqual(drift({ ...lists, effort: forgotten }), [
    `effort on codex: the engine takes ${CODEX_EFFORTS.join(', ')}, and the parser refuses it at load`,
  ]);
  // The sandboxes back under `permissionMode`, as they were until 2026-09-23: two keys' lists, each wrong.
  assert.deepEqual(drift({ ...lists, permissionMode: { ...PERMISSION_MODES, codex: SANDBOXES.codex }, sandbox: {} }), [
    'permissionMode on codex: the parser takes read-only, workspace-write, danger-full-access, and the engine refuses it when the step is filed',
    'sandbox on codex: the engine takes read-only, workspace-write, danger-full-access, and the parser refuses it at load',
  ]);
  // The first copies, as they shipped.
  const shipped = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan'];
  assert.deepEqual(drift({ ...lists, permissionMode: { claude: shipped, 'claude-detached': shipped } }), [
    'permissionMode on claude: the engine takes manual, and the parser refuses it at load',
    'permissionMode on claude-detached: the engine takes manual, and the parser refuses it at load',
  ]);
});

test("the parser's context windows are the engine's, harness by harness — and codex has none on either side", () => {
  // `claude` is the engine's `claude`, a job or a background session, whose range is `CLAUDE_CONTEXT_TOKENS` either way; a spec declares its own.
  const engine: Record<string, unknown> = {
    claude: CLAUDE_CONTEXT_TOKENS,
    'claude-detached': claudeDetached.contextTokens,
    codex: codex.contextTokens,
  };
  for (const h of HARNESSES) assert.deepEqual(CONTEXT_WINDOWS[h], engine[h], h);
  assert.deepEqual(
    CLAUDE_CONTEXT_TOKENS,
    { least: 100_000, most: 1_000_000 },
    'and the engine still has the range the CLI was measured to take',
  );
});

test("every word the parser takes, the engine's own refusal takes too — asked of the harness, not only its list", () => {
  for (const [h, refuses] of [
    ['codex', codex.refuses!],
    ['claude-detached', claudeDetached.refuses!],
  ] as const) {
    // The engine's task names either fence `permissionMode`: what the tick files a step's sandbox as (`modeOf`).
    for (const permissionMode of [...(PERMISSION_MODES[h] ?? []), ...(SANDBOXES[h] ?? [])])
      assert.equal(refuses({ brief: 'b', cwd: '/w', config: { permissionMode } }), undefined, `${h} ${permissionMode}`);
    for (const effort of EFFORTS[h]) assert.equal(refuses({ brief: 'b', cwd: '/w', config: { effort } }), undefined, `${h} ${effort}`);
  }
  // `claude` is the engine's `claude`, whose refusal is Claude Code's lists in either mode — the same `claudeDetached.refuses` is.
  assert.deepEqual(PERMISSION_MODES.claude, PERMISSION_MODES['claude-detached']);
  assert.deepEqual(EFFORTS.claude, EFFORTS['claude-detached']);
});

test("a codex step's `sandbox:` reaches Codex as its `-s`, every sandbox, and the one it was written as before 2026-09-23 the same", () => {
  const sandboxOf = (text: string) => {
    const step = parseWorkflow('review', text);
    const { args } = codex.command({
      name: 'review',
      brief: 'b',
      cwd: scratch('wf-vocabulary-codex-'),
      config: { permissionMode: modeOf(step) },
    });
    return args[args.indexOf('-s') + 1];
  };
  for (const sandbox of SANDBOXES.codex) {
    assert.equal(sandboxOf(`---\nharness: codex\nsandbox: ${sandbox}\n---\nreview it\n`), sandbox);
    assert.equal(sandboxOf(`---\nharness: codex\npermissionMode: ${sandbox}\n---\nreview it\n`), sandbox, `the former line, ${sandbox}`);
  }
  assert.equal(sandboxOf('---\nharness: codex\npermissionMode: bypassPermissions\n---\nreview it\n'), 'danger-full-access');
  // Filed from `permissionMode` alone, as the tick did before `modeOf`, the reviewer runs in Codex's default, which writes.
  const { args } = codex.command({
    name: 'review',
    brief: 'b',
    cwd: scratch('wf-vocabulary-codex-'),
    config: { permissionMode: parseWorkflow('review', '---\nharness: codex\nsandbox: read-only\n---\nr\n').permissionMode },
  });
  assert.equal(args[args.indexOf('-s') + 1], 'workspace-write');
});

test("REFUSED at load in the engine's words: a `budget:` on a codex step, which `codex exec` has no spend cap to keep", async () => {
  const { parseWorkflow } = await import('../src/workflow.ts');
  const engine = codex.refuses!({ brief: 'b', cwd: '/w', config: { budgetUsd: 5 } });
  assert.ok(engine, 'the engine refuses a budget on codex');
  const reason = /^`budgetUsd: 5` (.*?)\. Leave/.exec(engine)?.[1];
  assert.ok(reason, engine);
  assert.throws(
    () => parseWorkflow('review', '---\nharness: codex\nbudget: 5\n---\nreview it\n'),
    (e: Error) => e.message.startsWith(`review: \`budget: 5\` ${reason}.`),
  );
  // The harnesses a budget is taken on: `claude`, run as a job, and `claude-detached`, whose `claude -p` each ends a session at the cap.
  assert.equal(claudeDetached.refuses!({ brief: 'b', cwd: '/w', config: { budgetUsd: 5 } }), undefined);
  for (const harness of ['claude', 'claude-detached'])
    assert.equal(parseWorkflow('x', `---\nharness: ${harness}\nbudget: 5\n---\ndo it\n`).budget, 5, harness);
});

test("REFUSED at load in the engine's words: a `budget:` beside `background: true`, which a `claude --bg` session has no spend cap to keep — and a job's is taken", async () => {
  const { parseWorkflow } = await import('../src/workflow.ts');
  const engine = createEngine({ root: scratch('wf-vocabulary-'), harnesses: { claude: 'claude' } });
  const refusal = async (config: { background?: boolean }): Promise<string | undefined> => {
    try {
      await engine.file({ brief: 'b', cwd: '/w', harness: 'claude', config: { ...config, budgetUsd: 5 } });
      return undefined;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const said = await refusal({ background: true });
  const reason = /^file: `budgetUsd: 5` is a spend cap, and (.*?)\. Leave `config\.background` off/.exec(said ?? '')?.[1];
  assert.ok(reason, said);
  assert.throws(
    () => parseWorkflow('watch', '---\nbackground: true\nbudget: 5\n---\nwatch it\n'),
    (e: Error) =>
      e.message.startsWith(
        `watch: \`budget: 5\` is a spend cap, and \`background: true\` runs the step as a background session: ${reason}. Delete`,
      ),
    reason,
  );
  // A job keeps one, on both doors.
  assert.equal(await refusal({}), undefined);
  assert.equal(parseWorkflow('watch', '---\nbudget: 5\n---\nwatch it\n').budget, 5);
});

test("a step that names no mode is filed in the mode the parser refuses `auto` for — the runtime's default — and a rendered step's flags reach Claude Code as the runtime spells them", async () => {
  const { DEFAULT_PERMISSION_MODE, parseAgent } = await import('../src/workflow.ts');
  const { renderedFlags } = await import('../src/rendering.ts');
  // What the tick files for an agent with instructions and `systemPrompt: no-coding`: every flag `renderedFlags` gives but `systemPromptFile`.
  const scribe = parseAgent('scribe', '---\nsystemPrompt: no-coding\n---\nYou write.\n');
  const step = parseWorkflow('write', '---\nagent: scribe\n---\nWrite.\n', undefined, new Map([['scribe', scribe]]));
  const claude = renderedFlags(step, '/runs/r/agents/write');
  assert.deepEqual(Object.keys(claude ?? {}).sort(), ['appendSystemPromptFile', 'pluginDir', 'settings']);
  const dir = scratch('wf-vocabulary-');
  fs.writeFileSync(
    path.join(dir, 'claude'),
    [
      '#!/bin/sh',
      'case "$1" in',
      '  agents) echo "[]" ;;',
      `  *) printf '%s\\n' "$@" > '${path.join(dir, 'args')}'; exit 1 ;;`,
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const e = createEngine({ root: path.join(dir, 'root'), harnesses: { claude: 'claude' } });
    const id = await e.file({ brief: 'b', cwd: dir, harness: 'claude', config: { claude } });
    const until = Date.now() + 20_000;
    while (!(await e.view(id)).state.settled) {
      assert.ok(Date.now() < until, 'settled');
      await e.tick();
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    process.env.PATH = prev;
  }
  const args = fs.readFileSync(path.join(dir, 'args'), 'utf8').split('\n');
  assert.equal(args[args.indexOf('--permission-mode') + 1], DEFAULT_PERMISSION_MODE, "the parser's copy of the runtime's default");
  assert.equal(args[args.indexOf('--append-system-prompt-file') + 1], '/runs/r/agents/write/prompt.md');
  assert.equal(args[args.indexOf('--plugin-dir') + 1], '/runs/r/agents/write/hkb-scribe');
  assert.equal(args[args.indexOf('--settings') + 1], '{"outputStyle":"hkb-scribe:no-coding"}');
});
