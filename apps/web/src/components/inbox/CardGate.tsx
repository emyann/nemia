import { useState, type ReactNode } from 'react';
import { Button, Popover, PopoverTrigger, Radio, RadioGroup, TextField, Title } from '@/components/ui/ds';
import { barValue } from '../../lib/bar';
import { backName, endingWarning, gateCardLine, readLink, takenLine, type GateAsk } from '../../lib/gate';
import { RouteLink } from '../agent/AgentParts';
import { Refusal, useAsk } from '../gate/Ask';
import { useApprove } from '../../lib/useApprove';
import type { RunAt } from '@/lib/runNamespace';
import { Pending } from '@/components/look';

/**
 * What a card says once a person's word is taken there, the run's state it was taken in, and the state the answer moved it to once the
 * card reads it (`next`): said through both.
 */
export type Taken = { said: string; stamp: string; next?: string };

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
  run,
  gate,
  title,
  stamp,
  onTaken,
}: {
  run: RunAt;
  gate: GateAsk;
  /** The gate's words in full, on hover under the line: the folder's own for an ending, the CLI `ls`'s for a step's hand-off. */
  title: string;
  stamp: string;
  onTaken: (taken: Taken) => void;
}) {
  const approval = useApprove(run.id, gate.step, { namespace: run.namespace });
  const [to, setTo] = useState(gate.back[0] ?? gate.step);
  const sendBack = useAsk(run.id, gate.step, () => undefined, run.namespace);
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
        className="truncate text-body-small text-yours"
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
                    { mode: 'continue', message, step: to },
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
          params={{ runId: run.id }}
          {...('step' in read ? { search: { bar: barValue({ kind: 'step', run: run.id, step: read.step }) } } : { hash: read.hash })}
          data-read={gate.step}
          className="ml-auto min-w-0 truncate rounded-sm text-body-small font-medium text-foreground underline decoration-outline underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
    <PopoverTrigger>
      <Button data-answer={label} variant={primary ? 'filled' : 'outlined'} size="xsmall">
        {primary ? label : `${label}…`}
      </Button>
      <Popover aria-label={name} placement="bottom start" offset={6} className="w-80">
        {({ close }) => <>{children(close)}</>}
      </Popover>
    </PopoverTrigger>
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
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onApprove(words);
      }}
    >
      <Title size="small" component="h3">{`Approve ${gate.step}?`}</Title>
      <p className="text-body-small text-on-surface-variant">
        {gate.ends ? endingWarning(gate.step, gate.onto) : `What waits on ${gate.step} is filed next, handed what it handed on.`}
      </p>
      <TextField
        multiline
        label={`Words to approve ${gate.step} with, if any`}
        placeholder="Your words (optional)"
        value={words}
        onChange={setWords}
      />
      <div className="flex items-center gap-2">
        <Button icon={pending ? Pending : undefined} type="submit" size="xsmall" isDisabled={pending}>
          {pending ? 'Approving…' : gate.ends ? `Run ${gate.step} now` : 'Approve'}
        </Button>
        <Button variant="text" size="xsmall" onPress={onCancel}>
          Not yet
        </Button>
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
  const name = gate.ends ? backName(gate.back) : gate.step;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(message);
      }}
    >
      <Title size="small" component="h3">{`Send ${name} back`}</Title>
      <p className="text-body-small text-on-surface-variant">
        {`Its next try is told your words, and ${gate.step} waits at its gate again once it signs off.`}
      </p>
      <TextField
        multiline
        label={`What to change, sent back to ${name}`}
        placeholder="What to change (needed)"
        value={message}
        onChange={setMessage}
      />
      {gate.ends && gate.back.length > 1 && (
        <RadioGroup aria-label="Which step to send back" orientation="horizontal" value={to} onChange={onTo}>
          {gate.back.map((step) => (
            <Radio key={step} value={step}>
              {step}
            </Radio>
          ))}
        </RadioGroup>
      )}
      <div className="flex items-center gap-2">
        <Button icon={pending ? Pending : undefined} type="submit" size="xsmall" isDisabled={pending || !message.trim()}>
          {pending ? 'Sending back…' : 'Send back'}
        </Button>
        <Button variant="text" size="xsmall" onPress={onCancel}>
          Not yet
        </Button>
      </div>
      {error && <Refusal error={error} />}
    </form>
  );
}
