import { CircleAlert, CircleCheck, LoaderCircle, type LucideIcon } from 'lucide-react';
import type { FixPhase } from 'objects';
import { CutFrame, type FrameHue } from '@/components/look';
import { cn } from '@/components/ui/ds/utils';
import { container, ringed } from '@/lib/meaning';
import { codeIn, linkedParts } from '@/lib/setup';
import { CopyText } from './CopyText';

/** How each phase of a fix is drawn: a word and a glyph, read without its colour, its tag's hue, and its frame's edge. */
const PHASE: Record<FixPhase, { word: string; icon: LucideIcon; className: string; hue: FrameHue }> = {
  pending: { word: 'Starting', icon: LoaderCircle, className: container.grey, hue: 'none' },
  running: { word: 'Running', icon: LoaderCircle, className: ringed.alive, hue: 'alive' },
  succeeded: { word: 'Done', icon: CircleCheck, className: container.sage, hue: 'none' },
  failed: { word: 'Failed', icon: CircleAlert, className: ringed.failure, hue: 'failure' },
};

/**
 * A fix the server runs, as it runs: its need and its phase, in a word and a glyph; over its output, the code its output shows by the
 * pattern its need declares (`codeIn`), large, with the control that copies it — the device code a sign-in asks a person to type
 * elsewhere; then the output in the mono face, every URL in it a link that opens in a new tab (`linkedParts`). Its exit code once it
 * ended. `unread` is an end the board could not read.
 */
export function FixRun({
  need,
  phase,
  output,
  code,
  exitCode,
  unread,
}: {
  need: string;
  phase: FixPhase;
  output: string;
  code?: string;
  exitCode?: number;
  unread?: string;
}) {
  const drawn = PHASE[phase];
  const Icon = drawn.icon;
  const shown = codeIn(output, code);
  const going = phase === 'pending' || phase === 'running';
  return (
    <CutFrame hue={drawn.hue} size={12}>
      <section data-fix-run={need} data-fix-phase={phase} aria-label={`The fix of ${need}`} className="flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <span
            data-fix-word
            className={cn('inline-flex items-center gap-1 rounded-shape-full px-2 py-0.5 text-label-medium', drawn.className)}
          >
            <Icon aria-hidden className={cn('size-3.5', going && 'motion-safe:animate-spin')} />
            {drawn.word}
          </span>
          <span className="font-mono text-body-medium break-all">{need}</span>
          {exitCode !== undefined && <span className="text-body-small text-on-surface-variant">exit {exitCode}</span>}
        </header>
        {shown !== undefined && (
          <div data-fix-code={shown} className="flex flex-col gap-1">
            <span className="text-label-medium text-on-surface-variant">The code to type where the output says</span>
            <CopyText text={shown} label={`the code ${shown}`} large />
          </div>
        )}
        <pre
          data-fix-output
          aria-live="polite"
          className="max-h-80 overflow-auto bg-surface-container-lowest p-3 font-mono text-body-small break-words whitespace-pre-wrap text-on-surface"
        >
          {output === ''
            ? going
              ? 'Nothing printed yet.'
              : 'It printed nothing.'
            : linkedParts(output).map((part, i) =>
                part.kind === 'link' ? (
                  <a
                    key={i}
                    href={part.text}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline underline-offset-2"
                  >
                    {part.text}
                  </a>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
        </pre>
        {unread !== undefined && (
          <p role="alert" className="text-body-small break-words text-failure">
            {unread}
          </p>
        )}
      </section>
    </CutFrame>
  );
}
