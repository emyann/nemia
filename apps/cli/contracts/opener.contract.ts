/**
 * How `nemia open` opens a first-visit link in this machine's browser (apps/cli, src/browser.ts, `openerOf`), as the installer's laptop
 * path does (tools/release/install.sh, `laptop`): on macOS with `open`; on Linux with `xdg-open`, where a display is set (`DISPLAY` or
 * `WAYLAND_DISPLAY`); and nowhere else, where the link is printed for the person to open. A program that was chosen and then fails —
 * missing, or exiting other than 0 — prints the link too: that is the runner's, not this choice's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What opens the link: `open` with the program named, or `print` with why none is tried — `no-display`, a Linux with no display set (a
 * shell over SSH, a container); `no-opener`, a system Nemia names no opener for.
 */
export type Opener =
  | { readonly kind: 'open'; readonly program: 'open' | 'xdg-open' }
  | { readonly kind: 'print'; readonly reason: 'no-display' | 'no-opener' };

const openerOfSpec = spec<(platform: string, display: boolean) => Opener>({
  ensures: {
    macOpensWithOpen: {
      description: 'On macOS the link is opened with open, whatever the display variables say',
      condition: ({ input: [platform], output }) => platform !== 'darwin' || (output.kind === 'open' && output.program === 'open'),
    },
    linuxWithADisplayOpensWithXdgOpen: {
      description: 'On Linux with a display set, the link is opened with xdg-open',
      condition: ({ input: [platform, display], output }) =>
        !(platform === 'linux' && display) || (output.kind === 'open' && output.program === 'xdg-open'),
    },
    linuxWithNoDisplayPrints: {
      description: 'On Linux with no display set, nothing is opened and the link is printed, saying there is no display',
      condition: ({ input: [platform, display], output }) =>
        !(platform === 'linux' && !display) || (output.kind === 'print' && output.reason === 'no-display'),
    },
    elsewherePrints: {
      description: 'On a system that is neither macOS nor Linux, nothing is opened and the link is printed',
      condition: ({ input: [platform], output }) =>
        platform === 'darwin' || platform === 'linux' || (output.kind === 'print' && output.reason === 'no-opener'),
    },
  },
});

/** `openerOf`'s type, which `src/browser.ts` takes: it then imports nothing of tsverify. */
export type OpenerOf = Implementation<typeof openerOfSpec>;
