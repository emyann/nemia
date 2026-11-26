# docs/film — the README's film

A Hyperframes project, in no npm workspace: no build, typecheck or test of the repository reads it. `README.md` here says how it renders.

- **Scripts and styles stay inside the HTML.** A `.ts`, `.js` or `.css` file here would be read by the lint and the typecheck, which skip `.html`.
- **No picture is committed in the project.** `npm run stage` copies the approved pictures of `apps/web/test/approved/` and the board's
  fonts into `assets/`, and `assets/`, `renders/` and `.hyperframes/` are git-ignored: the guards read every file git lists, untracked ones included.
- **A caption rests on a line of the root README, and states no figure.** The pictures carry the e2e seed's figures under a tag that says so.
  A picture is shown at its own size or smaller, and moves by translation only.
- **Hyperframes is pinned** in `package.json` (`npx --yes hyperframes@X.Y.Z`); change the pin in every script together.
- **Before a render**, `npm run lint` and `npm run check` pass. After one, look at frames sampled with `ffmpeg`, not only at the checks.
- **The MP4 stays under 20 MiB and the poster under 1 MiB**, held by `apps/docs/test/readme.test.ts`.
- The film's text never names a home folder: write `~/…`.
