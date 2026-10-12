import { memo, useId, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fencedCode, labelFootnotes, languageOf } from '../lib/markdown';
import { cn } from '../lib/utils';
import { CodeBlock } from './ai-elements/code-block';

const PLUGINS = [remarkGfm];

/** How large a heading is drawn, by its level in the markdown, wherever on the page it stands. */
const HEADING = {
  h1: 'text-[1.15em]',
  h2: 'text-[1.08em]',
  h3: 'text-[1em]',
  h4: 'text-[1em]',
  h5: 'text-[0.95em] text-muted-foreground',
  h6: 'text-[0.95em] text-muted-foreground',
} as const;

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** The heading a text's `#` stands at on the page: an h3 by default, deeper where a panel's own heading is deeper. */
type Level = 3 | 4 | 5;

const heading = (written: (typeof TAGS)[number], Tag: (typeof TAGS)[number]) =>
  function Heading({ node: _node, className, ...props }: ComponentProps<'h1'> & ExtraProps) {
    return <Tag className={cn('mt-4 mb-1.5 font-semibold leading-snug', HEADING[written], className)} {...props} />;
  };

/** Each heading of a text drawn `level` down the page from its `#`, deeper ones following, and none past h6. */
const headingsAt = (level: Level): Components =>
  Object.fromEntries(TAGS.map((written, i) => [written, heading(written, TAGS[Math.min(level - 1 + i, TAGS.length - 1)])]));

const LINK = 'font-medium text-foreground underline underline-offset-2 break-words hover:text-foreground';

/**
 * How each element of a text is drawn: the board's type in both themes, and three rules.
 *
 * - A link opens in a new tab, and gives the page it opens nothing of this one (`noreferrer`). One whose address the renderer emptied — a
 *   protocol other than http(s), mailto, irc or xmpp, such as `javascript:` — is its words, and no link. A link within the text, to a
 *   footnote, stays in the tab.
 * - A fenced block is the board's code block, highlighted where its fence names a language it has (`languageOf`), its lines as written:
 *   a long one scrolls inside the block, never wraps.
 * - An image is a link to it, never fetched: a text an agent wrote names any address it likes.
 */
const COMPONENTS: Components = {
  a: ({ node: _node, href, children, className, ...props }) => {
    if (!href) return <span className={className}>{children}</span>;
    if (href.startsWith('#')) {
      return (
        <a href={href} className={cn(LINK, className)} {...props}>
          {children}
        </a>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={cn(LINK, className)} {...props}>
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    const label = alt ? `image: ${alt}` : 'image';
    return typeof src === 'string' && src ? (
      <a href={src} target="_blank" rel="noreferrer noopener" data-image className={LINK}>
        {label}
      </a>
    ) : (
      <span data-image>{label}</span>
    );
  },
  pre: ({ node }) => {
    const { code, className } = fencedCode(node);
    return <CodeBlock code={code} language={languageOf(className)} className="my-3 text-[13px] [&_pre]:whitespace-pre" />;
  },
  code: ({ node: _node, className, ...props }) => (
    <code className={cn('box-decoration-clone rounded bg-muted px-1 py-px font-mono text-[0.9em]', className)} {...props} />
  ),
  p: ({ node: _node, className, ...props }) => <p className={cn('my-2 leading-relaxed', className)} {...props} />,
  ul: ({ node: _node, className, ...props }) => <ul className={cn('my-2 list-disc space-y-1 pl-5', className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => <ol className={cn('my-2 list-decimal space-y-1 pl-5', className)} {...props} />,
  /** A task's checkbox stands where a bullet would. */
  li: ({ node: _node, className, ...props }) => (
    <li
      className={cn(
        'pl-0.5 leading-relaxed marker:text-muted-foreground [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1',
        className?.includes('task-list-item') && '-ml-5 list-none',
        className,
      )}
      {...props}
    />
  ),
  input: ({ node: _node, className, ...props }) => <input {...props} disabled className={cn('mr-1.5 align-[-1px]', className)} />,
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote className={cn('my-2 border-l-2 border-outline pl-3 text-muted-foreground', className)} {...props} />
  ),
  hr: ({ node: _node, className, ...props }) => <hr className={cn('my-4 border-outline-variant', className)} {...props} />,
  table: ({ node: _node, className, ...props }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className={cn('w-max border-collapse text-left text-[0.95em]', className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th className={cn('border-b border-outline px-2 py-1 font-semibold', className)} {...props} />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn('border-b border-outline-variant px-2 py-1 align-top', className)} {...props} />
  ),
};

/** The components a text is drawn with, by the level its `#` stands at. */
const COMPONENTS_AT: Record<Level, Components> = {
  3: { ...COMPONENTS, ...headingsAt(3) },
  4: { ...COMPONENTS, ...headingsAt(4) },
  5: { ...COMPONENTS, ...headingsAt(5) },
};

type MarkdownProps = {
  /** The text, as an agent, a folder or a card wrote it. */
  children: string;
  className?: string;
  /** The heading a text's `#` is drawn as: 3 by default, under the page's own; deeper in a panel whose own heading is an h4. */
  level?: Level;
};

/**
 * A text written in markdown, as the board shows it: GFM — tables, task lists, strikethrough, autolinks, footnotes — on react-markdown.
 *
 * Raw HTML in the text is shown as the text it is, never as HTML: react-markdown turns it into text as it ships, and nothing here adds
 * a plugin that would parse it. A link's address passes react-markdown's own check, which empties a protocol that could run script.
 * Headings stand under the page's: a `#` is an h3, or `level`, and each deeper one follows it, sized by its level in the text. A soft
 * line break joins its lines into one paragraph: nothing here keeps a source's breaks. A text's footnote ids have a prefix of its own, so
 * two closeouts with a `[^1]` on one page each link to their own.
 */
function MarkdownText({ children, className, level = 3 }: MarkdownProps): ReactNode {
  const prefix = `md${useId().replace(/[^\w-]/g, '')}-`;
  return (
    <div data-markdown className={cn('min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        remarkRehypeOptions={{ clobberPrefix: prefix }}
        rehypePlugins={[() => labelFootnotes(prefix)]}
        components={COMPONENTS_AT[level]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Parsed once per text: a conversation redraws as it grows, and its earlier turns do not change. */
export const Markdown = memo(
  MarkdownText,
  (before, after) => before.children === after.children && before.className === after.className && before.level === after.level,
);
Markdown.displayName = 'Markdown';
