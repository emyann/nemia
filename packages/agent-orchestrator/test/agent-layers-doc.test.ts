/**
 * The four layers that shape an agent apart from its task, as the package's README (*An agent is a node's attachment*) and the
 * `create-an-agent` skill (*The four layers*) describe them: each names instructions, custom instructions, the step's policy and factory
 * rules in that order, and calls none of them an escape hatch; the README names the agent's `harnessPrompt:`. Each refusal is first made
 * of planted text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './team.ts';

/** The four layers, named in their order, matched across line breaks and whatever is said between them. */
const IN_ORDER = /\binstructions\b[^]*?\bcustom\s+instructions\b[^]*?\bstep's\s+policy\b[^]*?\bfactory\s+rules\b/i;
const ESCAPE_HATCH = /escape\s+hatch/i;

/** Why a passage on the layers is wrong — a layer out of order or missing, or one called an escape hatch — or undefined. */
function layersRefusal(passage: string): string | undefined {
  if (!IN_ORDER.test(passage)) return "it does not name instructions, custom instructions, the step's policy and factory rules in order";
  if (ESCAPE_HATCH.test(passage)) return 'it calls a layer an escape hatch';
  return undefined;
}

/** The text of `file` from the line `from` begins, up to the heading `to` matches, which must follow it. */
function slice(file: string, from: string, to: RegExp): string {
  const text = fs.readFileSync(path.join(REPO, file), 'utf8');
  const start = text.indexOf(from);
  assert.ok(start >= 0, `${file} has ${from}`);
  const rest = text.slice(start + from.length);
  const end = rest.search(to);
  assert.ok(end >= 0, `${file} has a heading after ${from}`);
  return rest.slice(0, end);
}

const README = (): string =>
  slice('packages/agent-orchestrator/README.md', "### An agent is a node's attachment", /^#### What an agent says it can do/m);
const SKILL = (): string => slice('.claude/skills/create-an-agent/SKILL.md', '## The four layers', /^## /m);

test('REFUSED: a passage that names the layers out of order, leaves one out, or calls one an escape hatch', () => {
  assert.equal(layersRefusal("Instructions, then custom instructions, then the step's policy, then factory rules."), undefined);
  assert.equal(
    layersRefusal(
      "**Instructions** — its body.\n2. **Custom\n   instructions** — a person's.\n3. **The step's\n   policy**.\n4. **Factory\nrules**.",
    ),
    undefined,
    'a line break inside a name still names it',
  );
  for (const planted of [
    "Instructions, then the step's policy, then custom instructions, then factory rules.",
    "Factory rules, then instructions, then custom instructions, then the step's policy.",
    "Instructions, then custom instructions, then the step's policy.",
  ])
    assert.match(layersRefusal(planted) ?? '', /in order/, planted);
  assert.match(
    layersRefusal("Instructions, custom instructions, the step's policy — an escape\nhatch, not the normal case — and factory rules.") ??
      '',
    /escape hatch/,
  );
});

test("the README's *An agent is a node's attachment* names the four layers in order, as no escape hatch, and gives `harnessPrompt:`", () => {
  const passage = README();
  assert.equal(layersRefusal(passage), undefined);
  assert.match(passage, /harnessPrompt:/);
});

test("create-an-agent's *The four layers* names them in order, as no escape hatch", () => {
  assert.equal(layersRefusal(SKILL()), undefined);
});

/** Why a passage's second layer is wrong — it says custom instructions are coming, or names no command that sets them — or undefined. */
function customLayerRefusal(passage: string): string | undefined {
  const layer = /2\.\s*\*\*Custom\s+instructions\*\*([^]*?)3\.\s*\*\*The\s+step's/.exec(passage)?.[1];
  if (layer === undefined) return 'it has no second layer, custom instructions, before the step’s policy';
  if (/coming,\s*not\s+built/i.test(layer)) return 'it says custom instructions are coming, not built';
  if (!/wf\s+agents\s+custom\s+<name>/.test(layer)) return 'it names no command that sets them, `wf agents custom <name>`';
  return undefined;
}

test('REFUSED: a second layer that says custom instructions are coming, or names no command that sets them', () => {
  const layer = (words: string) =>
    `1. **Instructions** — its body.\n2. **Custom instructions** — ${words}\n3. **The step's policy** — its own.`;
  assert.equal(customLayerRefusal(layer('kept in your store, set by `wf agents\ncustom <name>`.')), undefined);
  assert.match(customLayerRefusal(layer('what a person adds. Coming,\nnot built.')) ?? '', /coming, not built/);
  assert.match(customLayerRefusal(layer('what a person adds.')) ?? '', /names no command/);
  assert.match(customLayerRefusal('1. **Instructions** — its body.') ?? '', /no second layer/);
});

test('the README and create-an-agent each say custom instructions are built, and the command that sets them', () => {
  assert.equal(customLayerRefusal(README()), undefined, 'README');
  assert.equal(customLayerRefusal(SKILL()), undefined, 'create-an-agent');
});
