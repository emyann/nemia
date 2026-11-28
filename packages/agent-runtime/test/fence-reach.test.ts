/**
 * What a harness's fence words reach (`fenceReach`): each rank held to the harness's own words, the word a task naming none runs in held
 * to the argv the runner gives it, and the models Claude Code drops `auto` on matched as named or with a suffix.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { fenceReach, unruledIn } from '../src/harness/reach.ts';
import { CLAUDE_PERMISSION_MODES } from '../src/harness/claude/vocabulary.ts';
import { CODEX_SANDBOXES } from '../src/harness/codex/vocabulary.ts';
import { attachedOptions } from '../src/harness/claude/session-options.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { HARNESS_DECLARATIONS } from '../src/harness/declaration.ts';

/** The harness names that run Claude Code; `claude-detached`, the `claude -p` road, is no longer one, and reaches nothing. */
const CLAUDES = ['claude'];

/** The word after `flag` in `args`. */
const after = (args: readonly string[], flag: string) => args[args.indexOf(flag) + 1];

test('Claude Code names the mode its models keep or drop, `auto`; codex names none', () => {
  for (const harness of CLAUDES) assert.equal(fenceReach(harness)!.autoMode, 'auto', harness);
  assert.equal(fenceReach('codex')!.autoMode, undefined);
});

describe("fenceReach: each harness's ranks, the word a task naming none runs in, and no reach where no fence is", () => {
  test('every permission mode Claude Code takes has a rank, and no other word does', () => {
    for (const harness of CLAUDES) {
      assert.deepEqual(Object.keys(fenceReach(harness)!.rank).sort(), [...CLAUDE_PERMISSION_MODES].sort(), harness);
    }
  });
  test("codex's sandboxes rise in rank in the order Codex lists them, narrowest first", () => {
    const { rank, by } = fenceReach('codex')!;
    assert.equal(by, 'sandbox');
    assert.deepEqual(Object.keys(rank), [...CODEX_SANDBOXES]);
    assert.deepEqual(
      CODEX_SANDBOXES.map((s) => rank[s]),
      CODEX_SANDBOXES.map((_, i) => i),
    );
  });
  test('the word a task naming none runs in is what the runner gives it: a session of Claude Code, and Codex', () => {
    const task = { name: 'ae/t/1', brief: 'b', cwd: '/r' };
    for (const harness of CLAUDES) {
      assert.equal(fenceReach(harness)!.by, 'mode');
      assert.equal(attachedOptions(task).permissionMode, fenceReach(harness)!.given, `${harness}, a job on the SDK`);
    }
    assert.equal(after(codex.command(task).args, '-s'), fenceReach('codex')!.given);
  });
  test('a harness fenced by neither a mode nor a sandbox has no reach', () => {
    for (const harness of ['command', 'a2a:x', 'nope', '', 'claude-detached']) assert.equal(fenceReach(harness), undefined, harness);
  });
});

describe("guarded: each harness's fence words, most guarded first, each with what it means", () => {
  test('a harness that runs a brief says what it is in one line, and each word of its fence once, never falling in rank', () => {
    for (const [harness, declaration] of Object.entries(HARNESS_DECLARATIONS).filter(([, d]) => d.runsBrief === true)) {
      assert.ok(declaration.note !== undefined && declaration.note.length > 0 && !declaration.note.includes('\n'), harness);
      const words = declaration.guarded?.map((g) => g.word) ?? [];
      assert.deepEqual([...words].sort(), [...declaration.knobs!.fence.words].sort(), harness);
      const ranks = words.map((word) => fenceReach(harness)!.rank[word]);
      assert.deepEqual(
        ranks,
        [...ranks].sort((a, b) => a - b),
        harness,
      );
      for (const { meaning } of declaration.guarded!) assert.ok(meaning.length > 0 && !meaning.includes('\n'), harness);
    }
  });
  test("Claude Code's held mode is the second most guarded, after the mode that changes nothing", () => {
    assert.deepEqual(
      HARNESS_DECLARATIONS.claude.guarded!.slice(0, 2).map((g) => g.word),
      ['plan', fenceReach('claude')!.held],
    );
  });
});

describe('unruledIn: the first character of a path a permission rule cannot carry, on a harness whose fence takes a rule', () => {
  test('the first character of a path a permission rule cannot carry is answered on Claude Code, a whitespace but the space among them, and nothing on a clean path', () => {
    for (const harness of CLAUDES) {
      assert.equal(unruledIn(harness, '/srv/my wf(1)/runs'), '(', harness);
      assert.equal(unruledIn(harness, '/srv/wf*'), '*', harness);
      assert.equal(unruledIn(harness, '/srv/a\\b'), '\\', harness);
      assert.equal(unruledIn(harness, `/srv/my${String.fromCharCode(0xa0)}wf`), String.fromCharCode(0xa0), harness);
      assert.equal(unruledIn(harness, '/srv/my wf,{a}'), undefined, harness);
    }
  });
  test('a harness whose fence takes no rule naming a path answers nothing, whatever the path holds', () => {
    for (const harness of ['codex', 'command', 'a2a:x', 'nobody']) assert.equal(unruledIn(harness, '/srv/wf*(x)'), undefined, harness);
  });
});

describe("fenceReach: what each mode of a harness's fence does — held, unasking, writing, refusing, unfenced and granted", () => {
  test("Claude Code's held mode leads the modes that ask nobody, each one of its words; acceptEdits is the first that writes; bypassPermissions alone is widest", () => {
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
  });
  test('codex holds no session to a mode and asks nobody in the background; workspace-write is the first sandbox that writes', () => {
    const { rank, held, unasking, writes } = fenceReach('codex')!;
    assert.equal(held, undefined);
    assert.deepEqual(unasking, []);
    assert.equal(writes, rank['workspace-write']);
  });
  test('the modes that refuse what no allow rule reaches are those that decide by rule alone: above none, and never plan', () => {
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
  test('the tools a session calls with no allow rule are the three that read and a skill load, and never Bash', () => {
    for (const harness of CLAUDES) {
      assert.deepEqual([...fenceReach(harness)!.unfenced].sort(), ['Glob', 'Grep', 'Read', 'Skill'], harness);
      assert.ok(!fenceReach(harness)!.unfenced.includes('Bash'), `${harness}: Bash takes a rule`);
    }
  });
  test('the one mode that grants a tool of its own is the one that writes unasked, and it grants the Edit family and nothing else', () => {
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
  });
  test("codex's sandbox takes no allow rule, so it refuses in no word and leaves no tool unruled or granted", () => {
    assert.deepEqual(fenceReach('codex')!.refusing, []);
    assert.deepEqual(fenceReach('codex')!.unfenced, []);
    assert.deepEqual(fenceReach('codex')!.granted, {});
  });
});
