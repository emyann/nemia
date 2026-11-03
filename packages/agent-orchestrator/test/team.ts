/**
 * The tests' own team (`fixtures/team/`): one workflow, `dev` — implement ⇄ review → ship — the three agents its steps name, and a skill
 * for each. Nemia ships no team, so a test of the machinery that needs a folder a person could have written reads this one, or a copy of
 * it with what it needs planted (`teamCopy`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

/** The team's folder, laid out as a `workflows/` is: `agents/`, `skills/` and `dev/`. */
export const TEAM = path.join(import.meta.dirname, 'fixtures', 'team');

/** The team's one workflow. */
export const TEAM_DEV = path.join(TEAM, 'dev');

/** A copy of the team in a folder of its own, for a test that changes a file of it: the copy, holding `agents/`, `skills/` and `dev/`. */
export function teamCopy(prefix = 'wf-team-'): string {
  const root = scratch(prefix);
  fs.cpSync(TEAM, root, { recursive: true });
  return root;
}

/** The repository this package is checked out in. */
export const REPO = path.join(import.meta.dirname, '..', '..', '..');

/** The strict schema `plantStepOutput` writes beside the team's `dev/implement.md`. */
export const STEP_OUTPUT_SCHEMA = `${JSON.stringify(
  {
    type: 'object',
    properties: { tests: { type: 'array', items: { type: 'string' } } },
    required: ['tests'],
    additionalProperties: false,
  },
  null,
  2,
)}\n`;

/**
 * The team's `dev/implement` in the copy `workflows` given a closeout schema of its own: `output: implement.schema.json` on its line, the
 * schema beside it (`STEP_OUTPUT_SCHEMA`), and `output` offered on its agent's `overridable:` line, which a step's own `output:` needs.
 */
export function plantStepOutput(workflows: string): void {
  const agent = path.join(workflows, 'agents', 'implementer.md');
  fs.writeFileSync(agent, fs.readFileSync(agent, 'utf8').replace('overridable: fence, skills\n', 'overridable: output, fence, skills\n'));
  const step = path.join(workflows, 'dev', 'implement.md');
  fs.writeFileSync(
    step,
    fs.readFileSync(step, 'utf8').replace('agent: implementer\n', 'agent: implementer\noutput: implement.schema.json\n'),
  );
  fs.writeFileSync(path.join(workflows, 'dev', 'implement.schema.json'), STEP_OUTPUT_SCHEMA);
}
