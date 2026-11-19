Read the factory's stats since the janitor's last run, against the same length of time before it, and propose what to correct.

**Run each read bare**: `nemia stats --json --workflow janitor`, `nemia stats --json --by agent --from <day> --to <day>`,
`nemia stats --json --by step --from <day> --to <day>`, `nemia inbox`.

Then groom the inbox: read each card in play against the repository, its text in the inbox folder your brief names with Read, Grep and
Glob, and what moved on the base since the period's first day with `git log --since=<day> --name-only <base>`, one call each.

**Label each card** so the run it starts can open its pull request. The factory's label rules, which its pull request is labelled by,
are these, each `<key>=<value>:<label>`, none where the line is empty:

```
${{ parameters.pullRequestLabels }}
```

Where there are none, give every card `labels: []`: the check files none. Otherwise give each card of this factory its labels as RULES.md says a card carries them, each
`<key>=<value>`, so that at least one rule reads them: `work=fix` for a `fence`, `body` or `skill` card, a refusal or a cost corrected,
`work=docs` for an `on-purpose` one, the reason written beside a refusal kept, and its `area=`; where the rules read other keys, a
value they take. The check refuses the whole closeout, filing nothing, where no rule reads a card's labels. A card for another
factory is filed with no labels, these rules not being its own: give it `labels: []`.
