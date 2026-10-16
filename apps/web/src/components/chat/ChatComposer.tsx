/**
 * The composer of Nemia's chat: a field that grows with what is written, Enter sends and Shift+Enter makes a new line, the two hints
 * the canvas draws under it, and a send on its right. What it invites is `composerWords`, by where she is; while this browser keeps a
 * message the api would not take, the field takes nothing — there is nowhere for it to go. There is no stop until her session moves to
 * the SDK, so while she answers it asks for the next one.
 */
import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CutField, cutRing, cutShape } from '@/components/look';
import { composerWords } from '@/lib/nemia';
import type { Presence } from '@/lib/presence';

/** How far the composer's two corners and its send are cut, in pixels. */
const COMPOSER_CUT = 10;

/** The room between the send and its focus ring, and the ring's width, in pixels: the look's cut button's own. */
const [GAP, RING] = [2, 3];

/** A key the hints name. */
const Key = ({ children }: { children: string }) => (
  <span className="inline-grid h-5.5 min-w-5.5 place-items-center border border-outline-variant px-1.5 font-mono text-body-small text-on-surface-variant">
    {children}
  </span>
);

/** The field, its send, and the hints: `send` takes what was written once there is something in it. */
export function ChatComposer({ presence, onSend }: { presence: Presence; onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const off = presence.notSent;
  const ready = text.trim() !== '' && !off;
  return (
    <form
      ref={form}
      data-chat-composer={off ? 'off' : 'open'}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSend(text);
        setText('');
      }}
    >
      <CutField size={COMPOSER_CUT} ground={off ? 'bg-surface-container' : 'bg-surface-container-high'}>
        <div className="flex min-h-13 items-end gap-2.5 py-1.5 pr-1.5 pl-3.5">
          <textarea
            aria-label="Message to Nemia"
            value={text}
            disabled={off}
            rows={1}
            placeholder={composerWords(presence)}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                form.current?.requestSubmit();
              }
            }}
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-body-medium text-on-surface outline-none placeholder:text-on-surface-variant disabled:cursor-not-allowed"
          />
          <span className="group/send relative inline-flex shrink-0">
            <span
              aria-hidden="true"
              data-cut-ring
              className="pointer-events-none absolute -inset-[5px] hidden bg-ring group-has-data-focus-visible/send:block"
              style={{ clipPath: cutRing(COMPOSER_CUT, GAP, RING) }}
            />
            <Button
              type="submit"
              aria-label="Send"
              size="icon"
              variant="secondary"
              isDisabled={!ready}
              className="relative rounded-none"
              style={{ clipPath: cutShape(COMPOSER_CUT) }}
            >
              <ArrowUpIcon />
            </Button>
          </span>
        </div>
      </CutField>
      <div className="flex items-center gap-2 text-body-small text-on-surface-variant">
        <Key>Enter</Key>
        <span>sends</span>
        <Key>Shift</Key>
        <span>+</span>
        <Key>Enter</Key>
        <span>a new line</span>
      </div>
    </form>
  );
}
