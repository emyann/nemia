/**
 * What a list never carries: a file's content. Each kind says here, by path, the fields of its object that are a file's text — an
 * agent's instructions and source, a skill's body, a workflow's README and its steps' notes, a template's instruction and rules, a
 * proposal's objects' specs, a card's idea — and its `<Kind>List` serves its items without them (each kind's `<Kind>Listed`, beside its
 * object). A read of one object answers it whole, and each file is reached by a path of its own. Typed over every kind, as `READS` is, so a
 * kind the api gains does not compile until it says what it leaves out. A path is dotted from the object's root, `[]` standing for each
 * item of an array (`spec.steps[].body`).
 */
import type { Kind } from './words.ts';

/** The paths of each kind's object that a list's item leaves out, its files' content; none for a kind that carries no file. */
export const LISTED_WITHOUT: { readonly [K in Kind]: readonly string[] } = {
  Run: [],
  Card: ['spec.body', 'status.source'],
  Factory: [],
  McpServer: [],
  Schedule: [],
  Trigger: [],
  Hire: [],
  LibraryAdd: [],
  Volume: [],
  Workflow: [
    'spec.readme',
    'spec.steps[].body',
    'spec.files[].text',
    'status.readmeBody',
    'status.steps[].body',
    'status.steps[].own.body',
    'status.steps[].layers',
  ],
  Agent: ['spec.instructions', 'spec.output.text', 'status.source'],
  Skill: ['spec.body', 'spec.files[].text'],
  Template: ['spec.instruction', 'spec.rules'],
  Subscription: [],
  Event: [],
  Proposal: ['spec.objects[].spec', 'status.before[].spec'],
  Delegation: [],
};

/** Whether `value` is an object a key can be read off: no array, no null. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether the path's `segments` are missing at `value`: a key absent from an object that holds the key's parent. */
const missingAt = (value: unknown, segments: readonly string[]): boolean => {
  const [segment, ...rest] = segments;
  if (segment === undefined) return false;
  const many = segment.endsWith('[]');
  const key = many ? segment.slice(0, -2) : segment;
  if (!isRecord(value)) return false;
  if (!(key in value)) return true;
  const inner = value[key];
  if (!many) return missingAt(inner, rest);
  return Array.isArray(inner) && inner.some((item) => missingAt(item, rest));
};

/**
 * Each of `paths` that `object` lacks where it holds the path's parent: a field a list left out. A parent that is null or absent says
 * nothing is missing beneath it (an agent with no `output:`). Pure.
 * @param paths The paths to look for, as `LISTED_WITHOUT` writes them.
 * @param object The object they are looked for in, as a file or an answer holds it.
 */
export const filesLeftOut = (paths: readonly string[], object: unknown) => paths.filter((path) => missingAt(object, path.split('.')));
