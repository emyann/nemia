Land this run's result: merge its own pull request on GitHub, with a merge commit whose message you write, and fast-forward the base
branch in this checkout. Both acts are the one frozen script this step's check also reads, so your fence can refuse every `gh` call and
every `git push`. Run it from the run's frozen workflow files (`$WF_WORKFLOW_FILES`), copied out of `HEAD` only while that is unset:

```
if [ -n "${WF_WORKFLOW_FILES:-}" ]; then l="$WF_WORKFLOW_FILES/landing.ts"; else p=$(mktemp -d) && git show "HEAD:workflows/build/landing.ts" > "$p/landing.ts" && l="$p/landing.ts"; fi
node "$l" merge --run "<this run's id>" --subject "<the subject line>" --body-file "$WF_STEP_FILES/merge-message.md"
```

Write that body first, in a file of your files directory: what landed and why, read off `git log` and `git diff --stat` of the result
branch against the base. The script refuses anything but this run's own green pull request — not a draft, based on the base branch, its
head the commit the review read, mergeable, and `ci` green at that commit, with no result branch of the run left out — then merges it
with `--merge` and fast-forwards this checkout onto what it merged. It deletes no branch and stages no merge here.

Sign off `done` with that subject and body in `message`, the record of what landed. On a refusal, change nothing in this checkout: sign
off `blocked`, quoting it whole and naming the exact `nemia retry` line it printed. The run then executes this step's check, which is
the receipt that the merge happened — `ci` already judged the suite, the types, the lint, the e2e and the build on the head the review
read.
