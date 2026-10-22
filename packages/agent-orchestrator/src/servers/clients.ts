/**
 * The client secrets of the OAuth apps Nemia ships, keyed by client id: a sign-in to a server whose `oauth.clientId` is one of them is
 * handed its secret, which the runtime stores in the harness's own store (`mcpSignIn`); a server of any other client is handed none.
 *
 * A secret in a public repository, on purpose, as gh ships its own (cli/cli `internal/authflow/flow.go`: "This value is safe to be
 * embedded in version control"). GitHub sends an app's code only to the callback the app registered, `http://localhost:8791/callback`,
 * so the secret alone yields no token: the person signing in is what does. It is kept here, never in `workflows/servers/*.json`,
 * whose every key the board's read answers (`shippedServers`), and it is exported by no public entry.
 */

/** Nemia Factory, the GitHub App a factory's `github` server signs in through (App ID 5415252, `workflows/servers/github.json`). */
const NEMIA_FACTORY = 'Iv23liQBfm9prqhvXkuY';

/** Each shipped app's client id, and its client secret. */
export const SHIPPED_CLIENT_SECRETS: Readonly<Record<string, string>> = {
  [NEMIA_FACTORY]: '0a47eb27047aa44fa4759bfdeece1bc9ee9c773c',
};

/** The secret of the shipped app `clientId` names, or `undefined` for a client Nemia does not ship. Pure. */
export const shippedSecretOf = (clientId: string | undefined): string | undefined =>
  clientId !== undefined && Object.hasOwn(SHIPPED_CLIENT_SECRETS, clientId) ? SHIPPED_CLIENT_SECRETS[clientId] : undefined;
