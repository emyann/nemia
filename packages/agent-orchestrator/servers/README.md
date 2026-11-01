# Nemia's builtin MCP servers

One `<name>.json` per server, each the facts a factory would record of it, so a person adds it to a factory of theirs without typing
an address or a client id. The package holds this folder and names it `BUILTIN_SERVERS` (`src/servers/servers.store.ts`), beside
`BUILTIN_SKILLS`, the package's `skills/` (`src/skills/read.store.ts`); the api offers what it holds on a factory's settings page.

**`github.json`** is the first: GitHub's hosted server, signed in to through Nemia's own GitHub App, Nemia Factory. Its toolsets header
names every toolset a factory's agents need before anyone signs in — `pull_requests`, and `actions`, without which a red `ci` cannot be
read down to its job log — since a changed header is a new sign-in for every factory. Which of its tools each agent may call is fenced
on the agent, in its own file.

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
not. A client **secret** is no part of a file here: the board's read answers every key of a file, and the harness reads a secret from
its own store alone. A builtin server's secret is built into Nemia, as `gh` publishes its own, in
`src/servers/clients.ts`, keyed by client id: a sign-in from the board to a server whose `oauth.clientId`
is one of those hands the runtime that secret, which stores it in Claude Code's store, and a person never types one.
