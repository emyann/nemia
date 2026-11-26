/**
 * `components/bundle.css`: the board's stylesheet (`src/styles.css` and the theme it imports), compiled by Tailwind over the code of
 * the design system, with three changes. The faces are declared by `@font-face` rules of their own at its end, each reaching its file
 * under `fonts/` by a relative address, in place of the fontsource sheets; the symbols' sheet is appended the same way; and dark answers
 * to the root's attribute as well as to the system, never to the system on a root that says light.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compile, optimize } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { SRC, STORYBOOK, WEB, WORK, writeIn } from '../paths.ts';
import { inlinableStyle } from '../bundle/guards.ts';
import { faceRules, symbolRules, type Face } from './fonts.ts';

const SYSTEM_DARK = /@media \(prefers-color-scheme: dark\) \{\s*:root \{([\s\S]*?)\n {2}\}\n\}/g;

/**
 * The sheet with each system-dark root block written twice: kept for the system, but not on a root that says light, and again for a
 * root or a part whose attribute or class says dark.
 * @param css a sheet whose dark roles sit in `@media (prefers-color-scheme: dark) { :root { … } }`.
 */
export const darkTwice = (css: string) =>
  css.replace(SYSTEM_DARK, (_, body: string) =>
    [
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]):not(.light) {${body}\n  }\n}`,
      `:root[data-theme="dark"], [data-theme="dark"], .dark {${body}\n}`,
    ].join('\n'),
  );

/**
 * The selectors a compiled sheet still darkens on the system's word alone, a root that says light included.
 * @param css the compiled sheet.
 */
export const darkOnTheSystemAlone = (css: string) => [
  ...new Set(
    [...css.matchAll(/@media[^{]*prefers-color-scheme:\s*dark[^{]*\{([^{]*)\{/g)]
      .map(([, selector]) => (selector ?? '').trim())
      .filter((selector) => !selector.includes(':not([data-theme="light"])') && !selector.includes(':not([data-theme=light])')),
  ),
];

/** The light theme's root, also a root or a part that says light. */
export const lightToo = (css: string) => css.replace(/^:root \{/m, ':root, [data-theme="light"], .light {');

/**
 * The board's entry sheet rewritten for the artifact: its faces, symbols and relative imports taken out or made absolute, the theme
 * and the grain read from the rewritten copies `theme` and `grain`, and the dark variant answering to the attribute.
 * @param styles `src/styles.css`.
 * @param theme the rewritten theme's path.
 * @param grain the rewritten grain's path.
 */
const rewrittenStyles = (styles: string, theme: string, grain: string) => {
  const rewritten = styles
    .replace(/^@import '(@fontsource|\.\.\/theme)[^\n]*\n/gm, '')
    .replace("@import './components/look/symbols.css';\n", '')
    .replace("@import './components/look/grain.css';", `@import ${JSON.stringify(grain)};`)
    .replace(/@import '\.\/([^']+)'/g, (_, rel: string) => `@import ${JSON.stringify(path.join(SRC, rel))}`)
    .replace(
      /@custom-variant dark \{[\s\S]*?\n\}\n/,
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *));\n',
    )
    .replace(
      "@import 'tailwindcss';",
      `@import 'tailwindcss';\n@import ${JSON.stringify(theme)} layer(theme);\n@import ${JSON.stringify(path.join(WEB, 'theme', 'theme.v4.css'))};`,
    );
  if (/^@import [^\n]*(symbols\.css|@fontsource|'\.)/m.test(rewritten))
    throw new Error(
      'src/styles.css still imports a relative sheet, the symbols or a fontsource sheet: teach rewrittenStyles its new import',
    );
  if (!rewritten.includes('@custom-variant dark (&:where'))
    throw new Error("src/styles.css's dark variant was not found: teach rewrittenStyles how it is written now");
  const schemes =
    '\n:root { color-scheme: light dark; }\n[data-theme="light"], .light { color-scheme: light; }\n[data-theme="dark"], .dark { color-scheme: dark; }\n';
  return darkTwice(rewritten) + schemes;
};

/**
 * Compiles the stylesheet over every source the design system draws, and appends the faces and the symbols; refused when a dark rule
 * still follows the system alone.
 * @param faces the faces of the stylesheet.
 * @param sources the further folders and files whose classes it holds: the kit's stories, the generated entry and the card's runner.
 */
export const stylesheetOf = async (faces: readonly Face[], sources: readonly string[]) => {
  const theme = path.join(WORK, 'theme.css');
  const grain = path.join(WORK, 'grain.css');
  const styles = path.join(WORK, 'styles.css');
  writeIn(theme, darkTwice(lightToo(fs.readFileSync(path.join(WEB, 'theme', 'theme.css'), 'utf8'))));
  writeIn(grain, darkTwice(fs.readFileSync(path.join(SRC, 'components', 'look', 'grain.css'), 'utf8')));
  writeIn(styles, rewrittenStyles(fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8'), theme, grain));
  const scanned = [path.join(SRC, 'components'), path.join(SRC, 'lib'), STORYBOOK, ...sources];
  const input = [`@import ${JSON.stringify(styles)};`, ...scanned.map((source) => `@source ${JSON.stringify(source)};`)].join('\n');
  const compiler = await compile(input, { base: WEB, from: path.join(WORK, 'bundle.css'), onDependency: () => undefined });
  const scanner = new Scanner({ sources: compiler.sources });
  const built = optimize(compiler.build(scanner.scan()), { minify: true }).code.trimEnd();
  const css = `${built}\n${faceRules(faces, 'components')}\n${symbolRules('components')}\n`;
  const alone = darkOnTheSystemAlone(css);
  if (alone.length)
    throw new Error(
      `dark follows the system alone for: ${alone.slice(0, 12).join(' | ')}: write those rules in a block darkTwice rewrites`,
    );
  return inlinableStyle(css);
};
