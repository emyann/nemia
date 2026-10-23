/**
 * The frontmatter reader and writer: what is written reads back the same, to this reader and to js-yaml; the former line form is read
 * and rewritten with every value byte for byte; and a block in neither form is refused at its line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jsyaml from 'js-yaml';
import { WorkflowError } from '../step/step.ts';
import {
  commentTails,
  flatValue,
  readFrontmatter,
  renderFrontmatter,
  rewriteFormer,
  withKey,
  type FrontmatterValue,
} from './frontmatter.ts';

const FORMER = path.join(import.meta.dirname, '../../test/fixtures/former-frontmatter');

/** A block's keys as key → value. */
const valuesOf = (block: string): Record<string, FrontmatterValue> =>
  Object.fromEntries(readFrontmatter('t', block).entries.map(({ key, value }) => [key, value]));

/** The former reader's reading of a block: each line trimmed, split at its first colon. */
const formerReading = (block: string): [string, string][] =>
  block
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]);

/** A file's block, between its two `---`. */
const blockOf = (text: string): string => /^---\n([\s\S]*?\n)---\n/.exec(text)![1];

test('a value written reads back the same, to this reader and to js-yaml (but a word its core schema reads as a number or null, which Nemia reads as text), and a plain one is written plain', async (t) => {
  const long = `{ if [ -n "\${WF_BASE_REF:-}" ]; then echo "a: b" # not a comment; fi; } && ${'x'.repeat(260)}`;
  const hard = [
    '{ a }',
    '[a]',
    '*x',
    '&x',
    '!x',
    '%x',
    '@x',
    '|x',
    '>x',
    '- x',
    '-',
    '?x',
    '? x',
    '`x`',
    'a: b',
    'a #b',
    'a # b',
    '#x',
    '"q"',
    "'q'",
    'q"',
    "it's",
    'true',
    '5',
    '1.50',
    'null',
    '~',
    ' lead',
    'trail ',
    long,
    'line1\nline2',
    'a\n\nb\n',
    'ünï ✓',
    'a\tb',
    'x:',
    'Bash(git push:*), Bash(*:4318*)',
  ];
  for (const value of hard) {
    await t.test(JSON.stringify(value).slice(0, 40), () => {
      const block = renderFrontmatter([['check', value]]);
      assert.deepEqual(valuesOf(block), { check: value });
      assert.equal(readFrontmatter('t', block).former, false);
      const read = jsyaml.load(block) as Record<string, unknown>;
      const coreWord = /^(~|null|[\d.]+)$/.test(value);
      if (typeof read.check === 'string' || !coreWord) assert.equal(String(read.check), value, 'js-yaml reads the same text');
    });
  }
  await t.test('plain where it can be', () => {
    assert.equal(
      renderFrontmatter([
        ['agent', 'coder'],
        ['budget', '40'],
        ['tools', 'Read, Grep'],
      ]),
      'agent: coder\nbudget: 40\ntools: Read, Grep\n',
    );
  });
  await t.test('a long value that cannot be plain, and a multi-line one, are literal blocks', () => {
    assert.match(renderFrontmatter([['check', long]]), /^check: \|-?\n {2}/);
    assert.match(renderFrontmatter([['check', 'a\nb']]), /^check: \|-\n {2}a\n {2}b\n$/);
  });
  await t.test('a list is written as one, and reads back as one', () => {
    const block = renderFrontmatter([['tags', ['code', 'a: b']]]);
    assert.deepEqual(valuesOf(block), { tags: ['code', 'a: b'] });
  });
});

test('the former blocks are rewritten as YAML, every value the former reader read byte for byte, and the body kept', async (t) => {
  const files = fs.readdirSync(FORMER).filter((f) => f.endsWith('.md') && f !== 'README.md');
  assert.equal(files.length, 6, 'the six former blocks are read');
  for (const file of files) {
    await t.test(file, () => {
      const text = fs.readFileSync(path.join(FORMER, file), 'utf8');
      const before = blockOf(text);
      assert.equal(readFrontmatter(file, before).former, true, 'it is read in the former form');
      const { text: after, changed } = rewriteFormer(file, text);
      assert.equal(changed, true);
      const block = blockOf(after);
      const read = readFrontmatter(file, block);
      assert.equal(read.former, false);
      assert.deepEqual(
        read.entries.map(({ key, value }) => [key, value]),
        formerReading(before),
      );
      assert.doesNotThrow(() => jsyaml.load(block), 'js-yaml reads it');
      assert.equal(after.slice(after.indexOf('\n---\n') + 5), text.slice(text.indexOf('\n---\n') + 5), 'the body is as it was');
      assert.deepEqual(rewriteFormer(file, after), { text: after, changed: false }, 'a second rewrite changes nothing');
    });
  }
  await t.test('a line YAML reads the same is left byte for byte, and CRLF line breaks stay', () => {
    const text = '---\r\nagent: coder\r\n# kept\r\ncheck: echo {a} b: c\r\n---\r\nbody\r\n';
    const { text: after } = rewriteFormer('t', text);
    assert.equal(after, '---\r\nagent: coder\r\n# kept\r\ncheck: "echo {a} b: c"\r\n---\r\nbody\r\n');
  });
});

test('the former form is read where YAML refuses it or reads a flow map, and a block in neither form is refused at its line', async (t) => {
  await t.test('YAML refuses it', () => {
    const read = readFrontmatter('t', 'agent: coder\ncheck: a: b\n');
    assert.equal(read.former, true);
    assert.deepEqual(read.entries, [
      { key: 'agent', value: 'coder', line: 2 },
      { key: 'check', value: 'a: b', line: 3 },
    ]);
  });
  await t.test('YAML reads a flow map, or a flow list on a key that holds none', () => {
    assert.deepEqual(readFrontmatter('t', 'check: { true; }\n').entries[0].value, '{ true; }');
    assert.deepEqual(readFrontmatter('t', 'check: [ -f x ]\n').entries[0].value, '[ -f x ]');
    assert.deepEqual(readFrontmatter('t', 'tools: [Read, Grep]\n').entries[0].value, ['Read', 'Grep']);
  });
  await t.test('neither form', () => {
    for (const [block, line] of [
      ['agent: coder\ncheck: a: b\n  and on\n', 3],
      ['agent: coder\n- item\n', 3],
    ] as const) {
      assert.throws(
        () => readFrontmatter('t', block),
        (e: unknown) => e instanceof WorkflowError && e.message.startsWith(`t:${line}:`),
      );
    }
  });
  await t.test('a document marker inside the block', () => {
    assert.throws(
      () => readFrontmatter('t', '---\n'),
      (e: unknown) => e instanceof WorkflowError && e.message.startsWith('t:2:'),
    );
  });
  await t.test('prose is not a map of keys', () => {
    assert.throws(() => readFrontmatter('t', 'This is a brief, not keys\n'), WorkflowError);
  });
  await t.test('a block of comments alone has no keys', () => {
    assert.deepEqual(readFrontmatter('t', '# only\n'), { entries: [], former: false });
  });
  await t.test('a key set twice is listed twice, for its reader to refuse', () => {
    assert.deepEqual(
      readFrontmatter('t', 'check: a\ncheck: b\n').entries.map((e) => e.value),
      ['a', 'b'],
    );
  });
  await t.test('an empty value reads as empty text', () => {
    assert.deepEqual(valuesOf('check:\n'), { check: '' });
  });
});

test('flatValue reads a list on a list key as the comma string, and refuses one elsewhere', () => {
  const at = (block: string) => readFrontmatter('t', block).entries[0];
  assert.equal(flatValue('t', at('tools: [Read, Grep]\n'), true), 'Read, Grep');
  assert.equal(flatValue('t', at('tools:\n  - Read\n  - Grep\n'), true), 'Read, Grep');
  assert.equal(flatValue('t', at('tools: Read, Grep\n'), true), 'Read, Grep');
  assert.throws(() => flatValue('t', at('check:\n  - a\n'), false), WorkflowError);
  assert.throws(() => flatValue('t', at('after: [a, "b, c"]\n'), true), WorkflowError);
  assert.throws(() => flatValue('t', at('after:\n  x: y\n'), true), WorkflowError);
});

test('withKey sets or takes out one key, each other as written', () => {
  const block = '# kept\ndescription: "a: b"\npreload: true\ntags: [x]\n';
  assert.equal(withKey('t', block, 'preload', undefined), '# kept\ndescription: "a: b"\ntags: [ x ]\n');
  assert.deepEqual(valuesOf(withKey('t', block, 'preload', 'false')), { description: 'a: b', preload: 'false', tags: ['x'] });
  assert.deepEqual(valuesOf(withKey('t', 'description: a\n', 'preload', 'true')), { description: 'a', preload: 'true' });
  assert.deepEqual(valuesOf(withKey('t', 'description: a: b\n', 'preload', 'true')), { description: 'a: b', preload: 'true' });
});

test('commentTails lists a plain value YAML ends at ` #`, which the former reader read on', () => {
  assert.deepEqual(commentTails('agent: coder\ncheck: npm test # all of it\nmodel: a#b\n'), [3]);
  assert.deepEqual(commentTails('check: a: b # c\n'), [], 'a former block keeps the tail in its value');
});
