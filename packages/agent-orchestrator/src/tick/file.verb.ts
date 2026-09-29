/**
 * What a pass files a step with: the fields of a filing that only a local harness reads (`localFields`), the step as it is told
 * (`toldOf`), and what each run it waited on concluded (`parentCloseouts`). A controller, reaching the runtime through the client
 * (`runtime-client.ts`).
 */
import type { ClaudeFlags, Engine, TaskView } from '../runtime-client.ts';
import { isRemoteHarness, type Workflow } from '../workflow.ts';
import { resultSteps } from '../branches/branches.ts';
import type { Run } from '../record/record.ts';
import type { ParentCloseout, ParentStep } from '../brief/index.ts';
import { readRun, stepsOf } from '../record/record.store.ts';
import { agentFilesDir, renderedIn, skillsAgain } from '../agents/agents.store.ts';
import { closeoutOf } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { placesOf } from '../start/start.verb.ts';
import { skillsFor } from '../folder/folder.store.ts';
import { renderedFlags, rendersAgent, unrendered } from '../rendering.ts';

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema — for a
 * step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured it. The
 * runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left out, not
 * emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
export const localFields = <T extends object>(step: Workflow, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();

/**
 * A step as the tick tells it and files it: with its agent's instructions in the system prompt and its skills in a plugin, where `wf start`
 * rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent — is filed with
 * no flags and told everything in its brief. Where the rendered folder is not there as its flags name it (`unrendered`, `renderedIn`) —
 * gone, or rendered under the plugin's former name — a flag naming a file that is not there would end the session at its start, so its
 * brief tells it its skills whole, read again from where a start of this run's folder finds them (`skillsAgain`). Bridged to claude.ai,
 * where anyone signed in can drive it, only when the step says `remote: true`, never by default: as Claude Code's own flag, first among its
 * others (`claude.remoteControl`).
 */
export function toldOf(run: Run, step: Workflow): { step: Workflow; claude?: ClaudeFlags } {
  const dir = agentFilesDir(run, step.name);
  const told =
    rendersAgent(step) && !renderedIn(dir, step)
      ? unrendered(step, step.agent?.skills?.length ? skillsAgain(step, skillsFor(run.workflowDir, placesOf(run.repo))) : [])
      : step;
  const rendered = renderedFlags(told, dir);
  return { step: told, claude: told.remote ? { remoteControl: true, ...rendered } : rendered };
}

/**
 * What each run this one waited on concluded, for its roots' briefs (`## From run <id>` in `composeBrief`): the first line of its brief, and
 * the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as `wf decide`
 * reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: main`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * It never throws: a parent whose record or workflow does not read, a step never filed, a task the engine holds
 * no closeout for — a failed step whose work a person merged all the same — and a closeout that does not parse each say so in the section,
 * and the roots are filed all the same.
 */
export async function parentCloseouts(e: Engine, ids: readonly string[]): Promise<ParentCloseout[]> {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = readRun(id);
      steps = stepsOf(record);
    } catch (err) {
      out.push({ run: id, unreadable: `its record cannot be read: ${(err as Error).message}` });
      continue;
    }
    const said: ParentStep[] = [];
    for (const step of resultSteps(steps)) {
      const taskId = record.steps[step.name]?.taskId;
      if (!taskId) {
        said.push({ name: step.name, unreadable: 'it was never filed' });
        continue;
      }
      let view: TaskView;
      try {
        view = await e.view(taskId);
      } catch (err) {
        said.push({ name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${(err as Error).message}` });
        continue;
      }
      const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
      if (!c)
        said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0], steps: said });
  }
  return out;
}
