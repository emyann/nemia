/**
 * The runners of the group's commands (`objects`' `RUN_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. A command's runner joins here in the change that moves its words;
 * the table is total over the group's names, so one left out does not compile.
 */
import type { RunCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { cancel, hold, refresh, route, wait } from './act.ts';
import { approve, retry, say } from './answer.ts';
import { prune, rm } from './forget.ts';
import { pause, pauseTimeout, resume } from './pause.ts';
import { start } from './start.ts';

/** Each of the group's commands' runner. */
export const RUN_RUNNERS: Readonly<Record<RunCommand, Runner>> = {
  start,
  retry,
  approve,
  route,
  refresh,
  say,
  cancel,
  hold,
  wait,
  rm,
  prune,
  pause,
  'pause-timeout': pauseTimeout,
  resume,
};
