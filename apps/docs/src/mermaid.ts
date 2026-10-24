/**
 * Mermaid on the docs' pages, drawn at build by beautiful-mermaid into an SVG that takes Starlight's colours. A fence
 * `mermaid diagram=<name>` holds nothing: its diagram is the code's own, a state machine or a layer's model as an entity-relation
 * diagram, read from between its `diagram:<name>` markers in the packages' docs, never copied. Any other `mermaid` fence is a
 * flowchart or a sequence drawn on the page. A diagram the renderer would draw short, a line of it read as nothing, fails the page's
 * build, naming the line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseMermaid, renderMermaidSVG } from 'beautiful-mermaid';
import type { Code, Html, Parent, Root } from 'mdast';

/** The headers a diagram drawn on a page opens with: a flowchart or a sequence. A state diagram is its machine's, never drawn by hand. */
const DRAWN = /^(?:(?:graph|flowchart)\s+(?:TD|TB|LR|BT|RL)|sequenceDiagram)$/;

/** The colours a diagram takes: Starlight's own variables, so one SVG follows the light and the dark theme. */
const COLOURS = { bg: 'var(--sl-color-bg)', fg: 'var(--sl-color-white)', accent: 'var(--sl-color-accent)', transparent: true };

/** The widest a page's column is, in pixels: Starlight's `--sl-content-width`, 45rem. */
const COLUMN = 720;

/** The caption of a figure that is wider than the column even at three quarters, above it, since its first screen shows only part of it. */
const SCROLL = '<figcaption>The diagram is wider than the page: scroll it sideways.</figcaption>';

/**
 * A drawn SVG in a figure, without the style element the renderer gives it: a page prints its CSS as an attribute, and it fetches a
 * font. The colours it derives are the site stylesheet's (`src/styles/accent.css`), and the figure carries the width it is drawn at
 * (`--drawn-width`), below three quarters of which the stylesheet never scales it; one still wider than the column says to scroll it.
 */
const figureOf = (svg: string): string => {
  const width = /<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1] ?? '0';
  const caption = Number(width) * 0.75 > COLUMN ? SCROLL : '';
  return `<figure class="diagram" style="--drawn-width: ${width}px">${caption}${svg.replace(/<style>[\s\S]*?<\/style>\n?/g, '')}</figure>`;
};

/** The `diagram=<name>` a fence's meta names, or undefined for a fence drawn on its page. */
const NAMED = /(?:^|\s)diagram=([a-z][\w-]*)(?=\s|$)/;

/** The Mermaid block between `diagram:<name>:begin` and `diagram:<name>:end` in a markdown text, or undefined where it holds none. */
export const diagramIn = (markdown: string, name: string): string | undefined => {
  const lines = markdown.split('\n');
  const begin = lines.findIndex((l) => l.startsWith(`<!-- diagram:${name}:begin`));
  const end = lines.findIndex((l, i) => i > begin && l === `<!-- diagram:${name}:end -->`);
  if (begin < 0 || end < 0) return undefined;
  const block = lines.slice(begin + 1, end);
  return block[0] === '```mermaid' && block.at(-1) === '```' ? block.slice(1, -1).join('\n') : undefined;
};

/** The package docs a marker may sit in: each package's `README.md` and the markdown under its `docs/`, by absolute path. */
const packageDocs = (root: string): string[] =>
  fs.readdirSync(path.join(root, 'packages')).flatMap((pkg) => {
    const dir = path.join(root, 'packages', pkg);
    const docs = path.join(dir, 'docs');
    const under = fs.existsSync(docs) ? (fs.readdirSync(docs, { recursive: true }) as string[]).filter((f) => f.endsWith('.md')) : [];
    return [path.join(dir, 'README.md'), ...under.map((f) => path.join(docs, f))].filter((f) => fs.existsSync(f));
  });

/**
 * The diagram named `name`, read from between its markers in the package docs under `root`. Throws, naming the fix, when no doc holds
 * it or more than one does.
 */
export const diagramFrom = (root: string, name: string): string => {
  const found = packageDocs(root).flatMap((file) => {
    const block = diagramIn(fs.readFileSync(file, 'utf8'), name);
    return block === undefined ? [] : [{ file: path.relative(root, file), block }];
  });
  if (found.length === 0)
    throw new Error(
      `no package doc holds the diagram ${name} between <!-- diagram:${name}:begin … --> and <!-- diagram:${name}:end -->: ` +
        "name a machine whose package's docs hold its diagram (packages/*/README.md, packages/*/docs/)",
    );
  if (found.length > 1) throw new Error(`the diagram ${name} is held in ${found.map((f) => f.file).join(' and ')}: give it one home`);
  return found[0].block;
};

/** The headers whose diagram the parser does not read, so that a line of it is judged by the SVG drawn with and without it. */
const RENDERED = new Set(['sequenceDiagram', 'erDiagram']);

/**
 * What a diagram's lines read as: its graph for a flowchart or a state diagram, which the parser reads, else its whole SVG, as for a
 * sequence or an entity-relation diagram.
 */
const readAs = (lines: string[]): string =>
  RENDERED.has(lines[0])
    ? renderMermaidSVG(lines.join('\n'))
    : JSON.stringify(parseMermaid(lines.join('\n')), (_key, value: unknown) => (value instanceof Map ? [...value] : value));

/** The lines of a diagram, after its header, that the renderer reads as nothing: taken away, each leaves what it draws the same. */
export const unreadLines = (source: string): string[] => {
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  const whole = readAs(lines);
  return lines.filter((line, i) => i > 0 && readAs(lines.filter((_l, j) => j !== i)) === whole);
};

/** The SVG of one `mermaid` fence of the page at `page`, or an error naming the page, the diagram and what to change. */
const drawn = (root: string, page: string, code: Code): Html => {
  const name = NAMED.exec(code.meta ?? '')?.[1];
  const what = name ? `the diagram ${name}` : 'a mermaid fence';
  if (name && code.value.trim()) throw new Error(`${page}: ${what} is read from its markers: leave its fence empty`);
  const header = code.value.trim().split('\n')[0].trim();
  if (!name && !DRAWN.test(header))
    throw new Error(
      `${page}: ${what} opens with ${header}: a diagram drawn on a page is a flowchart or a sequence; ` +
        "a state machine's diagram is its code's, a fence ```mermaid diagram=<name>",
    );
  try {
    const source = name ? diagramFrom(root, name) : code.value;
    const unread = unreadLines(source);
    if (unread.length > 0) throw new Error(`these lines are read as nothing, and left out: ${unread.join(' | ')}`);
    return { type: 'html', value: figureOf(renderMermaidSVG(source, COLOURS)) };
  } catch (error) {
    throw new Error(`${page}: ${what} does not draw: ${(error as Error).message}`, { cause: error });
  }
};

/** Replaces each `mermaid` fence under `node` by what `draw` makes of it, depth first. */
const drawEach = (node: Parent, draw: (code: Code) => Html): void => {
  node.children.forEach((child, i) => {
    if (child.type === 'code' && child.lang === 'mermaid') node.children[i] = draw(child);
    else if ('children' in child) drawEach(child, draw);
  });
};

/**
 * The remark plugin that draws every `mermaid` fence of a page as an SVG, before the code blocks are highlighted.
 * @param options.root The repository's root, where the package docs that hold the state machines' diagrams are.
 */
export const remarkMermaid =
  ({ root }: { root: string }) =>
  (tree: Root, file: { path?: string }): void =>
    drawEach(tree, (code) => drawn(root, path.relative(root, file.path ?? 'a page'), code));
