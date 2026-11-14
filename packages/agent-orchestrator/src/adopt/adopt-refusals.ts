/** Why a takeover is refused, in words that say what to do instead: read by `adopt.ts` and its contract (`contracts/adopt.contract.ts`). */

/**
 * A card filed for the factory: its name, the workflow it names by its folder's name (null where it names none), and whether a run was
 * started from it already.
 */
export type AdoptedCard = { readonly name: string; readonly workflow: string | null; readonly started: boolean };

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
