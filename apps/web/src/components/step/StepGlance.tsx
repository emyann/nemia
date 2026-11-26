import { Body } from '@/components/ui/ds';
import type { PartHead as Head } from '@/lib/stepPart';
import { cn } from '@/lib/utils';
import { ReadingLines } from '@/components/look';
import { StateTag } from './part/PartHead';

/** What a diamond's hover card holds: the head's live facts, a few lines that never scroll. */
function Row({ name, children, className }: { name: string; children: React.ReactNode; className?: string }) {
  return (
    <div data-glance={name} className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5', className)}>
      {children}
    </div>
  );
}

/**
 * The small card a step's diamond shows on hover or focus, read from the step part's head (`headOf`): who and its model; its word and
 * since when; its try and round and its spend of the cap; and its last line, cut at two lines. The static facts (harness, effort, context,
 * permission) stay in the step's sheet. A fact not read yet is a reading line.
 * @param props.head The step's head, as the row knows it and the run's own answer, once read, completes it.
 */
export function StepGlance({ head }: { head: Head }) {
  const who = head.who === 'none' ? null : head.who;
  const model = head.model === 'none' ? null : head.model;
  const read = head.time !== 'none' || head.spend !== 'none';
  return (
    <div
      data-step-glance
      data-step-name={head.step}
      data-step-kind={head.kind}
      className="flex w-60 max-w-full flex-col gap-1.5 text-on-surface"
    >
      <Row name="who">
        <Body size="medium" component="span" data-step-agent className="truncate font-medium">
          {who?.name ?? 'no agent'}
        </Body>
        {model && (
          <Body size="small" component="span" colorRole="on-surface-variant" className="truncate font-mono">
            {model}
          </Body>
        )}
      </Row>
      <Row name="state">
        <StateTag head={head} />
        {head.time !== 'none' && (
          <Body size="small" component="span" colorRole="on-surface-variant" className="font-mono">
            {head.time.value} {head.time.note}
          </Body>
        )}
      </Row>
      {read ? (
        <Row name="place">
          {head.round !== 'none' && (
            <Body size="small" component="span" colorRole="on-surface-variant" className="font-mono">
              {head.round}
            </Body>
          )}
          {head.spend !== 'none' && (
            <Body size="small" component="span" data-step-spend className="font-mono">
              {head.spend.said}
              {head.spend.kind === 'words' && head.spend.note ? ` ${head.spend.note}` : ''}
            </Body>
          )}
        </Row>
      ) : (
        <Body size="small" component="div" className="contents">
          <ReadingLines widths={['w-3/4']} className="gap-1" />
        </Body>
      )}
      {head.note !== 'none' && (
        <Body size="small" component="div" data-glance="note" colorRole="on-surface-variant" className="line-clamp-2 break-words">
          {head.note.text}
        </Body>
      )}
    </div>
  );
}
