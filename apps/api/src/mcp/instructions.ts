/**
 * What the port says of itself on `initialize` and on `server/discover` (`PORT_INSTRUCTIONS`): what Nemia is, when its tools are the ones to search, and which
 * reads and verbs come first. A host that defers a server's tools (a tool search, the MCP spec's progressive discovery)
 * shows a model these words and the tools' names alone, so they say what a search should ask for. Generic: they name no factory,
 * repository or agent, and no tool the port does not list (`port.test.ts` holds both, and the bound a host cuts them at,
 * `INSTRUCTIONS_BOUND`).
 */
import { RUN_STATES } from 'objects';

/** The longest instructions a host that defers its tools keeps whole: it cuts a server's instructions past this many characters. */
export const INSTRUCTIONS_BOUND = 4_096;

/** The states a run's list is selected by (`fieldSelector`), as a sentence says them. */
const STATES = RUN_STATES.join(', ');

/** The port's instructions, as `initialize` answers them. */
export const PORT_INSTRUCTIONS = [
  'Nemia runs agent workflows in factories. A workflow is a folder of steps; a run is one pass of it, each step a session of an agent',
  'that signs off with a closeout. A step may wait at a gate for a person to approve it or try it again; ideas wait as cards in an',
  'inbox until one is started as a run. These tools read and act on one Nemia store: its runs and their steps, the gates waiting on',
  'a person, the inbox, factories and the agents, skills and workflows they offer.',
  '',
  'Search these tools when the task is about a run, a step, a gate, a card, a factory or what an agent of a run concluded: what is in',
  'flight, what waits on a person, starting or filing work, approving or retrying a step, reading what a step signed off with.',
  '',
  'Start with:',
  `- \`ls\` for the state of the runs and their steps. Give it \`fieldSelector: "status.state!=finished"\` to read the runs in play`,
  `  first; a run's state is one of ${STATES}. Without it, \`ls\` lists every run the store holds, a page at a time.`,
  '- `show` for one run as a whole object.',
  '- `decide` for what a run produced and the choice it leaves a person.',
  '- `approve` to let a step waiting at its gate hand on, `retry` to try it again.',
  '- `inbox_add` to file a card, `inbox_start` to start a run from one.',
  "- `say` to tell a running step's session something.",
  "- `closeout` for what a step's try signed off with, `try` for one try of a step.",
  '',
  'Each tool says the nemia command it is and the endpoint it calls. A list answers a page at a time: its last line names the',
  'continue token of the next. A refusal says what to do next.',
].join('\n');
