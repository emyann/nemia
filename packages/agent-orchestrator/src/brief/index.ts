/**
 * The face of `brief/`: what a step is told, where it is cut into parts, and the sections `nemia decide` shares with a brief,
 * re-exported by name.
 */
export { composeBrief, PRECEDENCE, remoteBrief, toldLayers } from './brief.ts';
export type { ToldLayers } from './brief.ts';
export { contextSection, fromRunSection, handedParts, handedSection } from './handed.ts';
export type { HandedPart, ParentCloseout, ParentStep } from './handed.ts';
export { briefParts, inParts } from './parts.ts';
export { acceptedLines, gateLines, loopSection, retrySection, roundSection, SIGNOFF } from './brief-sections.ts';
export type { EndingStopped, RetryBriefing, RoundBriefing } from './brief-sections.ts';
