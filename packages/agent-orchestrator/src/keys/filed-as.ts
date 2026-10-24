/**
 * Which line of a step each field of its filed config comes from (`FILED_AS`), and the runtime's refusal of that config said as the
 * step's (`filedRefusal`): its words, after the line a person wrote. Pure.
 */
import { contextText, MOUNTED_READS } from './keys.ts';
import type { Workflow } from '../step/step.ts';

/** A step's keys a filed config is written from. */
export type FiledStep = Pick<
  Workflow,
  | 'model'
  | 'effort'
  | 'context'
  | 'permissionMode'
  | 'sandbox'
  | 'tools'
  | 'disallowedTools'
  | 'allowedTools'
  | 'budget'
  | 'remote'
  | 'writable'
  | 'reads'
>;

/** What a retry asked for that its config is filed with instead of the step's own lines: `--model` on a fresh try, and `--budget`. */
export type FiledFlags = { model?: string; budget?: number };

/**
 * The step key each field of a filed config is written as, and its value as a step's line says it; `mounts`, which both `writable:` and
 * `reads:` give, names each the step has, of `reads:` only the names that mount a folder (`MOUNTED_READS`). A field not here — the
 * harness's own arguments, which the step's agent and its run give — has no line of the step's.
 */
export const FILED_AS: Readonly<Record<string, (step: FiledStep) => string | undefined>> = {
  model: (s) => s.model && `model: ${s.model}`,
  effort: (s) => s.effort && `effort: ${s.effort}`,
  contextTokens: (s) => (s.context === undefined ? undefined : `context: ${contextText(s.context)}`),
  permissionMode: (s) => (s.sandbox ? `sandbox: ${s.sandbox}` : s.permissionMode && `permissionMode: ${s.permissionMode}`),
  tools: (s) => s.tools && `tools: ${s.tools.join(', ')}`,
  disallowedTools: (s) => s.disallowedTools && `disallowedTools: ${s.disallowedTools.join(', ')}`,
  allowedTools: (s) => s.allowedTools && `allowedTools: ${s.allowedTools.join(', ')}`,
  budgetUsd: (s) => (s.budget === undefined ? undefined : `budget: ${s.budget}`),
  claude: (s) => (s.remote ? 'remote: true' : undefined),
  mounts: (s) => {
    const mounted = s.reads?.filter((n) => MOUNTED_READS.includes(n)) ?? [];
    const lines = [s.writable && `writable: ${s.writable.join(', ')}`, mounted.length && `reads: ${mounted.join(', ')}`];
    return lines.filter(Boolean).join('` and `') || undefined;
  },
};

/** The flag a retry typed for a field it chose, before the step's own line: `--model <m>`, `--budget <amount>`. */
const FLAG_AS: Readonly<Record<string, (flags: FiledFlags) => string | undefined>> = {
  model: (f) => (f.model === undefined ? undefined : `--model ${f.model || "''"}`),
  budgetUsd: (f) => (f.budget === undefined ? undefined : `--budget ${f.budget}`),
};

/** The line a field of `step`'s filed config comes from: the flag a retry typed (`flags`), else the step's own key, else none. */
export const lineOf =
  (step: FiledStep, flags: FiledFlags = {}) =>
  (field: string): string | undefined =>
    FLAG_AS[field]?.(flags) ?? FILED_AS[field]?.(step);

/**
 * The runtime's refusal of the config `name` is filed with, said as the step's: `<name>: \`<line>\` (filed as \`<field>\`): <words>`,
 * where the line is the first field's that draws the same words when asked alone (`lines`), else `<name>: <words>` — a refusal of two
 * fields together, or of one no line of the step's gave.
 *
 * @param refusal The runtime's refusal of a config on the step's harness (`configRefusal`), undefined where it takes it.
 * @returns undefined where the runtime takes the config whole.
 */
export function filedRefusal<C extends object>(
  refusal: (config: Partial<C>) => string | undefined,
  name: string,
  config: C,
  lines: (field: string) => string | undefined,
): string | undefined {
  const why = refusal(config);
  if (why === undefined) return undefined;
  const field = Object.entries(config).find(([key, value]) => value !== undefined && refusal({ [key]: value } as Partial<C>) === why)?.[0];
  const line = field === undefined ? undefined : lines(field);
  return line === undefined ? `${name}: ${why}` : `${name}: \`${line}\` (filed as \`${field}\`): ${why}`;
}
