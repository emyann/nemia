/**
 * What a write of a factory or of one of its parts did (`FactoryWritten`), carried on the answer of each write of the Factory, a Hire, a
 * Schedule, a Volume and an MCP server alone, never on a read.
 */
import { Schema } from 'effect';

/**
 * What a write of a factory or of one of its parts did, said on the write's answer alone and never on a read: the file it wrote, whether
 * it found it so already and changed nothing (`already`), and what it replaced — a policy, an agent, a cron or an address (`was`), or the
 * dollars of a cost line (`replaced`) — null where it replaced nothing.
 */
export const FactoryWritten = Schema.Struct({
  file: Schema.String.annotate({ description: 'The file the write wrote.' }),
  already: Schema.optionalKey(Schema.Boolean.annotate({ description: 'Whether it was so already and the write changed nothing.' })),
  was: Schema.optionalKey(
    Schema.NullOr(Schema.String).annotate({
      description: 'What the write replaced, a policy, an agent, a cron or an address; null where it replaced nothing.',
    }),
  ),
  replaced: Schema.optionalKey(
    Schema.NullOr(Schema.Finite).annotate({
      description: 'The dollars of the cost line the write replaced; null where it replaced nothing.',
    }),
  ),
}).annotate({
  description: "What this write did, on a write's answer alone: the file it wrote, whether it was so already, and what it replaced.",
});
export type FactoryWritten = typeof FactoryWritten.Type;
