/**
 * An agent's file, as tables: what it says read as its keys (`parseAgent`); each line it may not say, refused by its rule, the rule's code
 * (F11, F13, F21) in the row's name; a draft written back as its file (`renderAgent`) and what a draft may not send; a step resolved with
 * the agent it names, and refused where the two cannot run together; the folder of agents beside the workflows; and the card an agent is
 * listed by (`agentCard`, `cardSkills`, `skillEntryOf`). A refusal is asserted by its kind, its exit code and what it names.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { names } from '../../test/assessed.ts';
import {
  AGENT_KEYS,
  AGENT_OWN_KEYS,
  agentCard,
  agentDraftOf,
  agentsDir,
  ownSkill,
  parseAgent,
  parseWorkflow,
  renderAgent,
  renderStep,
  skillEntryOf,
  STEP_KEYS,
  WorkflowError,
  type Agent,
  type Agents,
  type Workflow,
} from '../workflow.ts';
import { FrozenStepSchema, loadWorkflows, workflowFolder, workflowsIn } from '../folder/folder.store.ts';
import { agentsFor, agentVersion, loadAgents } from './read.store.ts';
import { cardSkills, skillsFor } from '../skills/read.store.ts';
import { filedConfig } from '../filed/filed.ts';
import { headedLayers } from '../workflow/index.ts';

const ROOT = scratch('wf-agents-table-');
process.env.WF_ROOT = ROOT;
const { writeWorkflow } = await import('../runner.ts');

/** A tree of files under a fresh directory, each written from `files` by its path from it; the directory. */
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'tree-'));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

/** What `fn` is refused with: a `WorkflowError`, exit 2, and its message. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    assert.equal(err.exitCode, 2);
    return err.message;
  }
  return assert.fail('it was not refused');
}

/** A refusal row: its name, what is refused, and what the refusal names — the file, the line, the fix. */
type Refused = readonly [name: string, refused: () => unknown, ...facts: string[]];

/** Each row of `rows` a subtest of `t`, refused as `refusal` says and naming each of its facts. */
async function refusedRows(t: TestContext, rows: readonly Refused[]): Promise<void> {
  for (const [name, refused, ...facts] of rows) await t.test(name, () => names(refusal(refused), ...facts));
}

/** Each row of `rows` a subtest of `t`: its name, and what it asserts. */
async function rows(t: TestContext, all: ReadonlyArray<readonly [string, () => void]>): Promise<void> {
  for (const [name, body] of all) await t.test(name, body);
}

const agent = (name: string, text: string, read?: (file: string) => string | undefined): Agent => parseAgent(name, text, read);

/** The agents a step may name, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents => new Map(Object.entries(files).map(([name, text]) => [name, agent(name, text)]));

const IMPLEMENTER =
  '---\ndescription: Does the work\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\nImplement what you are asked.\n';

/** A SKILL.md named `name`, with `extra` lines in its frontmatter. */
const SKILL = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Use this when ${name.replace(/-/g, ' ')} is asked.\n${extra}---\nHow to ${name.replace(/-/g, ' ')}.\n`;

/** A team of one step `build` naming `agent: builder` in `<dir>/workflows/team`, the agent and skills beside it as `files` gives them. */
const team = (builder: string, files: Record<string, string>, step = "---\nagent: builder\n---\nThe step's own note.\n"): string =>
  path.join(
    tree({ 'workflows/team/build.md': step.replace(/^---\n/, '---\nplace: git\n'), 'workflows/agents/builder.md': builder, ...files }),
    'workflows',
    'team',
  );

/**
 * The agent's own keys: `role`, `description`, `skills`, `harnessPrompt`, `mcp` and `overridable` describe the agent itself, and a step
 * sets none of them for its agent; a step's own `skills:` and `mcp:` add to its agent's. Every other agent key is one a step may set.
 */
const AGENT_OWN = ['role', 'description', 'skills', 'harnessPrompt', 'mcp', 'overridable'];

/** A Claude Code project subagent as its /agents wizard writes one: a name, a description with an example, tools, a model, a colour. */
const WIZARD =
  '---\nname: code-reviewer\ndescription: Use this agent when a change needs a second look. Example: after a feature is written.\ntools: Read, Grep, Glob, Bash\nmodel: sonnet\ncolor: blue\n---\nYou are a careful code reviewer.\n';

test('parseAgent: an agent file read as its role keys, its own lines and its instructions', async (t) => {
  await rows(t, [
    [
      'its role keys as written, its description, and its body as its instructions',
      () => {
        const a = agent('implementer', IMPLEMENTER);
        assert.equal(a.name, 'implementer');
        assert.equal(a.description, 'Does the work');
        assert.deepEqual(a.keys, { harness: 'claude', model: 'opus', effort: 'high', context: '200k', disallowedTools: 'SendMessage' });
        assert.equal(a.body, 'Implement what you are asked.');
        assert.equal(agent('quiet', '---\nmodel: opus\n---\n').body, '', 'an agent may set only how its steps run');
      },
    ],
    [
      "the role keys are the keys a step has, but for wiring and the agent's own keys",
      () => {
        assert.deepEqual([...AGENT_OWN_KEYS], AGENT_OWN);
        for (const key of AGENT_KEYS) if (!AGENT_OWN.includes(key)) assert.ok((STEP_KEYS as readonly string[]).includes(key), key);
        for (const key of AGENT_OWN.filter((own) => own !== 'skills' && own !== 'mcp'))
          assert.ok(!(STEP_KEYS as readonly string[]).includes(key), `${key} describes the agent, and is no step's key`);
        for (const own of ['skills', 'mcp'] as const) {
          assert.ok(STEP_KEYS.includes(own), `a step's \`${own}:\` is a key of its own, which adds to its agent's`);
          assert.ok(!AGENT_KEYS.filter((key) => !AGENT_OWN.includes(key)).includes(own), 'and no role key a step takes from it');
        }
        assert.ok(!(AGENT_KEYS as readonly string[]).includes('card'), '`card` is no agent key');
      },
    ],
    [
      'skills by name and a harness prompt, each its own line and no role key',
      () => {
        const a = agent(
          'builder',
          '---\nskills: review-a-change, write-a-note\nharnessPrompt: no-coding\ntools: Read, Skill\n---\nYou build.\n',
        );
        assert.deepEqual(a.skills, ['review-a-change', 'write-a-note']);
        assert.equal(a.harnessPrompt, 'no-coding');
        assert.equal('skills' in a.keys, false, 'no role key: a step does not inherit it as one of its own');
        assert.deepEqual(
          agent('builder', '---\nskills: write-a-note, app:y\n---\nx\n').skills,
          ['write-a-note', 'app:y'],
          'a skill named with its folder',
        );
        assert.deepEqual(
          agent('builder', '---\nskills: write-a-note\n---\nx\n').skills,
          ['write-a-note'],
          'no `tools:` is every tool, Skill among them',
        );
        assert.equal(agent('builder', '---\nharnessPrompt: replace\n---\nYou are the whole prompt.\n').harnessPrompt, 'replace');
      },
    ],
    [
      'the former `systemPrompt:` line (FORMER_OWN_KEYS), each former word read as the one it is now (harnessPromptNamed)',
      () => {
        for (const [former, now] of [
          ['default', 'keep'],
          ['no-coding', 'no-coding'],
          ['own', 'replace'],
        ] as const) {
          const a = agent('builder', `---\nsystemPrompt: ${former}\n---\nYou build.\n`);
          assert.equal(a.harnessPrompt, now, `systemPrompt: ${former}`);
          assert.equal('systemPrompt' in a, false, 'nothing reads the former field');
          assert.equal(
            renderAgent({ name: 'builder', harnessPrompt: a.harnessPrompt, keys: {}, body: a.body }),
            `---\nharnessPrompt: ${now}\n---\nYou build.\n`,
          );
        }
      },
    ],
    [
      'a codex agent names its sandbox as `sandbox:`, and the former `permissionMode:` line is read as it, whatever the word',
      () => {
        assert.deepEqual(
          agent('reviewer', '---\ndescription: Reviews\nharness: codex\nsandbox: read-only\n---\nReview the change.\n').keys,
          {
            harness: 'codex',
            sandbox: 'read-only',
          },
        );
        assert.deepEqual(agent('reviewer', '---\nharness: codex\npermissionMode: read-only\n---\nReview.\n').keys, {
          harness: 'codex',
          sandbox: 'read-only',
        });
        assert.deepEqual(agent('reviewer', '---\npermissionMode: bypassPermissions\nharness: codex\n---\nReview.\n').keys, {
          harness: 'codex',
          sandbox: 'danger-full-access',
        });
        assert.deepEqual(
          agent('reviewer', '---\nharness: codex\npermissionMode: dontAsk\n---\nReview.\n').keys,
          { harness: 'codex', sandbox: 'dontAsk' },
          'for the runtime to judge at `nemia start`',
        );
      },
    ],
    [
      "mcp: is read as the server names it lists, the agent's own line, and written back as it was",
      () => {
        const scout = agent('scout', '---\ndescription: Looks.\nmcp: playwright, docs_2\n---\nYou look.\n');
        assert.deepEqual(scout.mcp, ['playwright', 'docs_2']);
        assert.equal(Object.hasOwn(scout.keys, 'mcp'), false, "the agent's own line, and no role key a step takes");
        const draft = agentDraftOf(
          'scout',
          renderAgent(agentDraftOf('scout', '---\ndescription: Looks.\nmcp: playwright, docs_2\n---\nYou look.\n')),
        );
        assert.equal(draft.mcp, 'playwright, docs_2');
        assert.match(renderAgent(draft), /^mcp: playwright, docs_2$/m);
        assert.equal(agent('scout', '---\ndescription: Looks.\n---\nYou look.\n').mcp, undefined, 'no line');
        assert.equal(agentDraftOf('scout', 'You look.\n').mcp, null);
        assert.doesNotMatch(renderAgent({ name: 'scout', mcp: null, keys: {}, body: 'You look.' }), /mcp/);
      },
    ],
    [
      "an agent Claude Code's /agents wizard wrote into .claude/agents/ runs as it is: `color` read and ignored",
      () => {
        const repo = tree({ '.claude/agents/code-reviewer.md': WIZARD });
        const home = tree({ 'workflows/team/review.md': '---\nplace: git\nagent: code-reviewer\n---\nReview the change.\n' });
        const [step] = loadWorkflows(path.join(home, 'workflows', 'team'), { repo, home });
        assert.deepEqual([step.model, step.tools, step.permissionMode], ['sonnet', ['Read', 'Grep', 'Glob', 'Bash'], undefined]);
        const read = agentsFor(path.join(home, 'workflows', 'team'), { repo, home }).get('code-reviewer') as Agent;
        assert.equal(read.description, 'Use this agent when a change needs a second look. Example: after a feature is written.');
        assert.equal(read.body.trim(), 'You are a careful code reviewer.');
        assert.ok(!('color' in read.keys), 'not a role key: no step inherits it');
        assert.doesNotMatch(renderAgent({ name: read.name, description: read.description, keys: read.keys, body: read.body }), /color/);
      },
    ],
  ]);
});

/** Every step key an agent may not set: the wiring, which belongs on the step. */
const WIRING = [
  'after',
  'resume',
  'input',
  'place',
  'workspace',
  'writable',
  'reads',
  'slot',
  'denials',
  'check',
  'retries',
  'gate',
  'loop',
  'rounds',
  'budget',
  'deadlineSeconds',
  'tally',
];

test('REFUSED at shipped defaults: an agent file, one row per line it may not say', async (t) => {
  await t.test('every wiring key, by name, saying it belongs on the step', () => {
    assert.deepEqual(
      STEP_KEYS.filter((k) => !(AGENT_KEYS as readonly string[]).includes(k) && k !== ('agent' as string)).sort(),
      [...WIRING].sort(),
      'every key an agent may not set is wiring',
    );
    for (const key of WIRING)
      names(
        refusal(() => agent('implementer', `---\n${key}: something\n---\nImplement it.\n`)),
        'agents/implementer.md',
        `\`${key}\``,
        'wiring',
        'Move the line to each step',
      );
  });
  await refusedRows(t, [
    [
      "`agent:`, a step's key",
      () => agent('reviewer', '---\nagent: implementer\n---\nReview it.\n'),
      'agents/reviewer.md',
      '`agent`',
      "step's key",
    ],
    [
      'a key no agent has, naming the keys there are',
      () => agent('reviewer', '---\ncolour: red\n---\nReview it.\n'),
      'agents/reviewer.md',
      '`colour`',
      AGENT_KEYS.join(', '),
    ],
    ['`guide:`', () => agent('reviewer', '---\nguide: CLAUDE.md\n---\nReview it.\n'), 'agents/reviewer.md', '`guide`'],
    [
      '`maxAttempts:`, naming the retry',
      () => agent('reviewer', '---\nmaxAttempts: 1\n---\nReview it.\n'),
      '`maxAttempts`',
      'one attempt',
      '`nemia retry <run> <step>`',
    ],
    ['`background:`', () => agent('reviewer', '---\nbackground: true\n---\nReview it.\n'), '`background`', 'Agent SDK'],
    [
      'a context that is no number of tokens',
      () => agent('reviewer', '---\ncontext: loud\n---\nReview it.\n'),
      '`context: loud`',
      'number of tokens',
    ],
    [
      'a tool list on codex',
      () => agent('reviewer', '---\nharness: codex\ntools: Read\n---\nReview it.\n'),
      '`tools: Read`',
      'codex has none',
    ],
    ['a key set twice', () => agent('reviewer', '---\nmodel: opus\nmodel: sonnet\n---\nReview it.\n'), '`model`', 'twice'],
    [
      'a result schema not there',
      () => agent('reviewer', '---\noutput: review.schema.json\n---\nReview it.\n', () => undefined),
      '`output: review.schema.json`',
      'not there',
      'write it beside agents/reviewer.md',
    ],
    [
      'a leftover `card:` line, retired',
      () => agent('reviewer', '---\ndescription: Reviews\ncard: reviewer.skills.json\n---\nReview it.\n'),
      '`card`',
      'retired',
      'generated from its `skills:`',
      'Delete the line',
    ],
    ['a `card:` line at any value', () => agent('reviewer', '---\ncard: nothing\n---\n'), 'which is retired'],
    [
      'a `skills:` naming a card file',
      () => agent('reviewer', '---\ndescription: Reviews\nskills: reviewer.skills.json\n---\nReview it.\n'),
      '`skills: reviewer.skills.json`',
      'retired',
      'Delete the line, and reviewer.skills.json',
    ],
    [
      'a `skills:` naming a card file that is beside it',
      () => agent('builder', '---\nskills: builder.skills.json\n---\nx\n', () => '[]'),
      '`skills: builder.skills.json`',
      'names a card file, which is retired',
      "an agent's card is generated",
    ],
    ...(
      [
        ['maxTurns: 20', '`budget:` and `deadlineSeconds:`'],
        ['mcpServers: github', 'on an `mcp:` line'],
        ['hooks: lint', '`.claude/settings.json`'],
        ['memory: project', "no memory of an agent's own"],
        ['isolation: worktree', '`workspace:`'],
      ] as const
    ).map(([line, fix]): Refused => [
      `Claude Code's own subagent key \`${line}\`, saying what does it in a run`,
      () => agent('code-reviewer', `---\ndescription: Reviews.\n${line}\n---\nYou review.\n`),
      'agents/code-reviewer.md',
      `\`${line.split(':')[0]}\``,
      "Claude Code's own subagent key",
      fix,
    ]),
    [
      '`mcpServers:`, naming the `mcp:` line that does its work',
      () => agent('scout', '---\ndescription: Looks.\nmcpServers: github\n---\nYou look.\n'),
      'agents/scout.md',
      '`mcpServers`',
      '`.mcp.json`',
      'as `mcp: playwright`',
    ],
    [
      '`model: inherit`, with no parent to inherit from',
      () => agent('code-reviewer', WIZARD.replace('model: sonnet', 'model: inherit')),
      '`model: inherit`',
      'the model of the conversation that called it',
    ],
    [
      'a skill named in neither form',
      () => agent('builder', '---\nskills: write-a-note, ../app:y\n---\nx\n'),
      '`skills: write-a-note, ../app:y`',
      '`../app:y`',
      '`folder:name`',
    ],
    [
      'two skills of one bare name',
      () => agent('builder', '---\nskills: y, app:y\n---\nx\n'),
      'gives `y` and `app:y`, two skills named `y`',
    ],
    [
      'a skill name that is none',
      () => agent('builder', '---\nskills: Review A Change\n---\nx\n'),
      '`skills: Review A Change`',
      "not a skill's name",
    ],
    ['a skill named twice', () => agent('builder', '---\nskills: a-b, a-b\n---\nx\n'), 'names `a-b` twice'],
    ['a `skills:` naming none', () => agent('builder', '---\nskills: ,\n---\nx\n'), 'names no skill'],
    [
      'a harness prompt not one of the three',
      () => agent('builder', '---\nharnessPrompt: terse\n---\nx\n'),
      '`harnessPrompt: terse`',
      'keep, no-coding, replace',
    ],
    [
      'a former `systemPrompt:` word not one of the three',
      () => agent('builder', '---\nsystemPrompt: terse\n---\nx\n'),
      '`systemPrompt: terse`',
      'keep, no-coding, replace',
    ],
    [
      'a former word under the new key, `own`',
      () => agent('builder', '---\nharnessPrompt: own\n---\nx\n'),
      '`own` is the former word',
      '`systemPrompt:`',
      'write `harnessPrompt: replace`',
    ],
    [
      'a former word under the new key, `default`',
      () => agent('builder', '---\nharnessPrompt: default\n---\nx\n'),
      'write `harnessPrompt: keep`',
    ],
    [
      '`systemPrompt:` and `harnessPrompt:` both set, which are one key',
      () => agent('builder', '---\nsystemPrompt: own\nharnessPrompt: keep\n---\nx\n'),
      '`harnessPrompt: keep` and `systemPrompt: own`',
      'both set',
      'one key',
    ],
    ...['harnessPrompt: replace', 'systemPrompt: own'].map((line): Refused => [
      `\`${line}\` with no instructions: a session with no prompt at all`,
      () => agent('builder', `---\n${line}\n---\n`),
      `\`${line}\``,
      "in place of Claude Code's own prompt",
      'this agent has none',
    ]),
    [
      'F11: skills given with no `Skill` in its tools',
      () => agent('builder', '---\nskills: write-a-note\ntools: Read, Write\n---\nx\n'),
      '`skills: write-a-note`',
      '`tools: Read, Write`',
      'no `Skill`',
    ],
    [
      'F11: skills given with `Skill` denied',
      () => agent('builder', '---\nskills: write-a-note\ndisallowedTools: Skill\n---\nx\n'),
      '`disallowedTools: Skill` denies `Skill`',
    ],
    [
      'a codex agent with skills, which codex loads none of',
      () => agent('builder', '---\nharness: codex\nskills: write-a-note\n---\nx\n'),
      '`skills: write-a-note`',
      'Claude Code skills',
      'codex loads none',
    ],
    [
      'a codex agent with a harness prompt',
      () => agent('builder', '---\nharness: codex\nharnessPrompt: no-coding\n---\nx\n'),
      '`harnessPrompt: no-coding`',
      'codex is handed its instructions in the brief',
    ],
    [
      'an mcp: line with an empty name',
      () => agent('scout', '---\ndescription: Looks.\nmcp: a,, b\n---\nYou look.\n'),
      '`mcp: a,, b` has an empty name',
      '`.mcp.json`',
    ],
    [
      'an mcp: line with what is no name',
      () => agent('scout', '---\ndescription: Looks.\nmcp: a, b c\n---\nYou look.\n'),
      'has `b c`',
      "not a server's name",
    ],
    [
      'an mcp: line naming a server twice',
      () => agent('scout', '---\ndescription: Looks.\nmcp: a, b, a\n---\nYou look.\n'),
      'names `a` twice',
      'Name it once',
    ],
    [
      'an mcp: line on a remote agent, which loads no server',
      () => agent('scout', '---\ndescription: Looks.\nharness: a2a:helper\nmcp: playwright\n---\nYou look.\n'),
      'agents/scout.md: `mcp: playwright`',
      '`harness: a2a:helper` is a remote A2A agent',
      'Delete the line',
    ],
    [
      '`sandbox:` on an agent that runs on Claude Code',
      () => agent('writer', '---\nsandbox: read-only\n---\nWrite.\n'),
      "is a codex step's sandbox, and this step runs on claude",
    ],
    [
      '`permissionMode:` and `sandbox:` both on a codex agent',
      () => agent('reviewer', '---\nharness: codex\npermissionMode: read-only\nsandbox: read-only\n---\nReview.\n'),
      'are both set, and on codex they are one key',
    ],
  ]);
});

test('renderAgent: a draft written as its file, and read back as the same agent', async (t) => {
  await rows(t, [
    [
      'the role and the description first, the keys in their order, an unset key not at all, and the fence in its block',
      () => {
        const text = renderAgent({
          name: 'a',
          description: 'Use it.',
          keys: { tools: 'Read', model: 'opus', effort: null },
          body: '  Do it.  ',
        });
        assert.equal(text, '---\ndescription: Use it.\nmodel: opus\nclaude:\n  fence:\n    tools: Read\n---\nDo it.\n');
        const held = renderAgent({
          name: 'planner',
          role: 'Product engineer',
          description: 'Use it.',
          keys: { model: 'opus' },
          body: 'Ask.',
        });
        assert.equal(held, '---\nrole: Product engineer\ndescription: Use it.\nmodel: opus\n---\nAsk.\n');
        assert.equal(parseAgent('planner', held).role, 'Product engineer');
        assert.equal(parseAgent('planner', text.replace('description', 'role')).role, 'Use it.');
      },
    ],
    [
      'a body that looks like frontmatter is kept a body',
      () => {
        assert.equal(
          renderAgent({ name: 'a', keys: {}, body: '---\nlooks like frontmatter' }),
          '---\n\n---\n---\nlooks like frontmatter\n',
        );
        assert.deepEqual(
          parseAgent('a', renderAgent({ name: 'a', keys: {}, body: '---\nlooks like frontmatter' })).body,
          '---\nlooks like frontmatter',
        );
      },
    ],
    [
      'a value YAML would read otherwise is quoted, one with a line break written as a block, and a line break makes no key',
      () => {
        const said = 'Builds the change a spec describes: cuts it into commits, and # tests each.';
        const quoted = renderAgent({ name: 'a', description: said, keys: { model: 'opus' }, body: 'x' });
        assert.equal(quoted, `---\ndescription: "${said}"\nmodel: opus\n---\nx\n`);
        assert.equal(parseAgent('a', quoted).description, said);
        const lines = renderAgent({ name: 'a', role: 'Product\nengineer', description: 'one\ntwo', keys: {}, body: 'x' });
        assert.equal(lines, '---\nrole: |-\n  Product\n  engineer\ndescription: |-\n  one\n  two\n---\nx\n');
        assert.equal(parseAgent('a', lines).description, 'one\ntwo');
        assert.equal(parseAgent('a', lines).role, 'Product\nengineer');
        const smuggled = renderAgent({ name: 'a', keys: { model: 'opus\ncheck: rm -rf /' }, body: 'x' });
        assert.ok(!/^check:/m.test(smuggled), `a line break makes no key of its own: ${smuggled}`);
      },
    ],
    [
      'skills and a harness prompt written as their own lines, each word of the three',
      () => {
        const written = renderAgent({
          name: 'builder',
          skills: 'review-a-change, write-a-note',
          harnessPrompt: 'no-coding',
          keys: { tools: 'Read, Skill' },
          body: 'You build.\n',
        });
        assert.equal(
          written,
          '---\nskills: review-a-change, write-a-note\nharnessPrompt: no-coding\nclaude:\n  fence:\n    tools: Read, Skill\n---\nYou build.\n',
        );
        assert.deepEqual(parseAgent('builder', written).skills, ['review-a-change', 'write-a-note']);
        for (const word of ['keep', 'no-coding', 'replace']) {
          const read = parseAgent('builder', `---\nharnessPrompt: ${word}\n---\nYou build.\n`);
          assert.equal(read.harnessPrompt, word);
          assert.equal(
            renderAgent({ name: 'builder', harnessPrompt: read.harnessPrompt, keys: {}, body: read.body }),
            `---\nharnessPrompt: ${word}\n---\nYou build.\n`,
          );
        }
      },
    ],
  ]);
});

test('REFUSED: a draft renderAgent will not write, one row per line', async (t) => {
  const keyed = (keys: Record<string, string>, description?: string) => () => renderAgent({ name: 'a', description, keys, body: 'x' });
  await refusedRows(t, [
    ['`agent:` among the keys', keyed({ agent: 'b' }), 'agents/a.md', '`agent`', "step's key"],
    ['wiring among the keys', keyed({ check: 'npm test' }), '`check` is wiring', 'belongs on the step'],
    ['a key no agent has', keyed({ modle: 'opus' }), '`modle` is not a key an agent has'],
    ['the description among the keys', keyed({ description: 'x' }), "`description` is the agent's own line"],
    ['the role among the keys', keyed({ role: 'x' }), "`role` is the agent's own line", 'give it as the role, once'],
    [
      'the former `systemPrompt` among the keys',
      () => renderAgent({ name: 'builder', keys: { systemPrompt: 'own' } as never, body: 'x' }),
      '`systemPrompt`',
      "`harnessPrompt`'s former name",
      'nothing writes',
    ],
    [
      'the former `systemPrompt` as its own line',
      () => renderAgent({ name: 'builder', systemPrompt: 'own', keys: {}, body: 'x' } as never),
      '`systemPrompt`',
      "`harnessPrompt`'s former name",
    ],
    [
      '`mcp` among the keys',
      () => renderAgent({ name: 'scout', keys: { mcp: 'a' } as never, body: 'x' }),
      'agents/scout.md: `mcp` is the agent',
      'not one of its role keys',
      'the MCP servers, once',
    ],
    [
      'a `skills:` naming a card file',
      () => renderAgent({ name: 'builder', skills: 'builder.skills.json', keys: {}, body: 'x\n' }),
      '`skills: builder.skills.json`',
      'names a card file, which is retired',
      'reload it, and save again',
    ],
    [
      'a `card:` line',
      () => renderAgent({ name: 'builder', card: 'builder.skills.json', keys: {}, body: 'x\n' } as never),
      '`card: builder.skills.json`',
      'names a card file, which is retired',
    ],
  ]);
});

/** A factory's hire of `name` into the workflow build's step `step`, as `nemia start --factory acme` hands it to the parser. */
const hire = (name: string, step = 'implement') => ({ agent: name, factory: 'acme', step: `build/${step}` });

/** The scout, with `lines` in its frontmatter, and the step `look` naming it (or no agent) with `step` in its own. */
const scoutWith = (lines: string) => agent('scout', `---\ndescription: Looks.\n${lines}---\nYou look.\n`);
const lookOf = (named: Agent | undefined, lines = ''): Workflow =>
  parseWorkflow(
    'look',
    `---\nplace: git\n${named ? `agent: ${named.name}\n` : ''}${lines}---\nLook.\n`,
    undefined,
    named && new Map([[named.name, named]]),
  );
const filed = (step: Workflow) =>
  filedConfig(
    step,
    [step],
    { gates: [] },
    { model: undefined, budgetUsd: undefined, runArtifacts: '/runs/r/artifacts', inbox: '/inbox', own: {}, landingDenied: () => [] },
  );
const fromRecord = (step: Workflow): Workflow => Schema.decodeUnknownSync(FrozenStepSchema)(JSON.parse(JSON.stringify(step))) as Workflow;

test("a step resolved with the agent it names: the agent's keys and words, the step's own winning and its own kept", async (t) => {
  const agents = agentsOf({ implementer: IMPLEMENTER });
  await rows(t, [
    [
      "the agent's role keys, the step's own winning, and the agent's words told first",
      () => {
        const build = parseWorkflow(
          'build',
          '---\nplace: git\nagent: implementer\nafter: plan\nmodel: sonnet\ncheck: npm test\n---\nBuild the parser first.\n',
          undefined,
          agents,
        );
        assert.equal(build.name, 'build', "nothing ties a step's name to its agent's");
        assert.deepEqual([build.harness, build.model, build.effort, build.context], ['claude', 'sonnet', 'high', 200000]);
        assert.deepEqual([build.disallowedTools, build.after, build.check], [['SendMessage'], ['plan'], 'npm test']);
        assert.equal(
          build.body,
          headedLayers([
            ['instructions', 'Implement what you are asked.'],
            ['policy', 'Build the parser first.'],
          ]),
        );
        assert.deepEqual(build.agent, {
          name: 'implementer',
          keys: ['after', 'place', 'model', 'check'],
          body: 'Build the parser first.',
          given: { harness: 'claude', effort: 'high', context: '200k', disallowedTools: 'SendMessage' },
          instructions: 'Implement what you are asked.',
          mcp: [],
        });
        const bare = parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, agents);
        assert.equal(
          bare.body,
          headedLayers([['instructions', 'Implement what you are asked.']]),
          "no note of its own: the agent's words alone",
        );
        assert.equal(bare.model, 'opus');
        const same = parseWorkflow(
          'build',
          `---\nplace: git\nharness: claude\nmodel: opus\neffort: high\ncontext: 200k\ndisallowedTools: SendMessage\n---\n${headedLayers([['instructions', 'Implement what you are asked.']])}\n`,
        );
        const { agent: _agent, ...resolved } = bare;
        assert.deepEqual(resolved, same, 'resolved, it is the step written out whole');
        assert.equal(same.agent, undefined, 'a step with no agent carries no `agent`');
      },
    ],
    [
      'a step whose file names no agent, hired one, is resolved exactly as if its file said `agent:` it',
      () => {
        const text = '---\nplace: git\nmodel: sonnet\n---\nBuild the parser first.\n';
        const hired = parseWorkflow('implement', text, undefined, agents, undefined, hire('implementer'));
        assert.deepEqual(
          hired,
          parseWorkflow(
            'implement',
            '---\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n',
            undefined,
            agents,
          ),
        );
        assert.equal(hired.agent?.name, 'implementer');
        const bare = parseWorkflow('implement', '---\nafter: plan\nplace: git\n---\n', undefined, agents, undefined, hire('implementer'));
        assert.equal(bare.body, headedLayers([['instructions', 'Implement what you are asked.']]), "told its hire's words");
        assert.equal(parseWorkflow('implement', text, undefined, agents).agent, undefined, 'unhired, it names no agent');
      },
    ],
    [
      "renderStep writes `agent:`, the step's own keys and its own note — never the agent's",
      () => {
        const text = '---\nafter: plan\nresume: plan\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild the parser first.\n';
        const build = parseWorkflow('build', text, undefined, agents);
        const rendered = renderStep(build);
        assert.equal(rendered, text);
        assert.deepEqual(parseWorkflow('build', rendered, undefined, agents), build, 'it reads back as the same step');
        assert.equal(
          renderStep(parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, agents)),
          '---\nplace: git\nagent: implementer\n---\n\n',
        );
        assert.equal(
          renderStep({ ...build, effort: 'low', after: ['plan', 'lint'] }),
          '---\nafter: plan, lint\nresume: plan\nplace: git\nagent: implementer\nmodel: sonnet\neffort: low\n---\nBuild the parser first.\n',
          "a key changed since it was read is the step's own now",
        );
        const derived = parseWorkflow('build', '---\nresume: plan\nplace: git\nagent: implementer\n---\n', undefined, agents);
        assert.deepEqual(derived.after, ['plan']);
        assert.equal(
          renderStep(derived),
          '---\nresume: plan\nplace: git\nagent: implementer\n---\n\n',
          'an after: made of resume: is not written',
        );
        assert.equal(
          renderStep({ name: 'build', after: [], place: 'git', agent: 'implementer', model: 'sonnet', body: 'Build it.' }),
          '---\nplace: git\nagent: implementer\nmodel: sonnet\n---\nBuild it.\n',
          'a draft naming its agent is its own keys and note',
        );
      },
    ],
    [
      "a schema the agent's output: names is read beside the agent, one the step names beside the step, and the two merged",
      () => {
        const dir = tree({
          'agents/reviewer.md': '---\noutput: review.schema.json\n---\nReview it.\n',
          'agents/review.schema.json':
            '{"type":"object","properties":{"verdict":{"type":"string"}},"required":["verdict"],"additionalProperties":false}',
          'dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
          'dev/check.md': '---\nplace: git\nagent: reviewer\nafter: implement\n---\n',
          'dev/judge.md': '---\nplace: git\nagent: reviewer\nafter: implement\noutput: judge.schema.json\n---\n',
          'dev/judge.schema.json':
            '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false}',
        });
        const steps = loadWorkflows(path.join(dir, 'dev'));
        const check = steps.find((s) => s.name === 'check')!;
        assert.equal(check.output?.file, 'review.schema.json');
        assert.deepEqual(Object.keys((check.output.schema as { properties: object }).properties), ['verdict']);
        const judge = steps.find((s) => s.name === 'judge')!;
        assert.deepEqual(Object.keys((judge.output!.schema as { properties: object }).properties), ['verdict', 'ok']);
        assert.deepEqual(judge.output!.schema.required, ['verdict', 'ok']);
        assert.equal(judge.output!.file, 'judge.schema.json', "the step's own line is what its file says");
        assert.deepEqual(judge.output!.owners, {
          verdict: { by: 'agent', name: 'reviewer', file: 'review.schema.json' },
          ok: { by: 'step', name: 'judge', file: 'judge.schema.json' },
        });
      },
    ],
    [
      "a codex agent's sandbox is its steps', and a step's own former `permissionMode:` line on codex is read as its own sandbox",
      () => {
        const codexAgents = agentsOf({
          reviewer: '---\ndescription: Reviews\nharness: codex\nsandbox: read-only\n---\nReview the change.\n',
        });
        const review = parseWorkflow('review', '---\nplace: git\nagent: reviewer\n---\n', undefined, codexAgents);
        assert.deepEqual([review.harness, review.sandbox, review.permissionMode], ['codex', 'read-only', undefined]);
        assert.deepEqual(review.agent?.given, { harness: 'codex', sandbox: 'read-only' });
        const own = parseWorkflow('review', '---\nplace: git\nagent: reviewer\npermissionMode: read-only\n---\n', undefined, codexAgents);
        assert.deepEqual([own.sandbox, own.permissionMode, own.agent?.keys], ['read-only', undefined, ['place', 'sandbox']]);
      },
    ],
    [
      "an agent with no fence moves to the other harness, the step's fence its own, under either name; a step with none takes its agent's",
      () => {
        const fenced = agentsOf({
          implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
          mover: '---\nharness: claude\n---\nMove.\n',
        });
        for (const line of ['permissionMode: read-only', 'sandbox: read-only']) {
          const step = parseWorkflow('build', `---\nplace: git\nagent: mover\nharness: codex\n${line}\n---\n`, undefined, fenced);
          assert.deepEqual([step.harness, step.sandbox, step.permissionMode], ['codex', 'read-only', undefined], line);
          assert.deepEqual(step.agent?.keys, ['place', 'harness', 'sandbox'], line);
          assert.deepEqual(step.agent?.given, {}, `${line}: the agent gives the step nothing`);
          assert.equal(
            renderStep(step),
            '---\nplace: git\nagent: mover\nharness: codex\ncodex:\n  fence:\n    sandbox: read-only\n---\n\n',
            line,
          );
        }
        assert.equal(parseWorkflow('build', '---\nplace: git\nagent: implementer\n---\n', undefined, fenced).permissionMode, 'dontAsk');
      },
    ],
    [
      "a step's mcp: adds to its agent's: the agent's servers, then the step's, each once, and the step keeps its own line",
      () => {
        const alone = lookOf(scoutWith(''), 'mcp: playwright\n');
        assert.deepEqual(
          [alone.agent?.mcp, alone.mcp],
          [['playwright'], ['playwright']],
          'an agent that names none loads what its step names',
        );
        const both = lookOf(scoutWith('mcp: a, b\n'), 'mcp: c, a\n');
        assert.deepEqual(both.agent?.mcp, ['a', 'b', 'c'], "the agent's first, and one both name once");
        assert.deepEqual(both.mcp, ['c', 'a'], "the step's own line, as written");
        assert.deepEqual(filed(both).projectMcp, ['a', 'b', 'c']);
        const read = fromRecord(both);
        assert.deepEqual(
          [read.agent?.mcp, read.mcp],
          [
            ['a', 'b', 'c'],
            ['c', 'a'],
          ],
          'both read back off a run record',
        );
        assert.equal(lookOf(scoutWith('mcp: a\n')).mcp, undefined, 'a step with no line has none of its own');
        assert.deepEqual(lookOf(scoutWith('mcp: playwright, docs\n')).agent?.mcp, ['playwright', 'docs']);
        assert.deepEqual(lookOf(scoutWith('')).agent?.mcp, [], '[] for an agent with no line');
        assert.equal(lookOf(undefined).agent, undefined);
        assert.equal(lookOf(scoutWith(''), 'harness: a2a:helper\n').agent?.name, 'scout', 'an agent that names none fills a remote step');
      },
    ],
    [
      "renderStep writes a step's own mcp: line, never its agent's servers, and no line for none",
      () => {
        const step = lookOf(scoutWith('mcp: playwright\n'), 'mcp: docs\n');
        assert.match(renderStep(step), /^mcp: docs$/m);
        assert.doesNotMatch(renderStep(step), /playwright/);
        assert.doesNotMatch(renderStep(lookOf(scoutWith('mcp: playwright\n'))), /^mcp:/m);
        assert.doesNotMatch(renderStep({ ...step, mcp: [] }), /^mcp:/m, 'an empty list is no line');
      },
    ],
    [
      'a step is filed the servers its agent gives, none with no agent, and no key on a record frozen before the line',
      () => {
        assert.deepEqual(filed(lookOf(scoutWith('mcp: playwright\n'))).projectMcp, ['playwright']);
        assert.deepEqual(filed(lookOf(scoutWith(''))).projectMcp, []);
        assert.deepEqual(filed(lookOf(undefined)).projectMcp, [], 'nor does a step with no agent');
        const { mcp: _, ...before } = lookOf(scoutWith('mcp: playwright\n')).agent!;
        assert.equal(
          Object.hasOwn(filed({ ...lookOf(scoutWith('')), agent: before }), 'projectMcp'),
          false,
          'the whole file, as the run was started',
        );
      },
    ],
    [
      'naming a server allows none of its tools: a dontAsk step that names one is filed as the same step naming none, but for the servers',
      () => {
        const fenced = scoutWith('permissionMode: dontAsk\nallowedTools: Read\n');
        const { projectMcp: named, ...withServer } = filed(lookOf(fenced, 'mcp: playwright\n'));
        const { projectMcp: none, ...without } = filed(lookOf(fenced));
        assert.deepEqual([named, none], [['playwright'], []]);
        assert.deepEqual(withServer, without);
        assert.equal(withServer.permissionMode, 'dontAsk');
        assert.doesNotMatch(JSON.stringify(withServer), /mcp__/, 'no rule names a tool of the server');
      },
    ],
    [
      "a frozen step reads back by the record's schema, with custom instructions or without; a value that is not words is refused",
      () => {
        const decode = Schema.decodeUnknownResult(FrozenStepSchema);
        const told: Agents = new Map([
          ['scribe', { ...agent('scribe', '---\ntools: Read\n---\nReply in English.\n'), customInstructions: 'Reply in French.' }],
        ]);
        const plain = agentsOf({ scribe: '---\ntools: Read\n---\nReply in English.\n' });
        const buildOf = (with_: Agents) =>
          parseWorkflow('build', '---\nplace: git\nagent: scribe\nharness: claude\n---\nReply in Spanish.\n', undefined, with_);
        for (const step of [buildOf(told), buildOf(plain)]) {
          const frozen = JSON.parse(JSON.stringify(step)) as unknown;
          const read = decode(frozen);
          assert.ok(Result.isSuccess(read), Result.isFailure(read) ? String(read.failure) : '');
          assert.deepEqual(read.success, frozen);
        }
        const step = JSON.parse(JSON.stringify(buildOf(told))) as Workflow;
        assert.ok(Result.isFailure(decode({ ...step, agent: { ...step.agent, customInstructions: 7 } })));
        assert.deepEqual(fromRecord(lookOf(scoutWith('mcp: playwright\n'))).agent?.mcp, ['playwright']);
      },
    ],
  ]);
});

test('REFUSED at shipped defaults: a step and the agent it names, one row per rule', async (t) => {
  const two = agentsOf({ implementer: IMPLEMENTER, reviewer: '---\nmodel: opus\n---\nReview it.\n' });
  const fenced = agentsOf({
    implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
    reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
  });
  const skills = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  const skilled = '---\nskills: write-a-note\ntools: Read, Skill\n---\nYou build.\n';
  const plan = { 'workflows/team/plan.md': '---\nplace: git\n---\nPlan it.\n' };
  await refusedRows(t, [
    [
      'an agent there is not, listing the agents there are',
      () => parseWorkflow('build', '---\nplace: git\nagent: builder\n---\nBuild it.\n', undefined, two),
      'build',
      '`agent: builder` is not an agent here',
      'implementer, reviewer',
      'write agents/builder.md',
    ],
    [
      'an agent there is not, where there are none',
      () => parseWorkflow('build', '---\nplace: git\nagent: builder\n---\nBuild it.\n'),
      '`agent: builder`',
      'There are none',
      'agents/',
    ],
    [
      "an empty body, and so is its agent's",
      () => parseWorkflow('build', '---\nplace: git\nagent: quiet\n---\n', undefined, agentsOf({ quiet: '---\nmodel: opus\n---\n' })),
      'the body is empty',
      "agents/quiet.md's",
    ],
    [
      'its own agent, hired another, naming the fire that takes the hire back',
      () =>
        parseWorkflow('implement', '---\nplace: git\nagent: implementer\n---\nBuild it.\n', undefined, two, undefined, hire('reviewer')),
      '`agent: implementer`',
      'acme',
      'reviewer',
      'nemia factory fire acme --step build/implement',
      'Nothing was started',
    ],
    [
      'its own agent, hired the same',
      () =>
        parseWorkflow('implement', '---\nplace: git\nagent: implementer\n---\nBuild it.\n', undefined, two, undefined, hire('implementer')),
      '`agent: implementer` fills this step in every factory',
      'hires implementer',
    ],
    [
      'a field both the step and its agent declare, naming both declarers',
      () =>
        loadWorkflows(
          path.join(
            tree({
              'agents/reviewer.md': '---\noutput: review.schema.json\n---\nReview it.\n',
              'agents/review.schema.json':
                '{"type":"object","properties":{"findings":{"type":"string"},"again":{"type":"boolean"}},"required":["findings","again"],"additionalProperties":false}',
              'dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
              'dev/judge.md': '---\nplace: git\nagent: reviewer\nafter: implement\noutput: judge.schema.json\n---\n',
              'dev/judge.schema.json':
                '{"type":"object","properties":{"findings":{"type":"string"},"severity":{"type":"string"}},"required":["findings","severity"],"additionalProperties":false}',
            }),
            'dev',
          ),
        ),
      'judge: `findings` is declared',
      'agent reviewer (agents/reviewer.md, `output: review.schema.json`)',
      'step judge (judge.md, `output: judge.schema.json`)',
      'Delete it from one of the two',
    ],
    [
      "a Claude Code agent's mode taken onto codex by the step's own line",
      () => parseWorkflow('build', '---\nplace: git\nagent: implementer\nharness: codex\neffort: high\n---\n', undefined, fenced),
      'build: `harness: codex` runs its agent implementer on codex',
      'agents/implementer.md fences it for claude',
    ],
    [
      "a codex agent's sandbox taken onto Claude Code by the step's own line",
      () => parseWorkflow('review', '---\nplace: git\nagent: reviewer\nharness: claude\n---\n', undefined, fenced),
      "is a codex step's sandbox, and this step runs on claude",
    ],
    [
      '`permissionMode:` and `sandbox:` both on a step on codex',
      () =>
        parseWorkflow(
          'review',
          '---\nplace: git\nagent: reviewer\npermissionMode: read-only\nsandbox: read-only\n---\n',
          undefined,
          fenced,
        ),
      'are both set',
    ],
    ...['permissionMode: read-only', 'sandbox: read-only'].map((line): Refused => [
      `a fenced agent run on codex with a fence of its own, \`${line}\``,
      () => parseWorkflow('build', `---\nplace: git\nagent: implementer\nharness: codex\n${line}\n---\n`, undefined, fenced),
      'build: `harness: codex` runs its agent implementer on codex',
      'agents/implementer.md fences it for claude',
    ]),
    [
      "a codex agent's sandbox, which cannot be compared with the step's Claude Code mode",
      () => parseWorkflow('review', '---\nplace: git\nagent: reviewer\nharness: claude\npermissionMode: plan\n---\n', undefined, fenced),
      'review: `harness: claude` runs its agent reviewer on claude',
    ],
    [
      'a fence written for the wrong harness',
      () => parseWorkflow('build', '---\nplace: git\nagent: implementer\nharness: codex\npermissionMode: plan\n---\n', undefined, fenced),
      'build: `harness: codex` runs its agent',
    ],
    [
      "F11: a step's own `tools:` that takes `Skill` from an agent that gives skills",
      () => loadWorkflows(team(skilled, skills, '---\nagent: builder\ntools: Read\n---\n')),
      'build: `agent: builder`: `skills: write-a-note`',
      '`tools: Read`',
      'no `Skill`',
    ],
    [
      "F11: a step's own deny list that takes `Skill`",
      () => loadWorkflows(team(skilled, skills, '---\nagent: builder\ndisallowedTools: Skill\n---\n')),
      'build: ',
      'denies `Skill`',
    ],
    [
      'a Claude Code agent with skills, run on codex by its step',
      () => loadWorkflows(team('---\nskills: write-a-note\n---\nYou build.\n', skills, '---\nagent: builder\nharness: codex\n---\n')),
      'build: `agent: builder`: `skills: write-a-note`',
      'Claude Code skills',
      'codex loads none',
    ],
    [
      'a Claude Code agent with a harness prompt, run on codex by its step',
      () => loadWorkflows(team('---\nharnessPrompt: replace\n---\nYou build.\n', {}, '---\nagent: builder\nharness: codex\n---\n')),
      'build: `agent: builder`: `harnessPrompt: replace`',
      "shapes Claude Code's own prompt",
    ],
    [
      'the former `systemPrompt: own` judged as the word it is now, run on codex',
      () => loadWorkflows(team('---\nsystemPrompt: own\n---\nYou build.\n', {}, '---\nagent: builder\nharness: codex\n---\n')),
      'build: `agent: builder`: `harnessPrompt: replace`',
      "shapes Claude Code's own prompt",
    ],
    [
      'F13: a harness prompt on a step that continues another session, which keeps its own',
      () =>
        loadWorkflows(
          team('---\nharnessPrompt: no-coding\n---\nYou build.\n', plan, '---\nagent: builder\nafter: plan\nresume: plan\n---\n'),
        ),
      'build: `agent: builder`: `harnessPrompt: no-coding`',
      'a session the step starts',
      "`resume: plan` continues plan's",
    ],
    ...['haiku', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5'].flatMap((model): Refused[] => [
      [
        `F21: \`model: ${model}\` on an agent with no mode, filed in \`auto\`, which Claude Code drops`,
        () => loadWorkflows(team(`---\nmodel: ${model}\n---\nYou build.\n`, {})),
        'build: `agent: builder` names an agent',
        'whose file is refused',
        `agents/builder.md: \`model: ${model}\``,
        'no `permissionMode:`',
        "filed in `auto`, the runtime's default",
        'Claude Code drops `auto` on that model',
      ],
      [
        `F21: \`model: ${model}\` on a step that says \`permissionMode: auto\``,
        () => loadWorkflows(team('---\n---\nx\n', {}, `---\nagent: builder\nmodel: ${model}\npermissionMode: auto\n---\n`)),
        `build: \`model: ${model}\` says \`permissionMode: auto\``,
        'Claude Code drops `auto`',
      ],
    ]),
    [
      "a step's mcp: line with an empty name, under the step's name",
      () => lookOf(scoutWith(''), 'mcp: a,, b\n'),
      'look: `mcp: a,, b` has an empty name',
      '`.mcp.json`',
    ],
    [
      "a step's mcp: line with what is no name",
      () => lookOf(scoutWith(''), 'mcp: a, b c\n'),
      'look: `mcp: a, b c` has `b c`',
      "not a server's name",
    ],
    [
      "a step's mcp: line naming a server twice",
      () => lookOf(scoutWith(''), 'mcp: a, a\n'),
      'look: `mcp: a, a` names `a` twice',
      'Name it once',
    ],
    [
      'an mcp: line on a step with no agent',
      () => lookOf(undefined, 'mcp: playwright\n'),
      'look: `mcp: playwright`',
      'this step has none',
      '`agent: <name>`',
      'or delete the line',
    ],
    [
      'an mcp: line on a step a remote agent runs',
      () => lookOf(scoutWith(''), 'harness: a2a:helper\nmcp: playwright\n'),
      'look: `mcp: playwright`',
      '`.mcp.json`',
      '`harness: a2a:helper` is a remote A2A agent',
      'Delete the line',
    ],
    [
      'an agent that names a server, filling a step a remote agent runs',
      () => lookOf(scoutWith('mcp: playwright\n'), 'harness: a2a:helper\n'),
      'look: `agent: scout`: `mcp: playwright`',
      '`harness: a2a:helper` is a remote A2A agent',
      'Delete the line',
    ],
  ]);
  await t.test("REFUSED: a hired agent there is not, in the factory's words, never an `agent:` line", () => {
    const unknown = refusal(() =>
      parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, two, undefined, hire('scout')),
    );
    names(unknown, 'acme', '`scout`', 'implementer, reviewer', 'nemia factory hire acme <agent> --step build/implement', 'agents/scout.md');
    const none = refusal(() =>
      parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, undefined, undefined, hire('scout')),
    );
    names(none, 'acme', 'There are none', 'nemia factory hire acme <agent> --step build/implement');
    const refused: Agents = new Map([['scout', new WorkflowError('agents/scout.md: `after` is wiring.')]]);
    const broken = refusal(() =>
      parseWorkflow('implement', '---\nplace: git\n---\nBuild it.\n', undefined, refused, undefined, hire('scout')),
    );
    names(broken, 'acme', 'its file is refused', 'agents/scout.md: `after` is wiring.');
    for (const words of [unknown, none, broken]) assert.doesNotMatch(words, /`agent: scout`/);
  });
  await t.test('and let through where the rule does not reach: a mode the model keeps, a model that keeps auto, codex, no model', () => {
    assert.equal(loadWorkflows(team('---\nmodel: haiku\npermissionMode: dontAsk\n---\nx\n', {})).length, 1);
    assert.equal(loadWorkflows(team('---\nmodel: sonnet\n---\nx\n', {})).length, 1);
    assert.equal(loadWorkflows(team('---\nharness: codex\nmodel: haiku\n---\nx\n', {})).length, 1);
    assert.equal(loadWorkflows(team('---\n---\nx\n', {})).length, 1);
    assert.equal(loadWorkflows(team(skilled, skills)).length, 1, 'a step that takes no tool from its agent');
  });
});

test('the folder of agents: beside the workflows, read whole, a broken one refused only where a step names it', async (t) => {
  const workflows = (files: Record<string, string>): string => tree(files);
  await rows(t, [
    [
      "loadAgents reads every agent in the folder, and keeps a broken one's refusal for the step that names it",
      () => {
        const dir = workflows({
          'agents/implementer.md': '---\nmodel: opus\n---\nImplement it.\n',
          'agents/broken.md': '---\ncheck: npm test\n---\nBreak it.\n',
          'agents/README.md': '# Agents\n\nThe agents the workflows name.\n',
          'agents/notes.txt': 'not an agent\n',
        });
        const agents = loadAgents(path.join(dir, 'agents'));
        assert.deepEqual([...agents.keys()].sort(), ['broken', 'implementer'], 'the README and a file that is not markdown are not agents');
        assert.equal((agents.get('implementer') as Agent).body, 'Implement it.');
        const broken = agents.get('broken');
        assert.ok(broken instanceof WorkflowError);
        names(broken.message, 'agents/broken.md', '`check` is wiring');
        assert.equal(loadAgents(path.join(dir, 'nowhere')).size, 0, 'no folder, no agents');
      },
    ],
    [
      'REFUSED: an agent file that is a link, by name, in the words a linked step is refused with',
      () => {
        const dir = workflows({
          'elsewhere/implementer.md': '---\nmodel: opus\n---\nImplement it.\n',
          'agents/reviewer.md': 'Review it.\n',
        });
        fs.symlinkSync(path.join(dir, 'elsewhere', 'implementer.md'), path.join(dir, 'agents', 'implementer.md'));
        const agents = loadAgents(path.join(dir, 'agents'));
        const linked = agents.get('implementer');
        assert.ok(linked instanceof WorkflowError, 'refused, though the file it points at is a good agent');
        names(
          linked.message,
          path.join(dir, 'agents', 'implementer.md'),
          'is a link',
          'Replace the link with a file of its own',
          'rm <file> && cp <target> <file>',
          'or take it out of the folder',
        );
        assert.ok(!(agents.get('reviewer') instanceof WorkflowError), 'the agent beside it is read');
      },
    ],
    [
      'REFUSED: a broken agent only where a step names it, naming agents/<file> — a linked one too',
      () => {
        const dir = workflows({
          'agents/implementer.md': IMPLEMENTER,
          'agents/broken.md': '---\nretries: 2\n---\nBreak it.\n',
          'elsewhere/linked.md': '---\nmodel: opus\n---\nLinked.\n',
          'dev/build.md': '---\nplace: git\nagent: implementer\n---\n',
          'bad/build.md': '---\nplace: git\nagent: broken\n---\n',
          'linked/build.md': '---\nplace: git\nagent: linked\n---\n',
        });
        fs.symlinkSync(path.join(dir, 'elsewhere', 'linked.md'), path.join(dir, 'agents', 'linked.md'));
        assert.equal(loadWorkflows(path.join(dir, 'dev'))[0].model, 'opus', 'a broken agent beside it stops no step that does not name it');
        names(
          refusal(() => loadWorkflows(path.join(dir, 'bad'))),
          'build: `agent: broken`',
          'whose file is refused',
          'agents/broken.md: `retries` is wiring',
        );
        names(
          refusal(() => loadWorkflows(path.join(dir, 'linked'))),
          'build: `agent: linked`',
          path.join(dir, 'agents', 'linked.md'),
          'is a link',
        );
      },
    ],
    [
      "REFUSED: a leftover `card:` line is the agent's refusal, thrown only at a step that names it",
      () => {
        const dir = workflows({
          'agents/reviewer.md': '---\ndescription: Reviews\ncard: reviewer.skills.json\n---\nReview it.\n',
          'agents/reviewer.skills.json': '[]',
          'agents/implementer.md': IMPLEMENTER,
          'dev/implement.md': '---\nplace: git\nagent: implementer\n---\n',
        });
        const agents = loadAgents(agentsDir(path.join(dir, 'dev')));
        assert.ok(agents.get('reviewer') instanceof WorkflowError, 'the leftover one is kept as its refusal');
        assert.ok(!(agents.get('implementer') instanceof WorkflowError), 'and stops no agent beside it');
        assert.equal(loadWorkflows(path.join(dir, 'dev')).length, 1, 'nor a workflow that does not name it');
        fs.writeFileSync(path.join(dir, 'dev', 'review.md'), '---\nafter: implement\nplace: git\nagent: reviewer\n---\n');
        names(
          refusal(() => loadWorkflows(path.join(dir, 'dev'))),
          'which is retired',
        );
      },
    ],
    [
      'agents/ is beside the workflow folders, and is not one of them: workflowsIn does not list it',
      () => {
        const dir = workflows({ 'dev/implement.md': '---\nplace: git\n---\nImplement it.\n', 'agents/implementer.md': 'Implement it.\n' });
        assert.equal(agentsDir(path.join(dir, 'dev')), path.join(dir, 'agents'));
        assert.deepEqual(workflowsIn(dir), ['dev']);
        names(
          refusal(() => loadWorkflows(dir)),
          'it holds workflows, each a folder of steps: dev',
          path.join(dir, 'dev'),
        );
      },
    ],
    [
      'REFUSED: a workflow named agents — loaded, named bare, or written, and nothing written',
      () => {
        const repo = workflows({
          'workflows/dev/implement.md': '---\nplace: git\n---\nImplement it.\n',
          'workflows/agents/implementer.md': 'Implement it.\n',
        });
        const folder = path.join(repo, 'workflows', 'agents');
        names(
          refusal(() => loadWorkflows(folder)),
          folder,
          'is agents/',
          'no workflow has its name',
          'Name a workflow beside it',
        );
        names(
          refusal(() => workflowFolder('agents', path.join(repo, 'elsewhere'), repo)),
          folder,
          'is agents/',
        );
        const before = fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8');
        names(
          refusal(() =>
            writeWorkflow(folder, [{ name: 'implement', after: [], place: 'git', body: 'Implement it.' }], undefined, { anywhere: true }),
          ),
          folder,
          'is agents/',
        );
        assert.deepEqual(fs.readdirSync(folder), ['implementer.md'], 'nothing written');
        assert.equal(fs.readFileSync(path.join(folder, 'implementer.md'), 'utf8'), before);
      },
    ],
    [
      'writeWorkflow resolves against the agents beside the folder, keeps a file that reads as its step, and refuses an agent there is not',
      () => {
        const dir = workflows({
          'agents/implementer.md': IMPLEMENTER,
          'dev/build.md': '---\nplace: git\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n',
        });
        const folder = path.join(dir, 'dev');
        const steps = loadWorkflows(folder);
        const written = writeWorkflow(folder, steps, undefined, { anywhere: true });
        assert.deepEqual(written.kept, ['build.md'], 'the file with its comment is kept');
        assert.deepEqual(written.steps, steps);
        names(
          refusal(() =>
            writeWorkflow(folder, [{ name: 'build', after: [], place: 'git', agent: 'builder', body: 'Build it.' }], undefined, {
              anywhere: true,
            }),
          ),
          '`agent: builder` is not an agent here',
          'implementer',
        );
        assert.equal(
          fs.readFileSync(path.join(folder, 'build.md'), 'utf8'),
          '---\nplace: git\n# the implementer, cheaper\nagent: implementer\nmodel: sonnet\n---\n',
          'nothing written',
        );
      },
    ],
    [
      'REFUSED: writeWorkflow of a draft on codex by its agent that sends its sandbox as `permissionMode`, and nothing written',
      () => {
        const dir = workflows({
          'agents/reviewer.md': '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
          'dev/review.md': '---\nplace: git\nagent: reviewer\n---\n',
        });
        const folder = path.join(dir, 'dev');
        const draft = (keys: object) => [{ name: 'review', after: [], place: 'git' as const, agent: 'reviewer', body: '', ...keys }];
        names(
          refusal(() => writeWorkflow(folder, draft({ permissionMode: 'read-only' }), undefined, { anywhere: true })),
          '`permissionMode: read-only`',
          'the former name of `sandbox:`',
          'Send the sandbox as `sandbox:` instead',
        );
        const kept = refusal(() => writeWorkflow(folder, draft({ permissionMode: 'dontAsk' }), undefined, { anywhere: true }));
        names(
          kept,
          '`permissionMode: dontAsk` on a step that runs on codex',
          'the former name of `sandbox:`',
          'clear it, and set the sandbox',
        );
        assert.ok(
          !kept.includes('`sandbox: dontAsk`'),
          `a Claude Code mode is not refused as the sandbox a file would read it as: ${kept}`,
        );
        assert.equal(fs.readFileSync(path.join(folder, 'review.md'), 'utf8'), '---\nplace: git\nagent: reviewer\n---\n', 'nothing written');
        writeWorkflow(folder, draft({ sandbox: 'read-only' }), undefined, { anywhere: true });
        assert.equal(
          fs.readFileSync(path.join(folder, 'review.md'), 'utf8'),
          '---\nplace: git\nagent: reviewer\ncodex:\n  fence:\n    sandbox: read-only\n---\n\n',
          'sent under its own name, it is written',
        );
      },
    ],
  ]);
});

/** The card entry a SKILL.md's frontmatter gives (`skillEntryOf`), or the refusal of it. */
const entry = (front: string) => skillEntryOf('skills/a-skill/SKILL.md', 'a-skill', `---\n${front}\n---\nHow to do it.\n`);

test("skillEntryOf: a skill's card entry read off its SKILL.md's keys as YAML reads them, in any form", async (t) => {
  await rows(t, [
    [
      'every key the card reads',
      () =>
        assert.deepEqual(
          entry('name: a-skill\ntitle: A skill\ndescription: What it does.\ntags: ["code", "review"]\nexamples: ["Use this when…"]'),
          {
            id: 'a-skill',
            name: 'A skill',
            description: 'What it does.',
            tags: ['code', 'review'],
            examples: ['Use this when…'],
          },
        ),
    ],
    ['double quotes read as JSON', () => assert.equal(entry('description: "Say \\"it\\" — twice."').description, 'Say "it" — twice.')],
    ["single quotes, '' a quote", () => assert.equal(entry("description: 'It''s done.'").description, "It's done.")],
    ['a ` #` ends a plain value', () => assert.equal(entry('description: What it does. # and a comment').description, 'What it does.')],
    [
      'a block scalar, or a value over several lines',
      () => {
        for (const front of ['description: >\n  What it does.', 'description: |\n  What it does.', 'description: What\n  it does.'])
          assert.equal(entry(front).description, 'What it does.', front);
      },
    ],
    [
      'a block sequence, indented or not, and a flow list of plain items',
      () => {
        assert.deepEqual(entry('description: d\ntags:\n  - code\n  - review').tags, ['code', 'review']);
        assert.deepEqual(entry('description: d\ntags:\n- code').tags, ['code']);
        assert.deepEqual(entry('description: d\ntags: [code, review]').tags, ['code', 'review']);
      },
    ],
    [
      'a block YAML refuses is read in the former line form, each card key of it read as YAML alone',
      () => {
        assert.equal(entry('description: What: it does\ntags: ["code"]').description, 'What: it does');
        assert.deepEqual(entry('description: What: it does\ntags: ["code"]').tags, ['code']);
      },
    ],
    [
      "Claude Code's keys, in any form, are not the card's",
      () =>
        assert.deepEqual(entry('description: d\nallowed-tools:\n  - Read\n  - Grep\nmetadata:\n  owner: x\npreload: true'), {
          id: 'a-skill',
          name: 'a-skill',
          description: 'd',
          tags: ['a-skill'],
        }),
    ],
  ]);
  const cases: Array<[string, string]> = [
    ['name: a', "the A2A protocol marks a skill's description REQUIRED"],
    ['description: ""', 'has no `description:`'],
    ['description: d\ndescription: e', '`description` is set twice'],
    ['description: {a: b}', '`description` is one line of text, not a list or a map'],
    ['description: d\ntags: {a: b}', '`tags` is a map, and it is a list'],
    ['description: d\ntags:\n  - [a]', 'is not a list of words'],
    ['description: ["a list"]', '`description` is one line of text, not a list'],
    ['description: d\ntags: code', '`tags: code` is one line of text, and `tags` is a list'],
    ['description: d\ntags: []', '`tags` is an empty list, which says as little as none'],
    ['description: d\nexamples: []', '`examples` is an empty list'],
    ['description: d\ntags: ["", "x"]', 'is not a list of words'],
  ];
  await refusedRows(t, [
    ...cases.map(([front, why]): Refused => [`REFUSED: ${JSON.stringify(front)}`, () => entry(front), 'skills/a-skill/SKILL.md', why]),
    [
      'REFUSED: no frontmatter at all',
      () => skillEntryOf('skills/a-skill/SKILL.md', 'a-skill', 'No frontmatter.\n'),
      'skills/a-skill/SKILL.md',
      'has no frontmatter',
      "a skill's card entry is read from it",
    ],
  ]);
});

/** Every field `AgentCard` marks REQUIRED, in the proto's order (specification/a2a.proto in a2aproject/A2A, protocol 1.0). */
const REQUIRED = [
  'name',
  'description',
  'supportedInterfaces',
  'version',
  'capabilities',
  'defaultInputModes',
  'defaultOutputModes',
  'skills',
];
/** Every field `AgentSkill` marks REQUIRED. */
const SKILL_REQUIRED = ['id', 'name', 'description', 'tags'];
/** The fields a card carries that nothing here can fill honestly: no provider, no address, no scheme, no signature. */
const UNFILLED = [
  'supportedInterfaces',
  'provider',
  'documentationUrl',
  'iconUrl',
  'securitySchemes',
  'security',
  'securityRequirements',
  'signatures',
];

const SCRIBE =
  '---\ndescription: Use this when a change needs its notes written.\nskills: write-a-note, file-it, just-an-id\ntools: Read, Edit, Skill\n---\nWrite the notes.\n';

/**
 * A workflows folder holding the scribe and three skills, each giving its card entry another way: `write-a-note` every key the card
 * reads and one it does not (`preload`); `file-it` a frontmatter `name`, no title, no tags, no examples; `just-an-id` neither, named by its
 * folder as Claude Code names it.
 */
function composed(): { root: string; found: ReturnType<typeof skillsFor>; scribe: Agent } {
  const root = path.join(tree({}), 'workflows');
  const skill = (id: string, text: string) => {
    fs.mkdirSync(path.join(root, 'skills', id), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', id, 'SKILL.md'), text);
  };
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents', 'scribe.md'), SCRIBE);
  skill(
    'write-a-note',
    [
      '---',
      'name: write-a-note',
      'title: "Write a note"',
      "description: 'Write the notes of a change, with what it''s for.'",
      'tags: ["note", "docs"]',
      'examples: ["Write the notes for the queue change."]',
      'preload: true',
      '---',
      'How to write a note.',
      '',
    ].join('\n'),
  );
  skill(
    'file-it',
    '---\nname: File it away\ndescription: File a finished note where the team reads it. # not part of it\n---\nHow to file.\n',
  );
  skill('just-an-id', '---\ndescription: Say nothing but the id.\n---\n');
  return { root, found: skillsFor(path.join(root, '_')), scribe: parseAgent('scribe', SCRIBE, () => undefined) };
}

test("agentCard: what an agent says it can do, in A2A's shape — not an Agent Card, the omission pinned", async (t) => {
  await rows(t, [
    [
      "an entry for each skill its `skills:` gives, read off its SKILL.md, in that order; its description the agent's",
      () => {
        const { root, found, scribe } = composed();
        const card = agentCard(scribe, agentVersion(path.join(root, 'agents'), 'scribe', found)!, cardSkills(scribe, found));
        assert.deepEqual(card.skills, [
          {
            id: 'write-a-note',
            name: 'Write a note',
            description: "Write the notes of a change, with what it's for.",
            tags: ['note', 'docs'],
            examples: ['Write the notes for the queue change.'],
          },
          { id: 'file-it', name: 'File it away', description: 'File a finished note where the team reads it.', tags: ['file-it'] },
          { id: 'just-an-id', name: 'just-an-id', description: 'Say nothing but the id.', tags: ['just-an-id'] },
        ]);
        assert.equal(card.description, 'Use this when a change needs its notes written.');
      },
    ],
    [
      "the card moves with its version when a skill's SKILL.md changes",
      () => {
        const { root, found, scribe } = composed();
        const before = agentVersion(path.join(root, 'agents'), 'scribe', found);
        fs.writeFileSync(
          path.join(root, 'skills', 'file-it', 'SKILL.md'),
          '---\nname: File it away\ndescription: File it somewhere else.\n---\n',
        );
        assert.notEqual(agentVersion(path.join(root, 'agents'), 'scribe', found), before);
        assert.equal(cardSkills(scribe, found)[1].description, 'File it somewhere else.');
      },
    ],
    [
      'an agent with no skills says one thing it can do: what its own description says',
      () => {
        const plain = parseAgent(
          'scribe',
          '---\ndescription: Use this when a change needs its notes written.\n---\nWrite the notes.\n',
          () => undefined,
        );
        const { found } = composed();
        assert.deepEqual(cardSkills(plain, found), [
          { id: 'scribe', name: 'scribe', description: 'Use this when a change needs its notes written.', tags: ['scribe'] },
        ]);
        assert.deepEqual(ownSkill(plain), cardSkills(plain, found)[0]);
      },
    ],
    [
      'every field A2A marks REQUIRED but the interfaces, which nothing here serves, and nothing the protocol does not name',
      () => {
        const { found, scribe } = composed();
        const card = agentCard(scribe, 'abc123', cardSkills(scribe, found));
        for (const key of REQUIRED.filter((k) => k !== 'supportedInterfaces')) assert.ok(Object.hasOwn(card, key), key);
        for (const key of UNFILLED)
          assert.equal(Object.hasOwn(card, key), false, `${key} is left out rather than filled with a placeholder`);
        assert.deepEqual(
          Object.keys(card).filter((k) => !REQUIRED.includes(k)),
          [],
        );
        for (const skill of card.skills) for (const key of SKILL_REQUIRED) assert.ok(Object.hasOwn(skill, key), `${skill.id} gives ${key}`);
      },
    ],
    [
      'what the agent is, how it is versioned, and what it takes and hands back',
      () => {
        const { found, scribe } = composed();
        const card = agentCard(scribe, 'abc123', cardSkills(scribe, found));
        assert.deepEqual([card.name, card.version], ['scribe', 'abc123']);
        assert.deepEqual(card.defaultInputModes, ['text/plain']);
        assert.deepEqual(card.defaultOutputModes, ['application/json']);
        assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
        assert.equal(JSON.parse(JSON.stringify(card)).skills[0].id, 'write-a-note', 'and the whole of it is JSON');
      },
    ],
  ]);
  const { root, found, scribe } = composed();
  const bare = parseAgent('scribe', '---\neffort: low\n---\nWrite the notes.\n', () => undefined);
  await refusedRows(t, [
    [
      'REFUSED: a card with no skills, naming the line its entries are generated from',
      () => agentCard(scribe, 'abc123', []),
      'agents/scribe.md',
      'its card has no skills',
      '`skills:`',
    ],
    [
      'REFUSED: a card for an agent with no description',
      () => agentCard(bare, 'abc123', cardSkills(scribe, found)),
      'agents/scribe.md has no `description:`',
    ],
    ['REFUSED: an entry made of nothing', () => cardSkills(bare, found), 'agents/scribe.md has no `description:`'],
    [
      'REFUSED: a skill no folder has, naming the file to write',
      () => cardSkills({ ...scribe, skills: ['write-a-note', 'no-such-skill'] }, found),
      'agents/scribe.md gives the skill `no-such-skill`',
      'write skills/no-such-skill/SKILL.md',
      path.join(root, 'skills'),
    ],
  ]);
  await t.test('REFUSED: a skill whose SKILL.md says nothing it can be listed by', () => {
    fs.writeFileSync(path.join(root, 'skills', 'file-it', 'SKILL.md'), '---\nname: File it away\n---\nHow to file.\n');
    names(
      refusal(() => cardSkills(scribe, found)),
      path.join('file-it', 'SKILL.md has no `description:`'),
      '`description: <what it does, one line>`',
    );
  });
});
