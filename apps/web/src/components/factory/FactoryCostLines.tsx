/**
 * A factory's cost lines, on its settings page: each workflow it offers (`factory.workflows`, in its order) with the line it sets for it,
 * an amount field, Save and Clear. A run keeps the line its workflow had when it started, and a gate whose caps' bound passes it says so
 * (`GateBudgets`). Each write goes through the api (`setCostLine`, `clearCostLine`) and reads the factories again; a refusal is shown in
 * the api's words under its row. The default factory offers every workflow found and keeps no file, so it sets no line, and says so; a
 * factory that offers none gives the line that attaches one.
 */
import { Fragment, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { clearCostLine, factoriesQuery, setCostLine, type Factory } from '@/lib/api/factories';
import { budgetWord } from '@/lib/money';
import { CommandText } from './FactorySchedules';

/** What a person asks of one workflow's line: set to an amount, or taken off. */
type Change = { kind: 'save'; usd: number } | { kind: 'clear' };

/** What a change did, said once it is done, and what a refusal of it is headed with. */
const SAID: Record<Change['kind'], { done: string; refused: string }> = {
  save: { done: 'Saved: a run started from now on keeps this line.', refused: 'Not saved' },
  clear: { done: 'Cleared: a run started from now on has no line.', refused: 'Not cleared' },
};

/** The amount a field holds, or null where it holds no number of dollars above zero. */
const amountOf = (text: string): number | null => {
  const usd = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(usd) && usd > 0 ? usd : null;
};

/** The cost lines of `factory`, marked `data-cost-lines` with its name: a row per workflow it offers (`CostLineRow`). */
export function FactoryCostLines({ factory }: { factory: Pick<Factory, 'name' | 'default' | 'workflows' | 'costLines' | 'commands'> }) {
  return (
    <Card data-cost-lines={factory.name}>
      <CardHeader>
        <CardTitle>Cost lines</CardTitle>
        <CardDescription>
          What a run of each workflow should cost at most. A gate whose caps let a run go past its line says so, and no rule approves it for
          you. A run keeps the line its workflow had when it started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {factory.default || factory.workflows === null ? (
          <p data-no-cost-lines className="text-body-medium text-muted-foreground">
            The default factory offers every workflow found and keeps no file, so it sets no cost line: a factory a person makes does.
          </p>
        ) : factory.workflows.length === 0 ? (
          <Empty data-no-cost-lines className="border">
            <EmptyHeader>
              <EmptyTitle>No workflow</EmptyTitle>
              <EmptyDescription>This factory offers no workflow to set a line for. To attach one, type:</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-full">
              <CommandText text={factory.commands.attach} />
            </EmptyContent>
          </Empty>
        ) : (
          factory.workflows.map((workflow, i) => (
            <Fragment key={workflow}>
              {i > 0 && <Separator />}
              <CostLineRow factory={factory.name} workflow={workflow} usd={factory.costLines[workflow] ?? null} />
            </Fragment>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** One workflow's line: its name and line, the form that changes it, and what the last change did or why the api refused it. */
function CostLineRow({ factory, workflow, usd }: { factory: string; workflow: string; usd: number | null }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (asked: Change) => (asked.kind === 'save' ? setCostLine(factory, workflow, asked.usd) : clearCostLine(factory, workflow)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: factoriesQuery.queryKey, exact: true }),
  });
  const ask = (asked: Change) => {
    change.reset();
    change.mutate(asked);
  };
  const said = change.variables ? SAID[change.variables.kind] : null;
  return (
    <div data-cost-line={workflow} className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 font-mono text-body-medium [overflow-wrap:anywhere]">{workflow}</span>{' '}
        {usd === null ? (
          <span data-cost-line-said="none" className="text-body-medium text-muted-foreground">
            no cost line
          </span>
        ) : (
          <span data-cost-line-said={usd} className="font-mono text-body-medium text-money">
            {budgetWord(usd)}
          </span>
        )}
      </div>
      <CostLineForm key={usd ?? ''} workflow={workflow} usd={usd} pending={change.isPending} onChange={ask} />
      {change.isSuccess && said && (
        <p data-cost-line-done className="text-body-medium text-muted-foreground">
          {said.done}
        </p>
      )}
      {change.error && said && (
        <Alert variant="destructive" data-cost-line-refused>
          <AlertTitle>{said.refused}</AlertTitle>
          <AlertDescription className="break-words">{change.error.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** The amount field of a line: Save while it holds an amount above zero other than the line, and Clear while a line is set. */
function CostLineForm({
  workflow,
  usd,
  pending,
  onChange,
}: {
  workflow: string;
  usd: number | null;
  pending: boolean;
  onChange: (change: Change) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(usd === null ? '' : String(usd));
  const typed = amountOf(draft);
  const savable = typed !== null && typed !== usd;
  return (
    <form
      aria-label={`The cost line of ${workflow}`}
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (typed !== null && typed !== usd) onChange({ kind: 'save', usd: typed });
      }}
    >
      <label htmlFor={id} className="flex items-center gap-1">
        <span className="sr-only">{`The cost line of ${workflow}, in dollars`}</span>
        <span aria-hidden className="font-mono text-body-medium text-money">
          $
        </span>
        <Input
          id={id}
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          placeholder="80"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-28 font-mono"
        />
      </label>
      <Button type="submit" isDisabled={pending || !savable}>
        {pending ? 'Writing…' : 'Save'}
      </Button>
      {usd !== null && (
        <Button variant="outline" isDisabled={pending} onPress={() => onChange({ kind: 'clear' })}>
          Clear
        </Button>
      )}
    </form>
  );
}
