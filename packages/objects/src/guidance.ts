/**
 * What Nemia tells a session of itself, written once for both seats: what Nemia is, when its verbs are the ones to reach for, which come
 * first, the feed, how it is told of the feed without polling, and how answers and refusals read. Each paragraph has two forms: the MCP
 * port's (`port`), which the port answers on `initialize` and `server/discover` (`portInstructions`), and the shell's (`shell`), which
 * Nemia's verbs skill opens with for her seat that types `nemia` (`shellGuidance`); null where the paragraph is true of the port's seat
 * alone (the feed as MCP resources). The port's names the one harness whose channel needs no polling, which a remote port can only point
 * at. Generic: it names no factory, repository or agent. Pure.
 */
import { RUN_STATES } from './words.ts';

/** A paragraph of the guidance, by what it says. */
export type GuidanceId = 'what' | 'search' | 'start' | 'resources' | 'feed' | 'answers';

/** A paragraph of the guidance: what it says, its port form, and its shell form, null where it is the port's seat's alone. */
export type Guidance = { readonly id: GuidanceId; readonly port: string; readonly shell: string | null };

/** The states a run's list is selected by, as a sentence says them. */
const STATES = RUN_STATES.join(', ');

/** What Nemia is, true in both seats. */
const WHAT = [
  'Nemia runs agent workflows in factories. A workflow is a folder of steps; a run is one pass of it, each step a session of an agent',
  'that signs off with a closeout. A step may wait at a gate for a person to approve it or try it again; ideas wait as cards in an',
  'inbox until one is started as a run. These tools read and act on one Nemia store: its runs and their steps, the gates waiting on',
  'a person, the inbox, factories and the agents, skills and workflows they offer.',
].join('\n');

/** The guidance's paragraphs, in the order a session reads them. */
export const GUIDANCE: readonly Guidance[] = [
  { id: 'what', port: WHAT, shell: WHAT },
  {
    id: 'search',
    port: [
      'Search these tools when the task is about a run, a step, a gate, a card, a factory or what an agent of a run concluded: what is in',
      'flight, what waits on a person, starting or filing work, approving or retrying a step, reading what a step signed off with.',
    ].join('\n'),
    shell: [
      'Reach for `nemia` when the task is about a run, a step, a gate, a card, a factory or what an agent of a run concluded: what is in',
      'flight, what waits on a person, starting or filing work, approving or retrying a step, reading what a step signed off with.',
    ].join('\n'),
  },
  {
    id: 'start',
    port: [
      'Start with:',
      `- \`ls\` for the state of the runs and their steps. Give it \`fieldSelector: "status.state!=finished"\` to read the runs in play`,
      `  first; a run's state is one of ${STATES}. Without it, \`ls\` lists every run the store holds, a page at a time.`,
      '- `show` for one run as a whole object.',
      '- `decide` for what a run produced and the choice it leaves a person.',
      '- `approve` to let a step waiting at its gate hand on, `retry` to try it again.',
      '- `inbox_add` to file a card, `inbox_start` to start a run from one.',
      "- `say` to tell a running step's session something.",
      "- `closeout` for what a step's try signed off with, `try` for one try of a step.",
    ].join('\n'),
    shell: [
      'Start with:',
      `- \`nemia ls\` for the state of the runs and their steps; a run's state is one of ${STATES}.`,
      '- `nemia show <runId>` for one run as a whole object.',
      '- `nemia decide <runId>` for what a run produced and the choice it leaves a person.',
      '- `nemia approve` to let a step waiting at its gate hand on, `nemia retry` to try it again.',
      '- `nemia inbox add` to file a card, `nemia start <card>` to start a run from one.',
      "- `nemia say` to tell a running step's session something.",
      "- `nemia closeout` for what a step's try signed off with, `--try <n>` for an earlier one.",
    ].join('\n'),
  },
  {
    id: 'resources',
    port: [
      "The feed of what happens in the store is offered as resources too: nemia:///api/events, or one factory's at",
      'nemia:///api/namespaces/<factory>/events, each taking labelSelector=<selector> (repeatable, any one kept). Subscribe with',
      'subscriptions/listen (resourceSubscriptions) to be told of each new event, and read the resource (resources/read) for the newest.',
    ].join('\n'),
    shell: null,
  },
  {
    id: 'feed',
    port: [
      'How a session is told of the feed without polling, the most direct first:',
      "- in Claude Code, nemia channel, added as a channel, pushes each line into the session as it happens (the docs' Channel page);",
      "- any client that holds a subscriptions/listen stream is sent notifications/resources/updated for the feed's resources;",
      '- a client that can only call tools calls `wait` again from the cursor it answered: the fallback, which polls.',
    ].join('\n'),
    shell: [
      'How you are told of the feed without polling: inside, while some factory is above `manual`, your subscription to the feed wakes you',
      'with each line that waits on a person, the rest folded into a digest. At a shell, `nemia watch` follows the feed, and',
      '`nemia wait --from <cursor>` waits for its next line a selector takes: the fallback, which polls.',
    ].join('\n'),
  },
  {
    id: 'answers',
    port: [
      'Each tool says the nemia command it is and the endpoint it calls. A list answers a page at a time: its last line names the',
      'continue token of the next. A refusal says what to do next.',
    ].join('\n'),
    shell: [
      "Each verb below names its tool on the port. That tool's section in `tools.md`, beside this file, says the endpoint it calls, what",
      'the endpoint does and what each argument takes. On the port a list answers a page at a time, its last line naming the continue',
      'token of the next. A refusal says what to do next.',
    ].join('\n'),
  },
];

/** The port's instructions, as `initialize` answers them: every paragraph's port form, a blank line between. */
export const portInstructions = () => GUIDANCE.map((g) => g.port).join('\n\n');

/** What a shell seat is told: every paragraph's shell form but the port's seat's alone, a blank line between. */
export const shellGuidance = () => GUIDANCE.flatMap((g) => (g.shell === null ? [] : [g.shell])).join('\n\n');
