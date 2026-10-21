/**
 * One thing said in a conversation of the board, drawn by who said it: the agent's words in a cut bubble, with the pages they name as
 * the look's filled buttons under it; the person's own in a ringed bubble at the right; and a quiet line through the board's `Marker`
 * for what frames a conversation rather than being said in it (`Note`). Who said it and when stands over each bubble (`Who`), which a
 * conversation's own parts take for a bubble of their own.
 *
 * Every data mark is written under the prefix `marks` names (`mark`), so each conversation keeps the names its own pages read.
 */
import type { ReactNode } from 'react';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { CutButton, cutShape } from '@/components/look';
import { mark, type ConversationItem } from '@/lib/conversation';
import { timeOfDay } from '@/lib/timeOfDay';
import { Markdown } from '../Markdown';

/** What was said, as the family's `said` item holds it. */
type Spoken = Extract<ConversationItem, { kind: 'said' }>;

/** How far a bubble's two corners are cut, in pixels. */
const BUBBLE_CUT = 10;

/** Who said it, over the words: `Nemia · 5:40 PM`, `You · 5:52 PM`. */
export function Who({ who, at, children }: { who: string; at: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-label-small text-on-surface-variant uppercase">{`${who} · ${timeOfDay(new Date(at))}`}</span>
      {children}
    </div>
  );
}

/** A quiet line in a conversation: what frames it rather than being said in it. `what` says which, under the caller's prefix. */
export function Note({ what, marks, children }: { what: string; marks: string; children: ReactNode }) {
  return (
    <Marker {...mark(marks, 'marker', what)} variant="separator" className="text-body-small">
      <MarkerContent>{children}</MarkerContent>
    </Marker>
  );
}

/** The agent's words: the sentence as it stands, markdown and all, and each page it named as a filled button under it. */
function Theirs({ said, marks }: { said: Spoken; marks: string }) {
  return (
    <div {...mark(marks, 'message', 'agent')} className="flex max-w-[94%] flex-col gap-1.5">
      <Who who={said.who} at={said.at} />
      <div
        {...mark(marks, 'bubble', 'agent')}
        className="bg-surface-container-highest px-3.5 py-2.5 text-body-medium text-on-surface"
        style={{ clipPath: cutShape(BUBBLE_CUT) }}
      >
        {said.markdown ? <Markdown>{said.text}</Markdown> : said.text}
      </div>
      {said.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {said.links.map((link) => (
            <CutButton key={`${link.href} ${link.words}`} to={link.href}>
              {link.words}
            </CutButton>
          ))}
        </div>
      )}
    </div>
  );
}

/** The person's own words, at the right, in a ringed bubble: only what they wrote is drawn as theirs. */
function Yours({ said, marks }: { said: Spoken; marks: string }) {
  return (
    <div {...mark(marks, 'message', 'person')} className="flex max-w-[94%] flex-col items-end gap-1.5 self-end">
      <Who who={said.who} at={said.at} />
      <div
        {...mark(marks, 'bubble', 'person')}
        className="px-3.5 py-2.5 text-body-medium text-on-surface ring-1 ring-outline-variant ring-inset"
      >
        {said.markdown ? <Markdown>{said.text}</Markdown> : said.text}
      </div>
    </div>
  );
}

/** One thing said, drawn as theirs at the right or as the agent's at the left. */
export function Said({ said, marks }: { said: Spoken; marks: string }) {
  return said.yours ? <Yours said={said} marks={marks} /> : <Theirs said={said} marks={marks} />;
}
