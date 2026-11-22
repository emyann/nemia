/**
 * The four decisions of the producer (`contracts/produce.contract.ts`): what becomes of a story, why a drawn cell fails the build,
 * which caps of the artifact a build passed, and what became of one path against the last build.
 */
import {
  FILES_CAP,
  LEAST_DRAWN,
  MOST_COVERED,
  SCRIPT_CAP,
  STYLESHEET_CAP,
  type Cap,
  type CapsPassed,
  type CellFaultOf,
  type FileChangeOf,
  type StoryFateOf,
} from '../contracts/produce.contract.ts';

/** A story tagged `network` is left out, then one tagged `overlay`; one that names MSW handlers and says neither is refused; else drawn. */
export const storyFate: StoryFateOf = (story) => {
  if (story.tags.includes('network')) return 'network';
  if (story.tags.includes('overlay')) return 'overlay';
  return story.msw ? 'undeclared' : 'card';
};

/** The first fault of a drawn cell, in the contract's order, or null when it drew its state. */
export const cellFault: CellFaultOf = (cell) => {
  if (cell.threw !== null) return 'threw';
  if (cell.height < LEAST_DRAWN) return 'draws-nothing';
  if (cell.covered > MOST_COVERED) return 'covers-card';
  if (cell.asked > 0 && cell.waiting) return 'waits-on-network';
  return cell.apiPicture ? 'api-picture' : null;
};

/** Each cap a build passed: the script's bytes, the stylesheet's bytes, the count of files. */
export const capsPassed: CapsPassed = (measured) => {
  const passed: Cap[] = [];
  if (measured.scriptBytes > SCRIPT_CAP) passed.push('script');
  if (measured.stylesheetBytes > STYLESHEET_CAP) passed.push('stylesheet');
  if (measured.files > FILES_CAP) passed.push('files');
  return passed;
};

/** A path's change from its hash in the last build to its hash in this one, each undefined where that build holds none. */
export const fileChange: FileChangeOf = (before, after) => {
  if (before === undefined) return 'added';
  if (after === undefined) return 'removed';
  return before === after ? 'same' : 'changed';
};
