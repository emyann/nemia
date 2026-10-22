/**
 * The team's mechanism for placing a change is generic: the spec's and the review's schemas, the bodies of the agents that write, build and
 * review a spec, and their skills say "the boundaries the repository's own rules define", and never name this repository's layers, the
 * kinds of its orchestrator's files, or the document that holds them; nor does the skill an agent is written by (`create-an-agent`). This
 * repository's words for them live in its `CLAUDE.md` files, which every agent reads. Each word is first refused in planted text, and each
 * file is read for a name it must hold, so a file moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from '../src/step/step.ts';
import { REPO } from './team.ts';

/** This repository's placement vocabulary, which no file of the team's mechanism may name. */
const REPOSITORY_WORDS = /agent-runtime|agent-orchestrator|apps\/api|runtime-client|docs\/architecture\.md|pure,\s*store,\s*controller/;

/** Each file of the team's mechanism, by path from the repository's root, with a name it must hold, and whether its body alone is read. */
const MECHANISM: Array<{ file: string; holds: string; body: boolean }> = [
  { file: 'workflows/agents/spec.schema.json', holds: '"placement"', body: false },
  { file: 'workflows/agents/review.schema.json', holds: '"kind"', body: false },
  { file: 'workflows/agents/seldon.md', holds: 'write-a-spec', body: true },
  { file: 'workflows/agents/agora.md', holds: 'review-a-change', body: true },
  { file: 'workflows/agents/ada.md', holds: 'implement-a-change', body: true },
  { file: '.claude/skills/write-a-spec/SKILL.md', holds: '# Write a spec', body: true },
  { file: '.claude/skills/review-a-change/SKILL.md', holds: '# Review a change', body: true },
  { file: '.claude/skills/implement-a-change/SKILL.md', holds: '# Implement a change', body: true },
  { file: '.claude/skills/create-an-agent/SKILL.md', holds: '# Create an agent in Nemia', body: true },
];

/** The text of `file` the guard reads: an agent's or a skill's body after its frontmatter, a schema whole. */
const textOf = (file: string, body: boolean): string => {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8');
  return body ? splitFrontmatter(file, text).body : text;
};

test("the matcher refuses each of this repository's placement words in planted text", () => {
  for (const planted of [
    'Read docs/architecture.md first.',
    'agent-runtime owns how a session runs.',
    'the orchestrator reaches agent-orchestrator/run',
    'the api, apps/api/src/workflows',
    'through src/runtime-client.ts alone',
    'each file is pure, store, controller or the client',
    'a kind: pure,\n  store, controller',
  ])
    assert.match(planted, REPOSITORY_WORDS, planted);
  assert.doesNotMatch("the boundaries the repository's own rules define, in its CLAUDE.md files", REPOSITORY_WORDS);
});

test('every file of the mechanism is read, and holds a name it must', () => {
  for (const { file, holds, body } of MECHANISM) assert.ok(textOf(file, body).includes(holds), `${file} holds ${holds}`);
});

test("no file of the team's placement mechanism names this repository's layers, file kinds or architecture document", () => {
  for (const { file, body } of MECHANISM) assert.doesNotMatch(textOf(file, body), REPOSITORY_WORDS, file);
});
