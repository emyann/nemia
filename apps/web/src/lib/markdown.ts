import type { CodeLanguage } from '../components/ai-elements/code-block';

/** A fence's word, as agents and people write it, to the languages the code block highlights. Anything else is shown as text. */
const FENCES: Readonly<Record<string, Exclude<CodeLanguage, 'text'>>> = {
  ts: 'typescript',
  typescript: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'tsx',
  javascript: 'tsx',
  jsx: 'tsx',
  mjs: 'tsx',
  cjs: 'tsx',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  console: 'bash',
  zsh: 'bash',
  shellsession: 'bash',
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  jsonc: 'json',
  jsonl: 'json',
  diff: 'diff',
  patch: 'diff',
};

/**
 * The language a fenced block is highlighted in, from its `language-*` class as the markdown pipeline writes it: ```` ```bash ```` gives
 * `language-bash`. A fence the code block has no grammar for, and a block with no fence word, are `text`: shown as written.
 * @param className The code element's class, as the pipeline gives it: a string, a list of them, or anything else for none.
 */
export function languageOf(className: unknown): CodeLanguage {
  const classes = Array.isArray(className) ? className.map(String) : typeof className === 'string' ? className.split(/\s+/) : [];
  const word = classes
    .find((c) => c.startsWith('language-'))
    ?.slice('language-'.length)
    .toLowerCase();
  return (word && FENCES[word]) || 'text';
}

/** A node of the markdown's tree (hast), as far as a code block goes: its text, and an element's name and class. */
type TextNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: readonly TextNode[];
};

/** Every piece of text under `node`, in order: a code block's code. */
const textOf = (node: TextNode | undefined): string =>
  !node ? '' : node.type === 'text' ? (node.value ?? '') : (node.children ?? []).map(textOf).join('');

/**
 * The code of a fenced block, from its `pre`: the text of the `code` inside it, less the one newline the pipeline ends a block with.
 * And the fence's class, for `languageOf`.
 * @param pre The block's `pre` node, or undefined where there is none.
 */
export function fencedCode(pre: TextNode | undefined): { code: string; className: unknown } {
  const code = pre?.children?.find((child) => child.type === 'element' && child.tagName === 'code');
  return { code: textOf(code ?? pre).replace(/\n$/, ''), className: code?.properties?.className };
}

/** A node of the tree as the footnotes' label is found in it: an element's id and what describes it. */
type LabelNode = { type: string; properties?: Record<string, unknown>; children?: LabelNode[] };

/** The id the pipeline gives the footnotes' heading in every text, whatever prefix its notes are given. */
const FOOTNOTE_LABEL = 'footnote-label';

/**
 * The footnotes' heading named with `prefix`, as the notes and their references already are (`clobberPrefix`), and each reference
 * described by that one: without it, two texts with footnotes on one page share the id `footnote-label`. A rehype plugin's transform.
 * @param prefix The prefix the text's notes and their references are given.
 */
export const labelFootnotes =
  (prefix: string) =>
  (tree: LabelNode): void => {
    const walk = (node: LabelNode) => {
      const properties = node.properties;
      if (properties?.id === FOOTNOTE_LABEL) properties.id = `${prefix}${FOOTNOTE_LABEL}`;
      const described = properties?.ariaDescribedBy;
      if (Array.isArray(described))
        properties!.ariaDescribedBy = described.map((id) => (id === FOOTNOTE_LABEL ? `${prefix}${FOOTNOTE_LABEL}` : id));
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };

/** A node of the drawn tree as its headings are found in it: an element's tag and properties. */
type HeadingNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HeadingNode[] };

/** The depth a heading element was written at, from its tag: 0 for any other node. */
const depthOf = (node: HeadingNode): number =>
  node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '') ? Number(node.tagName!.slice(1)) : 0;

/**
 * Each heading of a text placed on the page: drawn `level` down it from the text's `#`, or from its shallowest heading where `top`, deeper
 * ones following and none past h6, and given the class of the size it was written at. The footnotes' own heading, which the pipeline
 * writes and a person never sees, is placed with the rest and sets no depth. A rehype plugin's transform.
 * @param level The heading the text's `#`, or with `top` its shallowest heading, is drawn as.
 * @param top Whether the shallowest heading the text writes, rather than its `#`, stands at `level`.
 * @param sized The class a heading written at a depth is drawn with.
 */
export const placeHeadings =
  (level: number, top: boolean, sized: (depth: number) => string) =>
  (tree: HeadingNode): void => {
    const headings: HeadingNode[] = [];
    const walk = (node: HeadingNode) => {
      if (depthOf(node)) headings.push(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
    const written = headings
      .filter((node) => !(typeof node.properties?.id === 'string' && node.properties.id.endsWith(FOOTNOTE_LABEL)))
      .map(depthOf);
    const from = top && written.length ? Math.min(...written) : 1;
    for (const node of headings) {
      const depth = depthOf(node);
      const own = node.properties?.className;
      node.tagName = `h${Math.min(Math.max(level + depth - from, 1), 6)}`;
      node.properties = {
        ...node.properties,
        className: [...(Array.isArray(own) ? own : own ? [own] : []), ...sized(depth).split(' ').filter(Boolean)],
      };
    }
  };
