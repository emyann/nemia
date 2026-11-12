import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpCircle, CircleAlert, CircleCheck, ExternalLink, LoaderCircle, RotateCcw, Undo2, type LucideIcon } from 'lucide-react';
import type {
  Fix,
  FixStart,
  LatestRelease,
  PreviousRelease,
  Readiness,
  Release,
  Upgrade,
  UpgradePhase,
  UpgradesRead,
  VersionAnswer,
} from 'objects';
import { CutFrame, CutPress, type FrameHue } from '@/components/look';
import { FollowedFix } from '@/components/setup/FollowedFix';
import { ReadinessList } from '@/components/setup/ReadinessList';
import { Instant } from '@/components/time/Instant';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/ds/utils';
import { readinessQuery, startFix } from '@/lib/api/readiness';
import { startUpgrade, upgradesQuery } from '@/lib/api/upgrades';
import { versionQuery } from '@/lib/api/version';
import { versionWords } from '@/lib/footer';
import { container, ringed } from '@/lib/meaning';
import { atWork, offersReadOf, releaseWord, upgradeOffers, type UpgradeOffers } from '@/lib/upgrade';
import { useUpgradeFollow } from '@/lib/useUpgradeFollow';

/** Which of the two presses a confirm or a start is of: Upgrade to the newer release, or Back to the previous one. */
type Which = 'upgrade' | 'back';

/** How an upgrade's phase is drawn while it runs and once it ended: a word and a glyph, read without colour, its tag's hue and frame's. */
const PHASE: Record<UpgradePhase | 'restarting', { word: string; icon: LucideIcon; className: string; hue: FrameHue }> = {
  pending: { word: 'Waiting for a slot', icon: LoaderCircle, className: container.grey, hue: 'none' },
  running: { word: 'Upgrading', icon: LoaderCircle, className: ringed.alive, hue: 'alive' },
  restarting: { word: 'Restarting', icon: LoaderCircle, className: ringed.alive, hue: 'alive' },
  succeeded: { word: 'Upgraded', icon: CircleCheck, className: container.sage, hue: 'none' },
  failed: { word: 'Failed', icon: CircleAlert, className: ringed.failure, hue: 'failure' },
};

/** What an upgrade printed, in the mono face, scrolled within its box; `empty` where it printed nothing. */
function Output({ output, empty }: { output: string; empty: string }) {
  return (
    <pre
      data-upgrade-output
      aria-live="polite"
      className="max-h-80 overflow-auto bg-surface-container-lowest p-3 font-mono text-body-small break-words whitespace-pre-wrap text-on-surface"
    >
      {output === '' ? empty : output}
    </pre>
  );
}

/** An upgrade's phase in a word and a glyph, spinning while it is at work. */
function PhaseTag({ phase }: { phase: keyof typeof PHASE }) {
  const drawn = PHASE[phase];
  const Icon = drawn.icon;
  const going = phase === 'pending' || phase === 'running' || phase === 'restarting';
  return (
    <span
      data-upgrade-word
      className={cn('inline-flex items-center gap-1 rounded-shape-full px-2 py-0.5 text-label-medium', drawn.className)}
    >
      <Icon aria-hidden className={cn('size-3.5', going && 'motion-safe:animate-spin')} />
      {drawn.word}
    </span>
  );
}

/**
 * An upgrade as it runs: its phase — waiting for a slot on the server, upgrading, or restarting while the daemon that serves the board
 * restarts onto the new release (`reconnecting`) — the tag it goes to, and what it printed so far, which stays shown while the daemon
 * restarts. `unread` is an end the board could not read.
 */
export function UpgradeRun({
  tag,
  phase,
  output,
  reconnecting,
  unread,
}: {
  tag: string;
  phase: UpgradePhase;
  output: string;
  reconnecting: boolean;
  unread?: string;
}) {
  const shown = reconnecting ? 'restarting' : phase;
  return (
    <CutFrame hue={PHASE[shown].hue} size={12}>
      <section data-upgrade-run={shown} aria-label={`The upgrade to ${tag}`} className="flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <PhaseTag phase={shown} />
          <span className="font-mono text-body-medium break-all">{tag}</span>
        </header>
        <p data-upgrade-said className="text-body-medium break-words text-on-surface-variant">
          {reconnecting
            ? `The server is restarting onto ${tag}: this page reads it again once it answers.`
            : phase === 'pending'
              ? 'The upgrade is filed and waits for a slot under the server’s ceiling: it starts once a session ends.'
              : `The release is fetched and checked beside the one the server runs; then the daemon restarts onto ${tag}.`}
        </p>
        <Output output={output} empty="Nothing printed yet." />
        {unread !== undefined && (
          <p role="alert" className="text-body-small break-words text-failure">
            {unread}
          </p>
        )}
      </section>
    </CutFrame>
  );
}

/**
 * How the store's last upgrade ended, once the daemon is back: the release the server now runs, with a Reload press where this page
 * was loaded from another release (`reload`), its JavaScript being the old board's; or the refusal, its exit code and the tail of what it
 * printed, the server left on the release it ran.
 */
export function UpgradeOutcome({ upgrade, running, reload }: { upgrade: Upgrade; running: string; reload: boolean }) {
  const failed = upgrade.phase === 'failed';
  return (
    <CutFrame hue={PHASE[upgrade.phase].hue} size={12}>
      <section data-upgrade-outcome={upgrade.phase} aria-label={`The last upgrade, to ${upgrade.tag}`} className="flex flex-col gap-3 p-4">
        <header className="flex flex-wrap items-center gap-2">
          <PhaseTag phase={upgrade.phase} />
          <span className="font-mono text-body-medium break-all">{upgrade.tag}</span>
          <Instant at={upgrade.startedAt} about="Started" className="text-body-small text-on-surface-variant" />
          {upgrade.exitCode !== undefined && <span className="text-body-small text-on-surface-variant">exit {upgrade.exitCode}</span>}
        </header>
        {failed ? (
          <>
            <p data-upgrade-said className="text-body-medium break-words text-on-surface">
              The upgrade to {upgrade.tag} was refused, and nothing was switched: the server still runs {upgrade.from ?? running}. Its log
              says why; fix what it names at the server, then press Upgrade again.
            </p>
            <Output output={upgrade.output} empty="It printed nothing." />
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p data-upgrade-said className="text-body-medium break-words text-on-surface">
              The server now runs {running}.
              {reload ? ' This page is still the board of the release before: reload it to read the new one.' : ''}
            </p>
            {reload && (
              <Button variant="outline" data-upgrade-reload onPress={() => window.location.reload()}>
                <RotateCcw aria-hidden />
                Reload
              </Button>
            )}
          </div>
        )}
      </section>
    </CutFrame>
  );
}

/** The ask before a press is sent: what it does, the press that does it, and Cancel. */
function Confirm({ which, tag, onConfirm, onCancel }: { which: Which; tag: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div data-upgrade-confirm={which} role="group" aria-label="Confirm" className="flex flex-col gap-2 border-l-2 border-yours pl-3">
      <p className="text-body-medium break-words text-on-surface">
        {which === 'upgrade' ? `Upgrade the server to ${tag}?` : `Go back to ${tag}?`} The release is checked beside the one it runs, then
        the daemon restarts onto it: runs pick up where they were, and the board is away for a moment.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CutPress data-upgrade-confirm-press onPress={onConfirm}>
          {which === 'upgrade' ? `Upgrade to ${tag}` : `Go back to ${tag}`}
        </CutPress>
        <Button variant="ghost" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** What the section is handed: the server's release in a sentence, the newer release read, the previous one, and what is offered. */
export type ServerReleaseShown = {
  /** The release the server runs, as a sentence (`versionWords`' title). */
  running: string;
  /** The newer release the daemon's release check read, where it read one. */
  latest?: LatestRelease;
  /** The release going back goes to, and the floor's refusal of it; null where none older is installed or the read was not answered. */
  previous: PreviousRelease | null;
  offers: UpgradeOffers;
  /** The press whose start is being sent. */
  starting?: Which;
  /** A start the api refused, in its words. */
  refused?: string;
  /** Why the upgrades read could not be read, where it could not. */
  unread?: string;
};

/** The newer release the release check read: its version, its tag where it differs, and the link to its notes where it has one. */
function NewerLine({ latest }: { latest: LatestRelease }) {
  const tag = latest.tag !== undefined && latest.tag !== `v${latest.version}` ? ` (${latest.tag})` : '';
  return (
    <div data-server-newer={latest.version} className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ArrowUpCircle aria-hidden className="size-4 shrink-0 text-on-surface-variant" />
      <span className="text-body-medium text-on-surface">
        Nemia {latest.version}
        {tag} is out.
      </span>
      {latest.notes !== undefined && (
        <a
          data-server-notes
          href={latest.notes}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-body-medium text-primary underline underline-offset-2"
        >
          Release notes
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/**
 * The two presses: Upgrade to the newer release's tag, and Back to the previous release, or Back shown refused (its words said under).
 * Each asks once (`Confirm`) before `onStart` is told the tag; both are taken while a start is sent or a confirm is open.
 */
function Presses({ shown, onStart }: { shown: ServerReleaseShown; onStart: (which: Which, tag: string) => void }) {
  const [confirming, setConfirming] = useState<Which>();
  const { previous, offers } = shown;
  const tags: Record<Which, string | undefined> = {
    upgrade: offers.upgrade ? shown.latest?.tag : undefined,
    back: offers.back === 'offered' ? previous?.tag : undefined,
  };
  const confirmTag = confirming === undefined ? undefined : tags[confirming];
  const busy = shown.starting !== undefined || confirming !== undefined;
  return (
    <>
      {(tags.upgrade !== undefined || (offers.back !== 'none' && previous !== null)) && (
        <div className="flex flex-wrap items-center gap-2">
          {tags.upgrade !== undefined && (
            <CutPress data-upgrade-press isDisabled={busy} onPress={() => setConfirming('upgrade')}>
              {shown.starting === 'upgrade' ? 'Upgrading…' : `Upgrade to ${tags.upgrade}`}
            </CutPress>
          )}
          {offers.back !== 'none' && previous !== null && (
            <Button
              variant="outline"
              data-back-press={offers.back}
              isDisabled={offers.back === 'refused' || busy}
              onPress={() => setConfirming('back')}
            >
              <Undo2 aria-hidden />
              {shown.starting === 'back' ? 'Going back…' : `Back to ${previous.tag}`}
            </Button>
          )}
        </div>
      )}
      {confirming !== undefined && confirmTag !== undefined && (
        <Confirm
          which={confirming}
          tag={confirmTag}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            setConfirming(undefined);
            onStart(confirming, confirmTag);
          }}
        />
      )}
    </>
  );
}

/**
 * Settings' Server release section, as it is handed: the release the server runs; the newer release, where the release check read one,
 * with the link to its notes where the release publishes them, and Upgrade; Back to the previous release, or Back shown refused with the
 * api's words naming the oldest release the store allows (`Presses`). Under them, a start the api refused, why the upgrades read could not
 * be read, the upgrade at work (`run`) or the last one's outcome (`outcome`), and the pieces new runs wait on (`waitOn`).
 */
export function ServerReleaseView({
  shown,
  onStart,
  run,
  outcome,
  waitOn,
}: {
  shown: ServerReleaseShown;
  onStart: (which: Which, tag: string) => void;
  run?: ReactNode;
  outcome?: ReactNode;
  waitOn?: ReactNode;
}) {
  return (
    <section data-server-release aria-labelledby="server-release" className="flex flex-col gap-4">
      <h2 id="server-release" className="text-title-medium">
        Server release
      </h2>
      <p data-server-running className="text-body-medium break-words text-on-surface">
        {shown.running}.
      </p>
      {shown.latest?.newer && <NewerLine latest={shown.latest} />}
      <Presses shown={shown} onStart={onStart} />
      {shown.offers.back === 'refused' && shown.previous?.refused !== undefined && (
        <p data-back-refused className="text-body-small break-words text-on-surface-variant">
          Back is refused: {shown.previous.refused}
        </p>
      )}
      {shown.refused !== undefined && (
        <p role="alert" data-upgrade-refused className="text-body-small break-words text-failure">
          Not started. The api refused it: {shown.refused}
        </p>
      )}
      {shown.unread !== undefined && (
        <p role="status" data-upgrades-unread className="text-body-small break-words text-on-surface-variant">
          Whether an upgrade is at work could not be read, so none is offered here: {shown.unread}. Upgrade at the machine that serves this
          board, or reload the page once the api answers.
        </p>
      )}
      {run}
      {outcome}
      {waitOn}
    </section>
  );
}

/** The upgrade at work followed live (`useUpgradeFollow`), drawn as it runs (`UpgradeRun`). */
function FollowedUpgrade({ upgrade }: { upgrade: Upgrade }) {
  const followed = useUpgradeFollow(upgrade);
  return (
    <UpgradeRun
      tag={upgrade.tag}
      phase={followed.phase}
      output={followed.output}
      reconnecting={followed.reconnecting}
      {...(followed.unread === undefined ? {} : { unread: followed.unread })}
    />
  );
}

/** The pieces new runs wait on: missing, at the cost of a run (a piece that declares no cost, an older server's, counted as one). */
const waitedOn = (readiness: Readiness): Readiness => ({
  ready: false,
  pieces: readiness.pieces.filter((piece) => piece.state === 'missing' && (piece.cost ?? 'run') === 'run'),
});

/**
 * The pieces new runs wait on once an upgrade ended — what a new release may add — each with its fixes, a fix the server runs started
 * here and followed under them; nothing while none is missing.
 */
function WaitOn({ readiness }: { readiness: Readiness }) {
  const queryClient = useQueryClient();
  const [fixes, setFixes] = useState<Fix[]>([]);
  const start = useMutation({
    mutationFn: ({ start }: { start: FixStart; key: string }) => startFix(start),
    onSuccess: (fix) => setFixes((started) => [fix, ...started.filter((f) => f.id !== fix.id)]),
  });
  const waited = waitedOn(readiness);
  if (waited.pieces.length === 0 && fixes.length === 0) return null;
  const ended = () => void queryClient.invalidateQueries({ queryKey: readinessQuery.queryKey });
  return (
    <div data-upgrade-wait-on className="flex flex-col gap-3">
      <h3 className="text-title-small font-title-small">What new runs wait on</h3>
      {fixes.map((fix) => (
        <FollowedFix key={fix.id} fix={fix} onEnded={ended} />
      ))}
      {waited.pieces.length > 0 && (
        <ReadinessList
          readiness={waited}
          onStart={(fix, key) => start.mutate({ start: fix, key })}
          {...(start.isPending ? { starting: start.variables.key } : {})}
          {...(start.isError ? { refused: { key: start.variables.key, message: start.error.message } } : {})}
        />
      )}
    </div>
  );
}

/** The release this page's board was loaded with, read once for the page's life: a remount of the section keeps it. */
let loadedWith: string | undefined;

/** The release a version answer names, whole: its kind, tag, commit and folder. */
const releaseKey = (release: Release | undefined): string =>
  release === undefined ? '' : [release.kind, release.tag, release.commit, release.root].join('|');

/** The release this page was loaded with: `now`'s key the first time it is asked, the one kept every time after. */
function pageRelease(now: Release): string {
  if (loadedWith === undefined) loadedWith = releaseKey(now);
  return loadedWith;
}

/** An error's message, whatever was thrown. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What the section shows of the version and the upgrades read, a start being sent or refused, and an upgrades read that failed. */
function shownOf(
  version: VersionAnswer,
  upgrades: { data: UpgradesRead | undefined; error: unknown },
  start: { starting?: Which; refused?: string },
): ServerReleaseShown {
  const read = upgrades.data;
  return {
    running: versionWords(version).title,
    ...(version.latest === undefined ? {} : { latest: version.latest }),
    previous: read?.previous ?? null,
    offers: upgradeOffers(offersReadOf(version, read)),
    ...start,
    ...(read === undefined && upgrades.error != null ? { unread: messageOf(upgrades.error) } : {}),
  };
}

/**
 * Under the presses, of the store's last upgrade: while it is at work, it followed live; once it ended, its outcome — `reload` where
 * this page was loaded from another release than the one the server now runs — and the pieces new runs wait on, once read.
 */
function belowOf(last: Upgrade | null, version: VersionAnswer, reload: boolean, readiness: Readiness | undefined) {
  if (last === null) return {};
  if (atWork(last)) return { run: <FollowedUpgrade key={last.id} upgrade={last} /> };
  return {
    outcome: <UpgradeOutcome upgrade={last} running={releaseWord(version.release)} reload={reload} />,
    ...(readiness === undefined ? {} : { waitOn: <WaitOn readiness={readiness} /> }),
  };
}

/** The section while the server's release is not read yet, or could not be. */
function ReleaseUnread({ error }: { error: unknown }) {
  return (
    <section data-server-release aria-labelledby="server-release" className="flex flex-col gap-2">
      <h2 id="server-release" className="text-title-medium">
        Server release
      </h2>
      <p className="text-body-medium break-words text-muted-foreground">
        {error == null ? 'Reading the server’s release…' : `The server's release could not be read: ${messageOf(error)}`}
      </p>
    </section>
  );
}

/**
 * Settings' Server release section, off the version (`versionQuery`), the upgrades read (`upgradesQuery`) and the readiness: what it
 * offers is `upgradeOffers`', an upgrade started is put as the read's last at once and followed until it ends, and its end reads the
 * version, the readiness and the upgrades again — as does an upgrade the read shows ended, the stream or no stream having said so, so the
 * release the server now runs is read afresh. An upgrades read the api does not answer leaves the running release alone shown, and
 * says why no press is offered.
 */
export function ServerRelease() {
  const queryClient = useQueryClient();
  const version = useQuery(versionQuery);
  const upgrades = useQuery(upgradesQuery);
  const readiness = useQuery(readinessQuery);
  const [loaded] = useState(() => (version.data === undefined ? undefined : pageRelease(version.data.release)));
  const start = useMutation({
    mutationFn: ({ tag }: { which: Which; tag: string }) => startUpgrade(tag),
    onSuccess: (upgrade) =>
      queryClient.setQueryData(upgradesQuery.queryKey, (read) => ({ previous: read?.previous ?? null, last: upgrade })),
  });
  const last = upgrades.data?.last ?? null;
  const ended = last !== null && !atWork(last) ? last.id : undefined;
  useEffect(() => {
    if (ended === undefined) return;
    for (const queryKey of [versionQuery.queryKey, readinessQuery.queryKey]) void queryClient.invalidateQueries({ queryKey });
  }, [ended, queryClient]);
  if (version.data === undefined) return <ReleaseUnread error={version.error} />;
  const sent = {
    ...(start.isPending ? { starting: start.variables.which } : {}),
    ...(start.isError ? { refused: start.error.message } : {}),
  };
  const reload = loaded !== undefined && loaded !== releaseKey(version.data.release);
  return (
    <ServerReleaseView
      shown={shownOf(version.data, upgrades, sent)}
      onStart={(which, tag) => start.mutate({ which, tag })}
      {...belowOf(last, version.data, reload, readiness.data)}
    />
  );
}
