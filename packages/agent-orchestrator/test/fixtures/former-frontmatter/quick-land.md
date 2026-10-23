---
after: review
place: git
workspace: main
agent: otto
check: { r=$(mktemp -d) && { git show "HEAD:workflows/build/landing.ts" > "$r/landing.ts" || { echo "wf check: this checkout's HEAD has no workflows/build/landing.ts, so the landing this step made cannot be proven; land on a base that has it" >&2; false; }; } && node "$r/landing.ts" receipt --run "$WF_RUN"; c=$?; rm -rf "$r"; [ "$c" -eq 0 ]; }
budget: 10
disallowedTools: Bash(*:4318*), Bash(*:4317*)
---
The body, byte for byte.
