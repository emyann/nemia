/**
 * A frontmatter block read and written as YAML 1.2, by the `yaml` package: the one reader every step, agent, skill and card goes
 * through (`readFrontmatter`), the one writer (`renderFrontmatter`), a key set or taken out of a block (`withKey`), and the rewrite of a
 * file still in the former line form (`rewriteFormer`). Pure.
 *
 * Every scalar reads as the string written (the failsafe schema): `budget: 1.50` reads `1.50`, `preload: true` reads `true`, as the
 * former reader read them, and a key's own reader judges the words. A key keeps its meaning where it is read; this file knows only which
 * keys may hold a list (`LIST_KEYS`, `step.ts`).
 *
 * **The former form.** Before this reader, a line was `key: the rest of the line`, split at its first colon, and a value was never quoted.
 * A block YAML refuses, or reads as a flow collection on a key that holds none, whose every line is `key: rest`, is still read that way,
 * and marked `former`; `nemia frontmatter rewrite` turns it into YAML with every value the same, byte for byte. A block in neither form is
 * refused, naming its line and the fix.
 */
import { Document, isMap, isScalar, isSeq, LineCounter, parseDocument, Scalar, YAMLSeq, type Node, type Pair } from 'yaml';
import { LIST_KEYS, refuse, STEP_KEYS } from '../step/step.ts';

/** A value a frontmatter key holds: text, a list, or a map, each scalar the string written. */
export type FrontmatterValue = string | readonly FrontmatterValue[] | { readonly [key: string]: FrontmatterValue };

/** One key of a block, in the order written, with the line of the file it opens on (the block opens on line 2, after `---`). */
export type FrontmatterEntry = { key: string; value: FrontmatterValue; line: number };

/** A block read: its keys in order, a key set twice listed twice, and whether it was read in the former line form. */
export type Frontmatter = { entries: FrontmatterEntry[]; former: boolean };

/** A key and the value to write under it, in the order a file says them. */
export type FrontmatterPair = readonly [key: string, value: FrontmatterValue];

/** The line of the file a block's own line is: the block opens after the `---` on line 1. */
const FIRST_LINE = 2;

/** A value longer than this that cannot be written plain is written as a literal block (`|-`), where a person can read it. */
const BLOCK_PAST = 120;

/** A former line: a word, then a colon, the rest its value. Indented or not, as the former reader trimmed every line. */
const FORMER_LINE = /^[A-Za-z_][\w.-]*[ \t]*:/;

/**
 * A step's keys that hold one value: a flow collection YAML reads on one of them, `check: [ -f x ]` or `check: { a; b; }`, is the shell
 * the former form wrote, never a list or a map the key could take.
 */
const ONE_VALUE: readonly string[] = STEP_KEYS.filter((key) => !LIST_KEYS.includes(key));

/** The options every parse here is read with. */
const parsed = (block: string, lineCounter?: LineCounter) =>
  parseDocument(block, { schema: 'failsafe', version: '1.2', uniqueKeys: false, prettyErrors: false, ...(lineCounter && { lineCounter }) });

/** A node as its value: a scalar's string (`''` for an empty one), a list's items, a map's keys. */
function valueOf(node: unknown): FrontmatterValue {
  if (node === null || node === undefined) return '';
  if (isScalar(node))
    return typeof node.value === 'string' ? node.value : node.value === null || node.value === undefined ? '' : JSON.stringify(node.value);
  if (isSeq(node)) return node.items.map(valueOf);
  if (isMap(node))
    return Object.fromEntries(node.items.map((pair) => [String(isScalar(pair.key) ? pair.key.value : pair.key), valueOf(pair.value)]));
  return '';
}

/** Whether a block's every line is a former line, a comment or blank: what the former reader read without refusing. */
const formerShaped = (block: string): boolean =>
  block.split('\n').every((raw) => {
    const line = raw.trim();
    return !line || line.startsWith('#') || FORMER_LINE.test(line);
  });

/** A block read the former way: each line trimmed, split at its first colon. */
function formerEntries(block: string): FrontmatterEntry[] {
  return block.split('\n').flatMap((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return [];
    const at = line.indexOf(':');
    return [{ key: line.slice(0, at).trim(), value: line.slice(at + 1).trim(), line: i + FIRST_LINE }];
  });
}

/** The fix every refusal of a block's YAML names. */
const YAML_FIX =
  'The frontmatter is YAML: quote a value that holds `: ` or ` #`, or opens on one of `{ [ * & ! % @ | > - ? ` and a backtick — `check: "a: b"` — or write a long or multi-line one as a literal block, `check: |-` and the value on the lines below it, indented';

/**
 * A frontmatter block (the lines between the two `---`, as `splitFrontmatter` hands it) as its keys, in order, each with its line. Read as
 * YAML 1.2; read the former way and marked `former` when YAML refuses it, or reads a flow collection on a step's key that holds one
 * value (`ONE_VALUE`), and its every line is a former one. Refused, as `WorkflowError`, naming the file's line and
 * the fix: a block in neither form, one that is not a map of keys (a line of prose), and a key that is not a word of text.
 */
export function readFrontmatter(name: string, block: string): Frontmatter {
  const counter = new LineCounter();
  const doc = parsed(block, counter);
  const lineAt = (offset: number | undefined): number =>
    offset === undefined ? FIRST_LINE : counter.linePos(offset).line + FIRST_LINE - 1;
  const shaped = formerShaped(block);
  if (doc.errors.length) {
    if (shaped) return { entries: formerEntries(block), former: true };
    const [error] = doc.errors;
    refuse(`${name}:${lineAt(error.pos[0])}: ${error.message.split('\n')[0]}. ${YAML_FIX}.`);
  }
  const root = doc.contents;
  if (root === null || (isScalar(root) && (root.value === null || root.value === ''))) return { entries: [], former: false };
  if (!isMap(root)) {
    if (shaped) return { entries: formerEntries(block), former: true };
    refuse(
      `${name}:${lineAt(root.range?.[0])}: the frontmatter is not a map of keys, and every line of it is a key, a colon and its value: \`after: a, b\`. ${YAML_FIX}.`,
    );
  }
  const pairs = root.items as Pair[];
  const flowWhereNone = pairs.some(
    ({ key, value }) =>
      (isMap(value) || isSeq(value)) && (value as YAMLSeq).flow && ONE_VALUE.includes(String(isScalar(key) ? key.value : key)),
  );
  if (flowWhereNone && shaped) return { entries: formerEntries(block), former: true };
  const entries = pairs.map(({ key, value }) => {
    if (!isScalar(key) || typeof key.value !== 'string' || !key.value) {
      refuse(
        `${name}:${lineAt((key as Node | null)?.range?.[0])}: a frontmatter key is a word, written plain: \`after: a, b\`. ${YAML_FIX}.`,
      );
    }
    return { key: key.value, value: valueOf(value), line: lineAt(key.range?.[0]) };
  });
  return { entries, former: false };
}

/**
 * A block read as `readFrontmatter` reads it, or null where it refuses it: for a reader that never refuses, as a file's one key is read
 * for a listing (`frontmatterKey`), or a file that is a card only when its block reads as one (`cardToStart`).
 */
export function frontmatterOrNull(block: string): Frontmatter | null {
  try {
    return readFrontmatter('', block);
  } catch {
    return null;
  }
}

/**
 * An entry's value as the one string its key's reader reads: text as it is, and a list on a key that holds one (`list`) as the comma
 * string the former form wrote, `tools: [Read, Grep]` as `Read, Grep`. Refused, naming the line: a list on a key that holds one value, a
 * list item that is not text or holds a comma (the comma form cannot carry it), and a map.
 */
export function flatValue(name: string, entry: FrontmatterEntry, list: boolean): string {
  const { key, value, line } = entry;
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) {
    refuse(`${name}:${line}: \`${key}\` holds a map, and it is one line of text${list ? ' or a list' : ''}: \`${key}: <value>\`.`);
  }
  if (!list) refuse(`${name}:${line}: \`${key}\` is one value, not a list. Write it on one line: \`${key}: <value>\`.`);
  const items = value as readonly FrontmatterValue[];
  for (const item of items) {
    if (typeof item !== 'string')
      refuse(`${name}:${line}: \`${key}\` is a list of words, and an item of it is not one: \`${key}: [a, b]\`.`);
    if (item.includes(',')) {
      refuse(
        `${name}:${line}: \`${key}\` has the item ${JSON.stringify(item)}, which holds a comma, and a list item never does: a comma parts the items of \`${key}: a, b\`. Split it into two items.`,
      );
    }
  }
  return (items as readonly string[]).join(', ');
}

/** A scalar node for `value`, in `type`. */
const scalarOf = (value: string, type?: Scalar.Type): Scalar => {
  const node = new Scalar(value);
  if (type) node.type = type;
  return node;
};

/** A node for `value`: a scalar, a flow list of scalars, or a map. */
function nodeOf(doc: Document, value: FrontmatterValue, type?: Scalar.Type): unknown {
  if (typeof value === 'string') return scalarOf(value, type);
  if (Array.isArray(value)) {
    const seq = new YAMLSeq();
    seq.flow = true;
    seq.items = value.map((item) => nodeOf(doc, item as FrontmatterValue));
    return seq;
  }
  return doc.createNode(value);
}

/** One `key: value` written in `type`, as lines. */
function pairText(key: string, value: FrontmatterValue, type?: Scalar.Type): string {
  const doc = new Document({}, { schema: 'failsafe', version: '1.2' });
  doc.set(scalarOf(key), nodeOf(doc, value, type));
  return doc.toString({ lineWidth: 0, minContentWidth: 0 });
}

/** Whether `text` reads back as `key` holding `value`, and nothing else. */
function readsBack(text: string, key: string, value: FrontmatterValue): boolean {
  const read = frontmatterOrNull(text);
  return read !== null && !read.former && read.entries.length === 1 && read.entries[0].key === key && same(read.entries[0].value, value);
}

/** Whether two values are the same, item by item. */
const same = (a: FrontmatterValue, b: FrontmatterValue): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * `key: value` as YAML, the lines it takes: plain where a plain value reads back the same, quoted where it would not, and a literal block
 * (`|-`) for a value with a line break, or one longer than `BLOCK_PAST` that cannot be plain. Each is read back, and written in double
 * quotes, which hold anything, where the first form would read otherwise.
 */
function writtenPair(key: string, value: FrontmatterValue): string {
  const first = pairText(key, value);
  if (typeof value === 'string') {
    const plain = first === `${key}: ${value}\n`;
    const block = value.includes('\n') || (!plain && value.length > BLOCK_PAST) ? pairText(key, value, 'BLOCK_LITERAL') : first;
    if (readsBack(block, key, value)) return block;
    if (readsBack(first, key, value)) return first;
  } else if (readsBack(first, key, value)) return first;
  const quoted = pairText(key, value, 'QUOTE_DOUBLE');
  if (!readsBack(quoted, key, value)) refuse(`\`${key}\` could not be written so it reads back as it was given: send it as text.`);
  return quoted;
}

/**
 * The block for `pairs`, in their order: each `key: value` written as `writtenPair` writes it, every line ending in a line break, with no
 * `---` around it. What every writer of a step, an agent, a skill or a card writes through, so a file written and read back
 * (`readFrontmatter`) gives the values it was written with. A comment line a writer keeps goes before or after it, as it is.
 */
export function renderFrontmatter(pairs: readonly FrontmatterPair[]): string {
  return pairs.map(([key, value]) => writtenPair(key, value)).join('');
}

/** A block in YAML: the former form's rewritten (`rewriteBlock`), a block already in YAML as it is. */
const yamlOf = (name: string, block: string): string => (readFrontmatter(name, block).former ? rewriteBlock(name, block) : block);

/**
 * `block` with `key` set to `value`, or taken out where `value` is undefined, each other key, its comment and its form as written: what a
 * switch writes into a file whose other keys no render keeps (`withPreload`). A key set twice is set or taken out each time. A block in
 * the former form is rewritten into YAML first (`rewriteFormer`). Returns the block's lines, as `renderFrontmatter` does.
 */
export function withKey(name: string, block: string, key: string, value: FrontmatterValue | undefined): string {
  const doc = parsed(yamlOf(name, block));
  if (doc.contents === null || isScalar(doc.contents)) doc.contents = doc.createNode({}) as never;
  if (!isMap(doc.contents)) refuse(`${name}: the frontmatter is not a map of keys, and \`${key}\` is a key of it. ${YAML_FIX}.`);
  const map = doc.contents;
  const at = map.items.filter((pair) => isScalar(pair.key) && pair.key.value === key);
  if (value === undefined) {
    map.items = map.items.filter((pair) => !at.includes(pair));
    return map.items.length ? doc.toString({ lineWidth: 0, minContentWidth: 0 }) : commentsOf(block);
  }
  const node = parsed(writtenPair(key, value)).contents;
  const written = isMap(node) ? node.items[0].value : null;
  if (at.length) for (const pair of at) pair.value = written;
  else map.items.push(isMap(node) ? node.items[0] : (null as never));
  return doc.toString({ lineWidth: 0, minContentWidth: 0 });
}

/** A block's comment lines alone, what is left of it once its last key is taken out. */
const commentsOf = (block: string): string =>
  block
    .split('\n')
    .filter((line) => line.trim().startsWith('#'))
    .map((line) => `${line}\n`)
    .join('');

/** Whether one former line `key: value` reads, as YAML on its own, as the former reader read it. */
const lineReadsSame = (line: string, key: string, value: string): boolean => {
  const read = frontmatterOrNull(line);
  return read !== null && !read.former && read.entries.length === 1 && read.entries[0].key === key && read.entries[0].value === value;
};

/**
 * A former block (`readFrontmatter` marks it `former`) as YAML: each line that YAML reads otherwise, or that sits indented, written again
 * as `writtenPair` writes it, every other line, comment and blank left byte for byte. Refused, naming the line, where YAML would not read
 * the result as the former reader read the block: a key's value, its order or its count.
 */
function rewriteBlock(name: string, block: string, eol = '\n'): string {
  const lines = block.split('\n');
  const tail = lines.pop() ?? '';
  const written = lines.map((raw) => {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const at = trimmed.indexOf(':');
    const key = trimmed.slice(0, at).trim();
    const value = trimmed.slice(at + 1).trim();
    if (line === trimmed && lineReadsSame(line, key, value)) return line;
    return writtenPair(key, value).replace(/\n$/, '').split('\n').join(eol);
  });
  const text = [...written, tail].join(eol);
  const before = formerEntries(block.replace(/\r\n/g, '\n'));
  const after = frontmatterOrNull(text.replace(/\r\n/g, '\n'));
  const wrong =
    after === null || after.former
      ? before[0]
      : before.find((entry, i) => !same(after.entries[i]?.value ?? '\0', entry.value) || after.entries[i]?.key !== entry.key);
  if (wrong !== undefined || (after && after.entries.length !== before.length)) {
    refuse(
      `${name}:${wrong?.line ?? FIRST_LINE}: the former line form could not be written as YAML that reads the same: rewrite this line by hand, quoting its value or writing it as a literal block (\`|-\`).`,
    );
  }
  return text;
}

/** A file's frontmatter where its bytes are: an optional byte order mark, the opening `---` and its line break, the block, the close. */
const FRONTMATTER_AT = /^(﻿?---[ \t]*(\r?\n))([\s\S]*?\r?\n)?(---[ \t]*(?:\r?\n|$))/;

/**
 * A file's text with its frontmatter in YAML, where the former reader read it (`readFrontmatter` marks it `former`), and `changed`: each
 * line YAML would read otherwise written again (quoted, or as a literal block), every other byte of the file — its other lines, its
 * line breaks, its body — as it was. A file with no frontmatter, or one already in YAML, is returned as it is. Refused, naming the line,
 * where the result would not read as the former reader read it, and where the block is in neither form (`readFrontmatter`). Pure: the
 * walk over folders is `nemia frontmatter rewrite`'s.
 */
export function rewriteFormer(name: string, text: string): { text: string; changed: boolean } {
  const m = FRONTMATTER_AT.exec(text);
  if (!m) return { text, changed: false };
  const block = m[3] ?? '';
  if (!readFrontmatter(name, block.replace(/\r\n/g, '\n')).former) return { text, changed: false };
  const written = rewriteBlock(name, block, m[2]);
  return { text: `${m[1]}${written}${m[4]}${text.slice(m[0].length)}`, changed: written !== block };
}

/**
 * The lines of a block in YAML where a plain value goes on past ` #`, which YAML reads as a comment and the former reader read as part
 * of the value, each by its line in the file. What `nemia frontmatter rewrite` lists rather than guesses: whether the tail was meant
 * is the author's to say. None for a block read in the former form, whose rewrite keeps the tail in the value.
 */
export function commentTails(block: string): number[] {
  const read = frontmatterOrNull(block);
  if (read === null || read.former) return [];
  const lines = block.split('\n');
  return read.entries.flatMap(({ key, value, line }) => {
    const raw = lines[line - FIRST_LINE]?.trim() ?? '';
    const at = raw.indexOf(':');
    if (typeof value !== 'string' || at < 0 || raw.slice(0, at).trim() !== key) return [];
    const former = raw.slice(at + 1).trim();
    return former !== value && /\s#/.test(former) && former.startsWith(value) ? [line] : [];
  });
}
