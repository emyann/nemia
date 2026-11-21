/**
 * What the port says of itself on `initialize` and on `server/discover` (`PORT_INSTRUCTIONS`): what Nemia is, when its tools are the ones
 * to search, and which reads and verbs come first. A host that defers a server's tools (a tool search, the MCP spec's progressive
 * discovery) shows a model these words and the tools' names alone, so they say what a search should ask for. Written once in `objects`
 * (`GUIDANCE`, each paragraph's port form, joined by `portInstructions`), beside the shell form Nemia's verbs skill tells her inside seat.
 * Generic: they name no factory, repository or agent, and no tool the port does not list (`port.test.ts` holds both, and the bound a host
 * cuts them at, `INSTRUCTIONS_BOUND`). They say the ways a session is told of the feed, the most direct first, so an agent that lands on
 * `wait` finds the two that need no polling.
 */
import { portInstructions } from 'objects';

/** The longest instructions a host that defers its tools keeps whole: it cuts a server's instructions past this many characters. */
export const INSTRUCTIONS_BOUND = 4_096;

/** The port's instructions, as `initialize` answers them. */
export const PORT_INSTRUCTIONS = portInstructions();
