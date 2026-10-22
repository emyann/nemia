/**
 * The composer of a conversation of the board: a field that grows with what is written, Enter sends and Shift+Enter makes a new line,
 * the two hints under it, and one button on its right. What it invites (`placeholder`), what a reader is told it is (`label`) and
 * whether it takes anything at all (`off`) are its caller's — a family part knows no conversation's vocabulary, the two buttons' labels
 * included. It holds what is written itself and empties the field the moment it is sent; a caller whose send may be refused puts the
 * words it refused back by drawing the composer afresh on `start`.
 *
 * Where a `stop` is given the button is it, which ends the turn and leaves the session open, and the field stays live, so Enter still
 * sends the next words; where there is none it is the send. Its data marks are under the prefix `marks` names (`mark`).
 */
import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CutField, cutRing, cutShape } from '@/components/look';
import { mark } from '@/lib/conversation';

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

type Props = {
  marks: string;
  /** What the field holds to begin with: the words a caller's send was refused, put back to be sent again. */
  start?: string;
  label: string;
  placeholder: string;
  off: boolean;
  sendLabel: string;
  onSend: (text: string) => void;
  stop?: { label: string; press: () => void };
};

/** The field, its button, and the hints: `onSend` takes what was written once there is something in it, `stop` ends the turn. */
export function Composer({ marks, start = '', label, placeholder, off, sendLabel, onSend, stop }: Props) {
  const [text, setText] = useState(start);
  const form = useRef<HTMLFormElement>(null);
  const ready = text.trim() !== '' && !off;
  const stops = stop !== undefined;
  return (
    <form
      ref={form}
      {...mark(marks, 'composer', off ? 'off' : 'open')}
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
            aria-label={label}
            value={text}
            disabled={off}
            rows={1}
            placeholder={placeholder}
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
              {...mark(marks, 'button', stops ? 'stop' : 'send')}
              aria-label={stop?.label ?? sendLabel}
              size="icon"
              variant="secondary"
              isDisabled={stops ? false : !ready}
              onPress={stop?.press}
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
