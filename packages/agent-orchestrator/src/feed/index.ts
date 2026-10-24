/**
 * The face of the feed's pure code: the line and what signs it, the fold, what a pass owes (`feed.ts`), and the closed table of reasons
 * the line names (`reason.ts`). A file outside this folder imports it here (`test/layout.test.ts`); the file itself, read and appended to,
 * is `feed.store.ts`'s, and the verbs are `feed.verb.ts`'s.
 */
export {
  DAEMON_STARTED,
  feedChanges,
  feedLineWords,
  feedPhase,
  feedSaidWords,
  feedWords,
  FEED_VERSION,
  foldFeed,
  freshFold,
  freshMemo,
  involvedOf,
  isRunLine,
  isStoreLine,
  lineAsRead,
  publishedOf,
  REMOVED,
  LINE_WORDS,
  startedLine,
  STORE,
  upgraded,
} from './feed.ts';
export type {
  DaemonLine,
  FeedAppended,
  FeedCloseout,
  FeedDenial,
  FeedFold,
  FeedLabels,
  FeedLine,
  FeedMemo,
  FeedPause,
  FeedPublished,
  FeedSaid,
  FeedWords,
  Involved,
  InvolvedKind,
  Once,
  Reason,
  RunLine,
  LineSource,
  LineType,
  StoreLine,
} from './feed.ts';
export { DENIED, isOnce, kindsOf, messageOf, reasonOf, REASONS, REASON_CODES, sourceOf, typeOf, waitsOf } from './reason.ts';
export type { Said } from './reason.ts';
