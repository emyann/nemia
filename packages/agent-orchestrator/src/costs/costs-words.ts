/**
 * The brief's section on what recent runs of a step's workflow cost (`costsSection`), off `costsOf`'s answer: a heading, a line on what
 * it covers, a line per step and one for the whole run. Pure. Amounts in USD to two decimals; a figure nothing measured is said as such.
 */
import type { StepCost, WorkflowCosts } from './costs.ts';

/** An amount in USD, to two decimals. */
const usd = (amount: number): string => amount.toFixed(2);

/** How many, with its noun in the plural past one. */
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** A step's line: the median and p90 of what it cost a run, and its tries a run. */
const stepLine = (s: StepCost, runs: number): string =>
  `- ${s.step}: median ${usd(s.median)}, p90 ${usd(s.p90)}; tries a run median ${s.tries.median}, max ${s.tries.max}` +
  (s.runs < runs ? ` (cost measured in ${plural(s.runs, 'run')})` : '');

/** The whole run's line: its cost, over the runs fully measured where that is fewer, and its rounds. */
function runLine(c: WorkflowCosts): string {
  const cost =
    c.run.median === null || c.run.p90 === null
      ? 'no run had every session measured'
      : `median ${usd(c.run.median)}, p90 ${usd(c.run.p90)}${c.run.runs < c.runs ? ` (over the ${plural(c.run.runs, 'run')} with every session measured)` : ''}`;
  const rounds = c.rounds.median === null ? 'no loop ran to acceptance' : `rounds median ${c.rounds.median}, max ${c.rounds.max}`;
  return `- the whole run: ${cost}; ${rounds}`;
}

/**
 * `## What runs of this workflow cost`, preceded by a blank line: over the window `c` covers, what each step and the whole run cost, at
 * most a line per step and three more; or one line saying no run of the workflow has finished in this factory yet.
 */
export function costsSection(c: WorkflowCosts): string {
  const head = ['', '## What runs of this workflow cost', ''];
  if (!c.runs)
    return [...head, `No run of \`${c.workflow}\` has finished in this factory yet: there is no measured cost to go by.`].join('\n');
  return [
    ...head,
    `Over the last ${plural(c.runs, 'finished run')} of \`${c.workflow}\` in this factory, since ${c.since}, per run in USD (tries and rounds included):`,
    ...c.steps.map((s) => stepLine(s, c.runs)),
    runLine(c),
  ].join('\n');
}
