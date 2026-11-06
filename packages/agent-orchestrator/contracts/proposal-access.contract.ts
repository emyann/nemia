/**
 * Whether a proposal widens the access of what it changes (agent-orchestrator, src/propose/access.ts, `accessChange`), one object at a
 * time: its access before the change and after it, each reduced to the rules that let a call through (`allows`: an allow rule, a tool, a
 * server attached, an agent hired into a step), the rules that refuse one (`denies`) and its permission mode as a rank (`mode`, higher
 * reaching further; a mode the reader does not know ranks highest). A fact the machinery computes, never an agent's claim: what a rule at
 * auto reads (`widens`), and what the board and her chat say under a proposal. Rules are compared as written: a rule rewritten in other
 * words is one dropped and one added, so a change of an allow's words reads as widening. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What an object lets through and refuses, as rules written, and how far its permission mode reaches. */
export type Access = { readonly allows: readonly string[]; readonly denies: readonly string[]; readonly mode: number };

/** What a change does to access: reaches further, reaches less, or leaves it as it was. */
export type AccessChange = 'widens' | 'narrows' | 'same';

/** Whether `after` holds a rule `before` does not. */
const gained = (before: readonly string[], after: readonly string[]): boolean => after.some((rule) => !before.includes(rule));

/** Whether the change reaches further: an allow gained, a deny lost, or a mode that reaches further. */
const widening = (before: Access, after: Access): boolean =>
  gained(before.allows, after.allows) || gained(after.denies, before.denies) || after.mode > before.mode;

/** Whether the change reaches less somewhere: an allow lost, a deny gained, or a mode that reaches less. */
const narrowing = (before: Access, after: Access): boolean =>
  gained(after.allows, before.allows) || gained(before.denies, after.denies) || after.mode < before.mode;

const accessChangeSpec = spec<(before: Access, after: Access) => AccessChange>({
  ensures: {
    allowGainedWidens: {
      description: 'An object that lets through a rule it did not before widens access',
      condition: ({ input: [before, after], output }) => !gained(before.allows, after.allows) || output === 'widens',
    },
    denyLostWidens: {
      description: 'An object that no longer refuses a rule it refused before widens access',
      condition: ({ input: [before, after], output }) => !gained(after.denies, before.denies) || output === 'widens',
    },
    modeUpWidens: {
      description: 'A permission mode that reaches further widens access',
      condition: ({ input: [before, after], output }) => !(after.mode > before.mode) || output === 'widens',
    },
    widensOnlyByAGain: {
      description: 'A change widens access only where an allow is gained, a deny lost or the mode reaches further',
      condition: ({ input: [before, after], output }) => output !== 'widens' || widening(before, after),
    },
    narrowsExactly: {
      description: 'A change narrows access exactly where it reaches less somewhere and further nowhere',
      condition: ({ input: [before, after], output }) => (output === 'narrows') === (!widening(before, after) && narrowing(before, after)),
    },
  },
});

/** `accessChange`'s type, which `src/propose/access.ts` takes. */
export type AccessChangeOf = Implementation<typeof accessChangeSpec>;
