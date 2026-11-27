/**
 * The welcome's first card, its fourth milestone: the workflow its Start picks (`firstWorkflowOf`), the cost line said above Start
 * (`costLineOf`), which of the four hints a run's page draws (`firstBeatOf`, over `firstRunOf`), and the next steps "You are set" offers
 * (`nextStepsOf`), each typed by `contracts/first-card.contract.ts`; and what the page offers and files: the three fixed suggestions, the
 * label that marks the card and its run, and the stated estimate. Level-triggered: each reads what the store holds now, never a flag of
 * the browser's, so a step done at a terminal shows as done on the board.
 */
import type { CostLineOf, FirstBeatOf, FirstGatesOf, FirstWorkflowOf, NextStepsOf, RunCost } from '../../contracts/first-card.contract.ts';
import type { RunView } from './api/judged.ts';

/** The label a first card is filed with, which its run is started with: how the run's page knows to draw the hints. */
export const FIRST_CARD_LABEL = 'onboarding=first-card';

/** The stated estimate of a small first run where the store has measured none: the middle of `ESTIMATE_WORDS`' ranges. */
export const FIRST_RUN_ESTIMATE: RunCost = { ms: 20 * 60_000, dollars: 5 };

/** The estimate as the cost line says it: a range, since nothing measures a small run yet and they vary widely. */
export const ESTIMATE_WORDS = 'about 10–30 minutes and $2–8 at the harness’s API prices';

/** A suggested first change: its title, and the card's words it fills the field with. */
type Suggestion = { readonly title: string; readonly body: string };

/** The three suggested small changes: fixed words, safe on any repository, made by no model. */
export const SUGGESTIONS: readonly Suggestion[] = [
  {
    title: 'Say what the repository is',
    body: 'Add one line at the top of the README saying what this repository is for. Change nothing else.',
  },
  {
    title: 'Ignore editor files',
    body: 'Add the files editors leave behind (.DS_Store, .idea/, .vscode/, *.swp) to .gitignore, creating it if there is none. Change nothing else.',
  },
  {
    title: 'Fix a typo',
    body: 'Find one typo or unclear sentence in the README and fix it. Change nothing else.',
  },
];

/**
 * The workflow a first card runs in: the one the factory names (`firstWorkflow`) where it offers it, else none, and the page offers its
 * own to choose.
 * @param offered The workflows the factory offers, by name.
 * @param declared The workflow the factory names for a first card; undefined where it names none.
 */
export const firstWorkflowOf: FirstWorkflowOf = (offered, declared) =>
  declared !== undefined && offered.some((name) => name === declared) ? declared : undefined;

/**
 * The cost line's figures: what one landed run of the workflow cost and took here, where the store measured any, else the estimate.
 * @param stats What the stats say of the workflow's landed runs; undefined where they were not read.
 * @param estimate The stated estimate.
 */
export const costLineOf: CostLineOf = (stats, estimate) =>
  stats !== undefined && stats.landed !== null && stats.landed > 0 && stats.costPerLanded !== null && stats.timePerLanded !== null
    ? { kind: 'measured', ms: stats.timePerLanded, dollars: stats.costPerLanded }
    : { kind: 'estimate', ms: estimate.ms, dollars: estimate.dollars };

/**
 * The hint a run's page draws: none for a run that is not the first card's, or that ended unlanded; else landed, the gate, the steps at
 * work, or the card, by where the run stands.
 * @param run The run as the hints read it.
 */
export const firstBeatOf: FirstBeatOf = (run) => {
  if (!run.first) return null;
  if (run.landed) return 'landed';
  if (run.ended) return null;
  if (run.waitsOnYou) return 'gate';
  return run.filed ? 'steps' : 'card';
};

/**
 * The run as the hints read it: the first card's where it carries `FIRST_CARD_LABEL`, a step filed, at a gate, landed — succeeded with
 * an ending step (`workspace: base`) or a wait node, which is what lands; a run of a workflow with none lands nothing — or ended.
 * @param run The run's view, as its page reads it.
 */
export const firstRunOf = (run: Pick<RunView, 'labels' | 'status' | 'steps'>) => {
  const [key = '', value] = FIRST_CARD_LABEL.split('=');
  return {
    first: run.labels[key] === value,
    filed: run.steps.some((step) => step.filed !== null),
    waitsOnYou: run.status === 'awaiting approval',
    landed:
      run.status === 'succeeded' && run.steps.some((step) => step.spec?.workspace === 'base' || (step.spec?.waitsFor?.length ?? 0) > 0),
    ended: run.status === 'failed' || run.status === 'cancelled',
  };
};

/**
 * The next steps "You are set" offers, in order: her level and the terminal always, and connecting the host where the first volume was a
 * folder of this machine and the template follows a host.
 * @param factory Whether the factory's first writable volume was given by its path, and whether its template follows a host.
 */
export const nextStepsOf: NextStepsOf = (factory) =>
  factory.local && factory.follows ? ['level', 'github', 'terminal'] : ['level', 'terminal'];

/**
 * The gates a first card's run is started with, so it waits on the person before what it does lands: the workflow's ending step
 * (`workspace: base`) where its listing has one, else the step before the first wait node, which lands what that step approved, else none.
 * @param steps The workflow's steps as the factory lists it; undefined where they were not read.
 */
export const firstGatesOf: FirstGatesOf = (steps) => {
  const ending = (steps ?? []).find((step) => step.spec.workspace === 'base')?.name;
  const gate = ending ?? (steps ?? []).find((step) => (step.spec.waitsFor?.length ?? 0) > 0)?.spec.after?.at(0);
  return gate === undefined ? [] : [gate];
};
