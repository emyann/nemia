/**
 * Every icon button of the board names its colour style: the kit's `IconButton` that names none is filled (Material's default, since
 * the kit's 0.4.0), and the board's draw as `standard`. So an `<IconButton` in `src` outside the vendored kit writes `variant=`, and the
 * part is never imported under another name, which this reading would not follow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The one folder of `src` the rule does not read, from the board's root. */
const KIT = 'src/components/ui/ds';

const OPENING = /<IconButton(?![\w$])/g;

const RENAMED = /\bIconButton\s+as\s+[\w$]+/;

/** The text of the opening tag that starts at `from`, up to its closing `>` outside every brace and quote. */
function tagAt(text: string, from: number): string {
  let depth = 0;
  let quote = '';
  for (let i = from + 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return text.slice(from, i + 1);
  }
  return text.slice(from);
}

/** Where `text` first draws an icon button with no colour style, or imports one renamed, as `line:column` and why; or null. */
export function unstyledAt(text: string): string | null {
  const where = (index: number, why: string) => {
    const before = text.slice(0, index).split('\n');
    return `${before.length}:${before.at(-1)!.length + 1} (${why})`;
  };
  const renamed = RENAMED.exec(text);
  if (renamed) return where(renamed.index, 'renamed');
  for (const m of text.matchAll(OPENING)) {
    if (!/\svariant=/.test(tagAt(text, m.index))) return where(m.index, 'no variant');
  }
  return null;
}

/** Every file of `root`'s `src` outside the kit that draws an icon button with no colour style, as its path from `root` and where. */
export function unstyledIn(root: string): string[] {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(`${KIT}/`))
    .sort()
    .flatMap((file) => {
      const at = unstyledAt(fs.readFileSync(path.join(root, file), 'utf8'));
      return at ? [`${file}:${at}`] : [];
    });
}

test('REFUSED: an icon button with no colour style, over several lines or past an arrow in a prop, and one imported renamed', () => {
  assert.equal(unstyledAt('ok\n  <IconButton size="xsmall" icon={X} />'), '2:3 (no variant)');
  assert.equal(unstyledAt('<IconButton\n  onPress={() => go(a > b)}\n  icon={X}\n>\n</IconButton>\n'), '1:1 (no variant)');
  assert.equal(unstyledAt('<IconButton onPress={() => go()} icon={X}>{"variant="}</IconButton>'), '1:1 (no variant)');
  assert.equal(unstyledAt('<IconButton variant="standard" icon={X} />\n<IconButton icon={Y} />'), '2:1 (no variant)');
  assert.equal(unstyledAt("import { IconButton as Copy } from '@/components/ui/ds';"), '1:10 (renamed)');
  for (const allowed of [
    '<IconButton size="xsmall" variant="standard" icon={X} />',
    '<IconButton\n  onPress={() => go(a > b)}\n  variant="standard"\n/>',
    '<IconButton variant={style} icon={X} />',
    '<IconButtonGroup icon={X} />',
    "import { IconButton } from '@/components/ui/ds';",
  ])
    assert.equal(unstyledAt(allowed), null, allowed);
});

test('REFUSED: an icon button with no colour style in any file of src; the vendored kit alone stays out', () => {
  const root = scratch('icon-button-');
  for (const file of [`${KIT}/x.tsx`, 'src/components/y.tsx', 'src/lib/z.ts', 'src/lib/clean.tsx']) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(
      path.join(root, file),
      file.endsWith('clean.tsx') ? 'const a = <IconButton variant="standard" />;\n' : 'const a = <IconButton icon={X} />;\n',
    );
  }
  assert.deepEqual(unstyledIn(root), ['src/components/y.tsx:1:11 (no variant)', 'src/lib/z.ts:1:11 (no variant)']);
});

test("every icon button of the board's source names its colour style", () => {
  assert.deepEqual(unstyledIn(WEB), []);
});
