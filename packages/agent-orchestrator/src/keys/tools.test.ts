/**
 * The rules `nemia decide` words for a call the harness denied: `allowRuleOf`, the rule a folder's `allowedTools:` takes for it, and
 * `disallowedBy`, the step's own deny rule that may have denied it, which no allow rule overrides. One table, a row a call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowRuleOf, disallowedBy, type DeniedAt } from './tools.ts';
import { parseWorkflow } from '../workflow/step-file.ts';

/** A run's step directory, as a run under `~/.agent-workflows` makes it. */
const RUN: DeniedAt = { cwd: '/home/me/.agent-workflows/worktrees/r-7/implement', runId: 'r-7' };
/** A shorter one, for the deny rules. */
const AT: DeniedAt = { cwd: '/w/r-7/implement', runId: 'r-7' };

/** A step whose `allowedTools:` is `rule`, as a folder reads it: refused when the parser would not take the rule. */
const allowedAs = (rule: string) => parseWorkflow('review', `---\nplace: git\nallowedTools: ${rule}\n---\nDo it.\n`).allowedTools;

test('`allowRuleOf` and `disallowedBy`: the rule a denied call is allowed by, and the deny rule that denied it', async (t) => {
  const allows: Array<[row: string, denied: string, at: DeniedAt | undefined, rule: string]> = [
    ['a Write as Edit, from the root', 'Write(/tmp/w/notes.md)', undefined, 'Edit(//tmp/w/notes.md)'],
    ['a MultiEdit as Edit', 'MultiEdit(/tmp/w/a.ts)', undefined, 'Edit(//tmp/w/a.ts)'],
    ['a NotebookEdit as Edit', 'NotebookEdit(/tmp/w/n.ipynb)', undefined, 'Edit(//tmp/w/n.ipynb)'],
    ['a relative path as written', 'Edit(src/a.ts)', undefined, 'Edit(src/a.ts)'],
    ['a path already from the root keeps its two slashes', 'Write(//tmp/x)', undefined, 'Edit(//tmp/x)'],
    ['a Read from the root', 'Read(/home/me/.ssh/config)', undefined, 'Read(//home/me/.ssh/config)'],
    ['a command by its first word and what follows', 'Bash(pytest)', undefined, 'Bash(pytest:*)'],
    ['a skill as denied', 'Skill(look)', undefined, 'Skill(look)'],
    ['a bare tool as denied', 'SendMessage', undefined, 'SendMessage'],
    ['an MCP tool as denied', 'mcp__playwright__browser_click', undefined, 'mcp__playwright__browser_click'],
    ['a path with brackets in it', 'Write(/tmp/a (copy).md)', undefined, 'Edit(//tmp/a (copy).md)'],
    ['inside the step directory: from it', `Write(${RUN.cwd}/notes.md)`, RUN, 'Edit(notes.md)'],
    ['deeper inside it', `Write(${RUN.cwd}/docs/a.md)`, RUN, 'Edit(docs/a.md)'],
    [
      "the run's artifacts: its id as *",
      'Write(/home/me/.agent-workflows/runs/r-7/artifacts/implement/shot.png)',
      RUN,
      'Edit(//home/me/.agent-workflows/runs/*/artifacts/implement/shot.png)',
    ],
    [
      "a sibling's worktree",
      'Read(/home/me/.agent-workflows/worktrees/r-7/plan/PLAN.md)',
      RUN,
      'Read(//home/me/.agent-workflows/worktrees/*/plan/PLAN.md)',
    ],
    [
      "a directory whose name starts as the cwd's is not in it",
      'Write(/home/me/.agent-workflows/worktrees/r-7/implement-2/x)',
      RUN,
      'Edit(//home/me/.agent-workflows/worktrees/*/implement-2/x)',
    ],
    ["a part is the run's id whole, or it is kept", 'Write(/tmp/r-70/x)', RUN, 'Edit(//tmp/r-70/x)'],
    ['a command, in a run', 'Bash(pytest)', RUN, 'Bash(pytest:*)'],
  ];
  for (const [row, denied, at, rule] of allows)
    await t.test(`allow: ${row}`, () => {
      assert.equal(allowRuleOf(denied, at), rule);
      const oneParenthesisPair = !/\(.*\(/.test(rule);
      if (oneParenthesisPair) assert.deepEqual(allowedAs(rule), [rule], 'a rule `allowedTools:` takes');
    });

  const denies: Array<[row: string, denied: string, rules: string[], at: DeniedAt | undefined, by: string | undefined]> = [
    ['a bare tool', 'SendMessage', ['Bash(npm run build)', 'SendMessage'], undefined, 'SendMessage'],
    ["the command's first word is all the call keeps", 'Bash(npm)', ['Bash(npm run build)'], undefined, 'Bash(npm run build)'],
    ['a rule on a command and what follows', 'Bash(git)', ['Bash(git push:*)'], undefined, 'Bash(git push:*)'],
    ['the bare tool covers its commands', 'Bash(rm)', ['Bash'], undefined, 'Bash'],
    ['an Edit rule covers every file-editing tool', 'Write(/etc/hosts)', ['Edit(//etc/**)'], undefined, 'Edit(//etc/**)'],
    ["a relative rule is the session's directory's", 'Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)'], AT, 'Edit(secrets/**)'],
    ['a name with no slash, at any depth', 'Read(/w/r-7/implement/deep/.env)', ['Read(.env)'], AT, 'Read(.env)'],
    ['a directory names what is under it', 'Read(/w/r-7/implement/a/b.ts)', ['Read(//w/r-7/implement/a)'], AT, 'Read(//w/r-7/implement/a)'],
    ['a skill', 'Skill(look)', ['Skill(look)'], undefined, 'Skill(look)'],
    [
      "an MCP call by its tool's parameter rule",
      'mcp__playwright__browser_navigate',
      ['Bash(cd:*)', 'mcp__playwright__browser_navigate(url:*:8787*)'],
      undefined,
      'mcp__playwright__browser_navigate(url:*:8787*)',
    ],
    [
      'none: a rule on another MCP tool',
      'mcp__playwright__browser_click',
      ['mcp__playwright__browser_navigate(url:*:8787*)'],
      undefined,
      undefined,
    ],
    ['none: a bare call by a rule naming more', 'SendMessage', ['SendMessage(to:*)'], undefined, undefined],
    ['none: another command', 'Bash(pytest)', ['Bash(npm run build)', 'SendMessage'], undefined, undefined],
    ['none: another tool', 'Bash(npm)', ['Read'], undefined, undefined],
    ['none: another path', 'Write(/tmp/x)', ['Edit(//etc/**)'], undefined, undefined],
    ['none: a path is matched whole', 'Write(/etc/hostsx)', ['Edit(//etc/hosts)'], undefined, undefined],
    ['none: an Edit rule is no Read rule', 'Read(/w/r-7/implement/a.ts)', ['Edit(**)'], AT, undefined],
    ['none: another relative path', 'Write(/w/r-7/implement/src/a.ts)', ['Edit(secrets/**)'], AT, undefined],
    ['none: a relative rule with no directory', 'Write(/w/r-7/implement/secrets/k.pem)', ['Edit(secrets/**)'], undefined, undefined],
    ["none: `~` is nobody's here", 'Write(/home/me/x)', ['Edit(~/x)'], AT, undefined],
    ['none: another skill', 'Skill(look)', ['Skill(shadcn)'], undefined, undefined],
    ['none: no rules', 'SendMessage', [], undefined, undefined],
  ];
  for (const [row, denied, rules, at, by] of denies)
    await t.test(`deny: ${row}`, () => {
      assert.equal(disallowedBy(denied, rules, at), by);
    });
});
