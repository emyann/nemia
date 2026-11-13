/**
 * The runners of the group's commands (`objects`' `INBOX_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. A command's runner joins here in the change that moves its words;
 * the table is total over the group's names, so one left out does not compile.
 */
import type { InboxCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { inboxAdd } from './add.ts';
import { inboxFrom } from './from.ts';
import { labelInbox, labelRun } from './label.ts';
import { inboxQueue } from './queue.ts';
import { inboxRm } from './rm.ts';

/** Each of the group's commands' runner. */
export const INBOX_RUNNERS: Readonly<Record<InboxCommand, Runner>> = {
  'inbox add': inboxAdd,
  'inbox queue': inboxQueue,
  'inbox from': inboxFrom,
  'inbox rm': inboxRm,
  'label run': labelRun,
  'label inbox': labelInbox,
};
