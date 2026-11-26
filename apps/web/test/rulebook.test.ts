/**
 * The rules of `DESIGN.md` the pages do not yet obey, each held to its list of the baseline (`test/baseline/<list>/`, `baseline.ts`),
 * which only shrinks: a file of the board's `src` outside the vendored kit that breaks one and is not listed is refused, and so is a
 * listed entry it no longer breaks. An entry is `<path from the workspace root>#<the word found>`, once a file.
 *
 * - `accentRole`: the board's own parts write no accent role of the kit's (*The names the board writes*): `primary`, `secondary`,
 *   `tertiary`, each with its `on-`, its container and its fixed roles, and `inverse-primary`, as a colour utility or a variable.
 *   Selection is written on `secondary-container` under `on-secondary-container` (*Ink and the one action*), which are spared.
 * - `money`: money is no meaning (*The four meanings*): no class or variable of it.
 * - `rawType`: text is set through the kit's five primitives, never a raw type class (*How text is written*): `text-body-small`. A
 *   size a primitive steps to at a breakpoint is spared, written as the kit's `Typography.tsx` says, its type class beside its family
 *   under one variant (`@lg/page:text-display-small @lg/page:font-display-small`). On the four most-read pages it has no list: no file
 *   of their own view holds one (`READ_PAGES`, `OVER`).
 * - `kitSurface`: `surface`, `surface-dim`, `surface-bright`, `surface-variant` and `surface-tint` are the kit's, and the board's
 *   parts write none of them (*Neutrals: the surface ladder*); its list is kept empty, as money's is.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';
import { heldTo } from './held.ts';
import { ours } from './ours.ts';
import { reached } from './reach.ts';

/** The rulebook's lists of the baseline. */
type Rule = 'accentRole' | 'money' | 'rawType' | 'kitSurface';

/** The board's folder, from the workspace root. */
const BOARD = 'apps/web/';

/** The Tailwind utilities that take a colour, a side or an offset included. */
const UTILITIES =
  '(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|inset-ring|divide|fill|stroke|from|via|to|decoration|caret|placeholder|(?:inset-|drop-)?shadow|accent)';

/** A colour role written as a utility, as Tailwind's variable or as the theme's own, in group 1 the role. */
const roleWritten = (roles: string) => new RegExp(`(?<![\\w-])(?:${UTILITIES}-|--color-|--md-sys-color-)(${roles})(?![\\w-])`, 'g');

/** The kit's accent roles: each accent's own, its `on-`, its container and its fixed roles, and the inverse primary. */
const ACCENT = '(?:on-)?(?:primary|secondary|tertiary)(?:-container|-fixed(?:-dim|-variant)?)?|inverse-primary';

/** What each rule finds in a file's text: the words that break it, by the group a match keys. */
const FINDERS: Record<Rule, { pattern: RegExp; spared?: (word: string) => boolean; stepped?: boolean }> = {
  accentRole: {
    pattern: roleWritten(ACCENT),
    spared: (role) => role === 'secondary-container' || role === 'on-secondary-container',
  },
  money: { pattern: /(?<![\w-])([a-z-]*[a-z]-(?:on-)?money(?:-container)?)(?![\w-])/g },
  rawType: { pattern: /(?<![\w-])(text-(?:display|headline|title|body|label)-(?:large|medium|small))(?![\w-])/g, stepped: true },
  kitSurface: { pattern: roleWritten('surface(?:-dim|-bright|-variant|-tint)?') },
};

/** A type role's class under a variant, in group 1 the variant, in group 2 the role and its size. */
const STEP = /(?<![\w-])((?:[\w@/-]+:)+)text-((?:display|headline|title|body|label)-(?:large|medium|small))(?![\w-])/g;

/**
 * `text` without each step of a primitive's size at a breakpoint: a type class under a variant whose family is written under the
 * same variant beside it, as the kit's `Typography.tsx` asks.
 * @param text A file's text.
 */
const withoutSteps = (text: string) =>
  text.replace(STEP, (whole, variant: string, role: string) => (text.includes(`${variant}font-${role}`) ? '' : whole));

/**
 * The words of `text` that break `rule`, each once, in a stable order.
 * @param rule The rule read.
 * @param text A file's text.
 */
export function brokenIn(rule: Rule, text: string) {
  const { pattern, spared, stepped } = FINDERS[rule];
  const read = stepped ? withoutSteps(text) : text;
  const words = [...read.matchAll(pattern)].map((m) => m[1]).filter((word) => !spared?.(word));
  return [...new Set(words)].sort();
}

/**
 * Every entry of `rule` under a board's `src` outside the vendored kit, as `<path from the workspace root>#<word>`.
 * @param root The board's folder, the real one or a scratch copy.
 * @param rule The rule read.
 */
export function entriesOf(root: string, rule: Rule) {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter(ours)
    .sort()
    .flatMap((file) => brokenIn(rule, fs.readFileSync(path.join(root, file), 'utf8')).map((word) => `${BOARD}${file}#${word}`));
}

/** What a part writes in place of each rule's word. */
const INSTEAD: Record<Rule, string> = {
  accentRole: "write a meaning, a neutral role or the kit's part that draws the accent itself (its filled button, its selection)",
  money: 'draw a cost in ink on the Control rung; over its budget it is failure, a spend that needs a word is yours',
  rawType: "set the text through the kit's primitive: <Body size=…>, <Label size=…>, <Title size=…>",
  kitSurface: "take the ladder's rung: background, or a surface-container role",
};

/** The routes of the four most-read pages, the runs page, a run's page, the inbox and the overview, with their factory twins. */
export const READ_PAGES = [
  'runs.index',
  'runs.$runId',
  'inbox',
  'index',
  'factories.$factory_.runs.index',
  'factories.$factory_.runs.$runId',
  'factories.$factory_.inbox',
].map((route) => `${BOARD}src/routes/${route}.tsx`);

/**
 * Where the walk of a page's own view stops, each file with why: it opens a view of its own over the page, a dialog, a popover or a
 * sheet, whose text is a later card's (`DESIGN.md`, *Ink and the one action*: a dialog is a view of its own).
 */
export const OVER: Readonly<Record<string, string>> = {
  [`${BOARD}src/components/run/RunMenu.tsx`]: 'its menu opens the questions that remove, hold, lift and prune a run, each in a popover',
  [`${BOARD}src/components/run/ApproveModal.tsx`]: "it opens a step's part at M in a modal over the runs page, read once it opens",
};

/** A file whose text a page draws: under the board's components or routes, outside the vendored ones. */
const drawsText = (file: string) =>
  /^apps\/web\/src\/(components|routes)\/.+\.(ts|tsx|css)$/.test(file) && !/^apps\/web\/src\/components\/(ui|ai-elements)\//.test(file);

/**
 * Every raw type class in the own view of the pages `routes` draw, as `<path from the workspace root>#<word>`: each file their imports
 * reach, followed but through a file of `over`, which opens a view of its own, that draws text.
 * @param root The workspace root, the real one or a scratch copy.
 * @param routes The route files of the pages, from the workspace root.
 * @param over The files the walk does not follow into, from the workspace root.
 */
export function rawTypeInView(root: string, routes: readonly string[], over: readonly string[]) {
  return reached(root, routes, new Set(over))
    .filter(drawsText)
    .sort()
    .flatMap((file) => brokenIn('rawType', fs.readFileSync(path.join(root, file), 'utf8')).map((word) => `${file}#${word}`));
}

test('REFUSED: each rule finds its word where it is written, under any variant or alpha, once a file; what the rulebook allows is spared', () => {
  const root = scratch('rulebook-');
  const planted: Record<string, string> = {
    'src/x.tsx': [
      'const a = "hover:bg-primary/40 text-on-primary var(--md-sys-color-secondary) ring-tertiary-container";',
      'const b = "text-on-money-container bg-money text-body-small md:text-label-large bg-surface-variant md:font-label-small";',
      'const c = "bg-primary";',
    ].join('\n'),
    'src/styles.css': ':root { --color-money: var(--meaning-money); background: var(--md-sys-color-surface-dim); }\n',
    'src/clean.tsx': [
      'const d = "bg-secondary-container text-on-secondary-container bg-surface-container-highest text-on-surface";',
      'const e = "text-on-surface-variant bg-yours border-outline-variant bg-background font-mono text-[13px]";',
      'const g = "@lg/page:text-display-small @lg/page:font-display-small";',
      '// the primary key, a surface, money and the body of a text are words',
    ].join('\n'),
    'src/components/ui/ds/y.tsx': 'const f = "bg-primary bg-money text-body-small bg-surface-variant";\n',
  };
  for (const [file, text] of Object.entries(planted)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  assert.deepEqual(entriesOf(root, 'accentRole'), [
    'apps/web/src/x.tsx#on-primary',
    'apps/web/src/x.tsx#primary',
    'apps/web/src/x.tsx#secondary',
    'apps/web/src/x.tsx#tertiary-container',
  ]);
  assert.deepEqual(entriesOf(root, 'money'), [
    'apps/web/src/styles.css#--color-money',
    'apps/web/src/styles.css#--meaning-money',
    'apps/web/src/x.tsx#bg-money',
    'apps/web/src/x.tsx#text-on-money-container',
  ]);
  assert.deepEqual(entriesOf(root, 'rawType'), ['apps/web/src/x.tsx#text-body-small', 'apps/web/src/x.tsx#text-label-large']);
  assert.deepEqual(entriesOf(root, 'kitSurface'), ['apps/web/src/styles.css#surface-dim', 'apps/web/src/x.tsx#surface-variant']);
});

for (const rule of Object.keys(FINDERS) as Rule[])
  test(`the board's src holds the rule of ${rule} to its list, which only shrinks`, () => {
    heldTo(entriesOf(path.join(REPO, BOARD), rule), rule, INSTEAD[rule]);
  });

test("REFUSED: a raw type class in a file of a read page's own view, listed or not; one reached only through a view over it is spared", () => {
  const root = scratch('rulebook-view-');
  const planted: Record<string, string> = {
    'apps/web/src/routes/runs.index.tsx': "import { A } from '../components/run/A';\n",
    'apps/web/src/components/run/A.tsx':
      "import { B } from './B';\nimport { Menu } from './Menu';\nimport { C } from '@/components/ui/C';\n",
    'apps/web/src/components/run/B.tsx': 'const b = "text-body-small";\n',
    'apps/web/src/components/run/Menu.tsx': "import { D } from './D';\nconst m = 'text-label-large';\n",
    'apps/web/src/components/run/D.tsx': 'const d = "text-body-medium";\n',
    'apps/web/src/components/ui/C.tsx': 'const c = "text-body-large";\n',
    'apps/web/src/components/run/Far.tsx': 'const f = "text-title-small";\n',
  };
  for (const [file, text] of Object.entries(planted)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  const route = ['apps/web/src/routes/runs.index.tsx'];
  assert.deepEqual(rawTypeInView(root, route, ['apps/web/src/components/run/Menu.tsx']), [
    'apps/web/src/components/run/B.tsx#text-body-small',
    'apps/web/src/components/run/Menu.tsx#text-label-large',
  ]);
  assert.equal(rawTypeInView(root, route, []).length, 3, 'with no stop, the walk follows the menu into what it opens');
});

test('the own view of the four most-read pages holds no raw type class, listed or not', () => {
  assert.deepEqual(
    rawTypeInView(REPO, READ_PAGES, Object.keys(OVER)),
    [],
    "set each text through the kit's primitive (<Body size=…>, <Label size=…>), and cut the file's rawType list",
  );
});
