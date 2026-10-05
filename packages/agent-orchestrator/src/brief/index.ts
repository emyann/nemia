/**
 * The face of `brief/`: what a step is told, where it is cut into parts, and the sections `nemia decide` shares with a brief,
 * re-exported by name.
 */
export { composeBrief, remoteBrief, toldLayers } from './brief.ts';
export type { ParentCloseout, ParentStep, ToldLayers } from './brief.ts';
export { briefParts, inParts } from './parts.ts';
export { acceptedLines, gateLines, loopSection, retrySection, roundSection, SIGNOFF } from './brief-sections.ts';
export type { EndingStopped, RetryBriefing, RoundBriefing } from './brief-sections.ts';
