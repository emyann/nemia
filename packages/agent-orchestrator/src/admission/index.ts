/**
 * The face of `admission/`: who answers for a command an agent calls (`CommandClass`, `classBreaks`), a call's admission (`admissionOf`),
 * the floor of an agent's standing token (`floorOf`), and Nemia's fence derived from the classes (`nemiaFence`, `widened`).
 */
export { agentClassOf, classBreaks, CLIENT_CLASSES, PROPOSED_INSTEAD, proposedForms, type CommandClass } from './class.ts';
export { admissionOf, askedOf, policyAllows, typedIn, type AdmissionEntry, type PolicyReads, type Typed } from './admission.ts';
export { floorOf, type FloorAnswer, type FloorCall, type FloorHolder, type FloorNarrowing, type FloorRefusal } from './floor.ts';
export { ASSIGNED, nemiaFence, widened, type Fence } from './fence.ts';
