import { memo, useId, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fencedCode, labelFootnotes, languageOf, type TextNode } from '../lib/markdown';
import { cn } from '../lib/utils';
import { CodeBlock } from './ai-elements/code-block';

const PLUGINS = [remarkGfm];

/** A heading's level on the page: two below the markdown's, so a text's `#` never stands level with the page's own headings. */
const SHIFTED = { h1: 'h3', h2: 'h4', h3: 'h5', h4: 'h6', h5: 'h6', h6: 'h6' } as const;
const HEADING = {
  h1: 'text-[1.15em]',
  h2: 'text-[1.08em]',
  h3: 'text-[1em]',
  h4: 'text-[1em]',
  h5: 'text-[0.95em] text-neutral-600 dark:text-neutral-400',
  h6: 'text-[0.95em] text-neutral-600 dark:text-neutral-400',
} as const;

const heading = (level: keyof typeof SHIFTED) =>
  function Heading({ node: _node, className, ...props }: ComponentProps<'h1'> & ExtraProps) {
    const Tag = SHIFTED[level];
    return <Tag className={cn('mt-4 mb-1.5 font-semibold leading-snug', HEADING[level], className)} {...props} />;
  };

const LINK = 'font-medium text-neutral-900 underline underline-offset-2 break-words hover:text-neutral-600 dark:text-neutral-100 dark:hover:text-neutral-300';

/**
 * How each element of a text is drawn: the board's type in both themes, and three rules.
 *
 * - A link opens in a new tab, and gives the page it opens nothing of this one (`noreferrer`). One whose address the renderer emptied — a
 *   protocol other than http(s), mailto, irc or xmpp, such as `javascript:` — is its words, and no link. A link within the text, to a
 *   footnote, stays in the tab.
 * - A fenced block is the board's code block, highlighted where its fence names a language it has (`languageOf`).
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
    const { code, className } = fencedCode(node as TextNode | undefined);
    return <CodeBlock code={code} language={languageOf(className)} className="my-3 text-[13px]" />;
  },
  code: ({ node: _node, className, ...props }) => (
    <code className={cn('box-decoration-clone rounded bg-neutral-100 px-1 py-px font-mono text-[0.9em] dark:bg-neutral-800', className)} {...props} />
  ),
  h1: heading('h1'),
  h2: heading('h2'),
  h3: heading('h3'),
  h4: heading('h4'),
  h5: heading('h5'),
  h6: heading('h6'),
  p: ({ node: _node, className, ...props }) => <p className={cn('my-2 leading-relaxed', className)} {...props} />,
  ul: ({ node: _node, className, ...props }) => <ul className={cn('my-2 list-disc space-y-1 pl-5', className)} {...props} />,
  ol: ({ node: _node, className, ...props }) => <ol className={cn('my-2 list-decimal space-y-1 pl-5', className)} {...props} />,
  // A task's checkbox stands where a bullet would.
  li: ({ node: _node, className, ...props }) => (
    <li
      className={cn(
        'pl-0.5 leading-relaxed marker:text-neutral-400 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1',
        className?.includes('task-list-item') && '-ml-5 list-none',
        className,
      )}
      {...props}
    />
  ),
  input: ({ node: _node, className, ...props }) => <input {...props} disabled className={cn('mr-1.5 align-[-1px]', className)} />,
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn('my-2 border-l-2 border-neutral-300 pl-3 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400', className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => <hr className={cn('my-4 border-neutral-200 dark:border-neutral-800', className)} {...props} />,
  table: ({ node: _node, className, ...props }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table className={cn('w-max border-collapse text-left text-[0.95em]', className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th className={cn('border-b border-neutral-300 px-2 py-1 font-semibold dark:border-neutral-700', className)} {...props} />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn('border-b border-neutral-200 px-2 py-1 align-top dark:border-neutral-800', className)} {...props} />
  ),
};

type MarkdownProps = {
  /** The text, as an agent, a folder or a card wrote it. */
  children: string;
  className?: string;
};

/**
 * A text written in markdown, as the board shows it: GFM — tables, task lists, strikethrough, autolinks, footnotes — on react-markdown.
 *
 * Raw HTML in the text is shown as the text it is, never as HTML: react-markdown turns it into text as it ships, and nothing here adds
 * a plugin that would parse it. A link's address passes react-markdown's own check, which empties a protocol that could run script.
 * Headings are two levels down (`SHIFTED`), and a text's footnotes are named apart from another text's on the same page.
 */
function MarkdownText({ children, className }: MarkdownProps): ReactNode {
  // Footnote ids are the page's, so each text gets its own prefix: two closeouts with a `[^1]` on one page link each to its own.
  const prefix = `md${useId().replace(/[^\w-]/g, '')}-`;
  return (
    <div data-markdown className={cn('min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        remarkRehypeOptions={{ clobberPrefix: prefix }}
        rehypePlugins={[() => labelFootnotes(prefix)]}
        components={COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Parsed once per text: a conversation redraws as it grows, and its earlier turns do not change. */
export const Markdown = memo(MarkdownText, (before, after) => before.children === after.children && before.className === after.className);
Markdown.displayName = 'Markdown';
