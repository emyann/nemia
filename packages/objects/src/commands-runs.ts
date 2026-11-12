/**
 * The words of the run's verbs: start, retry, approve, route, refresh, say, cancel, hold, wait, rm, prune and the store's pause. The
 * group is cut by concept into files beside this one (`commands-runs-<concept>.ts`): what acts on one run as it stands, what answers
 * what waits on a person, what lets go of runs that are over, the pause, and the start. This file lists them, and is the group's one
 * door to `index.ts`. Pure.
 */
import type { CommandWords } from './command.ts';
import {
  BY_CAP,
  CANCEL_WORDS,
  HOLD_WORDS,
  holdRefusal,
  REFRESH_WORDS,
  refreshRefusal,
  ROUTE_WORDS,
  WAIT_WORDS,
  waitRefusal,
  WHY_CAP,
} from './commands-runs-act.ts';
import { ANSWER_HELP, answerFlag, APPROVE_WORDS, approveRefusal, RETRY_WORDS, retryRefusal, SAY_WORDS } from './commands-runs-answer.ts';
import { PRUNE_WORDS, RM_WORDS, rmRefusal } from './commands-runs-forget.ts';
import { PAUSE_TIMEOUT_WORDS, PAUSE_WORDS, pauseRefusal, pauseTimeoutCheck, RESUME_WORDS, timeoutRefusal } from './commands-runs-pause.ts';
import { START_WORDS } from './commands-runs-start.ts';

export {
  ANSWER_HELP,
  APPROVE_WORDS,
  BY_CAP,
  CANCEL_WORDS,
  HOLD_WORDS,
  PAUSE_TIMEOUT_WORDS,
  PAUSE_WORDS,
  PRUNE_WORDS,
  REFRESH_WORDS,
  RESUME_WORDS,
  RETRY_WORDS,
  RM_WORDS,
  ROUTE_WORDS,
  SAY_WORDS,
  START_WORDS,
  WAIT_WORDS,
  WHY_CAP,
  answerFlag,
  approveRefusal,
  holdRefusal,
  pauseRefusal,
  pauseTimeoutCheck,
  refreshRefusal,
  retryRefusal,
  rmRefusal,
  timeoutRefusal,
  waitRefusal,
};

/** The group's words, in the order the help lists them. */
export const RUN_WORDS = [
  START_WORDS,
  RETRY_WORDS,
  APPROVE_WORDS,
  ROUTE_WORDS,
  REFRESH_WORDS,
  SAY_WORDS,
  CANCEL_WORDS,
  HOLD_WORDS,
  WAIT_WORDS,
  RM_WORDS,
  PRUNE_WORDS,
  PAUSE_WORDS,
  PAUSE_TIMEOUT_WORDS,
  RESUME_WORDS,
] as const satisfies readonly CommandWords[];
