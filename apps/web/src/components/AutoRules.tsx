import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { autoQuery, confirmRule, dropRule, type AutoList, type AutoRule } from '../lib/api';
import { clockWord } from '../lib/quota';
import { useNow } from '../lib/useNow';
import { CustomInstructions, SESSION } from './CustomInstructions';

/** A write of a rule: `confirm` puts it in force as its `words` read, `drop` takes it out. */
type RuleAsk = { verb: 'confirm'; id: string; words: string } | { verb: 'drop'; id: string };

/** The id of the rule that ships, which a person puts back after a drop. */
const DEFAULT_ID = 'default';

/**
 * An agent's rules for Auto on Nemia's settings: the custom instruction they come from, written there, the rules in force with the
 * default marked and a Drop each, what the agent proposed with a Confirm each, sending the words read, and whether the instruction changed
 * since, and the words kept as guidance, which nothing enforces. A write sets what the part shows from the api's answer and reads the
 * rules again; a refusal is shown in its words.
 */
export function AutoRules({ agent }: { agent: string }) {
  const queryClient = useQueryClient();
  const query = autoQuery(agent);
  const { data, error } = useQuery(query);
  const write = useMutation({
    mutationFn: (rule: RuleAsk) => (rule.verb === 'confirm' ? confirmRule(agent, rule.id, rule.words) : dropRule(agent, rule.id)),
    onSuccess: (now) => {
      queryClient.setQueryData(query.queryKey, now);
      void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
    },
  });
  const ask = (rule: RuleAsk) => {
    write.reset();
    write.mutate(rule);
  };
  return (
    <div data-auto-rules className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-title-small">Her rules at Auto</h3>
      <p className="text-body-small text-muted-foreground">
        In a factory at Auto, an answer these rules allow in the run's state is given without asking you; anything else is asked, as at
        Semi-auto. She proposes rules from your custom instruction, and none is in force until you confirm it here.
      </p>
      <CustomInstructions name={agent} reach={SESSION} />
      {data ? (
        <AutoParts list={data} pending={write.isPending} onAsk={ask} />
      ) : (
        <p className="text-body-medium text-muted-foreground">
          {error instanceof Error ? `Could not read her rules: ${error.message}` : 'Reading her rules…'}
        </p>
      )}
      {write.error && (
        <div data-auto-refused className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-body-medium font-medium text-destructive">Not written:</p>
          <p className="font-mono text-body-small break-words whitespace-pre-wrap text-destructive">{write.error.message}</p>
        </div>
      )}
    </div>
  );
}

/** The parts of an agent's rules, read. */
function AutoParts({ list, pending, onAsk }: { list: AutoList; pending: boolean; onAsk: (rule: RuleAsk) => void }) {
  return (
    <>
      <InForce list={list} pending={pending} onAsk={onAsk} />
      <Proposed list={list} pending={pending} onAsk={onAsk} />
    </>
  );
}

/** A heading over what follows it. */
function Sub({ heading, children, ...data }: { heading: string; children: ReactNode } & Record<`data-${string}`, string | boolean>) {
  return (
    <div {...data} className="flex flex-col gap-1.5">
      <h4 className="text-label-medium text-muted-foreground">{heading}</h4>
      {children}
    </div>
  );
}

/** One rule in its words, with what is said and offered beside it. */
function Rule({ rule, children }: { rule: AutoRule; children?: ReactNode }) {
  return (
    <li data-auto-rule={rule.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
      <span data-auto-words className="min-w-0 flex-1 text-body-medium">
        {rule.words}
      </span>
      <span className="flex items-center gap-2">{children}</span>
    </li>
  );
}

/** The rules in force, the default marked; a Drop each, and the default offered back once dropped. */
function InForce({ list, pending, onAsk }: { list: AutoList; pending: boolean; onAsk: (rule: RuleAsk) => void }) {
  return (
    <Sub heading={list.isDefault ? 'In force: the default, since you confirmed none' : 'In force'} data-auto-in-force>
      {list.rules.length ? (
        <ul className="flex flex-col gap-1.5">
          {list.rules.map((rule) => (
            <Rule key={rule.id} rule={rule}>
              {rule.from === DEFAULT_ID && (
                <Badge variant="outline" data-auto-default>
                  Default
                </Badge>
              )}
              <Button variant="outline" size="sm" data-auto-drop isDisabled={pending} onPress={() => onAsk({ verb: 'drop', id: rule.id })}>
                Drop
              </Button>
            </Rule>
          ))}
        </ul>
      ) : (
        <p data-auto-none className="text-body-medium text-muted-foreground">
          None: at Auto, every answer is asked of you, as at Semi-auto.
        </p>
      )}
      {!list.rules.some((rule) => rule.id === DEFAULT_ID) && (
        <div>
          <Button
            variant="outline"
            size="sm"
            data-auto-default-back
            isDisabled={pending}
            onPress={() => onAsk({ verb: 'confirm', id: DEFAULT_ID, words: list.shipped.words })}
          >
            Put the default back
          </Button>
        </div>
      )}
    </Sub>
  );
}

/** What she proposed, a Confirm each but on one in force, whether your instruction changed since, and the words kept as guidance. */
function Proposed({ list, pending, onAsk }: { list: AutoList; pending: boolean; onAsk: (rule: RuleAsk) => void }) {
  const now = useNow(60_000);
  const proposed = list.proposed;
  if (proposed === null)
    return (
      <Sub heading="Proposed" data-auto-proposed={false}>
        <p className="text-body-medium text-muted-foreground">She has proposed none: ask her to, from your custom instruction.</p>
      </Sub>
    );
  return (
    <>
      <Sub heading={`Proposed at ${clockWord(new Date(proposed.at), new Date(now))}`} data-auto-proposed>
        {proposed.stale && (
          <p data-auto-stale className="text-body-small text-muted-foreground">
            Your custom instruction changed since she proposed these: ask her to propose again.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {proposed.rules.map((rule) => (
            <Rule key={rule.id} rule={rule}>
              {rule.confirmed ? (
                <Badge variant="secondary" data-auto-confirmed>
                  In force
                </Badge>
              ) : (
                <Button
                  size="sm"
                  data-auto-confirm
                  isDisabled={pending}
                  onPress={() => onAsk({ verb: 'confirm', id: rule.id, words: rule.words })}
                >
                  Confirm
                </Button>
              )}
            </Rule>
          ))}
        </ul>
      </Sub>
      {proposed.guidance.length > 0 && (
        <Sub heading="Kept as guidance" data-auto-guidance>
          <p className="text-body-small text-muted-foreground">
            Words of yours the machinery cannot hold as a rule: she reads them, and nothing enforces them.
          </p>
          <ul className="flex flex-col gap-1">
            {proposed.guidance.map((words) => (
              <li key={words} className="text-body-medium">
                {words}
              </li>
            ))}
          </ul>
        </Sub>
      )}
    </>
  );
}
