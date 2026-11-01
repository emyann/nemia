/**
 * What a hire meets on disk: the file of a step that names its own agent, in a folder a start in the factory reads its workflow from
 * (`ownAgentOf`, `ownAgentRefusal`). A step whose own file names its agent fills it in every factory, so a hire beside it is refused;
 * what `wiringRefusal` (`wiring.ts`) cannot judge, since it reads no disk.
 *
 * A store file, beneath the factories' (`factory.store.ts`) and the verb that hires (`factory.verb.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { frontmatterKey } from '../former/former.ts';
import { Conflict } from '../refusal/refusal.ts';
import { hireRefusalOf, type Factory } from '../factory/factory.ts';

/**
 * The folders whose `workflows/<workflow>/` a start in `factory` reads a step's own file from, in the store `home`: its repositories and
 * `home`; made from a template, the first of its tree, its repositories and `home` that holds the workflow, as a start reads it by name.
 */
function rootsOf(home: string, factory: Factory, workflow: string): readonly string[] {
  if (factory.tree === undefined) return [...factory.repos, home];
  const holder = [factory.tree, ...factory.repos, home].find((root) => fs.existsSync(path.join(path.resolve(root), 'workflows', workflow)));
  return holder === undefined ? [] : [holder];
}

/**
 * The first file of the step `step` of `workflow` that names its own agent, and the agent it names: in each of `roots`' `workflows/`,
 * where a start in the factory reads a workflow by its name. A file that is not there or does not read names none.
 */
export function ownAgentOf(roots: readonly string[], workflow: string, step: string): { named: string; file: string } | undefined {
  for (const root of roots) {
    const file = path.join(path.resolve(root), 'workflows', workflow, `${step}.md`);
    let named: string | undefined;
    try {
      named = frontmatterKey(fs.readFileSync(file, 'utf8'), 'agent');
    } catch {
      continue;
    }
    if (named !== undefined) return { named, file };
  }
  return undefined;
}

/**
 * The refusal a hire into `step` meets on disk, where its own file, in a folder a start in `factory` reads, names its agent: `Conflict`,
 * in `hireRefusalOf`'s words, then the file. What `wiringRefusal` cannot judge, since it reads no disk.
 */
export function ownAgentRefusal(home: string, factory: Factory, step: string): Conflict | undefined {
  const workflow = step.slice(0, step.indexOf('/'));
  const own = ownAgentOf(rootsOf(home, factory, workflow), workflow, step.slice(workflow.length + 1));
  if (own === undefined) return undefined;
  return new Conflict({ message: `${hireRefusalOf(factory, workflow, own.named)} ${own.file} names it. Nothing was hired.` });
}
