/**
 * Nemia's chat as a page of its own, which the panel's `Open as a page` control leads to: the same panel (`ChatPanel`), full-bleed, the
 * talk filling the frame. The docked face is not drawn here — the page is the panel, so a face to open it would open nothing.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ScanLines } from '@/components/look';
import { levelQuery, openRunsQuery } from '@/lib/api';
import { presenceOf } from '@/lib/chatFollowing';
import { atWork } from '@/lib/footer';
import { useNemiaChat } from '@/lib/useNemiaChat';
import { useNow } from '@/lib/useNow';

export const Route = createFileRoute('/chat')({ component: ChatPage, staticData: { fullBleed: true } });

/** The chat, the whole page: her panel over the look's scan lines, as the board's other full-bleed pages stand. */
function ChatPage() {
  const chat = useNemiaChat();
  const nemia = useQuery(levelQuery).data;
  const open = useQuery(openRunsQuery()).data;
  const now = new Date(useNow(30_000));
  const presence = presenceOf(chat.state.presence, nemia?.level, chat.kept !== null);

  return (
    <ScanLines className="flex min-h-0 flex-1 flex-col">
      <div data-chat-page className="flex min-h-0 flex-1 flex-col p-4">
        <ChatPanel
          chat={chat}
          nemia={nemia}
          presence={presence}
          atWork={open ? atWork(open).runs : 0}
          now={now}
          mode="page"
          onGrow={() => undefined}
          onClose={() => undefined}
        />
      </div>
    </ScanLines>
  );
}
