/**
 * The words and groupings of a factory agent's page (`FactoryAgentPage`): the spec plate, the permissions, the history off the stats'
 * change marks, the skills and servers it gives by where each comes from, and the page's small counts. Pure.
 */
import type { HarnessModels } from 'objects';
import type { AgentListing } from './api/agents.ts';
import type { KeyForm } from './api/builder.ts';
import type { RunView } from './api/judged.ts';
import type { SkillPlace } from './api/skills.ts';
import type { SkillSource } from './api/library.ts';
import { agentOf } from './api/judged.ts';
import { skillList } from './agents.ts';
import { dateParts } from './runWords.ts';

/** One change the stats marked: the UTC day it was marked on (`YYYY-MM-DD`), what changed and its name. */
export type Mark = { day: string; kind: 'step' | 'agent' | 'skill'; name: string };

/** One row of the spec plate: its label, its value, a note of one short line under the value, and for the effort and the mode its pips. */
export type PlateRow = {
  label: string;
  value: string;
  note: string | null;
  pips: { total: number; filled: number } | null;
};

/** The key of the agent's file that says how its session asks before it acts, by the start of its name. */
const MODE = /^permission/;

/**
 * The value of the key of `keys` whose name matches `key`, as the file writes it; undefined where none is set.
 * @param keys The agent's role keys.
 * @param key The pattern the key's name matches.
 */
const valueOf = (keys: AgentListing['keys'], key: RegExp) => Object.entries(keys).find(([name]) => key.test(name))?.[1];

/** What the plate says where a key is unset. */
const UNSET = 'Not set';

/**
 * The effort levels the model takes, as the harness lists them for it, else those the effort key's words allow the harness.
 * @param keyForm The step form's keys; undefined while they load.
 * @param listed The model as its harness lists it, if it does.
 * @param harness The harness the agent runs on.
 */
const levelsOf = (keyForm: KeyForm | undefined, listed: { efforts: readonly string[] | null } | undefined, harness: string) => {
  const field = keyForm?.keys.find((k) => k.key === 'effort');
  return listed?.efforts ?? field?.byHarness?.[harness] ?? field?.choices ?? [];
};

/**
 * A model's name as the plate says it: the harness's name for it with the version its id ends on (`Opus 5.5` for an id ending
 * `-opus-5-5`), where the name is one word and says no version; the name alone where it says more; the id where the harness lists none.
 * @param id The model's id, as the agent's file writes it.
 * @param name The harness's name for it, where it lists it.
 */
export function modelWords(id: string, name: string | undefined) {
  if (name === undefined) return id;
  const version = /-(\d+)-(\d+)(?:-\d{8})?$/.exec(id);
  return version && /^[A-Za-z]+$/.test(name) ? `${name} ${version[1]}.${version[2]}` : name;
}

/**
 * The plate's Mode row: the mode's word, the meaning the api serves of it, and a pip for each word of the harness's fence, those up to
 * its rank filled; no pips where the api serves no fence for the harness.
 * @param mode The mode the agent's file writes; undefined where none is set.
 * @param fence The words of the harness's fence, most guarded first, as the api serves them.
 */
function modeRow(mode: string | undefined, fence: KeyForm['harnesses'][number]['fence']) {
  const word = fence.find((w) => w.word === mode);
  return {
    label: 'Mode',
    value: mode ?? UNSET,
    note: word?.meaning ?? null,
    pips: fence.length > 0 ? { total: fence.length, filled: word?.rank ?? 0 } : null,
  } satisfies PlateRow;
}

/**
 * The spec plate's rows: Harness, Model, Effort, Mode and Context, each value with a short line under it where the board has one.
 * The harness's note is the line the api serves of it; the model is its name with its version where the harness lists it
 * (`modelWords`), with the exact id as its note; the effort is its word with a pip for each level the model takes, those up to its own
 * filled; the mode is its word with the meaning the api serves of it, and a pip for each word of the harness's fence, those up to its
 * rank filled, the most guarded first.
 * @param keys The agent's role keys, as its file writes them.
 * @param keyForm The step form's keys, which say what each key means; undefined while they load.
 * @param models The models each harness lists; undefined while they load.
 */
export function plateOf(keys: AgentListing['keys'], keyForm: KeyForm | undefined, models: HarnessModels | undefined) {
  const harness = keys.harness ?? keyForm?.defaultHarness ?? UNSET;
  const listed = models?.harnesses.find((h) => h.harness === harness)?.models.find((m) => m.id === keys.model);
  const levels = levelsOf(keyForm, listed, harness);
  const filled = keys.effort === undefined ? 0 : levels.indexOf(keys.effort) + 1;
  const served = keyForm?.harnesses.find((h) => h.harness === harness);
  return [
    { label: 'Harness', value: harness, note: served?.note ?? null, pips: null },
    {
      label: 'Model',
      value: keys.model === undefined ? UNSET : modelWords(keys.model, listed?.name),
      note: listed?.id ?? keys.model ?? null,
      pips: null,
    },
    {
      label: 'Effort',
      value: keys.effort ?? UNSET,
      note: 'How hard it thinks per turn',
      pips: levels.length > 0 ? { total: levels.length, filled } : null,
    },
    modeRow(valueOf(keys, MODE), served?.fence ?? []),
    { label: 'Context', value: keys.context ?? UNSET, note: 'Its context window, in tokens', pips: null },
  ] satisfies PlateRow[];
}

/** Each permission count: its label, the key of the agent's file it counts, and what the count says on hover. */
const PERMISSIONS = [
  { label: 'Tools', key: /^tools$/, said: 'The tools it is given. None named means every tool.' },
  { label: 'Allowed', key: /^allowed/, said: 'The calls it may make without asking.' },
  { label: 'Denied', key: /^disallowed/, said: 'The calls it may never make.' },
] as const;

/**
 * The three permission counts: the tools it names, those it may use with no ask and those it may not, each with what it counts, said
 * on hover.
 * @param keys The agent's role keys, as its file writes them.
 */
export const permissionsOf = (keys: AgentListing['keys']) =>
  PERMISSIONS.map(({ label, key, said }) => ({
    label,
    count: skillList(valueOf(keys, key) ?? '').length,
    said,
  }));

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
  skillsFrom: readonly { name: string; from: SkillSource | null; foundIn: string | null; description: string | null }[];
  mcp: readonly string[];
};

/** One skill as its tile says it: its name, what it is for, and where it comes from. */
type SkillTile = { name: string; description: string | null; where: string };

/** One group of tiles under its caption, which counts them. */
type TileGroup<T> = { title: string; tiles: T[] };

/** Where a skill comes from, as a tile says it, by the place a start finds it in. */
const WHERE: Readonly<Record<Exclude<SkillSource, 'factory'>, string>> = {
  user: 'From your library',
  repo: 'From the repository',
  builtin: 'Built into Nemia',
};

/**
 * Where a skill comes from, as its tile says it: the factory's by its name, the repository's with the folder of skills it is in (`From
 * the repository, apps/site/skills`), your library, Nemia, or nowhere.
 * @param from The place a start finds it in; null where none the board pages has it.
 * @param foundIn The folder the repository has it in, from its root; null where it has none.
 * @param factory The factory the agent is read in.
 */
export function whereOf(from: SkillSource | null, foundIn: string | null, factory: string) {
  if (from === 'factory') return `Factory ${factory}`;
  if (foundIn !== null) {
    const folder = foundIn.split('/').slice(0, -1).join('/');
    return folder === '' ? WHERE.repo : `${WHERE.repo}, ${folder}`;
  }
  return from === null ? 'Not found' : WHERE[from];
}

/**
 * A skill's name as its tile says it: a skill named with its folder (`apps/web:ds-build`) by its own name (`ds-build`), since the tile
 * says the folder where it says where the skill comes from.
 * @param name The skill's name, as its line writes it.
 * @param foundIn The folder the repository has it in; null where it has none.
 */
const tileName = (name: string, foundIn: string | null) => (foundIn === null ? name : name.slice(name.lastIndexOf(':') + 1));

/**
 * The skills it gives by where they come from: those in its file, then those each step it is hired into adds that its file does not
 * give, one group for each step name across workflows, each group's caption counting its tiles.
 * @param given The skills its file gives.
 * @param steps What each step it fills adds, by its page.
 * @param places The factory's skills by place, whose entries say what each is for.
 * @param factory The factory the agent is read in.
 */
export function skillGroupsOf(
  given: readonly AgentListing['given'][number][],
  steps: readonly StepGives[],
  places: readonly SkillPlace[],
  factory: string,
) {
  const listed = places.flatMap((place) => place.skills);
  const inFile = new Set(given.map((skill) => skill.name));
  const groups: TileGroup<SkillTile>[] = [
    {
      title: 'In its file',
      tiles: given.map((skill) => ({
        name: tileName(skill.name, skill.foundIn),
        description: skill.entry?.description ?? null,
        where: whereOf(skill.from, skill.foundIn, factory),
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
        const foundIn = from?.foundIn ?? null;
        return {
          name: tileName(skill, foundIn),
          description: row?.entry?.description ?? from?.description ?? null,
          where: whereOf(from?.from ?? row?.from ?? null, foundIn, factory),
        };
      }),
    });
  }
  return groups.filter((group) => group.tiles.length > 0).map((group) => ({ ...group, title: `${group.title} · ${group.tiles.length}` }));
}

/** One MCP server as its tile says it: its name, and where it comes from. */
type ServerTile = { name: string; where: string };

/**
 * The MCP servers it loads, each with where it comes from: those its file names, then those each step adds that its file does not.
 * @param mcp The `mcp:` line of its file; null for none.
 * @param steps What each step it fills adds, by its page.
 */
export function serversOf(mcp: string | null, steps: readonly StepGives[]) {
  const inFile = skillList(mcp ?? '');
  const tiles: ServerTile[] = inFile.map((name) => ({ name, where: 'In its file' }));
  for (const name of new Set(steps.map((step) => step.step))) {
    const added = [...new Set(steps.filter((step) => step.step === name).flatMap((step) => step.mcp))].filter(
      (server) => !tiles.some((tile) => tile.name === server),
    );
    tiles.push(...added.map((server) => ({ name: server, where: `From its ${name} step` })));
  }
  return tiles;
}

/**
 * How many words a body has: its runs of non-space characters.
 * @param body The instructions as written.
 */
export const wordsOf = (body: string) => body.split(/\s+/).filter(Boolean).length;

/**
 * The label selector of the runs of the workflows the agent is in (`workflow in (build,quick)`), named by a node or filled in the factory,
 * so the finished runs read for when its last session ended are of those, never crowded out by the runs of workflows it has no step in;
 * undefined where it is in none.
 * @param agent The nodes that name the agent and the steps it fills.
 */
export const workflowsSelector = (agent: Pick<AgentListing, 'usedBy' | 'fills'>) => {
  const workflows = [...new Set([...agent.usedBy, ...agent.fills].map((node) => node.workflow))].sort();
  return workflows.length === 0 ? undefined : `workflow in (${workflows.join(',')})`;
};

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
