# The film

A one-minute, silent film of Nemia, made with [Hyperframes](https://hyperframes.heygen.com) (HeyGen's open-source HTML video framework,
Apache 2.0; a local render needs no account). The root README links its poster to `nemia.mp4`. It is 65 s at 1920×1080, 30 fps.

The project holds no picture of its own: `npm run stage` copies the board's approved pictures (`apps/web/test/approved/`) and the
board's fonts (`node_modules/@fontsource`) into `assets/`, which git ignores. The board is shown as its tests draw it, so its figures
are the e2e seed's, never a claim.

## Render it again

It needs Node 22 or later, FFmpeg and FFprobe on `PATH`, a headless Chrome, and `npm ci` done at the repository's root (for the fonts).
Without sudo, a static FFmpeg build in a folder of your own does (for instance `~/ffmpeg-static/`); where Hyperframes cannot download
its Chrome (it needs `unzip`), point it at one you have, for instance Playwright's headless shell:
`HYPERFRAMES_BROWSER_PATH=<path to chrome-headless-shell>`. `npx --yes hyperframes@0.9.99 doctor` says what is missing.

```bash
cd docs/film
npm run render     # stages, then writes nemia.mp4
npm run poster     # writes poster.png from the title scene
```

`npm run lint` and `npm run check` run Hyperframes' own checks; `npm run preview` opens the project in the browser. The CLI is pinned
in `package.json` to the version that rendered the film.

## Storyboard

Every caption below was written for the film, and each rests on a line of the root README.

| Scene | Seconds | On screen | Resting on the README |
| --- | --- | --- | --- |
| 01 title | 0–5 | "Nemia", "Recruit intelligence.", "Nemia runs teams of agents." | the heading and the opening paragraph |
| 02 install | 5–13 | the install line, typed; "One line installs it."; "On macOS, on Linux, and on Windows in a WSL terminal." | *Install* |
| 03 welcome | 13–22 | the board's welcome; "The board opens on its welcome page."; "It walks you through four milestones: a harness, a first factory, a first volume and a first card." | *Install* |
| 04 card | 22–30 | the card form; "A card says what is wanted."; "You give Nemia a piece of work, written as a card." | the opening paragraph, *Cards and landings* |
| 05 run | 30–40 | a run's ladder; "Starting a card makes a run of agent steps."; "Each step is done by an agent; its check, a command, decides whether the run goes on." | *Workflows of agent steps*, *Checks* |
| 06 gate | 40–50 | a step waiting; "Where a step has a gate, it waits on you."; "Nothing after it starts until you approve." | *Gates that wait on you* |
| 07 lands | 50–58 | the floor, then a landed run; "A run ends in a landing."; "The work, merged on your base branch, after a check has passed on the merged tree." | the opening paragraph, *Cards and landings* |
| 08 end | 58–65 | the install line; "Claude Code or Codex as the harness."; the repository's address | *Claude Code or Codex as the harness* |

The size of `nemia.mp4` (under 20 MiB) and of `poster.png` (under 1 MiB) is held by `apps/docs/test/readme.test.ts`. When a board
picture or a README claim changes, render again and commit the new MP4: each one stays in git's history.
