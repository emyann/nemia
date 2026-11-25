/**
 * Where a task the MCP port follows stands (apps/api, src/mcp/tasks.ts, `followedStateOf`): a tool whose link follows what its call
 * started (`LinkTask`'s `follow` in `objects`' command table) names the read that says how that thing stands, the key of its phase, and
 * the phases that end it, succeeded or failed. The task is `working` while the phase is neither, and ended once it is one: succeeded, its
 * result the read's answer; failed, the same answer as the tool's error (`isError`), which the tasks extension still calls `completed`,
 * since the call itself was answered. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** Where a followed task stands: still at work, or ended, succeeded or failed. */
export type FollowedState = 'working' | 'succeeded' | 'failed';

/** Whether `phases` names `phase`. */
const names = (phases: readonly string[], phase: string) => phases.includes(phase);

const followedStateSpec = spec<(phase: string, succeeded: readonly string[], failed: readonly string[]) => FollowedState>({
  requires: ({ input: [phase, succeeded, failed] }) => !(names(succeeded, phase) && names(failed, phase)),
  ensures: {
    succeededExactlyOnAPhaseThatEndsWell: {
      description: 'A followed task has succeeded exactly when its phase is one the link says ends it well',
      condition: ({ input: [phase, succeeded], output }) => (output === 'succeeded') === names(succeeded, phase),
    },
    failedExactlyOnAPhaseThatEndsBadly: {
      description: 'A followed task has failed exactly when its phase is one the link says ends it badly',
      condition: ({ input: [phase, , failed], output }) => (output === 'failed') === names(failed, phase),
    },
  },
});

/** `followedStateOf`'s type, which `src/mcp/tasks.ts` takes. */
export type FollowedStateOf = Implementation<typeof followedStateSpec>;
