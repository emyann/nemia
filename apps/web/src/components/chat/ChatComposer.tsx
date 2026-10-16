/**
 * The composer of Nemia's chat: a field that grows with what is written, Enter sends and Shift+Enter makes a new line, the two hints
 * the canvas draws under it, and one button on its right. What it invites is `composerWords`, by where she is; while this browser keeps
 * a message the api would not take, the field takes nothing — there is nowhere for it to go. While she answers the button is the stop
 * (`composerButton`), which ends her turn and leaves her session open, and the field stays live, so Enter still sends her the next
 * words; her turn over, it is the send again.
 */
import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cutShape } from '@/components/look';
import { composerButton, composerWords } from '@/lib/nemia';
import type { Presence } from '@/lib/presence';
import { cn } from '@/lib/utils';

/** How far the composer's two corners and its button are cut, in pixels. */
const COMPOSER_CUT = 10;

/** A key the hints name. */
const Key = ({ children }: { children: string }) => (
  <span className="inline-grid h-5.5 min-w-5.5 place-items-center border border-outline-variant px-1.5 font-mono text-body-small text-on-surface-variant">
    {children}
  </span>
);

/** The field, its button, and the hints: `send` takes what was written once there is something in it, `stop` ends the turn she is in. */
export function ChatComposer({ presence, onSend, onStop }: { presence: Presence; onSend: (text: string) => void; onStop: () => void }) {
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
      <div
        className={cn(
          'flex min-h-13 items-end gap-2.5 py-1.5 pr-1.5 pl-3.5 ring-1 ring-outline-variant ring-inset focus-within:ring-2 focus-within:ring-alive',
          off ? 'bg-surface-container' : 'bg-surface-container-high',
        )}
        style={{ clipPath: cutShape(COMPOSER_CUT) }}
      >
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
        <Button
          type={stops ? 'button' : 'submit'}
          data-chat-button={stops ? 'stop' : 'send'}
          aria-label={stops ? 'Stop her answer' : 'Send'}
          size="icon"
          variant="secondary"
          isDisabled={stops ? false : !ready}
          onPress={stops ? onStop : undefined}
          className="rounded-none"
          style={{ clipPath: cutShape(COMPOSER_CUT) }}
        >
          {stops ? <span aria-hidden="true" className="size-3 bg-current" /> : <ArrowUpIcon />}
        </Button>
      </div>
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
