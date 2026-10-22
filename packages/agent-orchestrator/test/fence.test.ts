/**
 * Fences only tighten: a step that names an agent, or is hired one, may narrow the agent's `tools:`, `allowedTools:`, `disallowedTools:`,
 * `permissionMode:` and `sandbox:`, and never widen them, nor set `background: true` over an agent an allow rule would widen
 * (`fenceRefusal`). One refusing fixture per key, each beside what still loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseWorkflow, WorkflowError, type Agents, type Workflow } from '../src/workflow.ts';
import { CLAUDE_PERMISSION_MODES, fenceReach } from 'agent-runtime/vocabulary';
import { Engine } from 'agent-runtime';
import { directoryFence } from '../src/workflow/fence.ts';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { plainEngine } from './promised.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { sdkArgValue } from './sdk-argv.ts';

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

/** Holds a refusal to its parts: the step, the key and what it would add, the rule, and a fix naming the agent's file. */
function holds(said: string, step: string, line: string, added: string, agent: string): void {
  assert.ok(said.startsWith(`${step}: \`${line}\``), said);
  assert.ok(said.includes(added), `names ${added}: ${said}`);
  assert.ok(said.includes("a step may only tighten its agent's fence"), said);
  assert.ok(said.includes(`agents/${agent}.md`), said);
}

test('REFUSED at shipped defaults: `tools:` naming a tool its agent does not have', () => {
  const agents = agentsOf({ ada: '---\ntools: Read, Grep, Skill\n---\nWork.\n', open: '---\n---\nWork.\n' });
  const said = refusal(() => stepOf(agents, 'agent: ada\ntools: Read, Bash'));
  holds(said, 'build', 'tools: Read, Bash', '`Bash`', 'ada');
  assert.ok(!said.includes('`Read`'), `names only what it adds: ${said}`);
  assert.deepEqual(stepOf(agents, 'agent: ada\ntools: Read').tools, ['Read'], 'a narrower list loads');
  assert.deepEqual(stepOf(agents, 'agent: open\ntools: Read, Bash').tools, ['Read', 'Bash'], 'an agent with no list has every tool');
});

test('REFUSED at shipped defaults: `allowedTools:` allowing what its agent does not', () => {
  const agents = agentsOf({ ada: '---\nallowedTools: Bash(npm:*)\n---\nWork.\n', bare: '---\n---\nWork.\n' });
  const said = refusal(() => stepOf(agents, 'agent: ada\nallowedTools: Bash(npm test), Bash(git push)'));
  holds(said, 'build', 'allowedTools: Bash(npm test), Bash(git push)', '`Bash(git push)`', 'ada');
  assert.ok(!said.includes('`Bash(npm test)`'), `names only what it adds: ${said}`);
  assert.deepEqual(
    stepOf(agents, 'agent: ada\nallowedTools: Bash(npm run lint)').allowedTools,
    ['Bash(npm run lint)'],
    'covered by prefix',
  );
  assert.ok(
    refusal(() => stepOf(agents, 'agent: ada\nallowedTools: Bash(npmx)')).includes('`Bash(npmx)`'),
    'a prefix covers a command, never a longer word',
  );
  for (const joined of [
    'Bash(npm test && git push)',
    'Bash(npm test; curl x)',
    'Bash(npm test | sh)',
    'Bash(npm test > /etc/x)',
    'Bash(npm $(x))',
  ])
    assert.ok(
      refusal(() => stepOf(agents, `agent: ada\nallowedTools: ${joined}`)).includes(`\`${joined}\``),
      `a prefix covers one command, never ${joined}`,
    );
  holds(
    refusal(() => stepOf(agents, 'agent: bare\nallowedTools: Agent')),
    'build',
    'allowedTools: Agent',
    '`Agent`',
    'bare',
  );
});

test('REFUSED at shipped defaults: a path rule outside the one its agent allows, by `..` or an anchor elsewhere', () => {
  const agents = agentsOf({ editor: '---\nallowedTools: Edit(**), Read(docs/**)\n---\nWork.\n' });
  assert.deepEqual(
    stepOf(agents, 'agent: editor\nallowedTools: Edit(notes/**), Read(docs/a.md)').allowedTools,
    ['Edit(notes/**)', 'Read(docs/a.md)'],
    'a path under the pattern loads',
  );
  for (const rule of ['Edit(/etc/**)', 'Edit(~/x)', 'Edit(notes/../../x)', 'Read(src/**)', 'Read(docs/../x)'])
    holds(
      refusal(() => stepOf(agents, `agent: editor\nallowedTools: ${rule}`)),
      'build',
      `allowedTools: ${rule}`,
      `\`${rule}\``,
      'editor',
    );
});

test('REFUSED at shipped defaults: an `Edit` allow over an agent whose mode asks first, which a mode that edits unasked already grants', () => {
  const agents = agentsOf({
    asks: '---\npermissionMode: dontAsk\n---\nWork.\n',
    edits: '---\npermissionMode: acceptEdits\n---\nWork.\n',
    open: '---\n---\nWork.\n',
    bypass: '---\npermissionMode: bypassPermissions\n---\nWork.\n',
  });
  holds(
    refusal(() => stepOf(agents, 'agent: asks\nallowedTools: Edit(**)')),
    'build',
    'allowedTools: Edit(**)',
    '`Edit(**)`',
    'asks',
  );
  for (const agent of ['edits', 'open'])
    assert.deepEqual(
      stepOf(agents, `agent: ${agent}\npermissionMode: dontAsk\nallowedTools: Edit(**)`).allowedTools,
      ['Edit(**)'],
      `${agent} edits in its directory unasked`,
    );
  holds(
    refusal(() => stepOf(agents, 'agent: edits\nallowedTools: Edit(/etc/**)')),
    'build',
    'allowedTools: Edit(/etc/**)',
    '`Edit(/etc/**)`',
    'edits',
  );
  assert.deepEqual(stepOf(agents, 'agent: bypass\nallowedTools: Bash(git push)').allowedTools, ['Bash(git push)'], 'asks about nothing');
});

test("REFUSED at shipped defaults: `disallowedTools:` that leaves out one of its agent's denies", () => {
  const agents = agentsOf({ ada: '---\ndisallowedTools: Bash(git push), Bash(git push:*)\n---\nWork.\n' });
  const said = refusal(() => stepOf(agents, 'agent: ada\ndisallowedTools: Bash(git push)'));
  holds(said, 'build', 'disallowedTools: Bash(git push)', '`Bash(git push:*)`', 'ada');
  assert.ok(said.includes('replaces'), `says the list replaces the agent's: ${said}`);
  assert.deepEqual(
    stepOf(agents, 'agent: ada\ndisallowedTools: Bash(git push), Bash(git push:*), Bash(npm run build)').disallowedTools,
    ['Bash(git push)', 'Bash(git push:*)', 'Bash(npm run build)'],
    'the list that keeps both and adds one loads',
  );
  assert.deepEqual(stepOf(agents, 'agent: ada\ndisallowedTools: Bash').disallowedTools, ['Bash'], 'a bare tool covers its rules');
});

test("REFUSED at shipped defaults: `permissionMode:` wider than its agent's, or than the default when it names none", () => {
  const agents = agentsOf({ ada: '---\npermissionMode: dontAsk\n---\nWork.\n', open: '---\n---\nWork.\n' });
  holds(
    refusal(() => stepOf(agents, 'agent: ada\npermissionMode: acceptEdits')),
    'build',
    'permissionMode: acceptEdits',
    'dontAsk',
    'ada',
  );
  assert.equal(stepOf(agents, 'agent: ada\npermissionMode: plan').permissionMode, 'plan');
  assert.equal(stepOf(agents, 'agent: ada\npermissionMode: default').permissionMode, 'default', 'as narrow is no wider');
  holds(
    refusal(() => stepOf(agents, 'agent: open\npermissionMode: bypassPermissions')),
    'build',
    'permissionMode: bypassPermissions',
    'auto',
    'open',
  );
  assert.equal(stepOf(agents, 'agent: open\npermissionMode: auto').permissionMode, 'auto');
});

test("REFUSED at shipped defaults: `sandbox:` wider than its agent's, under either name, or than codex's default when it names none", () => {
  const agents = agentsOf({
    reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
    coder: '---\nharness: codex\n---\nCode.\n',
  });
  holds(
    refusal(() => stepOf(agents, 'agent: reviewer\nsandbox: workspace-write')),
    'build',
    'sandbox: workspace-write',
    'read-only',
    'reviewer',
  );
  assert.ok(
    refusal(() => stepOf(agents, 'agent: reviewer\npermissionMode: workspace-write')).includes("a step may only tighten its agent's fence"),
    'the former name is the same key',
  );
  holds(
    refusal(() => stepOf(agents, 'agent: coder\nsandbox: danger-full-access')),
    'build',
    'sandbox: danger-full-access',
    'workspace-write',
    'coder',
  );
  assert.equal(stepOf(agents, 'agent: coder\nsandbox: read-only').sandbox, 'read-only');
});

test('REFUSED at shipped defaults: a step that runs a fenced agent on the other harness', () => {
  const agents = agentsOf({
    implementer: '---\nharness: claude\npermissionMode: dontAsk\n---\nImplement.\n',
    reviewer: '---\nharness: codex\nsandbox: read-only\n---\nReview.\n',
    open: '---\n---\nWork.\n',
  });
  const said = refusal(() => stepOf(agents, 'agent: implementer\nharness: codex\nsandbox: read-only'));
  assert.ok(said.startsWith('build: `harness: codex`') && said.includes('`permissionMode: dontAsk`'), said);
  assert.ok(said.includes('agents/implementer.md') && said.includes('claude'), said);
  assert.ok(refusal(() => stepOf(agents, 'agent: reviewer\nharness: claude\npermissionMode: plan')).startsWith('build: `harness: claude`'));
  assert.equal(stepOf(agents, 'agent: open\nharness: codex\nsandbox: read-only').sandbox, 'read-only', 'an unfenced agent moves');
  assert.equal(
    stepOf(agents, 'agent: implementer\nharness: claude-detached\npermissionMode: plan').permissionMode,
    'plan',
    'claude-detached reads the same fence as claude',
  );
});

test('REFUSED at shipped defaults: the same widening on an agent a factory hires, and through writeWorkflow, which writes nothing', () => {
  const agents = agentsOf({ ada: '---\ntools: Read, Grep\n---\nWork.\n' });
  const hired = refusal(() =>
    parseWorkflow('build', '---\nplace: git\ntools: Read, Bash\n---\nDo it.\n', undefined, agents, undefined, {
      agent: 'ada',
      factory: 'nemia',
      step: 'dev/build',
    }),
  );
  holds(hired, 'build', 'tools: Read, Bash', '`Bash`', 'ada');

  const dir = fs.mkdtempSync(path.join(ROOT, 'workflows-'));
  fs.mkdirSync(path.join(dir, 'agents'));
  fs.mkdirSync(path.join(dir, 'dev'));
  fs.writeFileSync(path.join(dir, 'agents', 'ada.md'), '---\ntools: Read, Grep\n---\nWork.\n');
  fs.writeFileSync(path.join(dir, 'dev', 'build.md'), '---\nplace: git\nagent: ada\n---\n');
  const folder = path.join(dir, 'dev');
  const written = refusal(() =>
    writeWorkflow(folder, [{ name: 'build', after: [], place: 'git', agent: 'ada', tools: ['Read', 'Bash'], body: '' }], undefined, {
      anywhere: true,
    }),
  );
  holds(written, 'build', 'tools: Read, Bash', '`Bash`', 'ada');
  assert.equal(fs.readFileSync(path.join(folder, 'build.md'), 'utf8'), '---\nplace: git\nagent: ada\n---\n', 'nothing written');
});

test("REFUSED at shipped defaults: `background: true` over an agent in any mode but the widest, which the person's own allow rules would widen", () => {
  const widest = 'bypassPermissions';
  const modes = CLAUDE_PERMISSION_MODES.filter((mode) => mode !== widest);
  const agents = agentsOf({
    ...Object.fromEntries(modes.map((mode) => [mode, `---\npermissionMode: ${mode}\nallowedTools: Bash(npm test)\n---\nWork.\n`])),
    open: '---\n---\nWork.\n',
    wide: `---\npermissionMode: ${widest}\n---\nWork.\n`,
  });
  for (const agent of [...modes, 'open']) {
    const said = refusal(() => stepOf(agents, `agent: ${agent}\nbackground: true`));
    holds(said, 'build', 'background: true', `\`${agent === 'open' ? 'auto' : agent}\``, agent);
    assert.ok(said.includes(`\`${widest}\``), `names the mode it may run in: ${said}`);
  }
  assert.equal(stepOf(agents, 'agent: wide\nbackground: true').background, true, 'the widest mode is widened by no allow rule');
  assert.equal(
    stepOf(agents, 'agent: wide\npermissionMode: dontAsk\nbackground: true').background,
    true,
    "judged against the agent's mode, not the step's narrower one",
  );
  assert.equal(stepOf(agents, 'agent: dontAsk\nbackground: false').background, false, 'a job reads only the checkout');
  assert.equal(
    parseWorkflow('build', '---\nplace: git\nbackground: true\n---\nDo it.\n').background,
    true,
    'a step with no agent has no fence to widen',
  );

  const hired = refusal(() =>
    parseWorkflow('build', '---\nplace: git\nbackground: true\n---\nDo it.\n', undefined, agents, undefined, {
      agent: 'dontAsk',
      factory: 'nemia',
      step: 'dev/build',
    }),
  );
  holds(hired, 'build', 'background: true', '`dontAsk`', 'dontAsk');

  const dir = fs.mkdtempSync(path.join(ROOT, 'workflows-'));
  fs.mkdirSync(path.join(dir, 'agents'));
  fs.mkdirSync(path.join(dir, 'dev'));
  fs.writeFileSync(path.join(dir, 'agents', 'ada.md'), '---\npermissionMode: dontAsk\n---\nWork.\n');
  fs.writeFileSync(path.join(dir, 'dev', 'build.md'), '---\nplace: git\nagent: ada\n---\n');
  const folder = path.join(dir, 'dev');
  const written = refusal(() =>
    writeWorkflow(folder, [{ name: 'build', after: [], place: 'git', agent: 'ada', background: true, body: '' }], undefined, {
      anywhere: true,
    }),
  );
  holds(written, 'build', 'background: true', '`dontAsk`', 'ada');
  assert.equal(fs.readFileSync(path.join(folder, 'build.md'), 'utf8'), '---\nplace: git\nagent: ada\n---\n', 'nothing written');
});

test("REFUSED: a fence held to the directory where an agent's every allow reaches outside it, and each one given loads over its agent", () => {
  const cases: [string | undefined, string | undefined, ReturnType<typeof directoryFence>][] = [
    [undefined, 'Bash', { permissionMode: 'dontAsk', allowedTools: ['Edit(**)'] }],
    ['acceptEdits', undefined, { permissionMode: 'dontAsk', allowedTools: ['Edit(**)'] }],
    ['dontAsk', undefined, { permissionMode: 'dontAsk', allowedTools: [] }],
    [
      'default',
      'Edit(notes/**), Read(docs/**), Bash(npm test), Edit(/etc/**), Read(../x)',
      {
        permissionMode: 'dontAsk',
        allowedTools: ['Edit(notes/**)', 'Read(docs/**)'],
      },
    ],
    ['plan', 'Edit(**)', { permissionMode: 'plan', allowedTools: ['Edit(**)'] }],
    ['dontAsk', 'Bash, Edit(/home/**)', undefined],
    ['manual', 'Read', undefined],
  ];
  for (const [mode, allows, fence] of cases) {
    assert.deepEqual(directoryFence(mode, allows), fence, `${mode} with ${allows}`);
    if (fence === undefined) continue;
    const agent = ['---', ...(mode ? [`permissionMode: ${mode}`] : []), ...(allows ? [`allowedTools: ${allows}`] : []), '---', 'Work.', ''];
    const lines = [
      `permissionMode: ${fence.permissionMode}`,
      ...(fence.allowedTools.length ? [`allowedTools: ${fence.allowedTools.join(', ')}`] : []),
    ];
    const step = stepOf(agentsOf({ tried: agent.join('\n') }), ['agent: tried', ...lines].join('\n'));
    assert.equal(step.permissionMode, fence.permissionMode);
  }
});

test(
  "a step that names no mode is filed in the mode the parser refuses `auto` for — the runtime's default — and a rendered step's flags reach Claude Code as the runtime spells them",
  WAITED,
  async (t) => {
    const { parseAgent } = await import('../src/workflow.ts');
    const { renderedFlags } = await import('../src/agents/agents.ts');
    const scribe = parseAgent('scribe', '---\nharnessPrompt: no-coding\nskills: write-a-note, mind-the-tone\n---\nYou write.\n');
    const step = parseWorkflow('write', '---\nplace: git\nagent: scribe\n---\nWrite.\n', undefined, new Map([['scribe', scribe]]));
    const dir = scratch('wf-fence-auto-');
    const agents = path.join(dir, 'agents', 'write');
    fs.mkdirSync(path.join(agents, 'nemia-scribe'), { recursive: true });
    fs.writeFileSync(path.join(agents, 'prompt.md'), 'You write.\n');
    const claude = renderedFlags(step, agents);
    assert.deepEqual(
      Object.keys(claude ?? {}).sort(),
      ['appendSystemPromptFile', 'pluginDir', 'settings'],
      'what the tick files for an agent with instructions, skills and harnessPrompt: no-coding, every flag renderedFlags gives but systemPromptFile',
    );
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
      const e = plainEngine(
        Engine.layer({ root: path.join(dir, 'root'), harnesses: { claude: 'claude' }, claudeExecutable: path.join(dir, 'claude') }),
      );
      const id = await Effect.runPromise(e.file({ brief: 'b', cwd: dir, harness: 'claude', config: { claude } }));
      await until(
        t,
        async () => {
          if ((await Effect.runPromise(e.view(id))).state.settled) return true;
          await Effect.runPromise(e.tick());
          return false;
        },
        'the fake Claude Code task settled',
        { everyMs: 50 },
      );
    } finally {
      process.env.PATH = prev;
    }
    const args = fs.readFileSync(path.join(dir, 'args'), 'utf8').split('\n');
    assert.equal(sdkArgValue(args, '--permission-mode'), fenceReach('claude')!.given, "the runtime's answer, which the parser reads");
    assert.equal(sdkArgValue(args, '--plugin-dir'), path.join(agents, 'nemia-scribe'));
    assert.equal(
      sdkArgValue(args, '--settings'),
      '{"outputStyle":"nemia-scribe:no-coding","skillOverrides":{"write-a-note":"off","mind-the-tone":"off"},"autoMemoryEnabled":false}',
    );
    assert.deepEqual(
      args.filter((a) => a.startsWith('--append-system-prompt')),
      [],
      "the agent's prompt is no flag on a job: the SDK carries it in the session's first message, as `systemPrompt`'s append " +
        '(`harness/claude/attached-options.ts`, pinned by `attached-options.test.ts` in the runtime)',
    );
  },
);
