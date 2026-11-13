/**
 * Nemia's side sheet, the frame's: whether her face opened it and whether the person asked for the rail back while it was folded for the
 * frame's sheet (`HerSheetProvider`, `useHerSheet`), how the frame stands around that sheet (`useFrameFold`, which reads `frameFold` off
 * the window's width, the rail as the person keeps it, the address's `?bar=`, her sheet and the page), and her chat's panel as the sheet
 * holds it (`HerPanel`), with its own header. The sheet itself is the frame's (`FrameSheet`), which shows what the address's `?bar=` names
 * or her chat, one at a time.
 *
 * The rail folded for the sheet is read, never written: no `sidebar_state` cookie is written for it, and the rail comes back as it was
 * the moment the sheet closes. Her sheet stays open across pages, as the frame does.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMatches } from '@tanstack/react-router';
import { ChatPanel } from '@/components/nemia/chat/ChatPanel';
import { useNemiaPresence } from '@/components/nemia/useNemiaPresence';
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

/** Her sheet as the frame holds it: open or not, the rail asked back, and the presses that change them. */
type HerSheetState = {
  open: boolean;
  railAsked: boolean;
  /** Her face's press: closes her where the sheet shows her, else shows her in it, closing what the address's `?bar=` names. */
  toggle: () => void;
  close: () => void;
  askRail: () => void;
};

const HerSheetContext = createContext<HerSheetState | null>(null);

/**
 * Holds her sheet for the whole frame, so it stays open across pages. One sheet at a time: when the address comes to name a bar's thing
 * (a press, a link, Back), her open flag clears, so closing that bar leaves no sheet; her face shows her again, closing the bar. The rail
 * the person asked back is forgotten once no sheet is drawn.
 */
export function HerSheetProvider({ children }: { children?: ReactNode }) {
  const bar = useBar();
  const barOpen = bar.open !== undefined;
  const ownsChat = useOwnsChat();
  const [open, setOpen] = useState(false);
  const [railAsked, setRailAsked] = useState(false);
  const [barWas, setBarWas] = useState(barOpen);
  if (barOpen !== barWas) {
    setBarWas(barOpen);
    if (barOpen && open) setOpen(false);
  }
  const drawn = barOpen || (open && !ownsChat);
  if (!drawn && railAsked) setRailAsked(false);
  const shown = open && !ownsChat && !barOpen;
  const closeBar = bar.close;
  const close = useCallback(() => {
    setOpen(false);
    setRailAsked(false);
  }, []);
  const toggle = useCallback(() => {
    if (shown) {
      close();
      return;
    }
    setOpen(true);
    if (barOpen) closeBar();
  }, [shown, barOpen, close, closeBar]);
  const askRail = useCallback(() => setRailAsked(true), []);
  const value = useMemo(() => ({ open, railAsked, toggle, close, askRail }), [open, railAsked, toggle, close, askRail]);
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
  const { open: railOpen } = useSidebar();
  const narrow = useIsMobile();
  const wide = useMedia('(min-width: 1600px)', true);
  const ownsChat = useOwnsChat();
  const barOpen = useBar().open !== undefined;
  return frameFold({
    width: narrow ? 'narrow' : wide ? 'wide' : 'medium',
    railOpen,
    barOpen,
    sheetOpen: sheet.open,
    railAsked: sheet.railAsked,
    ownsChat,
  });
}

/** Her chat's panel as the frame's sheet holds it (`FrameSheet`), at the page at `path` with `search`. */
export function HerPanel({ path, search, onClose }: { path: string; search: Record<string, unknown>; onClose: () => void }) {
  const chat = useNemiaChat();
  const nemia = useQuery(levelQuery).data;
  const open = useQuery(openRunsQuery()).data;
  const now = new Date(useNow(30_000));
  const presence = useNemiaPresence(path, search);
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
