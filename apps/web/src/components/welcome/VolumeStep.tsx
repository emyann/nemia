import { CutButton, PageName, RadioTile, RadioTileGroup, Reading, ReadingLines, TextLink } from '@/components/look';
import { Button } from '@/components/ui/ds';
import type { Factory } from '@/lib/api/factories';
import { MILESTONE_NAMES } from '@/lib/gettingStarted';
import { useVolumeStep, type Added, type Mode, type VolumeBody } from '@/lib/useVolumeStep';
import { modeOffered, type VolumeScreen } from '@/lib/volumeStep';
import { FactoryTrust } from '../factory/FactoryTrust';
import { AddressPick } from './AddressPick';
import { FolderPick, InitOffer } from './FolderPick';
import { NewRepository } from './NewRepository';
import { VolumeWays } from './VolumeWays';

/**
 * The welcome's volume step, "Where is the work?", at `/welcome/volume`, and the same body opened again from a factory's Settings at
 * `/factories/<factory>/volume` (`again`): three ways to give the factory its work (a folder of this machine, a repository by its
 * address, a new one) and a skip on every screen; a folder that is no repository offered `git init`; the volume added writable, then its
 * trust asked in the words the factory's Settings say it, "Not now" leaving the factory waiting. What it shows is `volumeStepOf`, over
 * the factory as the api reads it now and what this page wrote (`useVolumeStep`). At the welcome its factory is the store's (a choice
 * where it holds several); opened again, where the factory holds a trusted writable volume already, each way offers read-only first.
 */
export function VolumeStep({ factory: given, again = false }: { factory?: string; again?: boolean }) {
  const step = useVolumeStep(given, again);
  const choosing = given === undefined && step.names.length > 1 && step.body.added === undefined;
  return (
    <article
      data-volume-step={step.noFactory ? 'no-factory' : step.factory === undefined ? 'reading' : step.screen}
      className="flex flex-col gap-8"
    >
      <header className="flex flex-col gap-1">
        <PageName>Where is the work?</PageName>
        <p className="text-body-medium text-on-surface-variant">
          {step.name === undefined
            ? "A factory's runs work in a git repository: its volume."
            : `${step.name}'s runs work in a git repository: give it one as its volume.`}
        </p>
      </header>
      {step.noFactory ? (
        <p data-volume-no-factory className="m-0 text-body-medium text-on-surface-variant">
          The store holds no factory yet: make one first, then give it its work.
        </p>
      ) : step.factory === undefined ? (
        <Reading label="Reading the factory">
          <ReadingLines widths={['w-2/3', 'w-1/2', 'w-3/5']} className="gap-3" />
        </Reading>
      ) : (
        <>
          {choosing && <FactoryChoice names={step.names} name={step.factory.name} onPick={step.pick} />}
          <StepBody screen={step.screen} factory={step.factory} {...step.body} />
        </>
      )}
      <StepFoot screen={step.screen} again={again} given={given} noFactory={step.noFactory} next={step.next} />
    </article>
  );
}

/** The factories of the store to choose among, at the welcome, where it holds several. */
function FactoryChoice({ names, name, onPick }: { names: readonly string[]; name: string; onPick: (name: string) => void }) {
  return (
    <RadioTileGroup label="Which factory?" layout="column" value={name} onChange={(chosen) => onPick(String(chosen))}>
      {names.map((n) => (
        <RadioTile key={n} value={n} data-volume-factory={n} title={n} description="Give this factory its work." />
      ))}
    </RadioTileGroup>
  );
}

/** The step's foot: the skip (back to Settings when opened from there), a factory to make first, and Next once the work is in place. */
function StepFoot({
  screen,
  again,
  given,
  noFactory,
  next,
}: {
  screen: VolumeScreen;
  again: boolean;
  given: string | undefined;
  noFactory: boolean;
  next: ReturnType<typeof useVolumeStep>['next'];
}) {
  const toSettings = again && given !== undefined;
  const skip = screen !== 'done' ? 'Skip, set it later' : toSettings ? 'Back to its Settings' : 'Leave for the board';
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3">
      {toSettings ? (
        <TextLink to="/factories/$factory/settings" params={{ factory: given }} data-welcome-skip>
          {skip}
        </TextLink>
      ) : (
        <TextLink to="/" data-welcome-skip>
          {skip}
        </TextLink>
      )}
      {noFactory && <CutButton to="/welcome/factory">Make a factory</CutButton>}
      {screen === 'done' && !again && (
        <CutButton data-welcome-next to={next?.link ?? '/'}>
          {next === undefined ? 'On to the board' : `Next: ${MILESTONE_NAMES[next.name].toLowerCase()}`}
        </CutButton>
      )}
    </footer>
  );
}

/** What the step's body is told: the screen, the factory, and what `useVolumeStep` holds of the page's choices and writes. */
type BodyProps = { screen: VolumeScreen; factory: Factory } & VolumeBody;

/**
 * The step's body for its screen: the tiles and the chosen way's panel, the offer to make a repository, the trust, or the work in place.
 */
function StepBody(props: BodyProps) {
  const { screen, factory, way, folder, added, again, mode, onMode, onWay, add, init, made, trust, onAnother } = props;
  if (screen === 'done') return <WorkInPlace factory={factory} added={added} again={again} onAnother={onAnother} />;
  if (screen === 'trust' || screen === 'waiting') return <TrustAsk screen={screen} factory={factory} added={added} trust={trust} />;
  if ((screen === 'init' || screen === 'declined') && folder !== undefined)
    return <InitOffer path={folder.path} declined={screen === 'declined'} {...init} />;
  return (
    <>
      <VolumeWays value={way} onChange={onWay} />
      {modeOffered(again, screen) && <ModeChoice mode={mode} onMode={onMode} />}
      {screen === 'folder' && (
        <section data-volume-panel="folder">
          <FolderPick onUse={props.onFolder} pending={add.pending} refused={add.refused} />
        </section>
      )}
      {screen === 'address' && (
        <section data-volume-panel="address">
          <AddressPick factory={factory.name} onClone={add.onAdd} pending={add.pending} refused={add.refused} />
        </section>
      )}
      {screen === 'new' && (
        <section data-volume-panel="new">
          <NewRepository onMake={made.onMake} pending={made.pending} refused={made.refused} />
        </section>
      )}
    </>
  );
}

/** The mode a volume is given in, opened again from Settings where the factory holds its work: read-only first. */
function ModeChoice({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  return (
    <RadioTileGroup label="How is it given?" layout="column" value={mode} onChange={(chosen) => onMode(chosen === 'rw' ? 'rw' : 'ro')}>
      <RadioTile
        value="ro"
        data-volume-mode="ro"
        title="Read-only"
        description="Its steps read it; runs work in the factory's writable one."
      />
      <RadioTile
        value="rw"
        data-volume-mode="rw"
        title="Writable"
        description="A repository the factory works on, besides the one it has."
      />
    </RadioTileGroup>
  );
}

/** The work in place: the volume added here, or the factory's own, and, opened again from Settings, a press to add another. */
function WorkInPlace({
  factory,
  added,
  again,
  onAnother,
}: {
  factory: Factory;
  added: Added | undefined;
  again: boolean;
  onAnother: () => void;
}) {
  return (
    <section data-volume-done aria-label="The work in place" className="flex flex-col items-start gap-2">
      <p className="m-0 text-body-large text-on-surface">
        {added === undefined
          ? `${factory.name} has its work: a writable volume, trusted.`
          : `${added.path} is ${factory.name}'s ${added.readOnly ? 'read-only volume' : 'work, writable and trusted'}.`}
      </p>
      {again && (
        <Button variant="outlined" data-volume-another onPress={onAnother}>
          Add another
        </Button>
      )}
    </section>
  );
}

/**
 * The trust asked of the volume added here, in the words the factory's Settings say it (`FactoryTrust`), with Trust and Not now; after
 * Not now, the factory waiting on it, and Trust alone.
 */
function TrustAsk({
  screen,
  factory,
  added,
  trust,
}: {
  screen: 'trust' | 'waiting';
  factory: Factory;
  added: Added | undefined;
  trust: VolumeBody['trust'];
}) {
  const asked = { ...factory, untrusted: factory.untrusted.filter((u) => u.place === added?.path) };
  return (
    <section data-volume-trust={screen} aria-label="Trust the volume" className="flex flex-col gap-3">
      {screen === 'waiting' ? (
        <p data-volume-waiting className="m-0 text-body-medium text-on-surface-variant">
          {factory.name} waits on your trust: its runs do not start in {added?.path} until a harness trusts it. Trust it here, or later from
          its Settings ({factory.commands.trust}).
        </p>
      ) : (
        <p className="m-0 text-body-medium text-on-surface-variant">{added?.path} is added. Before a run works in it, trust it:</p>
      )}
      <FactoryTrust
        factory={asked}
        onTrust={trust.onTrust}
        trusting={trust.trusting}
        {...(screen === 'trust' ? { onLater: trust.onLater } : {})}
      />
      {trust.refused !== undefined && (
        <p role="alert" data-trust-refused className="m-0 text-body-small break-words text-failure">
          {trust.refused}
        </p>
      )}
    </section>
  );
}
