/**
 * How the frame stands around its one side sheet and its factory pane (`frameFold`, src/lib/frameFold.ts), from what holds now: how wide
 * the window is, whether the page sits in a factory's pane (`seatOf`, src/components/nav/nav.ts), whether the person keeps that pane open
 * (the `sidebar_state` cookie's fold, as the frame's `FramePaneProvider` holds it), whether the address's `?bar=` names a thing, whether
 * they opened her sheet, and whether the page is her chat's own (`/chat`). The rail is the store's and never folds: it is the collapsed
 * rail at the window's left, or on a narrow screen the modal drawer. One sheet at a time: what the bar names takes the sheet, and naming
 * one closes her chat (`HerSheetProvider`). At 1600 and wider the sheet is the third pane, beside the factory pane; narrower it opens over
 * the factory pane, which comes back the moment it closes. Level-triggered: the pane covered by the sheet is never written as the person's
 * fold.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The window's width: narrower than a tablet (under 768, `useIsMobile`), 1600 and wider, or between. */
export type FrameWidth = 'narrow' | 'medium' | 'wide';

/** What the frame's fold is decided from. */
export type FrameAt = {
  readonly width: FrameWidth;
  /** The page sits in one factory's pane (`seatOf` answers the factory level), so the frame draws that pane. */
  readonly hasPane: boolean;
  /** The factory pane as the person last left it (`useFramePane().open`): open, or folded by them with the menu button or Ctrl+B. */
  readonly paneOpen: boolean;
  /** The address's `?bar=` names a thing to show (`useBar().open`), on any page, hers included. */
  readonly barOpen: boolean;
  /** Her sheet was opened by her face and not closed since. */
  readonly sheetOpen: boolean;
  /** The page is her chat's own (`staticData.ownsChat`, `/chat`). */
  readonly ownsChat: boolean;
};

/** The store's rail: docked at the window's left, collapsed, or, on a narrow screen, the modal drawer the menu button opens. */
export type RailForm = 'docked' | 'drawer';

/**
 * The factory pane: not drawn, the page sitting in no factory; docked, the list pane left of the page; folded by the person; covered by
 * the docked sheet under 1600; or, on a narrow screen, a section of the modal drawer under the rail's groups.
 */
export type PaneForm = 'none' | 'docked' | 'folded' | 'covered' | 'drawer';

/** The sheet: not drawn, docked in the frame's layout beside the page, or the kit's modal sheet over the page. */
export type SheetForm = 'none' | 'docked' | 'modal';

/** What the one sheet shows: nothing, what the address's `?bar=` names, or her chat. */
export type SheetShows = 'none' | 'bar' | 'her';

/** How the frame stands: its rail, its factory pane, its sheet and what the sheet shows. */
export type FrameFold = {
  readonly rail: RailForm;
  readonly pane: PaneForm;
  readonly sheet: SheetForm;
  readonly shows: SheetShows;
};

/** Her chat is wanted in the sheet: her face opened it, the page is not her chat's own, and no bar's thing has taken the sheet. */
const herShown = (at: FrameAt): boolean => at.sheetOpen && !at.ownsChat && !at.barOpen;

/** The sheet is wanted: the address names a bar's thing, or her chat is wanted in it. */
const sheetWanted = (at: FrameAt): boolean => at.barOpen || herShown(at);

/** The factory pane is drawn beside the page as the person keeps it: the page sits in one, the screen is not narrow, and it is open. */
const paneKept = (at: FrameAt): boolean => at.hasPane && at.width !== 'narrow' && at.paneOpen;

/** The docked sheet takes the factory pane's room: under 1600, wider than narrow, while the sheet is wanted. */
const sheetTakesThePane = (at: FrameAt): boolean => at.width === 'medium' && sheetWanted(at);

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
    theRailIsADrawerOnlyOnANarrowScreen: {
      description: "The store's rail is the modal drawer exactly on a narrow screen, and docked at the window's left on every other",
      condition: ({ input: [at], output }) => (output.rail === 'drawer') === (at.width === 'narrow'),
    },
    noPaneOffAFactory: {
      description: 'The factory pane is drawn in no form exactly where the page sits in no factory',
      condition: ({ input: [at], output }) => (output.pane === 'none') === !at.hasPane,
    },
    thePaneJoinsTheDrawerOnANarrowScreen: {
      description: "On a narrow screen a page's factory pane is a section of the modal drawer, and nowhere else is it one",
      condition: ({ input: [at], output }) => (output.pane === 'drawer') === (at.hasPane && at.width === 'narrow'),
    },
    aFoldedPaneStaysFolded: {
      description: 'A factory pane the person folded stays folded, whether the sheet is open or not, wider than a narrow screen',
      condition: ({ input: [at], output }) => (output.pane === 'folded') === (at.hasPane && at.width !== 'narrow' && !at.paneOpen),
    },
    theSheetCoversThePaneUnderWide: {
      description: 'Under 1600 the docked sheet opens over an open factory pane, whatever it shows, and the pane is back once it closes',
      condition: ({ input: [at], output }) => (output.pane === 'covered') === (paneKept(at) && sheetTakesThePane(at)),
    },
    thePaneIsDockedOtherwise: {
      description:
        'An open factory pane is docked left of the page at 1600 and wider, the sheet its third pane, and narrower with no sheet',
      condition: ({ input: [at], output }) => (output.pane === 'docked') === (paneKept(at) && !sheetTakesThePane(at)),
    },
  },
});

/** `frameFold`'s type, which src/lib/frameFold.ts takes. */
export type FrameFoldOf = Implementation<typeof frameFoldSpec>;
