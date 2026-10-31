import { useId, useState } from 'react';
import type { Answer } from '../lib/asks';
import { OFFERS } from '../lib/words';
import { BUTTON, Refusal, TEXTAREA, useApprove } from './Ask';
import { AskedRow } from './Questions';

/**
 * A loop out of rounds, approved as it stands: the step's own `approve` line with the reason it requires (`--message`), a box for that
 * reason — required, so the button waits for it, and sent as typed — and the button that approves it through the api (`approveStep`),
 * which on a loop ends it as the CLI's `approve` does. What may be approved is the package's to say: its refusal shows beside the
 * button, verbatim. Once the api has it, what the tick does with it, until the run is read again and the loop is offered no more.
 */
export function EnoughRow({ runId, offer, line }: { runId: string; offer: Extract<Answer, { case: 'enough' }>; line: string }) {
  const [message, setMessage] = useState('');
  const field = useId();
  const approve = useApprove(runId, offer.step);
  const words = OFFERS.enough;
  if (approve.isSuccess) return <AskedRow step={offer.step} said={`try ${approve.data.try} ${words.approved(offer.step)}`} />;
  return (
    <li
      data-offer={offer.case}
      data-kind={offer.kind}
      data-step={offer.step}
      className="space-y-2 rounded border border-yours bg-card p-3 text-body-medium"
    >
      <p data-said className="break-words">
        <strong>{offer.step}</strong> {words.said}
      </p>
      <p className="font-mono text-body-small break-words">
        <code>{`${line} --message "<why>"`}</code>
      </p>
      <form
        aria-label={words.form(offer.step)}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          approve.mutate({ message });
        }}
      >
        <label htmlFor={field} className="sr-only">
          {words.field(offer.step)}
        </label>
        <textarea
          id={field}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder={words.placeholder}
          className={TEXTAREA}
        />
        <button type="submit" disabled={approve.isPending || !message.trim()} className={BUTTON}>
          {approve.isPending ? 'Approving…' : words.button}
        </button>
      </form>
      {approve.isError && <Refusal error={approve.error} not="Not approved" />}
    </li>
  );
}
