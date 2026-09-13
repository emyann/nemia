# Response to review

## 1. `listTools` asks `tools/list` of a server that offers no tools — Fixed

You're right, and I reproduced it exactly. A server that declares only prompts or resources has no `tools/list`
handler, so it answers -32601. The page showed a working server in red, with advice that fixes nothing, and kept
that error for as long as the api ran.

What I changed (`apps/api/src/capabilities.ts`, `listTools`): after `connect`, a server whose
`getServerCapabilities()` has no `tools` is not asked, and lists `[]`. The page already words that as "It lists no
tools." A server that declares `tools` and still answers -32601 is still an error, because that one really is broken.

The test: the fixture server gained `HKB_TEST_MODE=prompts`, which registers only a prompt. The new test, "a server
that offers no tools lists none, and is not asked tools/list, which it has no answer to", expects `tools: []` and no
error. I took the guard out and ran the test again. It failed with the message you quoted, "did not list its tools:
MCP error -32601: Method not found. Run it yourself to see why, or fix its entry in .mcp.json.", so this test can
refuse. It is not a test that only ever passes.

## 2. Entries are started without `${VAR}` expansion, in the SDK's six-variable environment — Fixed

You're right about the code and about what was asked. "Start it as `.mcp.json` says" means start it the way a session
reads that file. I checked the environment half against the Claude Code installed here (2.1.270) instead of relying
on memory. It builds a stdio server's transport with its own process environment, plus `CLAUDE_PROJECT_DIR`, with
the entry's `env` over both. It does not use the SDK's default six variables. It also rejects a server config that
names an unset variable ("Missing environment variables"). So both halves of the finding hold.

What I changed:

- Before a server starts, `${VAR}` and `${VAR:-default}` are expanded in its `command`, each of its `args` and each
  `env` value, from the api's environment. The default is used when `VAR` is unset.
- The server inherits the api's environment, minus `PORT` and `HKB_REPO`. Those two are the api's own settings and
  mean nothing to a server, and an inherited `PORT` could make a server try to bind the api's port.
  `CLAUDE_PROJECT_DIR` is set to the repository, as a session sets it, and the entry's `env` goes over all of it. I did
  not set `CLAUDECODE` or `CLAUDE_CODE_SESSION_ID`: the api is not a session and should not tell a server it is one.
- An entry that names a variable which is unset and has no default is not started. Its entry gets an `error` naming
  each such variable and the fix: set it where the api runs, or give it a default. That matches a session, which
  refuses the same config. The test runs at shipped defaults (the api's real environment) and checks the server was
  never started.
- The page still shows `command` and `args` as written, and error messages quote them as written. Expanding them for
  display would put a token passed as `--token=${TOKEN}` on the page and in the api's JSON.
- A second test starts the fixture with its script path, an argument, a named variable and a defaulted variable, each
  written with `${…}`. The server reports back what it received: the expanded values, a variable it only inherited,
  `CLAUDE_PROJECT_DIR`, and no `PORT`. The same test checks that the api's response still shows the entry as written.

What I left out: expansion in `url` and `headers`. The api starts no http servers and shows `url` as written, so
nothing reads them expanded.

One consequence a person should know about: every server that `.claude/settings.json` enables now receives the api's
whole environment. A session gives it the same, so this is no wider than the trust already given by enabling it.
