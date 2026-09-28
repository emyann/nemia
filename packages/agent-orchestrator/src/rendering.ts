/**
 * An agent rendered for Claude Code: what `wf start` writes for a step whose agent has instructions, skills or a system prompt of its own,
 * and what the tick hands Claude Code to read it. Pure: the layout, the prompt's text and the flags; `writeAgentFiles` in store.ts writes it.
 *
 * Under `runs/<id>/agents/<step>/`, frozen with the run as its workflow is:
 *
 * - `prompt.md`, the agent's instructions, then a line naming each skill it is given, then the whole text of each skill that asks to be
 *   told whole (`preload: true`): appended to Claude Code's own system prompt, which is kept (`--append-system-prompt-file`), or put in
 *   its place for `systemPrompt: own` (`--system-prompt-file`);
 * - `hkb-<agent>/`, a plugin of the step's own (`--plugin-dir`): its `skills/<name>/`, each copied whole from where the load found it,
 *   so a session loads them as `hkb-<agent>:<name>`; and, for `systemPrompt: no-coding`, `output-styles/no-coding.md`, a style that says
 *   `keep-coding-instructions: false`, chosen by its namespaced name, since a bare one is echoed and not applied.
 *
 * The step's brief is then its own note alone (`briefBody`): the instructions are in the system prompt. A codex step is handed them in its
 * brief, and so is a step that continues another's session (`resume:`), whose system prompt stays that session's, and a
 * step on a remote A2A agent, which keeps its operator's.
 */
import path from 'node:path';
import { isRemoteHarness, type Workflow } from './workflow.ts';

/** The prompt's file in a step's rendered folder. */
export const PROMPT_FILE = 'prompt.md';

/** The output style `systemPrompt: no-coding` chooses, in the step's plugin. */
export const NO_CODING_STYLE = 'no-coding';

/** The plugin an agent's skills are served from, and so their namespace: `hkb-<agent>`. */
export const pluginOf = (agent: string): string => `hkb-${agent}`;

/**
 * Whether `wf start` renders the step's agent and the tick files the step with it: a step of Claude Code's — codex loads no plugin and takes no
 * system prompt — whose record gives its agent instructions, skills or a system prompt other than `default` (`StepAgent.instructions`,
 * `skills`, `systemPrompt`; a record without them renders nothing), and which starts a session of its own. A step that continues another's
 * session keeps that session's system prompt, so it is told its agent's instructions in its brief (and may give no skills, nor a system
 * prompt: `composedRefusal`).
 */
export const rendersAgent = (step: Workflow): boolean => {
  const agent = step.agent;
  if (!agent || step.harness === 'codex' || isRemoteHarness(step.harness) || step.resume) return false;
  return Boolean(agent.instructions || agent.skills?.length || (agent.systemPrompt ?? 'default') !== 'default');
};

/** What a step's brief opens with: its own note alone when its agent is rendered, its agent's instructions and its note otherwise. */
export const briefBody = (step: Workflow): string => (rendersAgent(step) ? step.agent!.body : step.body);

/** A skill as a step whose rendered folder is gone is told it: its SKILL.md's body, read again where the load finds it, or why it cannot be. */
export type SkillAgain = { name: string; text: string } | { name: string; missing: string };

/**
 * A step as it is told when its rendered folder is not there — removed by hand, or never written — with its agent's instructions in its
 * brief and no flags: filing it with a flag naming a file that is not there would end the session at
 * its start, and a brief without the instructions would tell it nothing of them. Nor without its skills: the instructions say to load
 * them, or that they follow, and with no plugin there is nothing to load, so each is told whole after the instructions, under its bare name,
 * as the instructions name it — or why it could not be read (`skills`, read again by the tick: an edit made since `wf start` reaches it).
 */
export const unrendered = (step: Workflow, skills: readonly SkillAgain[] = []): Workflow => {
  if (!step.agent) return step;
  const { instructions: _i, skills: _s, systemPrompt: _p, ...agent } = step.agent;
  if (!skills.length) return { ...step, agent };
  return {
    ...step,
    body: [
      step.body.trimEnd(),
      'No skill is loaded with the Skill tool for this step — the folder the run rendered its agent into is gone — so each is told whole here.',
      ...skills.map(
        (s) => `## Skill \`${s.name}\`\n\n${'text' in s ? s.text.trim() : `Not told: ${s.missing} Sign off blocked if you need it.`}`,
      ),
    ].join('\n\n'),
    agent,
  };
};

/** A skill as the prompt tells it: by name, or whole — its SKILL.md's body — when it asks to be (`preload: true`). */
export type RenderedSkill = { name: string; whole?: string };

/**
 * The text of `prompt.md`: the agent's instructions, then each skill it is given by its namespaced name, the session to load it with the
 * Skill tool when the instructions say it is needed, then each skill told whole, under a heading of its name. Claude Code lists a plugin's
 * skills to the session by name and description all the same; naming them here says they are this agent's.
 */
export function renderedPrompt(step: Workflow, skills: readonly RenderedSkill[]): string {
  const agent = step.agent!;
  const plugin = pluginOf(agent.name);
  const named = skills.filter((s) => s.whole === undefined);
  const whole = skills.filter((s) => s.whole !== undefined);
  return (
    [
      ...(agent.instructions ? [agent.instructions.trimEnd()] : []),
      ...(named.length
        ? [
            `Your skills, each loaded with the Skill tool by its name when you need it: ${named.map((s) => `\`${plugin}:${s.name}\``).join(', ')}.`,
          ]
        : []),
      ...whole.map((s) => `## Skill \`${plugin}:${s.name}\`\n\n${s.whole!.trim()}`),
    ].join('\n\n') + '\n'
  );
}

/** The output style `systemPrompt: no-coding` writes into the step's plugin: Claude Code's prompt less `# Doing tasks`. */
export const noCodingStyle = (agent: string): string =>
  [
    '---',
    `name: ${NO_CODING_STYLE}`,
    `description: Claude Code's system prompt less its coding instructions, for the ${agent} agent, which does not write code.`,
    'keep-coding-instructions: false',
    '---',
    '',
    'Follow the instructions appended after this prompt: they say what you are for and how you work.',
    '',
  ].join('\n');

/** The manifest of a step's plugin, naming its namespace on purpose. */
export const pluginManifest = (agent: string): string =>
  JSON.stringify(
    { name: pluginOf(agent), version: '0.0.0', description: `The skills of the ${agent} agent, for one step of one run.` },
    null,
    2,
  ) + '\n';

/**
 * The flags a rendered step is filed with, as the runtime's `config.claude` takes them, `dir` its rendered folder: the prompt appended, or
 * in place of Claude Code's (`own`); the plugin, when there are skills or a style in it; and the style chosen (`no-coding`). Undefined for a
 * step not rendered (`rendersAgent`), which is filed with none.
 */
export function renderedFlags(
  step: Workflow,
  dir: string,
): { appendSystemPromptFile?: string; systemPromptFile?: string; pluginDir?: string[]; settings?: string } | undefined {
  if (!rendersAgent(step)) return undefined;
  const agent = step.agent!;
  const prompt = path.join(dir, PROMPT_FILE);
  const plugin = pluginOf(agent.name);
  const told = Boolean(agent.instructions || agent.skills?.length);
  return {
    ...(told ? (agent.systemPrompt === 'own' ? { systemPromptFile: prompt } : { appendSystemPromptFile: prompt }) : {}),
    ...(agent.skills?.length || agent.systemPrompt === 'no-coding' ? { pluginDir: [path.join(dir, plugin)] } : {}),
    ...(agent.systemPrompt === 'no-coding' ? { settings: JSON.stringify({ outputStyle: `${plugin}:${NO_CODING_STYLE}` }) } : {}),
  };
}
