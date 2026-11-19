/**
 * The agents model: an agent's name and a skill's refuse what their refusals refuse and take what the tests' team names, each agent of
 * that team decodes as `parseAgent` reads it, and each of its steps names its agent by id.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Option, Schema } from 'effect';
import { Agent, AgentName, agentsModel, Skill, SkillName, StepAgent } from './agents.model.ts';
import { erDiagram } from '../model/er.model.ts';
import { skillDraftOf } from '../skills/skills.ts';
import { parseAgent } from './agents.ts';
import { overridesOf } from '../workflow/index.ts';
import { readKeys } from '../former/former.ts';
import { splitFrontmatter } from '../step/step.ts';
import { TEAM, TEAM_DEV } from '../../test/team.ts';

/** The files of `dir` that end in `.md`, without it, the folder's README left out. */
const named = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((f) => f.slice(0, -'.md'.length));

describe("an agent's name is checked on create by agentNameRefusal's rule and read as any string", () => {
  test('refuses what agentNameRefusal refuses', () => {
    for (const name of ['', 'a/b', '..', '.x', ' x', 'x.md', 'README', 'x'.repeat(260), `a${String.fromCharCode(7)}`])
      assert.equal(Option.isNone(AgentName.create.option(name)), true, JSON.stringify(name));
  });
  test("takes each name of the tests' team", () => {
    for (const name of named(path.join(TEAM, 'agents'))) assert.equal(Schema.is(AgentName.OnCreate)(name), true, name);
  });
  test('reads a name written before the check', () => assert.equal(Schema.is(AgentName.OnRead)('old/name'), true));
});

describe("a skill's name is checked on create by skillNameRefusal's rule and read as any string", () => {
  test('refuses what skillNameRefusal refuses', () => {
    for (const name of ['../agents', 'Review', 'a_b', '.hidden', 'trailing-', '', 'x'.repeat(65)])
      assert.equal(Option.isNone(SkillName.create.option(name)), true, JSON.stringify(name));
  });
  test("takes each skill of the tests' team, and one of 64 characters", () => {
    for (const name of [...fs.readdirSync(path.join(TEAM, 'skills')), 'write-a-note', 'x'.repeat(64)])
      assert.equal(Schema.is(SkillName.OnCreate)(name), true, name);
  });
  test('reads a name written before the check', () => assert.equal(Schema.is(SkillName.OnRead)('Old_Skill'), true));
});

describe("each agent of the tests' team decodes as parseAgent reads it", () => {
  for (const name of named(path.join(TEAM, 'agents')))
    test(name, () => {
      const at = (file: string) => path.join(TEAM, 'agents', file);
      const agent = parseAgent(name, fs.readFileSync(at(`${name}.md`), 'utf8'), (file) => fs.readFileSync(at(file), 'utf8'));
      assert.equal(Schema.decodeUnknownResult(Agent)(agent)._tag, 'Success');
    });
});

describe("each step of the tests' team names its agent by id", () => {
  for (const step of named(TEAM_DEV))
    test(step, () => {
      const agent = /^agent:\s*(\S+)/m.exec(fs.readFileSync(path.join(TEAM_DEV, `${step}.md`), 'utf8'))?.[1];
      assert.equal(Schema.is(StepAgent)({ workflow: 'dev', step, agent }), true);
    });
  test('each step overrides only what its agent offers', () => {
    const at = (file: string) => path.join(TEAM, 'agents', file);
    const read = (file: string) => fs.readFileSync(at(file), 'utf8');
    const agents = new Map(named(path.join(TEAM, 'agents')).map((name) => [name, parseAgent(name, read(`${name}.md`), read)]));
    for (const step of named(TEAM_DEV)) {
      const text = fs.readFileSync(path.join(TEAM_DEV, `${step}.md`), 'utf8');
      const name = /^agent:\s*(\S+)/m.exec(text)?.[1];
      if (name === undefined) continue;
      const block = splitFrontmatter(step, text).block ?? '';
      const overrides = overridesOf(readKeys(step, block, () => undefined).meta);
      const offered = agents.get(name)?.overridable;
      assert.equal(Schema.is(StepAgent)({ workflow: 'dev', step, agent: name, overrides }), true, step);
      for (const word of overrides) assert.ok(offered === undefined || offered.includes(word), `${step} overrides ${word} of ${name}`);
    }
  });
  test('REFUSED: an override that is nothing a step may override', () =>
    assert.equal(Schema.is(StepAgent)({ workflow: 'dev', step: 'x', agent: 'a', overrides: ['check'] }), false));
  test('REFUSED: a step with no agent', () => assert.equal(Schema.is(StepAgent)({ workflow: 'dev', step: 'x' }), false));
  test("the agents' part of the diagram draws its three entities, an AgentName and a SkillName as what each names", () => {
    const lines = erDiagram(agentsModel).split('\n');
    for (const entity of ['Agent', 'Skill', 'StepAgent']) assert.ok(lines.includes(`  ${entity} {`), `${entity} has a block`);
    assert.ok(lines.includes('  Skill ||--o{ Agent : skills'), lines.join('\n'));
    assert.ok(lines.includes('  Agent ||--o{ StepAgent : agent'), lines.join('\n'));
  });
});

describe("each skill of the tests' team decodes as `skillDraftOf` reads it, and a description is one line", () => {
  const skills = path.join(TEAM, 'skills');
  for (const name of fs.readdirSync(skills)) {
    const file = path.join(skills, name, 'SKILL.md');
    test(name, () => assert.equal(Schema.is(Skill)(skillDraftOf(file, name, fs.readFileSync(file, 'utf8'))), true));
  }
  const draft = { name: 'a-skill', description: 'One line.', preload: false, body: 'Do it.' };
  test('REFUSED: a skill with no description', () => assert.equal(Schema.is(Skill)({ ...draft, description: ' ' }), false));
  test('REFUSED: a description with a line break', () => assert.equal(Schema.is(Skill)({ ...draft, description: 'One\nand two.' }), false));
});
