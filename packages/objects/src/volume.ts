/**
 * The Volume: a folder of the person's machine a factory mounts for every local step of its runs, served as an object in the factory's
 * namespace by its stored name; its switches are written by a PATCH on it (`nemia factory volume set`), and the rest by `nemia factory
 * volume add|rm`. Its `spec` is its path and whether steps only
 * read it; its `status` whether the folder is there, why a run would refuse it, and the runs in play that mount it.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { FactoryWritten } from './written.ts';

/** The folder, by its absolute path, and whether steps only read it (`:ro`) or write it too (`:rw`). */
export const VolumeSpec = Schema.Struct({
  path: Schema.String.annotate({ description: "The folder's absolute path on the machine." }),
  readOnly: Schema.Boolean.annotate({ description: 'Whether steps only read the folder (:ro) rather than write it too (:rw).' }),
  claudeMd: Schema.optionalKey(
    Schema.Boolean.annotate({ description: "Whether the volume's CLAUDE.md files reach the factory's sessions; absent is off." }),
  ),
  skills: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the skills of the volume's .claude/skills are offered to the factory's sessions; absent is on.",
    }),
  ),
}).annotate({
  description: "The folder, by its absolute path, whether steps only read it, and what it gives the factory's sessions.",
});
export type VolumeSpec = typeof VolumeSpec.Type;

/**
 * Whether the folder is there now (`present`), why a run's start would refuse it (`refused`, absent where none would), and the runs not
 * ended whose record mounts it (`runs`).
 */
export const VolumeStatus = Schema.Struct({
  present: Schema.Boolean.annotate({ description: 'Whether the folder is there now.' }),
  refused: Schema.optionalKey(Schema.String.annotate({ description: "Why a run's start would refuse it; absent where none would." })),
  runs: Schema.Array(Schema.String).annotate({ description: 'The ids of the runs not ended whose record mounts it.' }),
}).annotate({ description: 'Whether the folder is there now, why a run would refuse it, and the runs not ended that mount it.' });
export type VolumeStatus = typeof VolumeStatus.Type;

/** A factory's volume, as an object; a write's answer says what it wrote (`written`). */
export const Volume = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Volume').annotate({
    description: "What the object is: a Volume, a folder of the person's machine a factory mounts for every local step.",
  }),
  metadata: ObjectMeta,
  spec: VolumeSpec,
  status: VolumeStatus,
  written: Schema.optionalKey(FactoryWritten),
});
export type Volume = typeof Volume.Type;

/** A page of a factory's volumes. */
export const VolumeList = listOf('Volume', Volume);
export type VolumeList = typeof VolumeList.Type;

/**
 * The switches a write of a volume sets (`PATCH /api/namespaces/:namespace/volumes/:name`), each absent where it is not given and kept
 * then as the volume had it: whether its CLAUDE.md files reach the factory's sessions, and whether its skills are offered to them.
 */
export const VolumeSwitchesWrite = Schema.Struct({
  claudeMd: Schema.optionalKey(
    Schema.Boolean.annotate({ description: "Whether the volume's CLAUDE.md files reach the factory's sessions; absent keeps it." }),
  ),
  skills: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: "Whether the skills of the volume's .claude/skills are offered to the factory's sessions; absent keeps it.",
    }),
  ),
}).annotate({ description: "The volume's switches to set, each absent where it keeps what the volume had." });
export type VolumeSwitchesWrite = typeof VolumeSwitchesWrite.Type;
