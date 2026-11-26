/**
 * Whether a change widens access (`contracts/proposal-access.contract.ts`): an allow gained, a deny lost or a mode that reaches further
 * widens; else an allow lost, a deny gained or a mode that reaches less narrows. Rules are compared as written. Pure.
 */
import { fenceReach } from 'agent-runtime/vocabulary';
import type { Access, AccessChangeOf } from '../../contracts/proposal-access.contract.ts';
import { DEFAULT_HARNESS } from '../harness/harness.ts';
import { FENCE_KEYS } from '../workflow/index.ts';

/** A step's fence keys this reads, by the layer's own list (`FENCE_KEYS`): its allows, its denies and its permission mode. */
const [, ALLOWS, DENIES, MODE] = FENCE_KEYS;

/** Whether `after` holds a rule `before` does not. */
const gained = (before: readonly string[], after: readonly string[]) => after.some((rule) => !before.includes(rule));

/**
 * Whether going from `before` to `after` widens access, narrows it, or leaves it the same; widening is judged first, so a
 * change that does both widens.
 * @param before The object's access before the change; `NO_ACCESS` where it was not there.
 * @param after The object's access after the change; `NO_ACCESS` where it is no longer there.
 */
export const accessChange: AccessChangeOf = (before, after) => {
  if (gained(before.allows, after.allows) || gained(after.denies, before.denies) || after.mode > before.mode) return 'widens';
  if (gained(after.allows, before.allows) || gained(before.denies, after.denies) || after.mode < before.mode) return 'narrows';
  return 'same';
};

/** An object's access where it is not there: nothing let through, nothing refused, the lowest mode. */
const NO_ACCESS: Access = { allows: [], denies: [], mode: 0 };

/**
 * How far each permission mode reaches, as the runtime ranks the default harness's modes (`fenceReach`), one above it so that a mode
 * named reaches further than an object that is not there (`NO_ACCESS`). A mode the runtime does not rank ranks above them all, so a word
 * the reader does not know reads as widening, and the person is asked; so does every mode, should the runtime rank none.
 */
const REACH = fenceReach(DEFAULT_HARNESS);

/** The ranks of the modes, each one above the runtime's. */
const MODE_RANKS: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(REACH?.rank ?? {}).map(([mode, rank]) => [mode, rank + 1]),
);

/** The rank of a mode no rank names: above the widest. */
const UNKNOWN_MODE = Math.max(0, ...Object.values(MODE_RANKS)) + 1;

/**
 * The rank of the mode `mode` names: the runtime's given mode's where none is named.
 * @param mode The permission mode as written; undefined, null or empty where none is named.
 */
const modeRank = (mode: unknown) => {
  const named = mode === undefined || mode === null || mode === '' ? REACH?.given : mode;
  return typeof named === 'string' ? (MODE_RANKS[named] ?? UNKNOWN_MODE) : UNKNOWN_MODE;
};

/**
 * A list of rules as a line writes them, `Read, Bash(git diff *)`, split at the commas outside parentheses; a list given as is.
 * @param value A line of rules, or a list of them; anything else holds none.
 */
function rulesIn(value: unknown) {
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
const recordOf = (value: unknown) =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** What one set of keys lets through and refuses, each rule led by `at`: its tools, allows, servers, sandbox and agent; its denials. */
const keysAccess = (keys: Readonly<Record<string, unknown>>, at: string) => ({
  allows: [
    ...rulesIn(keys[ALLOWS]).map((r) => `${at}allow ${r}`),
    ...rulesIn(keys.tools).map((r) => `${at}tool ${r}`),
    ...rulesIn(keys.mcp).map((r) => `${at}server ${r}`),
    ...(typeof keys.sandbox === 'string' && keys.sandbox !== '' ? [`${at}sandbox ${keys.sandbox}`] : []),
    ...(typeof keys.agent === 'string' && keys.agent !== '' ? [`${at}agent ${keys.agent}`] : []),
  ],
  denies: rulesIn(keys[DENIES]).map((r) => `${at}deny ${r}`),
  mode: modeRank(keys[MODE]),
});

/** Accesses joined: every rule of each, and the furthest mode. */
const joined = (all: readonly Access[]) => ({
  allows: all.flatMap((a) => a.allows),
  denies: all.flatMap((a) => a.denies),
  mode: all.reduce((m, a) => Math.max(m, a.mode), 0),
});

/**
 * The access of an object of `kind` whose spec is `spec`, as `accessChange` compares it: an Agent's keys; a Workflow's steps' keys, each
 * rule led by its step; a Hire's agent in its step; an McpServer's address; a Factory's attached workflows. A Skill lets nothing through
 * of its own. A spec absent (an object not there) is `NO_ACCESS`. Pure.
 * @param kind The object's kind: Agent, Workflow, Hire, McpServer, Factory or Skill; any other lets nothing through.
 * @param name The object's name, which an McpServer's rule carries.
 * @param spec The object's spec; undefined or null where the object is not there.
 */
export function accessOf(kind: string, name: string, spec: unknown) {
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
