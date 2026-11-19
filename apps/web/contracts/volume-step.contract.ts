/**
 * What the welcome's volume step, "Where is the work?", shows (`volumeStepOf`, src/lib/volumeStep.ts), at `/welcome/volume` and opened
 * again from a factory's Settings at `/factories/<factory>/volume`: three ways to give a factory its work and a skip, the way chosen, the
 * offer to make a folder a repository, the trust asked of the volume added, and the work in place. Level-triggered: whether a volume is
 * trusted, and whether the factory already has a trusted writable one, are the factory as the api reads it now, never a flag of this
 * browser; what the page keeps is the person's presses and the write it made, whose answer is the store's word too.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A way to give the factory its work, in the step's order: a folder of this machine, a repository by its address, a new one. */
export type VolumeWay = 'folder' | 'address' | 'new';

/**
 * The folder the person chose is no repository, as the listing answered it: the page offers to make it one (`offered`), or the person said
 * no to that (`declined`).
 */
export type NotRepository = 'offered' | 'declined';

/**
 * What the step shows: `choose` the three tiles and the skip; `folder`, `address` or `new` the chosen way's panel; `init` the offer to
 * make the chosen folder a repository; `declined` the step held on that folder, saying runs need a repository; `trust` the trust asked of
 * the volume added; `waiting` the volume left untrusted at "Not now", the factory waiting; `done` the work in place, and the next
 * milestone.
 */
export type VolumeScreen = 'choose' | VolumeWay | 'init' | 'declined' | 'trust' | 'waiting' | 'done';

/**
 * What the step is drawn from: `again`, opened from a factory's Settings to add another; `held`, the factory as the api reads it has a
 * writable volume every harness trusts; `way`, the tile chosen (none before a press); `notRepository`, where the folder pressed is none;
 * `added`, the volume this page added that the api answered (none before one), with whether the factory's read trusts its place now;
 * `later`, the person pressed "Not now" on the trust.
 */
export type VolumeStepFacts = {
  readonly again: boolean;
  readonly held: boolean;
  readonly way: VolumeWay | undefined;
  readonly notRepository: NotRepository | undefined;
  readonly added: { readonly trusted: boolean } | undefined;
  readonly later: boolean;
};

const volumeStepOfSpec = spec<(facts: VolumeStepFacts) => VolumeScreen>({
  ensures: {
    trustAskedBeforeUse: {
      description: 'A volume added here that a harness does not trust is asked its trust before anything else, until the person says not now',
      condition: ({ input: [f], output }) => !(f.added !== undefined && !f.added.trusted && !f.later) || output === 'trust',
    },
    notNowLeavesItWaiting: {
      description: '"Not now" leaves the factory waiting on the trust, and the step says so',
      condition: ({ input: [f], output }) => !(f.added !== undefined && !f.added.trusted && f.later) || output === 'waiting',
    },
    doneOnlyWhenTrusted: {
      description:
        'The step says the work is in place only where the volume added here is trusted, or, at the welcome, the factory already has a trusted writable one',
      condition: ({ input: [f], output }) =>
        output !== 'done' || (f.added !== undefined ? f.added.trusted : f.held && !f.again),
    },
    doneOnceTrusted: {
      description: 'A volume added here and trusted is the work in place',
      condition: ({ input: [f], output }) => !(f.added !== undefined && f.added.trusted) || output === 'done',
    },
    heldAtTheWelcomeIsDone: {
      description: 'At the welcome, a factory whose trusted writable volume was given at a terminal shows the step done',
      condition: ({ input: [f], output }) => !(f.added === undefined && f.held && !f.again) || output === 'done',
    },
    noRepositoryOffersOne: {
      description: 'A folder that is no repository is offered to be made one, and on a no the step stays, saying why, adding nothing',
      condition: ({ input: [f], output }) =>
        !(f.added === undefined && !(f.held && !f.again) && f.way === 'folder' && f.notRepository !== undefined) ||
        output === (f.notRepository === 'offered' ? 'init' : 'declined'),
    },
    theChosenWayBeforeAVolume: {
      description: 'Before a volume is added here, the step shows the way chosen, or the three tiles and the skip for none',
      condition: ({ input: [f], output }) =>
        f.added !== undefined ||
        (f.held && !f.again) ||
        (f.way === 'folder' && f.notRepository !== undefined) ||
        output === (f.way ?? 'choose'),
    },
  },
});

/** `volumeStepOf`'s type, which src/lib/volumeStep.ts takes. */
export type VolumeStepOf = Implementation<typeof volumeStepOfSpec>;
