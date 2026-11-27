/**
 * Where a store stands on the way to its first run that succeeded (`GET /api/readiness/milestones`): four milestones in order — a harness
 * activated and signed in, a factory filed, a volume a run would mount, a run succeeded — each done by what the store holds now, never by a
 * flag saved when a page was seen. The first not done is `next`; any other not done is `later`.
 */
import { Schema } from 'effect';
import { MILESTONE_STATES, MILESTONES } from './words.ts';

/** One milestone: its name, where it stands, and a sentence of it. */
export const MilestoneRead = Schema.Struct({
  name: Schema.Literals(MILESTONES).annotate({
    description: 'Which milestone: a harness signed in, a factory filed, a volume a run would mount, or a run succeeded.',
  }),
  state: Schema.Literals(MILESTONE_STATES).annotate({
    description: 'Where it stands: done by what the store holds now, the next one to do, or one after it.',
  }),
  message: Schema.String.annotate({ description: 'A sentence of what it is, or what is done of it.' }),
});
export type MilestoneRead = typeof MilestoneRead.Type;

/** `GET /api/readiness/milestones`: the four milestones, in order. */
export const Milestones = Schema.Struct({
  milestones: Schema.Array(MilestoneRead).annotate({ description: 'The four milestones, in order: harness, factory, volume, succeeded.' }),
});
export type Milestones = typeof Milestones.Type;
