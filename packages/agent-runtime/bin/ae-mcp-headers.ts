#!/usr/bin/env node
/**
 * The header of a remote MCP server signed in to by a code, as Claude Code asks for it: its `headersHelper`, run at each connection
 * and reconnection of a session and again when a call is refused with 401 or 403, which then retries the call once (`docs/harness.md`,
 * *A sign-in by a code*). The one argument is the token's file (`tokenFileOf`); the one line printed is a JSON object, `{"Authorization":
 * "Bearer <token>"}` for the token held now, refreshed first where it is due (`heldToken`, under its lock), and `{}` where none is held,
 * so the server reads `needs-auth`. It always exits 0 and prints nothing else: Claude Code reads stdout alone, and gives up on the helper
 * after 10 seconds, which `HELPER_BOUNDS` keeps inside.
 */
import { heldToken } from '../src/harness/mcp-token.ts';

const file = process.argv[2];
const token = file === undefined ? undefined : await heldToken(file).catch(() => undefined);
process.stdout.write(`${JSON.stringify(token === undefined ? {} : { Authorization: `Bearer ${token}` })}\n`);
