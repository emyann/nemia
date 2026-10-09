/** The face of a factory template's pure files: its layout and documents, its check, and the draft export maps a repository onto. */
export {
  API_VERSION,
  documentFile,
  documentRefusals,
  isMap,
  isParam,
  layoutRefusals,
  type AgentSpec,
  type FactorySpec,
  type Parameter,
  type Profile,
  type ReadFolder,
  type Refusal,
  type Step,
} from './layout.ts';
export { checkTemplate } from './check.ts';
export { draftOf, type Draft, type DraftFile, type Source, type StepSource } from './draft.ts';
