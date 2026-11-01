/**
 * A write or a removal of a workflow folder, judged against the version it was read at (agent-orchestrator, src/folder/folder.ts,
 * `workflowVersionRefusal`): what is at the folder now (`WorkflowThere`), the version the writer read it at, if any, and the refusal's
 * kind, or null where the act goes on. The words are nobody's law; the kind is the api's answer (`REFUSAL_STATUS`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { VersionRefused, WorkflowThere } from '../src/folder/folder.ts';

const workflowVersionRefusalSpec = spec<
  (dir: string, does: 'write' | 'remove', there: WorkflowThere, given: string | undefined) => VersionRefused | null
>({
  ensures: {
    newWriteGoes: {
      description: 'A write with no version where nothing is makes the workflow',
      condition: ({ input: [, does, there, given], output }) =>
        !(does === 'write' && there.kind === 'none' && given === undefined) || output === null,
    },
    goneIsMissing: {
      description: 'A write given a version where nothing is now is Missing: it was removed since it was read',
      condition: ({ input: [, does, there, given], output }) =>
        !(does === 'write' && there.kind === 'none' && given !== undefined) || output?.kind === 'Missing',
    },
    removeOfNoFolderGoesOn: {
      description: 'A removal where no folder is goes on, for the remover to refuse in its own words',
      condition: ({ input: [, does, there], output }) => !(does === 'remove' && there.kind !== 'folder') || output === null,
    },
    fileIsTaken: {
      description: 'A write where a file is is a Conflict: the name is taken by what is no workflow',
      condition: ({ input: [, does, there], output }) => !(does === 'write' && there.kind === 'file') || output?.kind === 'Conflict',
    },
    unversionedWriteIsTaken: {
      description: 'A write with no version over a folder is a Conflict: it would write over a workflow it never read',
      condition: ({ input: [, does, there, given], output }) =>
        !(does === 'write' && there.kind === 'folder' && given === undefined) || output?.kind === 'Conflict',
    },
    unversionedRemoveIsInvalid: {
      description: 'A removal with no version of a folder is Invalid: it is checked against the version it was read at',
      condition: ({ input: [, does, there, given], output }) =>
        !(does === 'remove' && there.kind === 'folder' && given === undefined) || output?.kind === 'Invalid',
    },
    staleIsConflict: {
      description: 'A write or removal given a version the folder is no longer at is a Conflict',
      condition: ({ input: [, , there, given], output }) =>
        !(there.kind === 'folder' && given !== undefined && given !== there.version) || output?.kind === 'Conflict',
    },
    goesExactly: {
      description: 'A write or removal given the version the folder is at goes on',
      condition: ({ input: [, , there, given], output }) => !(there.kind === 'folder' && given === there.version) || output === null,
    },
  },
});
export type WorkflowVersionRefusal = Implementation<typeof workflowVersionRefusalSpec>;
