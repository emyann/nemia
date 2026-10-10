/**
 * A step's skills as a session is given them: rendered into the step's plugin by `nemia start`, a preloaded one told whole in the prompt,
 * and every skill told whole in the brief when the rendered folder is gone. Held over the tests' team (`team.ts`).
 *
 * A SKILL.md whose frontmatter is not YAML is dropped by Claude Code with nothing said — the session is simply not given it — so every
 * SKILL.md there is, the team's, whatever is shipped, Nemia's and the repository's own, is parsed here as YAML, as a card entry reads it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { skillEntryOf, splitFrontmatter } from '../src/workflow.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { skillsFor } from '../src/skills/read.store.ts';
import { appliesOf } from '../src/skills/skills.ts';
import { briefBody, pluginOf, unrendered } from '../src/agents/agents.ts';
import { scratch } from './scratch.ts';
import { placesOf, SHIPPED_HOLDERS, TEAM, TEAM_DEV } from './team.ts';

const ROOT = scratch('wf-skills-rendered-');
process.env.WF_ROOT = ROOT;
const { agentFilesDir, skillsAgain, writeAgentFiles } = await import('../src/agents/agents.store.ts');

const REPO = path.join(import.meta.dirname, '..', '..', '..');
/** Nemia's own skills, her plugin's. */
const NEMIA_SKILLS = path.join(import.meta.dirname, '..', 'nemia', 'skills');
/** Every folder of skills there is: the team's, whatever is shipped, Nemia's own, and the repository's own for Claude Code. */
const SKILL_FOLDERS = [
  path.join(TEAM, 'skills'),
  ...SHIPPED_HOLDERS.map((holder) => path.join(holder, 'skills')),
  NEMIA_SKILLS,
  path.join(REPO, '.claude', 'skills'),
];
/** The team's skill told whole, after the agent's instructions (`preload: true`): the shipper's merge. */
const PRELOADED = ['trial-merge-a-branch'];

/** A SKILL.md's frontmatter as YAML reads it, or a throw saying why it does not read: what a skill that Claude Code would drop fails on. */
function frontmatterOf(file: string, text: string): Record<string, unknown> {
  const { block } = splitFrontmatter(file, text);
  if (block === null) throw new Error(`${file} has no frontmatter`);
  const read = yaml.load(block);
  if (read === null || typeof read !== 'object' || Array.isArray(read)) throw new Error(`${file}: its frontmatter is not a map of keys`);
  return read as Record<string, unknown>;
}

test("a card entry and a skill's paths read a SKILL.md's frontmatter as YAML does, on every SKILL.md there is: the team's, shipped, or the repository's own", () => {
  const files = SKILL_FOLDERS.flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name, 'SKILL.md')) : [],
  ).filter((file) => fs.existsSync(file));
  for (const dir of [path.join(TEAM, 'skills'), NEMIA_SKILLS, path.join(REPO, '.claude', 'skills')])
    assert.ok(
      files.some((file) => file.startsWith(dir)),
      `${dir} is read: ${files.join('\n')}`,
    );
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const id = path.basename(path.dirname(file));
    const keys = frontmatterOf(file, text);
    const words = (v: unknown) => (typeof v === 'string' ? v.trim() || undefined : undefined);
    const expected = {
      id,
      name: words(keys.title) ?? words(keys.name) ?? id,
      description: (keys.description as string).trim(),
      tags: (keys.tags as string[] | undefined) ?? [id],
      ...(keys.examples ? { examples: keys.examples } : {}),
    };
    assert.deepEqual(skillEntryOf(file, id, text), expected, file);
    assert.deepEqual(appliesOf(text), keys.applies === undefined ? [] : [keys.applies].flat(), `${file}: its applies:`);
  }
});

test("an agent renders as `nemia start` renders it: skills to load named in its prompt, a preloaded one appended whole, each in the step's plugin", () => {
  const skillText = (place: string, skill: string) => {
    const file = path.join(place, 'skills', skill, 'SKILL.md');
    return splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body;
  };
  const folder = 'dev';
  const dir = TEAM_DEV;
  for (const [i, name] of ['implement', 'review', 'ship'].entries()) {
    const steps = loadWorkflows(dir);
    const step = steps.find((s) => s.name === name)!;
    const run = { id: `r-${i}` };
    writeAgentFiles(run, [step], skillsFor(dir));
    const at = agentFilesDir(run, name);
    const prompt = fs.readFileSync(path.join(at, 'prompt.md'), 'utf8');
    const agent = step.agent!;
    const plugin = pluginOf(agent.name);
    assert.ok(prompt.startsWith(agent.instructions!.trimEnd()), `${folder}/${name}: the agent's instructions first`);
    const loaded = agent.skills!.filter((s) => !PRELOADED.includes(s));
    if (loaded.length)
      assert.ok(
        prompt.includes(
          `Your skills, each loaded with the Skill tool by its name when you need it: ${loaded.map((s) => `\`${plugin}:${s}\``).join(', ')}.`,
        ),
        `${folder}/${name}\n\n${prompt}`,
      );
    for (const skill of agent.skills!) {
      assert.equal(
        fs.readFileSync(path.join(at, plugin, 'skills', skill, 'SKILL.md'), 'utf8'),
        fs.readFileSync(path.join(TEAM, 'skills', skill, 'SKILL.md'), 'utf8'),
        `${folder}/${name}: ${skill} in the plugin`,
      );
      const whole = `## Skill \`${plugin}:${skill}\`\n\n${skillText(TEAM, skill)}`;
      assert.equal(
        prompt.includes(whole),
        PRELOADED.includes(skill),
        `${folder}/${name}: ${skill} ${PRELOADED.includes(skill) ? 'is' : 'is not'} told whole\n\n${prompt}`,
      );
    }
  }
});

test("a step whose rendered folder is gone is told every skill whole in its brief — the shipper's merge without committing included", () => {
  const dir = TEAM_DEV;
  for (const step of loadWorkflows(dir).filter((s) => s.agent?.skills?.length)) {
    const brief = briefBody(unrendered(step, skillsAgain(step, skillsFor(dir))));
    assert.ok(brief.startsWith(step.agent!.instructions!.trimEnd()), `${step.name}: the instructions first`);
    for (const skill of step.agent!.skills!) {
      const file = path.join(TEAM, 'skills', skill, 'SKILL.md');
      assert.ok(
        brief.includes(`## Skill \`${skill}\`\n\n${splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body}`),
        `${step.name}: ${skill} told whole\n\n${brief}`,
      );
    }
  }
  const ship = loadWorkflows(dir).find((s) => s.name === 'ship')!;
  assert.match(briefBody(unrendered(ship, skillsAgain(ship, skillsFor(dir)))), /--no-commit/);
  assert.doesNotMatch(briefBody(unrendered(ship)), /--no-commit/, 'the fallback before: the promise of skills, and none of them');
});

/** The order to load shadcn's skill, as a SKILL.md gives it, across line breaks. */
const LOADS_SHADCN = /load\s+`shadcn`\s+with\s+the\s+Skill\s+tool/i;
/** The files a step that only reads is sent to, from the repository's root: the vendored skill's text, and the board's facts. */
const READ_INSTEAD = ['.claude/skills/shadcn/SKILL.md', 'apps/web/components.json', 'apps/web/src/components/ui'];

/**
 * What breaks in the board's skill `text`, judged against the repository at `root`: an order to load `shadcn` that is missing, or given
 * before the shell is moved into `apps/web`; a file a reading step is sent to that the text does not name or the root does not hold; and
 * a `components.json` that is not in `apps/web` alone, which is why the folder matters. Empty when a session at the root is sent right.
 */
function boardSkillBreaks(text: string, root: string): string[] {
  const { body } = splitFrontmatter('SKILL.md', text);
  const load = LOADS_SHADCN.exec(body);
  const order = !load
    ? ['no order to load `shadcn` with the Skill tool']
    : body.slice(0, load.index).includes('`cd apps/web`')
      ? []
      : ['the load of `shadcn` is ordered before `cd apps/web`'];
  const names = READ_INSTEAD.flatMap((file) => [
    ...(body.includes(`\`${file}\``) ? [] : [`${file} is not named`]),
    ...(fs.existsSync(path.join(root, file)) ? [] : [`${file} is not there`]),
  ]);
  const folder = fs.existsSync(path.join(root, 'components.json')) ? ['components.json is at the root'] : [];
  return [...order, ...names, ...folder];
}

/** The board's skill as it was shipped when a load from the root refused: the load first, the folder after. */
const LOAD_FIRST = `---
name: change-the-board
description: "Any change under apps/web/."
applies: ["apps/web/**"]
---

# Change the board

1. **Load \`shadcn\` with the Skill tool now**, before you read or write a component: the board is shadcn's components on React Aria.
2. **Its CLI runs from \`apps/web\`**, where \`components.json\` is.
3. **Read \`apps/web/CLAUDE.md\`** before you change a page.
`;

test("the board's skill, as build's implement step is given it, moves the shell into apps/web before it orders the load of shadcn, and names files that are there", () => {
  const build = path.join(REPO, 'workflows', 'build');
  const places = placesOf(build);
  const step = loadWorkflows(build, places).find((s) => s.name === 'implement')!;
  const run = { id: 'r-board' };
  writeAgentFiles(run, [step], skillsFor(build, places));
  const given = fs.readFileSync(
    path.join(agentFilesDir(run, 'implement'), pluginOf(step.agent!.name), 'skills', 'change-the-board', 'SKILL.md'),
    'utf8',
  );
  assert.deepEqual(boardSkillBreaks(given, REPO), []);
  assert.equal(given, fs.readFileSync(path.join(REPO, '.claude', 'skills', 'change-the-board', 'SKILL.md'), 'utf8'));

  const unnamed = READ_INSTEAD.map((file) => `${file} is not named`);
  assert.deepEqual(boardSkillBreaks(LOAD_FIRST, REPO), ['the load of `shadcn` is ordered before `cd apps/web`', ...unnamed]);
  assert.deepEqual(boardSkillBreaks(given.replace(LOADS_SHADCN, 'have `shadcn` at hand'), REPO), [
    'no order to load `shadcn` with the Skill tool',
  ]);
  assert.deepEqual(
    boardSkillBreaks(given, scratch('wf-board-empty-')),
    READ_INSTEAD.map((file) => `${file} is not there`),
  );
  const rooted = scratch('wf-board-rooted-');
  fs.cpSync(path.join(REPO, 'apps', 'web', 'components.json'), path.join(rooted, 'components.json'));
  assert.ok(boardSkillBreaks(given, rooted).includes('components.json is at the root'));
});

test("build's implement step sends its agent to the board's skill before shadcn's", () => {
  const build = path.join(REPO, 'workflows', 'build');
  const { body } = splitFrontmatter('implement.md', fs.readFileSync(path.join(build, 'implement.md'), 'utf8'));
  assert.match(body, /load\s+`change-the-board`\s+before\s+`shadcn`/);
});
