import { useId, useState, type ReactNode } from 'react';
import { Button as AriaButton, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
import { barValue } from '../lib/bar';
import { backName, gateCardLine, readLink, takenLine, type GateAsk } from '../lib/gate';
import { cn } from '../lib/utils';
import { RouteLink } from './AgentParts';
import { BUTTON, Refusal, TEXTAREA, useAsk } from './Ask';
import { SECONDARY, useApprove } from './Gate';

/**
 * What a card says once a person's word is taken there, the run's state it was taken in, and the state the answer moved it to once the
 * card reads it (`next`): said through both.
 */
export type Taken = { said: string; stamp: string; next?: string };

export const SMALL = 'h-6 rounded px-2 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
export const POPOVER =
  'z-50 w-72 rounded-lg border border-neutral-200 bg-white p-3 text-sm text-foreground shadow-lg outline-none dark:border-neutral-800 dark:bg-neutral-900';

/**
 * A gate on the Factory's card: what approving does and where a send-back goes, in one row whatever the names (`gateCardLine`), since a
 * card taller than its cell reaches over the card beneath it (`CELL_HEIGHT`) — cut short where the names are long and whole on hover and in
 * the inspector; a link to what is being approved, a page away, since a card has no room for a plan; and the answer beside it — Approve
 * and Send back, each a popover over the card, through the same api as the run page's gate (`useApprove`, `useAsk`). The popover is the
 * second press: nothing is sent by the button on the card. At an ending the approval's button says what it runs (`Run ship now`), and a
 * send-back needs words, as the CLI's `retry --message` does. A refusal shows in the popover in the api's words, the words kept in the box.
 *
 * Clicks inside are the card's own: they neither toggle the card's steps nor drag it (`nodrag`), and the popovers, which React draws
 * outside the card, bubble through it as React does, so the stop is on the wrapper.
 */
export function CardGate({
  runId,
  gate,
  title,
  stamp,
  onTaken,
}: {
  runId: string;
  gate: GateAsk;
  /** The gate's words in full, on hover under the line: the folder's own for an ending, the CLI `ls`'s for a step's hand-off. */
  title: string;
  stamp: string;
  onTaken: (taken: Taken) => void;
}) {
  const approval = useApprove(runId, gate.step, () => undefined);
  const [to, setTo] = useState(gate.back[0] ?? gate.step);
  const sendBack = useAsk(runId, gate.step, () => undefined);
  const line = gateCardLine(gate);
  const read = readLink(gate);

  return (
    <div
      role="presentation"
      className="nodrag space-y-1.5 px-3"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <p
        data-to-decide={gate.ends ? 'approve' : undefined}
        data-gate-line={gate.step}
        title={`${line}\n${title}`}
        className="truncate text-[11px] text-amber-800 dark:text-amber-300"
      >
        {line}
      </p>
      <div className="flex items-center gap-1.5">
        <Answer label="Approve" name={`Approve ${gate.step}`} primary>
          {(close) => (
            <ApproveForm
              gate={gate}
              pending={approval.isPending}
              error={approval.isError ? approval.error : null}
              onCancel={close}
              onApprove={(words) =>
                approval.mutate(words.trim() ? { message: words } : {}, {
                  onSuccess: () => {
                    close();
                    onTaken({ said: takenLine({ approved: true }, gate), stamp });
                  },
                })
              }
            />
          )}
        </Answer>
        {gate.back.length > 0 && (
          <Answer label="Send back" name={`Send ${gate.ends ? backName(gate.back) : gate.step} back`}>
            {(close) => (
              <SendBackForm
                gate={gate}
                to={to}
                onTo={setTo}
                pending={sendBack.isPending}
                error={sendBack.isError ? sendBack.error : null}
                onCancel={close}
                onSend={(message) =>
                  sendBack.mutate(
                    { mode: 'nudge', message, step: to },
                    {
                      onSuccess: (asked) => {
                        close();
                        onTaken({ said: takenLine({ asked, to }, gate), stamp });
                      },
                    },
                  )
                }
              />
            )}
          </Answer>
        )}
        <RouteLink
          to="/runs/$runId"
          params={{ runId }}
          {...('step' in read ? { search: { bar: barValue({ kind: 'step', run: runId, step: read.step }) } } : { hash: read.hash })}
          data-read={gate.step}
          className="ml-auto min-w-0 truncate rounded-sm text-[11px] font-medium text-foreground underline decoration-neutral-400 underline-offset-2 outline-none hover:decoration-neutral-700 focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-500 dark:hover:decoration-neutral-300"
        >
          {read.words}
        </RouteLink>
      </div>
    </div>
  );
}

/** A button on the card that opens its popover, where the answer is given: its dialog is named for what it does (`Approve ship`). */
function Answer({
  label,
  name,
  primary = false,
  children,
}: {
  label: string;
  name: string;
  primary?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <DialogTrigger>
      <AriaButton
        data-answer={label}
        className={cn(
          SMALL,
          primary
            ? 'bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
            : 'bg-white text-foreground ring-1 ring-neutral-300 ring-inset hover:bg-neutral-100 dark:bg-neutral-900 dark:ring-neutral-700 dark:hover:bg-neutral-800',
        )}
      >
        {primary ? label : `${label}…`}
      </AriaButton>
      <Popover placement="bottom start" offset={6} className={POPOVER}>
        <Dialog aria-label={name} className="space-y-2 outline-none">
          {({ close }) => <>{children(close)}</>}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

/**
 * The approval, confirmed: the words to go with it, if any, and the press that sends it. An ending's is `Run <step> now`, under what
 * running it does, since nothing of it can be taken back.
 */
function ApproveForm({
  gate,
  pending,
  error,
  onCancel,
  onApprove,
}: {
  gate: GateAsk;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onApprove: (words: string) => void;
}) {
  const [words, setWords] = useState('');
  const field = useId();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApprove(words);
      }}
    >
      <Heading slot="title" className="font-semibold">{`Approve ${gate.step}?`}</Heading>
      <p className="text-xs text-muted-foreground">
        {gate.ends
          ? `This runs ${gate.step} in the repository's own checkout${gate.onto ? ` on ${gate.onto}` : ''}, and it cannot be taken back.`
          : `What waits on ${gate.step} is filed next, handed what it handed on.`}
      </p>
      <label htmlFor={field} className="sr-only">{`Words to approve ${gate.step} with, if any`}</label>
      <textarea
        id={field}
        value={words}
        onChange={(e) => setWords(e.target.value)}
        rows={2}
        placeholder="Your words (optional)"
        className={TEXTAREA}
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={cn(BUTTON, 'px-2.5 py-1 text-xs')}>
          {pending ? 'Approving…' : gate.ends ? `Run ${gate.step} now` : 'Approve'}
        </button>
        <button type="button" onClick={onCancel} className={cn(BUTTON, SECONDARY, 'px-2.5 py-1 text-xs')}>
          Not yet
        </button>
      </div>
      {error && <Refusal error={error} not="Not approved" />}
    </form>
  );
}

/** The send-back: the words it needs, and which step it goes to where the ending waits on several. It continues that step's session. */
function SendBackForm({
  gate,
  to,
  onTo,
  pending,
  error,
  onCancel,
  onSend,
}: {
  gate: GateAsk;
  to: string;
  onTo: (step: string) => void;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState('');
  const field = useId();
  const name = gate.ends ? backName(gate.back) : gate.step;
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(message);
      }}
    >
      <Heading slot="title" className="font-semibold">{`Send ${name} back`}</Heading>
      <p className="text-xs text-muted-foreground">
        {`Its next try is told your words, and ${gate.step} waits at its gate again once it signs off.`}
      </p>
      <label htmlFor={field} className="sr-only">{`What to change, sent back to ${name}`}</label>
      <textarea
        id={field}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="What to change (needed)"
        className={TEXTAREA}
      />
      {gate.ends && gate.back.length > 1 && (
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <legend className="sr-only">Which step to send back</legend>
          {gate.back.map((step) => (
            <label key={step} className="flex cursor-pointer items-center gap-1.5">
              <input type="radio" name={`${field}-to`} value={step} checked={to === step} onChange={() => onTo(step)} />
              {step}
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending || !message.trim()} className={cn(BUTTON, 'px-2.5 py-1 text-xs')}>
          {pending ? 'Sending back…' : 'Send back'}
        </button>
        <button type="button" onClick={onCancel} className={cn(BUTTON, SECONDARY, 'px-2.5 py-1 text-xs')}>
          Not yet
        </button>
      </div>
      {error && <Refusal error={error} />}
    </form>
  );
}
