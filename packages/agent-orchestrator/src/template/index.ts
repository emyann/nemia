/** The face of a factory template's pure files: its layout and documents, its check, and the draft export maps a repository onto. */
export { documentFile, isMap, isParam, type FactorySpec, type Parameter, type ReadFolder, writeExpressions } from './layout.ts';
export { checkTemplate } from './check.ts';
export { listItemsOf, withSharedLines } from './shared-lines.ts';
export { draftOf, type Draft, type Source } from './draft.ts';
