/**
 * What a step's session has that the one turn shape has no arm for, drawn through the family's one escape hatch (`drawOwn`), as her
 * asks are hers: the brief it was told, folded to a line that opens, so the session's own words are read before what it was handed; the
 * words a person said to it while it ran, as their own bubble with where they reached the session; and its closeout, one line that links
 * to what it said, drawn once in the step's part.
 *
 * It lives in the step session's own folder, not the family's: a brief, a told turn and a closeout are one conversation's alone, and
 * the family folder holds what both conversations draw. Every data mark is written under the prefix its caller names (`mark`).
 */
import { FlagIcon, ScrollTextIcon, SendIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import {
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace';
import { Who } from '@/components/conversation/Said';
import { mark } from '@/lib/conversation';
import { container } from '@/lib/meaning';
import { closeoutOf, type ToolCall } from '@/lib/transcript';
import { focusRing } from '@/components/ui/ds/utils';
import type { SessionOwn as Own } from '@/lib/sessionItems';
import { cn } from '@/lib/utils';

/** How tall the brief grows before it scrolls inside itself. */
const BRIEF_CAP = 'max-h-96 overflow-y-auto';

/**
 * The brief the session was told, folded to one line that opens to it. Its words are drawn only while it is open: React Aria's panel
 * keeps and lays out what a closed one holds.
 */
function Brief({ text, marks }: { text: string; marks: string }) {
  return (
    <TraceCollapsible {...mark(marks, 'brief')}>
      <TraceCollapsibleTrigger>
        <TraceLine className="min-w-0">
          <TraceIcon>
            <ScrollTextIcon />
          </TraceIcon>
          <TraceTitle>What it was told</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent kind="body">
        <div className={cn(BRIEF_CAP, 'whitespace-pre-wrap')}>{text}</div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

/**
 * What was said to the session, off the engine's journal, with when it was said and — once the session's transcript shows it reaching it
 * — that it is in its conversation. A person's words at the right, as the family draws a person's (`You said, while it ran`); an
 * agent's (`by`) at the left in a ring, under its name, as the family draws another agent's (`Peer`), never as the person's. Drawn once:
 * the session's own line for them is taken out (`heardIn`). The words as given, not as markdown: they are on the record as typed.
 */
function Told({ told, marks }: { told: Extract<Own, { what: 'told' }>; marks: string }) {
  const peer = told.by !== null;
  const which = peer ? 'told-peer' : 'told';
  return (
    <div
      {...mark(marks, 'message', which)}
      className={cn('flex max-w-[94%] flex-col gap-1.5', peer ? 'items-start self-start' : 'items-end self-end')}
    >
      <Who who={peer ? `${told.by} · agent, while it ran` : 'You said, while it ran'} at={told.at}>
        {told.arrived !== null && (
          <span
            {...mark(marks, 'arrived', told.arrived)}
            title={`In the session's conversation at ${told.arrived}`}
            className="text-label-small text-on-surface-variant uppercase"
          >
            · in its conversation
          </span>
        )}
        <SendIcon aria-hidden="true" className="size-3 text-on-surface-variant" />
      </Who>
      <div
        {...mark(marks, 'bubble', which)}
        className={cn(
          'max-h-72 overflow-y-auto px-3.5 py-2.5 whitespace-pre-wrap text-body-medium text-on-surface ring-1 ring-inset',
          peer ? 'ring-outline' : 'ring-outline-variant',
        )}
      >
        {told.text}
      </div>
    </div>
  );
}

/** The part's Said slot of the step `step`, in what holds both the part and the talk (`data-step-scope`), scrolled into view. */
function toSaid(from: HTMLElement, step: string): void {
  const scope = from.closest(`[data-step-scope]`) ?? document;
  scope.querySelector(`[data-part-said="${CSS.escape(step)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * The step's closeout, in one line: that it signed off and how, linking to what it said, drawn once, in its part above the talk (`Said`);
 * in any other shape, the statement as given; a harness that refused it says so beneath.
 */
function Closeout({ call, step, marks }: { call: ToolCall; step: string; marks: string }) {
  const closeout = closeoutOf(call);
  const refused = call.result?.isError === true ? call.result.text : null;
  return (
    <section {...mark(marks, 'closeout')} aria-label="Closeout" className="flex flex-col gap-1 text-body-medium">
      <p className="flex flex-wrap items-center gap-2">
        <FlagIcon aria-hidden="true" className="size-4 text-on-surface-variant" />
        <span className="text-title-small">Closeout</span>
        {closeout && (
          <span
            {...mark(marks, 'outcome', closeout.outcome)}
            className={cn('px-2 py-0.5 font-mono text-body-small', closeout.outcome === 'blocked' ? container.yours : container.grey)}
          >
            {closeout.outcome}
          </span>
        )}
        {closeout && (
          <button
            type="button"
            {...mark(marks, 'to-said')}
            onClick={(event) => toSaid(event.currentTarget, step)}
            className={cn('text-body-small underline underline-offset-2', focusRing())}
          >
            Read what it said, above
          </button>
        )}
      </p>
      {!closeout && <CodeBlock code={JSON.stringify(call.input ?? null, null, 2)} language="json" />}
      {refused !== null && <p className="whitespace-pre-wrap text-body-small text-failure">The harness refused it: {refused}</p>}
    </section>
  );
}

/** One of the step session's own items, by what it is. */
export function SessionOwn({ own, step, marks }: { own: Own; step: string; marks: string }) {
  if (own.what === 'brief') return <Brief text={own.text} marks={marks} />;
  if (own.what === 'told') return <Told told={own} marks={marks} />;
  return <Closeout call={own.call} step={step} marks={marks} />;
}
