- **A card says what it is in its first words.** Its title opens with its initiative's short name, or else its area, then what becomes
  true: `<area>: <what becomes true>`. About 60 characters: a run's id is the slug of the first 28 or so. The areas are
  ${{ parameters.areas }}.
- **Every card carries labels:** `area=<area>`, `work=feature|fix|cleanup|docs|measure`, and `initiative=<name>` when it belongs to one
  (`labels:` in its frontmatter, or `--label` at `nemia inbox add`). A card's run is created with them.
