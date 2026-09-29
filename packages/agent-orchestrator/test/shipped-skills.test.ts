/**
 * The shipped skills (`workflows/skills/`): each the procedure one entry of an agent's card describes, in a SKILL.md of its own rather
 * than in the agent's body. The agent's body keeps its role and its limits and names its skills; the card says what the agent can do, and
 * the skills are how.
 *
 * A SKILL.md whose frontmatter is not YAML is dropped by Claude Code with nothing said — the session is simply not given it — so each is
 * parsed here as YAML, and a description whose quoting breaks it fails the suite rather than a run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { skillEntryOf, splitFrontmatter, type Agent } from '../src/workflow.ts';
import { cardSkills, loadAgents, loadWorkflows, preloads, skillsFor } from '../src/folder/folder.store.ts';
import { briefBody, pluginOf, unrendered } from '../src/rendering.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-shipped-skills-');
process.env.WF_ROOT = ROOT;
const { agentFilesDir, skillsAgain, writeAgentFiles } = await import('../src/agents/agents.store.ts');

const REPO = path.join(import.meta.dirname, '..', '..', '..');
/** The two places skills are shipped: the repository's workflows, and the package's own copy of ui's three agents' (ui-workflow.test.ts). */
const PLACES = [path.join(REPO, 'workflows'), path.join(import.meta.dirname, '..', 'workflows')];
/** The skills told whole, after the agent's instructions (`preload: true`): the planner's answer rule and both of the shipper's. */
const PRELOADED = ['ask-when-it-reads-two-ways', 'say-why-it-aborted', 'trial-merge-a-branch'];

/** A SKILL.md's frontmatter as YAML reads it, or a throw saying why it does not read: what a skill that Claude Code would drop fails on. */
function frontmatterOf(file: string, text: string): Record<string, unknown> {
  const { block } = splitFrontmatter(file, text);
  if (block === null) throw new Error(`${file} has no frontmatter`);
  const read = yaml.load(block);
  if (read === null || typeof read !== 'object' || Array.isArray(read)) throw new Error(`${file}: its frontmatter is not a map of keys`);
  return read as Record<string, unknown>;
}

const agentsIn = (place: string): Agent[] =>
  [...loadAgents(path.join(place, 'agents')).values()].map((a) => {
    if (a instanceof Error) throw a;
    return a;
  });

test("a card entry reads a SKILL.md's frontmatter as YAML does, on every SKILL.md the repository has, shipped or vendored", () => {
  const files = [
    ...PLACES.flatMap((place) => fs.readdirSync(path.join(place, 'skills')).map((name) => path.join(place, 'skills', name, 'SKILL.md'))),
    ...fs.readdirSync(path.join(REPO, '.claude', 'skills')).map((name) => path.join(REPO, '.claude', 'skills', name, 'SKILL.md')),
  ].filter((file) => fs.existsSync(file));
  assert.ok(files.length >= 22, files.join('\n'));
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
  }
});

/**
 * How an agent's body says it reaches each skill: a skill told whole is `given you whole`, one to load is loaded `with the Skill tool` —
 * which the agent's tools must allow. A body that said to load a preloaded skill would send the session looking for what it already has,
 * and one that named a skill to load without the tool, for what it cannot reach.
 */
function reachProblems(agent: Pick<Agent, 'name' | 'body' | 'keys' | 'skills'>, preloaded: (skill: string) => boolean): string[] {
  const body = agent.body.replace(/\s+/g, ' ');
  const sentences = body.split(/(?<=[.:;])\s/);
  const tools = agent.keys.tools?.split(',').map((t) => t.trim());
  const problems: string[] = [];
  for (const skill of agent.skills ?? []) {
    const about = sentences.filter((s) => s.includes(`\`${skill}\``));
    if (!about.length) {
      problems.push(`${agent.name}: its body never names ${skill}`);
      continue;
    }
    if (preloaded(skill) && !about.some((s) => s.includes('given you whole')))
      problems.push(`${agent.name}: ${skill} is told whole, and the body does not say so`);
    if (!preloaded(skill)) {
      if (
        !about.some((s) => s.includes('with the Skill tool')) &&
        !about.some((s) => sentences[sentences.indexOf(s) - 1]?.includes('with the Skill tool'))
      ) {
        problems.push(`${agent.name}: ${skill} is loaded, and the body does not say with the Skill tool`);
      }
      if (tools && !tools.includes('Skill'))
        problems.push(`${agent.name}: ${skill} is loaded with the Skill tool, which its tools do not allow`);
    }
  }
  return problems;
}

test("a shipped agent renders as `wf start` renders it: skills to load named in its prompt, a preloaded one appended whole, each in the step's plugin", () => {
  const skillText = (place: string, skill: string) => {
    const file = path.join(place, 'skills', skill, 'SKILL.md');
    return splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body;
  };
  const cases: Array<[folder: string, step: string]> = [
    ['dev-planned', 'plan'],
    ['dev-planned', 'review'],
    ['dev', 'ship'],
    ['note', 'review'],
  ];
  for (const [i, [folder, name]] of cases.entries()) {
    const dir = path.join(REPO, 'workflows', folder);
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
        fs.readFileSync(path.join(REPO, 'workflows', 'skills', skill, 'SKILL.md'), 'utf8'),
        `${folder}/${name}: ${skill} in the plugin`,
      );
      const whole = `## Skill \`${plugin}:${skill}\`\n\n${skillText(path.join(REPO, 'workflows'), skill)}`;
      assert.equal(
        prompt.includes(whole),
        PRELOADED.includes(skill),
        `${folder}/${name}: ${skill} ${PRELOADED.includes(skill) ? 'is' : 'is not'} told whole\n\n${prompt}`,
      );
    }
  }
});

test("a shipped step whose rendered folder is gone is told every skill whole in its brief — the shipper's merge without committing included", () => {
  const dir = path.join(REPO, 'workflows', 'dev');
  for (const step of loadWorkflows(dir).filter((s) => s.agent?.skills?.length)) {
    const brief = briefBody(unrendered(step, skillsAgain(step, skillsFor(dir))));
    assert.ok(brief.startsWith(step.agent!.instructions!.trimEnd()), `${step.name}: the instructions first`);
    for (const skill of step.agent!.skills!) {
      const file = path.join(REPO, 'workflows', 'skills', skill, 'SKILL.md');
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
