/**
 * Nemia's face docked at the bottom right of every page of the board but the chat's own, every cue that holds beside it, and the panel
 * it opens above it (`ChatPanel`). It is the frame's, not a page's: it holds the one reader of her chat (`useNemiaChat`), so the stream
 * follows her whatever page a person is on, and her presence is read from the chat alone — never from the whole list of the runs, which
 * `frameReach` refuses the frame.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'react-aria-components';
import { CutCue } from '@/components/look';
import { levelQuery, openRunsQuery } from '@/lib/api';
import { presenceOf } from '@/lib/chatFollowing';
import { atWork } from '@/lib/footer';
import { cuesOf, dockWords } from '@/lib/presence';
import { useNemiaChat } from '@/lib/useNemiaChat';
import { useNow } from '@/lib/useNow';
import { ChatPanel } from './chat/ChatPanel';
import { NemiaFace } from './NemiaFace';
import type { ChatMode } from './chat/ChatHeader';

/** How wide her docked face is drawn, in pixels. */
const DOCK_FACE = 60;

/** Her face at the bottom right, its cues, and the panel over it, open as the person last left it on this page. */
export function NemiaDock() {
  const [mode, setMode] = useState<ChatMode | null>(null);
  const chat = useNemiaChat();
  const nemia = useQuery(levelQuery).data;
  const open = useQuery(openRunsQuery()).data;
  const now = new Date(useNow(30_000));
  const presence = presenceOf(chat.state.presence, nemia?.level, chat.kept !== null);
  const cues = cuesOf(presence);

  return (
    <div
      data-nemia-dock={mode ?? 'closed'}
      className="pointer-events-none fixed inset-0 z-30 flex flex-col items-end justify-end gap-3 p-7"
    >
      {mode !== null && (
        <div className={mode === 'grown' ? 'pointer-events-auto flex min-h-0 w-full flex-1' : 'pointer-events-auto w-[430px] max-w-full'}>
          <ChatPanel
            chat={chat}
            nemia={nemia}
            presence={presence}
            atWork={open ? atWork(open).runs : 0}
            now={now}
            mode={mode}
            onGrow={() => setMode((at) => (at === 'grown' ? 'float' : 'grown'))}
            onClose={() => setMode(null)}
          />
        </div>
      )}
      <div className="pointer-events-auto flex shrink-0 items-center gap-3">
        {cues.map((cue) => (
          <CutCue key={cue.words} hue={cue.hue}>
            {cue.words}
          </CutCue>
        ))}
        <Button
          data-nemia-dock-face
          aria-label={dockWords(presence, mode !== null)}
          onPress={() => setMode((at) => (at === null ? 'float' : null))}
          className="cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <NemiaFace presence={presence} size={DOCK_FACE} />
        </Button>
      </div>
    </div>
  );
}
