/**
 * The shipped skills (`workflows/skills/`, agents card 1b of docs/design-2026-09-25-agents-and-skills.md): each the procedure one entry of
 * an agent's card describes, moved out of the agent's body into a SKILL.md of its own. The agent's body keeps its role and its limits and
 * names its skills; the card says what the agent can do, and the skills are how.
 *
 * A SKILL.md whose frontmatter is not YAML is dropped by Claude Code with nothing said — the session is simply not given it — so each is
 * parsed here as YAML, and a description whose quoting breaks it fails the suite rather than a run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { skillEntryOf, splitFrontmatter, type Agent, type Workflow } from '../src/workflow.ts';
import { cardSkills, loadAgents, loadWorkflows, preloads, skillsFor } from '../src/workflow-store.ts';
import { briefBody, pluginOf, unrendered } from '../src/rendering.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-shipped-skills-');
process.env.WF_ROOT = ROOT;
const { agentFilesDir, skillsAgain, writeAgentFiles } = await import('../src/store.ts');

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

const agentsIn = (place: string): Agent[] => [...loadAgents(path.join(place, 'agents')).values()].map((a) => {
  if (a instanceof Error) throw a;
  return a;
});

test('every shipped SKILL.md reads as YAML, its name its folder and its description one line of text — REFUSED: a description whose quoting breaks it', () => {
  let read = 0;
  for (const place of PLACES) {
    const skills = path.join(place, 'skills');
    for (const name of fs.readdirSync(skills)) {
      const file = path.join(skills, name, 'SKILL.md');
      const keys = frontmatterOf(file, fs.readFileSync(file, 'utf8'));
      assert.equal(keys.name, name, `${file}: named as its folder`);
      assert.equal(typeof keys.description, 'string', `${file}: a description`);
      assert.match(keys.description as string, /^\S[^\n]*\S$/, `${file}: one line`);
      // The run reads `preload` with its own line reader (`preloads`), and reads it as YAML does.
      assert.equal(preloads(path.join(skills, name)), keys.preload === true, `${file}: preload`);
      read++;
    }
  }
  assert.equal(read, 20, "the repository's fourteen and the package's six");

  // The quoting that breaks a description, each on a shipped file: a colon and a space in plain text, a quote inside quotes, a quote
  // never closed, a backquote first. Each is YAML no parser reads, and Claude Code drops the skill.
  const file = path.join(REPO, 'workflows', 'skills', 'review-a-change', 'SKILL.md');
  const text = fs.readFileSync(file, 'utf8');
  const line = /^description: .*$/m;
  assert.match(text, line);
  for (const broken of [
    'description: Reads the diff: bugs, missing tests',
    'description: "Reads the "diff" as a second engineer would"',
    'description: "Reads the diff',
    'description: `git diff`, read as a second engineer would',
  ]) assert.throws(() => frontmatterOf(file, text.replace(line, broken)), (e: Error) => e instanceof yaml.YAMLException, broken);
  assert.deepEqual(Object.keys(frontmatterOf(file, text.replace(line, 'description: Reads the diff, as a second engineer would'))).includes('description'), true, 'plain words read');
});

test("each shipped agent's card is generated from its skills' frontmatter as YAML reads it — and every shipped skill is some agent's", () => {
  for (const place of PLACES) {
    const given = new Set<string>();
    const found = skillsFor(path.join(place, '_'));
    for (const agent of agentsIn(place)) {
      const card = cardSkills(agent, found);
      assert.deepEqual(card.map((s) => s.id), agent.skills, `${agent.name}: its card lists what its skills are, in order`);
      for (const entry of card) {
        const file = path.join(place, 'skills', entry.id, 'SKILL.md');
        const { title, description, tags, examples } = frontmatterOf(file, fs.readFileSync(file, 'utf8'));
        assert.deepEqual(entry, { id: entry.id, name: title, description, tags, examples }, file);
        given.add(entry.id);
      }
    }
    assert.deepEqual(fs.readdirSync(path.join(place, 'skills')).sort(), [...given].sort(), `${place}: no skill nobody gives`);
  }
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
    if (!about.length) { problems.push(`${agent.name}: its body never names ${skill}`); continue; }
    if (preloaded(skill) && !about.some((s) => s.includes('given you whole'))) problems.push(`${agent.name}: ${skill} is told whole, and the body does not say so`);
    if (!preloaded(skill)) {
      if (!about.some((s) => s.includes('with the Skill tool')) && !about.some((s) => sentences[sentences.indexOf(s) - 1]?.includes('with the Skill tool'))) {
        problems.push(`${agent.name}: ${skill} is loaded, and the body does not say with the Skill tool`);
      }
      if (tools && !tools.includes('Skill')) problems.push(`${agent.name}: ${skill} is loaded with the Skill tool, which its tools do not allow`);
    }
  }
  return problems;
}

test("each shipped agent's body names each of its skills and how it reaches it: told whole, or loaded with the Skill tool it has — REFUSED: either said wrong", () => {
  const preloadedIn = (place: string) => (skill: string) => preloads(path.join(place, 'skills', skill));
  for (const place of PLACES) {
    for (const agent of agentsIn(place)) assert.deepEqual(reachProblems(agent, preloadedIn(place)), [], agent.name);
    assert.deepEqual(fs.readdirSync(path.join(place, 'skills')).filter(preloadedIn(place)).sort(), PRELOADED.filter((s) => fs.existsSync(path.join(place, 'skills', s))), place);
  }

  const agents = new Map(agentsIn(PLACES[0]!).map((a) => [a.name, a]));
  const shipped = preloadedIn(PLACES[0]!);
  const reviewer = agents.get('reviewer')!;
  const planner = agents.get('planner')!;
  assert.deepEqual(reachProblems({ ...reviewer, body: reviewer.body.replaceAll('`send-work-round-again`', 'the other skill') }, shipped), ['reviewer: its body never names send-work-round-again']);
  assert.deepEqual(reachProblems({ ...reviewer, keys: { ...reviewer.keys, tools: 'Read, Grep, Glob, Bash' } }, shipped), [
    'reviewer: review-a-change is loaded with the Skill tool, which its tools do not allow',
    'reviewer: send-work-round-again is loaded with the Skill tool, which its tools do not allow',
  ]);
  assert.deepEqual(reachProblems({ ...reviewer, body: reviewer.body.replaceAll('with the Skill tool', 'as you see fit') }, shipped), [
    'reviewer: review-a-change is loaded, and the body does not say with the Skill tool',
    'reviewer: send-work-round-again is loaded, and the body does not say with the Skill tool',
  ]);
  assert.deepEqual(reachProblems({ ...planner, body: planner.body.replace('given you whole', 'which you load') }, shipped), [
    'planner: ask-when-it-reads-two-ways is told whole, and the body does not say so',
  ]);
});

test("a shipped agent renders as `wf start` renders it: skills to load named in its prompt, a preloaded one appended whole, each in the step's plugin", () => {
  const skillText = (place: string, skill: string) => {
    const file = path.join(place, 'skills', skill, 'SKILL.md');
    return splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body;
  };
  const cases: Array<[folder: string, step: string]> = [['dev-planned', 'plan'], ['dev-planned', 'review'], ['dev', 'ship'], ['note', 'review']];
  for (const [i, [folder, name]] of cases.entries()) {
    const dir = path.join(REPO, 'workflows', folder);
    const steps = loadWorkflows(dir);
    const step = steps.find((s) => s.name === name)! as Workflow;
    const run = { id: `r-${i}` };
    writeAgentFiles(run, [step], skillsFor(dir));
    const at = agentFilesDir(run, name);
    const prompt = fs.readFileSync(path.join(at, 'prompt.md'), 'utf8');
    const agent = step.agent!;
    const plugin = pluginOf(agent.name);
    assert.ok(prompt.startsWith(agent.instructions!.trimEnd()), `${folder}/${name}: the agent's instructions first`);
    const loaded = agent.skills!.filter((s) => !PRELOADED.includes(s));
    if (loaded.length) assert.ok(prompt.includes(`Your skills, each loaded with the Skill tool by its name when you need it: ${loaded.map((s) => `\`${plugin}:${s}\``).join(', ')}.`), `${folder}/${name}\n\n${prompt}`);
    for (const skill of agent.skills!) {
      assert.equal(fs.readFileSync(path.join(at, plugin, 'skills', skill, 'SKILL.md'), 'utf8'), fs.readFileSync(path.join(REPO, 'workflows', 'skills', skill, 'SKILL.md'), 'utf8'), `${folder}/${name}: ${skill} in the plugin`);
      const whole = `## Skill \`${plugin}:${skill}\`\n\n${skillText(path.join(REPO, 'workflows'), skill)}`;
      assert.equal(prompt.includes(whole), PRELOADED.includes(skill), `${folder}/${name}: ${skill} ${PRELOADED.includes(skill) ? 'is' : 'is not'} told whole\n\n${prompt}`);
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
      assert.ok(brief.includes(`## Skill \`${skill}\`\n\n${splitFrontmatter(file, fs.readFileSync(file, 'utf8')).body}`), `${step.name}: ${skill} told whole\n\n${brief}`);
    }
  }
  const ship = loadWorkflows(dir).find((s) => s.name === 'ship')!;
  assert.match(briefBody(unrendered(ship, skillsAgain(ship, skillsFor(dir)))), /--no-commit/);
  assert.doesNotMatch(briefBody(unrendered(ship)), /--no-commit/, 'the fallback before: the promise of skills, and none of them');
});
