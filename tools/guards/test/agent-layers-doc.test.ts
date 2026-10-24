/**
 * The five layers that shape an agent apart from its task, as the package's README (*An agent is a node's attachment*), the
 * `create-an-agent` skill (*The five layers*) and the documentation site's *What an agent is told: five layers* describe them: each
 * numbers them by precedence — the agent's instructions, the person's custom instructions, the folder's files, the factory's rules,
 * the step's policy — says the higher number wins, and calls none of them an escape hatch; the README and the page carry the routing
 * rule that says which layer owns a new instruction, and each says that a session is told the precedence, which it now is; the README
 * names the agent's `harnessPrompt:`. The meaning of *Instruction layers* in the agents' glossary table
 * (`packages/agent-orchestrator/src/agents/glossary.json`) says the same. Each refusal is first made of planted text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './workspaces.ts';

/** The five layers in precedence order, as each numbered list names them: the higher number wins. */
const IN_ORDER = ['Instructions', 'Custom instructions', "The folder's files", "The factory's rules", "The step's policy"];

/**
 * A layer's name as a routing question cites its owner: the leading `The` dropped, a line break allowed between its words, and
 * `Instructions` only where `custom` does not precede them, so the first layer's question is not answered by the second's.
 */
const cited = (name: string): RegExp => {
  const words = name
    .replace(/^The\s+/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  return new RegExp(name === 'Instructions' ? `(?<!custom\\s{1,4})${words}` : words, 'i');
};

const ESCAPE_HATCH = /escape\s+hatch/i;
const LATER_WINS = /\bthe\s+later\s+(?:one|layer)?\s*wins\b/i;
const HIGHER_NUMBER = /\bthe\s+higher\s+number\s+wins\b/i;
const ROUTING = /\*\*Where a new instruction goes\.?\*\*|^#+ Where a new instruction goes/m;
const ROUTING_END = /^A procedure is none of them/m;
const NOT_BUILT = /\bcoming,\s*not\s+built\b|\bis\s+not\s+built\s+yet\b/i;

/** Every numbered item of a passage's layer list, by its `1. **Name**` line, whitespace in a name collapsed to one space. */
function numbered(passage: string): Array<{ number: number; name: string }> {
  return [...passage.matchAll(/^(\d+)\.\s+\*\*([^*]+)\*\*/gm)].map((m) => ({
    number: Number(m[1]),
    name: m[2].replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Why a passage's numbered list of the layers is wrong — a count, a number or a name that is not the precedence order, or a layer
 * called an escape hatch — or undefined.
 */
function layersRefusal(passage: string): string | undefined {
  const items = numbered(passage);
  if (items.length !== IN_ORDER.length)
    return `it numbers ${items.length} layers, not the five: ${IN_ORDER.map((n, i) => `${i + 1} ${n}`).join(', ')}`;
  for (const [i, want] of IN_ORDER.entries()) {
    const got = items[i];
    if (got.number !== i + 1) return `its layer ${i + 1} is numbered ${got.number}, and the five are numbered in order`;
    if (got.name.toLowerCase() !== want.toLowerCase()) return `its layer ${i + 1} is **${got.name}**, and by precedence it is **${want}**`;
  }
  if (ESCAPE_HATCH.test(passage)) return 'it calls a layer an escape hatch';
  return undefined;
}

/** Why a passage states the precedence wrongly — it says the later layer wins, or never says the higher number does — or undefined. */
function precedenceRefusal(passage: string): string | undefined {
  if (LATER_WINS.test(passage)) return 'it says the later layer wins, and precedence is by number';
  if (!HIGHER_NUMBER.test(passage)) return 'it does not say the higher number wins';
  return undefined;
}

/**
 * Why a passage carries no routing rule — the block is missing, it does not end on the line that sends a procedure elsewhere, or its
 * questions are not one for each layer in precedence order, each naming its own layer's owner — or undefined. The block ends on that
 * line, so the prose after it cannot supply a name a question dropped.
 */
function routingRefusal(passage: string): string | undefined {
  const at = passage.search(ROUTING);
  if (at < 0) return 'it has no **Where a new instruction goes** block, which says which layer owns a new instruction';
  const rest = passage.slice(at);
  const ends = rest.search(ROUTING_END);
  if (ends < 0) return 'its routing rule does not end on `A procedure is none of them`, which sends a procedure to a skill instead';
  const asked = [...rest.slice(0, ends).matchAll(/^(\d+)\.[^\n]*$/gm)];
  if (asked.length !== IN_ORDER.length) return `its routing rule asks ${asked.length} questions, not one for each of the five layers`;
  for (const [i, want] of IN_ORDER.entries()) {
    const question = asked[i][0];
    if (Number(asked[i][1]) !== i + 1) return `its question ${i + 1} is numbered ${asked[i][1]}, and the five are asked in order`;
    if (!cited(want).test(question)) return `its question ${i + 1} names no owner for **${want}**`;
  }
  return undefined;
}

/** That a session is told the precedence, as a passage says it. */
const IS_TOLD = /\ba\s+session\s+is\s+told\s+(?:this|so|it|the\s+precedence)\b/i;

/**
 * Why a shipped passage is wrong about what a session is told — it still says telling one is coming, or it never says a session is
 * told the precedence — or undefined. A session is told it, so the caveat S1 shipped is now the mistake.
 */
function toldRefusal(passage: string): string | undefined {
  if (NOT_BUILT.test(passage)) return 'it says telling a session the precedence is not built, and a session is told it';
  if (!IS_TOLD.test(passage)) return 'it does not say that a session is told the precedence';
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
const SKILL = (): string => slice('.claude/skills/create-an-agent/SKILL.md', '## The five layers', /^## /m);
const PAGE = (): string => slice('apps/docs/src/content/docs/agents.mdx', '## What an agent is told: five layers', /^## Sources/m);
/** The `meaning` of the term `Instruction layers` in the agents' glossary table. */
const GLOSSARY = (): string => {
  const file = 'packages/agent-orchestrator/src/agents/glossary.json';
  const table = JSON.parse(fs.readFileSync(path.join(REPO, file), 'utf8')) as { terms: Array<{ term: string; meaning: string }> };
  const row = table.terms.find((t) => t.term === 'Instruction layers');
  assert.ok(row, `${file} has the term Instruction layers`);
  return row.meaning;
};

/** A numbered list of the layers, each item `n. **Name** — words`, built from the names and numbers given. */
const listOf = (names: readonly string[], numbers?: readonly number[]): string =>
  names.map((name, i) => `${numbers?.[i] ?? i + 1}. **${name}** — what it says.`).join('\n');

test('REFUSED: a numbered list that is not the five layers in precedence order, or that calls one an escape hatch', () => {
  assert.equal(layersRefusal(listOf(IN_ORDER)), undefined);
  assert.equal(
    layersRefusal(
      "1. **Instructions** — its body.\n2. **Custom\n   instructions** — a person's.\n3. **The folder's\n   files**.\n4. **The factory's\n   rules**.\n5. **The step's\npolicy**.",
    ),
    undefined,
    'a line break inside a name still names it',
  );
  const OLD_ORDER = ['Instructions', 'Custom instructions', "The factory's rules", "The step's policy", "The folder's files"];
  assert.match(
    layersRefusal(listOf(OLD_ORDER)) ?? '',
    /layer 3 is \*\*The factory's rules\*\*, and by precedence it is \*\*The folder's files\*\*/,
  );
  assert.match(layersRefusal(listOf(IN_ORDER.slice(0, 4))) ?? '', /numbers 4 layers, not the five/);
  assert.match(layersRefusal(listOf(IN_ORDER, [1, 2, 3, 3, 4])) ?? '', /layer 4 is numbered 3/);
  assert.match(
    layersRefusal(listOf(['Instructions', 'Custom instructions', "The folder's files", "The factory's rules", 'The step'])) ?? '',
    /layer 5 is \*\*The step\*\*, and by precedence it is \*\*The step's policy\*\*/,
  );
  assert.match(layersRefusal(`${listOf(IN_ORDER)}\n\nThe step's policy is an escape\nhatch, not the normal case.`) ?? '', /escape hatch/);
});

test('REFUSED: a precedence paragraph that says the later layer wins, or never says the higher number does', () => {
  assert.equal(precedenceRefusal('Where two say different things, the higher number wins, and the task is above them all.'), undefined);
  assert.match(precedenceRefusal('Where two say different things, the later one wins.') ?? '', /says the later layer wins/);
  assert.match(precedenceRefusal('Where two say different things, the later layer wins.') ?? '', /says the later layer wins/);
  assert.match(precedenceRefusal('The words reach the agent in that order, then the task.') ?? '', /does not say the higher number wins/);
});

/** A routing block of one question per owner named, each numbered in turn, ended by the line a real one ends on. */
const block = (owners: readonly string[], numbers?: readonly number[]): string =>
  `**Where a new instruction goes.** Ask these in order and stop at the first yes:\n${owners
    .map((owner, i) => `${numbers?.[i] ?? i + 1}. Does it hold so? Then its **${owner.replace(/^The\s+/, '')}**.`)
    .join('\n')}\n\nA procedure is none of them: it belongs in a skill.`;

test('REFUSED: a passage with no routing rule, or one whose questions are not one per layer in precedence order', () => {
  assert.equal(routingRefusal(block(IN_ORDER)), undefined);
  assert.match(routingRefusal(listOf(IN_ORDER)) ?? '', /no \*\*Where a new instruction goes\*\* block/);
  assert.match(routingRefusal(block(IN_ORDER).replace(/\n\nA procedure[^]*$/, '')) ?? '', /does not end on/);
  assert.match(routingRefusal(block(IN_ORDER.slice(0, 4))) ?? '', /asks 4 questions, not one for each/);
  assert.match(routingRefusal(block(IN_ORDER, [1, 2, 3, 3, 4])) ?? '', /question 4 is numbered 3/);
  assert.match(routingRefusal(block(IN_ORDER.slice(1))) ?? '', /asks 4 questions, not one for each/);
  assert.match(
    routingRefusal(block(['Custom instructions', ...IN_ORDER.slice(1)])) ?? '',
    /question 1 names no owner for \*\*Instructions\*\*/,
    "the first layer's question is not answered by naming custom instructions",
  );
  assert.match(
    routingRefusal(block([IN_ORDER[0], IN_ORDER[1], IN_ORDER[2], IN_ORDER[3], "The step's note"])) ?? '',
    /question 5 names no owner for \*\*The step's policy\*\*/,
  );
  assert.match(
    routingRefusal(`${block(IN_ORDER.slice(0, 4))}\n\nThe run page shows the step's policy and the task after it.`) ?? '',
    /asks 4 questions, not one for each/,
    'the prose after the block cannot supply an owner a question dropped',
  );
});

test('REFUSED: a shipped passage that says telling a session the precedence is not built, or never says a session is told it', () => {
  assert.equal(toldRefusal('The higher number wins. A session is told this, in every brief.'), undefined);
  assert.match(
    toldRefusal('The higher number wins. A session is told this. Telling the agent so is coming, not built.') ?? '',
    /is not built, and a session is told it/,
    'the caveat is refused even beside the sentence that replaces it',
  );
  assert.match(toldRefusal('The higher number wins. A session is not built yet to be told so.') ?? '', /is not built/);
  assert.match(toldRefusal('The higher number wins, and the task is above them all.') ?? '', /does not say that a session is told/);
});

test("the README's *An agent is a node's attachment* numbers the layers by precedence, routes a new instruction, and gives `harnessPrompt:`", () => {
  const passage = README();
  assert.equal(layersRefusal(passage), undefined);
  assert.equal(precedenceRefusal(passage), undefined);
  assert.equal(routingRefusal(passage), undefined);
  assert.equal(toldRefusal(passage), undefined);
  assert.match(passage, /harnessPrompt:/);
});

test("the documentation site's *What an agent is told: five layers* says the same, and what a session is told of it", () => {
  const passage = PAGE();
  assert.equal(layersRefusal(passage), undefined);
  assert.equal(precedenceRefusal(passage), undefined);
  assert.equal(routingRefusal(passage), undefined);
  assert.equal(toldRefusal(passage), undefined);
});

test("create-an-agent's *The five layers* numbers them by precedence, as no escape hatch", () => {
  const passage = SKILL();
  assert.equal(layersRefusal(passage), undefined);
  assert.equal(precedenceRefusal(passage), undefined);
});

/** Why a passage's second layer is wrong — it says custom instructions are coming, or names no command that sets them — or undefined. */
function customLayerRefusal(passage: string): string | undefined {
  const layer = /2\.\s*\*\*Custom\s+instructions\*\*([^]*?)^3\.\s*\*\*/m.exec(passage)?.[1];
  if (layer === undefined) return 'it has no second layer, custom instructions, before the third';
  if (/coming,\s*not\s+built/i.test(layer)) return 'it says custom instructions are coming, not built';
  if (!/wf\s+agents\s+custom\s+<name>/.test(layer)) return 'it names no command that sets them, `wf agents custom <name>`';
  return undefined;
}

test('REFUSED: a second layer that says custom instructions are coming, or names no command that sets them', () => {
  const layer = (words: string) =>
    `1. **Instructions** — its body.\n2. **Custom instructions** — ${words}\n3. **The folder's files** — the harness's.`;
  assert.equal(customLayerRefusal(layer('kept in your store, set by `wf agents\ncustom <name>`.')), undefined);
  assert.match(customLayerRefusal(layer('what a person adds. Coming,\nnot built.')) ?? '', /coming, not built/);
  assert.match(customLayerRefusal(layer('what a person adds.')) ?? '', /names no command/);
  assert.match(customLayerRefusal('1. **Instructions** — its body.') ?? '', /no second layer/);
});

test('the README and create-an-agent each say custom instructions are built, and the command that sets them', () => {
  assert.equal(customLayerRefusal(README()), undefined, 'README');
  assert.equal(customLayerRefusal(SKILL()), undefined, 'create-an-agent');
});

test("the agents' glossary table's *Instruction layers* says the precedence, and that a session is told it", () => {
  const entry = GLOSSARY();
  assert.equal(precedenceRefusal(entry), undefined);
  assert.equal(toldRefusal(entry), undefined);
  assert.match(entry, /five layers/i, 'and that there are five of them');
});
