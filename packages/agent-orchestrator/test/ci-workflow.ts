/**
 * Where the repository's Actions workflow is, how it parses, and which of its steps is the gate's.
 *
 * Read by the guard that holds the file to the repository (`ci-workflow.test.ts`) and by the test that runs the gate's own script
 * (`ci-gate.boundary.test.ts`): one writer for the path and for what the gate's step is, so the two cannot drift apart.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The workflow, as every sentence that refuses it names it to the person who must fix it. */
export const FILE = '.github/workflows/ci.yml';

/** The job that reports the one context branch protection requires. */
export const GATE = 'ci';

/** The job whose matrix holds the legs: one workspace on one node version. */
export const LEGS = 'test';

export type Step = { uses?: string; with?: Record<string, unknown>; run?: string; env?: Record<string, string> };

export type Job = {
  if?: string;
  needs?: string[];
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown[]> };
  steps?: Step[];
};

export type Workflow = {
  name?: string;
  on?: Record<string, { branches?: string[] } | null>;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: unknown };
  jobs: Record<string, Job>;
};

/** The workflow's own text, which two clauses read rather than its parse: a word in a comment is in the file all the same. */
export const workflowText = (): string => fs.readFileSync(path.join(ROOT, FILE), 'utf8');

export const readWorkflow = (text = workflowText()): Workflow => yaml.load(text) as Workflow;

/** The gate's steps that run a command: the one that turns the needed jobs' results into the `ci` context. */
export const gateSteps = (workflow: Workflow): Step[] => (workflow.jobs[GATE]?.steps ?? []).filter((step) => step.run !== undefined);
