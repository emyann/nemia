/**
 * Whether an ending's approval still names the work as it stands (agent-orchestrator, src/status/status.ts, `workStands`): each step its
 * `work` names is on the try it was on when the approval was given, so a send-back of that work spends it (`approvalOf`,
 * `spentApprovals`). Its own spec, so a contract that reads an approval reads this fact, not the walk of the record behind it.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Approval, Run } from '../src/record/record.ts';

const workStandsSpec = spec<(run: Run, a: Approval) => boolean>({
  // Which tries of the record spend an approval that names work is the code's walk of it, held by its tests (`ship.test.ts`, the gate's
  // `gateLines` table): the gate's and the standing's laws read an approval through this spec, and hold whichever it answers.
  open: ['output'],
  ensures: {
    noWorkStands: {
      description: 'An approval that names no work — of a gate that is no ending, or one an older nemia wrote — stands',
      condition: ({ input: [, a], output }) => a.work !== undefined || output,
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type WorkStands = Implementation<typeof workStandsSpec>;
