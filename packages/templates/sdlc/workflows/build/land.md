Does this factory judge and land its work on GitHub? **${{ parameters.github }}**. Follow the part below headed with that answer,
and only it.

### true — on GitHub

Land this run's result: merge its own pull request on GitHub, with a merge commit whose message you write, and fast-forward the base
branch in this checkout. Both acts are the one frozen script this step's check also reads, so your fence can refuse every `gh` call and
every `git push`. Run it from the run's frozen carried files (`$WF_CARRIED_FILES`):

```
node "$WF_CARRIED_FILES/landing.ts" merge --run "<this run's id>" --subject "<the subject line>" --body-file "$WF_STEP_FILES/merge-message.md" --check "${{ parameters.ciCheck }}" --refresh "${{ parameters.landingRefresh }}" --derives "${{ parameters.landingDerives }}"
```

Write that body first, in a file of your files directory: what landed and why, read off `git log` and `git diff --stat` of the result
branch against the base. The script refuses anything but this run's own green pull request — not a draft, based on the base branch, its
head the commit the review read, mergeable, and `${{ parameters.ciCheck }}` green at that commit, with no result branch of the run left
out — then merges it with `--merge` and fast-forwards this checkout onto what it merged. It deletes no branch and stages no merge here.

Where the factory names a refresh (`${{ parameters.landingRefresh }}`, the command that derives `${{ parameters.landingDerives }}`;
empty, it names none) and the branch lacks the base, the script first brings the branch up to it: it merges the base into the branch
in the run's worktree, runs that command there, and pushes the result for `${{ parameters.ciCheck }}` to judge. It refuses where the
merge leaves anything unmerged, the command fails, or the result differs from git's plain merge outside those paths, and takes the
merge back. A merge that answers it refreshed and pushed the branch has merged nothing yet: sign off `done` all the same, with your
subject and body in `message`. This step's check merges that head once `${{ parameters.ciCheck }}` is green at it, with that subject
and body, and refuses where it is red, naming the `nemia retry` line that sends the work back.

Sign off `done` with that subject and body in `message`, the record of what landed. On a refusal, change nothing in this checkout: sign
off `blocked`, quoting it whole and naming the exact `nemia retry` line it printed. The run then executes this step's check, which is
the receipt that the merge happened — `${{ parameters.ciCheck }}` already judged the repository's suite on the head the review read.
Does the receipt then wait on `${{ parameters.ciCheck }}` at the merge commit on the base branch? **${{ parameters.landingWaitsOnCi }}**
(the factory's `landingWaitsOnCi`). Where it does, it waits up to 40 minutes, a red there re-run once first (its failed jobs, only a
run on its first attempt, so a retry never re-runs it twice), and a merge still red, the base turned red, fails this step
though the merge stands: nothing is taken back, and the refusal names the jobs that did not pass and what a person does. A base whose
tip holds the merge and is green there passes, as does one whose own run at the merge was cancelled (replaced by a newer push's) or
never reported, while a red there fails this step naming that commit.

### false — in this checkout

Land this run's result here, in the repository's own checkout: stage the merge, and the run checks it and commits it, as the `git`
skill says (*Stage a landing*). Nothing is pushed: this factory has no remote.

Check the checkout first: on the base branch, nothing uncommitted, no merge in progress (`git status`); where it is not so, change
nothing and sign off `blocked`, saying what you found. Then stage every result branch of the run in one `git merge --no-ff --no-commit`,
the command your brief names under *The run checks and lands your merge*. Where it conflicts, list the conflicting files (`git diff
--name-only --diff-filter=U`), `git merge --abort`, and sign off `blocked` with that list: the work goes back to be merged with its base
by whoever made it, and you resolve no conflict. Where it is clean, leave it staged; never commit it, continue it or abort it yourself.

Sign off `done` with `message`, the record of what landed and the merge commit's message: a subject line, a blank line, and what landed
and why, read off `git log` and `git diff --stat` of the result branch against the base. The run then executes this step's check, the
repository's local check (`${{ parameters.localCheck }}`) on the merged tree: on its exit 0 the run commits the merge with your
`message`, and otherwise it takes the merge back and nothing lands.
