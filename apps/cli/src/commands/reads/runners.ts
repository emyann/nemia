/**
 * The runners of the group's commands (`objects`' `READ_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. The reads print from `src/reads/` and `src/watch/`, which follow
 * the feed's stream alone; the table is total over the group's names, so one left out does not compile.
 */
import type { ReadCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { closeout } from '../../reads/closeout.ts';
import { inbox } from '../../reads/inbox.ts';
import { ls } from '../../reads/ls.ts';
import { show } from '../../reads/show.ts';
import { watch } from '../../watch/watch.ts';

/** Each of the group's commands' runner. */
export const READ_RUNNERS: Readonly<Record<ReadCommand, Runner>> = {
  inbox,
  ls,
  show,
  closeout,
  watch,
};
