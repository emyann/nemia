/**
 * What a harness's fence words reach (`fenceReach`): each rank held to the harness's own words, the word a task naming none runs in held
 * to the argv the runner gives it, and the models Claude Code drops `auto` on matched as named or with a suffix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fenceReach, unruledIn } from '../src/harness/reach.ts';
import { CLAUDE_PERMISSION_MODES } from '../src/harness/claude/vocabulary.ts';
import { CODEX_SANDBOXES } from '../src/harness/codex/vocabulary.ts';
import { claudeDetached } from '../src/harness/claude/code.ts';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { claudeArgv } from '../src/harness/claude/bg.ts';
import { codex } from '../src/harness/codex/codex.ts';

const CLAUDES = ['claude', 'claude-detached'];

/** The word after `flag` in `args`. */
const after = (args: readonly string[], flag: string): string | undefined => args[args.indexOf(flag) + 1];

test('Claude Code drops auto on a listed model, named or with a suffix, and on no other; codex drops nothing', () => {
  for (const model of ['haiku', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5']) {
    for (const harness of CLAUDES) assert.deepEqual(fenceReach(harness, model)!.dropped, ['auto'], `${harness} ${model}`);
  }
  for (const model of ['opus', 'sonnet', 'claude-haiku-4-50', 'xhaiku', undefined]) {
    assert.deepEqual(fenceReach('claude', model)!.dropped, [], String(model));
  }
  assert.deepEqual(fenceReach('codex', 'haiku')!.dropped, []);
});

test("fenceReach: each harness's ranks, the word a task naming none runs in, and no reach where no fence is", async (t) => {
  await t.test('every permission mode Claude Code takes has a rank, and no other word does, on either of its harnesses', () => {
    for (const harness of CLAUDES) {
      assert.deepEqual(Object.keys(fenceReach(harness)!.rank).sort(), [...CLAUDE_PERMISSION_MODES].sort(), harness);
    }
  });
  await t.test("codex's sandboxes rise in rank in the order Codex lists them, narrowest first", () => {
    const { rank, by } = fenceReach('codex')!;
    assert.equal(by, 'sandbox');
    assert.deepEqual(Object.keys(rank), [...CODEX_SANDBOXES]);
    assert.deepEqual(
      CODEX_SANDBOXES.map((s) => rank[s]),
      CODEX_SANDBOXES.map((_, i) => i),
    );
  });
  await t.test(
    'the word a task naming none runs in is what the runner gives it: a job and a background session of Claude Code, and Codex',
    () => {
      const task = { name: 'ae/t/1', brief: 'b', cwd: '/r' };
      for (const harness of CLAUDES) {
        assert.equal(fenceReach(harness)!.by, 'mode');
        assert.equal(attachedOptions(task).permissionMode, fenceReach(harness)!.given, `${harness}, a job on the SDK`);
        assert.equal(after(claudeDetached.command(task).args, '--permission-mode'), fenceReach(harness)!.given, `${harness}, claude -p`);
        assert.equal(after(claudeArgv(task, []), '--permission-mode'), fenceReach(harness)!.given, `${harness}, a background session`);
      }
      assert.equal(after(codex.command(task).args, '-s'), fenceReach('codex')!.given);
    },
  );
  await t.test('a harness fenced by neither a mode nor a sandbox has no reach', () => {
    for (const harness of ['command', 'a2a:x', 'nope', '']) assert.equal(fenceReach(harness), undefined, harness);
  });
});

test('unruledIn: the first character of a path a permission rule cannot carry, on a harness whose fence takes a rule', async (t) => {
  await t.test(
    'the first character of a path a permission rule cannot carry is answered on Claude Code, a whitespace but the space among them, and nothing on a clean path',
    () => {
      for (const harness of CLAUDES) {
        assert.equal(unruledIn(harness, '/srv/my wf(1)/runs'), '(', harness);
        assert.equal(unruledIn(harness, '/srv/wf*'), '*', harness);
        assert.equal(unruledIn(harness, '/srv/a\\b'), '\\', harness);
        assert.equal(unruledIn(harness, `/srv/my${String.fromCharCode(0xa0)}wf`), String.fromCharCode(0xa0), harness);
        assert.equal(unruledIn(harness, '/srv/my wf,{a}'), undefined, harness);
      }
    },
  );
  await t.test('a harness whose fence takes no rule naming a path answers nothing, whatever the path holds', () => {
    for (const harness of ['codex', 'command', 'a2a:x', 'nobody']) assert.equal(unruledIn(harness, '/srv/wf*(x)'), undefined, harness);
  });
});

test("fenceReach: what each mode of a harness's fence does — held, unasking, writing, refusing, unfenced and granted", async (t) => {
  await t.test(
    "Claude Code's held mode leads the modes that ask nobody, each one of its words; acceptEdits is the first that writes; bypassPermissions alone is widest",
    () => {
      const { rank, held, unasking, writes } = fenceReach('claude')!;
      assert.equal(held, 'dontAsk');
      assert.equal(unasking[0], held);
      assert.deepEqual(unasking, ['dontAsk', 'bypassPermissions']);
      for (const mode of unasking) assert.ok(CLAUDE_PERMISSION_MODES.includes(mode), mode);
      assert.equal(writes, rank.acceptEdits);
      assert.ok(rank.dontAsk < writes && rank.default < writes, 'the held mode and the default ask before writing');
      const top = Math.max(...Object.values(rank));
      assert.deepEqual(
        Object.keys(rank).filter((m) => rank[m] === top),
        ['bypassPermissions'],
      );
      assert.ok(rank.auto > rank.acceptEdits && rank.plan < rank.dontAsk);
    },
  );
  await t.test(
    'codex holds no session to a mode and asks nobody in the background; workspace-write is the first sandbox that writes',
    () => {
      const { rank, held, unasking, writes } = fenceReach('codex')!;
      assert.equal(held, undefined);
      assert.deepEqual(unasking, []);
      assert.equal(writes, rank['workspace-write']);
    },
  );
  await t.test('the modes that refuse what no allow rule reaches are those that decide by rule alone: above none, and never plan', () => {
    for (const harness of CLAUDES) {
      const { rank, refusing, writes } = fenceReach(harness)!;
      assert.deepEqual(
        [...refusing].sort(),
        CLAUDE_PERMISSION_MODES.filter((mode) => rank[mode] > rank.plan && rank[mode] <= writes).sort(),
        `${harness}: every mode from the narrowest that runs anything up to the widest that writes unasked, and no other`,
      );
      for (const mode of ['auto', 'bypassPermissions', 'plan']) {
        assert.ok(!refusing.includes(mode), `${harness}: ${mode} does not refuse by its rules alone`);
      }
    }
  });
  await t.test('the tools a session calls with no allow rule are the three that read and a skill load, and never Bash', () => {
    for (const harness of CLAUDES) {
      assert.deepEqual([...fenceReach(harness)!.unfenced].sort(), ['Glob', 'Grep', 'Read', 'Skill'], harness);
      assert.ok(!fenceReach(harness)!.unfenced.includes('Bash'), `${harness}: Bash takes a rule`);
    }
  });
  await t.test(
    'the one mode that grants a tool of its own is the one that writes unasked, and it grants the Edit family and nothing else',
    () => {
      for (const harness of CLAUDES) {
        const { granted, rank, refusing, writes } = fenceReach(harness)!;
        assert.deepEqual(
          Object.keys(granted).sort(),
          refusing.filter((mode) => rank[mode] >= writes).sort(),
          `${harness}: a word grants of its own only where it writes unasked`,
        );
        for (const [mode, tools] of Object.entries(granted)) {
          assert.deepEqual([...tools].sort(), ['Edit', 'MultiEdit', 'NotebookEdit', 'Write'], `${harness}: ${mode}`);
          assert.ok(!tools.includes('Bash'), `${harness}: ${mode} asks about a command, so Bash takes a rule`);
        }
      }
    },
  );
  await t.test("codex's sandbox takes no allow rule, so it refuses in no word and leaves no tool unruled or granted", () => {
    assert.deepEqual(fenceReach('codex')!.refusing, []);
    assert.deepEqual(fenceReach('codex')!.unfenced, []);
    assert.deepEqual(fenceReach('codex')!.granted, {});
  });
});
