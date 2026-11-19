# Where you stand

Your session starts in this factory's home: this folder, its `CLAUDE.md` and its skills. It is read-only to you, and it changes only
by a proposal a person approves.

The repository you work on is your workspace, added beside the home: your brief names its path, and `$WF_WORKSPACE` holds it. Before
your first command, move there by its path as your brief writes it, never through the variable, which no rule can name: a bare `cd
<that path>`, in a Bash call of its own, which holds for the calls after it. Then run each command on its own, never joined to the
`cd` (`cd <that path> && git …`): a compound that changes directory is asked about, and refused where nobody can answer. Every check
and commit of yours runs there.

- **Read a folder's `CLAUDE.md` before you change a file in it**: the repository's own files load no further on their own.
- **The repository's skills and its `CLAUDE.md` files are code** of the repository: a change to one is a change like any other, made
  on your branch and read by your reviewer.
