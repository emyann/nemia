/**
 * A person hires an agent and its session is rendered, told as stories on the stage (`story.ts`): the start names each step's agent,
 * freezes its words, the person's custom instructions and its MCP servers, renders Claude Code's prompt and plugin under
 * `runs/<id>/agents/<step>/`, and the tick files the step with its flags and a brief that is its own note; a codex step is told its
 * instructions in its brief; an edit after the start reaches only a later run. Then a step whose rendered folder is gone, told its layers
 * and its skills whole in its brief. And a table: a start that cannot tell a step its agent stops, and writes no run. The pure renderers
 * are tables in `rendering.test.ts`; an agent file's rules, in `src/agents/agents.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';

const ROOT = scratch('wf-agent-session-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { advanceRun, runWith: runEngine, startRun } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { agentFilesDir } = await import('../src/agents/agents.store.ts');
const { loadWorkflows } = await import('../src/folder/folder.store.ts');
const { noCodingStyle, pluginOf } = await import('../src/agents/agents.ts');
const { PLACE_SKILLS } = await import('../src/skills/read.store.ts');
const { PRECEDENCE } = await import('../src/brief/index.ts');
const { headedLayers } = await import('../src/workflow/index.ts');
const { WorkflowError } = await import('../src/workflow.ts');
const stage = staged({ runWith: runEngine, main, engineOf });

const SKILL = (name: string, extra = '') =>
  `---\nname: ${name}\ndescription: Use this when ${name.replace(/-/g, ' ')} is asked.\n${extra}---\nHow to ${name.replace(/-/g, ' ')}.\n`;

/** The heading each layer is told under, written out so a heading reworded fails here. */
const HEAD = {
  instructions: "## 1. Instructions — your role's own words",
  custom: '## 2. Custom instructions — the person who hired you',
  policy: "## 5. The step's policy — this step of this process",
} as const;

const STORE = path.join(ROOT, 'workflows');
const CUSTOM = path.join(ROOT, 'custom-instructions');
const FOLDER = 'workspace: folder\npermissionMode: dontAsk\n';
const SCRIBE =
  '---\nskills: write-a-note, mind-the-tone\nharnessPrompt: no-coding\nmcp: docs\ntools: Read, Edit, Skill\nallowedTools: Edit(**)\n---\nYou write notes.\n';

/** A folder that is no repository, its `.claude/` holding the skill `mind-the-tone`: a folder team started from it reads it. */
const HERE = path.join(ROOT, 'here');
fs.mkdirSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
fs.writeFileSync(path.join(HERE, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), SKILL('mind-the-tone', 'preload: true\n'));
fs.mkdirSync(path.join(STORE, 'agents'), { recursive: true });
fs.mkdirSync(path.join(STORE, 'skills', 'write-a-note'), { recursive: true });
fs.writeFileSync(path.join(STORE, 'agents', 'scribe.md'), SCRIBE);
fs.writeFileSync(path.join(STORE, 'agents', 'coder.md'), '---\nharness: codex\n---\nYou write code.\n');
fs.writeFileSync(path.join(STORE, 'agents', 'plain.md'), '---\ntools: Read\nallowedTools: Edit(**)\n---\nYou write plainly.\n');
fs.writeFileSync(path.join(STORE, 'skills', 'write-a-note', 'SKILL.md'), SKILL('write-a-note'));
fs.writeFileSync(path.join(STORE, 'skills', 'write-a-note', 'template.md'), '# Title\n');

/** A folder team in the store's own workflows, beside the store's agents and skills. */
function storeTeam(name: string, steps: Record<string, string>): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(steps)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}

/** The person's custom instructions for `agent`, written by hand as the store keeps them. */
function customFor(agent: string, text: string): void {
  fs.mkdirSync(CUSTOM, { recursive: true });
  fs.writeFileSync(path.join(CUSTOM, `${agent}.md`), text);
}

/** The run `id`'s pass on the stage's engine, and the spec each task it filed was filed with, by its step. */
async function tick(id: string): Promise<{ filed: string[]; spec: (step: string) => ReturnType<typeof specOf> }> {
  const { filed } = await stage.runWith(stage.board().e, advanceRun(readRun(id)));
  return { filed, spec: (step) => specOf(`${id}-${step}`) };
}
const specOf = (id: string) => stage.board().specs.find((s) => s.id === id) ?? assert.fail(`${id} was never filed`);

/** The run `id`'s step `name` as its start froze it. */
const frozen = (id: string, name: string) => (readRun(id).workflow ?? []).find((s) => s.name === name) ?? assert.fail(`${name} not frozen`);

test('hire an agent and render its session: frozen at the start, rendered for Claude Code, filed with its flags, an edit reaching only a later run', async (t) => {
  const s = story(t);
  const dir = storeTeam('noted', {
    write: `---\nagent: scribe\n${FOLDER}mcp: notes, docs\n---\nWrite about tides.\n`,
    code: '---\nagent: coder\nworkspace: folder\nafter: write\n---\nCode it.\n',
    wrap: '---\nafter: code\nworkspace: folder\n---\nWrap it up.\n',
  });
  customFor('scribe', 'Before: French.\n');
  let id = '';
  let at = '';
  let prompt = '';
  let copy = '';

  await s.test('a load from the store gives the step its custom instructions; without the store, none', () => {
    const write = loadWorkflows(dir, { home: ROOT, repo: HERE }).find((w) => w.name === 'write')!;
    assert.equal(write.agent?.customInstructions, 'Before: French.');
    const away = loadWorkflows(dir, { repo: HERE }).find((w) => w.name === 'write')!;
    assert.equal(away.agent?.customInstructions, undefined);
  });

  await s.test(
    "`nemia start` names each node's agent beside it — by the agent's name — and a node with no agent by its name alone",
    async (sub) => {
      const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
      stage.place().world.repository(repo, { 'README.md': 'x\n' });
      const named = storeTeam('named', {
        build: '---\nplace: git\nagent: plain\n---\n',
        judge: '---\nafter: build\nplace: git\nagent: coder\n---\n',
        wrap: '---\nafter: judge\nplace: git\n---\nWrap it up.\n',
      });
      const printed: string[] = [];
      sub.mock.method(console, 'log', (...args: unknown[]) => void printed.push(args.map(String).join(' ')));
      await stage.main(['start', 'build it', '--workflows', named, '--repo', repo]);
      assert.equal(printed[0].split('  ')[1], '3 step(s): build (plain) → judge (coder) → wrap', printed.join('\n'));
      id = (await stage.runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }))).id;
    },
  );

  await s.test("the start froze the step with its agent's words, the person's, its own note and the servers of both, each once", () => {
    const write = frozen(id, 'write');
    assert.equal(
      write.body,
      headedLayers([
        ['instructions', 'You write notes.'],
        ['custom', 'Before: French.'],
        ['policy', 'Write about tides.'],
      ]),
    );
    assert.deepEqual(
      [write.agent?.name, write.agent?.instructions, write.agent?.customInstructions, write.agent?.body],
      ['scribe', 'You write notes.', 'Before: French.', 'Write about tides.'],
    );
    assert.deepEqual(
      [write.agent?.mcp, write.mcp],
      [
        ['docs', 'notes'],
        ['notes', 'docs'],
      ],
      "the agent's servers, then the step's, each once",
    );
  });

  await s.test(
    "Claude Code's prompt is rendered under runs/<id>/agents/<step>/: instructions, custom instructions, skills by name, a preload whole",
    () => {
      at = agentFilesDir(readRun(id), 'write');
      prompt = fs.readFileSync(path.join(at, 'prompt.md'), 'utf8');
      assert.equal(
        prompt,
        `${HEAD.instructions}\n\nYou write notes.\n\n${HEAD.custom}\n\nBefore: French.\n\nYour skills, each loaded with the Skill tool by its name when you need it: \`nemia-scribe:write-a-note\`.\n\n## Skill \`nemia-scribe:mind-the-tone\`\n\nHow to mind the tone.\n`,
      );
    },
  );

  await s.test('its plugin holds a copy of each skill whole, its manifest and its style; the codex step is not rendered', () => {
    copy = fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8');
    assert.equal(copy, SKILL('write-a-note'), "the store's skill, copied");
    assert.equal(
      fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'template.md'), 'utf8'),
      '# Title\n',
      'with what is beside it',
    );
    assert.ok(fs.existsSync(path.join(at, 'nemia-scribe', 'skills', 'mind-the-tone', 'SKILL.md')), "the repository's skill, copied");
    assert.equal(JSON.parse(fs.readFileSync(path.join(at, 'nemia-scribe', '.claude-plugin', 'plugin.json'), 'utf8')).name, 'nemia-scribe');
    assert.equal(fs.readFileSync(path.join(at, 'nemia-scribe', 'output-styles', 'no-coding.md'), 'utf8'), noCodingStyle('scribe'));
    assert.equal(fs.existsSync(agentFilesDir(readRun(id), 'code')), false);
  });

  await s.test(
    'the tick files the step with its flags, its skills as a closed list, its servers, and a brief that is its own note',
    async () => {
      const { filed, spec } = await tick(id);
      assert.deepEqual(filed, ['write']);
      const write = spec('write');
      assert.deepEqual(write.config?.claude, {
        appendSystemPromptFile: path.join(at, 'prompt.md'),
        pluginDir: [path.join(at, 'nemia-scribe')],
        settings: JSON.stringify({ outputStyle: 'nemia-scribe:no-coding' }),
      });
      assert.deepEqual(
        write.config?.enabledSkills,
        ['nemia-scribe:write-a-note', 'nemia-scribe:mind-the-tone'],
        "its plugin's copies, and no other",
      );
      assert.deepEqual(write.config?.projectMcp, ['docs', 'notes']);
      assert.ok(write.brief.startsWith(`${PRECEDENCE}\n\nWrite about tides.\n`), 'the precedence, then its own note');
      assert.doesNotMatch(write.brief, /You write notes|Before: French/, "the layers above it are in Claude Code's prompt");
    },
  );

  await s.test('an edit after the start — the agent, its skill, the custom instructions — reaches no step of the run started', () => {
    fs.writeFileSync(path.join(STORE, 'agents', 'scribe.md'), SCRIBE.replace('You write notes.', 'Something else.'));
    fs.appendFileSync(path.join(STORE, 'skills', 'write-a-note', 'SKILL.md'), 'Edited later.\n');
    customFor('scribe', 'After: German.\n');
    const write = frozen(id, 'write');
    assert.deepEqual([write.agent?.instructions, write.agent?.customInstructions], ['You write notes.', 'Before: French.']);
    assert.ok(!write.body.includes('German') && !write.body.includes('Something else'), write.body);
    assert.equal(fs.readFileSync(path.join(at, 'prompt.md'), 'utf8'), prompt);
    assert.equal(
      fs.readFileSync(path.join(at, 'nemia-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'),
      copy,
      "the folder is the run's",
    );
    fs.rmSync(CUSTOM, { recursive: true });
    assert.equal(frozen(id, 'write').agent?.customInstructions, 'Before: French.', 'and a removal neither');
  });

  await s.test('once the step is done, the codex step is filed with its instructions in its brief and no Claude Code flags', async () => {
    stage.board().settle(`${id}-write`, 'succeeded', { outcome: 'done', summary: 'wrote it', artifacts: [], needs: null });
    const { filed, spec } = await tick(id);
    assert.deepEqual(filed, ['code']);
    const code = spec('code');
    assert.equal(code.config?.claude, undefined);
    assert.ok(code.brief.startsWith(`${PRECEDENCE}\n\n${HEAD.instructions}\n\nYou write code.\n\n${HEAD.policy}\n\nCode it.`), code.brief);
  });

  await s.test('a run started after the edits is told them', async () => {
    customFor('scribe', 'After: German.\n');
    const later = await stage.runPlaced(startRun({ brief: 'the later words', repo: HERE, workflowDir: dir }));
    const write = frozen(later.id, 'write');
    assert.deepEqual([write.agent?.instructions, write.agent?.customInstructions], ['Something else.', 'After: German.']);
    assert.ok(fs.readFileSync(path.join(agentFilesDir(later, 'write'), 'prompt.md'), 'utf8').includes('After: German.'));
    assert.match(
      fs.readFileSync(path.join(agentFilesDir(later, 'write'), 'nemia-scribe', 'skills', 'write-a-note', 'SKILL.md'), 'utf8'),
      /Edited later/,
    );
    fs.rmSync(CUSTOM, { recursive: true });
    fs.writeFileSync(path.join(STORE, 'agents', 'scribe.md'), SCRIBE);
    fs.writeFileSync(path.join(STORE, 'skills', 'write-a-note', 'SKILL.md'), SKILL('write-a-note'));
  });
});

test('a step whose rendered folder is gone is told its layers and its skills whole in its brief, as its start found them', async (t) => {
  const s = story(t);
  fs.rmSync(CUSTOM, { recursive: true, force: true });
  fs.writeFileSync(path.join(STORE, 'agents', 'scribe.md'), SCRIBE);

  await s.test(
    'filed as before 2026-09-25: the instructions in its brief, no flag naming a file not there, each skill told whole',
    async () => {
      const dir = storeTeam('lost', { write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n` });
      const run = await stage.runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }));
      fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
      const write = (await tick(run.id)).spec('write');
      assert.equal(write.config?.claude, undefined);
      assert.ok(
        write.brief.startsWith(`${PRECEDENCE}\n\n${HEAD.instructions}\n\nYou write notes.\n\n${HEAD.policy}\n\nWrite about tides.`),
        write.brief,
      );
      assert.match(
        write.brief,
        /Write about tides\.\n\nNo skill is loaded with the Skill tool for this step[^\n]*\n\n## Skill `write-a-note`\n\nHow to write a note\./,
      );
      assert.ok(
        write.brief.includes(`/workflows/skills, ${PLACE_SKILLS}. Sign off blocked if you need it.\n\n## What was asked for`),
        write.brief,
      );
      assert.match(
        write.brief,
        /\n## Skill `mind-the-tone`\n\nNot told: no folder holds it in [^\n]*\/workflows\/skills, [^\n]*\. Sign off blocked if you need it\.\n\n## What was asked for/,
        'a folder run keeps no repository: the skill its start found where it was typed is said not to be told',
      );
    },
  );

  await s.test(
    'a plugin under another name, as a start before the rename wrote it, is a folder gone; one with no plugin is filed with its prompt',
    async () => {
      const dir = storeTeam('renamed', {
        write: `---\nagent: scribe\n${FOLDER}---\nWrite about tides.\n`,
        plain: `---\nagent: plain\n${FOLDER}---\nWrite plainly.\n`,
      });
      const run = await stage.runPlaced(startRun({ brief: 'a note on tides', repo: HERE, workflowDir: dir }));
      const at = agentFilesDir(run, 'write');
      fs.renameSync(path.join(at, pluginOf('scribe')), path.join(at, 'before-scribe'));
      const { spec } = await tick(run.id);
      const write = spec('write');
      assert.equal(write.config?.claude, undefined, 'no flag naming a plugin that is not there');
      assert.ok(
        write.brief.startsWith(`${PRECEDENCE}\n\n${HEAD.instructions}\n\nYou write notes.\n\n${HEAD.policy}\n\nWrite about tides.`),
        write.brief,
      );
      assert.match(write.brief, /\n## Skill `write-a-note`\n\nHow to write a note\./);
      assert.deepEqual(write.config?.enabledSkills, [], 'given no skill to load: none is there');
      const plain = spec('plain');
      assert.deepEqual(plain.config?.claude, { appendSystemPromptFile: path.join(agentFilesDir(run, 'plain'), 'prompt.md') });
      assert.equal(fs.readdirSync(agentFilesDir(run, 'plain')).join(), 'prompt.md', 'its folder holds no plugin');
      assert.deepEqual(plain.config?.enabledSkills, [], 'a step that names no skill is given none');
    },
  );

  await s.test("a repository run's step is told a skill of the run's repository too, as its start found it", async () => {
    const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    const tone = SKILL('mind-the-tone', 'preload: true\n').replace('How to', 'In this repository, how to');
    fs.mkdirSync(path.join(repo, '.claude', 'skills', 'mind-the-tone'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.claude', 'skills', 'mind-the-tone', 'SKILL.md'), tone);
    stage.place().world.repository(repo, { '.claude/skills/mind-the-tone/SKILL.md': tone });
    const dir = storeTeam('lost-git', { write: '---\nplace: git\nagent: scribe\n---\nWrite about tides.\n' });
    const run = await stage.runPlaced(startRun({ brief: 'a note on tides', repo, workflowDir: dir, isolate: false }));
    fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
    const write = (await tick(run.id)).spec('write');
    assert.equal(write.config?.claude, undefined);
    assert.match(write.brief, /\n## Skill `mind-the-tone`\n\nIn this repository, how to mind the tone\.\n/);
  });

  await s.test('a skill named with its folder is told under the name its line writes, or why the folder no longer holds it', async () => {
    const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    const tone = SKILL('mind-the-tone');
    const nested = SKILL('y').replace(/\n---\n[\s\S]*$/, '\n---\nOf the folder app.\n');
    for (const [file, text] of [
      ['.claude/skills/mind-the-tone/SKILL.md', tone],
      ['app/.claude/skills/y/SKILL.md', nested],
    ]) {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      fs.writeFileSync(path.join(repo, file), text);
    }
    stage.place().world.repository(repo, { '.claude/skills/mind-the-tone/SKILL.md': tone, 'app/.claude/skills/y/SKILL.md': nested });
    const dir = storeTeam('lost-nested', { write: '---\nplace: git\nagent: scribe\nskills: app:y\n---\nWrite about tides.\n' });
    const told = async (gone?: () => void): Promise<string> => {
      const run = await stage.runPlaced(startRun({ brief: 'a note on tides', repo, workflowDir: dir, isolate: false }));
      fs.rmSync(agentFilesDir(run, 'write'), { recursive: true });
      gone?.();
      return (await tick(run.id)).spec('write').brief;
    };
    const brief = await told();
    assert.match(brief, /\n## Skill `app:y`\n\nOf the folder app\.(\n|$)/);
    assert.doesNotMatch(brief, /## Skill `y`/);
    const at = path.join(repo, 'app', '.claude', 'skills', 'y');
    names(
      await told(() => fs.rmSync(path.join(repo, 'app'), { recursive: true })),
      "## Skill `app:y`\n\nNot told: `app:y` is the skill `y` of the repository's folder `app`",
      `${at} holds no SKILL.md`,
    );
  });
});

test('REFUSED at shipped defaults: a start that cannot tell a step its agent stops, names what to fix, and writes no run', async (t) => {
  const runs = path.join(ROOT, 'runs');
  const runsIn = (): string[] => (fs.existsSync(runs) ? fs.readdirSync(runs).sort() : []);
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  const file = path.join(CUSTOM, 'implementer.md');
  const custom: Array<[string, () => void, string]> = [
    [
      'custom instructions with a frontmatter block',
      () => customFor('implementer', '---\ntools: Bash\n---\nUse Bash.\n'),
      'opens with a frontmatter block',
    ],
    ['custom instructions that are a link', () => (fs.mkdirSync(CUSTOM, { recursive: true }), fs.symlinkSync(outside, file)), 'is a link'],
    ['custom instructions that are a directory', () => fs.mkdirSync(file, { recursive: true }), 'is not a file'],
  ];
  for (const [row, plant, fact] of custom)
    await t.test(`${row}, for the step naming the agent; a start naming another starts`, async () => {
      const team = teamCopy('wf-agent-session-team-');
      const solo = path.join(team, 'solo');
      fs.mkdirSync(solo);
      fs.writeFileSync(path.join(solo, 'write.md'), '---\nplace: git\nagent: reviewer\n---\nWrite it.\n');
      const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
      stage.place().world.repository(repo, {});
      plant();
      const before = runsIn();
      try {
        await assert.rejects(
          stage.runPlaced(startRun({ brief: row, repo, workflowDir: path.join(team, 'dev') })),
          (err: Error & { exitCode?: number; _tag?: string }) => {
            assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
            names(err.message, fact, file);
            return true;
          },
        );
        assert.deepEqual(runsIn(), before, 'nothing started');
        const other = await stage.runPlaced(startRun({ brief: `${row}, another agent`, repo, workflowDir: solo }));
        assert.equal(frozen(other.id, 'write').agent?.name, 'reviewer');
      } finally {
        fs.rmSync(CUSTOM, { recursive: true, force: true });
      }
    });
  await t.test('a team whose agent gives a skill no place has', async () => {
    const dir = storeTeam('unskilled', { write: `---\nagent: scribe\n${FOLDER}---\nWrite.\n` });
    const before = runsIn();
    const elsewhere = fs.mkdtempSync(path.join(ROOT, 'elsewhere-'));
    await assert.rejects(stage.runPlaced(startRun({ brief: 'x', repo: elsewhere, workflowDir: dir })), (err: Error) => {
      assert.ok(err instanceof WorkflowError, String(err));
      names(err.message, '`mind-the-tone`', 'no skills folder has it');
      return true;
    });
    assert.deepEqual(runsIn(), before);
  });
});
