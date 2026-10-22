# The MCP servers Nemia ships

One `<name>.json` per server, each the facts a factory would record of it, so a person adds it to a factory of theirs without typing
an address or a client id. The api reads this folder as `SHIPPED_SERVERS` (`apps/api/src/servers/servers.ts`), beside
`workflows/skills/`, and offers what it holds on a factory's settings page.

**There is none today.** The first is the GitHub server of this intent's second card, which brings the sign-in with it. This file is
the only thing in the folder, because git commits no empty directory — and the reader tolerates the folder's absence all the same, so
a checkout without it lists no shipped server rather than failing.

A file holds the server's wire facts and the facts of the OAuth client it signs in through, and never a secret:

```json
{
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "X-MCP-Toolsets": "actions,repos" },
  "oauth": { "clientId": "Iv23li…", "callbackPort": 8791 }
}
```

The file's name is the server's name, by the same rule a `.mcp.json` keys one — letters, digits, `-` and `_` — since an agent's
`mcp:` line resolves a name against a factory's record and the checkout's file alike, and a session's tool names are built from it
(`mcp__<name>__<tool>`).

`type`, `url` and `headers` are the server's identity to the harness, which files a sign-in under
`name|sha256({type,url,headers})[:16]`: changing any of them asks for a new sign-in, and `oauth`, which sits outside that hash, does
not. A client **secret** is no part of a file here: the harness reads one from its own store, and a shipped server's secret ships
with Nemia, as `gh` ships its own — a person never types one.
