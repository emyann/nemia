/**
 * The five layers that shape an agent apart from its task have one source in code, `LAYER_HEADINGS`
 * (`packages/agent-orchestrator/src/workflow/layers.ts`, read here as text since no entry of the package exports it):
 * the heading each layer a session is told is told under, by its number in the precedence order and its name, the folder's files (3)
 * being read by the harness and composed by nobody. The one prose list of them is `create-an-agent`'s *The five layers*
 * (`packages/agent-orchestrator/skills/create-an-agent/SKILL.md`), which this test holds to the code: five numbered items in order, each
 * layer the code heads named as the code names it, none called an escape hatch, and the higher number said to win. Every other place
 * that speaks of the layers points to that skill and is read by no test.
 *
 * The documentation site's *What an agent is told: five layers* keeps its own list on purpose — a person reads the site, not the
 * package's skills — and is held to the code the same way, its wording its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { REPO } from 'test-kit/repo';

/** Where the code heads the layers. */
const LAYERS_FILE = 'packages/agent-orchestrator/src/workflow/layers.ts';

/** `LAYER_HEADINGS` as `LAYERS_FILE` declares it: each key's heading, read from the object literal by the TypeScript parser. */
function readHeadings(): Record<string, string> {
  const source = ts.createSourceFile(LAYERS_FILE, fs.readFileSync(path.join(REPO, LAYERS_FILE), 'utf8'), ts.ScriptTarget.Latest, true);
  let literal: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'LAYER_HEADINGS' && node.initializer) {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isObjectLiteralExpression(value)) literal = value;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(literal, `${LAYERS_FILE} declares no LAYER_HEADINGS object: read the headings here from where the code now keeps them`);
  return Object.fromEntries(
    literal.properties.flatMap((property) =>
      ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)
        ? [[property.name.getText(source), property.initializer.text]]
        : [],
    ),
  );
}

const LAYER_HEADINGS = readHeadings();

/** A layer as the code heads it: its number in the precedence order and its name, read off a heading `## n. Name — whose`. */
type Layer = { number: number; name: string };

/** The layers the code heads, read off `headings`, in their order. */
function layersOf(headings: Readonly<Record<string, string>>): Layer[] {
  return Object.values(headings).map((heading) => {
    const found = /^#+\s*(\d+)\.\s+(.+?)\s+—/.exec(heading);
    assert.ok(found, `the heading "${heading}" names no layer as "## n. Name — whose": read it here as the code now writes it`);
    return { number: Number(found[1]), name: found[2] };
  });
}

const ESCAPE_HATCH = /escape\s+hatch/i;
const HIGHER_NUMBER = /\bthe\s+higher\s+number\s+wins\b/i;

/** Every numbered item of a passage's layer list, by its `1. **Name**` line, whitespace in a name collapsed to one space. */
function numbered(passage: string): Layer[] {
  return [...passage.matchAll(/^(\d+)\.\s+\*\*([^*]+)\*\*/gm)].map((m) => ({
    number: Number(m[1]),
    name: m[2].replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Why a passage's numbered list of the layers is not the code's — a count other than the highest number the code heads (the folder's
 * files, which no code heads, among them), a number out of order, a layer the code heads named otherwise, a layer called an escape
 * hatch — or undefined.
 */
function layersRefusal(passage: string, layers: readonly Layer[]): string | undefined {
  const items = numbered(passage);
  const count = Math.max(...layers.map((layer) => layer.number));
  if (items.length !== count) return `it numbers ${items.length} layers, and the code's precedence order has ${count}`;
  for (const [i, item] of items.entries()) if (item.number !== i + 1) return `its item ${i + 1} is numbered ${item.number}, not in order`;
  for (const layer of layers) {
    const item = items[layer.number - 1];
    if (item.name.toLowerCase() !== layer.name.toLowerCase())
      return `its layer ${layer.number} is **${item.name}**, and the code heads it **${layer.name}** (LAYER_HEADINGS)`;
  }
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

const SKILL = (): string => slice('packages/agent-orchestrator/skills/create-an-agent/SKILL.md', '## The five layers', /^## /m);
const PAGE = (): string => slice('apps/docs/src/content/docs/agents.mdx', '## What an agent is told: five layers', /^## Sources/m);

/** A fixture's layers, not the code's: three of them headed, at 1, 2 and 4 of four. */
const PLANTED: Layer[] = [
  { number: 1, name: 'Own words' },
  { number: 2, name: 'Added words' },
  { number: 4, name: "The place's rules" },
];

/** A numbered list of the layers, each item `n. **Name** — words`, built from the names and numbers given. */
const listOf = (names: readonly string[], numbers?: readonly number[]): string =>
  names.map((name, i) => `${numbers?.[i] ?? i + 1}. **${name}** — what it says.`).join('\n');

const FOUR = ['Own words', 'Added words', 'The files', "The place's rules"];

test('REFUSED: a numbered list that is not the layers the code heads, in their order, or that calls one an escape hatch', () => {
  assert.equal(layersRefusal(listOf(FOUR), PLANTED), undefined);
  assert.equal(
    layersRefusal("1. **Own\n   words**.\n2. **Added words**.\n3. **Any name**.\n4. **The place's\nrules**.", PLANTED),
    undefined,
    'a line break inside a name still names it, and the layer no code heads may be named anyhow',
  );
  assert.match(layersRefusal(listOf(FOUR.slice(0, 3)), PLANTED) ?? '', /numbers 3 layers/);
  assert.match(layersRefusal(listOf(FOUR, [1, 2, 4, 3]), PLANTED) ?? '', /item 3 is numbered 4/);
  assert.match(
    layersRefusal(listOf(['Own words', "The place's rules", 'The files', 'Added words']), PLANTED) ?? '',
    /layer 2 is \*\*The place's rules\*\*, and the code heads it \*\*Added words\*\*/,
  );
  assert.match(layersRefusal(`${listOf(FOUR)}\n\nThe last is an escape\nhatch.`, PLANTED) ?? '', /escape hatch/);
});

test('the layers are read off the code: a heading renamed there is what the skill is then refused against', () => {
  assert.deepEqual(layersOf({ a: '## 1. Own words — yours', b: "## 4. The place's rules — every step" }), [
    { number: 1, name: 'Own words' },
    { number: 4, name: "The place's rules" },
  ]);
  const renamed = layersOf(LAYER_HEADINGS).map((layer) => (layer.number === 1 ? { ...layer, name: 'Own words' } : layer));
  assert.match(layersRefusal(SKILL(), renamed) ?? '', /layer 1 is \*\*Instructions\*\*, and the code heads it \*\*Own words\*\*/);
});

test("create-an-agent's *The five layers* numbers the code's layers by precedence, says the higher number wins, and calls none an escape hatch", () => {
  const passage = SKILL();
  assert.equal(layersRefusal(passage, layersOf(LAYER_HEADINGS)), undefined);
  assert.match(passage, HIGHER_NUMBER, 'the skill says that the higher number wins');
});

test("the documentation site's *What an agent is told: five layers* numbers the code's layers too", () => {
  assert.equal(layersRefusal(PAGE(), layersOf(LAYER_HEADINGS)), undefined);
});
