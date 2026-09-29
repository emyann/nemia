/**
 * The agent files of a run's steps: where `wf start` renders each step's agent for Claude Code (`agentFilesDir`), the render itself
 * (`writeAgentFiles`), and a skill read again once its rendered folder is gone (`skillsAgain`). What a folder holds is `rendering.ts`'s;
 * this writes and reads it.
 *
 * Beneath the controllers, beside `record.store.ts`, whose run folder holds the agent files: it imports neither the engine nor a
 * controller, and no pure file imports it (`test/boundary.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { splitFrontmatter, type Workflow } from '../step/step.ts';
import type { SkillsFound } from './agents.ts';
import { preloads } from '../workflow-store.ts';
import {
  noCodingStyle,
  NO_CODING_STYLE,
  pluginManifest,
  pluginOf,
  PROMPT_FILE,
  renderedPrompt,
  rendersAgent,
  type SkillAgain,
} from '../rendering.ts';
import { runsDir } from '../record/record.store.ts';

/**
 * Where `wf start` renders a step's agent for Claude Code (`rendering.ts`): `runs/<id>/agents/<step>`, beside the run's artifacts and inputs,
 * outside every workspace, and removed with them. The tick files the step with the flags that name it (`renderedFlags`).
 */
export const agentFilesDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'agents', step);

/**
 * Render every step of `steps` whose agent is rendered (`rendersAgent`) into its folder (`agentFilesDir`): its prompt, its skills copied whole
 * from where the load found them (`skills`), and its style. Written once, at `wf start`, so an edit of an agent or a skill after it reaches no
 * run already started, as an edit of its workflow does not. A skill is copied through its links: the folder is the step's own.
 */
export function writeAgentFiles(run: Pick<Run, 'id'>, steps: readonly Workflow[], skills: SkillsFound): void {
  for (const step of steps.filter(rendersAgent)) {
    const agent = step.agent!;
    const dir = agentFilesDir(run, step.name);
    const plugin = path.join(dir, pluginOf(agent.name));
    fs.mkdirSync(dir, { recursive: true });
    const told = (agent.skills ?? []).map((name) => {
      const from = skills.at.get(name);
      if (typeof from !== 'string')
        throw new Error(
          `${step.name}: the skill ${name} of ${agent.name} is not where the load found it${from ? ` — ${from.message}` : ''}.`,
        );
      fs.cpSync(from, path.join(plugin, 'skills', name), { recursive: true, dereference: true });
      return preloads(from)
        ? { name, whole: splitFrontmatter(`${name}/SKILL.md`, fs.readFileSync(path.join(from, 'SKILL.md'), 'utf8')).body }
        : { name };
    });
    if (told.length || agent.systemPrompt === 'no-coding') {
      fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
      fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), pluginManifest(agent.name));
    }
    if (agent.systemPrompt === 'no-coding') {
      fs.mkdirSync(path.join(plugin, 'output-styles'), { recursive: true });
      fs.writeFileSync(path.join(plugin, 'output-styles', `${NO_CODING_STYLE}.md`), noCodingStyle(agent.name));
    }
    fs.writeFileSync(path.join(dir, PROMPT_FILE), renderedPrompt(step, told));
  }
}

/**
 * The skills of a step whose rendered folder is gone (`unrendered`), read again from where the load finds them now (`skills`): each SKILL.md's
 * body, or why it is not there. The copy `wf start` froze went with the folder, so this is the one read of a skill after a run started.
 */
export function skillsAgain(step: Workflow, skills: SkillsFound): SkillAgain[] {
  return (step.agent?.skills ?? []).map((name) => {
    const from = skills.at.get(name);
    if (typeof from !== 'string') return { name, missing: from ? from.message : `no folder holds it in ${skills.looked.join(', ')}.` };
    try {
      return { name, text: splitFrontmatter(`${name}/SKILL.md`, fs.readFileSync(path.join(from, 'SKILL.md'), 'utf8')).body };
    } catch (err) {
      return { name, missing: `${path.join(from, 'SKILL.md')} could not be read — ${(err as Error).message}.` };
    }
  });
}
