import { own } from '../core/index.ts';
import type { SeamOps } from '../a2a/index.ts';
import { isRemote, type HarnessConfig } from './options.ts';

/** A harness this engine has, as a verb asks it: its name, the runner the engine runs it through, and how it was configured. */
export type Harnessed = { readonly name: string; readonly runner: SeamOps; readonly config: HarnessConfig };

/** Each harness of `harnesses` with the runner the engine made for it, by name. */
export const harnessedOf = (harnesses: Record<string, HarnessConfig>, runners: Record<string, SeamOps>): Record<string, Harnessed> =>
  Object.fromEntries(
    Object.entries(harnesses).flatMap(([name, config]) => {
      const runner = own(runners, name);
      return runner === undefined ? [] : [[name, { name, runner, config }]];
    }),
  );

/** Why an engine has no harness to take a task that names none: its `defaultHarness`, or its first, is not one of its harnesses. */
export const noFallbackRefusal = (fallback: string, harnesses: Record<string, HarnessConfig>): string => {
  const names = Object.keys(harnesses);
  return names.length
    ? `\`defaultHarness: ${fallback}\` is not a harness this engine has, so a task that names none has nowhere to run. Name one of its harnesses (${names.join(', ')}), or leave \`defaultHarness\` out for the first.`
    : '`harnesses` names none, so no task has anywhere to run. Give at least one harness, or leave `harnesses` out for the defaults.';
};

/** Whether the harness `name` of `harnesses` is a remote agent, which is A2A already. */
export const remoteIn = (harnesses: Record<string, HarnessConfig>, name: string): boolean => {
  const config = own(harnesses, name);
  return config !== undefined && isRemote(config);
};
