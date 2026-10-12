import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpIcon, LockIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { sayToStep, type Said } from '@/lib/api';
import { textAfterSaid, type Sayable } from '@/lib/say';
import { cn } from '@/lib/utils';

type Props = {
  runId: string;
  step: string;
  /** The line that says words to the step from a terminal, as the api answers it on the step (`commands.say`). */
  line: string;
  /** Whether the box may send to the step's session, or why not (`sayable`). */
  sayable: Sayable;
  /** Given the engine's entry once the api has taken the words, so the page draws the turn before the run is read again. */
  onSaid: (said: Said) => void;
};

/**
 * The chat input under a step's conversation, in the conversation layer's look: a rounded field that grows with what is written, and a send
 * button in its corner. Enter sends; Shift+Enter breaks the line. Sending posts the words to the api (`sayToStep`), which calls the
 * package's own `say()`: the words go to the session through its harness, and onto the step's record. A refusal shows under the box as the
 * api said it — the package's words or the engine's — and the words stay in the box, to send again. Closed, with the reason and where to go
 * instead, when the step has no session in flight. Once said, the box is emptied only if it still holds what was sent, keeping what a
 * person wrote meanwhile, and the run's record alone is read again (`exact`): nothing said to a session changes what there is to decide,
 * and a decision is keyed by the state it was read for.
 */
export function PromptBox({ runId, step, line, sayable, onSaid }: Props) {
  const [text, setText] = useState('');
  const field = useId();
  const form = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (words: string) => sayToStep(runId, step, words),
    onSuccess: (said, words) => {
      setText((now) => textAfterSaid(now, words));
      onSaid(said);
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
    },
  });
  const closed = !sayable.open;

  return (
    <section
      aria-label={`Say something to ${step}`}
      data-say={closed ? 'closed' : 'open'}
      className="shrink-0 border-t bg-background px-4 pt-3 pb-4"
    >
      <form
        ref={form}
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!closed && text.trim() && !send.isPending) send.mutate(text);
        }}
      >
        <label htmlFor={field} className="sr-only">
          {`What to say to ${step}'s session`}
        </label>
        <div
          data-slot="prompt-input"
          className={cn(
            'relative rounded-2xl border border-input bg-card shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
            closed && 'bg-muted/60 dark:bg-muted/40',
          )}
        >
          <textarea
            id={field}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                form.current?.requestSubmit();
              }
            }}
            disabled={closed}
            rows={2}
            aria-describedby={closed ? `${field}-closed` : undefined}
            placeholder={
              closed
                ? 'There is no session in flight to say anything to.'
                : `Say something to ${step}'s session. It goes on the step's record.`
            }
            className="field-sizing-content block max-h-48 min-h-20 w-full resize-none bg-transparent px-4 pt-3 pb-12 text-body-medium outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate pl-1 text-body-small text-muted-foreground">
              as <code className="font-mono">{line}</code>
            </p>
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Send"
              className="pointer-events-auto rounded-full"
              isDisabled={closed || send.isPending || !text.trim()}
            >
              <ArrowUpIcon />
            </Button>
          </div>
        </div>
      </form>
      {!sayable.open && (
        <p
          id={`${field}-closed`}
          data-closed
          className="mx-auto mt-2 flex w-full max-w-3xl items-start gap-1.5 text-body-small text-muted-foreground"
        >
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{sayable.why}</span>
        </p>
      )}
      {send.isError && (
        <div
          data-refused
          className="mx-auto mt-2 w-full max-w-3xl space-y-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2"
        >
          <p className="text-body-medium font-medium text-destructive">Not said. The api refused it:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words text-destructive">{send.error.message}</p>
        </div>
      )}
    </section>
  );
}
