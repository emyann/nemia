/**
 * The Volume: a folder of the person's machine a factory mounts for every local step of its runs, served as an object in the factory's
 * namespace by its stored name, read-only over the api (`nemia factory volume` writes it). Its `spec` is its path and whether steps only
 * read it; its `status` whether the folder is there, why a run would refuse it, and the runs in play that mount it.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';

/** The folder, by its absolute path, and whether steps only read it (`:ro`) or write it too (`:rw`). */
export const VolumeSpec = Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean });
export type VolumeSpec = typeof VolumeSpec.Type;

/**
 * Whether the folder is there now (`present`), why a run's start would refuse it (`refused`, absent where none would), and the runs not
 * ended whose record mounts it (`runs`).
 */
export const VolumeStatus = Schema.Struct({
  present: Schema.Boolean,
  refused: Schema.optionalKey(Schema.String),
  runs: Schema.Array(Schema.String),
});
export type VolumeStatus = typeof VolumeStatus.Type;

/** A factory's volume, as an object. */
export const Volume = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Volume'),
  metadata: ObjectMeta,
  spec: VolumeSpec,
  status: VolumeStatus,
});
export type Volume = typeof Volume.Type;

/** A page of a factory's volumes. */
export const VolumeList = listOf('Volume', Volume);
export type VolumeList = typeof VolumeList.Type;
