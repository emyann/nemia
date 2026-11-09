/**
 * Nemia's chat, as the canvas draws it: the look's cut frame — alive while her session is up, a quiet outline while she is down — her
 * header, the band that says why she stopped or that the board lost the daemon, her talk, the message this browser kept, and the
 * composer. Floating over the page, grown to the whole frame, or the page of its own at `/chat`, which is the same panel full-bleed.
 * Grown it takes the whole of the room it is given; floating it grows with her talk no further than that room, across as well as down,
 * so its header and the three controls on it, and its composer, are all inside the window and inside the frame. What may be long —
 * her talk, her greeting — scrolls inside the panel; the kept message, its band and the composer keep their room.
 *
 * A chat the board cannot read at all says so, and draws no greeting: a level, a count of factories and runs at work read from nothing
 * would be facts the board does not have. A chat the api cannot stream and is reading again on a beat says so quietly, apart from that
 * failure, and draws no greeting either, for the same reason (`ChatRetryingBand`).
 *
 * Her talk, her empty shell and her composer are the family's (`components/conversation/`), under the `chat` prefix every page of hers
 * reads; the panel is where her presence becomes the composer's words (`composerWords`), its label and its button (`composerButton`),
 * so no part of the family knows her vocabulary.
 *
 * While exactly one question of hers waits on the person, drawn as the form (`askInWords`), the composer invites their own words and
 * what they write answers that question (`wordsAnswer`) rather than being said to her as the next message; for a proposal, for
 * several questions and for none, it sends as it always does.
 *
 * Escape closes it while it floats, as the frame's own bar closes on Escape; the page closes on nothing, being a page.
 */
import { useEffect } from 'react';
import { CutFrame } from '@/components/look';
import { askInWords, wordsAnswer } from '@/lib/chatFollowing';
import { composerButton, composerWords, sessionOf } from '@/lib/nemia';
import type { NemiaLevel } from '@/lib/api';
import type { Presence } from '@/lib/presence';
import type { NemiaChat } from '@/lib/useNemiaChat';
import { cn } from '@/lib/utils';
import { Composer } from '@/components/conversation/Composer';
import { TalkEmpty } from '@/components/conversation/Talk';
import { ChatLostBand, ChatRetryingBand, ChatStoppedBand, ChatUnreadableBand } from './ChatBand';
import { ChatEmpty } from './ChatEmpty';
import { ChatHeader, type ChatMode } from './ChatHeader';
import { ChatKeptMessage } from './ChatKept';
import { ChatTalk } from './ChatTalk';

/** How far the panel's two corners are cut, in pixels: the look's card cut, nearest the canvas's 22. */
const PANEL_CUT = 24;

type Props = {
  chat: NemiaChat;
  nemia: NemiaLevel | undefined;
  presence: Presence;
  atWork: number;
  now: Date;
  mode: ChatMode;
  onGrow: () => void;
  onClose: () => void;
};

/** The panel: everything the canvas's states draw, each part deciding for itself whether it is drawn. */
export function ChatPanel({ chat, nemia, presence, atWork, now, mode, onGrow, onClose }: Props) {
  const { state, kept } = chat;
  const grown = mode !== 'float';
  const unreadable = state.error !== null;
  const retrying = state.retrying;
  const inWords = askInWords(state.events);

  useEffect(() => {
    if (mode === 'page') return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  return (
    <CutFrame
      hue={presence.down ? 'none' : 'alive'}
      size={PANEL_CUT}
      fill
      className={cn('flex min-w-0 min-h-0 flex-col', grown ? 'h-full w-full' : 'max-h-full w-full')}
    >
      <section
        aria-label="Nemia's chat"
        data-chat-panel={mode}
        className={cn('flex min-w-0 min-h-0 flex-col gap-3.5 px-4.5 pt-4 pb-4.5', grown ? 'h-full' : 'max-h-full')}
      >
        <ChatHeader nemia={nemia} presence={presence} now={now} mode={mode} onGrow={onGrow} onClose={onClose} />
        <hr className="shrink-0 border-outline-variant" />
        {presence.down && nemia !== undefined && !unreadable && <ChatStoppedBand words={sessionOf(nemia).words} />}
        {retrying !== null && <ChatRetryingBand why={retrying} />}
        {unreadable && <ChatUnreadableBand why={state.error ?? ''} />}
        {state.events.length > 0 ? (
          <ChatTalk events={state.events} unread={state.presence.unread} onRead={chat.markRead} onAnswer={chat.answer} />
        ) : (
          !state.loading &&
          !unreadable &&
          retrying === null && (
            <TalkEmpty marks="chat">
              <ChatEmpty nemia={nemia} presence={presence} atWork={atWork} onSend={chat.send} />
            </TalkEmpty>
          )
        )}
        {kept !== null && (
          <div className="flex shrink-0 flex-col gap-3.5">
            <ChatKeptMessage kept={kept} onAgain={chat.sendKept} onEdit={chat.editKept} onDiscard={chat.discardKept} />
            <ChatLostBand since={kept.at} now={now} />
          </div>
        )}
        <div className="shrink-0">
          <Composer
            marks="chat"
            label="Message to Nemia"
            placeholder={composerWords(presence, inWords !== undefined)}
            off={presence.notSent}
            sendLabel="Send"
            onSend={(text) => (inWords === undefined ? chat.send(text) : chat.answer(inWords.call, wordsAnswer(inWords, text)))}
            {...(composerButton(presence) === 'stop' ? { stop: { label: 'Stop her answer', press: chat.stop } } : {})}
          />
        </div>
      </section>
    </CutFrame>
  );
}
