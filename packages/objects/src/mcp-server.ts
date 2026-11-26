/**
 * The McpServer: a remote MCP server a factory records, served as an object in the factory's namespace. Its `spec` is the record — its
 * transport, its url, its headers, each value served as `HEADER_MASK` and never as it is kept, and its OAuth client — and its `status`
 * the state its harness reports now, absent on a builtin server Nemia offers (`/api/builtin/mcpservers`), which no namespace holds.
 *
 * Beside it, the body a write is sent (`McpServerWrite`) and the answers of a sign-in (`SignInStarted`, `SignInState`, `SignedOut`).
 * Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, describedNumber, listOf } from './meta.ts';
import { FactoryWritten } from './written.ts';
import { MCP_STATES, MCP_TRANSPORTS, SIGN_IN_ENDINGS, SIGN_IN_ROUTES, SIGN_IN_STATES } from './words.ts';

/** The OAuth client a server signs in with: its id, and the port its callback listens on, where it names one. */
export const McpServerOAuth = Schema.Struct({
  clientId: Schema.String.annotate({ description: 'The OAuth client id the server signs in with.' }),
  callbackPort: Schema.optionalKey(describedNumber('The port its callback listens on; absent where it names none.')),
});
export type McpServerOAuth = typeof McpServerOAuth.Type;

/** A server as a factory records it: its transport, its url, its headers by name (each value `HEADER_MASK` as served), its OAuth client. */
export const McpServerSpec = Schema.Struct({
  type: Schema.Literals(MCP_TRANSPORTS).annotate({ description: "The server's transport." }),
  url: Schema.String.annotate({ description: "The server's url." }),
  headers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: 'Its headers by name, each value HEADER_MASK as served and never as kept; absent where it has none.',
    }),
  ),
  oauth: Schema.optionalKey(McpServerOAuth.annotate({ description: 'The OAuth client it signs in with; absent where it uses none.' })),
}).annotate({ description: 'The server as the factory records it: its transport, url, headers (each value masked) and OAuth client.' });
export type McpServerSpec = typeof McpServerSpec.Type;

/** The state the server's harness reports now, its tools counted, and why it failed; `state` absent where it could not be read. */
export const McpServerStatus = Schema.Struct({
  state: Schema.optionalKey(
    Schema.Literals(MCP_STATES).annotate({ description: "The state the server's harness reports now; absent where it could not be read." }),
  ),
  tools: Schema.optionalKey(describedNumber('How many tools the server offers.')),
  error: Schema.optionalKey(Schema.String.annotate({ description: 'Why it failed; absent where it did not.' })),
  origin: Schema.optionalKey(
    Schema.Literals(['user', 'builtin']).annotate({
      description: "Where a library server is kept: the user library, or Nemia's builtins; absent on a factory's own server.",
    }),
  ),
  factories: Schema.optionalKey(
    Schema.Array(Schema.String).annotate({
      description: "The factories that add a library server, which a removal of it is refused for; absent on a factory's own server.",
    }),
  ),
});
export type McpServerStatus = typeof McpServerStatus.Type;

/** An MCP server, as an object: a builtin one carries its spec alone; a write's answer says what it wrote (`written`). */
export const McpServer = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('McpServer').annotate({
    description: 'What the object is: an McpServer, a remote MCP server a factory records for its agents.',
  }),
  metadata: ObjectMeta,
  spec: McpServerSpec,
  status: Schema.optionalKey(
    McpServerStatus.annotate({
      description: "The state the server's harness reports now, its tools counted, and why it failed; absent on a builtin server.",
    }),
  ),
  written: Schema.optionalKey(FactoryWritten),
});
export type McpServer = typeof McpServer.Type;

/** A page of a factory's servers, or of Nemia's builtin ones. */
export const McpServerList = listOf('McpServer', McpServer);
export type McpServerList = typeof McpServerList.Type;

/**
 * A server recorded (`PUT …/mcpservers/<name>`): its url, its transport (`http` where none is given), its headers by name and its OAuth
 * client. A header sent as `HEADER_MASK` keeps the value the server holds, and is refused for a header it does not hold.
 */
export const McpServerWrite = Schema.Struct({
  type: Schema.optionalKey(Schema.Literals(MCP_TRANSPORTS).annotate({ description: 'The transport; http where none is given.' })),
  url: Schema.String.annotate({ description: "The server's url." }),
  headers: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String).annotate({
      description: 'Its headers by name; a value sent as HEADER_MASK keeps the value the server holds.',
    }),
  ),
  oauth: Schema.optionalKey(McpServerOAuth.annotate({ description: 'The OAuth client it signs in with.' })),
});
export type McpServerWrite = typeof McpServerWrite.Type;

const [DEVICE_ROUTE, BROWSER_ROUTE] = SIGN_IN_ROUTES;

/**
 * A sign-in started, by the road its provider offers: a code to type at the provider's page (`device`), or an address to open
 * (`browser`), with when the sign-in stops waiting.
 */
export const SignInStarted = Schema.Union([
  Schema.Struct({
    route: Schema.Literal(DEVICE_ROUTE).annotate({ description: 'The road: a code the person types at the provider.' }),
    userCode: Schema.String.annotate({ description: 'The code the person types at the provider.' }),
    verificationUri: Schema.String.annotate({ description: 'The provider’s page the person types the code at.' }),
    until: Schema.String.annotate({ description: 'When the code stops being good, as an ISO 8601 time.' }),
  }),
  Schema.Struct({
    route: Schema.Literal(BROWSER_ROUTE).annotate({ description: 'The road: an address the person opens in their browser.' }),
    authUrl: Schema.String.annotate({ description: 'The address the person opens to sign in.' }),
    until: Schema.String.annotate({ description: 'When the sign-in stops waiting, as an ISO 8601 time.' }),
  }),
]);
export type SignInStarted = typeof SignInStarted.Type;

/**
 * Where a server's sign-in stands: its word, when a waiting one stops waiting, why a failed one failed, and, while one waits, what it
 * answered when it started.
 */
export const SignInState = Schema.Struct({
  state: Schema.Literals(SIGN_IN_STATES).annotate({ description: "Where the server's sign-in stands." }),
  until: Schema.optionalKey(Schema.String.annotate({ description: 'When a waiting sign-in stops waiting, as an ISO 8601 time.' })),
  why: Schema.optionalKey(Schema.String.annotate({ description: 'Why a failed sign-in failed.' })),
  started: Schema.optionalKey(
    SignInStarted.annotate({ description: 'What a waiting sign-in answered when it started: the code or the address to draw again.' }),
  ),
});
export type SignInState = typeof SignInState.Type;

/**
 * The address a person's browser was sent back to once they approved a server's sign-in, pasted to complete it where the daemon's own
 * machine could not receive it. It carries a one-time code: never logged, journalled or written to the feed.
 */
export const SignInCallback = Schema.Struct({
  url: Schema.String.annotate({
    description: "The address the person's browser was sent back to once they approved the sign-in; it carries a one-time code.",
  }),
});
export type SignInCallback = typeof SignInCallback.Type;

/** A server's sign-in ended: how. */
export const SignedOut = Schema.Struct({
  ended: Schema.Literals(SIGN_IN_ENDINGS).annotate({
    description: 'How the sign-in ended: a waiting one cancelled, or the one the server held removed.',
  }),
});
export type SignedOut = typeof SignedOut.Type;
