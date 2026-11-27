/**
 * The words and groupings of a factory agent's page (`FactoryAgentPage`): the spec plate, the permissions, the history off the stats'
 * change marks, the skills and servers it gives by where each comes from, and the page's small counts. Pure.
 */
import type { HarnessModels } from 'objects';
import type { AgentListing, AgentRoleKey } from './api/agents.ts';
import type { KeyForm } from './api/builder.ts';
import type { RunView } from './api/judged.ts';
import type { SkillPlace } from './api/skills.ts';
import type { SkillSource } from './api/library.ts';
import { agentOf } from './api/judged.ts';
import { skillList } from './agents.ts';
import { dateParts } from './runWords.ts';

/** One change the stats marked: the UTC day it was marked on (`YYYY-MM-DD`), what changed and its name. */
export type Mark = { day: string; kind: 'step' | 'agent' | 'skill'; name: string };

/** One row of the spec plate: its label, its value, a note under the value, and for the effort its pips. */
export type PlateRow = {
  label: string;
  value: string;
  note: string | null;
  pips: { total: number; filled: number } | null;
};

/** What the plate says where a key is unset. */
const UNSET = 'Not set';

/**
 * The effort levels the model takes, as the harness lists them for it, else those the effort key's words allow the harness.
 * @param keys The agent's role keys.
 * @param keyForm The step form's keys; undefined while they load.
 * @param listed The model as its harness lists it, if it does.
 * @param harness The harness the agent runs on.
 */
const levelsOf = (
  keys: AgentListing['keys'],
  keyForm: KeyForm | undefined,
  listed: { efforts: readonly string[] | null } | undefined,
  harness: string,
) => {
  const field = keyForm?.keys.find((k) => k.key === 'effort');
  return listed?.efforts ?? field?.byHarness?.[harness] ?? field?.choices ?? [];
};

/**
 * The spec plate's rows: Harness, Model, Effort, Mode and Context. The model is its display name where the harness lists it, with the
 * exact id as its note; the effort is its word with a pip for each level the model takes, those up to its own filled.
 * @param keys The agent's role keys, as its file writes them.
 * @param keyForm The step form's keys, which say what each key means; undefined while they load.
 * @param models The models each harness lists; undefined while they load.
 */
export function plateOf(keys: AgentListing['keys'], keyForm: KeyForm | undefined, models: HarnessModels | undefined) {
  const meaning = (key: AgentRoleKey) => keyForm?.keys.find((k) => k.key === key)?.meaning ?? null;
  const harness = keys.harness ?? keyForm?.defaultHarness ?? UNSET;
  const listed = models?.harnesses.find((h) => h.harness === harness)?.models.find((m) => m.id === keys.model);
  const levels = levelsOf(keys, keyForm, listed, harness);
  const filled = keys.effort === undefined ? 0 : levels.indexOf(keys.effort) + 1;
  return [
    { label: 'Harness', value: harness, note: meaning('harness'), pips: null },
    { label: 'Model', value: listed?.name ?? keys.model ?? UNSET, note: listed ? listed.id : meaning('model'), pips: null },
    {
      label: 'Effort',
      value: keys.effort ?? UNSET,
      note: meaning('effort'),
      pips: levels.length > 0 ? { total: levels.length, filled } : null,
    },
    { label: 'Mode', value: keys.permissionMode ?? UNSET, note: meaning('permissionMode'), pips: null },
    { label: 'Context', value: keys.context ?? UNSET, note: meaning('context'), pips: null },
  ] satisfies PlateRow[];
}

/**
 * The three permission counts: the tools it names, those it may use with no ask and those it may not, each with what it counts, said
 * on hover.
 * @param keys The agent's role keys, as its file writes them.
 */
export const permissionsOf = (keys: AgentListing['keys']) =>
  [
    { label: 'Tools', count: skillList(keys.tools ?? '').length, said: 'The tools it is given. None named means every tool.' },
    { label: 'Allowed', count: skillList(keys.allowedTools ?? '').length, said: 'The calls it may make without asking.' },
    { label: 'Denied', count: skillList(keys.disallowedTools ?? '').length, said: 'The calls it may never make.' },
  ] as const;

/**
 * A mark's day as the page says it: day and month, in UTC, the zone the marks are named in (`27 Nov`).
 * @param day The mark's day, `YYYY-MM-DD`.
 */
const dayWords = (day: string) => {
  const { day: d, month } = dateParts(new Date(`${day}T12:00:00Z`), 'UTC');
  return `${d} ${month}`;
};

/** The sentence a change reads as. */
const SAID: Readonly<Record<Mark['kind'], (name: string) => string>> = {
  step: (name) => `The ${name} step was edited`,
  skill: (name) => `Skill ${name} was edited`,
  agent: () => 'Its file was edited',
};

/**
 * The history: one sentence a day for each kind and name the marks say changed, the newest day first.
 * @param marks The stats' change marks of the agent.
 */
export function historyOf(marks: readonly Mark[]) {
  const seen = new Set<string>();
  return [...marks]
    .sort((a, b) => b.day.localeCompare(a.day))
    .flatMap((mark) => {
      const key = `${mark.day}/${mark.kind}/${mark.name}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, day: dayWords(mark.day), sentence: SAID[mark.kind](mark.name) }];
    });
}

/**
 * The day its file last changed, as the page says it; null where no mark says it.
 * @param marks The stats' change marks of the agent.
 */
export const editedDayOf = (marks: readonly Mark[]) => {
  const newest = marks.filter((mark) => mark.kind === 'agent').sort((a, b) => b.day.localeCompare(a.day))[0];
  return newest ? dayWords(newest.day) : null;
};

/** What a step's page says of the skills and servers its layers add. */
export type StepGives = {
  step: string;
  added: readonly string[];
  skillsFrom: readonly { name: string; from: SkillSource | null; foundIn: string | null }[];
  mcp: readonly string[];
};

/** One skill as its tile says it: its name, what it is for, and where it comes from. */
type SkillTile = { name: string; description: string | null; where: string; foundIn: string | null };

/** One group of tiles under its caption. */
export type TileGroup<T> = { title: string; tiles: T[] };

/** Where a skill comes from, as a tile says it. */
const WHERE: Readonly<Record<SkillSource, string>> = {
  factory: 'From the factory',
  user: 'From your library',
  repo: 'From the repository',
  builtin: 'Built into Nemia',
};

/**
 * The skills it gives by where they come from: those in its file, then those each step it is hired into adds that its file does not
 * give, one group for each step name across workflows.
 * @param given The skills its file gives.
 * @param steps What each step it fills adds, by its page.
 * @param places The factory's skills by place, whose entries say what each is for.
 */
export function skillGroupsOf(given: readonly AgentListing['given'][number][], steps: readonly StepGives[], places: readonly SkillPlace[]) {
  const listed = places.flatMap((place) => place.skills);
  const inFile = new Set(given.map((skill) => skill.name));
  const groups: TileGroup<SkillTile>[] = [
    {
      title: 'In its file',
      tiles: given.map((skill) => ({
        name: skill.name,
        description: skill.entry?.description ?? null,
        where: skill.from ? WHERE[skill.from] : 'Not found',
        foundIn: skill.foundIn,
      })),
    },
  ];
  for (const name of new Set(steps.map((step) => step.step))) {
    const added = [...new Set(steps.filter((step) => step.step === name).flatMap((step) => step.added))].filter(
      (skill) => !inFile.has(skill),
    );
    const found = steps.filter((step) => step.step === name).flatMap((step) => step.skillsFrom);
    groups.push({
      title: `From its ${name} step`,
      tiles: added.map((skill) => {
        const from = found.find((f) => f.name === skill);
        const row = listed.find((s) => s.name === skill);
        const origin = from?.from ?? row?.from ?? null;
        return {
          name: skill,
          description: row?.entry?.description ?? null,
          where: origin ? WHERE[origin] : 'Not found',
          foundIn: from?.foundIn ?? null,
        };
      }),
    });
  }
  return groups.filter((group) => group.tiles.length > 0);
}

/** One MCP server as its tile says it. */
type ServerTile = { name: string };

/**
 * The MCP servers it loads by where they come from: those its file names, then those each step adds, one group for each step name.
 * @param mcp The `mcp:` line of its file; null for none.
 * @param steps What each step it fills adds, by its page.
 */
export function serverGroupsOf(mcp: string | null, steps: readonly StepGives[]) {
  const inFile = skillList(mcp ?? '');
  const groups: TileGroup<ServerTile>[] = [{ title: 'In its file', tiles: inFile.map((name) => ({ name })) }];
  for (const name of new Set(steps.map((step) => step.step))) {
    const added = [...new Set(steps.filter((step) => step.step === name).flatMap((step) => step.mcp))].filter(
      (server) => !inFile.includes(server),
    );
    groups.push({ title: `From its ${name} step`, tiles: added.map((server) => ({ name: server })) });
  }
  return groups.filter((group) => group.tiles.length > 0);
}

/**
 * How many words a body has: its runs of non-space characters.
 * @param body The instructions as written.
 */
export const wordsOf = (body: string) => body.split(/\s+/).filter(Boolean).length;

/**
 * When its last session ended, in epoch ms: the latest end of a session of a step given to the agent in `runs`; null where none ended.
 * @param runs The runs to read, finished or not.
 * @param agent The agent's name.
 */
export function lastEndedOf(runs: readonly RunView[], agent: string) {
  const ends = runs.flatMap((run) =>
    run.steps
      .filter((step) => agentOf(step) === agent)
      .flatMap((step) => step.timeline.flatMap((t) => (t.session?.endedAt ? [Date.parse(t.session.endedAt)] : []))),
  );
  return ends.length === 0 ? null : Math.max(...ends);
}
