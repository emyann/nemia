/**
 * The face of `admission/`: who answers for a command an agent calls (`CommandClass`, `classBreaks`), a call's admission (`admissionOf`),
 * the floor of an agent's standing token (`floorOf`), and Nemia's fence derived from the classes (`nemiaFence`, `widened`).
 */
export { agentClassOf, classBreaks, type CommandClass } from './class.ts';
export { admissionOf, type AdmissionEntry } from './admission.ts';
export { floorOf, type FloorAnswer, type FloorRefusal } from './floor.ts';
export { nemiaFence, widened } from './fence.ts';
