import { memo, useId, useMemo, type ComponentProps } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fencedCode, labelFootnotes, languageOf, placeHeadings } from '../../lib/markdown';
import { cn } from '../../lib/utils';
import { Checkbox } from '@/components/ui/ds';
import { CodeBlock } from '../ai-elements/code-block';

const PLUGINS = [remarkGfm];

/** How large a heading is drawn, by its level in the markdown, wherever on the page it stands. */
const HEADING = {
  h1: 'text-[1.15em]',
  h2: 'text-[1.08em]',
  h3: '',
  h4: '',
  h5: 'text-[0.95em] text-muted-foreground',
  h6: 'text-[0.95em] text-muted-foreground',
} as const;

const TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/**
 * The heading a text's `#` stands at on the page, or its shallowest heading with `top`: an h3 by default, deeper under a deeper
 * heading.
 */
type Level = 2 | 3 | 4 | 5 | 6;

/** A heading's size, by the depth the text wrote it at (`placeHeadings` gives it as the heading's class). */
const sizeOf = (depth: number) => HEADING[TAGS[depth - 1] ?? 'h6'];

const heading = (Tag: (typeof TAGS)[number]) =>
  function Heading({ node: _node, className, ...props }: ComponentProps<'h1'> & ExtraProps) {
    return <Tag className={cn('mt-4 mb-1.5 font-semibold leading-snug', className)} {...props} />;
  };

/** Each heading as the tag `placeHeadings` named it. */
const HEADINGS: Components = Object.fromEntries(TAGS.map((tag) => [tag, heading(tag)]));

const LINK = 'font-medium text-foreground underline underline-offset-2 break-words hover:text-muted-foreground';

/** A link, as `COMPONENTS` draws it. */
const drawnLink = ({ node: _node, href, children, className, ...props }: ComponentProps<'a'> & ExtraProps) => {
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
};

/** An image, as `COMPONENTS` draws it: a link to it. */
const drawnImage = ({ src, alt }: ComponentProps<'img'> & ExtraProps) => {
  const label = alt ? `image: ${alt}` : 'image';
  return typeof src === 'string' && src ? (
    <a href={src} target="_blank" rel="noreferrer noopener" data-image className={LINK}>
      {label}
    </a>
  ) : (
    <span data-image>{label}</span>
  );
};

/**
 * How each element of a text is drawn: the board's type in both themes, and three rules.
 *
 * - A link opens in a new tab, and gives the page it opens nothing of this one (`noreferrer`). One whose address the renderer emptied — a
 *   protocol other than http(s), mailto, irc or xmpp, such as `javascript:` — is its words, and no link. A link within the text, to a
 *   footnote, stays in the tab.
 * - A fenced block is the board's code block, highlighted where its fence names a language it has (`languageOf`), its lines as written:
 *   a long one scrolls inside the block, never wraps.
 * - An image is a link to it, never fetched: a text an agent wrote names any address it likes; but one that names a file the text carries
 *   (`files`, a card's), which the board's own api serves, is shown.
 */
const COMPONENTS: Components = {
  a: drawnLink,
  img: drawnImage,
  pre: ({ node }) => {
    const { code, className } = fencedCode(node);
    return <CodeBlock code={code} language={languageOf(className)} className="my-3 text-body-small [&_pre]:whitespace-pre" />;
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
  input: ({ node: _node, className, checked }) => (
    <Checkbox
      isSelected={Boolean(checked)}
      isDisabled
      aria-label={checked ? 'Done' : 'Not done'}
      className={cn('mr-1.5 inline-flex min-h-0 align-middle', className)}
    />
  ),
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

/** The components a text is drawn with. */
const DRAWN: Components = { ...COMPONENTS, ...HEADINGS };

/**
 * A file a text carries, as the board reads it: the address it is served at, and whether it is a picture the api serves as its own type
 * (`PICTURE_TYPES`), shown where the text draws it as an image; any other is a link to it.
 */
export type TextFile = { readonly at: string; readonly picture: boolean };

/** The name a target written `name` or `./name` stands for, with its escapes read. */
const targetName = (src: string) => {
  const bare = src.startsWith('./') ? src.slice(2) : src;
  try {
    return decodeURIComponent(bare);
  } catch {
    return bare;
  }
};

/**
 * The components a text that carries `files` is drawn with: an image whose target is one of them shown, from the address the board
 * reads it at, and a link to one led there; every other image and link as `DRAWN` draws it.
 */
const drawnWith = (files: Readonly<Record<string, TextFile>>) => {
  const fileOf = (src: unknown) => (typeof src === 'string' ? files[targetName(src)] : undefined);
  const drawn: Components = {
    ...DRAWN,
    img: (props) => {
      const file = fileOf(props.src);
      if (file === undefined) return drawnImage(props);
      if (!file.picture) return drawnImage({ ...props, src: file.at });
      const at = file.at;
      return (
        <img src={at} alt={props.alt ?? ''} data-card-file className="my-2 max-h-96 max-w-full rounded border border-outline-variant" />
      );
    },
    a: (props) => drawnLink({ ...props, href: fileOf(props.href)?.at ?? props.href }),
  };
  return drawn;
};

/** Whether two maps of a text's files say the same. */
const sameFiles = (a: Readonly<Record<string, TextFile>> | undefined, b: Readonly<Record<string, TextFile>> | undefined) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

type MarkdownProps = {
  /** The text, as an agent, a folder or a card wrote it. */
  children: string;
  className?: string;
  /** The heading a text's `#` is drawn as: 3 by default, under the page's own; deeper in a panel whose own heading is an h4. */
  level?: Level;
  /**
   * Whether the text's shallowest heading, rather than its `#`, is drawn at `level`: for a text drawn under a heading of the page's, which
   * a `##` or a `###` it opens with would otherwise skip levels under.
   */
  top?: boolean;
  /** Marks a text by what it is on its page (`data-body`, a closeout's body), on the element that holds it. */
  'data-body'?: boolean;
  /**
   * The files the text carries, by the name its markdown targets them with, each the address the board reads it at and whether it is a
   * picture (`TextFile`): a card's, served by the api as itself. An image naming a picture is shown; an image naming any other file is a
   * link to it, and any other image stays a link, never fetched.
   */
  files?: Readonly<Record<string, TextFile>>;
};

/**
 * A text written in markdown, as the board shows it: GFM — tables, task lists, strikethrough, autolinks, footnotes — on react-markdown.
 *
 * Raw HTML in the text is shown as the text it is, never as HTML: react-markdown turns it into text as it comes, and nothing here adds
 * a plugin that would parse it. A link's address passes react-markdown's own check, which empties a protocol that could run script.
 * Headings stand under the page's: a `#` is an h3, or `level`, and each deeper one follows it, sized by its level in the text; with
 * `top`, the text's shallowest heading is drawn at `level`, whatever it is written as (`placeHeadings`). A soft
 * line break joins its lines into one paragraph: nothing here keeps a source's breaks. A text's footnote ids have a prefix of its own, so
 * two closeouts with a `[^1]` on one page each link to their own.
 */
function MarkdownText({ children, className, level = 3, top = false, 'data-body': body, files }: MarkdownProps) {
  const prefix = `md${useId().replace(/[^\w-]/g, '')}-`;
  const components = useMemo(() => (files === undefined ? DRAWN : drawnWith(files)), [files]);
  return (
    <div
      data-markdown
      data-body={body || undefined}
      className={cn('min-w-0 break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
    >
      <ReactMarkdown
        remarkPlugins={PLUGINS}
        remarkRehypeOptions={{ clobberPrefix: prefix }}
        rehypePlugins={[() => placeHeadings(level, top, sizeOf), () => labelFootnotes(prefix)]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** Parsed once per text: a conversation redraws as it grows, and its earlier turns do not change. */
export const Markdown = memo(
  MarkdownText,
  (before, after) =>
    before.children === after.children &&
    before.className === after.className &&
    before.level === after.level &&
    before.top === after.top &&
    before['data-body'] === after['data-body'] &&
    sameFiles(before.files, after.files),
);
Markdown.displayName = 'Markdown';
