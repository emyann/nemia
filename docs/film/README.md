# The film

A one-minute, silent film of Nemia, made with [Hyperframes](https://hyperframes.heygen.com) (HeyGen's open-source HTML video framework,
Apache 2.0; a local render needs no account). The root README links its poster to `nemia.mp4`. It runs 65 s at 1920×1080, 30 fps.

The project holds no pictures of its own. `npm run stage` copies the board's approved pictures (`apps/web/test/approved/`) and the
board's fonts (`node_modules/@fontsource`) into `assets/`, which git ignores. The screens come from the board's tests, so every figure
on them is sample data, not a claim. Each such screen carries a "sample data" tag.

## Render it again

You need Node 22 or later, FFmpeg and FFprobe on `PATH`, a headless Chrome, and `npm ci` run at the repository's root (for the fonts).
Without sudo, a static FFmpeg build in a folder of your own works (for example `~/ffmpeg-static/`). If Hyperframes cannot download
its Chrome (it needs `unzip`), point it at one you have, such as Playwright's headless shell:
`HYPERFRAMES_BROWSER_PATH=<path to chrome-headless-shell>`. `npx --yes hyperframes@0.9.99 doctor` tells you what is missing.

```bash
cd docs/film
npm run render     # stages, then writes nemia.mp4
npm run poster     # writes poster.png from the title scene
```

`npm run lint` and `npm run check` run Hyperframes' own checks. `npm run preview` opens the project in the browser. The CLI is pinned
in `package.json` to the version that rendered the film.

## Storyboard

Every caption was written for the film, and each one matches a line of the root README.

| Scene | Seconds | On screen | Matches in the README |
| --- | --- | --- | --- |
| 01 title | 0–5 | "Nemia", "Recruit intelligence.", "Nemia runs teams of agents." | the heading and the opening paragraph |
| 02 install | 5–13 | the install line, typed; "Install it with one line."; "On macOS, Linux, and Windows in a WSL terminal." | *Install* |
| 03 welcome | 13–22 | the board's welcome; "Nemia opens on its welcome page."; "It guides you through four milestones: a harness, a first factory, a first volume, and a first card." | *Install* |
| 04 card | 22–30 | the card form; "A card describes what you want."; "You describe a piece of work on a card." | the opening paragraph, *Cards and landings* |
| 05 run | 30–40 | a run's ladder; "Start a card, and a run of agent steps begins."; "An agent does each step. A check decides whether the run continues." | *Workflows of agent steps*, *Checks* |
| 06 gate | 40–50 | a step waiting; "When a step has a gate, it waits for you."; "Nothing after it starts until you approve." | *Gates that wait on you* |
| 07 lands | 50–58 | the floor, then a landed run; "A run ends with a landing."; "The work is merged into your base branch once a check passes on the merged code." | the opening paragraph, *Cards and landings* |
| 08 end | 58–65 | the install line; "Works with Claude Code or Codex."; the repository's address | *Claude Code or Codex as the harness* |

`apps/docs/test/readme.test.ts` keeps `nemia.mp4` under 20 MiB and `poster.png` under 1 MiB. When a board picture or a README claim
changes, render the film again and commit the new MP4. Every version stays in git's history.
