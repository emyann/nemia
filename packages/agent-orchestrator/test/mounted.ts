/**
 * The reach a filing gives a session outside its workspace, read off the config its harness is filed (`filedConfig`), as Claude Code
 * holds a mount (`readsAt`, `writesAt`): the run's artifacts folder, the store's inbox and the run's inputs a fence test files against,
 * and each step's first filing of them (`filedOf`). Held here so the mount tests and the shipped steps' fence share one model of it.
 */
import path from 'node:path';
import type { loadWorkflows } from '../src/folder/folder.store.ts';
import { filedConfig } from '../src/filed/filed.ts';

type Step = ReturnType<typeof loadWorkflows>[number];

/** The run's artifacts folder the reach below is filed against, one folder per step under it. */
export const RUN_ARTIFACTS = '/s/runs/r-1/artifacts';

/** The store's inbox the reach below is filed against, and a card in it. */
export const INBOX = '/s/inbox';
export const CARD = path.join(INBOX, 'card.md');

/** A file the step `by` handed over, in its own folder of the run's artifacts. */
export const handedBy = (by: string): string => path.join(RUN_ARTIFACTS, by, 'shot.png');

/** The run's inputs folder the reach below is filed against, and a file `nemia start --input` gave the run in it. */
export const INPUTS = '/s/runs/r-1/inputs';
export const INPUT_FILE = path.join(INPUTS, 'template-draft.md');

/**
 * Each step of `steps` by its name, with the config its first filing gives its harness (`filedConfig`), in a run that mounts nothing, and
 * is given no input unless `inputs` names its inputs folder. Its place denies a landing nothing, as the stand-in place does: the git
 * place's denies are `Bash` rules, which reach no folder a mount or a `Read` or `Edit` rule names.
 */
export const filedOf = (steps: readonly Step[], inputs?: string): Map<string, Filed> =>
  new Map(
    steps.map((step) => [
      step.name,
      filedConfig(
        step,
        steps,
        { gates: [] },
        {
          model: undefined,
          budgetUsd: undefined,
          runArtifacts: RUN_ARTIFACTS,
          inbox: INBOX,
          ...(inputs === undefined ? {} : { inputs }),
          own: {},
          landingDenied: () => [],
        },
      ),
    ]),
  );

export type Filed = ReturnType<typeof filedConfig>;

/** Whether `file` is under the folder a rule `Tool(//<folder>/**)` of the tool `tool` names, for a rule of that shape. */
export const ruleCovers = (rule: string, tool: string, file: string): boolean => {
  const folder = new RegExp(`^${tool}\\(/(/.*)/\\*\\*\\)$`).exec(rule)?.[1];
  return folder !== undefined && file.startsWith(`${folder}/`);
};

/** Whether a mount of a filed config holds `file`, read-only or writable as `readOnly` says. */
export const mountHolds = (config: Filed, file: string, readOnly: boolean): boolean =>
  (config.mounts ?? []).some((m) => m.readOnly === readOnly && file.startsWith(`${m.path}/`));

/** Whether a session filed with `config` reads `file` outside its workspace: a mount holds it, or a `Read(//<folder>/**)` allow does. */
export const readsAt = (config: Filed, file: string): boolean =>
  mountHolds(config, file, true) ||
  mountHolds(config, file, false) ||
  (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Read', file));

/**
 * Whether a session filed with `config` may write `file` outside its workspace: a writable mount or an `Edit(//<folder>/**)` allow names
 * it, and neither a read-only mount, whose deny beats every allow and mode, nor an `Edit(//<folder>/**)` deny holds it.
 */
export const writesAt = (config: Filed, file: string): boolean =>
  (mountHolds(config, file, false) || (config.allowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file))) &&
  !mountHolds(config, file, true) &&
  !(config.disallowedTools ?? []).some((rule) => ruleCovers(rule, 'Edit', file));
