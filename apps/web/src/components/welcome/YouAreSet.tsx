import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CutButton, PageName } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { milestonesQuery } from '@/lib/api/readiness';
import { nextStepsOf } from '@/lib/firstCard';

/** The factory "You are set" speaks of: the first of the store's own with a writable volume, else the first of its own. */
const setFactoryOf = (factories: readonly Factory[]): Factory | undefined => {
  const own = factories.filter((f) => !f.default);
  return own.find((f) => f.volumes.some((v) => !v.readOnly)) ?? own[0];
};

/**
 * The welcome's last page, "You are set", at `/welcome/next`, once a run has landed (the store's `landed` milestone): three next steps
 * (`nextStepsOf`) — raise Nemia's level; connect the host the factory's template follows, shown only where its first writable volume was a
 * folder of this machine, with the line the api answers for it (`follow`); and Nemia from a terminal or a coding agent. Before a run has
 * landed, it says so and leads back to the first card. A way to the board on every screen.
 */
export function YouAreSet() {
  const { data: milestones } = useSuspenseQuery(milestonesQuery);
  const { data: factories } = useSuspenseQuery(factoriesQuery);
  const navigate = useNavigate();
  const landed = milestones.milestones.some((m) => m.name === 'landed' && m.state === 'done');
  const factory = setFactoryOf(factories);
  const first = factory?.volumes.find((v) => !v.readOnly);
  const follow = factory?.follow;
  const steps = nextStepsOf({ local: first !== undefined && first.origin === null, follows: follow !== undefined });
  return (
    <article data-you-are-set={landed ? 'set' : 'not-yet'} className="mx-auto flex max-w-3xl flex-col gap-8 px-3 py-6 @lg/page:px-6">
      <header className="flex flex-col gap-1">
        <PageName>{landed ? 'You are set' : 'Not landed yet'}</PageName>
        <p className="text-body-medium text-on-surface-variant">
          {landed
            ? 'A card said what you wanted, a workflow did it in steps, and a gate waited on you before it landed. Next:'
            : 'No change has landed in this store yet: start a first card, and come back once its run has landed.'}
        </p>
      </header>
      {landed ? (
        <ol className="m-0 flex list-none flex-col gap-6 p-0">
          {steps.map((step) => (
            <li key={step} data-next-step={step} className="flex flex-col items-start gap-2">
              {step === 'level' && (
                <>
                  <h2 className="m-0 text-title-medium text-on-surface">Let Nemia watch for you</h2>
                  <p className="m-0 text-body-medium text-on-surface-variant">
                    Raise her level, and she reads what your runs need and answers what she may, saying what she did.
                  </p>
                  <CutButton to="/settings">Her level, in Settings</CutButton>
                </>
              )}
              {step === 'github' && follow !== undefined && (
                <>
                  <h2 className="m-0 text-title-medium text-on-surface">Connect {follow.host}</h2>
                  <p className="m-0 text-body-medium text-on-surface-variant">
                    {factory?.name} lands in this folder today. To land through {follow.host} instead, preview the change, which prints the
                    line that files it:
                  </p>
                  <code data-follow-line className="block max-w-full text-body-small break-all">
                    {follow.line}
                  </code>
                </>
              )}
              {step === 'terminal' && (
                <>
                  <h2 className="m-0 text-title-medium text-on-surface">From your terminal or your coding agent</h2>
                  <p className="m-0 text-body-medium text-on-surface-variant">
                    Everything here has its command in a terminal on this machine, and a coding agent reaches Nemia through her MCP port:
                    Setup says how to pair one.
                  </p>
                  <CutButton to="/setup">Setup</CutButton>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <CutButton data-you-are-set-back to="/welcome/card">
          Back to your first card
        </CutButton>
      )}
      <footer className="flex flex-wrap items-center gap-3">
        <Button variant="text" size="small" data-welcome-skip onPress={() => void navigate({ to: '/' })}>
          On to the board
        </Button>
      </footer>
    </article>
  );
}
