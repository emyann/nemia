/**
 * The Skill door's memory stand-in: a fresh layer of `SkillDoor` per call, its skills held in a map by folder, each its SKILL.md's text,
 * built by `skillDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program —
 * `Effect.provide(program, skillDoorMemory())` — where it needs a skill to exist and nothing of the disk; the walks of
 * `test/skill-walks.ts` hold it to what the files answer. Its folders are under `MEMORY_ROOT`, named as the files name them under the
 * store's root: your library is `<MEMORY_ROOT>/workflows/skills`.
 *
 * A skill is found as a start finds one: the roots' precedence decided by `lookedUp`, the one decider the files read too, and the
 * package's builtin place skills (`PLACE_SKILLS`) last, as `skillsFor` reads them — the stand-in holds none of its own. A skill held is
 * its SKILL.md alone, written through the renders the files write through (`renderSkill`, `withPreload`); a link, a file beside SKILL.md
 * and a skill named with its repository's folder (`folder:name`) are the files' to read.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { SKILLS_FOLDER, WorkflowError } from '../step/step.ts';
import { skillTurnCost, type SkillsFound } from '../agents/agents.ts';
import { lookedUp } from './lookup.ts';
import { renderSkill, skillEntryOf, withPreload } from './skills.ts';
import { isBuiltinPlace, lookupOf, lookupRoots, PLACE_SKILLS, skillsFor, type Places } from './read.store.ts';
import { SkillDoor, skillDoorOver, type SkillLayer, type SkillPage, type SkillWhere } from './skill-door.store.ts';

/** Where the stand-in says a skill's folder is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** Yours, under the stand-in's root: the folder your folder of skills is in, as `<home>/workflows` is on disk. */
const MEMORY_WORKFLOWS = path.posix.join(MEMORY_ROOT, 'workflows');

/** The version of a SKILL.md held: a digest of its text, as `skillVersion` digests a skill's folder. */
const versionOf = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/**
 * The package's builtin place skills, each by name with its folder, in the order `skillsFor` finds them: read through `skillsFor` itself,
 * at a folder of the stand-in's that no disk holds, so every skill it answers is a place skill (`isBuiltinPlace`).
 */
const placeSkills = (): Array<[string, string | WorkflowError]> =>
  [...skillsFor(path.posix.join(MEMORY_WORKFLOWS, '_')).all].filter(([, at]) => typeof at !== 'string' || isBuiltinPlace(at));

/** Why a write or a copy may not go to the folder of skills `at`, as the files refuse it, or nothing. */
function placeRefusal(at: string, where: SkillWhere | undefined): Invalid | undefined {
  if (path.posix.basename(at) !== SKILLS_FOLDER)
    return new Invalid({ message: `${at} is not a folder of skills: name <workflows>/${SKILLS_FOLDER}.` });
  if (where?.anywhere !== true && path.posix.dirname(at) !== MEMORY_WORKFLOWS)
    return new Invalid({
      message: `${at} is not your ${SKILLS_FOLDER}/ (${path.posix.join(MEMORY_WORKFLOWS, SKILLS_FOLDER)}): write it there, or pass { anywhere: true }.`,
    });
  return undefined;
}

/** `act`'s answer, or what it threw as a `WorkflowError`, an `Invalid`, in its words: the card reader's refusal, as the files word it. */
function asRefusal<A>(act: () => A): A {
  try {
    return act();
  } catch (err) {
    throw new WorkflowError(err instanceof Error ? err.message : String(err));
  }
}

/**
 * The skills of the workflow folder `dir` and its places, as a start finds them, each root's names read by `namesIn`: the roots'
 * precedence decided by `lookedUp`, a name one repository holds in both places refused, and the builtin place skills last.
 */
function foundIn(namesIn: (holder: string) => string[], dir: string, places: Places | undefined): SkillsFound {
  const roots = lookupRoots(dir, places);
  const names = roots.map((root) => namesIn(path.posix.join(root, SKILLS_FOLDER)));
  const all = new Map<string, string | WorkflowError>();
  for (const name of new Set(names.flat())) {
    const looked = lookedUp(lookupOf(roots, (at) => names[at]?.includes(name) === true));
    if (looked.kind === 'none') continue;
    const at = path.posix.join(roots[looked.at] ?? '', SKILLS_FOLDER, name);
    const again = looked.kind === 'both' ? path.posix.join(roots[looked.again] ?? '', SKILLS_FOLDER, name) : undefined;
    all.set(
      name,
      again === undefined
        ? at
        : new WorkflowError(`${name} is a skill in both ${at} and ${again}, one repository's two places for skills: keep one of them.`),
    );
  }
  for (const [name, at] of placeSkills()) if (!all.has(name)) all.set(name, at);
  return {
    at: { get: (name) => (name.includes(':') ? undefined : all.get(name)) },
    all,
    looked: [...roots.map((root) => path.posix.join(root, SKILLS_FOLDER)), PLACE_SKILLS],
  };
}

/** The skill `name` of the folder of skills `at` read for its page from the text held, `undefined` where none is. */
function pageOf(name: string, at: string, text: string | undefined): SkillPage {
  const file = path.posix.join(at, name, 'SKILL.md');
  if (text === undefined)
    return {
      entry: null,
      error: `${file} cannot be read: no skill is held there. Write it first, or name one that is.`,
      preload: false,
      cost: null,
      text: '',
      version: null,
    };
  const cost = skillTurnCost(name, text);
  const page = { preload: cost.preload, cost, text, version: versionOf(text) };
  try {
    return { entry: skillEntryOf(file, name, text), error: null, ...page };
  } catch (err) {
    return { entry: null, error: err instanceof Error ? err.message : String(err), ...page };
  }
}

/** A fresh Skill door over a map: no skill held. */
export function skillDoorMemory(): Layer.Layer<never> {
  const held = new Map<string, string>();
  const namesIn = (holder: string): string[] =>
    [...held.keys()]
      .filter((dir) => path.posix.dirname(dir) === holder)
      .map((dir) => path.posix.basename(dir))
      .sort();
  const layer: SkillLayer = {
    skills: {
      found: ({ dir, places }) => foundIn(namesIn, dir, places),
      list: (holder) => namesIn(holder),
      read: (name, at) => pageOf(name, at, held.get(path.posix.join(at, name))),
      there: (name, at) => {
        const text = held.get(path.posix.join(at, name));
        return text === undefined ? { kind: 'none' } : { kind: 'held', version: versionOf(text) };
      },
      write: (name, change, version, at, where) => {
        const placed = placeRefusal(at, where);
        if (placed) throw placed;
        const dir = path.posix.join(at, name);
        const file = path.posix.join(dir, 'SKILL.md');
        const was = held.get(dir);
        if (!('body' in change) && (version === undefined || was === undefined))
          throw new Invalid({
            message: `${SKILLS_FOLDER}/${name} is a change of \`preload:\` alone, and there is no skill to change: write the whole skill to make it.`,
          });
        const text = asRefusal(() => ('body' in change ? renderSkill(change, was) : withPreload(file, was ?? '', change.preload)));
        held.set(dir, text);
        return { dir, name, version: versionOf(text), written: ['SKILL.md'] };
      },
      copy: (name, from, to, where) => {
        const placed = placeRefusal(to, where);
        if (placed) throw placed;
        const source = held.get(path.posix.join(from, name));
        if (source === undefined)
          throw new Missing({ message: `${from} has no skill named ${name}: a skill is a folder holding a SKILL.md. Name one it holds.` });
        asRefusal(() => skillEntryOf(path.posix.join(from, name, 'SKILL.md'), name, source));
        const dir = path.posix.join(to, name);
        if (held.has(dir))
          throw new Conflict({ message: `${SKILLS_FOLDER}/${name} is there already, in ${to}: give it as it is, or remove it first.` });
        held.set(dir, source);
        return { dir, name, written: ['SKILL.md'] };
      },
    },
  };
  return Layer.succeed(SkillDoor)(skillDoorOver(layer));
}
