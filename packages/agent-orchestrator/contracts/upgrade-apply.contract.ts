/**
 * What lets a templated factory's upgrade apply in one round of approvals (agent-orchestrator): the keys a wait node's frontmatter
 * refuses, which the merge turns into conflicts where only the factory's side holds them, and which a workflow's read refuses
 * (`waitRefused`, src/workflow/validate.ts); the hires an agent's removal fires in the same proposal, refused where the tree the upgrade
 * composes still hires that agent (`agentHiresFired`, src/factory/upgrade/owner-spec.ts); and the error a Hire's row carries, the read
 * of the workflow as a run of the factory reads it and never the read without its hires (`hireRowError`, src/factory/hire/hire.ts).
 * Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The frontmatter keys a wait node takes besides `waitsFor` itself, the step's name and body: the rest of a step's keys mean nothing to it. */
const WAIT_TAKES: readonly string[] = ['name', 'body', 'after', 'when', 'gate', 'place', 'waitsFor', 'checks'];

/** Whether a key is one a wait node takes. */
const taken = (key: string) => WAIT_TAKES.includes(key);

const waitRefusedSpec = spec<(keys: readonly string[]) => readonly string[]>({
  ensures: {
    aStepRefusesNoKeyHere: {
      description: 'A step that names no waitsFor is no wait node, so no key of it is refused here',
      condition: ({ input: [keys], output }) => keys.includes('waitsFor') || output.length === 0,
    },
    everyRefusedKeyIsItsOwn: {
      description: 'A key refused is one of the step’s own keys',
      condition: ({ input: [keys], output }) => output.every((key) => keys.includes(key)),
    },
    noTakenKeyIsRefused: {
      description: 'A key a wait node takes is never refused',
      condition: ({ output }) => output.every((key) => !taken(key)),
    },
    everyOtherKeyIsRefused: {
      description: 'Each key of a wait node that it does not take is refused',
      condition: ({ input: [keys], output }) => !keys.includes('waitsFor') || keys.every((key) => taken(key) || output.includes(key)),
    },
    inTheStepsOrder: {
      description: 'The keys refused come in the order the step names them, each once',
      condition: ({ input: [keys], output }) =>
        output.every((key, i) => output.indexOf(key) === i) &&
        output.every((key, i) => i === 0 || keys.indexOf(output[i - 1] ?? '') < keys.indexOf(key)),
    },
  },
});

/**
 * `waitRefused`'s type: the keys a step's frontmatter `keys` holds that it cannot take, `waitsFor:` making it a wait node, which runs no
 * session and no command, in the order it names them; none for a step that is no wait node. What `validateWaits` refuses the first of,
 * and what the upgrade's merge makes a conflict of where only the factory's side holds the key.
 */
export type WaitRefused = Implementation<typeof waitRefusedSpec>;

/** A wiring's hires: the agent hired into each step, by `<workflow>/<step>`. */
export type Hires = Readonly<Record<string, string>>;

/** What an agent's removal does to the hires: the steps whose hire it fires with it, or the steps the upgraded wiring still hires it into. */
export type AgentHires = { readonly fire: readonly string[] } | { readonly stillHired: readonly string[] };

/** The steps `hires` hires `agent` into. */
const hiredInto = (hires: Hires, agent: string) => Object.keys(hires).filter((step) => hires[step] === agent);

const agentHiresFiredSpec = spec<(agent: string, tree: Hires, composed: Hires) => AgentHires>({
  requires: ({ input: [agent] }) => agent.length > 0,
  ensures: {
    refusedWhereTheUpgradeStillHiresIt: {
      description: 'An agent the upgraded wiring still hires into a step is not removed: the steps it is still hired into are named',
      condition: ({ input: [agent, , composed], output }) =>
        hiredInto(composed, agent).length === 0 ||
        ('stillHired' in output &&
          output.stillHired.length === hiredInto(composed, agent).length &&
          hiredInto(composed, agent).every((step) => output.stillHired.includes(step))),
    },
    firesWhereTheUpgradeHiresItNowhere: {
      description: 'An agent the upgraded wiring hires nowhere is removed with its hires',
      condition: ({ input: [agent, , composed], output }) => hiredInto(composed, agent).length > 0 || 'fire' in output,
    },
    firesEveryHireOfTheAgent: {
      description: 'Every step the tree hires the removed agent into has its hire fired in the same proposal',
      condition: ({ input: [agent, tree], output }) => !('fire' in output) || hiredInto(tree, agent).every((step) => output.fire.includes(step)),
    },
    firesNoOtherHire: {
      description: 'No hire of another agent, and no step the tree hires no one into, is fired',
      condition: ({ input: [agent, tree], output }) => !('fire' in output) || output.fire.every((step) => tree[step] === agent),
    },
  },
});

/**
 * `agentHiresFired`'s type: for an agent an upgrade's resolution removes, the steps of the tree's wiring `tree` it is hired into, fired by
 * the same proposal; refused, naming the steps, where the wiring the upgrade composes, `composed`, still hires it.
 */
export type AgentHiresFired = Implementation<typeof agentHiresFiredSpec>;

/** What a Hire's row is read from: whether the step's own file and the factory both fill it, whether it is hired, and the read with the factory's hires. */
export type HireRowRead = {
  readonly bothFill: string | undefined;
  readonly hired: boolean;
  readonly filled: string | undefined;
};

const hireRowErrorSpec = spec<(read: HireRowRead) => string | undefined>({
  ensures: {
    bothFillFirst: {
      description: 'A step its own file and the factory both fill carries that error first',
      condition: ({ input: [r], output }) => r.bothFill === undefined || output === r.bothFill,
    },
    aWorkflowThatLoadsCarriesNoError: {
      description: 'A step of a workflow that reads with the factory’s hires, as a run of it reads it, carries no error but both filling it',
      condition: ({ input: [r], output }) => r.bothFill !== undefined || r.filled !== undefined || output === undefined,
    },
    theRefusalOfTheFilledReadOnAHiredRow: {
      description: 'A hired step of a workflow that does not read with the factory’s hires carries that refusal',
      condition: ({ input: [r], output }) => r.bothFill !== undefined || !r.hired || output === r.filled,
    },
    anUnhiredRowCarriesNoLoadError: {
      description: 'A step the factory hires no one into carries no load error of the workflow: it is not that hire’s',
      condition: ({ input: [r], output }) => r.bothFill !== undefined || r.hired || output === undefined,
    },
  },
});

/**
 * `hireRowError`'s type: the error a Hire's row of `nemia get hires` carries, from what its step's read gave — never the refusal of the
 * workflow read without the factory's hires, which no run of the factory reads.
 */
export type HireRowError = Implementation<typeof hireRowErrorSpec>;
