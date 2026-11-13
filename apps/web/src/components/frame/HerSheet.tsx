/**
 * Nemia's side sheet, the frame's: whether her face opened it and whether the person asked for the rail back while it was folded for it
 * (`HerSheetProvider`, `useHerSheet`), how the frame stands around it (`useFrameFold`, which reads `frameFold` off the window's width, the
 * rail as the person keeps it, the sheet and the page), and the sheet itself (`HerSheet`): the kit's standard side sheet, 400 wide, docked
 * in the frame's row at the right of the page, the page narrowing beside it, or on a narrow screen the kit's modal sheet over the page;
 * none on her own page (`/chat`), which is the panel itself. It holds her chat's panel (`ChatPanel`, `sheet`) with its own header, so the
 * kit's sheet is given no title and draws no header of its own.
 *
 * The rail folded for her sheet is read, never written: no `sidebar_state` cookie is written for it, and the rail comes back as it was
 * the moment the sheet closes. Her sheet stays open across pages, as the frame does.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMatches } from '@tanstack/react-router';
import { ChatPanel } from '@/components/nemia/chat/ChatPanel';
import { useNemiaPresence } from '@/components/nemia/useNemiaPresence';
import { SideSheet } from '@/components/ui/ds';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { levelQuery } from '@/lib/api/nemia';
import { openRunsQuery } from '@/lib/api/runs';
import { atWork } from '@/lib/footer';
import { frameFold, type FrameFold } from '@/lib/frameFold';
import { useMedia } from '@/lib/useMedia';
import { useNemiaChat } from '@/lib/useNemiaChat';
import { useNow } from '@/lib/useNow';

/** Her sheet as the frame holds it: open or not, the rail asked back, and the three presses that change them. */
type HerSheetState = {
  open: boolean;
  railAsked: boolean;
  toggle: () => void;
  close: () => void;
  askRail: () => void;
};

const HerSheetContext = createContext<HerSheetState | null>(null);

/** Holds her sheet for the whole frame, so it stays open across pages; closing it forgets the rail the person asked back. */
export function HerSheetProvider({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [railAsked, setRailAsked] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    setRailAsked(false);
  }, []);
  const toggle = useCallback(() => {
    setOpen((was) => !was);
    setRailAsked(false);
  }, []);
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
  return frameFold({
    width: narrow ? 'narrow' : wide ? 'wide' : 'medium',
    railOpen,
    sheetOpen: sheet.open,
    railAsked: sheet.railAsked,
    ownsChat,
  });
}

/** Her chat's panel as the sheet holds it, at the page at `path` with `search`. */
function SheetPanel({ path, search, onClose }: { path: string; search: Record<string, unknown>; onClose: () => void }) {
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

/** Her sheet at the page at `path` with `search`: docked beside the page, modal on a narrow screen, none on her own page. */
export function HerSheet({ path, search }: { path: string; search: Record<string, unknown> }) {
  const { close } = useHerSheet();
  const fold = useFrameFold();
  const narrow = useIsMobile();
  const ownsChat = useOwnsChat();
  if (ownsChat) return null;
  if (narrow)
    return (
      <SideSheet variant="modal" isOpen={fold.sheet === 'modal'} onClose={close} aria-label="Nemia's chat">
        {fold.sheet === 'modal' && <SheetPanel path={path} search={search} onClose={close} />}
      </SideSheet>
    );
  return (
    <div data-her-sheet={fold.sheet} className="sticky top-0 z-30 h-svh shrink-0 self-start">
      <SideSheet
        variant="standard"
        isOpen={fold.sheet === 'docked'}
        className="h-svh w-[400px] min-w-[400px] rounded-none border-l border-outline-variant bg-surface"
      >
        {fold.sheet === 'docked' && <SheetPanel path={path} search={search} onClose={close} />}
      </SideSheet>
    </div>
  );
}
