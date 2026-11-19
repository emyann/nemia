/**
 * A way to put a readiness piece in place (`ReadinessFix`), served on a piece of the readiness read and on a harness's check, each a fix
 * to type or to start (`POST /api/readiness/fixes`).
 */
import { Schema } from 'effect';
import { describedNumber } from './meta.ts';
import { NeedAsk } from './workflow.ts';
import { FIX_KINDS } from './words.ts';

/**
 * A way to put a piece in place: what it does in words and its command — typed by the person where `startable` is false (`nemia
 * claude-token set`, `loginctl enable-linger`), or started by the server where it is true, which `index` names among the need's fixes —
 * with the answers it asks first, the pattern of a code its output shows, and its kind where it is no `puts` (`typed`, a command the
 * person types on the server; `removes`, one that takes a met piece away, a harness deactivated).
 */
export const ReadinessFix = Schema.Struct({
  message: Schema.String.annotate({ description: 'What the fix does, in words.' }),
  command: Schema.String.annotate({
    description: 'Its command: typed by the person where startable is false, or started by the server where it is true.',
  }),
  startable: Schema.Boolean.annotate({ description: 'Whether the server starts it, not the person.' }),
  index: Schema.optionalKey(describedNumber("Which of the need's fixes it is; absent where it is not startable.")),
  asks: Schema.optionalKey(Schema.Array(NeedAsk).annotate({ description: 'The answers it asks first.' })),
  code: Schema.optionalKey(Schema.String.annotate({ description: 'The pattern of a code its output shows.' })),
  kind: Schema.optionalKey(
    Schema.Literals(FIX_KINDS).annotate({
      description:
        'Its kind where it is no puts: typed, a command the person types on the server, or removes, one that takes a met piece away.',
    }),
  ),
});
export type ReadinessFix = typeof ReadinessFix.Type;
