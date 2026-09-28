'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { type ComponentProps, createContext, type HTMLAttributes, useContext, useEffect, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';

// From AI Elements (registry.ai-sdk.dev/code-block.json), with three changes for a transcript:
// - shiki's fine-grained build with the few languages a session's calls are in, loaded on first use, rather than
//   every grammar shiki bundles;
// - the code as plain text until it is highlighted, and for `text` or code too long to be worth it, rather than
//   nothing — a server render and a reader in a hurry both get the words;
// - no line numbers, which nothing here asks for.
// And its copy button is pressed with `onPress`: AI Elements has no React Aria variant, and the aria base's `Button` is
// React Aria's.
export type CodeLanguage = 'json' | 'bash' | 'diff' | 'typescript' | 'tsx' | 'markdown' | 'text';

/** Past this many characters a block is shown as it is: a long tool result is read, not admired. */
const HIGHLIGHT_LIMIT = 20_000;

let highlighter: Promise<HighlighterCore> | undefined;
const highlighterOf = () =>
  (highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import('shiki/themes/one-light.mjs'), import('shiki/themes/one-dark-pro.mjs')],
        langs: [
          import('shiki/langs/json.mjs'),
          import('shiki/langs/bash.mjs'),
          import('shiki/langs/diff.mjs'),
          import('shiki/langs/typescript.mjs'),
          import('shiki/langs/tsx.mjs'),
          import('shiki/langs/markdown.mjs'),
        ],
        engine: createJavaScriptRegexEngine(),
      }),
  ));

export async function highlightCode(code: string, language: Exclude<CodeLanguage, 'text'>) {
  const shiki = await highlighterOf();
  return [
    shiki.codeToHtml(code, { lang: language, theme: 'one-light' }),
    shiki.codeToHtml(code, { lang: language, theme: 'one-dark-pro' }),
  ] as const;
}

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: CodeLanguage;
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});

const PRE =
  'overflow-auto [&>pre]:m-0 [&>pre]:bg-background! [&>pre]:p-4 [&>pre]:text-foreground! [&>pre]:text-sm [&_code]:font-mono [&_code]:text-sm';

export const CodeBlock = ({ code, language, className, children, ...props }: CodeBlockProps) => {
  // The highlight kept with the code and language it was made for: shown only while they are still what is drawn.
  const [highlight, setHighlight] = useState<{ code: string; language: CodeLanguage; html: readonly [light: string, dark: string] } | null>(
    null,
  );
  const html = highlight?.code === code && highlight.language === language ? highlight.html : null;

  useEffect(() => {
    if (language === 'text' || code.length > HIGHLIGHT_LIMIT) return;
    let cancelled = false;
    highlightCode(code, language).then(
      (highlighted) => {
        if (!cancelled) setHighlight({ code, language, html: highlighted });
      },
      // Unhighlighted is still the code.
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn('group relative w-full overflow-hidden rounded-md border bg-background text-foreground', className)}
        data-language={language}
        {...props}
      >
        <div className="relative">
          {html ? (
            <>
              <div
                className={cn(PRE, 'dark:hidden')}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
                dangerouslySetInnerHTML={{ __html: html[0] }}
              />
              <div
                className={cn(PRE, 'hidden dark:block')}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
                dangerouslySetInnerHTML={{ __html: html[1] }}
              />
            </>
          ) : (
            <div className={PRE}>
              <pre className="whitespace-pre-wrap break-words">
                <code>{code}</code>
              </pre>
            </div>
          )}
          {children && <div className="absolute top-2 right-2 flex items-center gap-2">{children}</div>}
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({ onCopy, onError, timeout = 2000, children, className, ...props }: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  // Handled on the promise rather than in a try: the compiler compiles no optional call inside a try.
  const copyToClipboard = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }

    navigator.clipboard.writeText(code).then(
      () => {
        setIsCopied(true);
        onCopy?.();
        setTimeout(() => setIsCopied(false), timeout);
      },
      (error: unknown) => onError?.(error as Error),
    );
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button className={cn('shrink-0', className)} onPress={copyToClipboard} size="icon" variant="ghost" {...props}>
      {children ?? <Icon size={14} />}
    </Button>
  );
};
