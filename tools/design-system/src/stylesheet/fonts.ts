/**
 * The faces the board's stylesheet loads, as files: each `@fontsource` import of `src/styles.css` read, its Latin `@font-face` kept and
 * its woff2 named, each written under the artifact's `fonts/`; and the symbols none of the faces has (`look/symbols.css`), each rule
 * kept with its `unicode-range`, never a face of tokens.json, where a face with no range stands for its whole family.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SRC, requireOfTheBoard } from '../paths.ts';

/** One face: its family, weight, style, stretch, display and range as its sheet says, its source file and its file in the artifact. */
export type Face = {
  readonly family: string;
  readonly weight: string;
  readonly style: string;
  readonly stretch: string | undefined;
  readonly display: string | undefined;
  readonly unicodeRange: string | undefined;
  readonly from: string;
  readonly file: string;
  readonly source: string;
};

/** A declaration's value in a `@font-face` body, if it has it. */
const declared = (body: string, key: string) => new RegExp(`${key}:\\s*([^;]+);`).exec(body)?.[1]?.trim();

/** One face per Latin `@font-face` block of a fontsource sheet: the subset named in the comment over it ends in `-latin-…`. */
const facesOf = (source: string) => {
  const file = requireOfTheBoard.resolve(source);
  const css = fs.readFileSync(file, 'utf8');
  return [...css.matchAll(/\/\* ([a-z0-9-]+) \*\/\s*@font-face \{([\s\S]*?)\}/g)]
    .filter(([, subset]) => /-latin-(?!ext)/.test(subset ?? ''))
    .map(([, , body = '']) => {
      const url = /url\(\.\/(files\/[^)]+\.woff2)\)/.exec(body)?.[1];
      if (!url) throw new Error(`${source}: a Latin face with no woff2: read where the sheet keeps its files`);
      return {
        family: (declared(body, 'font-family') ?? '').replace(/['"]/g, ''),
        weight: declared(body, 'font-weight') ?? '400',
        style: declared(body, 'font-style') ?? 'normal',
        stretch: declared(body, 'font-stretch'),
        display: declared(body, 'font-display'),
        unicodeRange: declared(body, 'unicode-range'),
        from: path.join(path.dirname(file), url),
        file: `fonts/${path.basename(url)}`,
        source,
      } satisfies Face;
    });
};

/** Every face the board's stylesheet loads; refused when it loads none, or when two share a file name. */
export const boardFaces = () => {
  const styles = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
  const sheets = [...styles.matchAll(/^@import '(@fontsource[^']+\.css)';/gm)].map(([, sheet]) => sheet ?? '');
  if (sheets.length === 0)
    throw new Error('src/styles.css imports no @fontsource sheet: find the faces where the entry stylesheet loads them');
  const faces = sheets.flatMap(facesOf);
  if (new Set(faces.map((face) => face.file)).size !== faces.length) throw new Error('two faces share a file name: rename one in fonts.ts');
  return faces;
};

/**
 * Each face as an `@font-face` rule whose file is reached from a stylesheet in `from`, a folder of the artifact.
 * @param faces the faces.
 * @param from the folder of the stylesheet, as `components`.
 */
export const faceRules = (faces: readonly Face[], from: string) =>
  faces
    .map(
      (face) =>
        [
          `@font-face{font-family:${JSON.stringify(face.family)}`,
          `font-style:${face.style}`,
          `font-weight:${face.weight}`,
          ...(face.stretch ? [`font-stretch:${face.stretch}`] : []),
          `font-display:${face.display ?? 'swap'}`,
          `src:url(${JSON.stringify(path.posix.relative(from, face.file))}) format("woff2")`,
          ...(face.unicodeRange ? [`unicode-range:${face.unicodeRange}`] : []),
        ].join(';') + '}',
    )
    .join('\n');

/** The symbols' sheet, its comments left out. */
const symbolsSheet = () => fs.readFileSync(path.join(SRC, 'components', 'look', 'symbols.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The symbols' files: each fontsource file `look/symbols.css` names, and its file in the artifact. */
const symbolFiles = () =>
  [...new Set([...symbolsSheet().matchAll(/url\('(@fontsource[^']+)'\)/g)].map(([, spec]) => spec ?? ''))].map((spec) => ({
    spec,
    from: requireOfTheBoard.resolve(spec),
    file: `fonts/${path.basename(spec)}`,
  }));

/**
 * The symbols' rules as written, each file reached from a stylesheet in `from`.
 * @param from the folder of the stylesheet, as `components`.
 */
export const symbolRules = (from: string) =>
  [...symbolsSheet().matchAll(/@font-face \{([\s\S]*?)\}/g)]
    .map(([, body = '']) => {
      const lines = body
        .trim()
        .split(/;\s*/)
        .filter(Boolean)
        .map((line) =>
          line
            .replace(/\s*:\s*/, ':')
            .replace(
              /url\('(@fontsource[^']+)'\)/,
              (_, spec: string) => `url(${JSON.stringify(path.posix.relative(from, `fonts/${path.basename(spec)}`))})`,
            ),
        );
      return `@font-face{${lines.join(';')}}`;
    })
    .join('\n');

/**
 * Copies each face's file and each symbol's into the artifact's `fonts/`.
 * @param project the artifact's folder.
 * @param faces the faces.
 */
export const copyFaces = (project: string, faces: readonly Face[]) => {
  fs.mkdirSync(path.join(project, 'fonts'), { recursive: true });
  for (const face of [...faces, ...symbolFiles()]) fs.copyFileSync(face.from, path.join(project, face.file));
};
