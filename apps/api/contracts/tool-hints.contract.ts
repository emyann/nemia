/**
 * What a tool of the MCP port says of itself (apps/api, src/mcp/hints.ts, `toolHints`): MCP's `readOnlyHint` and `destructiveHint`
 * annotations, from the class of the verb the tool is named from (the command table's `class`, `CommandClass`) and the method of the
 * endpoint of `objects`' `Api` it calls. The port forces no ask: whether the host asks the person before a call is the person's own host
 * settings, which read these hints, as a factory's level decides for the inside seat. So a hint never says less than the verb is: a call
 * that writes nothing is read-only, and one whose verb asks the person inside (`ask`), is out of an agent's reach there (`none`), or is the
 * setting form of a verb that reads bare, is destructive. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The class of a verb of the command table (`CommandClass`) as the hints read it: each of its words, and `setting` for its setting form
 * (`{ bare: 'read', sets }`), which `src/mcp/hints.ts` names so (`classWordOf`). A word, since tsverify models no union of a string and
 * a record, and the laws read no more of the setting form than that it is one.
 */
export type ToolClass = 'read' | 'act' | 'ask' | 'answer' | 'none' | 'setting';

/** The method of the endpoint a tool calls. Implement may read it off the endpoint's own type, which changes no law. */
export type ToolMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The annotations a tool carries, as MCP's tool annotations name them. */
export type ToolHints = { readonly readOnlyHint: boolean; readonly destructiveHint: boolean };

/** Whether an endpoint of `method` writes nothing: the api's guard stands in front of every other. */
const reads = (method: ToolMethod): boolean => method === 'GET';

/** Whether the inside seat would not run a write of `cls` unasked: asked each time, out of reach, or a read's setting form. */
const asksInside = (cls: ToolClass): boolean => cls === 'ask' || cls === 'none' || cls === 'setting';

const toolHintsSpec = spec<(cls: ToolClass, method: ToolMethod) => ToolHints>({
  ensures: {
    readOnlyExactlyWhenItReads: {
      description: 'A tool is read-only exactly when the endpoint it calls writes nothing',
      condition: ({ input: [, method], output }) => output.readOnlyHint === reads(method),
    },
    aReadIsNeverDestructive: {
      description: 'A tool that writes nothing is never destructive',
      condition: ({ input: [, method], output }) => !reads(method) || !output.destructiveHint,
    },
    aWriteTheInsideSeatAsksIsDestructive: {
      description: 'A write whose verb the inside seat would not run unasked is destructive',
      condition: ({ input: [cls, method], output }) => reads(method) || !asksInside(cls) || output.destructiveHint,
    },
    aWriteThatRunsUnaskedIsNotDestructive: {
      description: 'A write whose verb the inside seat runs unasked (read, act, answer) is not destructive',
      condition: ({ input: [cls, method], output }) => reads(method) || asksInside(cls) || !output.destructiveHint,
    },
  },
});

/** `toolHints`'s type, which `src/mcp/hints.ts` takes. */
export type ToolHintsOf = Implementation<typeof toolHintsSpec>;
