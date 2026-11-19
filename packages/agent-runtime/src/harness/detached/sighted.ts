/**
 * What a run's output says that its sighting carries (`sightedOf`): each fact only when the reader said it, and an empty list of
 * denials, skills or files kept, since it says they were counted. One writer for the fields a detached sighting takes from its output.
 */
import type { HarnessOutput } from './detached.ts';

/**
 * The facts of a run's output its sighting carries, each only where the reader said it.
 * @param read What the spec's reader read of the run's output.
 */
export const sightedOf = (read: HarnessOutput) => ({
  ...(read.limit ? { limit: read.limit } : {}),
  ...(read.denials ? { denials: read.denials } : {}),
  ...(read.skills ? { skills: read.skills } : {}),
  ...(read.files ? { files: read.files } : {}),
  ...(read.ranOn ? { ranOn: read.ranOn } : {}),
  ...(read.ranIn ? { ranIn: read.ranIn } : {}),
  ...(read.harnessVersion ? { harnessVersion: read.harnessVersion } : {}),
});
