/**
 * What a run's output says that its sighting carries (`sightedOf`): each fact only when the reader said it, and an empty list of
 * skills or files kept, since it says they were counted. One writer for the fields a detached sighting takes from its output.
 */
import type { Sighting } from '../../core/index.ts';
import type { HarnessOutput } from './detached.ts';

export const sightedOf = (read: HarnessOutput): Partial<Sighting> => ({
  ...(read.limit ? { limit: read.limit } : {}),
  ...(read.denials?.length ? { denials: read.denials } : {}),
  ...(read.skills ? { skills: read.skills } : {}),
  ...(read.files ? { files: read.files } : {}),
  ...(read.ranOn ? { ranOn: read.ranOn } : {}),
  ...(read.harnessVersion ? { harnessVersion: read.harnessVersion } : {}),
});
