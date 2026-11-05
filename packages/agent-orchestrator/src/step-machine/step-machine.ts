/**
 * A step's lifecycle in a run, drawn as a machine: its states, the words a step's status is said in (`StepStatus`), and the moves
 * between them (`STEP_EDGES`), each named by the fact that makes it. Pure, and it decides nothing: `ownStatus` and `standing`
 * (`status.ts`) work the word out afresh on every pass, and `assess` acts on it. This is the drawing of what they do, held to them by a
 * replay of a step's record moved fact by fact (`step-machine.test.ts`), which fails on a pair of words this does not draw and on an edge
 * no walk takes. `stepMove` says what a pair is, as its contract proves (`contracts/step-machine.contract.ts`); `stepDiagram` prints it
 * for the package's README, between `diagram:step` markers.
 */
import type { StepStatus } from '../record/record.ts';
import type { StepMove } from '../../contracts/step-machine.contract.ts';

/**
 * What a pair of a step's words is: no move (`stays`), a move the machine draws, named by the event that makes it (`edge`), or
 * one it does not draw (`refused`), which the replay fails on.
 */
export type StepTransition = { kind: 'stays' } | { kind: 'edge'; event: string } | { kind: 'refused' };

/** One move of a step's word, from a state to another, on the fact that makes it. */
export type StepEdge = { from: StepStatus; to: StepStatus; event: string };

/** A step's lifecycle as plain data: its first state, its states, its final ones (none: a round or a try files any again), and edges. */
export type StepMachineGraph = { initial: StepStatus; states: StepStatus[]; final: StepStatus[]; edges: StepEdge[] };

/**
 * Every word a step is said in, with the name the diagram draws it by. Typed over `StepStatus`, so that a word added there with no state
 * here fails the typecheck.
 */
const STEP_STATES = {
  pending: { id: 'pending' },
  running: { id: 'running' },
  checking: { id: 'checking' },
  verified: { id: 'verified' },
  unverified: { id: 'unverified' },
  'awaiting approval': { id: 'awaiting_approval' },
  exhausted: { id: 'exhausted' },
  blocked: { id: 'blocked' },
  unsigned: { id: 'unsigned' },
  denied: { id: 'denied' },
  'failed (check)': { id: 'failed_check' },
  failed: { id: 'failed' },
  stopped: { id: 'stopped' },
  'budget exhausted': { id: 'budget_exhausted' },
  'over budget': { id: 'over_budget' },
} satisfies Record<StepStatus, { id: string }>;

const isStepStatus = (word: string): word is StepStatus => word in STEP_STATES;

/**
 * The moves `stepStatus` makes, each walked by the replay: a step filed and its session signing off, its check, its gate, the ways a try
 * stops and the try after it, being over its budget, a loop's round, and an ending held at its gate before it is filed.
 *
 * A filed step reads `pending` again only where its try is moved behind with none in its place: a round unfiles every step of its loop but
 * its target (`roundFiled`), and an ending sent back with its work has its try moved behind (`sentBack`). And an ending held at its gate
 * before it is filed reads `pending` once approved, until the pass files it, and again when the work it waits on is sent back. A step in
 * flight — its session running, its check or its landing pending — is never unfiled.
 */
export const STEP_EDGES: readonly StepEdge[] = [
  { from: 'pending', to: 'running', event: 'filed' },
  { from: 'pending', to: 'awaiting approval', event: 'its work handed on, at the gate of an ending' },
  { from: 'running', to: 'unverified', event: 'signed, with no check' },
  { from: 'running', to: 'checking', event: 'signed, with a check' },
  { from: 'running', to: 'awaiting approval', event: 'signed, at its gate' },
  { from: 'running', to: 'exhausted', event: 'again, at its rounds' },
  { from: 'running', to: 'blocked', event: 'signed blocked' },
  { from: 'running', to: 'unsigned', event: 'ended with no closeout the run accepts' },
  { from: 'running', to: 'denied', event: 'signed, denied a call under denials fail' },
  { from: 'running', to: 'failed', event: 'its session failed' },
  { from: 'running', to: 'stopped', event: 'its session stopped' },
  { from: 'running', to: 'budget exhausted', event: 'cut off at its budget' },
  { from: 'running', to: 'over budget', event: 'failed, over its budget' },
  { from: 'checking', to: 'verified', event: 'its check passed, or its landing committed' },
  { from: 'checking', to: 'awaiting approval', event: 'its check passed, at its gate' },
  { from: 'checking', to: 'failed (check)', event: 'its check refused or did not finish, or its landing aborted' },
  { from: 'checking', to: 'over budget', event: 'its check refused, over its budget' },
  { from: 'verified', to: 'running', event: 'a round files its target again' },
  { from: 'verified', to: 'pending', event: 'a round unfiles its loop' },
  { from: 'unverified', to: 'pending', event: 'a round unfiles its loop' },
  { from: 'awaiting approval', to: 'verified', event: 'approved, checked' },
  { from: 'awaiting approval', to: 'unverified', event: 'approved' },
  { from: 'awaiting approval', to: 'running', event: 'sent back from its gate' },
  { from: 'awaiting approval', to: 'pending', event: 'approved before it is filed, or its work sent back' },
  { from: 'exhausted', to: 'unverified', event: 'accepted at its rounds' },
  { from: 'exhausted', to: 'pending', event: 'a round on your word' },
  { from: 'blocked', to: 'running', event: 'tried again' },
  { from: 'blocked', to: 'over budget', event: 'its session settled, over its budget' },
  { from: 'unsigned', to: 'running', event: 'tried again' },
  { from: 'denied', to: 'running', event: 'tried again' },
  { from: 'failed (check)', to: 'running', event: 'tried again' },
  { from: 'failed (check)', to: 'checking', event: 'checked again' },
  { from: 'failed (check)', to: 'pending', event: 'an ending sent back with its work' },
  { from: 'failed', to: 'running', event: 'tried again' },
  { from: 'stopped', to: 'running', event: 'tried again' },
  { from: 'budget exhausted', to: 'running', event: 'tried again, with a budget' },
  { from: 'over budget', to: 'running', event: 'tried again, with a budget' },
  { from: 'over budget', to: 'pending', event: 'a round on your word, with a budget' },
];

/** What a step reading `from` on one pass and `to` on the next did: stayed, moved along an edge, or a move the machine does not draw. */
export const stepMove: StepMove = (from, to) => {
  if (from === to) return { kind: 'stays' };
  const edge = STEP_EDGES.find((e) => e.from === from && e.to === to);
  return edge ? { kind: 'edge', event: edge.event } : { kind: 'refused' };
};

/** A step's lifecycle as plain data, a fresh copy each call. */
export const stepMachineGraph = (): StepMachineGraph => ({
  initial: 'pending',
  states: Object.keys(STEP_STATES).filter(isStepStatus),
  final: [],
  edges: STEP_EDGES.map((e) => ({ ...e })),
});

/**
 * A step's lifecycle as a Mermaid state diagram: each word named once, then the edges. Held in the package's README between `diagram:step`
 * markers.
 */
export const stepDiagram = (graph: StepMachineGraph = stepMachineGraph()): string => {
  const id = (s: StepStatus): string => STEP_STATES[s].id;
  return [
    'stateDiagram-v2',
    `  [*] --> ${id(graph.initial)}`,
    ...graph.states.map((s) => `  state "${s}" as ${id(s)}`),
    ...graph.edges.map((e) => `  ${id(e.from)} --> ${id(e.to)}: ${e.event}`),
    ...graph.final.map((s) => `  ${id(s)} --> [*]`),
  ].join('\n');
};
