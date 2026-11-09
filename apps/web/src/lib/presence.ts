/**
 * Nemia's presence, as her chat's face and cues say it: the facts that hold of her at once, the one expression her face wears for
 * them, and a cue for each that holds. Pure: no drawing, so a test reads the order in Node.
 */

/**
 * What holds of her now: how many runs wait on the person (`runsWaiting`, the run list's own count, never added to), how many asks of
 * her own they have not answered (`asksWaiting`), whether a message of theirs was not sent, whether her session is down, whether she is
 * answering, and how many of her answers are unread. None holding is up, at rest.
 */
export type Presence = {
  runsWaiting: number;
  asksWaiting: number;
  notSent: boolean;
  down: boolean;
  answering: boolean;
  unread: number;
};

/** The expression her face wears: one of six, each the face of one presence. */
export type FaceExpression = 'surprised' | 'unsure' | 'sleepy' | 'thinking' | 'happy' | 'idle';

/** Up, at rest: nothing waits, nothing failed to go, she is neither down, answering, nor holding an unread answer. */
export const UP: Presence = { runsWaiting: 0, asksWaiting: 0, notSent: false, down: false, answering: false, unread: 0 };

/** A hue a cue is drawn in: what waits on a person, a session at work, what failed, or none, at rest. */
type CueHue = 'yours' | 'alive' | 'failure' | 'none';

/** A cue: its hue and its words. */
type Cue = { hue: CueHue; words: string };

/** A presence that may hold: whether it holds, the face it gives, its cue, and the sentence her docked face says it in. */
type Fact = {
  holds: (presence: Presence) => boolean;
  face: FaceExpression;
  cue: (presence: Presence) => Cue;
  says: (presence: Presence) => string;
};

/**
 * The presences in the owner's order, the first that holds wins the face: runs that wait on you, then her own asks unanswered — both
 * what waits on the person, each said apart so no number mixes the two — then a message not sent, then down, then answering, then
 * unread.
 */
const FACE_ORDER: readonly Fact[] = [
  {
    holds: (p) => p.runsWaiting > 0,
    face: 'surprised',
    cue: (p) => ({ hue: 'yours', words: p.runsWaiting === 1 ? '1 waits on you' : `${p.runsWaiting} wait on you` }),
    says: (p) => (p.runsWaiting === 1 ? '1 waits on you.' : `${p.runsWaiting} wait on you.`),
  },
  {
    holds: (p) => p.asksWaiting > 0,
    face: 'surprised',
    cue: (p) => ({ hue: 'yours', words: p.asksWaiting === 1 ? '1 ask of hers' : `${p.asksWaiting} asks of hers` }),
    says: (p) => (p.asksWaiting === 1 ? '1 ask of hers waits on you.' : `${p.asksWaiting} asks of hers wait on you.`),
  },
  {
    holds: (p) => p.notSent,
    face: 'unsure',
    cue: () => ({ hue: 'failure', words: 'Not sent' }),
    says: () => 'A message was not sent.',
  },
  { holds: (p) => p.down, face: 'sleepy', cue: () => ({ hue: 'none', words: 'Down' }), says: () => 'Her session is down.' },
  {
    holds: (p) => p.answering,
    face: 'thinking',
    cue: () => ({ hue: 'alive', words: 'Answering' }),
    says: () => 'She is answering.',
  },
  {
    holds: (p) => p.unread > 0,
    face: 'happy',
    cue: (p) => ({ hue: 'alive', words: `${p.unread} new` }),
    says: (p) => (p.unread === 1 ? '1 new answer.' : `${p.unread} new answers.`),
  },
];

/** The expression her face wears for `presence`: the first in the owner's order that holds, else idle. */
export const faceOf = (presence: Presence): FaceExpression => FACE_ORDER.find((fact) => fact.holds(presence))?.face ?? 'idle';

/** The cue of every presence that holds, in the owner's order; none when she is only up. */
export const cuesOf = (presence: Presence): Cue[] => FACE_ORDER.filter((fact) => fact.holds(presence)).map((fact) => fact.cue(presence));

/**
 * What her docked face is called, by the presence that gives it its expression — the first in the owner's order that holds, her session
 * being up where none does — and by whether the panel it opens is already open: `Open Nemia's chat. 2 wait on you.`
 */
export const dockWords = (presence: Presence, open: boolean): string =>
  `${open ? 'Close' : 'Open'} Nemia's chat. ${FACE_ORDER.find((fact) => fact.holds(presence))?.says(presence) ?? 'Her session is up.'}`;
