/**
 * An MCP server's header as a write keeps it (agent-orchestrator, src/servers/servers.ts; no code yet). A server's headers are served
 * masked, each value as `HEADER_MASK`, so a client that reads a server and sends it back sends the mask: the mask sent for a header the
 * server holds keeps the stored value, and any other value is the new one. A mask sent for a header the server does not hold says no
 * value, and is refused (`Invalid`, naming the header and asking for its value). `stored` is the value the record holds, null for none.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a header's value is served as: never a value a header is sent with. Implement moves it into `objects`, beside `McpServer`. */
export const HEADER_MASK = '********';

/** A header as a write keeps it: its value, or the refusal of a mask that stands for no value. */
export type HeaderWritten = { readonly value: string } | { readonly refused: 'masked' };

const headerWrittenSpec = spec<(sent: string, stored: string | null) => HeaderWritten>({
  ensures: {
    refusedExactlyOnAMaskForNothing: {
      description: 'A header is refused exactly when it is sent masked and the server holds no value for it',
      condition: ({ input: [sent, stored], output }) => 'refused' in output === (sent === HEADER_MASK && stored === null),
    },
    maskKeepsTheStoredValue: {
      description: 'A header sent masked keeps the value the server holds',
      condition: ({ input: [sent, stored], output }) =>
        sent !== HEADER_MASK || stored === null || ('value' in output && output.value === stored),
    },
    aValueIsKeptAsSent: {
      description: 'A header sent with a value of its own keeps that value',
      condition: ({ input: [sent], output }) => sent === HEADER_MASK || ('value' in output && output.value === sent),
    },
  },
});

/** `headerWritten`'s type, which `src/servers/servers.ts` takes. */
export type HeaderWrittenOf = Implementation<typeof headerWrittenSpec>;
