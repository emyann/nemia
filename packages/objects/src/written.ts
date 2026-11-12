/**
 * What a write of a factory or of one of its parts did (`FactoryWritten`), carried on the answer of each write of the Factory, a Hire, a
 * Schedule and an MCP server alone, never on a read.
 */
import { Schema } from 'effect';

/**
 * What a write of a factory or of one of its parts did, said on the write's answer alone and never on a read: the file it wrote, whether
 * it found it so already and changed nothing (`already`), and what it replaced — a policy, an agent, a cron or an address (`was`), or the
 * dollars of a cost line (`replaced`) — null where it replaced nothing.
 */
export const FactoryWritten = Schema.Struct({
  file: Schema.String,
  already: Schema.optionalKey(Schema.Boolean),
  was: Schema.optionalKey(Schema.NullOr(Schema.String)),
  replaced: Schema.optionalKey(Schema.NullOr(Schema.Finite)),
});
export type FactoryWritten = typeof FactoryWritten.Type;
