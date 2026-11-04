# tools/release — Nemia's releases, as a pull request a workflow keeps open

The repository's own tool, never shipped. `release.ts` imports nothing installed; it reaches git and GitHub through `git` and `gh`,
each call bounded at two minutes, in the repository at its working directory. Two workflows drive it: `.github/workflows/release.yml`
(push to main, and `gh workflow run release.yml`) and `.github/workflows/release-label.yml` (the `release-label` check). Its code and
`tools/guards/test/release*.test.ts` hold it.

```sh
node tools/release/release.ts check    # the release-label check
node tools/release/release.ts labels   # the five labels in the repository
node tools/release/release.ts tag      # the release of the version main names
node tools/release/release.ts pr       # the release pull request, as main is
```

Exit codes: 0 done (or nothing to do), 1 refused or failed, the line saying what to do next, 2 a verb it does not have.

## The labels

Every pull request into `main` carries exactly one (`LABELS`):

| label      | bump       |
| ---------- | ---------- |
| `breaking` | major      |
| `feature`  | minor      |
| `fix`      | patch      |
| `docs`     | patch      |
| `internal` | no release |

`check` refuses none or several, naming the five and the command that adds one:
`gh api -X POST repos/{owner}/{repo}/issues/<n>/labels -f 'labels[]=<label>'` (never `gh pr edit`). The workflow passes `PR_NUMBER`
through env, the event's pull request number or a dispatch's `pr` input, and `check` reads that pull request's labels as they are now
(`GET repos/{owner}/{repo}/pulls/<n>`), never the event's payload: a run that starts later reads the label added after the event. A
dispatched run passes `HEAD_SHA`, its commit, and `check` refuses a pull request whose head is another commit, naming
`gh workflow run release-label.yml --ref <its head branch> -f pr=<n>`: a dispatch elsewhere cannot put a green `release-label` on a
commit by borrowing a labelled pull request's number. `LABELS`, a JSON array of names, is the pure entry the
tests drive, read instead of the API where it is set. `labels` makes any of the five the repository lacks and puts back a colour or description that drifted.

## The versions

A release is a tag `v<x.y.z>` and nothing else: `^v(\d+)\.(\d+)\.(\d+)$` (`releaseTag`). `v1-final`, `legacy/v1-final` and the
operator's local `nemia-*` tags are never read. The bump of a release is the highest label among the pull requests merged since the
last release, those whose merge commit is in `<last tag>..origin/main` (`bump`); an unlabelled one counts for none and is listed apart
in the pull request's body. The next version (`nextVersion`) is the last bumped, never below `FIRST`, `1.0.0`: the last tag today is
`v0.3.0`, so the first release is `v1.0.0`. The version lives in the root `package.json` `version` and the lockfile's root (its
`version` and `packages[""].version`), written as npm writes them.

## The verbs that write

- **`pr`** finds the latest release merged into main, reads the merged pull requests a page of 100 at a time, and with something to
  release makes `release` main plus one commit `release: v<x.y.z>` writing the version, force-pushed (the workflow's own branch, and
  only where its parent is not main's head or its version differs). It opens or updates the pull request `release: v<x.y.z>`, labelled
  `internal`, whose body opens with what a person does — merge once its `ci` and `release-label` are green — and goes on with
  GitHub's generated notes (`releases/generate-notes`, grouped by `.github/release.yml`'s categories) since the last release. Then,
  for each of `DISPATCHED` (`ci.yml`, and `release-label.yml` given `-f pr=<n>`), it reads the head's dispatched runs
  (`actions/workflows/<file>/runs?head_sha=<head>&event=workflow_dispatch`) and runs `gh workflow run <file> --ref release` where
  none is pending or green: a missing, failed or cancelled one is dispatched again, so a rerun with nothing changed dispatches
  nothing and `gh workflow run release.yml` retries a flake. A run the workflow's token dispatches starts with no approval, and main's
  protection matches its required checks by name on the head commit, so these are what it counts. The `pull_request` runs the
  token's push creates wait for approval and are left alone. The label goes on before the dispatch, so the dispatched check reads
  it. A rebuild pushes a new head and dispatches both on it. With nothing to release it
  closes the open release pull request. GitHub refuses the workflow's token a pull request until the repository turns on **"Allow GitHub Actions to create and approve pull requests"**; `pr` then exits 1 naming it.
- **`tag`** runs where the root `package.json` on main names a version `V` with no tag `vV` on the origin: it finds the first-parent
  commit of main that set `V` (the release pull request's merge commit), and makes the GitHub release `vV` there with the notes
  generated since the previous release. Nothing is published to npm and no artifact is attached.

## The settings it needs

The owner's, named here and set by hand: "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General →
Workflow permissions), and `ci` and `release-label` among main's required checks (both are). The `pr` job is granted `actions: write`
for the dispatch.
