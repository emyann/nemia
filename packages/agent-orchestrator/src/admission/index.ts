/**
 * The face of `admission/`: who answers for a command an agent calls (`CommandClass`, `classBreaks`), a call's admission (`admissionOf`),
 * and Nemia's fence derived from the classes (`nemiaFence`, `widened`).
 */
export { agentClassOf, classBreaks, CLIENT_CLASSES, PROPOSED_INSTEAD, proposedForms, type CommandClass } from './class.ts';
export { admissionOf, typedIn, type PolicyReads, type Typed } from './admission.ts';
export { ASSIGNED, nemiaFence, widened, type Fence } from './fence.ts';
