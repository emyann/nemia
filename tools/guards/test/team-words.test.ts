/**
 * The skills that write, build and review a spec are generic about placing a change: they say "the boundaries the repository's own rules
 * define", and never name this repository's layers, the kinds of its orchestrator's files, or the document that holds them; nor does the
 * skill an agent is written by (`create-an-agent`). This repository's words for them live in its `CLAUDE.md` files, which every agent
 * reads. sdlc's agents and schemas, which the nemia factory runs, are held by `packages/templates/test/portable.test.ts`. Each word is
 * first refused in planted text, and each file is read for a name it must hold, so a file moved or emptied cannot make the guard pass by
 * reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter } from 'agent-orchestrator/workflow';
import { REPO } from 'test-kit/repo';

/** This repository's placement vocabulary, which no file of the mechanism may name. */
const REPOSITORY_WORDS = /agent-runtime|agent-orchestrator|apps\/api|runtime-client|docs\/architecture\.md|pure,\s*store,\s*controller/;

/** Each file of the mechanism, by path from the repository's root, with a name it must hold, and whether its body alone is read. */
const MECHANISM: Array<{ file: string; holds: string; body: boolean }> = [
  { file: 'packages/templates/sdlc/skills/write-a-spec/SKILL.md', holds: '# Write a spec', body: true },
  { file: 'packages/templates/sdlc/skills/review-a-change/SKILL.md', holds: '# Review a change', body: true },
  { file: 'packages/templates/sdlc/skills/implement-a-change/SKILL.md', holds: '# Implement a change', body: true },
  { file: 'packages/agent-orchestrator/skills/create-an-agent/SKILL.md', holds: '# Create an agent in Nemia', body: true },
];

/** The text of `file` the guard reads: a skill's body after its frontmatter, or the file whole. */
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

test("no file of the placement mechanism names this repository's layers, file kinds or architecture document", () => {
  for (const { file, body } of MECHANISM) assert.doesNotMatch(textOf(file, body), REPOSITORY_WORDS, file);
});
