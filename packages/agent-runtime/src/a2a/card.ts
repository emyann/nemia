/**
 * A remote agent's card as it enters the runtime, on either road: served at the agent's URL, or configured as `{ card }` in a
 * harness. It is decoded by `CardSchema` before the SDK's parser sees it, since `AgentCard.fromJSON` coerces anything — a
 * number to a string, a string to no interface — and a card read so would be refused later for the wrong reason, or reached
 * at an address it never gave.
 *
 * Only what the runtime reads is held: the interfaces, the security schemes and the requirements, in A2A's JSON, whose keys
 * are camelCase. A key in snake_case, which the SDK's parser also reads, is refused by the camelCase key to write. A scheme
 * of a kind A2A 1.0 does not define is kept, and a requirement that names it is unmet; one of the five kinds with a wrong
 * field is refused. Every other key is kept and not checked (`StructWithRest`).
 *
 * A card served by an agent built on the SDK's own card handler is its objects stringified, whose security schemes are
 * `{ scheme: { $case, value } }`: the SDK's parser reads each of those empty, so they are decoded in that form and kept as
 * they are.
 */
import { Result, Schema } from 'effect';
import { AgentCard, type SecurityScheme } from '@a2a-js/sdk';
import { firstRefusal } from '../core/index.ts';

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** A struct that keeps the keys it does not name. */
const held = <const F extends Schema.Struct.Fields>(fields: F) => Schema.StructWithRest(Schema.Struct(fields), Rest);

/** A key the card must not have: the snake_case spelling of one the runtime reads. */
const absent = Schema.optional(Schema.Never);

/** The kinds of security scheme A2A 1.0 defines, by their key in its JSON and their `$case` in the SDK's objects. */
export const SCHEME_KINDS: readonly string[] = [
  'httpAuthSecurityScheme',
  'apiKeySecurityScheme',
  'oauth2SecurityScheme',
  'openIdConnectSecurityScheme',
  'mtlsSecurityScheme',
];

/** The camelCase key each snake_case key the SDK's parser also reads stands for. */
const CAMEL: Record<string, string> = {
  supported_interfaces: 'supportedInterfaces',
  security_schemes: 'securitySchemes',
  security_requirements: 'securityRequirements',
  protocol_binding: 'protocolBinding',
  protocol_version: 'protocolVersion',
  http_auth_security_scheme: 'httpAuthSecurityScheme',
  api_key_security_scheme: 'apiKeySecurityScheme',
  oauth2_security_scheme: 'oauth2SecurityScheme',
  open_id_connect_security_scheme: 'openIdConnectSecurityScheme',
  mtls_security_scheme: 'mtlsSecurityScheme',
};

const InterfaceSchema = held({
  url: Schema.String,
  protocolBinding: Schema.String,
  protocolVersion: Schema.optional(Schema.String),
  tenant: Schema.optional(Schema.String),
  protocol_binding: absent,
  protocol_version: absent,
});

const HttpAuth = held({ scheme: Schema.String });
const ApiKey = held({ location: Schema.String, name: Schema.String });
const Unread = held({});

/** A scheme in the SDK's objects: one of the five kinds with its fields, or a kind none of them is. */
const SdkSchemeSchema = Schema.Union([
  held({ $case: Schema.Literal('httpAuthSecurityScheme'), value: HttpAuth }),
  held({ $case: Schema.Literal('apiKeySecurityScheme'), value: ApiKey }),
  held({ $case: Schema.Literal('oauth2SecurityScheme'), value: Unread }),
  held({ $case: Schema.Literal('openIdConnectSecurityScheme'), value: Unread }),
  held({ $case: Schema.Literal('mtlsSecurityScheme'), value: Unread }),
  held({ $case: Schema.String.check(Schema.makeFilter((k: string) => !SCHEME_KINDS.includes(k) || `Expected the fields of ${k}`)) }),
]);

/**
 * A security scheme: in A2A's JSON, one key per kind; in the SDK's objects, `scheme`. An object with neither is a kind this
 * runtime does not know, and kept.
 */
const SchemeSchema = held({
  httpAuthSecurityScheme: Schema.optional(HttpAuth),
  apiKeySecurityScheme: Schema.optional(ApiKey),
  oauth2SecurityScheme: Schema.optional(Unread),
  openIdConnectSecurityScheme: Schema.optional(Unread),
  mtlsSecurityScheme: Schema.optional(Unread),
  scheme: Schema.optional(SdkSchemeSchema),
  http_auth_security_scheme: absent,
  api_key_security_scheme: absent,
  oauth2_security_scheme: absent,
  open_id_connect_security_scheme: absent,
  mtls_security_scheme: absent,
});

/** A requirement: the schemes it names, each with its scopes, which `AgentCard.toJSON` leaves out when there are none. */
const RequirementSchema = held({
  schemes: Schema.optional(Schema.Record(Schema.String, held({ list: Schema.optional(Schema.Array(Schema.String)) }))),
});

/** An A2A 1.0 agent card, in what the runtime reads of it. */
export const CardSchema = held({
  supportedInterfaces: Schema.Array(InterfaceSchema).check(Schema.isMinLength(1, { message: 'Expected at least one interface' })),
  securitySchemes: Schema.optional(Schema.Record(Schema.String, SchemeSchema)),
  securityRequirements: Schema.optional(Schema.Array(RequirementSchema)),
  supported_interfaces: absent,
  security_schemes: absent,
  security_requirements: absent,
});

const decodeCard = Schema.decodeUnknownResult(CardSchema);

const HOLDER = 'an A2A 1.0 card holds';

const hasKey = (value: unknown, key: string): boolean => typeof value === 'object' && value !== null && Object.hasOwn(value, key);

/** The first thing wrong with `json` as a card, in words: its dotted path, and what is there; a key in snake_case by the one to write. */
const wrongOf = (json: unknown, error: Schema.SchemaError): string => {
  const { path, words } = firstRefusal(json, error, HOLDER);
  const keys = path.map(String);
  const last = keys.at(-1);
  if (last === undefined) return `it ${words}`;
  const parent = keys.slice(0, -1).reduce<unknown>((at, k) => (hasKey(at, k) ? (at as Record<string, unknown>)[k] : undefined), json);
  const camel = CAMEL[last];
  if (camel && words.endsWith(`${HOLDER} never`)) {
    const at = [...keys.slice(0, -1), camel].join('.');
    return hasKey(parent, camel)
      ? `its \`${at}\` is also written \`${last}\`: write \`${camel}\` alone, as A2A's JSON does`
      : `its \`${at}\` is written \`${last}\`: write \`${camel}\`, as A2A's JSON does`;
  }
  const snake = Object.keys(CAMEL).find((k) => CAMEL[k] === last && hasKey(parent, k));
  const hint = snake && words === 'is missing' ? `, and \`${snake}\` is there: write \`${last}\`, as A2A's JSON does` : '';
  return `its \`${keys.join('.')}\` ${words}${hint}`;
};

/**
 * A card as JSON, read into the SDK's objects once it decodes, or the first thing wrong with it (`wrong`, a clause that
 * begins `its` or `it`). A scheme in the SDK's form is kept as it was given; the rest is the SDK's parse of the decoded card.
 */
export const cardOfJson = (json: unknown): { card: AgentCard } | { wrong: string } => {
  const decoded = decodeCard(json);
  if (Result.isFailure(decoded)) return { wrong: wrongOf(json, decoded.failure) };
  const parsed = AgentCard.fromJSON(decoded.success);
  const sdk = Object.entries(decoded.success.securitySchemes ?? {}).filter(([, s]) => s.scheme !== undefined);
  if (!sdk.length) return { card: parsed };
  return {
    card: { ...parsed, securitySchemes: { ...parsed.securitySchemes, ...(Object.fromEntries(sdk) as Record<string, SecurityScheme>) } },
  };
};

/** Why a remote agent's `url` cannot be taken, or `undefined`. */
const urlRefusal = (harness: string, given: unknown): string | undefined => {
  const url = typeof given === 'string' && URL.canParse(given) ? new URL(given) : undefined;
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return `the \`${harness}\` harness's \`url\` is ${typeof given === 'string' ? `\`${url ? `${url.protocol}…` : given}\`` : `a ${typeof given}`}, and a remote A2A agent is reached over HTTP: give its \`http://\` or \`https://\` address.`;
  }
  if (url.username || url.password) {
    return `the \`${harness}\` harness's \`url\` carries a user name or password, which would be written wherever the address is: take it out of the URL, and give the secret through \`credentials\`, for the scheme the agent's card declares.`;
  }
  return undefined;
};

/** Why a remote agent's `card` cannot be taken, or `undefined`: it is an object, and it decodes. */
const cardRefusal = (harness: string, card: unknown): string | undefined => {
  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    return `the \`${harness}\` harness's \`card\` is not an agent card: give the JSON object the agent serves at \`/.well-known/agent-card.json\`, or its \`url\`.`;
  }
  const read = cardOfJson(card);
  return 'wrong' in read
    ? `the \`${harness}\` harness's \`card\` is not an A2A 1.0 agent card this runtime reads: ${read.wrong}. Give the JSON object the agent serves at \`/.well-known/agent-card.json\`, or its \`url\`.`
    : undefined;
};

/**
 * Why a remote agent's configuration cannot be taken, or `undefined`. Asked by `createEngine`, so an address that could
 * never be reached — or one that carries a secret in it, which the configuration is no place for — or a card that does not
 * decode is refused before any task is filed on it.
 */
export const remoteConfigRefusal = (harness: string, agent: Record<string, unknown>): string | undefined => {
  const keys = Object.keys(agent);
  const extra = keys.filter((k) => k !== 'url' && k !== 'card');
  if (extra.length) {
    return `the \`${harness}\` harness is a remote A2A agent, which takes \`url\` or \`card\` and nothing else, and was given ${extra.map((k) => `\`${k}\``).join(', ')}. Take ${extra.length > 1 ? 'them' : 'it'} off: a secret goes in \`credentials\`, and what a task runs with is the agent's to decide.`;
  }
  if (keys.length !== 1) {
    return `the \`${harness}\` harness is a remote A2A agent, which takes one of \`url\` (its base URL, where its card is served) or \`card\` (the card itself), and was given ${keys.length ? 'both' : 'neither'}.`;
  }
  return 'url' in agent ? urlRefusal(harness, agent.url) : cardRefusal(harness, agent.card);
};
