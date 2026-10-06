/**
 * The face of `admission/`: who answers for a command an agent calls (`CommandClass`, `classBreaks`), a call's admission (`admissionOf`),
 * and Nemia's fence derived from the classes (`nemiaFence`).
 */
export { classBreaks, type CommandClass } from './class.ts';
export { admissionOf, typedIn, type Typed } from './admission.ts';
export { nemiaFence, type Fence } from './fence.ts';
