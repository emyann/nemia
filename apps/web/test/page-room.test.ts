/**
 * A page lays out by the column it is given, never by the window. The frame's `<main data-frame-page>` (`src/routes/__root.tsx`) is the
 * named inline-size container `@container/page`, and beside Nemia's docked sheet that column is narrower than the window: a page or a
 * part that picks its layout by a window breakpoint (`sm:`, `md:`, `lg:`, `xl:`, `2xl:` and their `max-` forms) lays out for room it
 * does not have. So `judge` refuses every window breakpoint in `src` outside the vendored folders (`components/ui/`,
 * `components/ai-elements/`), naming the container variant to write instead (`MAPPING`), but those `KEPT` with their reason; a kept
 * entry whose token has left its file is refused as stale. And the column is one container: `@container/page` is written once, on the
 * frame's main.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEB = path.join(import.meta.dirname, '..');
const SRC = path.join(WEB, 'src');

/** The vendored folders, kept as shipped: their own window variants are the vendor's. */
const VENDORED = ['src/components/ui/', 'src/components/ai-elements/'];

/** The frame, whose main is the page column. */
const FRAME = 'src/routes/__root.tsx';

/**
 * Each window breakpoint and the container variant that keeps a page's layout beside an open rail: the window's step less the kit's
 * widest open rail (16rem), but `sm`, which is 28rem so that a phone stays out. Tailwind 4.3 writes no rule for a named `@max-` variant
 * (`@max-lg/page:px-3` builds to nothing), so a `max-` breakpoint is written as its complement: the narrow value bare, the wide one
 * under the container variant of the same step.
 */
const MAPPING: Record<string, string> = { sm: '@md/page', md: '@lg/page', lg: '@3xl/page', xl: '@5xl/page', '2xl': '@7xl/page' };

/** What to write in place of `token`, a window breakpoint. */
function insteadOf(token: string) {
  const bp = breakpointOf(token);
  if (!bp.startsWith('max-')) return `write it as '${token.replace(`${bp}:`, `${MAPPING[bp]}:`)}' (the page column)`;
  const step = MAPPING[bp.slice('max-'.length)];
  return `write its value bare and the wider one under '${step}:' (Tailwind writes no named '@max-' variant)`;
}

/** A window breakpoint kept, by its file (from `apps/web`) and its whole class token, with why the window is right there. */
interface Kept {
  readonly file: string;
  readonly token: string;
  readonly why: string;
}

const HEAD = "The page's head: it holds the menu button and her face exactly where the frame is modal, a window's breakpoint (w9y8).";

const FOOT = 'The machine bar: it stands across the whole window, under the rail, the pane, the page column and the sheet alike.';

const KEPT: readonly Kept[] = [
  { file: 'src/components/frame/FrameHeader.tsx', token: 'max-md:px-3', why: HEAD },
  { file: 'src/components/frame/MachineBar.tsx', token: 'max-md:hidden', why: FOOT },
  {
    file: 'src/components/step/DebugPanel.tsx',
    token: 'sm:w-screen',
    why: "A sheet portaled over the window, out of the page column: its width is the window's.",
  },
  {
    file: 'src/components/view/ViewerSheet.tsx',
    token: 'sm:w-3xl',
    why: "A sheet portaled over the window, out of the page column: its width is the window's.",
  },
];

/**
 * The window breakpoints a text holds, each as its whole class token: a breakpoint begins a token or follows another variant (`hover:`,
 * `data-[side=right]:`), and is followed by its utility with no space (`md: 'markdown'` is a key, not a class).
 */
function windowTokens(text: string) {
  const found: string[] = [];
  const token = /[^\s"'`{}]+/g;
  for (const [whole] of text.matchAll(token)) {
    if (/(?:^|:)(?:max-)?(?:sm|md|lg|xl|2xl):\S/.test(whole)) found.push(whole);
  }
  return found;
}

/** The breakpoint a token names, its `max-` kept, to say the variant that replaces it. */
const breakpointOf = (token: string) => /(?:^|:)((?:max-)?(?:2xl|sm|md|lg|xl)):/.exec(token)?.[1] ?? '';

/** A centred column a file keeps, by its file (from `apps/web`), with why it is not the frame grid's. */
interface KeptColumn {
  readonly file: string;
  readonly why: string;
}

const KEPT_COLUMNS: readonly KeptColumn[] = [
  {
    file: 'src/components/step/StepPage.tsx',
    why: "A conversation's measure in a page that fills the window by height: its centred 48rem column is the step page's own.",
  },
];

/** The class strings of a text that centre a column by hand: `mx-auto` beside a `max-w-*` in one string. */
function centred(text: string) {
  return [...text.matchAll(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g)]
    .map(([whole]) => whole)
    .filter((whole) => /(?:^|[\s"'`])mx-auto(?:[\s"'`])/.test(whole) && /(?:^|[\s"'`:])max-w-\S/.test(whole));
}

/** What the rule refuses in the files given (path from `apps/web` to text): one line each, saying what to write instead. */
function judge(files: ReadonlyMap<string, string>, kept: readonly Kept[], columns: readonly KeptColumn[] = []) {
  const refused: string[] = [];
  for (const [file, text] of files) {
    for (const token of windowTokens(text)) {
      if (kept.some((k) => k.file === file && k.token === token)) continue;
      refused.push(
        `${file}: '${token}' lays out by the window; ${insteadOf(token)}, or add it to KEPT in apps/web/test/page-room.test.ts with why the window is right there`,
      );
    }
    if (file !== 'src/components/frame/FrameGrid.tsx' && !columns.some((c) => c.file === file)) {
      for (const string of centred(text)) {
        refused.push(
          `${file}: ${string} centres a column of its own; take the frame's grid, set the route's staticData.frame ('wide', 'reading' or 'bleed') and use FrameGrid, or add the file to KEPT_COLUMNS in apps/web/test/page-room.test.ts with why`,
        );
      }
    }
    if (file !== FRAME && !file.endsWith('.stories.tsx') && text.includes('@container/page')) {
      refused.push(`${file}: '@container/page' is the frame's main alone (${FRAME}); query it with '@<size>/page:' instead`);
    }
  }
  for (const k of kept) {
    if (!windowTokens(files.get(k.file) ?? '').includes(k.token)) {
      refused.push(`${k.file}: KEPT names '${k.token}', which the file no longer holds; take the entry out of KEPT`);
    }
  }
  for (const c of columns) {
    if (centred(files.get(c.file) ?? '').length === 0)
      refused.push(`${c.file}: KEPT_COLUMNS names it, which no longer centres a column; take the entry out`);
  }
  const frame = files.get(FRAME) ?? '';
  if (!/<main\s+data-frame-page\s+className="[^"]*@container\/page[\s"]/.test(frame)) {
    refused.push(`${FRAME}: the frame's <main data-frame-page> is not '@container/page'; add it to its className`);
  }
  return refused;
}

/** Every `.ts` and `.tsx` of `src` outside the vendored folders, by its path from `apps/web`. */
function sources() {
  const files = new Map<string, string>();
  for (const entry of fs.readdirSync(SRC, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = path.relative(WEB, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (VENDORED.some((v) => file.startsWith(v))) continue;
    files.set(file, fs.readFileSync(path.join(WEB, file), 'utf8'));
  }
  return files;
}

test('no page or part of the board lays out by the window but those kept, and the page column is one container', () => {
  const files = sources();
  assert.ok(files.has(FRAME), `${FRAME} is read`);
  assert.deepEqual(judge(files, KEPT, KEPT_COLUMNS), []);
});

test('every kept window breakpoint and column says why', () => {
  for (const k of [...KEPT, ...KEPT_COLUMNS]) assert.ok(k.why.length > 20, k.file);
});

test('the scanner finds a window breakpoint as a class token and nothing that only looks like one', () => {
  const found = ['grid lg:grid-cols-2', 'max-md:px-3', '`${FIELD} sm:max-w-xs`', 'data-[side=right]:sm:max-w-none', 'hover:md:flex'];
  for (const text of found) assert.equal(windowTokens(text).length, 1, text);
  const not = ['@3xl/page:grid-cols-2', '@lg/page:px-6', "md: 'markdown'", '{ sm: 1 }', 'rounded-md', 'text-sm', '@4xl:block'];
  for (const text of not) assert.deepEqual(windowTokens(text).length, 0, text);
});

const FRAME_OK = '<main data-frame-page className="relative flex @container/page">';

test('REFUSED: a window breakpoint in a page', () => {
  const files = new Map([
    [FRAME, FRAME_OK],
    ['src/routes/x.tsx', '<div className="grid lg:grid-cols-2" />'],
  ]);
  const refused = judge(files, []);
  assert.equal(refused.length, 1);
  assert.match(refused[0] ?? '', /@3xl\/page:grid-cols-2/);
});

test('REFUSED: a kept entry whose token has left its file', () => {
  const files = new Map([[FRAME, FRAME_OK]]);
  assert.equal(judge(files, [{ file: FRAME, token: 'md:flex', why: 'a planted entry' }]).length, 1);
});

test('REFUSED: a second page container outside the frame', () => {
  const files = new Map([
    [FRAME, FRAME_OK],
    ['src/routes/x.tsx', '<div className="@container/page" />'],
  ]);
  assert.equal(judge(files, []).length, 1);
});

test("REFUSED: the frame's main that is no container", () => {
  assert.equal(judge(new Map([[FRAME, '<main data-frame-page className="relative flex">']]), []).length, 1);
});

test('REFUSED: a page that centres a column of its own, and a kept column that no longer does', () => {
  const page = (text: string) =>
    new Map([
      [FRAME, FRAME_OK],
      ['src/routes/x.tsx', text],
    ]);
  assert.equal(judge(page('<article className="mx-auto flex max-w-3xl">'), []).length, 1);
  assert.deepEqual(judge(page('<article className="flex max-w-xs">'), []), []);
  assert.deepEqual(judge(page('<article className="mx-auto flex">'), []), []);
  assert.deepEqual(judge(page('<article className="mx-auto flex max-w-3xl">'), [], [{ file: 'src/routes/x.tsx', why: 'planted' }]), []);
  assert.equal(judge(page('<article className="flex">'), [], [{ file: 'src/routes/x.tsx', why: 'planted' }]).length, 1);
});
