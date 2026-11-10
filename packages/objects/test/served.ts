/**
 * The objects as the `Api` serves them, for the tests of each kind: what an endpoint answers and what body it takes, found by its group
 * and its name in the `Api` itself, so a test of a kind holds the Schema the api encodes with, never one it names apart.
 */
import { Exit, Schema } from 'effect';
import type { HttpApiEndpoint } from 'effect/http-api';
import { Api } from 'objects';

/** The endpoint `name` of the group `group`, as the `Api` holds it; throws where the `Api` has none, naming the two. */
const endpointOf = (group: string, name: string) => {
  const endpoints: Record<string, { readonly success: ReadonlySet<Schema.Top>; readonly payload: HttpApiEndpoint.PayloadMap }> | undefined =
    Object.values(Api.groups).find((g) => g.identifier === group)?.endpoints;
  const found = endpoints?.[name];
  if (found === undefined) throw new Error(`the Api has no endpoint ${group}.${name}: name one of its groups' endpoints`);
  return found;
};

/** `value` decoded from JSON by the first of `schemas` that takes it and encoded back to JSON, or undefined where none takes it. */
const throughOne = (schemas: readonly Schema.Top[], value: unknown): unknown => {
  for (const schema of schemas) {
    const codec = schema as Schema.Codec<unknown, unknown>;
    const decoded = Schema.decodeUnknownExit(codec)(JSON.parse(JSON.stringify(value)));
    if (Exit.isSuccess(decoded)) return JSON.parse(JSON.stringify(Schema.encodeSync(codec)(decoded.value)));
  }
  return undefined;
};

/**
 * `value` as the endpoint `group`.`name` answers it: decoded by one of its success Schemas and encoded back, which keeps only the keys
 * that Schema declares; undefined where it refuses it.
 */
export const answered = (group: string, name: string, value: unknown): unknown => throughOne([...endpointOf(group, name).success], value);

/** `value` as the endpoint `group`.`name` takes it for its body, decoded and encoded back; undefined where it refuses it. */
export const taken = (group: string, name: string, value: unknown): unknown =>
  throughOne(
    [...endpointOf(group, name).payload.values()].flatMap((p) => p.schemas),
    value,
  );
