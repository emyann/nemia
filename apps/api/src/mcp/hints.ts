/**
 * What a tool of the MCP port says of itself: MCP's `readOnlyHint` and `destructiveHint`, from the class of the verb it is named from and
 * the method of the endpoint it calls (`toolHints`, proved by `contracts/tool-hints.contract.ts`). The port forces no ask: the person's
 * own host reads these hints and decides whether to ask before a call.
 */
import type { CommandSpec } from 'agent-orchestrator';
import type { ToolClass, ToolHintsOf } from '../../contracts/tool-hints.contract.ts';

/** A verb's class as the hints read it: its word, and `setting` for the setting form of a verb that reads bare. */
export const classWordOf = (cls: CommandSpec['class']): ToolClass => (typeof cls === 'object' ? 'setting' : cls);

/**
 * The hints of a tool whose verb is of class `cls` and whose endpoint answers `method`: read-only exactly when the endpoint is a GET, and
 * destructive exactly when it writes and its verb is one the inside seat would not run unasked (asked each time, out of its reach, or the
 * setting form of a verb that reads bare).
 */
export const toolHints: ToolHintsOf = (cls, method) => {
  const readOnlyHint = method === 'GET';
  return { readOnlyHint, destructiveHint: !readOnlyHint && (cls === 'ask' || cls === 'none' || cls === 'setting') };
};
