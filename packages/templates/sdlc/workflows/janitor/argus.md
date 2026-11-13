Read the factory's stats since the janitor's last run, against the same length of time before it, and propose what to correct.

**Run each read bare**: `nemia stats --json --workflow janitor`, `nemia stats --json --by agent --from <day> --to <day>`,
`nemia stats --json --by step --from <day> --to <day>`, `nemia inbox`.

Then groom the inbox: read each card in play against the repository, its text in the inbox folder your brief names with Read, Grep and
Glob, and what moved on the base since the period's first day with `git log --since=<day> --name-only <base>`, one call each.
