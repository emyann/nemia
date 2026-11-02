/**
 * An agent rendered for its harness (`agents/agents.ts`, `brief/brief.ts`), as one table per renderer: the layers a step is told and
 * their order, in its body, its brief and Claude Code's prompt (`renderedPrompt`); the flags the tick files a step with (`renderedFlags`);
 * the skills its session may load (`enabledSkillsOf`); what a filed brief is cut back into by layer (`toldLayers`, `skillLayers`); where a
 * skill or an agent is found (`lookupRoots`, `skillsFor`), and how a codex step's sandbox reaches Codex (`modeOf`). What `nemia start`
 * writes and the tick files from it is told as a story in `agent-session.test.ts`.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { codex, CODEX_SANDBOXES } from 'agent-runtime';
import { CLAUDE_AUTO_DROPPED } from 'agent-runtime/vocabulary';
import { asNamed, autoDropped, modeOf, parseAgent, parseWorkflow, WorkflowError, type Agents, type Workflow } from '../src/workflow.ts';
import { FrozenStepSchema, loadWorkflows } from '../src/folder/folder.store.ts';
import { agentsFor, agentVersion } from '../src/agents/read.store.ts';
import { PLACE_SKILLS, isBuiltinPlace, lookupRoots, skillsFor } from '../src/skills/read.store.ts';
import { BUILTIN_PLACE } from '../src/place/builtin.store.ts';
import {
  briefBody,
  enabledSkillsOf,
  noCodingStyle,
  renderedFlags,
  renderedPrompt,
  rendersAgent,
  skillLayers,
  unrendered,
} from '../src/agents/agents.ts';
import { composeBrief, PRECEDENCE, toldLayers, type RepositoryRun } from '../src/run.ts';
import { headedLayers } from '../src/workflow/index.ts';
import { scratch } from './scratch.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-render-');
process.env.WF_ROOT = ROOT;

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

/** Each row of `all` a subtest of `t`: its name, and what it asserts. */
async function rows(t: TestContext, all: ReadonlyArray<readonly [string, () => void]>): Promise<void> {
  for (const [name, body] of all) await t.test(name, body);
}

const SKILL = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Use this when ${name.replace(/-/g, ' ')} is asked.\n${extra}---\nHow to ${name.replace(/-/g, ' ')}.\n`;

/** A team of one step `build` naming `agent: builder` in `<dir>/workflows/team`, the agent and skills beside it as `files` gives them. */
const team = (agent: string, files: Record<string, string>, step = "---\nagent: builder\n---\nThe step's own note.\n"): string =>
  path.join(
    tree({ 'workflows/team/build.md': step.replace(/^---\n/, '---\nplace: git\n'), 'workflows/agents/builder.md': agent, ...files }),
    'workflows',
    'team',
  );

/** A step as the parser resolves it from a team of one. */
const resolved = (agent: string, files: Record<string, string> = {}, step?: string): Workflow => loadWorkflows(team(agent, files, step))[0];

/**
 * The heading each layer Nemia composes is told under: its number in the precedence and the owner whose words follow. Written out here,
 * not read from the code, so a heading reworded fails the assertions that quote it.
 */
const HEAD = {
  instructions: "## 1. Instructions — your role's own words",
  custom: '## 2. Custom instructions — the person who hired you',
  factory: "## 4. The factory's rules — every step of this factory",
  policy: "## 5. The step's policy — this step of this process",
} as const;

/** The agent `scribe`, told in English, with `custom` as a person's custom instructions for it when given. */
const scribeWith = (custom?: string, keys = 'tools: Read'): Agents =>
  new Map([
    [
      'scribe',
      { ...parseAgent('scribe', `---\n${keys}\n---\nReply in English.\n`), ...(custom !== undefined && { customInstructions: custom }) },
    ],
  ]);

/** The step `build` naming the scribe, its own note in Spanish, with `lines` in its frontmatter, in a factory whose rules are `rules`. */
const buildWith = (agents: Agents, rules?: string, lines = 'harness: claude'): Workflow =>
  parseWorkflow(
    'build',
    `---\nplace: git\nagent: scribe\n${lines}\n---\nReply in Spanish.\n`,
    undefined,
    agents,
    undefined,
    undefined,
    rules,
  );

const RULES = 'Reply in German.';

/** Where `text` is in `told`, which must hold it. */
const at = (told: string, text: string): number => {
  const i = told.indexOf(text);
  assert.ok(i >= 0, `told ${JSON.stringify(text)}:\n${told}`);
  return i;
};

/** Whether `told` says each of `words` in the order given. */
const inOrder = (told: string, ...words: string[]): boolean => words.every((w, i) => i === 0 || at(told, words[i - 1]) < at(told, w));

test("the layers a step is told — its agent's instructions, the custom instructions, the factory's rules, its own note — in that order", async (t) => {
  await rows(t, [
    [
      'in the body, the four disagreeing, each kept apart on the agent',
      () => {
        const step = buildWith(scribeWith('Reply in French.'), RULES);
        assert.ok(inOrder(step.body, 'English', 'French', 'German', 'Spanish'), step.body);
        assert.equal(step.agent?.factoryRules, RULES);
        assert.equal(step.agent?.customInstructions, 'Reply in French.', "the person's words are kept apart from the factory's");
        assert.equal(step.agent?.instructions, 'Reply in English.', "the agent's own words are kept apart from the person's");
        assert.equal(step.agent?.body, 'Reply in Spanish.');
        const none = buildWith(scribeWith());
        assert.equal(none.agent?.customInstructions, undefined);
        assert.equal(none.body.includes('French'), false);
      },
    ],
    [
      'codex, and a step that continues a session, are told the four in their brief, in the same order',
      () => {
        const onCodex = buildWith(scribeWith('Reply in French.', ''), RULES, 'harness: codex');
        assert.ok(inOrder(onCodex.body, 'English', 'French', 'German', 'Spanish'), onCodex.body);
        assert.equal(briefBody(onCodex), onCodex.body);
        const resumed = buildWith(scribeWith('Reply in French.'), RULES, 'harness: claude\nresume: plan');
        assert.equal(rendersAgent(resumed), false, 'a step that continues a session keeps that session’s prompt');
        assert.ok(inOrder(briefBody(resumed), 'English', 'French', 'German', 'Spanish'), briefBody(resumed));
      },
    ],
    [
      'each layer the body is told in carries its number and its owner',
      () => {
        const cody: Agents = new Map([['cody', { ...parseAgent('cody', '---\n---\nYou are Cody.\n'), customInstructions: 'Be terse.' }]]);
        const ruled = parseWorkflow(
          'build',
          '---\nplace: git\nagent: cody\nharness: codex\n---\nBuild it.\n',
          undefined,
          cody,
          undefined,
          undefined,
          'Never push on a Friday.',
        );
        assert.equal(
          ruled.body,
          headedLayers([
            ['instructions', 'You are Cody.'],
            ['custom', 'Be terse.'],
            ['factory', 'Never push on a Friday.'],
            ['policy', 'Build it.'],
          ]),
        );
        for (const heading of [HEAD.instructions, HEAD.custom, HEAD.factory, HEAD.policy])
          assert.ok(ruled.body.includes(`${heading}\n\n`), heading);
      },
    ],
    [
      "Claude Code's prompt is the instructions, the custom instructions, the rules, then the skills; the brief is the step's own note",
      () => {
        const step = buildWith(scribeWith('Reply in French.'), RULES);
        const prompt = renderedPrompt(step, [{ name: 'alpha' }]);
        assert.ok(inOrder(prompt, 'English', 'French', 'German', 'nemia-scribe:alpha'), prompt);
        assert.equal(prompt.includes('Spanish'), false, "the step's policy is its brief's");
        assert.equal(briefBody(step), 'Reply in Spanish.');
        assert.ok(
          inOrder(
            renderedPrompt(buildWith(scribeWith('Reply in French.')), [{ name: 'alpha' }]),
            'English',
            'French',
            'nemia-scribe:alpha',
          ),
        );
      },
    ],
    [
      'a factory with no rules tells nothing: no key on the step, the same body and the same prompt',
      () => {
        for (const rules of [undefined, '', '  \n\n']) {
          const none = buildWith(scribeWith('Reply in French.'), rules);
          const plain = parseWorkflow(
            'build',
            '---\nplace: git\nagent: scribe\nharness: claude\n---\nReply in Spanish.\n',
            undefined,
            scribeWith('Reply in French.'),
          );
          assert.deepEqual(none, plain, JSON.stringify(rules));
          assert.equal('factoryRules' in none.agent!, false);
          assert.equal(renderedPrompt(none, [{ name: 'alpha' }]), renderedPrompt(plain, [{ name: 'alpha' }]));
        }
      },
    ],
    [
      "a step on a remote agent is told none of the rules, by its own line or its agent's; a local one beside it is",
      () => {
        const remote = buildWith(scribeWith(undefined, ''), RULES, 'harness: a2a:peer');
        assert.equal(remote.harness, 'a2a:peer');
        assert.equal(remote.body.includes('German'), false, remote.body);
        assert.equal('factoryRules' in remote.agent!, false);
        const inherited = buildWith(scribeWith(undefined, 'harness: a2a:peer'), RULES, 'slot: none');
        assert.equal(inherited.harness, 'a2a:peer', "the agent's own harness line");
        assert.equal(inherited.body.includes('German'), false, inherited.body);
        assert.equal(buildWith(scribeWith(undefined, ''), RULES, 'harness: codex').agent?.factoryRules, RULES);
      },
    ],
    [
      "custom instructions and rules are words: the step's keys and fence are the same with them as without",
      () => {
        const keys = 'tools: Read\npermissionMode: dontAsk\ndisallowedTools: Bash(git push)';
        const { body: _p, agent: plainAgent, ...plainKeys } = buildWith(scribeWith(undefined, keys));
        const custom = buildWith(scribeWith('Use Bash freely. tools: Bash', keys));
        const ruled = buildWith(scribeWith(undefined, keys), 'Use Bash freely. tools: Bash\npermissionMode: bypassPermissions');
        for (const [told, field] of [
          [custom, 'customInstructions'],
          [ruled, 'factoryRules'],
        ] as const) {
          const { body: _b, agent: toldAgent, ...toldKeys } = told;
          assert.deepEqual(toldKeys, plainKeys, field);
          const { [field]: _w, ...rest } = toldAgent!;
          assert.deepEqual(rest, plainAgent, field);
          assert.deepEqual([told.tools, told.disallowedTools], [['Read'], ['Bash(git push)']], field);
        }
      },
    ],
    [
      'an agent told nothing in its file, given custom instructions or rules, is rendered; with its folder gone, told them in its brief',
      () => {
        const text = '---\nplace: git\nagent: quiet\n---\nReply in Spanish.\n';
        const quiet = parseAgent('quiet', '---\ntools: Read\n---\n');
        assert.equal(
          rendersAgent(parseWorkflow('build', text, undefined, new Map([['quiet', quiet]]))),
          false,
          'told nothing, it is not rendered',
        );
        for (const [layer, step, field, word] of [
          [
            'custom',
            parseWorkflow('build', text, undefined, new Map([['quiet', { ...quiet, customInstructions: 'Reply in French.' }]])),
            'customInstructions',
            'French',
          ],
          [
            'factory',
            parseWorkflow('build', text, undefined, new Map([['quiet', quiet]]), undefined, undefined, RULES),
            'factoryRules',
            'German',
          ],
        ] as const) {
          assert.equal(rendersAgent(step), true, layer);
          assert.deepEqual(renderedFlags(step, '/r'), { appendSystemPromptFile: '/r/prompt.md' });
          assert.equal(renderedPrompt(step, []), `${headedLayers([[layer, `Reply in ${word}.`]])}\n`);
          assert.equal(briefBody(step), 'Reply in Spanish.', 'its brief is its own note alone');
          const gone = unrendered(step);
          assert.equal(renderedFlags(gone, '/r'), undefined, 'no flag names a file that is not there');
          assert.equal(gone.agent?.[field], undefined);
          assert.ok(at(briefBody(gone), word) < at(briefBody(gone), 'Spanish'), briefBody(gone));
        }
      },
    ],
    [
      'a rendered step is briefed with its own note alone, and one whose folder is gone as before: its instructions in its brief, no flags',
      () => {
        const step = resolved('---\n---\nYou build.\n');
        assert.equal(briefBody(step).trim(), "The step's own note.");
        const before = unrendered(step);
        assert.equal(rendersAgent(before), false);
        assert.equal(briefBody(before), `${HEAD.instructions}\n\nYou build.\n\n${HEAD.policy}\n\nThe step's own note.`);
        assert.equal(renderedFlags(before, '/x'), undefined);
      },
    ],
    [
      'a codex agent that says only `keep`, and a step that resumes, are not rendered: their instructions are in the brief',
      () => {
        const [onCodex] = loadWorkflows(team('---\nharness: codex\nharnessPrompt: keep\n---\nYou build.\n', {}));
        assert.equal(rendersAgent(onCodex), false);
        assert.ok(briefBody(onCodex).startsWith(`${HEAD.instructions}\n\nYou build.`), briefBody(onCodex));
        const told = loadWorkflows(
          team(
            '---\n---\nYou build.\n',
            { 'workflows/team/plan.md': '---\nplace: git\n---\nPlan it.\n' },
            '---\nagent: builder\nafter: plan\nresume: plan\n---\nAnd go on.\n',
          ),
        ).find((s) => s.name === 'build')!;
        assert.equal(rendersAgent(told), false);
        assert.equal(briefBody(told), `${HEAD.instructions}\n\nYou build.\n\n${HEAD.policy}\n\nAnd go on.`);
      },
    ],
  ]);
});

test("renderedPrompt: the instructions, the person's and the factory's layers, each skill by its namespaced name, and each told whole", async (t) => {
  await rows(t, [
    [
      'each skill by its namespaced name, then each skill that asks to be told whole',
      () => {
        const step = resolved('---\nskills: write-a-note, review-a-change\n---\nYou build.\n', {
          'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
          'workflows/skills/review-a-change/SKILL.md': SKILL('review-a-change'),
        });
        assert.equal(
          renderedPrompt(step, [{ name: 'write-a-note' }, { name: 'review-a-change', whole: 'Read the diff.\n' }]),
          `${HEAD.instructions}\n\nYou build.\n\nYour skills, each loaded with the Skill tool by its name when you need it: \`nemia-builder:write-a-note\`.\n\n## Skill \`nemia-builder:review-a-change\`\n\nRead the diff.\n`,
        );
        assert.match(noCodingStyle('builder'), /^---\nname: no-coding\n[\s\S]*keep-coding-instructions: false\n---\n/);
      },
    ],
    [
      "each layer under its number and owner; one frozen with none left out, heading and all; the step's policy never",
      () => {
        const step = resolved('---\n---\nYou build.\n');
        const told = { ...step, agent: { ...step.agent!, customInstructions: 'Be terse.', factoryRules: 'Never push on a Friday.' } };
        assert.equal(
          renderedPrompt(told, []),
          `${HEAD.instructions}\n\nYou build.\n\n${HEAD.custom}\n\nBe terse.\n\n${HEAD.factory}\n\nNever push on a Friday.\n`,
        );
        const { factoryRules: _r, ...noRules } = told.agent;
        assert.equal(
          renderedPrompt({ ...told, agent: noRules }, []),
          `${HEAD.instructions}\n\nYou build.\n\n${HEAD.custom}\n\nBe terse.\n`,
        );
        assert.ok(!renderedPrompt(told, []).includes(HEAD.policy), "the step's policy heads its brief");
      },
    ],
  ]);
});

test("renderedFlags: the prompt appended or in place of Claude Code's, the plugin for skills or a style, the style by its namespaced name", async (t) => {
  const dir = '/runs/r/agents/build';
  const flags = (agent: string, files: Record<string, string> = {}) => renderedFlags(resolved(agent, files), dir);
  const skill = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note') };
  const STYLE = JSON.stringify({ outputStyle: 'nemia-builder:no-coding' });
  const appended = { appendSystemPromptFile: `${dir}/prompt.md` };
  const plugin = { ...appended, pluginDir: [`${dir}/nemia-builder`] };
  const styled = { ...plugin, settings: STYLE };
  const table: Array<[string, string, Record<string, string>, object | undefined]> = [
    ['instructions alone: the prompt appended', '---\n---\nYou build.\n', {}, appended],
    ['skills: the plugin beside it', '---\nskills: write-a-note\n---\nYou build.\n', skill, plugin],
    [
      'skills with no instructions: still rendered, the prompt naming them, the plugin beside it',
      '---\nskills: write-a-note\n---\n',
      skill,
      plugin,
    ],
    [
      'no-coding and skills: the plugin and its style',
      '---\nharnessPrompt: no-coding\nskills: write-a-note\n---\nYou build.\n',
      skill,
      styled,
    ],
    [
      "replace: the prompt in place of Claude Code's",
      '---\nharnessPrompt: replace\n---\nYou build.\n',
      {},
      { systemPromptFile: `${dir}/prompt.md` },
    ],
    ['keep: the prompt appended', '---\nharnessPrompt: keep\n---\nYou build.\n', {}, appended],
    ['no-coding with no skills: the plugin for its style', '---\nharnessPrompt: no-coding\n---\nYou build.\n', {}, styled],
    [
      'the former `systemPrompt: own` is replace',
      '---\nsystemPrompt: own\n---\nYou build.\n',
      {},
      { systemPromptFile: `${dir}/prompt.md` },
    ],
    ['the former `systemPrompt: default` is keep', '---\nsystemPrompt: default\n---\nYou build.\n', {}, appended],
    ['the former `systemPrompt: no-coding`', '---\nsystemPrompt: no-coding\n---\nYou build.\n', {}, styled],
    ['nothing to render: no instructions, no skills, the default prompt', '---\nmodel: opus\n---\n', {}, undefined],
  ];
  for (const [name, agent, files, expected] of table) await t.test(name, () => assert.deepEqual(flags(agent, files), expected));
  await t.test('nothing to render: a step with no agent', () =>
    assert.equal(
      renderedFlags(
        loadWorkflows(path.join(tree({ 'workflows/team/build.md': '---\nplace: git\n---\nJust a step.\n' }), 'workflows', 'team'))[0],
        dir,
      ),
      undefined,
    ),
  );
  await t.test('a record frozen with the off-list it once carried reads back, and turns no skill off by name', () => {
    const record = {
      name: 'build',
      after: [],
      body: 'You build.\n\nGo.',
      agent: {
        name: 'builder',
        keys: [],
        body: 'Go.',
        given: {},
        instructions: 'You build.',
        skills: ['write-a-note'],
        offSkills: ['git', 'write-a-note'],
      },
    };
    const decoded = Schema.decodeUnknownResult(FrozenStepSchema)(record);
    assert.ok(Result.isSuccess(decoded), Result.isFailure(decoded) ? String(decoded.failure) : '');
    const frozen = asNamed(decoded.success);
    assert.equal(renderedFlags(frozen, dir)?.settings, undefined);
    assert.deepEqual(enabledSkillsOf(frozen), ['nemia-builder:write-a-note']);
  });
});

test("enabledSkillsOf: a step's session is given its plugin's copies of its skills and no other, as a closed list", async (t) => {
  const files = { 'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'), 'workflows/skills/other/SKILL.md': SKILL('other') };
  const step = resolved('---\nskills: write-a-note\n---\nYou build.\n', files);
  const table: Array<[string, Workflow, string[] | 'default']> = [
    [
      "its agent's skill, as its plugin holds it, and neither the one no line names nor the place skill",
      step,
      ['nemia-builder:write-a-note'],
    ],
    ['none for an agent rendered with no skill', resolved('---\n---\nYou build.\n', files), []],
    ['none for a step whose rendered folder is gone: its brief tells them whole', unrendered(step), []],
    ["none for a step that continues another's session", { ...step, resume: 'before' }, []],
    ["the harness's own on a harness besides the default, codex", { ...step, harness: 'codex' }, 'default'],
  ];
  for (const [name, given, skills] of table) await t.test(name, () => assert.deepEqual(enabledSkillsOf(given), skills));
});

const AGENTS: Agents = new Map([
  ['scribe', { ...parseAgent('scribe', '---\nskills: alpha, beta\n---\nYou are Scribe.\n'), customInstructions: 'Be terse.' }],
  ['bare', parseAgent('bare', '---\n---\nYou are bare.\n')],
  ['cody', { ...parseAgent('cody', '---\n---\nYou are Cody.\n'), customInstructions: 'Be terse.' }],
  ['dee', parseAgent('dee', '---\nmodel: opus\ndisallowedTools: Bash(git push:*)\n---\nYou are Dee.\n')],
]);

/** The step `build` written with `lines` as its frontmatter and `note` as its own words, resolved with the agents above. */
const stepOf = (lines: string, note = 'Build it.', rules?: string): Workflow =>
  parseWorkflow('build', `---\nplace: git\n${lines}\n---\n${note}\n`, undefined, AGENTS, undefined, undefined, rules);

/** A run of `steps`, none filed, asked for `brief`. */
const runOf = (steps: readonly Workflow[], brief = 'add a flag'): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief,
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps: Object.fromEntries(steps.map((s) => [s.name, { taskId: null }])),
});

/** What `step` would be told as the first step of a run of it alone. */
const briefOf = (step: Workflow): string => composeBrief(step, runOf([step]), [step]);

const TASK = '## What was asked for\n\nadd a flag';

test('toldLayers: a filed brief cut back into what the step was told, by layer, only where it opens with the layers above the task', async (t) => {
  await rows(t, [
    [
      "a rendered step: the agent's words and the person's apart, its own note as the policy, the task after it, and nothing lost",
      () => {
        const step = stepOf('agent: scribe\nskills: beta, gamma');
        const brief = briefOf(step);
        const told = toldLayers(step, brief);
        assert.deepEqual(
          [told.via, told.agent, told.instructions, told.custom, told.factory, told.policy],
          ['prompt', 'scribe', 'You are Scribe.', 'Be terse.', null, 'Build it.'],
        );
        assert.deepEqual([told.agentSkills, told.addedSkills], [['alpha', 'beta'], ['gamma']]);
        assert.ok(told.task?.startsWith(TASK), told.task ?? 'null');
        assert.ok(!told.task?.includes('Build it.'), 'the policy is not told again in the task');
        assert.equal(`${PRECEDENCE}\n\n${briefBody(step)}\n\n${told.task}`, brief, 'the cut loses nothing');
      },
    ],
    [
      "a codex step and a `resume:` step are told their agent's words in the brief: the task starts after the policy",
      () => {
        for (const step of [stepOf('agent: cody\nharness: codex'), stepOf('agent: cody\nresume: plan')]) {
          const told = toldLayers(step, `${step.body}\n\n${TASK}`);
          assert.deepEqual(
            [told.via, told.instructions, told.custom, told.policy, told.task],
            ['brief', 'You are Cody.', 'Be terse.', 'Build it.', TASK],
          );
        }
        const onCodex = stepOf('agent: cody\nharness: codex');
        assert.equal(toldLayers(onCodex, briefOf(onCodex)).task?.startsWith('## What was asked for'), true);
      },
    ],
    [
      "the factory's rules are a layer of their own, as frozen, never told again in the task; a record frozen before them shows none",
      () => {
        const rules = 'Never push on a Friday.';
        const rendered = stepOf('agent: scribe', 'Build it.', rules);
        const brief = briefOf(rendered);
        const told = toldLayers(rendered, brief);
        assert.deepEqual([told.via, told.factory, told.custom, told.policy], ['prompt', rules, 'Be terse.', 'Build it.']);
        assert.ok(told.task?.startsWith('## What was asked for'), told.task ?? 'null');
        assert.ok(!brief.includes(rules), "the rules are the rendered prompt's, not the brief's");
        for (const step of [
          stepOf('agent: cody\nharness: codex', 'Build it.', rules),
          stepOf('agent: cody\nresume: plan', 'Build it.', rules),
        ]) {
          const inBrief = toldLayers(step, `${step.body}\n\n${TASK}`);
          assert.deepEqual([inBrief.via, inBrief.factory, inBrief.policy, inBrief.task], ['brief', rules, 'Build it.', TASK]);
        }
        const bare = stepOf('agent: bare\nharness: codex', 'Build it.', rules);
        assert.deepEqual([toldLayers(bare, null).custom, toldLayers(bare, null).factory], [null, rules]);
        const { factoryRules: _r, ...before } = rendered.agent!;
        assert.equal(toldLayers({ ...rendered, agent: before }, brief).factory, null);
      },
    ],
    [
      'a brief that does not open with the layers is the task whole, never cut at a wrong offset',
      () => {
        const step = stepOf('agent: scribe');
        const resumed = '## Your answer\n\nTry again.\n\n## When you are finished\n\nSign off.';
        assert.equal(toldLayers(step, resumed).task, resumed);
        const shorter = `${'x'.repeat(step.agent!.body.length)}\n\n## What was asked for`;
        assert.equal(toldLayers(step, shorter).task, shorter);
        const old = { ...step, agent: { ...step.agent!, instructions: undefined, customInstructions: undefined, skills: undefined } };
        const frozen = `${old.body}\n\n## What was asked for`;
        const told = toldLayers(old, frozen);
        assert.equal(told.instructions, null);
        assert.equal(told.task, frozen, 'a record frozen without the instructions keeps them in the task');
        assert.ok(told.task.includes('You are Scribe.'));
        const onCodex = stepOf('agent: cody\nharness: codex', 'Build it.', 'Never push on a Friday.');
        const dropped = headedLayers([
          ['instructions', 'You are Cody.'],
          ['custom', 'Be terse.'],
          ['policy', 'Build it.'],
        ]);
        const notFrozen = `${PRECEDENCE}\n\n${dropped}\n\n## What was asked for`;
        assert.equal(toldLayers(onCodex, notFrozen).task, notFrozen, 'layers not the ones frozen');
        assert.equal(
          toldLayers(onCodex, briefOf(onCodex)).task?.startsWith('## What was asked for'),
          true,
          'the task starts after the headed layers',
        );
      },
    ],
    [
      'a step filed with its rendered folder gone is told its layers in its brief, then its skills whole, which stay in the task',
      () => {
        const step = stepOf('agent: scribe');
        const told = toldLayers(step, `${unrendered(step, [{ name: 'alpha', text: 'Alpha.' }]).body}\n\n${TASK}`);
        assert.equal(told.via, 'brief');
        assert.ok(told.task?.startsWith('No skill is loaded with the Skill tool'), told.task ?? 'null');
        assert.ok(!told.task?.includes('You are Scribe.'));
      },
    ],
    [
      'a step with no agent: its own words are the policy, no agent layer, and a brief not filed is no task',
      () => {
        const step = parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n');
        assert.deepEqual(toldLayers(step, null), {
          agent: null,
          instructions: null,
          custom: null,
          factory: null,
          agentSkills: [],
          policy: 'Build it.',
          addedSkills: [],
          fence: [],
          folderFiles: true,
          task: null,
          via: 'brief',
        });
        assert.equal(toldLayers(step, briefOf(step)).task?.startsWith('## What was asked for'), true);
      },
    ],
    [
      "the step's fence lines are the fence keys its own file sets, as resolved: never a role key, never its agent's fence",
      () => {
        const own = toldLayers(stepOf('agent: dee\nmodel: sonnet\ndisallowedTools: Bash(git push:*), Bash(rm:*)'), null).fence;
        assert.deepEqual(own, [{ key: 'disallowedTools', value: 'Bash(rm:*)' }]);
        const added = stepOf('agent: dee\ndisallowedTools: Bash(rm:*)');
        assert.deepEqual(added.disallowedTools, ['Bash(rm:*)', 'Bash(git push:*)'], "a step's line adds to its agent's");
        assert.deepEqual(toldLayers(added, null).fence, [{ key: 'disallowedTools', value: 'Bash(rm:*)' }]);
        assert.deepEqual(
          toldLayers(stepOf('agent: dee\ndisallowedTools: Bash(git push:*)'), null).fence,
          [],
          'a line that only repeats its agent',
        );
        const inherited = stepOf('agent: dee');
        assert.deepEqual(inherited.disallowedTools, ['Bash(git push:*)']);
        assert.deepEqual(toldLayers(inherited, null).fence, [], "the agent's fence is not the step's policy");
      },
    ],
    [
      'the brief opens with the precedence, then the layers the step is told in its brief',
      () => {
        const onCodex = stepOf('agent: cody\nharness: codex');
        const brief = briefOf(onCodex);
        assert.equal(brief.split('\n')[0], PRECEDENCE);
        assert.equal(brief.slice(0, PRECEDENCE.length + 2 + briefBody(onCodex).length), `${PRECEDENCE}\n\n${briefBody(onCodex)}`);
        assert.ok(
          briefOf(stepOf('agent: scribe')).startsWith(`${PRECEDENCE}\n\nBuild it.\n\n`),
          'a rendered step: the precedence, then its own note',
        );
        const bare = parseWorkflow('build', '---\nplace: git\nagent: scribe\n---\n', undefined, AGENTS);
        assert.ok(briefOf(bare).startsWith(`${PRECEDENCE}\n\n## What was asked for`), 'a rendered step with no note of its own');
        const resumed = stepOf('agent: cody\nresume: plan');
        assert.ok(briefOf(resumed).startsWith(`${PRECEDENCE}\n\n${resumed.body}`));
      },
    ],
    [
      'a brief composed with the precedence cuts back to the identical task, and so does one filed before it, headed or plain',
      () => {
        for (const step of [stepOf('agent: scribe'), stepOf('agent: cody\nharness: codex'), stepOf('')]) {
          const task = toldLayers(step, briefOf(step)).task ?? '';
          assert.ok(task.startsWith(TASK), `${step.harness ?? 'rendered'}: ${task}`);
          assert.ok(!task.includes(PRECEDENCE), 'the precedence is a layer of its own');
        }
        const onCodex = stepOf('agent: cody\nharness: codex');
        assert.equal(toldLayers(onCodex, `${onCodex.body}\n\n${TASK}`).task, TASK, 'filed before the precedence, its layers headed');
        const before = toldLayers(onCodex, `${['You are Cody.', 'Be terse.', 'Build it.'].join('\n\n')}\n\n${TASK}`);
        assert.deepEqual([before.task, before.via], [TASK, 'brief'], 'filed before the headings, its layers joined plainly');
      },
    ],
    [
      "the folder's files are a layer the session reads itself: told for a step that works in a folder here, never on a remote agent",
      () => {
        assert.equal(toldLayers(stepOf('agent: scribe'), null).folderFiles, true);
        assert.equal(toldLayers(parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n'), null).folderFiles, true);
        assert.equal(toldLayers(stepOf('agent: bare\nharness: a2a:partner'), null).folderFiles, false);
      },
    ],
    [
      "skillLayers: a skill both the agent and the step name is the agent's; a record frozen before the added skills counts each the step's",
      () => {
        assert.deepEqual(skillLayers(stepOf('agent: scribe\nskills: beta, gamma')), { agent: ['alpha', 'beta'], added: ['gamma'] });
        assert.deepEqual(skillLayers(stepOf('agent: scribe')), { agent: ['alpha', 'beta'], added: [] });
        assert.deepEqual(skillLayers(stepOf('agent: bare\nskills: gamma')), { agent: [], added: ['gamma'] });
        assert.deepEqual(skillLayers(parseWorkflow('build', '---\nplace: git\n---\nBuild it.\n')), { agent: [], added: [] });
        const step = stepOf('agent: scribe\nskills: beta, gamma');
        const { addedSkills: _added, ...agent } = step.agent!;
        assert.deepEqual(skillLayers({ ...step, agent }), { agent: ['alpha'], added: ['beta', 'gamma'] });
      },
    ],
  ]);
});

test("where a skill or an agent is found: the workflow's own root, the repository's .claude/, the store, then the place skill", async (t) => {
  await rows(t, [
    [
      "the workflow's own root, then the repository's .claude/, then the store — the repository's before the store's",
      () => {
        const home = tree({
          'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
          'workflows/agents/helper.md': "---\n---\nThe store's helper.\n",
        });
        const repo = tree({
          '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note', 'preload: true\n'),
          '.claude/agents/helper.md': "---\n---\nThe repository's helper.\n",
        });
        const dir = team('---\nskills: write-a-note\n---\nYou build.\n', {});
        const places = { repo, home };
        assert.deepEqual(lookupRoots(dir, places), [path.dirname(dir), path.join(repo, '.claude'), path.join(home, 'workflows')]);
        assert.equal(skillsFor(dir, places).at.get('write-a-note'), path.join(repo, '.claude', 'skills', 'write-a-note'));
        assert.equal((agentsFor(dir, places).get('helper') as { body: string }).body.trim(), "The repository's helper.");
        assert.equal(
          skillsFor(dir, { home }).at.get('write-a-note'),
          path.join(home, 'workflows', 'skills', 'write-a-note'),
          'with no repository, the store',
        );
        const own = team('---\nskills: write-a-note\n---\nYou build.\n', {
          'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
        });
        assert.equal(
          skillsFor(own, places).at.get('write-a-note'),
          path.join(path.dirname(own), 'skills', 'write-a-note'),
          "the workflow's own root first",
        );
      },
    ],
    [
      "the package's place skill after every place, where none has its name: a place's own `git` comes first",
      () => {
        const home = tree({});
        const repo = tree({});
        const found = skillsFor(team('---\nskills: git\n---\nYou build.\n', {}), { repo, home });
        assert.equal(found.at.get('git'), BUILTIN_PLACE);
        assert.equal(found.looked.at(-1), PLACE_SKILLS);
        assert.ok(isBuiltinPlace(BUILTIN_PLACE));
        const own = team('---\nskills: git\n---\nYou build.\n', { 'workflows/skills/git/SKILL.md': SKILL('git') });
        const ownGit = path.join(path.dirname(own), 'skills', 'git');
        assert.equal(skillsFor(own, { repo, home }).at.get('git'), ownGit);
        assert.equal(isBuiltinPlace(ownGit), false);
      },
    ],
    [
      'REFUSED: a skill no place has, naming each place looked in, in order',
      () => {
        const repo = tree({});
        const dir = team('---\nskills: draw-a-map\n---\nYou build.\n', {});
        const looked = [
          path.join(path.dirname(dir), 'skills'),
          path.join(repo, '.claude', 'skills'),
          path.join(ROOT, 'workflows', 'skills'),
        ].join(', ');
        names(
          refusal(() => loadWorkflows(dir, { repo, home: ROOT })),
          'build: `agent: builder` gives the skill `draw-a-map`',
          'no skills folder has it',
          `looked in ${looked}`,
        );
      },
    ],
    [
      "REFUSED: a name in both of one repository's places, workflows/ and .claude/ — a skill, then an agent — naming both",
      () => {
        const repo = tree({
          'workflows/team/build.md': '---\nplace: git\nagent: builder\n---\n',
          'workflows/agents/builder.md': '---\nskills: write-a-note\n---\nYou build.\n',
          'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
          '.claude/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
        });
        const dir = path.join(repo, 'workflows', 'team');
        names(
          refusal(() => loadWorkflows(dir, { repo })),
          'build: `agent: builder` gives the skill `write-a-note`',
          'write-a-note is a skill in both',
          "one repository's two places for skills",
          'Keep one of them',
          path.join(repo, 'workflows', 'skills', 'write-a-note'),
          path.join(repo, '.claude', 'skills', 'write-a-note'),
        );
        fs.rmSync(path.join(repo, '.claude', 'skills'), { recursive: true });
        fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
        fs.writeFileSync(path.join(repo, '.claude', 'agents', 'builder.md'), '---\n---\nAnother builder.\n');
        const both = refusal(() => loadWorkflows(dir, { repo }));
        names(
          both,
          'builder is an agent in both',
          path.join(repo, '.claude', 'agents', 'builder.md'),
          "one repository's two places for agents",
          'nothing says which runs',
        );
        assert.equal(loadWorkflows(dir).length, 1, "read with no repository, the clash is no one repository's");
      },
    ],
    [
      "an agent's version moves with each skill it gives and each file beside it, and not with one it does not give",
      () => {
        const dir = team('---\nskills: write-a-note\n---\nYou build.\n', {
          'workflows/skills/write-a-note/SKILL.md': SKILL('write-a-note'),
          'workflows/skills/other/SKILL.md': SKILL('other'),
        });
        const agents = path.join(path.dirname(dir), 'agents');
        const skills = path.join(path.dirname(dir), 'skills');
        const was = agentVersion(agents, 'builder');
        fs.appendFileSync(path.join(skills, 'other', 'SKILL.md'), 'More.\n');
        assert.equal(agentVersion(agents, 'builder'), was, 'a skill it does not give');
        fs.appendFileSync(path.join(skills, 'write-a-note', 'SKILL.md'), 'More.\n');
        const edited = agentVersion(agents, 'builder');
        assert.notEqual(edited, was, 'its SKILL.md');
        fs.writeFileSync(path.join(skills, 'write-a-note', 'template.md'), '# A template\n');
        assert.notEqual(agentVersion(agents, 'builder'), edited, 'a file beside it, which the plugin copies too');
      },
    ],
    [
      "F21's models: the three measured, and a name that only begins like one is not it",
      () => {
        assert.deepEqual([...CLAUDE_AUTO_DROPPED], ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'], 'a new one is measured first');
        assert.ok(autoDropped('claude', 'claude-sonnet-4-5-20250929', undefined));
        assert.equal(autoDropped('claude', 'claude-sonnet-5', undefined), undefined);
      },
    ],
  ]);
});

test("a codex step's `sandbox:` reaches Codex as its `-s`, every sandbox, and the one it was written as before 2026-09-23 the same", () => {
  const sandboxOf = (text: string) => {
    const step = parseWorkflow('review', text);
    const { args } = codex.command({
      name: 'review',
      brief: 'b',
      cwd: scratch('wf-rendering-codex-'),
      config: { permissionMode: modeOf(step) },
    });
    return args[args.indexOf('-s') + 1];
  };
  for (const sandbox of CODEX_SANDBOXES) {
    assert.equal(sandboxOf(`---\nplace: git\nharness: codex\nsandbox: ${sandbox}\n---\nreview it\n`), sandbox);
    assert.equal(
      sandboxOf(`---\nplace: git\nharness: codex\npermissionMode: ${sandbox}\n---\nreview it\n`),
      sandbox,
      `the former line, ${sandbox}`,
    );
  }
  assert.equal(sandboxOf('---\nplace: git\nharness: codex\npermissionMode: bypassPermissions\n---\nreview it\n'), 'danger-full-access');
  const { args } = codex.command({
    name: 'review',
    brief: 'b',
    cwd: scratch('wf-rendering-codex-'),
    config: { permissionMode: parseWorkflow('review', '---\nplace: git\nharness: codex\nsandbox: read-only\n---\nr\n').permissionMode },
  });
  assert.equal(
    args[args.indexOf('-s') + 1],
    'workspace-write',
    "filed from permissionMode alone, without modeOf, the reviewer runs in Codex's default",
  );
});
