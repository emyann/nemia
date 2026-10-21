/**
 * The talk of Nemia's chat: the family's talk (`conversation/Talk`) fed her events through her own adapter (`chatItems`), under the
 * `chat` prefix every page of hers reads. What is hers and hers alone is the ask — a proposal, one question's form or the flow of
 * several, as `drawnAsk` says — which she draws herself through the family's one escape hatch (`drawOwn`), and the two labels her log
 * is read by. The line over what is new, the jump pill, the read mark's sentinel and the scroll that follows her latest are the
 * family's.
 */
import { chatItems, drawnAsk, newFrom, readableFrom, type ChatAsk as Ask } from '@/lib/chatFollowing';
import type { AskPick, ChatEvent } from '@/lib/api';
import { Talk } from '@/components/conversation/Talk';
import { ChatAsk } from './ChatAsk';
import { ChatAskMany } from './ChatAskMany';
import { ChatProposal } from './ChatProposal';

/** The person's answer to an ask of hers, filed whole. */
type Answering = (id: string, picks: readonly AskPick[]) => void;

/** An ask of hers, drawn as `drawnAsk` says: the proposal's actions, one question's form, or the flow of several. */
function Asked({ ask, onAnswer }: { ask: Ask; onAnswer: Answering }) {
  const drawn = drawnAsk(ask.questions);
  if (drawn === 'many') return <ChatAskMany ask={ask} onAnswer={onAnswer} />;
  if (drawn === 'actions') return <ChatProposal ask={ask} onAnswer={onAnswer} />;
  return <ChatAsk ask={ask} onAnswer={onAnswer} />;
}

/** The talk: what `events` holds on the family's shape, with the new line, the jump pill, the read mark and her asks answered. */
export function ChatTalk({
  events,
  unread,
  onRead,
  onAnswer,
}: {
  events: readonly ChatEvent[];
  unread: number;
  onRead: (through: string) => void;
  onAnswer: Answering;
}) {
  return (
    <Talk
      items={chatItems(events)}
      marks="chat"
      label="Nemia's talk"
      backLabel="Earlier messages"
      newAt={newFrom(events, unread)}
      unread={unread}
      readable={readableFrom(events)}
      onRead={onRead}
      drawOwn={(ask) => <Asked ask={ask} onAnswer={onAnswer} />}
    />
  );
}
