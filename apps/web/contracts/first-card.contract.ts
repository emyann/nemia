/**
 * The welcome's first card, its fourth milestone (src/lib/firstCard.ts): the workflow its Start picks (`firstWorkflowOf`), the cost line
 * said above Start (`costLineOf`), which of the four hints a run's page draws (`firstBeatOf`), and the next steps "You are set" offers
 * (`nextStepsOf`). Level-triggered: each reads what the store holds now — the factory's workflows, the stats, the run as the api reads it,
 * the factory's first writable volume — and never a flag kept in the browser, so a step done at a terminal shows as done on the board.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The workflow a first card runs in, where its factory offers it: sdlc's, which lands a small change with a review and no spec. The
 * code keeps its own constant of the same word; this one is the law's (a contract exports types alone: its `spec` is never loaded at run
 * time).
 */
const FIRST_WORKFLOW = 'quick';

const firstWorkflowOfSpec = spec<(offered: readonly string[]) => string | undefined>({
  ensures: {
    quickWhereOffered: {
      description: 'A factory that offers quick runs its first card in quick',
      condition: ({ input: [offered], output }) => !offered.includes(FIRST_WORKFLOW) || output === FIRST_WORKFLOW,
    },
    noPickWhereNotOffered: {
      description: 'A factory with no quick picks nothing for the person: the page offers its own workflows to choose from',
      condition: ({ input: [offered], output }) => offered.includes(FIRST_WORKFLOW) || output === undefined,
    },
  },
});

/** `firstWorkflowOf`'s type, which src/lib/firstCard.ts takes. */
export type FirstWorkflowOf = Implementation<typeof firstWorkflowOfSpec>;

/** What the stats say of the landed runs of a workflow: how many landed, and the mean cost and wall time of one, null where unmeasured. */
export type LandedMeasure = {
  readonly landed: number | null;
  readonly costPerLanded: number | null;
  readonly timePerLanded: number | null;
};

/** About how long a run takes, in milliseconds, and about what it costs, in dollars at the harness's API prices. */
export type RunCost = { readonly ms: number; readonly dollars: number };

/** The cost line's figures: measured on this store's landed runs, or the stated estimate where it holds none. */
export type CostLine = { readonly kind: 'measured' | 'estimate' } & RunCost;

/** Whether the stats measured a landed run's cost and time. */
const measured = (m: LandedMeasure): boolean => m.landed !== null && m.landed > 0 && m.costPerLanded !== null && m.timePerLanded !== null;

const costLineOfSpec = spec<(stats: LandedMeasure | undefined, estimate: RunCost) => CostLine>({
  ensures: {
    measuredWhereTheStoreHasLanded: {
      description: 'Where this store has landed runs of the workflow, the line says what one cost and took here, never a guess',
      condition: ({ input: [stats], output }) =>
        stats === undefined ||
        !measured(stats) ||
        (output.kind === 'measured' && output.dollars === stats.costPerLanded && output.ms === stats.timePerLanded),
    },
    estimateWhereNothingLanded: {
      description: 'With no landed run measured, or no stats read, the line says the stated estimate, and says it is one',
      condition: ({ input: [stats, estimate], output }) =>
        (stats !== undefined && measured(stats)) ||
        (output.kind === 'estimate' && output.dollars === estimate.dollars && output.ms === estimate.ms),
    },
  },
});

/** `costLineOf`'s type, which src/lib/firstCard.ts takes. */
export type CostLineOf = Implementation<typeof costLineOfSpec>;

/**
 * A run as the hints read it: whether it is the welcome's first card's (its label), whether any of its steps is filed, whether it waits
 * on the person at a gate now, whether it landed, and whether it ended.
 */
export type FirstRunRead = {
  readonly first: boolean;
  readonly filed: boolean;
  readonly waitsOnYou: boolean;
  readonly landed: boolean;
  readonly ended: boolean;
};

/** The four beats of a first run, one hint each: your card, the steps at work, the gate that waits on you, landed. */
export type FirstBeat = 'card' | 'steps' | 'gate' | 'landed';

const firstBeatOfSpec = spec<(run: FirstRunRead) => FirstBeat | null>({
  ensures: {
    onlyOnTheFirstCard: {
      description: "A run that is not the welcome's first card draws no hint",
      condition: ({ input: [run], output }) => run.first || output === null,
    },
    landedSaysLanded: {
      description: 'The first card landed: the landed hint, which leads to what is next',
      condition: ({ input: [run], output }) => !run.first || !run.landed || output === 'landed',
    },
    endedUnlandedSaysNothing: {
      description: 'A first run that ended without landing draws no hint: the run page says how it ended',
      condition: ({ input: [run], output }) => !run.first || run.landed || !run.ended || output === null,
    },
    theGateWhileItWaits: {
      description: 'While the first run waits on the person at its gate, the hint is the gate: approving it is what moves it on',
      condition: ({ input: [run], output }) => !run.first || run.landed || run.ended || !run.waitsOnYou || output === 'gate',
    },
    theStepsOnceFiled: {
      description: 'Once a step is filed and nothing waits on the person, the hint is the steps at work',
      condition: ({ input: [run], output }) => !run.first || run.landed || run.ended || run.waitsOnYou || !run.filed || output === 'steps',
    },
    theCardBeforeAnything: {
      description: 'Started and nothing filed yet, the hint is the card: what was asked, and that the daemon files it',
      condition: ({ input: [run], output }) => !run.first || run.landed || run.ended || run.waitsOnYou || run.filed || output === 'card',
    },
  },
});

/** `firstBeatOf`'s type, which src/lib/firstCard.ts takes. */
export type FirstBeatOf = Implementation<typeof firstBeatOfSpec>;

/** The next steps "You are set" offers: raise Nemia's level, connect GitHub, use Nemia from a terminal or a coding agent. */
export type NextStep = 'level' | 'github' | 'terminal';

/** The order the next steps are offered in, the law's own. */
const NEXT_STEPS: readonly NextStep[] = ['level', 'github', 'terminal'];

/**
 * The factory the first card ran in, as "You are set" reads it: whether its first writable volume was given by its path (no origin), and
 * whether its template declares a parameter that follows an origin's host, whose command the api answers (`FactoryCommands.follow`).
 */
export type SetFactory = { readonly local: boolean; readonly follows: boolean };

const nextStepsOfSpec = spec<(factory: SetFactory) => readonly NextStep[]>({
  ensures: {
    levelAndTerminalAlways: {
      description: 'Raising her level and the terminal are offered to everyone',
      condition: ({ output }) => output.includes('level') && output.includes('terminal'),
    },
    githubOnlyAfterALocalFolder: {
      description:
        'Connect GitHub is offered where the first volume was a folder of this machine and the template says how to land on a host, never to one who gave a repository by its address',
      condition: ({ input: [factory], output }) => output.includes('github') === (factory.local && factory.follows),
    },
    inTheirOrder: {
      description: 'The steps are offered in NEXT_STEPS order, each once',
      condition: ({ output }) => NEXT_STEPS.filter((s) => output.includes(s)).join() === output.join(),
    },
  },
});

/** `nextStepsOf`'s type, which src/lib/firstCard.ts takes. */
export type NextStepsOf = Implementation<typeof nextStepsOfSpec>;
