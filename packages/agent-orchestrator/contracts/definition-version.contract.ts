/**
 * A write or a removal of an agent or a skill, judged against the version it was read at (agent-orchestrator, src/agents/agents.ts,
 * `definitionVersionRefusal`): what is at its name now (`DefinitionThere`), the version the writer read it at, if any, and the refusal's
 * kind, or null where the act goes on. The Workflow door's laws (`workflow-version.contract.ts`), in a definition's words: one that is
 * not held but something else is at its name is `other`. The words are nobody's law; the kind is the api's answer (`REFUSAL_STATUS`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { VersionRefused } from '../src/folder/folder.ts';

/** What is at a definition's name now: nothing, something that is none (a skill's folder with no SKILL.md), or one held at a version. */
export type DefinitionThere = { kind: 'none' } | { kind: 'other' } | { kind: 'held'; version: string };

const definitionVersionRefusalSpec = spec<
  (what: 'agent' | 'skill', name: string, does: 'write' | 'remove', there: DefinitionThere, given: string | undefined) => VersionRefused | null
>({
  ensures: {
    newWriteGoes: {
      description: 'A write with no version where nothing is makes the definition',
      condition: ({ input: [, , does, there, given], output }) =>
        !(does === 'write' && there.kind === 'none' && given === undefined) || output === null,
    },
    goneIsMissing: {
      description: 'A write given a version where none is held now is Missing: it was removed since it was read',
      condition: ({ input: [, , does, there, given], output }) =>
        !(does === 'write' && there.kind !== 'held' && given !== undefined) || output?.kind === 'Missing',
    },
    removeOfNoneGoesOn: {
      description: 'A removal where none is held goes on, for the remover to refuse in its own words',
      condition: ({ input: [, , does, there], output }) => !(does === 'remove' && there.kind !== 'held') || output === null,
    },
    otherIsTaken: {
      description: 'A new write where something else is is a Conflict: the name is taken by what is no definition',
      condition: ({ input: [, , does, there, given], output }) =>
        !(does === 'write' && there.kind === 'other' && given === undefined) || output?.kind === 'Conflict',
    },
    unversionedWriteIsTaken: {
      description: 'A write with no version over a held one is a Conflict: it would write over a definition it never read',
      condition: ({ input: [, , does, there, given], output }) =>
        !(does === 'write' && there.kind === 'held' && given === undefined) || output?.kind === 'Conflict',
    },
    unversionedRemoveIsInvalid: {
      description: 'A removal with no version of a held one is Invalid: it is checked against the version it was read at',
      condition: ({ input: [, , does, there, given], output }) =>
        !(does === 'remove' && there.kind === 'held' && given === undefined) || output?.kind === 'Invalid',
    },
    staleIsConflict: {
      description: 'A write or removal given a version the definition is no longer at is a Conflict',
      condition: ({ input: [, , , there, given], output }) =>
        !(there.kind === 'held' && given !== undefined && given !== there.version) || output?.kind === 'Conflict',
    },
    goesExactly: {
      description: 'A write or removal given the version the definition is at goes on',
      condition: ({ input: [, , , there, given], output }) => !(there.kind === 'held' && given === there.version) || output === null,
    },
  },
});
export type DefinitionVersionRefusal = Implementation<typeof definitionVersionRefusalSpec>;
