/**
 * Nemia's side sheet and the frame's own state around it: whether her face opened it (`HerSheetProvider`, `useHerSheet`), whether the
 * person keeps the factory pane open and the narrow screen's drawer is open (`FramePaneProvider`, `useFramePane`), how the frame stands
 * around that sheet (`useFrameFold`, which reads `frameFold` off the window's width, whether the page sits in a factory's pane and the
 * person keeps it open, the address's `?bar=`, her sheet and the page), and her chat's panel as the sheet holds it (`HerPanel`), with its
 * own header. The sheet itself is the frame's (`FrameSheet`), which shows what the address's `?bar=` names or her chat, one at a time.
 *
 * The pane covered by the sheet under 1600 is read, never written: no `sidebar_state` cookie is written for it, and the pane comes back as
 * it was the moment the sheet closes. Her sheet stays open across pages, as the frame does.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMatches } from '@tanstack/react-router';
import { ChatPanel } from '@/components/nemia/chat/ChatPanel';
import { useNemiaPresence } from '@/components/nemia/useNemiaPresence';
import { useSeat } from '@/components/nav/useSeat';
import { useIsMobile } from '@/hooks/use-mobile';
import { levelQuery } from '@/lib/api/nemia';
import { openRunsQuery } from '@/lib/api/runs';
import { atWork } from '@/lib/footer';
import { frameFold, type FrameFold, paneCookie, paneOpenOf } from '@/lib/frameFold';
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

/** The factory pane and the narrow screen's drawer as the frame holds them, and the presses that change them. */
type FramePaneState = {
  /** The window is narrower than a tablet, where the rail and the pane are a modal drawer. */
  narrow: boolean;
  /** The person keeps the factory pane open: unfolded by them, or never folded. */
  open: boolean;
  /** The narrow screen's drawer is open. */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** The menu button's press, and Ctrl+B's: opens or closes the drawer on a narrow screen, else folds or unfolds the pane. */
  toggle: () => void;
};

const FramePaneContext = createContext<FramePaneState | null>(null);

/**
 * Holds the factory pane's fold and the narrow screen's drawer for the whole frame. The fold opens as this browser's `sidebar_state`
 * cookie last kept it (`paneOpenOf`), and a fold or an unfold by the person writes it again (`paneCookie`); the drawer is kept for the
 * visit alone. Ctrl+B, or Cmd+B, toggles them where `shortcut` holds, the page sitting in a factory's pane.
 */
export function FramePaneProvider({ shortcut, children }: { shortcut: boolean; children?: ReactNode }) {
  const narrow = useIsMobile();
  const [open, setOpen] = useState(() => typeof document === 'undefined' || paneOpenOf(document.cookie));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggle = useCallback(() => {
    if (narrow) {
      setDrawerOpen((was) => !was);
      return;
    }
    const next = !open;
    setOpen(next);
    document.cookie = paneCookie(next);
  }, [narrow, open]);
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'b' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut, toggle]);
  const value = useMemo(() => ({ narrow, open, drawerOpen, setDrawerOpen, toggle }), [narrow, open, drawerOpen, toggle]);
  return <FramePaneContext.Provider value={value}>{children}</FramePaneContext.Provider>;
}

/** The factory pane and the drawer as the frame holds them, under `FramePaneProvider`. */
export function useFramePane(): FramePaneState {
  const held = useContext(FramePaneContext);
  if (held === null) throw new Error('useFramePane must be used within a FramePaneProvider: wrap the frame in it, as __root.tsx does.');
  return held;
}

/** How the frame stands now (`frameFold`), under `HerSheetProvider` and `FramePaneProvider`. */
export function useFrameFold(): FrameFold {
  const sheet = useHerSheet();
  const { open: paneOpen, narrow } = useFramePane();
  const hasPane = useSeat()?.level === 'factory';
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
