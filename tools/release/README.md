# tools/release — Nemia's releases, as a pull request a workflow keeps open

The repository's own tool, never shipped. `release.ts` imports nothing installed; it reaches git and GitHub through `git` and `gh`,
each call bounded at two minutes, in the repository at its working directory. Two workflows drive it: `.github/workflows/release.yml`
(push to main, and `gh workflow run release.yml`) and `.github/workflows/release-label.yml` (the `release-label` check). Its code and
`tools/guards/test/release*.test.ts` hold it. Beside it, `archive.ts` builds a release's archive for one platform and `install.sh`
installs one on a machine (*The assets*), held by `tools/guards/test/install.test.ts`.

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
`version` and `packages[""].version`), written as npm writes them. It is the version a person reads: `nemia version`'s first line,
`GET /api/version` and the board's bottom bar read the root `package.json` (`agent-orchestrator`'s `VERSION`), which the archive holds
at the same place as a checkout, and `tools/guards/test/release.test.ts` holds that read to the file the bump writes.

## The verbs that write

- **`pr`** finds the latest release merged into main, reads the merged pull requests a page of 100 at a time, and with something to
  release makes `release` main plus one commit `release: v<x.y.z>` writing the version, force-pushed (the workflow's own branch, and
  only where its parent is not main's head or its version differs). It opens or updates the pull request `release: v<x.y.z>`, labelled
  `internal`, whose body opens with what a person does — merge once its `ci` and `release-label` are green — and goes on with
  GitHub's generated notes (`releases/generate-notes`, grouped by `.github/release.yml`'s categories) since the last release. Then,
  for each of `DISPATCHED` (`ci.yml`, and `release-label.yml` given `-f pr=<n>`), it reads the head's dispatched runs
  (`actions/workflows/<file>/runs?head_sha=<head>&event=workflow_dispatch`) and runs `gh workflow run <file> --ref release` where
  none is pending or green: a missing, failed or cancelled one is dispatched again, so a rerun with nothing changed dispatches
  nothing and `gh workflow run release.yml` retries a flake. A run the workflow's token dispatches starts with no approval, but its check runs do
  not count on the pull request: a check suite a `workflow_dispatch` creates is linked to no pull request, so the pull request's
  rollup never reads them. So each dispatched run also posts its result as a commit status of the same name, `ci` and
  `release-label`, on the head (`POST repos/{owner}/{repo}/statuses/{sha}`, `pending` as its job starts and `success` or
  `failure` as it ends, by the one job granted `statuses: write`). A status belongs to the commit and needs no link to a pull
  request, and one posted with the run's token is set by GitHub Actions, the app main's protection pins, so these are what it
  counts. On a push or a pull request no status is posted: there the check run counts. The `pull_request` runs the
  token's push creates wait for approval and are left alone. The label goes on before the dispatch, so the dispatched check reads
  it. A rebuild pushes a new head and dispatches both on it. With nothing to release it
  closes the open release pull request. GitHub refuses the workflow's token a pull request until the repository turns on **"Allow GitHub Actions to create and approve pull requests"**; `pr` then exits 1 naming it.
- **`tag`** runs where the root `package.json` on main names a version `V` with no tag `vV` on the origin: it finds the first-parent
  commit of main that set `V` (the release pull request's merge commit), and makes the GitHub release `vV` there with the notes
  generated since the previous release. Nothing is published to npm; the assets are attached by the jobs after it (*The assets*).

## The assets

Each release carries what a machine installs from (`install.sh`) and what `nemia upgrade` fetches:

| asset                            | what it is                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `nemia-<tag>-linux-x64.tar.gz`   | the release folder for that platform, its entries at the archive's root                     |
| `nemia-<tag>-linux-arm64.tar.gz` | the same, for Linux on arm64                                                                |
| `nemia-<tag>-darwin-arm64.tar.gz`| the same, for macOS on Apple silicon                                                        |
| `SHA256SUMS`                     | one line per archive, `<sha256>  <asset>`, as `sha256sum` writes it                         |
| `install.sh`                     | the installer (`install.sh` beside this file), a POSIX sh script                            |
| `latest.json`                    | `{ "tag": "v<x.y.z>", "version": "<x.y.z>" }`, attached last: its presence says the release is whole |

GitHub serves the newest release's assets at `https://github.com/<owner>/<repo>/releases/latest/download/<asset>`, and any release's
at `.../releases/download/<tag>/<asset>`; that `releases` URL is the download base an archive's `release.json` names as its `source`.

**How one is built.** The `tag` job's step `due` reads the release of the version main names and says `due=true` where it has no
`latest.json`. Then the `archive` job runs on a runner of each platform (`ubuntu-24.04` x64, `ubuntu-24.04-arm`, `macos-15` arm64,
GitHub's standard runners) at the tag:

```sh
node tools/release/archive.ts --platform linux-x64 --tag v1.3.0 --source https://github.com/<owner>/<repo>/releases --out assets
```

It runs `npm ci` and the board's build in the checkout, copies the tracked tree (`git archive`) with the built `apps/web/dist`, installs
production dependencies alone in the copy (`npm ci --omit=dev`), fetches the Node pinned in
`node.json` and refuses it unless its sha256 is the one pinned there (copied from Node's own `SHASUMS256.txt` for that version), and
packs: the SDK's platform packages taken out of the tree (`node_modules/@anthropic-ai/claude-agent-sdk-<platform>-<arch>`, any
platform, wherever npm put one; the SDK itself stays), `node/`, `bin/nemia` (sh: it follows its own symlinks to the release folder and runs `node/bin/node apps/cli/bin/nemia.ts`),
`release.json` (`tag`, `commit`, `source`, `builtAt`, `from: "archive"`, `platform`), the tar.gz and its `SHA256SUMS` line. A machine
of another platform is refused: `npm ci` takes the binaries of the machine it runs on. Given `--tree <dir> --node <dir>`, it packs that
tree with that Node and builds nothing, which is how `tools/guards/test/install.test.ts` makes a release. The `upload` job merges the
three `SHA256SUMS`, writes `latest.json`, and attaches every asset with `gh release upload --clobber`, `latest.json` in a call of its
own after the rest; a run cut off before it leaves the release without `latest.json`, so the next run builds and attaches them again.
To move Node, set `version` in `node.json` and the three sums from `https://nodejs.org/dist/v<version>/SHASUMS256.txt`.

**What `install.sh` does.** It reads the platform from `uname`, refuses where `git`, `tar`, `curl` or `wget`, or `sha256sum` or `shasum`
is missing, and on Linux warns where `systemd --user` or cgroup v2 is (each a service's need, not the install's). It downloads the archive
and `SHA256SUMS` (the tag from `latest.json` unless `--version`, refused before anything is downloaded or deleted unless it is `v` and
three numbers, digits and dots alone, as `nemia upgrade` reads a published one, so no tag reaches above `releases/` and no pre-release
is taken), refuses an archive whose sum differs, unpacks it into
`$WF_ROOT/releases/<tag>` through a hidden folder renamed into place, points `releases/current` at it by a relative link renamed over
the old one, and links `~/.local/bin/nemia`. Then it asks, or with `--yes` reads its flags: starting at login (`nemia service install --size auto`, `--no-service` to skip,
`loginctl enable-linger` on Linux), and the address to bind (`--bind`, after which `nemia token add` prints the first person token).
`--client --server <url> [--context <name>] [--token-file <file>]` makes a client-only install (`nemia config set-context`, then
`use-context`) and no service. `--base <url>` takes another download base, a `file://` one read from disk. It never prints a token. It ends, on either side, on
`nemia doctor`, the read of what is in place and what is missing, whose exit fails no install.

**No harness comes with a release.** The archive holds no harness's binary (`npm ci --omit=optional` would have dropped every package's
optional dependencies, so the archive takes the SDK's platform package out by name instead), and the installer asks for no harness's
credential. A person activates the harness their sessions run on after the install, on the board's Setup page or by `nemia doctor fix
<harness>`, which installs it at the version the release pins under the tools folder; `nemia doctor` then names its sign-in, a command
the person types on the server. `nemia doctor fix <harness> --index 1` removes it again. An upgrade carries the harnesses activated
before it to the new release's pins (`nemia doctor carry`); it never runs the installer.

## The settings it needs

The owner's, named here and set by hand: "Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General →
Workflow permissions), and `ci` and `release-label` among main's required checks (both are). The `pr` job is granted `actions: write`
for the dispatch.
