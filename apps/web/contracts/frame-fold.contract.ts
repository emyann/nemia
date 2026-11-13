/**
 * How the frame stands around its one side sheet (`frameFold`, src/lib/frameFold.ts), from what holds now: how wide the window is, whether
 * the person keeps the rail open (the `sidebar_state` cookie's fold, as the sidebar provider holds it), whether the address's `?bar=`
 * names a thing, whether they opened her sheet, whether they asked for the rail back while it was folded for the sheet, and whether the
 * page is her chat's own (`/chat`). One sheet at a time: what the bar names takes the sheet, and naming one closes her chat
 * (`HerSheetProvider`). Level-triggered: the rail folded for the sheet is never written as the person's fold, so it comes back as it was
 * the moment the sheet closes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The window's width: narrower than a tablet (under 768, `useIsMobile`), 1600 and wider, or between. */
export type FrameWidth = 'narrow' | 'medium' | 'wide';

/** What the frame's fold is decided from. */
export type FrameAt = {
  readonly width: FrameWidth;
  /** The rail as the person last left it (`useSidebar().open`): open, or closed by them. */
  readonly railOpen: boolean;
  /** The address's `?bar=` names a thing to show (`useBar().open`), on any page, hers included. */
  readonly barOpen: boolean;
  /** Her sheet was opened by her face and not closed since. */
  readonly sheetOpen: boolean;
  /** While the rail was folded for the sheet, the person pressed the menu button to have it back; forgotten once no sheet is drawn. */
  readonly railAsked: boolean;
  /** The page is her chat's own (`staticData.ownsChat`, `/chat`). */
  readonly ownsChat: boolean;
};

/** The rail: wide with its labels, narrow, or, on a narrow screen, the modal drawer the top bar's menu button opens. */
export type RailForm = 'expanded' | 'collapsed' | 'drawer';

/** The sheet: not drawn, docked in the frame's layout beside the page, or the kit's modal sheet over the page. */
export type SheetForm = 'none' | 'docked' | 'modal';

/** What the one sheet shows: nothing, what the address's `?bar=` names, or her chat. */
export type SheetShows = 'none' | 'bar' | 'her';

/**
 * How the frame stands, what its sheet shows, and whether the rail is narrow only for the sheet (the menu button then asks for it back).
 */
export type FrameFold = {
  readonly rail: RailForm;
  readonly sheet: SheetForm;
  readonly shows: SheetShows;
  readonly foldedForSheet: boolean;
};

/** Her chat is wanted in the sheet: her face opened it, the page is not her chat's own, and no bar's thing has taken the sheet. */
const herShown = (at: FrameAt): boolean => at.sheetOpen && !at.ownsChat && !at.barOpen;

/** The sheet is wanted: the address names a bar's thing, or her chat is wanted in it. */
const sheetWanted = (at: FrameAt): boolean => at.barOpen || herShown(at);

/** The rail makes room for the docked sheet: between the narrow screen and 1600, and the person has not asked for it back. */
const foldsForSheet = (at: FrameAt): boolean => at.width === 'medium' && sheetWanted(at) && !at.railAsked;

const frameFoldSpec = spec<(at: FrameAt) => FrameFold>({
  ensures: {
    sheetDrawnWhenSomethingIsShown: {
      description: 'The sheet is drawn exactly where the address names a bar, or her face opened her chat off her own page',
      condition: ({ input: [at], output }) => (output.sheet !== 'none') === sheetWanted(at),
    },
    theBarTakesTheSheet: {
      description: 'The sheet shows what the address names exactly where it names one, on every page, hers included',
      condition: ({ input: [at], output }) => (output.shows === 'bar') === at.barOpen,
    },
    herChatOnlyWithNoBar: {
      description: 'The sheet shows her chat exactly where her face opened it, off her own page, and the address names no bar',
      condition: ({ input: [at], output }) => (output.shows === 'her') === herShown(at),
    },
    showsNothingOnlyWhenNoSheet: {
      description: 'The sheet shows nothing exactly where it is not drawn',
      condition: ({ output }) => (output.shows === 'none') === (output.sheet === 'none'),
    },
    modalOnlyOnANarrowScreen: {
      description: 'The sheet floats modal over the page exactly on a narrow screen; wider, it is docked beside the page',
      condition: ({ input: [at], output }) => (output.sheet === 'modal') === (sheetWanted(at) && at.width === 'narrow'),
    },
    drawerOnlyOnANarrowScreen: {
      description: 'The rail is the modal drawer exactly on a narrow screen',
      condition: ({ input: [at], output }) => (output.rail === 'drawer') === (at.width === 'narrow'),
    },
    aClosedRailStaysClosed: {
      description: 'A rail the person closed stays narrow, whether the sheet is open or not',
      condition: ({ input: [at], output }) => (at.width !== 'narrow' && !at.railOpen ? output.rail === 'collapsed' : true),
    },
    railFoldsBesideTheSheetBelowWide: {
      description:
        'Narrower than 1600, an open rail folds while the docked sheet is open, whatever it shows, unless the person asked for it back',
      condition: ({ input: [at], output }) => (at.railOpen && foldsForSheet(at) ? output.rail === 'collapsed' : true),
    },
    anOpenRailStaysOpenOtherwise: {
      description: 'An open rail stays open at 1600 and wider, with no sheet drawn, and once the person asked for it',
      condition: ({ input: [at], output }) =>
        at.width !== 'narrow' && at.railOpen && !foldsForSheet(at) ? output.rail === 'expanded' : true,
    },
    foldedForSheetSaysTheFold: {
      description: 'The rail is said folded for the sheet exactly where the person keeps it open and it is narrow',
      condition: ({ input: [at], output }) => output.foldedForSheet === (at.railOpen && output.rail === 'collapsed'),
    },
  },
});

/** `frameFold`'s type, which src/lib/frameFold.ts takes. */
export type FrameFoldOf = Implementation<typeof frameFoldSpec>;
