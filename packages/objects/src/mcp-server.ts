/**
 * The McpServer: a remote MCP server a factory records, served as an object in the factory's namespace. Its `spec` is the record — its
 * transport, its url, its headers, each value served as `HEADER_MASK` and never as it is kept, and its OAuth client — and its `status`
 * the state its harness reports now, absent on a builtin server Nemia offers (`/api/builtin/mcpservers`), which no namespace holds.
 *
 * Beside it, the body a write is sent (`McpServerWrite`) and the answers of a sign-in (`SignInStarted`, `SignInState`, `SignedOut`).
 * Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { MCP_STATES, MCP_TRANSPORTS, SIGN_IN_STATES } from './words.ts';

/** The OAuth client a server signs in with: its id, and the port its callback listens on, where it names one. */
export const McpServerOAuth = Schema.Struct({
  clientId: Schema.String,
  callbackPort: Schema.optionalKey(Schema.Number),
});
export type McpServerOAuth = typeof McpServerOAuth.Type;

/** A server as a factory records it: its transport, its url, its headers by name (each value `HEADER_MASK` as served), its OAuth client. */
export const McpServerSpec = Schema.Struct({
  type: Schema.Literals(MCP_TRANSPORTS),
  url: Schema.String,
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  oauth: Schema.optionalKey(McpServerOAuth),
});
export type McpServerSpec = typeof McpServerSpec.Type;

/** The state the server's harness reports now, its tools counted, and why it failed; `state` absent where it could not be read. */
export const McpServerStatus = Schema.Struct({
  state: Schema.optionalKey(Schema.Literals(MCP_STATES)),
  tools: Schema.optionalKey(Schema.Number),
  error: Schema.optionalKey(Schema.String),
});
export type McpServerStatus = typeof McpServerStatus.Type;

/** An MCP server, as an object: a builtin one carries its spec alone. */
export const McpServer = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('McpServer'),
  metadata: ObjectMeta,
  spec: McpServerSpec,
  status: Schema.optionalKey(McpServerStatus),
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
  type: Schema.optionalKey(Schema.Literals(MCP_TRANSPORTS)),
  url: Schema.String,
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  oauth: Schema.optionalKey(McpServerOAuth),
});
export type McpServerWrite = typeof McpServerWrite.Type;

/** A sign-in started: the address the person opens to sign in, and when the sign-in stops waiting. */
export const SignInStarted = Schema.Struct({ authUrl: Schema.String, until: Schema.String });
export type SignInStarted = typeof SignInStarted.Type;

/** Where a server's sign-in stands: its word, when a waiting one stops waiting, and why a failed one failed. */
export const SignInState = Schema.Struct({
  state: Schema.Literals(SIGN_IN_STATES),
  until: Schema.optionalKey(Schema.String),
  why: Schema.optionalKey(Schema.String),
});
export type SignInState = typeof SignInState.Type;

/** A server signed out of: whether a sign-in was cleared. */
export const SignedOut = Schema.Struct({ signedOut: Schema.Boolean });
export type SignedOut = typeof SignedOut.Type;
