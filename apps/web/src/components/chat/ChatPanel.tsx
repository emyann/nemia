/**
 * Nemia's chat, as the canvas draws it: the look's cut frame — alive while her session is up, a quiet outline while she is down — her
 * header, the band that says why she stopped or that the board lost the daemon, her talk, the message this browser kept, and the
 * composer. Floating over the page, grown to the whole frame, or the page of its own at `/chat`, which is the same panel full-bleed.
 *
 * Escape closes it while it floats, as the frame's own bar closes on Escape; the page closes on nothing, being a page.
 */
import { useEffect } from 'react';
import { CutFrame } from '@/components/look';
import { sessionOf } from '@/lib/nemia';
import type { NemiaLevel } from '@/lib/api';
import type { Presence } from '@/lib/presence';
import type { NemiaChat } from '@/lib/useNemiaChat';
import { cn } from '@/lib/utils';
import { ChatLostBand, ChatStoppedBand } from './ChatBand';
import { ChatComposer } from './ChatComposer';
import { ChatEmpty } from './ChatEmpty';
import { ChatHeader, type ChatMode } from './ChatHeader';
import { ChatKeptMessage } from './ChatMessage';
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

  useEffect(() => {
    if (mode === 'page') return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  return (
    <CutFrame hue={presence.down ? 'none' : 'alive'} size={PANEL_CUT} className={cn('flex min-h-0 flex-col', grown && 'h-full')}>
      <section
        aria-label="Nemia's chat"
        data-chat-panel={mode}
        className={cn('flex min-h-0 flex-col gap-3.5 px-4.5 pt-4 pb-4.5', grown && 'h-full')}
      >
        <ChatHeader nemia={nemia} presence={presence} now={now} mode={mode} onGrow={onGrow} onClose={onClose} />
        <hr className="shrink-0 border-outline-variant" />
        {presence.down && nemia !== undefined && <ChatStoppedBand words={sessionOf(nemia).words} />}
        {state.events.length === 0 ? (
          <ChatEmpty nemia={nemia} presence={presence} atWork={atWork} onSend={chat.send} />
        ) : (
          <ChatTalk events={state.events} unread={state.presence.unread} onRead={chat.markRead} grown={grown} />
        )}
        {kept !== null && (
          <>
            <ChatKeptMessage kept={kept} onAgain={chat.sendKept} onEdit={chat.editKept} onDiscard={chat.discardKept} />
            <ChatLostBand since={kept.at} now={now} />
          </>
        )}
        <ChatComposer presence={presence} onSend={chat.send} />
      </section>
    </CutFrame>
  );
}
