/**
 * A hire as the `Hire` object says it: who fills a factory's step (`fillOrigin`) and where each setting a session gets there came from
 * (`settingOrigin`), each proved by contracts/hire-origin.contract.ts, decided from what the resolved step already carries; its name, the
 * workflow's and the step's joined by a dot (`hireNamed`), and two steps whose names join to one found (`hiresCollided`); and its status
 * (`hireStatusOf`), off what the step's read says of it. Pure.
 */
import type { HireStatus } from 'objects';
import type { FillOriginOf, SettingOriginOf } from '../../contracts/hire-origin.contract.ts';

/** Who fills a step: its own file's `agent:` (`written`), the factory's hire (`hired`), neither, or both, which a start refuses. */
export const fillOrigin: FillOriginOf = (written, hired) => {
  if (written && hired) return 'refused';
  if (written) return 'step';
  return hired ? 'factory' : 'unfilled';
};

/** Where a setting came from: the step's own file where it writes it, else its agent's where it gives it, else the harness's default. */
export const settingOrigin: SettingOriginOf = (stepSets, agentGives) => {
  if (stepSets) return 'step';
  return agentGives ? 'agent' : 'default';
};

/** The name of the Hire of the step `step` of the workflow `workflow`: the two joined by a dot, `build.implement`. */
export const hireNamed = (workflow: string, step: string): string => `${workflow}.${step}`;

/** A step of a workflow, as a Hire names it. */
export type HiredStep = { readonly workflow: string; readonly step: string };

/**
 * The steps among `steps` whose names join to the name of another's (`a.b` step `c`, `a` step `b.c`): by the joined name, each step
 * that holds it. A name only one step joins to is not there.
 */
export function hiresCollided(steps: readonly HiredStep[]): ReadonlyMap<string, readonly HiredStep[]> {
  const by = new Map<string, HiredStep[]>();
  for (const s of steps) by.set(hireNamed(s.workflow, s.step), [...(by.get(hireNamed(s.workflow, s.step)) ?? []), s]);
  return new Map([...by].filter(([, held]) => held.length > 1));
}

/** A setting's value as the resolved step carries it. */
export type HireSettingValue = string | number | boolean | readonly string[];

/**
 * What a read of a factory's step says of its hire: the agent its own file names (`written`), the one the factory hires into it
 * (`hired`), each setting's value as the step resolved, the settings the step's file writes itself (`stepSets`) and those its agent
 * gives it (`agentGives`), the harness settings the factory gives its sessions, and why the step does not read, where it does not.
 */
export type HireRead = {
  readonly written?: string | undefined;
  readonly hired?: string | undefined;
  readonly values: Readonly<Record<string, HireSettingValue | undefined>>;
  readonly stepSets: readonly string[];
  readonly agentGives: readonly string[];
  readonly harnessSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
  readonly error?: string | undefined;
};

/**
 * A Hire's status off its step's read (`HireRead`): who fills the step (`fillOrigin`) and the agent that does, the step's own before the
 * factory's, each of the settings `keys` — the Hire's, as `objects` names them — with its value and where it came from
 * (`settingOrigin`), the factory's harness settings, and why it does not read.
 */
export function hireStatusOf(read: HireRead, keys: readonly string[]): HireStatus {
  const agent = read.written ?? read.hired;
  const settingOf = (key: string) => {
    const value = read.values[key];
    return {
      ...(value === undefined ? {} : { value: typeof value === 'object' ? [...value] : value }),
      from: settingOrigin(read.stepSets.includes(key), read.agentGives.includes(key)),
    };
  };
  return {
    filled: fillOrigin(read.written !== undefined, read.hired !== undefined),
    ...(agent === undefined ? {} : { agent }),
    settings: Object.fromEntries(keys.map((key) => [key, settingOf(key)])) as HireStatus['settings'],
    ...(read.harnessSettings === undefined ? {} : { harnessSettings: read.harnessSettings }),
    ...(read.error === undefined ? {} : { error: read.error }),
  };
}
