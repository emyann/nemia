/**
 * A plan folder read off disk (`readPlan`): every entry handed to the pure parser (`parsePlan`). A store: it reads a folder and imports no
 * runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WorkflowError } from '../step/step.ts';
import { parsePlan, planOrder, type Card } from './plan.ts';

/**
 * A plan folder's cards, parents first (`parsePlan`, `planOrder`): every entry of the folder handed to the pure parser — a folder inside it
 * by its name and a trailing `/`, a markdown file with its text.
 */
export function readPlan(dir: string): Card[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new WorkflowError(`no plan folder at ${dir}. A plan is a folder of cards, one <card>.md each: nemia start <folder> --repo <r>.`);
  }
  const files = entries.map((name) => {
    const at = path.join(dir, name);
    if (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory()) return { file: `${name}/`, text: '' };
    return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' };
  });
  return planOrder(parsePlan(files, dir));
}
