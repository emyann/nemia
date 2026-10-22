/**
 * The composer under a step's session: the family's composer (`conversation/Composer`), its look and its keys — Enter sends,
 * Shift+Enter makes a new line — with no stop, a session's turn being the engine's to end and not a reader's. What is the step's alone
 * is here: the mutation that posts the words (`sayToStep`), which calls the package's own `say()` so the words go to the session
 * through its harness and onto the step's record; the line that says what a terminal would type instead; and a refusal shown as the api
 * said it, the package's words or the engine's, with the words it refused put back in the field to send again (`start`).
 *
 * It is drawn only while there is a session to say anything to (`sayable`). Where there is none, the stopped band stands in its place
 * and says so once (`SessionBand`), rather than a switched-off box saying the same thing in a second voice.
 *
 * The run's record alone is read again once the words are said (`exact`): nothing said to a session changes what there is to decide,
 * and a decision is keyed by the state it was read for.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Composer } from '@/components/conversation/Composer';
import { sayToStep, type Said } from '@/lib/api';
import { mark } from '@/lib/conversation';

type Props = {
  runId: string;
  step: string;
  /** The line that says words to the step from a terminal, as the api answers it on the step (`commands.say`). */
  line: string;
  /** Given the engine's entry once the api has taken the words, so the page draws the turn before the run is read again. */
  onSaid: (said: Said) => void;
};

/** The prefix every data mark of a step's session is written under. */
const MARKS = 'session';

/** The composer, the line that says what a terminal would type, and the api's refusal where there is one. */
export function SessionComposer({ runId, step, line, onSaid }: Props) {
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: (words: string) => sayToStep(runId, step, words),
    onSuccess: (said) => {
      onSaid(said);
      void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });
    },
  });
  const refused = send.isError ? (send.variables ?? '') : '';

  return (
    <section aria-label={`Say something to ${step}`} className="flex shrink-0 flex-col gap-2">
      <Composer
        key={`${send.failureCount}`}
        start={refused}
        marks={MARKS}
        label={`What to say to ${step}'s session`}
        placeholder={`Say something to ${step}'s session. It goes on the step's record.`}
        off={false}
        sendLabel="Send"
        onSend={(words) => send.mutate(words)}
      />
      <p className="min-w-0 truncate text-body-small text-on-surface-variant">
        as <code className="font-mono">{line}</code>
      </p>
      {send.isError && (
        <div {...mark(MARKS, 'refused')} className="flex flex-col gap-1 bg-failure-container px-3.5 py-2.5 text-on-failure-container">
          <p className="text-title-small">Not said. The api refused it:</p>
          <p className="font-mono text-body-small whitespace-pre-wrap break-words">{send.error.message}</p>
        </div>
      )}
    </section>
  );
}
