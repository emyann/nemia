/**
 * The composer of Nemia's chat: a field that grows with what is written, Enter sends and Shift+Enter makes a new line, the two hints
 * the canvas draws under it, and one button on its right. What it invites is `composerWords`, by where she is and whether a question
 * of hers waits on the person (`asking`); while this browser keeps
 * a message the api would not take, the field takes nothing — there is nowhere for it to go. While she answers the button is the stop
 * (`composerButton`), which ends her turn and leaves her session open, and the field stays live, so Enter still sends her the next
 * words; her turn over, it is the send again.
 */
import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CutField, cutRing, cutShape } from '@/components/look';
import { composerButton, composerWords } from '@/lib/nemia';
import type { Presence } from '@/lib/presence';

/** How far the composer's two corners and its button are cut, in pixels. */
const COMPOSER_CUT = 10;

/** The room between the button and its focus ring, and the ring's width, in pixels: the look's cut button's own. */
const [GAP, RING] = [2, 3];

/** A key the hints name. */
const Key = ({ children }: { children: string }) => (
  <span className="inline-grid h-5.5 min-w-5.5 place-items-center border border-outline-variant px-1.5 font-mono text-body-small text-on-surface-variant">
    {children}
  </span>
);

/** The field, its button, and the hints: `send` takes what was written once there is something in it, `stop` ends the turn she is in. */
export function ChatComposer({
  presence,
  asking,
  onSend,
  onStop,
}: {
  presence: Presence;
  asking: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const off = presence.notSent;
  const ready = text.trim() !== '' && !off;
  const stops = composerButton(presence) === 'stop';
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
            placeholder={composerWords(presence, asking)}
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
              type={stops ? 'button' : 'submit'}
              data-chat-button={stops ? 'stop' : 'send'}
              aria-label={stops ? 'Stop her answer' : 'Send'}
              size="icon"
              variant="secondary"
              isDisabled={stops ? false : !ready}
              onPress={stops ? onStop : undefined}
              className="relative rounded-none"
              style={{ clipPath: cutShape(COMPOSER_CUT) }}
            >
              {stops ? <span aria-hidden="true" className="size-3 bg-current" /> : <ArrowUpIcon />}
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
