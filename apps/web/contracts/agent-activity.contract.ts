/**
 * What an agent's page says it is doing now (`activityOf`, src/lib/atWork.ts), off the steps at work in the runs not finished: nothing,
 * one session (the line under its role names it), or several (the line counts them and the Working section lists each, the longest at
 * work first). Only the steps given to this agent count, and every one of them is said.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { longestFirst } from '../src/lib/longestFirst.ts';

/**
 * One step at work in a run not finished, as the page reads it (implement makes these in src/lib/atWork.ts from the open runs, the
 * strip's rows and the agent page's alike): the agent the run gave the step, by name; the run's id and title; its workflow, by the
 * run's `workflow` label; the step's name; its current try and round, each from 1; and how long its session has been at work, in whole
 * minutes.
 */
export type AtWorkRow = {
  readonly agent: string;
  readonly run: string;
  readonly title: string;
  readonly workflow: string;
  readonly step: string;
  readonly try: number;
  readonly round: number;
  readonly minutes: number;
};

/** What the agent is doing now: nothing, one session, or several, the longest at work first. */
export type Activity =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly row: AtWorkRow }
  | { readonly kind: 'many'; readonly rows: readonly AtWorkRow[] };

/**
 * The rows from the longest at work to the shortest (`src/lib/longestFirst.ts`): a sort with a comparison, which the verifier does not
 * read (tsverify's `docs/reads.md`), so declared here with what the laws lean on of it, and held on real rows by `brokenOn`
 * (`test/agent-page.test.ts`).
 */
export const longestFirstOf = assume(longestFirst, {
  pure: true,
  ensures: {
    sameCount: {
      description: 'As many rows come out as go in',
      condition: ({ input: [rows], output }) => output.length === rows.length,
    },
    keepsEach: {
      description: 'Every row that comes out is one that went in',
      condition: ({ input: [rows], output }) =>
        output.every((row) => rows.some((r) => r.agent === row.agent && r.run === row.run && r.step === row.step)),
    },
    longestFirst: {
      description: 'The rows go from the longest at work to the shortest',
      condition: ({ output }) => output.every((row, i) => i === 0 || (output.at(i - 1)?.minutes ?? 0) >= row.minutes),
    },
  },
});

/** The rows of `rows` that are the agent's. */
const theirs = (rows: readonly AtWorkRow[], agent: string) => rows.filter((row) => row.agent === agent);

/** Whether `row` is a step of `rows`: the same run and the same step. */
const given = (rows: readonly AtWorkRow[], row: AtWorkRow) => rows.some((r) => r.run === row.run && r.step === row.step);

const activityOfSpec = spec<(rows: readonly AtWorkRow[], agent: string) => Activity>({
  requires: ({ input: [rows] }) => rows.every((row) => Number.isInteger(row.minutes)),
  ensures: {
    noneExactlyWhenIdle: {
      description: 'The agent is doing nothing exactly when no step at work is given to it',
      condition: ({ input: [rows, agent], output }) => (output.kind === 'none') === (theirs(rows, agent).length === 0),
    },
    oneExactlyWhenOne: {
      description: 'One session is said exactly when one step at work is given to the agent',
      condition: ({ input: [rows, agent], output }) => (output.kind === 'one') === (theirs(rows, agent).length === 1),
    },
    oneIsItsStep: {
      description: 'The one session said is a step at work given to the agent',
      condition: ({ input: [rows, agent], output }) => output.kind !== 'one' || (output.row.agent === agent && given(rows, output.row)),
    },
    manyListsEach: {
      description: 'Several sessions list as many rows as steps at work are given to the agent',
      condition: ({ input: [rows, agent], output }) => output.kind !== 'many' || output.rows.length === theirs(rows, agent).length,
    },
    manyAreItsOwn: {
      description: 'Every row listed is a step at work given to the agent',
      condition: ({ input: [rows, agent], output }) =>
        output.kind !== 'many' || output.rows.every((row) => row.agent === agent && given(rows, row)),
    },
    longestFirst: {
      description: 'The rows listed go from the longest at work to the shortest',
      condition: ({ output }) =>
        output.kind !== 'many' || output.rows.every((row, i) => i === 0 || (output.rows.at(i - 1)?.minutes ?? 0) >= row.minutes),
    },
  },
});

/** `activityOf`'s type, which src/lib/atWork.ts takes. */
export type ActivityOf = Implementation<typeof activityOfSpec>;
