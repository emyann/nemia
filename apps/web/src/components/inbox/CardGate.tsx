import { useRef, useState, type RefObject } from 'react';
import { Button, Popover, SplitButton, TextField, Title } from '@/components/ui/ds';
import { barValue } from '../../lib/bar';
import { gateCardLine, readLink, takenLine, type GateAsk } from '../../lib/gate';
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

/** Which of the gate's forms is open over the card, from its menu: the approval with words, or the send-back. */
type Asked = 'approve' | 'send';

/**
 * A gate on the Factory's card: what approving does and where a send-back goes, in one row whatever the names (`gateCardLine`), since a
 * card taller than its cell reaches over the card beneath it (`CELL_HEIGHT`) — cut short where the names are long and whole on hover and in
 * the inspector; a link to what is being approved, a page away, since a card has no room for a plan; and the answer beside it — the kit's
 * `SplitButton`, through the same api as the run page's gate (`useApprove`, `useAsk`). Its main press approves the gate at once, with
 * no words, as the CLI's `approve` does. Its menu holds Approve with words…
 * and Send back…, each opening its form in a popover over the card; a send-back needs words, as the CLI's `retry --message` does. A
 * refusal shows in the popover in the api's words, the words kept in the box: one of the main press opens the approval's form to say it.
 *
 * Clicks inside are the card's own: they neither toggle the card's steps nor drag it (`nodrag`), and the menu and the popovers, which React
 * draws outside the card, bubble through it as React does, so the stop is on the wrapper.
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
  const [line, read] = [gateCardLine(gate), readLink(gate)];
  const anchor = useRef<HTMLDivElement>(null);
  const [asked, setAsked] = useState<Asked | null>(null);
  const close = () => setAsked(null);
  const approve = (words: string) =>
    approval.mutate(words.trim() ? { message: words } : {}, {
      onSuccess: () => {
        close();
        onTaken({ said: takenLine({ approved: true }, gate), stamp });
      },
      onError: () => setAsked('approve'),
    });

  return (
    <div
      role="presentation"
      className="nodrag space-y-1.5 px-3"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <p data-gate-line={gate.step} title={`${line}\n${title}`} className="truncate text-body-small text-yours">
        {line}
      </p>
      <div className="flex items-center gap-1.5">
        <div ref={anchor} data-gate-answer={gate.step}>
          <SplitButton
            size="xsmall"
            icon={approval.isPending ? Pending : undefined}
            onPress={() => approve('')}
            isDisabled={approval.isPending}
            menuLabel={`Other answers to ${gate.step}`}
            items={[
              { id: 'approve', label: 'Approve with words…', onAction: () => setAsked('approve') },
              ...(gate.back.length > 0 ? [{ id: 'send', label: 'Send back…', onAction: () => setAsked('send') }] : []),
            ]}
          >
            {approval.isPending ? 'Approving…' : 'Approve'}
          </SplitButton>
        </div>
        <GateForms
          run={run}
          gate={gate}
          anchor={anchor}
          asked={asked}
          onClose={close}
          approval={approval}
          onApprove={approve}
          onSent={(said) => onTaken({ said, stamp })}
        />
        <RouteLink
          to="/runs/$runId"
          params={{ runId: run.id }}
          search={{ bar: barValue({ kind: 'step', run: run.id, step: read.step }) }}
          data-read={gate.step}
          className="ml-auto min-w-0 truncate rounded-sm text-body-small font-medium text-on-surface underline decoration-outline underline-offset-2 outline-none hover:decoration-on-surface focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {read.words}
        </RouteLink>
      </div>
    </div>
  );
}

/**
 * The popover the gate's menu opens over the card, beside its split button: the approval's form, with words, or the send-back's.
 * @param run the run the gate is of, whose step a send-back asks again
 * @param gate the gate answered
 * @param anchor the split button's box, which the popover hangs from
 * @param asked the form open, null while none is
 * @param onClose closes the popover: on Escape, a press outside, Not yet, or the answer taken
 * @param approval the card's approval, shared with the main press, whose refusal the approval's form says
 * @param onApprove sends the approval with the words given
 * @param onSent tells the card the send-back was taken, in what it says once it is
 */
function GateForms({
  run,
  gate,
  anchor,
  asked,
  onClose,
  approval,
  onApprove,
  onSent,
}: {
  run: RunAt;
  gate: GateAsk;
  anchor: RefObject<HTMLDivElement | null>;
  asked: Asked | null;
  onClose: () => void;
  approval: ReturnType<typeof useApprove>;
  onApprove: (words: string) => void;
  onSent: (said: string) => void;
}) {
  const sendBack = useAsk(run.id, gate.step, () => undefined, run.namespace);
  return (
    <Popover
      triggerRef={anchor}
      isOpen={asked !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-label={asked === 'send' ? `Send ${gate.step} back` : `Approve ${gate.step}`}
      placement="bottom start"
      offset={6}
      className="w-80"
    >
      {asked === 'approve' && (
        <ApproveForm
          gate={gate}
          pending={approval.isPending}
          error={approval.isError ? approval.error : null}
          onCancel={onClose}
          onApprove={onApprove}
        />
      )}
      {asked === 'send' && (
        <SendBackForm
          gate={gate}
          pending={sendBack.isPending}
          error={sendBack.isError ? sendBack.error : null}
          onCancel={onClose}
          onSend={(message) =>
            sendBack.mutate(
              { mode: 'continue', message, step: gate.step },
              {
                onSuccess: (sent) => {
                  onClose();
                  onSent(takenLine({ asked: sent, to: gate.step }, gate));
                },
              },
            )
          }
        />
      )}
    </Popover>
  );
}

/**
 * The approval, confirmed: the words to go with it, if any, and the press that sends it.
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
      <p className="text-body-small text-on-surface-variant">{`What waits on ${gate.step} is filed next, handed what it handed on.`}</p>
      <TextField
        multiline
        label={`Words to approve ${gate.step} with, if any`}
        placeholder="Your words (optional)"
        value={words}
        onChange={setWords}
      />
      <div className="flex items-center gap-2">
        <Button icon={pending ? Pending : undefined} variant="outlined" type="submit" size="xsmall" isDisabled={pending}>
          {pending ? 'Approving…' : 'Approve'}
        </Button>
        <Button variant="outlined" size="xsmall" onPress={onCancel}>
          Not yet
        </Button>
      </div>
      {error && <Refusal error={error} not="Not approved" />}
    </form>
  );
}

/** The send-back: the words it needs. It continues the step's session. */
function SendBackForm({
  gate,
  pending,
  error,
  onCancel,
  onSend,
}: {
  gate: GateAsk;
  pending: boolean;
  error: Error | null;
  onCancel: () => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState('');
  const name = gate.step;
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
      <div className="flex items-center gap-2">
        <Button icon={pending ? Pending : undefined} variant="outlined" type="submit" size="xsmall" isDisabled={pending || !message.trim()}>
          {pending ? 'Sending back…' : 'Send back'}
        </Button>
        <Button variant="outlined" size="xsmall" onPress={onCancel}>
          Not yet
        </Button>
      </div>
      {error && <Refusal error={error} />}
    </form>
  );
}
