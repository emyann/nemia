/**
 * The gallery of the board's own parts that no page mounts yet: each drawn in a section of its own, with fixed props, for the e2e to
 * press and to picture. Built by `buildParts` (`gallery.ts`) into a scratch folder, never by the board's own build, and no file of
 * `src` imports it. Its layout is inline styles: a class written here alone would enter the board's stylesheet.
 */
import { StrictMode, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createRootRoute, createRouter, RouterProvider, useRouter, useSearch } from '@tanstack/react-router';
import { RouterProvider as AriaRouterProvider } from 'react-aria-components';
import '../../../src/styles.css';
import { CutButton } from '../../../src/components/CutButton.tsx';
import { CopyId } from '../../../src/components/CopyId.tsx';
import { CutFrame } from '../../../src/components/CutFrame.tsx';
import { Pager } from '../../../src/components/Pager.tsx';
import { PageName, Plate } from '../../../src/components/Plate.tsx';
import { RunSteps } from '../../../src/components/RunSteps.tsx';
import { ScanLines } from '../../../src/components/ScanLines.tsx';
import { Sticker } from '../../../src/components/Sticker.tsx';
import { TextLink } from '../../../src/components/TextLink.tsx';
import { finishedSearch, pageAt } from '../../../src/lib/finished.ts';
import { endedWords, sinceCreated, waitSentence, type WaitingRow } from '../../../src/lib/runWords.ts';

const COLUMN: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
  padding: 32,
  minHeight: '100svh',
  boxSizing: 'border-box',
};
const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 };
const HEADING: CSSProperties = { margin: '0 0 10px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 };
const CARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 26px 24px' };
const FLUSH: CSSProperties = { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', minHeight: 64 };

/** A run at its gate, one whose steps are done on a check or their own word, a run at work, and one refused by its check: each a rail. */
const GATE = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'verified ✓' },
  { name: 'review', status: 'verified ✓' },
  { name: 'land', status: 'awaiting approval' },
];
const DONE = [
  { name: 'design', status: 'unverified' },
  { name: 'implement', status: 'verified ✓' },
  { name: 'review', status: 'unverified' },
  { name: 'land', status: 'awaiting approval' },
];
const AT_WORK = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'running (working)' },
  { name: 'review', status: 'waiting' },
  { name: 'land', status: 'waiting' },
];
const REFUSED = [
  { name: 'design', status: 'verified ✓' },
  { name: 'implement', status: 'failed ✗ check (exit 1)' },
  { name: 'review', status: 'waiting' },
];

/** One part's section, named for the e2e. */
function Part({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section data-part={name}>
      <h3 style={HEADING}>{name}</h3>
      {children}
    </section>
  );
}

/**
 * Every part, on the look's ground; the pager stands on the page the address names, of three. A link's press is the router's to
 * follow, as under the board's root.
 */
function Gallery() {
  const router = useRouter();
  const page = pageAt(finishedSearch(useSearch({ strict: false })));
  const row = { steps: GATE, cancelledAt: null, holding: null, waiting: null, waitingOnYou: ['land'] };
  return (
    <AriaRouterProvider navigate={(href) => void router.navigate({ href })}>
      <ScanLines>
        <Parts page={page} row={row} />
      </ScanLines>
    </AriaRouterProvider>
  );
}

/** The parts, each in its section. */
function Parts({ page, row }: { page: number; row: WaitingRow }) {
  return (
    <>
      <main style={COLUMN}>
        <Part name="plate">
          <div style={ROW}>
            <Plate count={2} title="Waiting on you" />
            <Plate count={6} title="Finished" hue="grey" />
            <Plate count={0} title="Waiting on you" quiet />
          </div>
        </Part>
        <Part name="cut-frame">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
            <CutFrame hue="yours">
              <div style={CARD}>
                <TextLink to="." search={{ read: 'review' }} data-card-link>
                  The Tool errors panels show Bash apart
                </TextLink>
                <span>{waitSentence(row)}</span>
                <RunSteps steps={GATE} cancelled={false} held={false} names />
                <span>{sinceCreated(27 * 60_000 + 40_000)}</span>
              </div>
            </CutFrame>
            <CutFrame hue="alive">
              <div style={CARD}>
                <span>A run at work</span>
                <RunSteps steps={AT_WORK} cancelled={false} held={false} names />
              </div>
            </CutFrame>
            <CutFrame size={24}>
              <div style={CARD}>
                <span>
                  {endedWords('undecided').word}: {endedWords('undecided').title}
                </span>
                <RunSteps steps={REFUSED} cancelled={false} held={false} />
              </div>
            </CutFrame>
          </div>
        </Part>
        <Part name="cut">
          <div style={ROW}>
            <div data-ground="plain" style={{ padding: 40, background: 'var(--background)' }}>
              <CutFrame hue="yours">
                <div style={{ width: 220, height: 96 }} />
              </CutFrame>
            </div>
            <div data-ground="other" style={{ padding: 40, background: 'var(--md-sys-color-inverse-surface)' }}>
              <CutFrame size={24}>
                <div style={{ width: 220, height: 96 }} />
              </CutFrame>
            </div>
          </div>
        </Part>
        <Part name="ring">
          <div style={{ width: 360 }}>
            <CutFrame hue="yours">
              <div style={FLUSH}>
                <TextLink to="." search={{ read: 'corner' }} data-ring-probe>
                  In the cut corner
                </TextLink>
              </div>
            </CutFrame>
          </div>
          <div style={{ display: 'inline-block', padding: 16, marginTop: 16, background: 'var(--card)' }}>
            <CutButton to="." search={{ read: 'button' }}>
              Open the run
            </CutButton>
          </div>
        </Part>
        <Part name="sticker">
          <div style={ROW}>
            <Sticker hue="alive" label="Clock">
              27m
            </Sticker>
            <Sticker hue="money" label="Cost">
              $4.25
            </Sticker>
            <Sticker hue="grey" label="Tokens">
              21.4M
            </Sticker>
          </div>
        </Part>
        <Part name="text-link">
          <div style={{ display: 'inline-block', padding: 16, background: 'var(--card)' }}>
            <TextLink to="." search={{ read: 'link' }} data-plain-link>
              Read the review
            </TextLink>
          </div>
        </Part>
        <Part name="pager">
          <Pager page={page} pages={3} total={25} size={9} />
        </Part>
        <Part name="page-name">
          <PageName>Runs</PageName>
        </Part>
        <Part name="rail">
          <div style={{ width: 420, padding: 16, background: 'var(--card)' }}>
            <RunSteps steps={DONE} cancelled={false} held={false} names />
          </div>
        </Part>
        <Part name="copy-id">
          <div style={{ display: 'inline-flex', gap: 24, padding: 16, background: 'var(--card)' }}>
            <CopyId id="the-tool-errors-panels-2e13" short />
            <CopyId id="lay-the-diamond-top-e2e4" />
          </div>
        </Part>
      </main>
    </>
  );
}

const router = createRouter({ routeTree: createRootRoute({ component: Gallery }) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
