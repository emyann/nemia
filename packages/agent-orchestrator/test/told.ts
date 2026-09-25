/**
 * What a shipped step is told: its body, then the body of each skill its agent gives it, in the order the agent names them. Since agents
 * card 1b the shipped agents' procedures are skills (`workflows/skills/`), and their bodies keep the role and the limits, so a sentence a
 * step must be told is looked for here, not in the body alone. The skills are found as `wf start` finds them (`skillsFor`), from the
 * step's folder, and one that is not there throws rather than reading as a step told less.
 */
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontmatter, type Workflow } from '../src/workflow.ts';
import { skillsFor } from '../src/workflow-store.ts';

export function toldIn(dir: string, step: Workflow): string {
  const found = skillsFor(dir);
  const skills = (step.agent?.skills ?? []).map((name) => {
    const at = found.at.get(name);
    if (typeof at !== 'string') throw new Error(`${step.name}: its agent gives the skill ${name}, and ${at ? at.message : `no skills folder has it (${found.looked.join(', ')})`}`);
    return splitFrontmatter(`${name}/SKILL.md`, fs.readFileSync(path.join(at, 'SKILL.md'), 'utf8')).body;
  });
  return [step.body, ...skills].join('\n\n');
}
