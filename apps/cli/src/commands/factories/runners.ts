/**
 * The runners of the group's commands (`objects`' `FACTORY_WORDS`), by name: each takes its words parsed against its spec, asks the api
 * through `asked`, prints what it answers, and answers its exit code. The table is total over the group's names, so one left out does not
 * compile: the listing (`listing.ts`), a factory's own writes (`writes.ts`), its parts in its namespace (`parts.ts`), what it gives its
 * runs (`settings.ts`), what it says in words (`words.ts`) and what a template makes of it (`templated.ts`).
 */
import type { FactoryCommand } from 'objects';
import type { Runner } from '../runner.ts';
import { factoryListed } from './listing.ts';
import { factoryServerAdd, factoryServerRm, factoryServers, factorySchedule, factoryUnschedule } from './parts.ts';
import {
  factoryCostLineRm,
  factoryCostLineSet,
  factorySettingRm,
  factorySettingSet,
  factoryVolumeAdd,
  factoryVolumeRm,
} from './settings.ts';
import { factoryAdopt, factoryApply, factoryDiff, factoryResolve, factoryUpgrade } from './templated.ts';
import { factoryInstruct, factoryInstruction, factoryRules } from './words.ts';
import { factoryAdd, factoryAttach, factoryDetach, factoryFire, factoryHire, factoryRevisions, factoryRm, factoryTrust } from './writes.ts';

/** Each of the group's commands' runner. */
export const FACTORY_RUNNERS: Readonly<Record<FactoryCommand, Runner>> = {
  factory: () => factoryListed('factory'),
  'factory ls': () => factoryListed('factory ls'),
  'factory add': factoryAdd,
  'factory apply': factoryApply,
  'factory adopt': factoryAdopt,
  'factory diff': factoryDiff,
  'factory upgrade': factoryUpgrade,
  'factory resolve': factoryResolve,
  'factory attach': factoryAttach,
  'factory detach': factoryDetach,
  'factory hire': factoryHire,
  'factory fire': factoryFire,
  'factory schedule': factorySchedule,
  'factory unschedule': factoryUnschedule,
  'factory servers': factoryServers,
  'factory server add': factoryServerAdd,
  'factory server rm': factoryServerRm,
  'factory volume add': factoryVolumeAdd,
  'factory volume rm': factoryVolumeRm,
  'factory setting set': factorySettingSet,
  'factory setting rm': factorySettingRm,
  'factory cost-line set': factoryCostLineSet,
  'factory cost-line rm': factoryCostLineRm,
  'factory rules': factoryRules,
  'factory instruction': factoryInstruction,
  'factory instruct': factoryInstruct,
  'factory revisions': factoryRevisions,
  'factory trust': factoryTrust,
  'factory rm': factoryRm,
};
