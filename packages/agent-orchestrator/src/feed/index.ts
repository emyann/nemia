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
  lineAsRead,
  publishedOf,
  REMOVED,
  startedLine,
  upgraded,
} from './feed.ts';
export type {
  DaemonLine,
  FeedAppended,
  FeedDenial,
  FeedFold,
  FeedLabels,
  FeedLine,
  FeedMemo,
  FeedPublished,
  FeedSaid,
  FeedWords,
  Involved,
  InvolvedKind,
  Reason,
  RunLine,
  SignalSource,
  SignalType,
} from './feed.ts';
export { DENIED, kindsOf, messageOf, reasonOf, REASONS, REASON_CODES, typeOf, waitsOf } from './reason.ts';
export type { Said } from './reason.ts';
