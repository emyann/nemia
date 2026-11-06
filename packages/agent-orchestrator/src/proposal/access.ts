/**
 * Whether a change widens access (`contracts/proposal-access.contract.ts`): an allow gained, a deny lost or a mode that reaches further
 * widens; else an allow lost, a deny gained or a mode that reaches less narrows. Rules are compared as written. Pure.
 */
import type { Access, AccessChangeOf } from '../../contracts/proposal-access.contract.ts';

/** Whether `after` holds a rule `before` does not. */
const gained = (before: readonly string[], after: readonly string[]): boolean => after.some((rule) => !before.includes(rule));

export const accessChange: AccessChangeOf = (before, after) => {
  if (gained(before.allows, after.allows) || gained(after.denies, before.denies) || after.mode > before.mode) return 'widens';
  if (gained(after.allows, before.allows) || gained(before.denies, after.denies) || after.mode < before.mode) return 'narrows';
  return 'same';
};

/** An object's access where it is not there: nothing let through, nothing refused, the lowest mode. */
export const NO_ACCESS: Access = { allows: [], denies: [], mode: 0 };

/**
 * How far each permission mode reaches, as Claude Code's modes go: `plan` reads alone, `dontAsk` runs only what is allowed, `default`
 * asks, `acceptEdits` writes unasked, `auto` acts unasked, `bypassPermissions` asks nothing. A mode not named ranks highest
 * (`UNKNOWN_MODE`), so a word the reader does not know reads as widening, and the person is asked.
 */
const MODE_RANKS: Readonly<Record<string, number>> = { plan: 1, dontAsk: 2, default: 3, acceptEdits: 4, auto: 5, bypassPermissions: 6 };

/** The rank of a mode no rank names. */
const UNKNOWN_MODE = 7;

/** The rank of the mode `mode` names: `default`'s where none is named. */
export const modeRank = (mode: unknown): number =>
  mode === undefined || mode === null || mode === '' ? 3 : typeof mode === 'string' ? (MODE_RANKS[mode] ?? UNKNOWN_MODE) : UNKNOWN_MODE;

/** A list of rules as a line writes them, `Read, Bash(git diff *)`, split at the commas outside parentheses; a list given as is. */
export function rulesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim());
  if (typeof value !== 'string') return [];
  const out: string[] = [];
  let depth = 0;
  let word = '';
  for (const c of value) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) {
      out.push(word);
      word = '';
    } else word += c;
  }
  out.push(word);
  return out.map((w) => w.trim()).filter((w) => w !== '');
}

/** The keys of a step or an agent, read as a record. */
const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** What one set of keys lets through and refuses, each rule led by `at`: its tools, allows, servers, sandbox and agent; its denials. */
const keysAccess = (keys: Readonly<Record<string, unknown>>, at: string): Access => ({
  allows: [
    ...rulesIn(keys.allowedTools).map((r) => `${at}allow ${r}`),
    ...rulesIn(keys.tools).map((r) => `${at}tool ${r}`),
    ...rulesIn(keys.mcp).map((r) => `${at}server ${r}`),
    ...(typeof keys.sandbox === 'string' && keys.sandbox !== '' ? [`${at}sandbox ${keys.sandbox}`] : []),
    ...(typeof keys.agent === 'string' && keys.agent !== '' ? [`${at}agent ${keys.agent}`] : []),
  ],
  denies: rulesIn(keys.disallowedTools).map((r) => `${at}deny ${r}`),
  mode: modeRank(keys.permissionMode),
});

/** Accesses joined: every rule of each, and the furthest mode. */
const joined = (all: readonly Access[]): Access => ({
  allows: all.flatMap((a) => a.allows),
  denies: all.flatMap((a) => a.denies),
  mode: all.reduce((m, a) => Math.max(m, a.mode), 0),
});

/**
 * The access of an object of `kind` whose spec is `spec`, as `accessChange` compares it: an Agent's keys; a Workflow's steps' keys, each
 * rule led by its step; a Hire's agent in its step; an McpServer's address; a Factory's attached workflows. A Skill lets nothing through
 * of its own. A spec absent (an object not there) is `NO_ACCESS`. Pure.
 */
export function accessOf(kind: string, name: string, spec: unknown): Access {
  if (spec === undefined || spec === null) return NO_ACCESS;
  const s = recordOf(spec);
  switch (kind) {
    case 'Agent':
      return keysAccess(recordOf(s.keys), '');
    case 'Workflow': {
      const steps = Array.isArray(s.steps) ? s.steps.map(recordOf) : [];
      return joined(steps.map((step) => keysAccess(recordOf(step.keys), `${String(step.name)}: `)));
    }
    case 'Hire':
      return {
        allows: typeof s.agent === 'string' ? [`hire ${String(s.workflow)}/${String(s.step)} ${s.agent}`] : [],
        denies: [],
        mode: 0,
      };
    case 'McpServer':
      return { allows: [`server ${name} ${String(s.type)} ${String(s.url)}`], denies: [], mode: 0 };
    case 'Factory':
      return { allows: rulesIn(s.workflows).map((w) => `workflow ${w}`), denies: [], mode: 0 };
    default:
      return NO_ACCESS;
  }
}
