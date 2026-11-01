/**
 * Where a harness's transcript event came from (agent-runtime, src/harness/seam.ts, `originOf`), as the Agent SDK names it
 * (`SDKMessageOrigin['kind']`): a word the SDK names is read as itself, and any other word, one the SDK adds later included, as
 * `unknown`, never as a person's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { TranscriptOriginKind } from '../src/harness/seam.ts';

/** The words the Agent SDK has for a message's origin. */
const named = (written: string): boolean =>
  written === 'human' ||
  written === 'channel' ||
  written === 'peer' ||
  written === 'task-notification' ||
  written === 'coordinator' ||
  written === 'unclassified' ||
  written === 'observer' ||
  written === 'auto-continuation' ||
  written === 'observer-activity';

const originSpec = spec<(written: string) => TranscriptOriginKind>({
  ensures: {
    aKnownWordIsItself: {
      description: 'A word the Agent SDK names for an origin is read as itself',
      condition: ({ input: [written], output }) => (named(written) ? output === written : true),
    },
    anyOtherWordIsUnknown: {
      description: 'Any other word is read as unknown',
      condition: ({ input: [written], output }) => (named(written) ? true : output === 'unknown'),
    },
  },
});

export type OriginOf = Implementation<typeof originSpec>;
