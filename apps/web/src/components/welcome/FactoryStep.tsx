import { useState } from 'react';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Milestone } from 'objects';
import { CutButton, PageName } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { useHerSheet } from '@/components/frame/HerSheet';
import { factoryNamesQuery } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';
import { templatesQuery } from '@/lib/api/templates';
import { factoryStepOf, type FactoryMade, type FactoryWay } from '@/lib/factoryStep';
import { MILESTONE_LINKS, MILESTONE_NAMES } from '@/lib/gettingStarted';
import { FactoryGuide } from './FactoryGuide';
import { FactoryWays } from './FactoryWays';
import { ScratchForm } from './ScratchForm';
import { TemplateForm } from './TemplateForm';

/** How often the milestones are read while her chat may be filing the factory. */
const WATCH_EVERY_MS = 3_000;

/**
 * The welcome's factory step, at `/welcome/factory`: one question, how to make a first factory, three tiles (Talk to Nemia, From a
 * template, From scratch) and the chosen way's panel; once the store holds a factory, the factory made and Next to the next milestone,
 * and after an empty one made here, the short guide. What it shows is `factoryStepOf`, over the store's milestones as the api reads them
 * (read every few seconds while her chat is the way, so a factory she files moves the step on) and the write this page made. Its skip
 * leaves for the board on every screen.
 */
export function FactoryStep() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const her = useHerSheet();
  const [way, setWay] = useState<FactoryWay | undefined>(undefined);
  const [made, setMade] = useState<{ how: FactoryMade; name: string } | undefined>(undefined);
  const { data: templates } = useSuspenseQuery(templatesQuery);
  const milestones = useSuspenseQuery({
    ...milestonesQuery,
    refetchInterval: (query) =>
      way === 'nemia' && query.state.data?.milestones.find((m) => m.name === 'factory')?.state !== 'done' ? WATCH_EVERY_MS : 60_000,
  });
  const factory = milestones.data.milestones.find((m) => m.name === 'factory');
  const screen = factoryStepOf({ filed: factory?.state === 'done', way, made: made?.how });
  const next: Milestone | undefined = milestones.data.milestones.find(
    (m) => m.name !== 'harness' && m.name !== 'factory' && m.state !== 'done',
  )?.name;
  const nextLink = next === undefined ? undefined : MILESTONE_LINKS[next];
  const madeBy = (how: FactoryMade) => (name: string) => {
    setMade({ how, name });
    void queryClient.invalidateQueries({ queryKey: ['factories'] });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  };
  const done = screen === 'made' || screen === 'guide';
  return (
    <article data-factory-step={screen} className="mx-auto flex max-w-3xl flex-col gap-8 px-3 py-6 @lg/page:px-6">
      <header className="flex flex-col gap-1">
        <PageName>Your first factory</PageName>
        <p className="text-body-medium text-on-surface-variant">
          A factory is where your workflows run, with the agents it hires. It may start with no volume.
        </p>
      </header>
      {done ? (
        <FactoryMadeWords
          made={made?.name}
          volumeDone={milestones.data.milestones.some((m) => m.name === 'volume' && m.state === 'done')}
        />
      ) : (
        <>
          <FactoryWays value={way} onChange={setWay} />
          {screen === 'nemia' && (
            <section data-factory-panel="nemia" className="flex flex-col items-start gap-3">
              <p className="m-0 text-body-medium text-on-surface-variant">
                Her chat opens beside this page. This step moves on by itself once she has made the factory.
              </p>
              <Button variant="filled" data-factory-talk onPress={her.show}>
                Talk to Nemia
              </Button>
            </section>
          )}
          {screen === 'template' && (
            <section data-factory-panel="template">
              <TemplateForm templates={templates} onMade={madeBy('template')} />
            </section>
          )}
          {screen === 'scratch' && (
            <section data-factory-panel="scratch">
              <ScratchForm onMade={madeBy('scratch')} />
            </section>
          )}
        </>
      )}
      {screen === 'guide' && <FactoryGuide />}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="text" size="small" data-welcome-skip onPress={() => void navigate({ to: '/' })}>
          Skip for now
        </Button>
        {done && (
          <CutButton data-welcome-next to={nextLink ?? '/'}>
            {next === undefined ? 'On to the board' : `Next: ${MILESTONE_NAMES[next].toLowerCase()}`}
          </CutButton>
        )}
      </footer>
    </article>
  );
}

/**
 * What the made screen says: the factory this page made, else the factories the store holds, read as the screen comes (the default
 * factory left out), so one Nemia filed in her chat or one filed at a terminal is named; and, while the store's volume milestone is not
 * done, that it has no volume yet.
 */
function FactoryMadeWords({ made, volumeDone }: { made: string | undefined; volumeDone: boolean }) {
  const names = useQuery({ ...factoryNamesQuery, enabled: made === undefined });
  const held = names.data ?? [];
  return (
    <section data-factory-made aria-label="The factory made" className="flex flex-col gap-2">
      <p data-factory-named className="m-0 text-body-large text-on-surface">
        {made !== undefined
          ? `${made} is made.`
          : held.length === 0
            ? 'The store holds a factory.'
            : `${held.length === 1 ? 'Your factory' : 'Your factories'}: ${held.join(', ')}.`}
      </p>
      {!volumeDone && (
        <p data-factory-no-volume className="m-0 text-body-medium text-on-surface-variant">
          It has no volume yet: a volume is the folder its runs work in.
        </p>
      )}
    </section>
  );
}
