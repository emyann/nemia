/**
 * The two rules about how a test is written that a machine can check, so that neither is prose (root `CLAUDE.md`, *Rules the code
 * keeps*: "**Prose is not a constraint.** If the packages need an agent to do something, the machinery refuses the alternative").
 * Both are stated for the engineer in `.claude/skills/implement-a-change/SKILL.md`, step 2, and looked for by the reviewer in
 * `.claude/skills/review-a-change/SKILL.md`, step 5; here they are held.
 *
 * - **A refusal's words are nobody's to check** — root `CLAUDE.md` says it already: "what a refusal is thrown as and the exit code it
 *   carries are refused when they are wrong, its words are nobody's to check". `pinnedWords` finds an assertion over what the code
 *   said — a `message`, a `stderr`, the reason it gives — whose expected value is a whole sentence: a string or a pattern of
 *   `SENTENCE` characters or more holding two spaces or more. Such an assertion owns the sentence: the day the message is made
 *   clearer the test fails, and nothing about the behaviour changed.
 * - **A shipped default is not waited out.** `waitedOut` finds an assertion that floors a measured duration at a bound the shipped
 *   code owns — `assert.ok(waited >= FEED_LOCK_WAIT_MS)` — which buys a second of proof with a second of every pass. The bound is
 *   shortened at the seam the code gives for it instead, and the floor measured there.
 *
 * Each rule is a pure function over one test file's source text, proven first on planted sources it must refuse and must not, then
 * swept over every test file of the repository. What still holds one is counted per file in `test/test-rules.baseline.ts`: the sweep
 * refuses a file the baseline does not name, a count that has grown, and an entry whose lines are gone, so each list only shrinks.
 * The ~1,760 assertions that pin a sentence today cannot be unpinned in the run that writes this rule; a baseline makes them a debt
 * a later card walks down, where a lint rule could only be switched off.
 *
 * The test reads files outside this package, as `claude-md-cites.test.ts` does: after a change to a test anywhere, `npx turbo run
 * test --force`. The walk is a copy of that file's and not an import of it — importing a test file would run its tests here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PINNED_WORDS, WAITED_OUT } from './test-rules.baseline.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The folders a walk never enters: another repository's code, a build's output, a cache, and the package manager's tree. */
const SKIPPED = new Set(['node_modules', '.git', '.turbo', 'dist', 'build', '.e2e', 'ds']);

/** Every file under `root` whose name `wanted` accepts, by its path from `root`, in order, the skipped folders left unentered. */
function walk(root: string, wanted: (name: string) => boolean, at = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, at), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const here = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name) && !entry.name.startsWith('.claude')) found.push(...walk(root, wanted, here));
    } else if (entry.isFile() && wanted(entry.name)) found.push(here);
  }
  return found;
}

/**
 * The one file neither sweep reads: this one. Its planted sources are the fixtures of the two rules, so a sentence expected in one
 * of them is the rule being proven and not a debt — as `root-given.test.ts` lets the root's own service hold a root.
 */
const ALLOWED = ['tools/guards/test/test-rules.test.ts'];

/** Every test file of the repository but this one, beside the code or under a `test/`, by its path from the root. */
const testFiles = (): string[] => walk(ROOT, (name) => /\.test\.tsx?$/.test(name)).filter((f) => !ALLOWED.includes(f));

/** Where the string or template opened by the quote at `i` of `text` ends, past its closing quote; a string ends at a line break. */
const pastQuote = (text: string, i: number, quote: string): number => {
  let k = i + 1;
  for (; k < text.length; k++) {
    if (text[k] === '\\') k++;
    else if (text[k] === quote || (quote !== '`' && text[k] === '\n')) break;
  }
  return k + 1;
};

/** Whether the `/` at `i` of `text` opens a pattern rather than divides: what stands before it is no value. */
const opensPattern = (text: string, i: number): boolean => {
  let k = i - 1;
  while (k >= 0 && /\s/.test(text[k])) k--;
  return k < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(text[k]) || /\b(?:return|typeof|of|in)$/.test(text.slice(Math.max(0, k - 6), k + 1));
};

/**
 * `text` with every comment blanked and its line breaks kept, so a sentence quoted in prose — a header paragraph, the example above a
 * signature — is passed over while the line numbers still read true. Read a character at a time, past each string, template and
 * pattern, so a `//` in a URL or a `/*` in a glob is no comment: a pattern of the text alone blanked the code after one, and every
 * assertion it held passed the sweep unread.
 */
const uncommented = (text: string): string => {
  const out = text.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const to = end === -1 ? text.length : end;
      blank(i, to);
      i = to;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const to = end === -1 ? text.length : end + 2;
      blank(i, to);
      i = to;
    } else if (c === "'" || c === '"' || c === '`') i = pastQuote(text, i, c);
    else if (c === '/' && opensPattern(text, i)) {
      let k = i + 1;
      let inClass = false;
      while (k < text.length && text[k] !== '\n' && (inClass || text[k] !== '/')) {
        if (text[k] === '\\') k++;
        else if (text[k] === '[') inClass = true;
        else if (text[k] === ']') inClass = false;
        k++;
      }
      i = k + 1;
    } else i++;
  }
  return out.join('');
};

/**
 * The text of the call whose `(` stands at `open`, to the `)` that closes it, or `undefined` where none does. A call and not a line:
 * an assertion wraps over as many lines as the formatter likes, and a slice that ended at the line break would read the expected
 * value of a one-line assertion and nothing else — an assertion of absence passing for nothing.
 */
const callAt = (clean: string, open: number): string | undefined => {
  let depth = 0;
  for (let i = open; i < clean.length; i++) {
    const c = clean[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return clean.slice(open, i + 1);
    }
  }
  return undefined;
};

/**
 * Each assertion of `clean`, as the text of its call: `assert(…)`, one of its verbs, and a `.includes(…)` of an expected value.
 * `refusal` marks an `assert.throws` or an `assert.rejects`, whose subject is the error by construction.
 */
const assertions = (clean: string): Array<{ at: number; call: string; refusal: boolean }> => {
  const heads =
    /\bassert(?:\.(equal|strictEqual|deepEqual|deepStrictEqual|match|doesNotMatch|notEqual|ok|throws|rejects))?\s*\(|\.includes\s*\(/g;
  const found: Array<{ at: number; call: string; refusal: boolean }> = [];
  for (const m of clean.matchAll(heads)) {
    const open = clean.indexOf('(', m.index + m[0].length - 1);
    const call = callAt(clean, open);
    if (call !== undefined) found.push({ at: open, call, refusal: m[1] === 'throws' || m[1] === 'rejects' });
  }
  return found;
};

/** How long an expected value has to be to be a whole sentence rather than a word the behaviour turns on. */
export const SENTENCE = 60;

/**
 * What the code said, as this repository names it: the words of a refusal (`message`), what a process wrote (`stderr`), the reason a
 * verb gives (`why`, `cause`, `words`) and the refusal itself. Read of the assertion's subject with its literals blanked, so the
 * expected sentence cannot name itself. An assertion whose subject names none of these is asserting something other than what the
 * code said — a path, a page's heading, a brief the test wrote itself — and the rule is not about those.
 */
const SAID = /\b(?:message|stderr|refus\w*|why|words|cause|error\w*|Error|err)\b/;

/**
 * Every string and every pattern `text` holds as a literal, with where it begins: the three quotes and a regular expression. A
 * template holding a `${…}` is left out — what it expects is not a sentence this file fixes — and so is a class of a pattern
 * (`[^\n]`), which carries no sentence either.
 */
const LITERALS = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`|\/((?:[^/\\\n[]|\\.|\[[^\]\n]*\])+)\//g;

/**
 * The assertion `call`'s own expression, its literals blanked: what it is asserting *about*. Read without them because a sentence
 * that happens to hold the word `refused` would otherwise name itself as what the code said.
 */
const subjectOf = (call: string): string => call.replace(LITERALS, (found) => found.replace(/[^\n]/g, ' '));

/**
 * Where the second argument of the call `call` begins and ends: what an `assert.throws` or an `assert.rejects` expects of the error —
 * a pattern, a string, an object's `message`, a function that reads it, or a helper wrapping one (`refusedWith(/…/)`). Not the first,
 * which is what is run, nor the third, which is the assertion's own words. Read on the call with its literals blanked, so a comma or a
 * bracket inside a sentence divides nothing. `undefined` where the call has one argument.
 */
const secondArg = (call: string): { from: number; to: number } | undefined => {
  const blank = subjectOf(call);
  const commas: number[] = [];
  let depth = 0;
  for (let i = 0; i < blank.length; i++) {
    const c = blank[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 1) commas.push(i);
  }
  if (!commas.length) return undefined;
  return { from: commas[0] + 1, to: commas[1] ?? blank.length - 1 };
};

/**
 * Each line of `text` whose assertion over what the code said expects a whole sentence, by its line and the sentence's opening
 * words. An expected value counts when it is a literal of `SENTENCE` characters or more holding two spaces or more: an escape of a
 * line break, a tab or a space counts as the space it is, so a sentence a formatter broke across two lines of source is one
 * sentence here.
 *
 * One line, one entry: an `assert.deepEqual` of three sentences on one line is one line to unpin. So the count per file is the lines
 * that have to change, which is what makes the baseline's falling a measure of the work.
 */
export const pinnedWords = (text: string): string[] => {
  const clean = uncommented(text);
  const lineAt = (index: number) => clean.slice(0, index).split('\n').length;
  const found = new Map<number, string>();
  for (const { at, call, refusal } of assertions(clean)) {
    const expected = refusal ? secondArg(call) : SAID.test(subjectOf(call)) ? { from: 0, to: call.length } : undefined;
    if (!expected) continue;
    const scope = call.slice(expected.from, expected.to);
    for (const m of scope.matchAll(LITERALS)) {
      const body = m[1] ?? m[2] ?? m[3] ?? m[4];
      if (body === undefined) continue;
      const words = body.replace(/\\[nstr]/g, ' ');
      if (words.length < SENTENCE || (words.match(/ /g)?.length ?? 0) < 2) continue;
      const line = lineAt(at + expected.from + m.index);
      if (!found.has(line)) found.set(line, `${line}: a whole sentence expected of what the code said — ${body.slice(0, 60)}`);
    }
  }
  return [...found.keys()].sort((a, b) => a - b).map((line) => found.get(line) as string);
};

/**
 * The bounds in milliseconds `clean` imports from a module of a package's `src`: a name of capitals, digits and underscores whose
 * last two letters are those of a millisecond, which is how this repository names every shipped bound on a length of time. A bound
 * the test declares itself — `const SHORT_MS = 200` — is not one of them, and a floor at it is the rule's own answer rather than what
 * it refuses; so is a shipped constant that is no duration (`HEADER_BYTES`), which nothing waits for. Whether the bound is a second or
 * a tenth of one the text does not say, and the rule does not ask: a floor at a bound the shipped code owns is paid for by every pass
 * whatever its value, and the answer — shorten it at the code's own seam — is the same either way.
 */
const shippedBounds = (clean: string): string[] => {
  const names = new Set<string>();
  for (const m of clean.matchAll(/^[ \t]*import\s*(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]*)['"]/gm)) {
    if (!/(?:^|\/)src\//.test(m[2])) continue;
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && /^[A-Z][A-Z0-9_]*_MS$/.test(name)) names.add(name);
    }
  }
  return [...names];
};

/**
 * Each line of `text` that floors a measured duration at a bound the shipped code owns, by its line and the comparison's own words:
 * `assert.ok(waited >= FEED_LOCK_WAIT_MS)`, and the same with the bound on the left. Such a test cannot pass in less than the bound,
 * so the bound is what every pass pays for it.
 *
 * A ceiling is not it — `assert.ok(ms < SPAWN_WAIT_MS + 3_000)` says the pass went on without waiting, which is the rule's own
 * answer — nor is a floor against a bound the test itself declares, nor a wait on an event (`until`), nor a test marked `WAITED`,
 * which carries node's per-test timeout and measures no waiting at all.
 */
export const waitedOut = (text: string): string[] => {
  const clean = uncommented(text);
  const bounds = shippedBounds(clean);
  if (!bounds.length) return [];
  const lineAt = (index: number) => clean.slice(0, index).split('\n').length;
  const bound = `(?:${bounds.join('|')})`;
  const floor = new RegExp(String.raw`(?<![\w$.])([a-z]\w*)\s*>=\s*${bound}(?![\w$])|(?<![\w$.])${bound}\s*<=\s*([a-z]\w*)(?![\w$])`, 'g');
  const found = new Map<number, string>();
  for (const { at, call } of assertions(clean)) {
    for (const m of call.matchAll(floor)) {
      const line = lineAt(at + m.index);
      if (!found.has(line)) found.set(line, `${line}: a floor at a bound the shipped code owns — ${m[0].trim()}`);
    }
  }
  return [...found.keys()].sort((a, b) => a - b).map((line) => found.get(line) as string);
};

test('REFUSED: an assertion that expects a whole sentence of what the code said is found, however it is written', () => {
  const sentence = 'the `check` of a step that is a gate is refused: a gate has no check to run';
  assert.deepEqual(pinnedWords(`assert.equal(e.message, '${sentence}');\n`), [
    `1: a whole sentence expected of what the code said — ${sentence.slice(0, 60)}`,
  ]);
  assert.equal(pinnedWords(`assert.deepEqual(refusals, ['${sentence}']);\n`).length, 1, 'inside a deepEqual of a list');
  assert.equal(pinnedWords(`assert.match(e.message, /${sentence.replace(/[`:]/g, '')}/);\n`).length, 1, 'as a pattern');
  assert.equal(pinnedWords(`assert.ok(error.message.includes('${sentence}'), error.message);\n`).length, 1, 'through includes');
  assert.equal(pinnedWords(`assert.equal(words, \`${sentence}\`);\n`).length, 1, 'in a template with nothing interpolated');
  assert.deepEqual(
    pinnedWords(`assert.equal(\n  e.message,\n  '${sentence}',\n);\n`),
    [`3: a whole sentence expected of what the code said — ${sentence.slice(0, 60)}`],
    'an assertion the formatter laid over four lines, found at the line the sentence is on',
  );
  assert.deepEqual(
    pinnedWords(`assert.equal(e.message, '${sentence}' + ' and nothing was written at all here');\n`).length,
    1,
    'two sentences on one line is one line to unpin',
  );

  assert.deepEqual(
    pinnedWords(`assert.throws(() => load(dir), /${sentence.replace(/[`:]/g, '')}/);\nassert.rejects(p, { message: '${sentence}' });\n`)
      .length,
    2,
    'a refusal expected by assert.throws or assert.rejects, whose subject is the error by construction',
  );
  assert.deepEqual(
    pinnedWords(`assert.throws(() => run('${sentence}'), { _tag: 'StepRefused' }, '${sentence}');\n`),
    [],
    'what the throws runs, and its own words, are not what it expects of the error',
  );

  assert.deepEqual(pinnedWords(`assert.equal(e._tag, 'StepRefused');\nassert.equal(code, 2);\n`), [], 'the kind and the exit code');
  assert.deepEqual(pinnedWords(`assert.match(e.message, /is a gate/);\n`), [], 'a few words the behaviour turns on');
  assert.deepEqual(pinnedWords(`assert.equal(page.heading, '${sentence}');\n`), [], 'a sentence that is not what the code said');
  assert.deepEqual(
    pinnedWords(`assert.equal(e.message, \`refused: \${why} is no step of ${sentence}\`);\n`),
    [],
    'a template that interpolates expects no fixed sentence',
  );
  assert.deepEqual(pinnedWords(`/** assert.equal(e.message, '${sentence}'); */\n`), [], 'and one quoted in a comment');
  assert.equal(
    pinnedWords(`const glob = 'src/*.ts';\nconst at = 'https://example.com/a'; assert.equal(e.message, '${sentence}');\n`).length,
    1,
    'a // in a string or a /* in a glob is no comment, and blanks nothing after it',
  );
});

test('REFUSED: a floor at a bound the shipped code owns is found; a ceiling, a local bound and a wait on an event are not', () => {
  const importing = "import { FEED_LOCK_WAIT_MS, HEADER_BYTES } from '../src/core/engine/feed.ts';\n";
  assert.deepEqual(pinnedWords(importing), [], 'the import pins no sentence');
  assert.deepEqual(waitedOut(`${importing}assert.ok(waited >= FEED_LOCK_WAIT_MS, \`waited \${waited} ms\`);\n`), [
    '2: a floor at a bound the shipped code owns — waited >= FEED_LOCK_WAIT_MS',
  ]);
  assert.deepEqual(
    waitedOut(`${importing}assert.ok(FEED_LOCK_WAIT_MS <= waited);\n`),
    ['2: a floor at a bound the shipped code owns — FEED_LOCK_WAIT_MS <= waited'],
    'the bound on the left is the same floor',
  );
  assert.deepEqual(
    waitedOut(`${importing}assert.ok(\n  ms >= FEED_LOCK_WAIT_MS,\n  'the bound',\n);\n`),
    ['3: a floor at a bound the shipped code owns — ms >= FEED_LOCK_WAIT_MS'],
    'laid over several lines',
  );

  assert.deepEqual(
    waitedOut(`${importing}assert.ok(ms < FEED_LOCK_WAIT_MS + 3_000, \`\${ms} ms\`);\n`),
    [],
    'a ceiling says the pass went on without waiting',
  );
  assert.deepEqual(
    waitedOut(`${importing}const SHORT_MS = 200;\nassert.ok(waited >= SHORT_MS);\n`),
    [],
    'a floor at a bound the test shortened is the rule’s own answer',
  );
  assert.deepEqual(waitedOut(`${importing}await until(t, () => box.lines.length >= 1, 'the words');\n`), [], 'a wait on an event');
  assert.deepEqual(
    waitedOut("import { until, WAITED } from '../src/waits/index.ts';\ntest('a slow one', WAITED, async () => {});\n"),
    [],
    'WAITED carries node’s per-test timeout and measures no waiting',
  );
  assert.deepEqual(
    waitedOut(`${importing}assert.ok(bytes >= HEADER_BYTES);\n`),
    [],
    'a shipped constant that is no duration is no bound anything waits for',
  );
  assert.deepEqual(waitedOut(`/** assert.ok(waited >= FEED_LOCK_WAIT_MS); */\n`), [], 'one quoted in a comment');
});

/**
 * What `held` owes against `owed`, in words saying what to do: a file the baseline does not name, a count that has grown, a count
 * that was lowered while the lines are still there, and an entry whose lines are gone. `fix` is what a file that still holds some is
 * told to do about it.
 */
export const owingOf = (held: Readonly<Record<string, number>>, owed: Readonly<Record<string, number>>, fix: string): string[] => {
  const refused: string[] = [];
  for (const [file, count] of Object.entries(held)) {
    const due = owed[file];
    if (due === undefined) refused.push(`${file} holds ${count}, and the baseline names none: ${fix}`);
    else if (count > due) refused.push(`${file} holds ${count} where the baseline names ${due}: ${fix} — the baseline only shrinks`);
    else if (count < due) refused.push(`${file} holds ${count} where the baseline names ${due}: lower the count to ${count}`);
  }
  for (const file of Object.keys(owed)) {
    if (held[file] === undefined) refused.push(`${file} holds none any more: take its line out of the baseline, which only shrinks`);
  }
  return refused;
};

test('REFUSED: the baseline cannot grow, cannot be lowered while the lines are there, and keeps no stale entry', () => {
  const fix = 'unpin it';
  assert.deepEqual(owingOf({ 'a.test.ts': 2 }, { 'a.test.ts': 2 }, fix), [], 'what the baseline names, exactly, is owed and no more');
  assert.deepEqual(owingOf({ 'a.test.ts': 2, 'b.test.ts': 1 }, { 'a.test.ts': 2 }, fix), [
    'b.test.ts holds 1, and the baseline names none: unpin it',
  ]);
  assert.deepEqual(
    owingOf({ 'a.test.ts': 3 }, { 'a.test.ts': 2 }, fix),
    ['a.test.ts holds 3 where the baseline names 2: unpin it — the baseline only shrinks'],
    'a count grown — a new assertion, or a number lowered while the lines are still there — is the same refusal',
  );
  assert.deepEqual(
    owingOf({ 'a.test.ts': 1 }, { 'a.test.ts': 2 }, fix),
    ['a.test.ts holds 1 where the baseline names 2: lower the count to 1'],
    'and a baseline that names more than are there is refused too, so a cut is recorded as the diff of both files',
  );
  assert.deepEqual(owingOf({}, { 'a.test.ts': 1 }, fix), [
    'a.test.ts holds none any more: take its line out of the baseline, which only shrinks',
  ]);
});

/** What each test file of the repository holds under `rule`, by its path from the root, the files that hold none left out. */
const sweep = (files: readonly string[], rule: (text: string) => string[]): Record<string, number> => {
  const held: Record<string, number> = {};
  for (const file of files) {
    const lines = rule(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (lines.length) held[file] = lines.length;
  }
  return held;
};

test('no test of the repository pins a sentence of what the code said but those the baseline names, with the count it names', () => {
  const files = testFiles();
  assert.ok(files.length > 200, 'the sweep reads the repository’s test files');
  const held = sweep(files, pinnedWords);
  assert.ok(Object.keys(held).length > 0, 'and reads their sources: the debt is not empty yet');
  assert.deepEqual(
    owingOf(
      held,
      PINNED_WORDS,
      'assert the fact, its kind and the exit code, never the sentence (`.claude/skills/implement-a-change/SKILL.md`, step 2)',
    ),
    [],
  );
});

test('no test of the repository floors a measured duration at a bound the shipped code owns', () => {
  const files = testFiles();
  assert.ok(files.length > 200, 'the sweep reads the repository’s test files');
  assert.deepEqual(
    owingOf(
      sweep(files, waitedOut),
      WAITED_OUT,
      'shorten the bound at the seam the code gives for it and measure the floor there (`.claude/skills/implement-a-change/SKILL.md`, step 2)',
    ),
    [],
  );
});

test('every file either baseline names is a test file of the repository', () => {
  const files = testFiles();
  for (const file of [...Object.keys(PINNED_WORDS), ...Object.keys(WAITED_OUT)]) {
    assert.ok(files.includes(file), `${file} is no test file of the repository: take its line out of the baseline`);
  }
});
