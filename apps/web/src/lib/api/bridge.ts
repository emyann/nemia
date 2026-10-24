/**
 * A session's web link, as the api answers it for a step whose sessions are bridged (`StepFiled.bridge`) and for Nemia's
 * (`NemiaLevel.bridge`), off the one field every task's view has: a person opens it from a browser or a phone.
 */
import { Schema } from 'effect';
import { decodes } from './decodes.ts';

/** Mirrors the package's `Bridge`: the link where it is up, else null and `why` it is not; `why` is null where the link is set. */
export type Bridge = { url: string | null; why: string | null };

/** Decodes a `Bridge`. */
export const BridgeSchema = decodes<Bridge>()(
  Schema.Struct({
    url: Schema.NullOr(Schema.String),
    why: Schema.NullOr(Schema.String),
  }),
);
