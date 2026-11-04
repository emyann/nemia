/**
 * A hand-made factory taken over in place by a template, judged: why a takeover is refused (`adoptRefusal`), the factory after one it
 * accepts (`adopted`), and what it will change, as the person previews it before anything is written (`adoptPlan`). Pure: what is on
 * disk — the render's wiring, the cards naming the factory, the digests of a base or tree already there — is gathered by `adopt.store.ts`,
 * its runs waiting or in flight by the run list, and the verbs are `adopt.verb.ts`'s. `contracts/adopt.contract.ts` proves that a
 * takeover which would leave a filed card or a schedule with no workflow, or write over a folder that is not the render, is refused,
 * and what the factory keeps and takes.
 */
import type { Adopted, AdoptRefusal } from '../../contracts/adopt.contract.ts';
import { DEFAULT_REVISIONS, factoryVolumes, volumeMark, type Factory, type Hires, type RevisionsPolicy } from '../factory/factory.ts';

/** The wiring a template's render holds in its `factory.json`: its workflows, its hires, and its revisions policy where it says one. */
export type Wiring = { readonly workflows: readonly string[]; readonly hires: Hires; readonly revisions?: RevisionsPolicy };

/**
 * A card filed for the factory: its name, the workflow it names by its folder's name (null where it names none), and whether a run was
 * started from it already.
 */
export type AdoptedCard = { readonly name: string; readonly workflow: string | null; readonly started: boolean };

/**
 * What a takeover is judged against, read off the disk: the render's wiring, the cards filed for the factory, the digest of the base and
 * of the tree already there (null where there is none), and the digest of the render.
 */
export type Adoption = {
  readonly wiring: Wiring;
  readonly cards: readonly AdoptedCard[];
  readonly leftovers: { readonly base: string | null; readonly tree: string | null };
  readonly render: string;
};

/**
 * What a takeover is refused as: a factory made from a template already (`Templated`), a filed card or a schedule its workflow would be
 * gone from (`Stranded`), and a base or tree already there that is not the render (`Leftover`).
 */
export type AdoptRefused = { readonly kind: 'Templated' | 'Stranded' | 'Leftover'; readonly message: string };

/** Why the factory `name`, made from a template already, is not taken over: it is upgraded. */
export const templatedAdoptRefusal = (name: string): string =>
  `${name} is made from a template already, so it is upgraded, not taken over: nemia factory diff ${name} --to <x.y.z>, then nemia factory upgrade ${name} --to <x.y.z>.`;

/** Why the factory `name` is not taken over: each card filed and not started, whose workflow the template does not offer. */
export const strandedCardRefusal = (name: string, cards: readonly AdoptedCard[]): string =>
  `${cards.map((c) => `the card ${c.name} names the workflow ${c.workflow ?? ''}`).join('; ')}, which the template does not offer, so ${cards.length === 1 ? 'it' : 'they'} could not start once ${name} is taken over: start ${cards.length === 1 ? 'it' : 'each'} first (nemia start <card>), or change ${cards.length === 1 ? 'its' : 'each'} workflow: line to one the template offers, then preview again.`;

/** Why the factory `name` is not taken over: each schedule of a workflow the template does not offer. */
export const strandedScheduleRefusal = (name: string, workflows: readonly string[]): string =>
  `${name} schedules ${workflows.join(', ')}, which the template does not offer: unschedule ${workflows.length === 1 ? 'it' : 'each'} first — ${workflows.map((w) => `nemia factory unschedule ${name} ${w}`).join('; ')} — then preview again.`;

/** Why the factory `name` is not taken over: its folders `folders` (`applied`, `tree`) are there already, and are not the render. */
export const leftoverRefusal = (name: string, folders: readonly string[]): string =>
  `${name} has ${folders.map((f) => `factories/${name}/${f}`).join(' and ')} in the store already, and ${folders.length === 1 ? 'it is' : 'they are'} not the template's render: keep what you need of ${folders.length === 1 ? 'it' : 'them'}, remove ${folders.length === 1 ? 'it' : 'them'}, then preview again.`;

/** The cards filed and not started whose workflow `offered` leaves out. */
const strandedCards = (cards: readonly AdoptedCard[], offered: readonly string[]): AdoptedCard[] =>
  cards.filter((c) => !c.started && c.workflow !== null && !offered.includes(c.workflow));

/** The workflows `schedules` schedule that `offered` leaves out. */
const strandedSchedules = (schedules: Factory['schedules'], offered: readonly string[]): string[] =>
  Object.keys(schedules).filter((w) => !offered.includes(w));

/**
 * Why `factory` is not taken over as `adoption` says, or null: made from a template already (`Templated`); then a card or a schedule it
 * would strand (`Stranded`, every one named); then a base or tree already there that is not the render (`Leftover`). A base and tree that
 * are the render, as a takeover stopped half way leaves them, are taken.
 */
export const adoptRefusal: AdoptRefusal = (factory, adoption) => {
  if (factory.template !== undefined) return { kind: 'Templated', message: templatedAdoptRefusal(factory.name) };
  const offered = adoption.wiring.workflows;
  const cards = strandedCards(adoption.cards, offered);
  const schedules = strandedSchedules(factory.schedules, offered);
  if (cards.length > 0 && schedules.length > 0)
    return {
      kind: 'Stranded',
      message: `${strandedCardRefusal(factory.name, cards)} And ${strandedScheduleRefusal(factory.name, schedules)}`,
    };
  if (cards.length > 0) return { kind: 'Stranded', message: strandedCardRefusal(factory.name, cards) };
  if (schedules.length > 0) return { kind: 'Stranded', message: strandedScheduleRefusal(factory.name, schedules) };
  const { base, tree } = adoption.leftovers;
  const foreignBase = base !== null && base !== adoption.render;
  const foreignTree = tree !== null && tree !== adoption.render;
  if (foreignBase && foreignTree) return { kind: 'Leftover', message: leftoverRefusal(factory.name, ['applied', 'tree']) };
  if (foreignBase) return { kind: 'Leftover', message: leftoverRefusal(factory.name, ['applied']) };
  if (foreignTree) return { kind: 'Leftover', message: leftoverRefusal(factory.name, ['tree']) };
  return null;
};

/**
 * `factory` taken over by `template`, running from `tree`: its name, repositories, schedules, instruction and volumes kept; its workflows,
 * hires and revisions policy the template's `wiring`.
 */
export const adopted: Adopted = (factory, wiring, template, tree) => ({
  name: factory.name,
  repos: factory.repos,
  workflows: wiring.workflows,
  hires: wiring.hires,
  schedules: factory.schedules,
  instruction: factory.instruction,
  revisions: wiring.revisions,
  template,
  tree,
  ...(factory.volumes === undefined ? {} : { volumes: factory.volumes }),
});

/** A hire a takeover changes: a step hired into by the template only (`added`), by the factory only (`dropped`), or by both, apart. */
export type HireChange = {
  readonly step: string;
  readonly kind: 'added' | 'dropped' | 'changed';
  readonly was?: string;
  readonly now?: string;
};

/**
 * What a takeover of a factory will change, as the person previews it: what stays, the workflows added and dropped, each hire changed,
 * the revisions policy before and after, the store's rules that will no longer be read (their file, where they hold words), the runs that
 * wait on a person or are in flight and the policy they follow after, and each card and schedule it would strand.
 */
export type AdoptPlan = {
  readonly factory: string;
  readonly kept: {
    readonly repos: readonly string[];
    readonly schedules: readonly string[];
    readonly instruction: boolean;
    readonly volumes: readonly string[];
  };
  readonly workflows: { readonly added: readonly string[]; readonly dropped: readonly string[]; readonly kept: readonly string[] };
  readonly hires: readonly HireChange[];
  readonly revisions: { readonly was: RevisionsPolicy; readonly now: RevisionsPolicy };
  readonly rules: string | null;
  readonly runs: { readonly ids: readonly string[]; readonly policy: RevisionsPolicy };
  readonly stranded: { readonly cards: readonly AdoptedCard[]; readonly schedules: readonly string[] };
};

/** `names` sorted, each once. */
const sorted = (names: Iterable<string>): string[] => [...new Set(names)].sort();

/** The hires `was` becomes as `now`, by step in order: each added, dropped, or given another agent. */
function hireChanges(was: Hires, now: Hires): HireChange[] {
  return sorted([...Object.keys(was), ...Object.keys(now)]).flatMap((step): HireChange[] => {
    const before = was[step];
    const after = now[step];
    if (before === undefined && after !== undefined) return [{ step, kind: 'added', now: after }];
    if (before !== undefined && after === undefined) return [{ step, kind: 'dropped', was: before }];
    if (before !== undefined && after !== undefined && before !== after) return [{ step, kind: 'changed', was: before, now: after }];
    return [];
  });
}

/**
 * What taking `factory` over as `adoption` says will change (`AdoptPlan`): `runs`, its runs that wait on a person or are in flight, and
 * `rules`, the store's rules file of it where it holds words, which the tree's take the place of.
 */
export function adoptPlan(factory: Factory, adoption: Adoption, runs: readonly string[], rules: string | null): AdoptPlan {
  const was = new Set(factory.workflows);
  const now = new Set(adoption.wiring.workflows);
  const policy = adoption.wiring.revisions ?? DEFAULT_REVISIONS;
  return {
    factory: factory.name,
    kept: {
      repos: factory.repos,
      schedules: sorted(Object.keys(factory.schedules)),
      instruction: factory.instruction !== undefined,
      volumes: factoryVolumes(factory).map((v) => `${v.path}${volumeMark(v)}`),
    },
    workflows: {
      added: sorted([...now].filter((w) => !was.has(w))),
      dropped: sorted([...was].filter((w) => !now.has(w))),
      kept: sorted([...now].filter((w) => was.has(w))),
    },
    hires: hireChanges(factory.hires, adoption.wiring.hires),
    revisions: { was: factory.revisions ?? DEFAULT_REVISIONS, now: policy },
    rules,
    runs: { ids: [...runs].sort(), policy },
    stranded: {
      cards: strandedCards(adoption.cards, adoption.wiring.workflows),
      schedules: strandedSchedules(factory.schedules, adoption.wiring.workflows),
    },
  };
}

/** `names` as a list a person reads, or `none`. */
const listed = (names: readonly string[]): string => (names.length ? names.join(', ') : 'none');

/** A hire's change as a line: the step, and the agent it had and has. */
const hireLine = (h: HireChange): string =>
  h.kind === 'added'
    ? `  + ${h.step}: ${h.now ?? ''}`
    : h.kind === 'dropped'
      ? `  - ${h.step}: ${h.was ?? ''}`
      : `  ~ ${h.step}: ${h.was ?? ''} → ${h.now ?? ''}`;

/**
 * `plan` as `nemia factory diff` prints it for a hand-made factory: what stays, what the template rewires, the rules no longer read and
 * the line that writes them into the tree, the runs waiting or in flight and the policy they follow after, what it would strand, and
 * the line to type, `adopt`, which carries the plan's `digest`. Nothing is written.
 */
export function adoptLines(plan: AdoptPlan, digest: string, adopt: string): string[] {
  const { factory, kept, workflows, hires, revisions, rules, runs, stranded } = plan;
  const blocked = stranded.cards.length > 0 || stranded.schedules.length > 0;
  return [
    `${factory}: taken over by the template, in place — nothing is written until nemia factory adopt`,
    `stays: its name, its repositories (${listed(kept.repos)}), its schedules (${listed(kept.schedules)}), ${kept.instruction ? 'its instruction' : 'no instruction'}, its volumes (${listed(kept.volumes)}), its cards, its runs and its stats`,
    `workflows: + ${listed(workflows.added)}; - ${listed(workflows.dropped)}; kept ${listed(workflows.kept)}`,
    hires.length ? 'hires:' : 'hires: unchanged',
    ...hires.map(hireLine),
    revisions.was === revisions.now ? `revisions: ${revisions.now}, unchanged` : `revisions: ${revisions.was} → ${revisions.now}`,
    ...(rules === null
      ? []
      : [
          `rules: ${rules} will no longer be read; the tree's are. To keep them, write them into the tree once it is taken over: nemia factory rules ${factory} --file ${rules}`,
        ]),
    runs.ids.length
      ? `runs waiting or in flight: ${runs.ids.join(', ')} — each keeps the workflow frozen on its record; ${runs.policy === 'follow' ? "under follow, each takes the tree's hires and rules at its next step" : 'under pinned, each keeps what it resolved'}`
      : 'runs waiting or in flight: none',
    ...stranded.cards.map((c) => `stranded: the card ${c.name}, filed for ${c.workflow ?? ''}, which the template does not offer`),
    ...stranded.schedules.map(
      (w) => `stranded: the schedule of ${w}, which the template does not offer — nemia factory unschedule ${factory} ${w}`,
    ),
    `plan: ${digest}`,
    blocked ? 'nemia factory adopt refuses this takeover until nothing is stranded.' : `to take it over: ${adopt}`,
  ];
}
