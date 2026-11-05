/**
 * A templated factory changed at the version its base holds, judged by digests alone (`contracts/same-version.contract.ts`): what
 * wanting that version again asks (`sameVersionChange`), and whether the person's kept choices answer the merge under way
 * (`choicesApply`). Pure.
 */
import type { ChoicesApply, SameVersionChange } from '../../contracts/same-version.contract.ts';

/**
 * Nothing (`applied`) where the base is already the render wanted; the parameters alone (`params`) where the base is still the template
 * rendered with the parameters it was recorded with; else a template changed under its version (`content`).
 */
export const sameVersionChange: SameVersionChange = ({ base, recorded, wanted }) =>
  wanted === base ? 'applied' : recorded === base ? 'params' : 'content';

/**
 * Whether choices recorded for `recorded` answer the merge `merge`: made for its version and its template (or one never named), and
 * against its base; a file that recorded no base answers a version's upgrade alone.
 */
export const choicesApply: ChoicesApply = (recorded, merge) =>
  recorded.to === merge.to &&
  (recorded.template === undefined || recorded.template === merge.template) &&
  (recorded.base === undefined ? merge.from !== merge.to : recorded.base === merge.base);
