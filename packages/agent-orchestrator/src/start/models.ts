/**
 * The models a run names for its steps, for that run alone (`nemia start --model <step>=<model>`, a card's `model:`): read from their
 * pairs (`modelsOf`), judged against the run's steps (`modelsRefusal`), set on its frozen steps (`withModels`), and said back
 * (`modelsText`). Pure.
 */
import type { StepSpec } from '../step/step.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { autoDropped } from '../workflow/index.ts';
import { modeOf } from '../former/former.ts';

/** The model each step a run names runs on, by the step's name: every other step runs on its agent's. */
export type RunModels = Readonly<Record<string, string>>;

/**
 * The models `pairs` name, each `<step>=<model>`, in the order written — or why they do not read, as the words after what named them:
 * a pair with no `=`, a blank step or model, one with a space in it, and a step named twice.
 */
export function modelsOf(pairs: readonly string[]): { models: Record<string, string> } | { why: string } {
  const models: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    const step = pair.slice(0, at).trim();
    const model = pair.slice(at + 1).trim();
    if (at < 0 || !step || !model || /\s/.test(step) || /\s/.test(model))
      return { why: `\`${pair}\` is no step's model: name each as <step>=<model> — implement=fable` };
    if (models[step] !== undefined) return { why: `names ${step} twice, and a step runs on one model: name it once` };
    models[step] = model;
  }
  return { models };
}

/** The models as a card's `model:` line and `nemia start` say them: `implement=fable, review=opus`. */
export const modelsText = (models: RunModels): string =>
  Object.entries(models)
    .map(([step, model]) => `${step}=${model}`)
    .join(', ');

/**
 * Why a run of `steps` cannot run on `models`, said by `said` (`--model implement=fable`, or a card's line) — or undefined where it can:
 * a step the workflow does not have; `inherit`, a subagent's word no step's session can take; a step on a remote agent, which runs as its
 * operator configured it; and a Claude Code step in `auto` on a model that drops it (`autoDropped`), naming the
 * models that keep it, as `nemia retry --model` is refused. What the harness refuses of the config the step is then filed with is the
 * start's next question (`configRefused`), asked of the steps with the models set (`withModels`).
 */
export function modelsRefusal(steps: readonly StepSpec[], models: RunModels, said: (step: string) => string): string | undefined {
  for (const [name, model] of Object.entries(models)) {
    const step = steps.find((s) => s.name === name);
    if (!step) return `${said(name)}: the workflow has no step ${name} — its steps are ${steps.map((s) => s.name).join(', ')}.`;
    if (model === 'inherit')
      return `${said(name)}: \`inherit\` is Claude Code's word for a subagent on its caller's model, and a step's session has no caller. Name a model: ${name}=sonnet.`;
    if (isRemoteHarness(step.harness))
      return `${said(name)}: ${name} runs on \`harness: ${step.harness}\`, a remote A2A agent, which runs as its operator configured it: A2A carries no model, and the runtime refuses a task filed with one. Leave ${name} out.`;
    const dropped = autoDropped(step.harness, model, modeOf(step));
    if (dropped)
      return `${said(name)}: ${name} ${dropped}. Name a model that keeps it — ${name}=sonnet, or opus, or fable — or start a workflow whose step names a mode the model keeps: \`permissionMode: acceptEdits\`, or \`permissionMode: dontAsk\` with \`allowedTools:\` rules.`;
  }
  return undefined;
}

/** `steps` with each step `models` names on its model, every other as it is: what the run freezes, and what a revision it takes keeps. */
export const withModels = <S extends Pick<StepSpec, 'name' | 'model'>>(steps: readonly S[], models: RunModels | undefined): S[] =>
  steps.map((s) => {
    const model = models?.[s.name];
    return model === undefined ? s : { ...s, model };
  });
