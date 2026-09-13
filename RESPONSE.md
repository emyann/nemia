# Response to the review

Four findings. Three are fixed, and each fix has a refusal test: I reverted each fix once, and its test
failed. The fourth splits: part won't-fix, part a decision for the person who asked. On finding 3 I did
not use the fix you suggested, because I measured it and it misses the case you describe.

## 1. `includeFiles` copies a path git does not ignore, and the hand-off commits it — **Fixed**

You're right, and it was a real hole: a token in an untracked notes file would have ridden the run's
branch into the merge.

`includeFiles` (`src/runner.ts`) now runs `git check-ignore -q -- <path>` in the main checkout before it
copies anything. A path git does not ignore is not copied. That covers an untracked file nobody ignored,
and also a tracked file, which the worktree already has. Such a path is refused, and named in the run's
log line:
`.worktreeinclude: refused "notes.txt" is not gitignored — the hand-off would commit it`.

A directory is checked as a whole. git cannot re-include a file under an ignored directory, so
everything copied out of one is ignored too. I checked `check-ignore` on an ignored directory, a file
inside it, a tracked file, an untracked file and a missing path.

Test: `test/store.test.ts` (the first `.worktreeinclude` test), at shipped defaults through `advance`.
The fixture lists an untracked, non-ignored `notes.txt` holding `TOKEN=main`. The test asserts three
things: the file is not in the worktree, the notes name it, and `git status --porcelain` in the worktree
is empty. That last one means the hand-off has nothing to commit. Reverting the check fails this test.

## 2. A leading `/` is refused as absolute, so a Claude Code file breaks `wf start` — **Fixed**

Agreed, and this fix departs from one word of the request, so I'm saying so. The request (relayed; see
4) said a path "outside the repository (`../x`, absolute)" is refused, and also that the file is read
"the way Claude Code's `--worktree` does". In the gitignore syntax Claude Code uses, a leading `/`
anchors the line at the repository root. `/.env.local` is inside the repository. Refusing it protected
nothing, and it made every isolated `wf start` exit 2 on a repository set up for Claude Code. I read
"absolute" as meaning "outside", which is what the refusal was for.

What changed in `worktreeInclude` (`src/deps.ts`):
- A leading `/` is stripped before the path is normalised.
- `/../z` is still refused as outside the repository.
- `C:\x` is still refused as absolute.
- `/` alone is the repository itself, and refused.

Tests:
- The parser test covers `/.env.local`, `/etc/hosts` (it becomes the repository's `etc/hosts`), `/../z` and `/`.
- The `wf start` refusal test asserts that `/.env.local` is not named among the refusals, and that a
  file written for Claude Code (`/.env.local`, `/config/local/`) starts a run.
- The first `.worktreeinclude` test lists `/.env.local`, and the file arrives.

Reverting to "is absolute" fails three tests.

Not changed: globs. The relayed request specified paths, not patterns, and a glob is still skipped and
named. What I did fix is the README, which claimed the file is "read the way Claude Code reads it". It
now says the file is taken as paths rather than Claude Code's patterns. `docs/features.md` lists
patterns as not done.

## 3. The lockfile is compared with main's `package-lock.json`, not the tree the links point at — **Fixed, but not with the hidden lockfile**

You're right about the gap: a lockfile ahead of main's install gets links, and the check fails on a
missing module. The suggested fix does not catch that case, though. I measured it with npm 11.19.0 (the
repository's pinned npm). `npm install --package-lock-only` rewrites `node_modules/.package-lock.json`
so that it lists the new packages, and installs nothing. After adding a workspace package `y` and a
tarball dependency `b`, both appeared in the hidden lockfile while `ls node_modules` showed only `x`. So
the lockfile-only case your finding describes leaves npm's record claiming exactly the packages that
are missing.

The run now reads the disk:
- **The check.** `lockfileParts` (`src/runner.ts`) takes each `node_modules/` path in the worktree's
  lockfile and looks at that path in the main checkout. For a link, it notes where the link leads; for a
  directory, the `version` in its `package.json`.
- **What counts as parting.** The pure `lockfileParting` (`src/deps.ts`) says the trees part when:
  - main lacks a package,
  - one side has a link and the other does not,
  - a link leads elsewhere,
  - the versions differ,
  - or a package sits nested in a workspace's own `node_modules`, which links to the root tree cannot
    give. That last case was also a gap in my first version.
- **Optional packages.** An optional package main does not have is not a difference. Real data: main's
  lockfile has 84 `node_modules/` entries that are not installed here, all optional platform builds.
- **The check on this repository.** `lockfileParts` on this repository's main checkout against its own
  disk returns `null`, in 24 ms. So this repository keeps the link path.
- **No `node_modules` in main.** There is no tree to part from, so the lockfile is compared byte for
  byte, as before.

Tests:
- A pure test of `lockfileParting`.
- In `test/deps.test.ts`, "a lockfile main has not installed yet…": the worktree's lockfile is main's,
  byte for byte, `y` is not on disk in main, and npm's record claims it. The test asserts that record
  claim too, so the trap stays visible. The result is `npm ci`, and `y` resolves.
- In `test/store.test.ts`, the same case at shipped defaults through `advance`, with the brief line and
  the log note.

Reverting to the byte comparison fails both. Swapping in npm's record, as you suggested, fails the same
two.

Left open, and listed in `docs/features.md`:
- A package main has and the branch dropped is not looked for. Finding it means walking main's whole tree.
- An optional package a branch adds, which this machine would take, is mistaken for a platform build.
- Versions are compared, not contents.

## 4. Scope — **Won't fix** for `run.ts`, `cli.ts` and `Advanced.notes`; **Needs a decision** for `.worktreeinclude`

**`src/run.ts`: won't fix.** As you say, the brief line the request asks for is composed there. It is one
optional sixth argument to `composeBrief`, and the api's call is unchanged.

**`src/cli.ts` and `Advanced.notes`: won't fix on their own.** Without `.worktreeinclude` they still earn
their place. A cut can now pause `wf up` for a minute of `npm ci`, and the operator should see why.
Nothing outside the package constructs an `Advanced`; `apps/api` never calls `advance`.

**`.worktreeinclude` in this merge: needs a decision.** The facts:
- **Where it came from.** It came as a cross-session message from another session on this machine
  (`hkb-v2-e4`). That session said it was passing on an addition from the person who asked. I treated it
  as a teammate's request, within this session's permissions.
- **Where it is recorded.** Not only in `docs/features.md`: it is also in the body of commit `f500b51`,
  in the implement step's closeout, and in my reply to that session.
- **What the reviewer could not see.** None of those is on the run's record. That is the gap in plan
  §4b, *steering by message leaves no trace*, and from where you sat you could not tell an authorised
  addition from a step overstepping.

The choice, and what each side costs:
- **Keep it.** Findings 1 and 2 were in this part, and both are fixed now with refusal tests. It lands
  with the `node_modules` work, which the person did ask for.
- **Split it out.** That means removing `worktreeInclude`, `readInclude`, `includeFiles`, the `wf start`
  refusal, their tests, and their paragraphs in the README and `features.md`: about 150 lines across six
  files. It is interleaved with the requested work in `runner.ts`, `deps.ts` and `store.test.ts`, so it
  would be a follow-up commit, not a clean cherry-pick. The crash-reuse guard and the `npm ci` notes stay
  either way.

My recommendation is to keep it if the person confirms the message was theirs, and to split it if not.
