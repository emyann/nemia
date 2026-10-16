/**
 * One thing said in Nemia's chat, drawn by who said it: her words in a cut bubble, with what they name as the canvas's filled buttons
 * under it; the person's in a ringed bubble at the right; the keeper's as one quiet line through the board's `Marker`, never a bubble,
 * since the keeper frames the person's words and does not write them; and a `session` line where one of her sessions gave way to the
 * next. A message this browser kept because the api would not take it is `ChatKeptMessage`.
 */
import { useState, type ReactNode } from 'react';
import { Marker, MarkerContent } from '@/components/ui/marker';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CutButton, CutTag, cutShape } from '@/components/look';
import { container, ink } from '@/lib/meaning';
import { drawnAs, linksOf, type ChatMessage as Message } from '@/lib/chatFollowing';
import type { ChatKept } from '@/lib/chatOutbox';
import { timeOfDay } from '@/lib/timeOfDay';
import { Markdown } from '../Markdown';

/** How far a bubble's two corners are cut, in pixels. */
const BUBBLE_CUT = 10;

/** Who said it, over the words: `Nemia · 5:40 PM`, `You · 5:52 PM`. */
function Who({ who, at, children }: { who: string; at: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-label-small text-on-surface-variant uppercase">{`${who} · ${timeOfDay(new Date(at))}`}</span>
      {children}
    </div>
  );
}

/** A quiet line in the talk: the keeper's framing words, and the rule between two of her sessions. */
export function ChatMarkerLine({ what, children }: { what: string; children: ReactNode }) {
  return (
    <Marker data-chat-marker={what} variant="separator" className="text-body-small">
      <MarkerContent>{children}</MarkerContent>
    </Marker>
  );
}

/** Her words: the sentence plain, markdown and all, and each link she wrote as a filled button under it (`linksOf`). */
function Hers({ message }: { message: Message }) {
  const { text, links } = linksOf(message.text);
  return (
    <div data-chat-message="agent" className="flex max-w-[94%] flex-col gap-1.5">
      <Who who="Nemia" at={message.at} />
      <div
        data-chat-bubble="agent"
        className="bg-surface-container-highest px-3.5 py-2.5 text-body-medium text-on-surface"
        style={{ clipPath: cutShape(BUBBLE_CUT) }}
      >
        <Markdown>{text}</Markdown>
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <CutButton key={`${link.href} ${link.words}`} to={link.href}>
              {link.words}
            </CutButton>
          ))}
        </div>
      )}
    </div>
  );
}

/** The person's words, at the right, in a ringed bubble: only what they wrote is drawn as theirs. */
function Yours({ message }: { message: Message }) {
  return (
    <div data-chat-message="person" className="flex max-w-[94%] flex-col items-end gap-1.5 self-end">
      <Who who="You" at={message.at} />
      <div data-chat-bubble="person" className="px-3.5 py-2.5 text-body-medium text-on-surface ring-1 ring-outline-variant ring-inset">
        {message.text}
      </div>
    </div>
  );
}

/** One message of her chat, drawn as `drawnAs` says by who it is from. */
export function ChatMessage({ message }: { message: Message }) {
  const drawn = drawnAs(message);
  if (drawn === 'marker') return <ChatMarkerLine what="keeper">{message.text}</ChatMarkerLine>;
  if (drawn === 'person') return <Yours message={message} />;
  return <Hers message={message} />;
}

/**
 * The message this browser kept because the api would not take it: its tag and its line in the failure's colour, and the three things
 * the person may do with it — send it again, change its words, throw it away. It is drawn as theirs, at the right, as every message of
 * theirs is.
 */
export function ChatKeptMessage({
  kept,
  onAgain,
  onEdit,
  onDiscard,
}: {
  kept: ChatKept;
  onAgain: () => void;
  onEdit: (text: string) => void;
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div data-chat-kept className="flex max-w-[94%] flex-col items-end gap-1.5 self-end">
      <Who who="You" at={kept.at}>
        <CutTag>
          <span data-chat-tag="kept" className={`inline-flex items-center px-2 py-0.5 text-label-small uppercase ${container.failure}`}>
            Not sent
          </span>
        </CutTag>
      </Who>
      {draft === null ? (
        <div data-chat-bubble="kept" className="px-3.5 py-2.5 text-body-medium text-on-surface ring-1 ring-failure ring-inset">
          {kept.text}
        </div>
      ) : (
        <Textarea aria-label="Change the message" value={draft} onChange={(event) => setDraft(event.target.value)} />
      )}
      <span className={`text-body-small ${ink.failure}`}>The board lost the daemon. Nothing reached her.</span>
      <div className="flex flex-wrap justify-end gap-2">
        {draft === null ? (
          <>
            <Button variant="secondary" size="sm" onPress={onAgain}>
              Send again
            </Button>
            <Button variant="outline" size="sm" onPress={() => setDraft(kept.text)}>
              Edit
            </Button>
            <Button variant="link" size="sm" onPress={onDiscard}>
              Discard
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                onEdit(draft);
                setDraft(null);
              }}
            >
              Keep the change
            </Button>
            <Button variant="link" size="sm" onPress={() => setDraft(null)}>
              Leave it
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
