/**
 * How the frame stands around Nemia's side sheet (`frameFold`, src/lib/frameFold.ts), from what holds now: how wide the window is, whether
 * the person keeps the rail open (the `sidebar_state` cookie's fold, as the sidebar provider holds it), whether they opened her sheet,
 * whether they asked for the rail back while it was folded for the sheet, and whether the page is her chat's own (`/chat`).
 * Level-triggered: the rail folded for her sheet is never written as the person's fold, so it comes back as it was the moment the sheet
 * closes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The window's width: narrower than a tablet (under 768, `useIsMobile`), 1600 and wider, or between. */
export type FrameWidth = 'narrow' | 'medium' | 'wide';

/** What the frame's fold is decided from. */
export type FrameAt = {
  readonly width: FrameWidth;
  /** The rail as the person last left it (`useSidebar().open`): open, or closed by them. */
  readonly railOpen: boolean;
  /** Her sheet was opened by her face and not closed since. */
  readonly sheetOpen: boolean;
  /** While the rail was folded for her sheet, the person pressed the menu button to have it back; forgotten when the sheet closes. */
  readonly railAsked: boolean;
  /** The page is her chat's own (`staticData.ownsChat`, `/chat`). */
  readonly ownsChat: boolean;
};

/** The rail: wide with its labels, narrow, or, on a narrow screen, the modal drawer the top bar's menu button opens. */
export type RailForm = 'expanded' | 'collapsed' | 'drawer';

/** Her sheet: not drawn, docked in the frame's layout beside the page, or the kit's modal sheet over the page. */
export type SheetForm = 'none' | 'docked' | 'modal';

/** How the frame stands, and whether the rail is narrow only for her sheet (the menu button then asks for it back). */
export type FrameFold = { readonly rail: RailForm; readonly sheet: SheetForm; readonly foldedForSheet: boolean };

/** Her sheet is wanted where it is drawn: opened, on a page that is not her chat's own. */
const sheetWanted = (at: FrameAt): boolean => at.sheetOpen && !at.ownsChat;

/** The rail makes room for her docked sheet: between the narrow screen and 1600, and the person has not asked for it back. */
const foldsForSheet = (at: FrameAt): boolean => at.width === 'medium' && sheetWanted(at) && !at.railAsked;

const frameFoldSpec = spec<(at: FrameAt) => FrameFold>({
  ensures: {
    sheetDrawnWhenOpenedOffHerPage: {
      description: 'Her sheet is drawn exactly where her face opened it and the page is not her chat, which is the panel itself',
      condition: ({ input: [at], output }) => (output.sheet !== 'none') === sheetWanted(at),
    },
    modalOnlyOnANarrowScreen: {
      description: 'Her sheet floats modal over the page exactly on a narrow screen; wider, it is docked beside the page',
      condition: ({ input: [at], output }) => (output.sheet === 'modal') === (sheetWanted(at) && at.width === 'narrow'),
    },
    drawerOnlyOnANarrowScreen: {
      description: 'The rail is the modal drawer exactly on a narrow screen',
      condition: ({ input: [at], output }) => (output.rail === 'drawer') === (at.width === 'narrow'),
    },
    aClosedRailStaysClosed: {
      description: 'A rail the person closed stays narrow, whether her sheet is open or not',
      condition: ({ input: [at], output }) => (at.width !== 'narrow' && !at.railOpen ? output.rail === 'collapsed' : true),
    },
    railFoldsBesideHerSheetBelowWide: {
      description: 'Narrower than 1600, an open rail folds while her docked sheet is open, unless the person asked for it back',
      condition: ({ input: [at], output }) => (at.railOpen && foldsForSheet(at) ? output.rail === 'collapsed' : true),
    },
    anOpenRailStaysOpenOtherwise: {
      description: 'An open rail stays open at 1600 and wider, with her sheet closed, on her page, and once the person asked for it',
      condition: ({ input: [at], output }) =>
        at.width !== 'narrow' && at.railOpen && !foldsForSheet(at) ? output.rail === 'expanded' : true,
    },
    foldedForSheetSaysTheFold: {
      description: 'The rail is said folded for her sheet exactly where the person keeps it open and it is narrow',
      condition: ({ input: [at], output }) => output.foldedForSheet === (at.railOpen && output.rail === 'collapsed'),
    },
  },
});

/** `frameFold`'s type, which src/lib/frameFold.ts takes. */
export type FrameFoldOf = Implementation<typeof frameFoldSpec>;
