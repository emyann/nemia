# Nemia's builtin MCP servers

One `<name>.json` per server, each the facts a factory would record of it, so a person adds it to a factory of theirs without typing
an address or a client id. The package holds this folder and names it `BUILTIN_SERVERS` (`src/factory/servers/servers.store.ts`), beside
`BUILTIN_SKILLS`, the package's `skills/` (`src/skills/read.store.ts`), whose skills every step that names one finds last; the api
offers what this folder holds on a factory's settings page.

**`github.json`** is the first: GitHub's hosted server, signed in to through Nemia's own GitHub App, Nemia Factory. Its toolsets header
names every toolset a factory's agents need before anyone signs in — `pull_requests`, and `actions`, without which a red `ci` cannot be
read down to its job log — since a changed header is a new sign-in for every factory. Which of its tools each agent may call is fenced
on the agent, in its own file.

A file holds the server's wire facts and the facts of the OAuth client it signs in through, and never a secret (`callbackPort` too,
where the server signs in by the browser):

```json
{
  "type": "http",
  "url": "https://api.githubcopilot.com/mcp/",
  "headers": { "X-MCP-Toolsets": "actions,repos" },
  "oauth": { "clientId": "Iv23li…" }
}
```

The file's name is the server's name, by the same rule a `.mcp.json` keys one — letters, digits, `-` and `_` — since an agent's
`mcp:` line resolves a name against a factory's record and the checkout's file alike, and a session's tool names are built from it
(`mcp__<name>__<tool>`).

`type`, `url` and `headers` are the server's identity to the harness, which files a sign-in under
`name|sha256({type,url,headers})[:16]`: changing any of them asks for a new sign-in, and `oauth`, which sits outside that hash, does
not. A client **secret** is no part of a file here, and Nemia ships none: a server whose provider advertises the device grant signs in by a
code from the board (the client id alone), and Nemia holds the token it gets.
