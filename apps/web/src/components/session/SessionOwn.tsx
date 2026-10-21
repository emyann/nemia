/**
 * What a step's session has that the one turn shape has no arm for, drawn through the family's one escape hatch (`drawOwn`), as her
 * asks are hers: the brief it was told, folded to a line that opens, so the session's own words are read before what it was handed; the
 * words a person said to it while it ran, as their own bubble with where they reached the session; and its closeout.
 *
 * It lives in the step session's own folder, not the family's: a brief, a told turn and a closeout are one conversation's alone, and
 * the family folder holds what both conversations draw. Every data mark is written under the prefix its caller names (`mark`).
 */
import { FlagIcon, ScrollTextIcon, SendIcon } from 'lucide-react';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { Markdown } from '@/components/Markdown';
import { CutFrame } from '@/components/look';
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
import { bodyLeadsWith, closeoutOf, CLOSEOUT_TOOL, summaryShown, type ToolCall } from '@/lib/transcript';
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
 * What a person said to the session, off the engine's journal: their own words, at the right as the family draws a person's, with when
 * they were said and — once the session's transcript shows them reaching it — that they are in its conversation. Drawn once: the
 * session's own line for them is taken out (`heardIn`). The words as given, not as markdown: they are on the record as typed.
 */
function Told({ told, marks }: { told: Extract<Own, { what: 'told' }>; marks: string }) {
  return (
    <div {...mark(marks, 'message', 'told')} className="flex max-w-[94%] flex-col items-end gap-1.5 self-end">
      <Who who="You said, while it ran" at={told.at}>
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
        {...mark(marks, 'bubble', 'told')}
        className="max-h-72 overflow-y-auto px-3.5 py-2.5 whitespace-pre-wrap text-body-medium text-on-surface ring-1 ring-outline-variant ring-inset"
      >
        {told.text}
      </div>
    </div>
  );
}

/**
 * The step's closeout, named: its outcome, summary and body, what it needs, the files it left and the values it handed on — or, in any
 * other shape, the statement as given. A harness that refused it says so beneath.
 */
function Closeout({ call, marks }: { call: ToolCall; marks: string }) {
  const closeout = closeoutOf(call);
  const refused = call.result?.isError === true ? call.result.text : null;
  return (
    <CutFrame size={12} className="w-full">
      <section {...mark(marks, 'closeout')} aria-label="Closeout" className="flex flex-col gap-2 px-3.5 py-3 text-body-medium">
        <header className="flex flex-wrap items-center gap-2">
          <FlagIcon aria-hidden="true" className="size-4 text-on-surface-variant" />
          <h3 className="text-title-small">Closeout</h3>
          <span className="font-mono text-body-small text-on-surface-variant">{CLOSEOUT_TOOL}</span>
          {closeout && (
            <span
              {...mark(marks, 'outcome', closeout.outcome)}
              className={cn('px-2 py-0.5 font-mono text-body-small', closeout.outcome === 'blocked' ? container.yours : container.grey)}
            >
              {closeout.outcome}
            </span>
          )}
        </header>
        {closeout ? (
          <Said closeout={closeout} marks={marks} />
        ) : (
          <CodeBlock code={JSON.stringify(call.input ?? null, null, 2)} language="json" />
        )}
        {refused !== null && <p className="whitespace-pre-wrap text-body-small text-failure">The harness refused it: {refused}</p>}
      </section>
    </CutFrame>
  );
}

/** What a closeout in the shape every step's is asked for says: its summary, its body, what it needs, its files and its values. */
function Said({ closeout, marks }: { closeout: NonNullable<ReturnType<typeof closeoutOf>>; marks: string }) {
  return (
    <>
      {!bodyLeadsWith(closeout.summary, closeout.body) && <p {...mark(marks, 'summary')}>{summaryShown(closeout.summary)}</p>}
      {closeout.body !== null && <Markdown>{closeout.body}</Markdown>}
      {closeout.needs !== null && (
        <div {...mark(marks, 'needs')} className="text-yours">
          <p className="text-title-small">Needs:</p>
          <Markdown>{closeout.needs}</Markdown>
        </div>
      )}
      {closeout.artifacts.length > 0 && (
        <p className="text-body-small text-on-surface-variant">
          Artifacts: <span className="font-mono">{closeout.artifacts.join(', ')}</span>
        </p>
      )}
      {closeout.values.map((value) => (
        <p key={value.name} className="text-body-small text-on-surface-variant">
          {value.name}: <span className="font-mono">{value.value}</span>
        </p>
      ))}
    </>
  );
}

/** One of the step session's own items, by what it is. */
export function SessionOwn({ own, marks }: { own: Own; marks: string }) {
  if (own.what === 'brief') return <Brief text={own.text} marks={marks} />;
  if (own.what === 'told') return <Told told={own} marks={marks} />;
  return <Closeout call={own.call} marks={marks} />;
}
