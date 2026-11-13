/**
 * A page lays out by the column it is given, never by the window. The frame's `<main data-frame-page>` (`src/routes/__root.tsx`) is the
 * named inline-size container `@container/page`, and beside Nemia's docked sheet that column is narrower than the window: a page or a
 * part that picks its layout by a window breakpoint (`sm:`, `md:`, `lg:`, `xl:`, `2xl:` and their `max-` forms) lays out for room it
 * does not have. So `judge` refuses every window breakpoint in `src` outside the vendored folders (`components/ui/`,
 * `components/ai-elements/`), naming the container variant to write instead (`MAPPING`), but those `KEPT` with their reason; a kept
 * entry whose token has left its file is refused as stale. And the column is one container: `@container/page` is written once, on the
 * frame's main.
 */
import { test } from 'node:test';
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
function insteadOf(token: string): string {
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

const BAR = "The frame's top bar: it stands over the page column and the sheet alike, and landed with its own window layout (w9y8).";

const KEPT: readonly Kept[] = [
  { file: 'src/components/frame/FrameHeader.tsx', token: 'max-md:px-3', why: BAR },
  { file: 'src/components/frame/FrameHeader.tsx', token: 'max-md:flex-1', why: BAR },
  { file: 'src/components/frame/FrameHeader.tsx', token: 'md:shrink-0', why: BAR },
  { file: 'src/components/frame/FrameHeader.tsx', token: 'max-md:hidden', why: BAR },
  { file: 'src/components/factory/FactoryPicker.tsx', token: 'max-md:w-full', why: BAR },
  {
    file: 'src/components/step/DebugPanel.tsx',
    token: 'data-[side=right]:sm:max-w-none',
    why: "A sheet portaled over the window, out of the page column: its width is the window's.",
  },
  {
    file: 'src/components/agent/SkillPicker.tsx',
    token: 'data-[side=right]:sm:max-w-xl',
    why: "A sheet portaled over the window, out of the page column: its width is the window's.",
  },
  {
    file: 'src/components/agent/AgentForm.tsx',
    token: 'md:text-body-small',
    why: "Overrides the vendored field's own `md:` type size, which is the window's: a container variant would not outweigh it.",
  },
];

/**
 * The window breakpoints a text holds, each as its whole class token: a breakpoint begins a token or follows another variant (`hover:`,
 * `data-[side=right]:`), and is followed by its utility with no space (`md: 'markdown'` is a key, not a class).
 */
function windowTokens(text: string): string[] {
  const found: string[] = [];
  const token = /[^\s"'`{}]+/g;
  for (const [whole] of text.matchAll(token)) {
    if (/(?:^|:)(?:max-)?(?:sm|md|lg|xl|2xl):\S/.test(whole)) found.push(whole);
  }
  return found;
}

/** The breakpoint a token names, its `max-` kept, to say the variant that replaces it. */
const breakpointOf = (token: string): string => /(?:^|:)((?:max-)?(?:2xl|sm|md|lg|xl)):/.exec(token)?.[1] ?? '';

/** What the rule refuses in the files given (path from `apps/web` to text): one line each, saying what to write instead. */
function judge(files: ReadonlyMap<string, string>, kept: readonly Kept[]): string[] {
  const refused: string[] = [];
  for (const [file, text] of files) {
    for (const token of windowTokens(text)) {
      if (kept.some((k) => k.file === file && k.token === token)) continue;
      refused.push(
        `${file}: '${token}' lays out by the window; ${insteadOf(token)}, or add it to KEPT in apps/web/test/page-room.test.ts with why the window is right there`,
      );
    }
    if (file !== FRAME && text.includes('@container/page')) {
      refused.push(`${file}: '@container/page' is the frame's main alone (${FRAME}); query it with '@<size>/page:' instead`);
    }
  }
  for (const k of kept) {
    if (!windowTokens(files.get(k.file) ?? '').includes(k.token)) {
      refused.push(`${k.file}: KEPT names '${k.token}', which the file no longer holds; take the entry out of KEPT`);
    }
  }
  const frame = files.get(FRAME) ?? '';
  if (!/<main\s+data-frame-page\s+className="[^"]*@container\/page[\s"]/.test(frame)) {
    refused.push(`${FRAME}: the frame's <main data-frame-page> is not '@container/page'; add it to its className`);
  }
  return refused;
}

/** Every `.ts` and `.tsx` of `src` outside the vendored folders, by its path from `apps/web`. */
function sources(): Map<string, string> {
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
  assert.deepEqual(judge(files, KEPT), []);
});

test('every kept window breakpoint says why', () => {
  for (const k of KEPT) assert.ok(k.why.length > 20, `${k.file} ${k.token}`);
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
