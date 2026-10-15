/**
 * Nemia's presence, as her chat's face and cues say it: the facts that hold of her at once, the one expression her face wears for
 * them, and a cue for each that holds. Pure: no drawing, so a test reads the order in Node.
 */

/**
 * What holds of her now: how many things wait on the person, whether a message of theirs was not sent, whether her session is down,
 * whether she is answering, and how many of her answers are unread. None holding is up, at rest.
 */
export type Presence = {
  waitsOnYou: number;
  notSent: boolean;
  down: boolean;
  answering: boolean;
  unread: number;
};

/** The expression her face wears: one of six, each the face of one presence. */
export type FaceExpression = 'surprised' | 'unsure' | 'sleepy' | 'thinking' | 'happy' | 'idle';

/** Up, at rest: nothing waits, nothing failed to go, she is neither down, answering, nor holding an unread answer. */
export const UP: Presence = { waitsOnYou: 0, notSent: false, down: false, answering: false, unread: 0 };

/** A hue a cue is drawn in: what waits on a person, a session at work, what failed, or none, at rest. */
export type CueHue = 'yours' | 'alive' | 'failure' | 'none';

/** A cue: its hue and its words. */
export type Cue = { hue: CueHue; words: string };

/** A presence that may hold: whether it holds, the face it gives, and its cue. */
type Fact = { holds: (presence: Presence) => boolean; face: FaceExpression; cue: (presence: Presence) => Cue };

/**
 * The presences in the owner's order, the first that holds wins the face: waits on you, then a message not sent, then down, then
 * answering, then unread.
 */
export const FACE_ORDER: readonly Fact[] = [
  {
    holds: (p) => p.waitsOnYou > 0,
    face: 'surprised',
    cue: (p) => ({ hue: 'yours', words: p.waitsOnYou === 1 ? '1 waits on you' : `${p.waitsOnYou} wait on you` }),
  },
  { holds: (p) => p.notSent, face: 'unsure', cue: () => ({ hue: 'failure', words: 'Not sent' }) },
  { holds: (p) => p.down, face: 'sleepy', cue: () => ({ hue: 'none', words: 'Down' }) },
  { holds: (p) => p.answering, face: 'thinking', cue: () => ({ hue: 'alive', words: 'Answering' }) },
  { holds: (p) => p.unread > 0, face: 'happy', cue: (p) => ({ hue: 'alive', words: `${p.unread} new` }) },
];

/** The expression her face wears for `presence`: the first in the owner's order that holds, else idle. */
export const faceOf = (presence: Presence): FaceExpression => FACE_ORDER.find((fact) => fact.holds(presence))?.face ?? 'idle';

/** The cue of every presence that holds, in the owner's order; none when she is only up. */
export const cuesOf = (presence: Presence): Cue[] => FACE_ORDER.filter((fact) => fact.holds(presence)).map((fact) => fact.cue(presence));
