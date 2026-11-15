/**
 * Nemia's side sheet, the frame's: whether her face opened it (`HerSheetProvider`, `useHerSheet`), how the frame stands around that sheet
 * (`useFrameFold`, which reads `frameFold` off the window's width, whether the page sits in a factory's pane and the person keeps it open,
 * the address's `?bar=`, her sheet and the page), and her chat's panel as the sheet holds it (`HerPanel`), with its own header. The sheet
 * itself is the frame's (`FrameSheet`), which shows what the address's `?bar=` names or her chat, one at a time.
 *
 * The pane covered by the sheet under 1600 is read, never written: no `sidebar_state` cookie is written for it, and the pane comes back as
 * it was the moment the sheet closes. Her sheet stays open across pages, as the frame does.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMatches } from '@tanstack/react-router';
import { ChatPanel } from '@/components/nemia/chat/ChatPanel';
import { useNemiaPresence } from '@/components/nemia/useNemiaPresence';
import { useSeat } from '@/components/nav/useSeat';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { levelQuery } from '@/lib/api/nemia';
import { openRunsQuery } from '@/lib/api/runs';
import { atWork } from '@/lib/footer';
import { frameFold, type FrameFold } from '@/lib/frameFold';
import { useMedia } from '@/lib/useMedia';
import { useBar } from '@/lib/useBar';
import { useNemiaChat } from '@/lib/useNemiaChat';
import { useNow } from '@/lib/useNow';

/** Her sheet as the frame holds it: open or not, and the presses that change it. */
type HerSheetState = {
  open: boolean;
  /** Her face's press: closes her where the sheet shows her, else shows her in it, closing what the address's `?bar=` names. */
  toggle: () => void;
  close: () => void;
};

const HerSheetContext = createContext<HerSheetState | null>(null);

/**
 * Holds her sheet for the whole frame, so it stays open across pages. One sheet at a time: when the address comes to name a bar's thing
 * (a press, a link, Back), her open flag clears, so closing that bar leaves no sheet; her face shows her again, closing the bar.
 */
export function HerSheetProvider({ children }: { children?: ReactNode }) {
  const bar = useBar();
  const barOpen = bar.open !== undefined;
  const ownsChat = useOwnsChat();
  const [open, setOpen] = useState(false);
  const [barWas, setBarWas] = useState(barOpen);
  if (barOpen !== barWas) {
    setBarWas(barOpen);
    if (barOpen && open) setOpen(false);
  }
  const shown = open && !ownsChat && !barOpen;
  const closeBar = bar.close;
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    if (shown) {
      close();
      return;
    }
    setOpen(true);
    if (barOpen) closeBar();
  }, [shown, barOpen, close, closeBar]);
  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close]);
  return <HerSheetContext.Provider value={value}>{children}</HerSheetContext.Provider>;
}

/** Her sheet as the frame holds it, under `HerSheetProvider`. */
export function useHerSheet(): HerSheetState {
  const held = useContext(HerSheetContext);
  if (held === null) throw new Error('useHerSheet must be used within a HerSheetProvider: wrap the frame in it, as __root.tsx does.');
  return held;
}

/** Whether the page is her chat's own: a matched route's `staticData` says it `ownsChat`. */
export function useOwnsChat(): boolean {
  return useMatches({ select: (matches) => matches.some((match) => match.staticData?.ownsChat) });
}

/** How the frame stands now (`frameFold`), under `HerSheetProvider` and the sidebar's provider. */
export function useFrameFold(): FrameFold {
  const sheet = useHerSheet();
  const { open: paneOpen } = useSidebar();
  const hasPane = useSeat()?.level === 'factory';
  const narrow = useIsMobile();
  const wide = useMedia('(min-width: 1600px)', true);
  const ownsChat = useOwnsChat();
  const barOpen = useBar().open !== undefined;
  return frameFold({
    width: narrow ? 'narrow' : wide ? 'wide' : 'medium',
    hasPane,
    paneOpen,
    barOpen,
    sheetOpen: sheet.open,
    ownsChat,
  });
}

/** Her chat's panel as the frame's sheet holds it (`FrameSheet`), at the page at `path`. */
export function HerPanel({ path, onClose }: { path: string; onClose: () => void }) {
  const chat = useNemiaChat();
  const nemia = useQuery(levelQuery).data;
  const open = useQuery(openRunsQuery()).data;
  const now = new Date(useNow(30_000));
  const presence = useNemiaPresence(path);
  return (
    <ChatPanel
      chat={chat}
      nemia={nemia}
      presence={presence}
      atWork={open ? atWork(open).runs : 0}
      now={now}
      mode="sheet"
      onClose={onClose}
    />
  );
}
