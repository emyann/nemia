/**
 * The docs draw a state machine from its own markers and a hand-drawn flowchart as written, and a diagram that would draw short, a
 * name no doc holds, a name two docs hold, or a state diagram drawn by hand fails the page, naming it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Code, Html, Root } from 'mdast';
import { diagramFrom, diagramIn, remarkMermaid, unreadLines } from '../src/mermaid.ts';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** A marker pair around `body`, in the shape the package docs keep. */
const marked = (name: string, body: string): string =>
  [`<!-- diagram:${name}:begin — generated -->`, '```mermaid', body, '```', `<!-- diagram:${name}:end -->`].join('\n');

/** A scratch repository whose package docs are `docs`, by path from its root. */
const repoWith = (docs: Record<string, string>): string => {
  const root = scratch('docs-mermaid-');
  for (const [file, text] of Object.entries(docs)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
};

/** A page of one `mermaid` fence with `meta` and `body`, run through the plugin at `root`: what replaced the fence. */
const drawnPage = (root: string, meta: string | null, body: string): Root['children'][number] => {
  const code: Code = { type: 'code', lang: 'mermaid', meta, value: body };
  const tree: Root = { type: 'root', children: [{ type: 'blockquote', children: [code] }] };
  remarkMermaid({ root })(tree, { path: path.join(root, 'apps/docs/src/content/docs/page.mdx') });
  const quote = tree.children[0];
  assert.ok(quote.type === 'blockquote');
  return quote.children[0];
};

/** The message `fn` throws. */
const thrown = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return assert.fail('it threw nothing');
};

test('diagramIn reads only its own name’s block', () => {
  const text = ['prose', marked('one', 'stateDiagram-v2\n  a --> b'), 'more', marked('two', 'stateDiagram-v2\n  c --> d')].join('\n');
  assert.equal(diagramIn(text, 'one'), 'stateDiagram-v2\n  a --> b');
  assert.equal(diagramIn(text, 'two'), 'stateDiagram-v2\n  c --> d');
  assert.equal(diagramIn(text, 'on'), undefined, 'a name that is the start of another is not it');
  assert.equal(diagramIn(text, 'three'), undefined);
});

test('REFUSED: a broken fence, an unknown diagram, a diagram in two docs and a state diagram drawn by hand each throw, naming the fix', () => {
  const root = repoWith({
    'packages/a/README.md': marked('twice', 'stateDiagram-v2\n  a --> b'),
    'packages/b/docs/deep/notes.md': marked('twice', 'stateDiagram-v2\n  a --> b'),
    'packages/b/docs/machine.md': marked('once', 'stateDiagram-v2\n  a --> b'),
  });
  assert.equal(diagramFrom(root, 'once'), 'stateDiagram-v2\n  a --> b');
  assert.equal(
    thrown(() => diagramFrom(root, 'no-such-machine')),
    'no package doc holds the diagram no-such-machine between <!-- diagram:no-such-machine:begin … --> and ' +
      "<!-- diagram:no-such-machine:end -->: name a machine whose package's docs hold its diagram (packages/*/README.md, packages/*/docs/)",
  );
  assert.equal(
    thrown(() => diagramFrom(root, 'twice')),
    'the diagram twice is held in packages/a/README.md and packages/b/docs/deep/notes.md: give it one home',
  );
  const page = 'apps/docs/src/content/docs/page.mdx';
  assert.equal(
    thrown(() => drawnPage(root, null, 'flowchart LR\n  a --> b\n  a --> ')),
    `${page}: a mermaid fence does not draw: these lines are read as nothing, and left out: a -->`,
  );
  assert.match(
    thrown(() => drawnPage(root, 'diagram=no-such-machine', '')),
    /^apps\/docs\/src\/content\/docs\/page\.mdx: the diagram no-such-machine does not draw: no package doc holds the diagram no-such-machine /,
    'an unknown name fails the page that names it',
  );
  assert.equal(
    thrown(() => drawnPage(root, null, 'stateDiagram-v2\n  a --> b')),
    `${page}: a mermaid fence opens with stateDiagram-v2: a diagram drawn on a page is a flowchart or a sequence; ` +
      "a state machine's diagram is its code's, a fence ```mermaid diagram=<name>",
  );
  assert.equal(
    thrown(() => drawnPage(root, 'diagram=once', 'stateDiagram-v2\n  a --> b')),
    `${page}: the diagram once is read from its markers: leave its fence empty`,
  );
});

test('unreadLines finds each line the renderer drops, in a flowchart, a state diagram and a sequence', () => {
  assert.deepEqual(unreadLines('flowchart LR\n  a --> b\n  b -->\n  end'), ['b -->', 'end']);
  assert.deepEqual(unreadLines('stateDiagram-v2\n  a --> b: GO / start\n  a -->> b'), ['a -->> b']);
  assert.deepEqual(unreadLines('sequenceDiagram\n  A->>B: hello\n  A=>B what'), ['A=>B what']);
  assert.deepEqual(unreadLines('flowchart TD\n  %% a note\n\n  a[A card] --> b(A run)\n  b --> c'), []);
});

test('unreadLines finds the line an entity-relation diagram drops, a }o among them, and none in a whole one', () => {
  const model = [
    'erDiagram',
    '  Task {',
    '    TaskId id PK',
    '    number restarts "optional"',
    '  }',
    '  Attempt {',
    '    AttemptNumber n',
    '  }',
    '  Session {',
    '    string harness',
    '  }',
    '  Try {',
    '    TaskId taskId FK',
    '  }',
    '  Task ||--o{ Attempt : attempts',
    '  Task ||--|| Session : session',
    '  Task |o--o| Session : held',
    '  TaskId ||--o{ Try : taskId',
  ].join('\n');
  assert.deepEqual(unreadLines(model), []);
  assert.deepEqual(unreadLines(`${model}\n  Try }o--|| TaskId : taskId`), ['Try }o--|| TaskId : taskId'], 'the renderer reads no }o');
});

test('a hand-drawn flowchart and both code-drawn diagrams render, each into an SVG holding its own words', () => {
  const flow = drawnPage(ROOT, null, 'flowchart LR\n  card[A card] --> landing[A landing]') as Html;
  assert.equal(flow.type, 'html');
  assert.match(flow.value, /^<figure class="diagram" style="--drawn-width: [\d.]+px"><svg[\s\S]*A landing[\s\S]*<\/svg><\/figure>$/);
  for (const [name, state] of [
    ['lifecycle', 'input-required'],
    ['nemia', 'untrusted'],
  ]) {
    assert.match(diagramFrom(ROOT, name), /^stateDiagram-v2\n/, `${name} is read from its markers`);
    const drawn = drawnPage(ROOT, `diagram=${name}`, '') as Html;
    assert.equal(drawn.type, 'html');
    assert.ok(drawn.value.includes('<svg') && drawn.value.includes(state), `${name} draws ${state}`);
  }
});

test('REFUSED: a drawn figure keeps no style of its own, which a page would print as an attribute and which fetches a font', () => {
  for (const [meta, body] of [
    [null, 'flowchart LR\n  card[A card] --> landing[A landing]'],
    ['diagram=lifecycle', ''],
    ['diagram=nemia', ''],
  ] as const) {
    const drawn = drawnPage(ROOT, meta, body) as Html;
    assert.doesNotMatch(drawn.value, /<style/, `${meta ?? 'a flowchart'} carries no style element`);
    assert.doesNotMatch(drawn.value, /@import|url\(['"]?https?:/, `${meta ?? 'a flowchart'} fetches nothing`);
  }
});

test('every colour a drawn figure reads is defined by the site’s stylesheet', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'styles', 'accent.css'), 'utf8');
  const read = new Set(
    [
      drawnPage(ROOT, null, 'flowchart LR\n  a[A] --> b{B}'),
      drawnPage(ROOT, 'diagram=lifecycle', ''),
      drawnPage(ROOT, 'diagram=nemia', ''),
    ].flatMap((node) => [...(node as Html).value.matchAll(/var\((--_[\w-]+)/g)].map((m) => m[1])),
  );
  assert.ok(read.size > 0, 'the figures read derived colours');
  for (const name of read) assert.match(css, new RegExp(`${name}:`), `${name} is defined`);
});

test('a figure carries the width its diagram is drawn at, which the site never scales below three quarters', () => {
  const drawn = drawnPage(ROOT, 'diagram=lifecycle', '') as Html;
  const width = /<svg[^>]*\swidth="([\d.]+)"/.exec(drawn.value)?.[1];
  assert.ok(width, 'the SVG says its width');
  assert.match(drawn.value, new RegExp(`^<figure class="diagram" style="--drawn-width: ${width}px">`));
  const css = fs.readFileSync(path.join(import.meta.dirname, '..', 'src', 'styles', 'accent.css'), 'utf8');
  assert.match(css, /min-width:\s*calc\(var\(--drawn-width\) \* 0\.75\)/);
});

test('a figure wider than the column at three quarters says to scroll it, and one that fits says nothing', () => {
  for (const name of ['lifecycle', 'nemia']) {
    const drawn = drawnPage(ROOT, `diagram=${name}`, '') as Html;
    assert.match(drawn.value, /^<figure[^>]*><figcaption>[^<]*scroll it sideways[^<]*<\/figcaption><svg/, `${name} says to scroll`);
  }
  const small = drawnPage(ROOT, null, 'flowchart LR\n  card[A card] --> landing[A landing]') as Html;
  assert.doesNotMatch(small.value, /<figcaption>/);
});
