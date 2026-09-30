/**
 * A state machine's diagram is its code's, never a drawing.
 *
 * Every state machine in the repository prints its own Mermaid diagram, and its package's docs hold that text between two markers:
 *
 * ~~~
 * <!-- diagram:<name>:begin — generated, from the repository's root: node -e "import('./<path>.ts').then((m) => console.log(m.<fn>()))" -->
 * ```mermaid
 * …
 * ```
 * <!-- diagram:<name>:end -->
 * ~~~
 *
 * This test knows no machine. It reads every markdown file the repository holds, runs each marker's command from the root, and
 * refuses a block that is not what the command prints, a command that cannot print (a machine that does not exist), and a marker of
 * any other shape. The command has one shape so that a doc can name no other program for the suite to run. It runs from here, not
 * from the machine's package, because spawning a command is not an import: no package's test imports another's files.
 *
 * Turbo caches this package's pass by this package's files and the runtime's, so a marker is kept to a package's docs, and a change
 * elsewhere alone replays the pass: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { files, REPO, textOf } from './repo-files.ts';

/** A begin marker, whose command is `node -e` on one script that imports one module by its path from the root and prints one call. */
const BEGIN =
  /^<!-- diagram:([a-z][\w-]*):begin — generated, from the repository's root: (node -e "(import\('\.\/[\w./-]+\.ts'\)\.then\(\(m\) => console\.log\(m\.\w+\(\)\)\))") -->$/;

/** Any line a person meant as a marker: one this reads, or one of another shape, which is refused rather than skipped. */
const MARKER = /^<!-- diagram:/;

/** The one shape a marker has, as a refusal says it. */
const SHAPE =
  `<!-- diagram:<name>:begin — generated, from the repository's root: node -e "import('./<path>.ts').then((m) => console.log(m.<fn>()))" -->, ` +
  'a ```mermaid block, then <!-- diagram:<name>:end -->';

/** How long a command may take to print before the answer is that it did not finish, never that it drifted. */
const PRINT_MS = 60_000;

/** What a command gave: what it printed, or why it printed nothing — it failed, or it did not finish. */
type Printed = { out: string } | { error: string; unfinished?: boolean };

/** Runs a marker's script with this Node, from the repository's root. */
type Print = (script: string) => Printed;

/** One diagram a doc holds: its name, the command on its marker, the script inside it, and the block's lines. */
type Block = { file: string; name: string; command: string; script: string; lines: string[] };

/** The node -e a marker names, run for real: what a person pasting the command would see. */
const printed: Print = (script) => {
  try {
    return {
      out: execFileSync(process.execPath, ['-e', script], {
        cwd: REPO,
        encoding: 'utf8',
        timeout: PRINT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (err) {
    const e = err as { signal?: string | null; stderr?: string; message: string };
    if (e.signal) return { error: `stopped by ${e.signal} after ${PRINT_MS / 1000}s`, unfinished: true };
    return { error: (e.stderr || e.message).split('\n').find((l) => l.trim()) ?? e.message };
  }
};

/** The block a begin marker at line `at` opens: its lines, or why the lines after it are not a fenced block closed by its end. */
function blockAfter(lines: string[], at: number, name: string): { body: string[]; next: number } | { breach: string } {
  const end = `<!-- diagram:${name}:end -->`;
  if (lines[at + 1] !== '```mermaid') return { breach: `the line after it is not \`\`\`mermaid` };
  const close = lines.indexOf('```', at + 2);
  if (close < 0 || lines[close + 1] !== end) return { breach: `its \`\`\`mermaid block is not closed by \`\`\` and ${end}` };
  return { body: lines.slice(at + 2, close), next: close + 2 };
}

/** The diagrams a doc holds, and a breach for each marker line of another shape, a block unclosed, or a doc outside a package. */
function blocksIn(file: string, text: string): { blocks: Block[]; breaches: string[] } {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  const breaches: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!MARKER.test(lines[i])) continue;
    const m = BEGIN.exec(lines[i]);
    if (!m) {
      breaches.push(`${file}:${i + 1}: a diagram marker not of the one shape, or an end with no begin — write ${SHAPE}`);
      continue;
    }
    const [, name, command, script] = m;
    if (!/^packages\/[^/]+\//.test(file))
      breaches.push(`${file}:${i + 1}: the marker diagram:${name} is outside a package — put the diagram in its machine's package's docs`);
    const found = blockAfter(lines, i, name);
    if ('breach' in found) {
      breaches.push(`${file}:${i + 1}: the marker diagram:${name}: ${found.breach} — write ${SHAPE}`);
      i = Math.max(i, lines.indexOf(`<!-- diagram:${name}:end -->`, i + 1));
      continue;
    }
    blocks.push({ file, name, command, script, lines: found.body });
    i = found.next - 1;
  }
  return { blocks, breaches };
}

/** Where one block is not what its command prints, each breach naming the command. */
function driftOf(block: Block, print: Print): string[] {
  const { file, name, command } = block;
  const got = print(block.script);
  if ('error' in got)
    return [
      got.unfinished
        ? `${file}: the command of diagram:${name} did not finish, which says nothing of the diagram (${got.error}) — run it again: ${command}`
        : `${file}: the marker diagram:${name} names a machine its command cannot print — ${command}: ${got.error}`,
    ];
  return got.out.replace(/\n$/, '') === block.lines.join('\n')
    ? []
    : [`${file}: the diagram:${name} block is not its machine's — regenerate it from the repository's root: ${command}`];
}

/** Every breach across `docs`: a marker's shape, a name begun twice in the repository, and a block that drifted from its machine. */
function driftIn(docs: Array<{ file: string; text: string }>, print: Print): string[] {
  const read = docs.map(({ file, text }) => blocksIn(file, text));
  const blocks = read.flatMap((r) => r.blocks);
  const seen = new Map<string, string>();
  const twice = blocks.flatMap((b) => {
    const first = seen.get(b.name);
    seen.set(b.name, first ?? b.file);
    return first === undefined
      ? []
      : [`${b.file}: diagram:${b.name} is begun twice in the repository, first in ${first} — give it one home`];
  });
  return [...read.flatMap((r) => r.breaches), ...twice, ...blocks.flatMap((b) => driftOf(b, print))];
}

/** Every markdown file the repository holds that has a marker line. */
const docsWithMarkers = () =>
  files()
    .filter((f) => f.endsWith('.md'))
    .flatMap((file) => {
      const text = textOf(file);
      return text !== undefined && text.split('\n').some((l) => MARKER.test(l)) ? [{ file, text }] : [];
    });

const RUNTIME_README = 'packages/agent-runtime/README.md';
const LOST = '  working --> ending: LOST / record-end';

/** The runtime's README as it is on disk: the lifecycle's diagram, the one every refusal below is planted in. */
const readme = (): string => {
  const text = textOf(RUNTIME_README) ?? '';
  assert.ok(text.includes(LOST), `${RUNTIME_README} holds the lifecycle's diagram`);
  return text;
};

/**
 * The lifecycle's block as its marker names it. Its command is the runtime's README's own words: this package names no path into
 * another's src (the runtime's `contract.test.ts`).
 */
const lifecycle = (): Block => {
  const block = blocksIn(RUNTIME_README, readme()).blocks.find((b) => b.name === 'lifecycle');
  assert.ok(
    block && block.command.endsWith('.then((m) => console.log(m.diagram()))"'),
    `${RUNTIME_README} names the command of diagram:lifecycle`,
  );
  return block;
};

/** What a block that is not its machine's is refused with. */
const drifted = (command: string) =>
  `${RUNTIME_README}: the diagram:lifecycle block is not its machine's — regenerate it from the repository's root: ${command}`;

/** A doc holding one diagram under `name`, whose command runs `script`. */
const doc = (name: string, script: string, body = ['stateDiagram-v2']) =>
  [
    'Prose.',
    `<!-- diagram:${name}:begin — generated, from the repository's root: node -e "${script}" -->`,
    '```mermaid',
    ...body,
    '```',
    `<!-- diagram:${name}:end -->`,
    '',
  ].join('\n');

test("every diagram in the repository's docs is what its machine prints, and the scan found the lifecycle's", () => {
  const docs = docsWithMarkers();
  const found = docs.flatMap(({ file, text }) => blocksIn(file, text).blocks.map((b) => `${b.file} ${b.name}`));
  assert.ok(found.includes(`${RUNTIME_README} lifecycle`), `the scan reads the lifecycle's diagram: ${found.join(', ')}`);
  assert.deepEqual(driftIn(docs, printed), []);
});

test('REFUSED: a block edited by hand, naming the command that regenerates it', () => {
  const text = readme();
  const edited = text.replace(LOST, '  working --> failed: LOST / record-end');
  assert.notEqual(edited, text);
  assert.deepEqual(driftIn([{ file: RUNTIME_README, text: edited }], printed), [drifted(lifecycle().command)]);
});

test('REFUSED: a machine that lost an edge the block still draws', () => {
  let taken = false;
  const lost: Print = (script) => {
    const got = printed(script);
    if (!('out' in got)) return got;
    taken = got.out.includes(`${LOST}\n`);
    return { out: got.out.replace(`${LOST}\n`, '') };
  };
  assert.deepEqual(driftIn([{ file: RUNTIME_README, text: readme() }], lost), [drifted(lifecycle().command)]);
  assert.ok(taken, 'the edge was taken away from what the machine printed');
});

test('REFUSED: a marker naming a machine that does not exist — a module that is not there, or one without the export', () => {
  const nowhere = lifecycle().script.replace(/\/[\w-]+\.ts'/, "/nowhere.ts'");
  const nothing = lifecycle().script.replace('m.diagram()', 'm.nothing()');
  assert.ok(nowhere !== lifecycle().script && nothing !== lifecycle().script, 'both planted in the real command');
  const breaches = driftIn(
    [
      { file: 'packages/agent-runtime/docs/a.md', text: doc('gone', nowhere) },
      { file: 'packages/agent-runtime/docs/b.md', text: doc('unnamed', nothing) },
    ],
    printed,
  );
  assert.equal(breaches.length, 2, breaches.join('\n'));
  assert.ok(
    breaches[0].startsWith(
      `packages/agent-runtime/docs/a.md: the marker diagram:gone names a machine its command cannot print — node -e "${nowhere}": `,
    ),
    breaches[0],
  );
  assert.ok(
    breaches[1].startsWith(
      `packages/agent-runtime/docs/b.md: the marker diagram:unnamed names a machine its command cannot print — node -e "${nothing}": `,
    ),
    breaches[1],
  );
});

test('REFUSED: a command that did not finish is said apart from a drift, and names the command to run again', () => {
  const script = "import('./x.ts').then((m) => console.log(m.diagram()))";
  assert.deepEqual(
    driftIn([{ file: 'packages/x/README.md', text: doc('slow', script) }], () => ({
      error: 'stopped by SIGTERM after 60s',
      unfinished: true,
    })),
    [
      `packages/x/README.md: the command of diagram:slow did not finish, which says nothing of the diagram (stopped by SIGTERM after 60s) — run it again: node -e "${script}"`,
    ],
  );
});

test('REFUSED: a marker of another shape — another command, which is never run, no fence, no end, an end alone, a name twice, a doc outside a package', () => {
  const ran: string[] = [];
  const spy: Print = (script) => {
    ran.push(script);
    return { out: 'stateDiagram-v2\n' };
  };
  const script = "import('./packages/x/src/m.ts').then((m) => console.log(m.diagram()))";
  const good = doc('m', script);
  const shape = 'a diagram marker not of the one shape, or an end with no begin';
  const planted: Array<[string, string, string[]]> = [
    ['another command, and so an end with no begin', good.replace(`node -e "${script}"`, 'rm -rf x'), [`2: ${shape}`, `6: ${shape}`]],
    ['no fence', good.replace('```mermaid\n', ''), ['2: the marker diagram:m: the line after it is not ```mermaid']],
    ['no end', good.replace('<!-- diagram:m:end -->', ''), ['2: the marker diagram:m: its ```mermaid block is not closed']],
    ['an end alone', 'Prose.\n<!-- diagram:m:end -->\n', [`2: ${shape}`]],
  ];
  for (const [what, text, says] of planted) {
    const breaches = driftIn([{ file: 'packages/x/README.md', text }], spy);
    assert.equal(breaches.length, says.length, `${what}: ${breaches.join('\n')}`);
    says.forEach((start, i) => assert.ok(breaches[i].startsWith(`packages/x/README.md:${start}`), `${what}: ${breaches[i]}`));
  }
  assert.deepEqual(ran, [], 'no command of another shape, nor one whose block is broken, is run');
  assert.deepEqual(
    driftIn(
      [
        { file: 'packages/x/README.md', text: good },
        { file: 'packages/y/docs/m.md', text: good },
      ],
      spy,
    ),
    ['packages/y/docs/m.md: diagram:m is begun twice in the repository, first in packages/x/README.md — give it one home'],
  );
  assert.deepEqual(driftIn([{ file: 'docs/m.md', text: good }], spy), [
    "docs/m.md:2: the marker diagram:m is outside a package — put the diagram in its machine's package's docs",
  ]);
  assert.deepEqual(
    driftIn([{ file: 'packages/x/README.md', text: `Say \`${good.split('\n')[1]}\` mid-line.\n` }], spy),
    [],
    'prose that quotes a marker',
  );
});
