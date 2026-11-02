/**
 * Fences only tighten: a step that names an agent, or is hired one, may narrow the agent's `tools:`, `allowedTools:`, `permissionMode:`
 * and `sandbox:`, and never widen them (`fenceRefusal`); its `disallowedTools:` adds to the agent's (`deniesWith`), so it can lift none.
 * One table, a row per key, each refusal beside what still loads; and what a step that names no mode is filed with, as the parser reads
 * the runtime's default (`fenceReach`) and the flags it renders (`renderedFlags`). How those flags reach Claude Code is the runtime's,
 * pinned in its `test/claude-code.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseWorkflow, WorkflowError, type Agents, type Workflow } from '../src/workflow.ts';
import { fenceReach } from 'agent-runtime/vocabulary';
import { directoryFence } from '../src/workflow/fence.ts';
import { renderedFlags } from '../src/agents/agents.ts';
import { scratch } from './scratch.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-fence-');
process.env.WF_ROOT = ROOT;
const { writeWorkflow } = await import('../src/runner.ts');

/** The agents of `files`, by name, each parsed from its file's text. */
const agentsOf = (files: Record<string, string>): Agents =>
  new Map(Object.entries(files).map(([name, text]) => [name, parseAgent(name, text)]));

/** The step `name` written with `lines` as its frontmatter, resolved with `agents`. */
const stepOf = (agents: Agents, lines: string, name = 'build'): Workflow =>
  parseWorkflow(name, `---\nplace: git\n${lines}\n---\nDo it.\n`, undefined, agents);

/** What `fn` was refused with: a `WorkflowError`'s message, or a failed assertion when it was not refused. */
function refusal(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof WorkflowError, String(err));
    return err.message;
  }
  return assert.fail('it was not refused');
}

/** Holds a refusal to its parts: the step and its line first, what it would add, the rule, and a fix naming the agent's file. */
function holds(said: string, line: string, added: string, agent: string): void {
  assert.ok(said.startsWith(`build: \`${line}\``), said);
  names(said, added, "a step may only tighten its agent's fence", `agents/${agent}.md`);
}

/** `holds` of the step `agent: <agent>` with `line`, refused. */
const widens = (agents: Agents, agent: string, line: string, added: string) =>
  holds(
    refusal(() => stepOf(agents, `agent: ${agent}\n${line}`)),
    line,
    added,
    agent,
  );

test("a step may narrow its agent's fence and never widen it, key by key, as a file, a hire and a write read it", async (t) => {
  await t.test('REFUSED: `tools:` naming a tool its agent does not have, naming only what it adds; a narrower list loads', () => {
    const agents = agentsOf({ builder: '---\ntools: Read, Grep, Skill\n---\nWork.\n', open: '---\n---\nWork.\n' });
    const said = refusal(() => stepOf(agents, 'agent: builder\ntools: Read, Bash'));
    holds(said, 'tools: Read, Bash', '`Bash`', 'builder');
    assert.equal(said.includes('`Read`'), false, 'names only what it adds');
    assert.deepEqual(stepOf(agents, 'agent: builder\ntools: Read').tools, ['Read'], 'a narrower list loads');
    assert.deepEqual(stepOf(agents, 'agent: open\ntools: Read, Bash').tools, ['Read', 'Bash'], 'an agent with no list has every tool');
  });

  await t.test(
    'REFUSED: `allowedTools:` allowing what its agent does not; a prefix covers one command, never a longer word or a chain',
    () => {
      const agents = agentsOf({ builder: '---\nallowedTools: Bash(npm:*)\n---\nWork.\n', bare: '---\n---\nWork.\n' });
      const said = refusal(() => stepOf(agents, 'agent: builder\nallowedTools: Bash(npm test), Bash(git push)'));
      holds(said, 'allowedTools: Bash(npm test), Bash(git push)', '`Bash(git push)`', 'builder');
      assert.equal(said.includes('`Bash(npm test)`'), false, 'names only what it adds');
      assert.deepEqual(stepOf(agents, 'agent: builder\nallowedTools: Bash(npm run lint)').allowedTools, ['Bash(npm run lint)'], 'covered');
      for (const rule of [
        'Bash(npmx)',
        'Bash(npm test && git push)',
        'Bash(npm test; curl x)',
        'Bash(npm test | sh)',
        'Bash(npm test > /etc/x)',
        'Bash(npm $(x))',
      ])
        names(
          refusal(() => stepOf(agents, `agent: builder\nallowedTools: ${rule}`)),
          `\`${rule}\``,
        );
      widens(agents, 'bare', 'allowedTools: Agent', '`Agent`');
    },
  );

  await t.test('REFUSED: a path rule outside the one its agent allows, by `..` or an anchor elsewhere; a path under it loads', () => {
    const agents = agentsOf({ editor: '---\nallowedTools: Edit(**), Read(docs/**)\n---\nWork.\n' });
    assert.deepEqual(stepOf(agents, 'agent: editor\nallowedTools: Edit(notes/**), Read(docs/a.md)').allowedTools, [
      'Edit(notes/**)',
      'Read(docs/a.md)',
    ]);
    for (const rule of ['Edit(/etc/**)', 'Edit(~/x)', 'Edit(notes/../../x)', 'Read(src/**)', 'Read(docs/../x)'])
      widens(agents, 'editor', `allowedTools: ${rule}`, `\`${rule}\``);
  });

  await t.test('REFUSED: an `Edit` allow over an agent whose mode asks first, which a mode that edits unasked already grants', () => {
    const agents = agentsOf({
      asks: '---\npermissionMode: dontAsk\n---\nWork.\n',
      edits: '---\npermissionMode: acceptEdits\n---\nWork.\n',
      open: '---\n---\nWork.\n',
      bypass: '---\npermissionMode: bypassPermissions\n---\nWork.\n',
    });
    widens(agents, 'asks', 'allowedTools: Edit(**)', '`Edit(**)`');
    for (const agent of ['edits', 'open'])
      assert.deepEqual(
        stepOf(agents, `agent: ${agent}\npermissionMode: dontAsk\nallowedTools: Edit(**)`).allowedTools,
        ['Edit(**)'],
        agent,
      );
    widens(agents, 'edits', 'allowedTools: Edit(/etc/**)', '`Edit(/etc/**)`');
    assert.deepEqual(stepOf(agents, 'agent: bypass\nallowedTools: Bash(git push)').allowedTools, ['Bash(git push)'], 'asks about nothing');
  });

  await t.test("a step's `disallowedTools:` adds to its agent's: its own rules, then each of the agent's they do not cover", () => {
    const agents = agentsOf({ builder: '---\ndisallowedTools: Bash(git push), Bash(git push:*)\n---\nWork.\n' });
    const step = stepOf(agents, 'agent: builder\ndisallowedTools: Bash(npm run build)');
    assert.deepEqual(step.disallowedTools, ['Bash(npm run build)', 'Bash(git push)', 'Bash(git push:*)']);
    assert.deepEqual(step.agent?.agentDenies, ['Bash(git push)', 'Bash(git push:*)'], "the agent's kept apart, to write the line back");
    assert.deepEqual(
      stepOf(agents, 'agent: builder\ndisallowedTools: Bash(git push:*), Bash(npm run build), Bash(git push)').disallowedTools,
      ['Bash(git push:*)', 'Bash(npm run build)', 'Bash(git push)'],
      'a line that repeats every deny of its agent resolves to itself',
    );
    assert.deepEqual(stepOf(agents, 'agent: builder\ndisallowedTools: Bash').disallowedTools, ['Bash'], 'a bare tool covers its rules');
    assert.deepEqual(stepOf(agents, 'agent: builder').disallowedTools, ['Bash(git push)', 'Bash(git push:*)'], "no line is the agent's");
  });

  await t.test("REFUSED: `permissionMode:` wider than its agent's, or than the runtime's default when it names none", () => {
    const agents = agentsOf({ builder: '---\npermissionMode: dontAsk\n---\nWork.\n', open: '---\n---\nWork.\n' });
    widens(agents, 'builder', 'permissionMode: acceptEdits', 'dontAsk');
    assert.equal(stepOf(agents, 'agent: builder\npermissionMode: plan').permissionMode, 'plan');
    assert.equal(stepOf(agents, 'agent: builder\npermissionMode: default').permissionMode, 'default', 'as narrow is no wider');
    widens(agents, 'open', 'permissionMode: bypassPermissions', fenceReach('claude')!.given);
    assert.equal(stepOf(agents, 'agent: open\npermissionMode: auto').permissionMode, 'auto');
  });

  await t.test("REFUSED: `sandbox:` wider than its agent's, under either name, or than codex's default when it names none", () => {
    const agents = agentsOf({
      reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
      coder: '---\nharness: codex\n---\nCode.\n',
    });
    widens(agents, 'reviewer', 'sandbox: workspace-write', 'read-only');
    names(
      refusal(() => stepOf(agents, 'agent: reviewer\npermissionMode: workspace-write')),
      "a step may only tighten its agent's fence",
    );
    widens(agents, 'coder', 'sandbox: danger-full-access', 'workspace-write');
    assert.equal(stepOf(agents, 'agent: coder\nsandbox: read-only').sandbox, 'read-only');
  });

  await t.test('REFUSED: a step that runs a fenced agent on the other harness; an unfenced agent moves', () => {
    const agents = agentsOf({
      implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
      reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
      open: '---\n---\nWork.\n',
    });
    const said = refusal(() => stepOf(agents, 'agent: implementer\nharness: codex\nsandbox: read-only'));
    assert.ok(said.startsWith('build: `harness: codex`'), said);
    names(said, '`permissionMode: dontAsk`', 'agents/implementer.md', 'claude');
    assert.ok(
      refusal(() => stepOf(agents, 'agent: reviewer\nharness: claude\npermissionMode: plan')).startsWith('build: `harness: claude`'),
    );
    assert.equal(stepOf(agents, 'agent: open\nharness: codex\nsandbox: read-only').sandbox, 'read-only');
  });

  await t.test('REFUSED: the same widening on an agent a factory hires, and through writeWorkflow, which writes nothing', () => {
    const agents = agentsOf({ builder: '---\ntools: Read, Grep\n---\nWork.\n' });
    const hired = refusal(() =>
      parseWorkflow('build', '---\nplace: git\ntools: Read, Bash\n---\nDo it.\n', undefined, agents, undefined, {
        agent: 'builder',
        factory: 'acme',
        step: 'dev/build',
      }),
    );
    holds(hired, 'tools: Read, Bash', '`Bash`', 'builder');
    const dir = fs.mkdtempSync(path.join(ROOT, 'workflows-'));
    fs.mkdirSync(path.join(dir, 'agents'));
    fs.mkdirSync(path.join(dir, 'dev'));
    fs.writeFileSync(path.join(dir, 'agents', 'builder.md'), '---\ntools: Read, Grep\n---\nWork.\n');
    const file = path.join(dir, 'dev', 'build.md');
    fs.writeFileSync(file, '---\nplace: git\nagent: builder\n---\n');
    const step = { name: 'build', after: [], place: 'git' as const, agent: 'builder', tools: ['Read', 'Bash'], body: '' };
    holds(
      refusal(() => writeWorkflow(path.join(dir, 'dev'), [step], undefined, { anywhere: true })),
      'tools: Read, Bash',
      '`Bash`',
      'builder',
    );
    assert.equal(fs.readFileSync(file, 'utf8'), '---\nplace: git\nagent: builder\n---\n', 'nothing written');
  });

  const cases: [string | undefined, string | undefined, ReturnType<typeof directoryFence>][] = [
    [undefined, 'Bash', { permissionMode: 'dontAsk', allowedTools: ['Edit(**)'] }],
    ['acceptEdits', undefined, { permissionMode: 'dontAsk', allowedTools: ['Edit(**)'] }],
    ['dontAsk', undefined, { permissionMode: 'dontAsk', allowedTools: [] }],
    [
      'default',
      'Edit(notes/**), Read(docs/**), Bash(npm test), Edit(/etc/**), Read(../x)',
      { permissionMode: 'dontAsk', allowedTools: ['Edit(notes/**)', 'Read(docs/**)'] },
    ],
    ['plan', 'Edit(**)', { permissionMode: 'plan', allowedTools: ['Edit(**)'] }],
    ['dontAsk', 'Bash, Edit(/home/**)', undefined],
    ['manual', 'Read', undefined],
  ];
  for (const [mode, allows, fence] of cases)
    await t.test(
      `${fence ? '' : 'REFUSED: '}directoryFence: the fence held to the directory, over ${mode ?? 'no mode'} allowing ${allows ?? 'nothing'}`,
      () => {
        assert.deepEqual(directoryFence(mode, allows), fence);
        if (fence === undefined) return;
        const agent = [
          '---',
          ...(mode ? [`permissionMode: ${mode}`] : []),
          ...(allows ? [`allowedTools: ${allows}`] : []),
          '---',
          'Work.',
          '',
        ];
        const lines = [
          `permissionMode: ${fence.permissionMode}`,
          ...(fence.allowedTools.length ? [`allowedTools: ${fence.allowedTools.join(', ')}`] : []),
        ];
        const step = stepOf(agentsOf({ tried: agent.join('\n') }), ['agent: tried', ...lines].join('\n'));
        assert.equal(step.permissionMode, fence.permissionMode, 'the fence given loads over its agent');
      },
    );

  await t.test(
    'a step that names no mode is filed none, the runtime giving its default; its instructions, skills and harnessPrompt render three flags',
    () => {
      const scribe = parseAgent('scribe', '---\nharnessPrompt: no-coding\nskills: write-a-note, mind-the-tone\n---\nYou write.\n');
      const step = parseWorkflow('write', '---\nplace: git\nagent: scribe\n---\nWrite.\n', undefined, new Map([['scribe', scribe]]));
      assert.equal(step.permissionMode, undefined);
      const agents = path.join(scratch('wf-fence-auto-'), 'agents', 'write');
      fs.mkdirSync(path.join(agents, 'nemia-scribe'), { recursive: true });
      fs.writeFileSync(path.join(agents, 'prompt.md'), 'You write.\n');
      const claude = renderedFlags(step, agents);
      assert.deepEqual(
        Object.keys(claude ?? {}).sort(),
        ['appendSystemPromptFile', 'pluginDir', 'settings'],
        'every flag but systemPromptFile',
      );
      assert.deepEqual(claude?.pluginDir, [path.join(agents, 'nemia-scribe')]);
      assert.equal(claude?.settings, '{"outputStyle":"nemia-scribe:no-coding"}', 'the runtime adds its own keys');
    },
  );
});
