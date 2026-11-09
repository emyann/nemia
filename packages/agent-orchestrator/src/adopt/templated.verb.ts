/**
 * The verbs of `nemia factory` that put a template onto a factory, in the order `nemia`'s help lists them: make one from it (`apply`),
 * take a hand-made one over by it (`adopt`), preview an upgrade or a takeover (`diff`), upgrade one, and resolve an upgrade's conflict.
 */
import type { Command } from '../command/entry.verb.ts';
import { FACTORY_APPLY } from '../factory/applied/applied.verb.ts';
import { FACTORY_PLAN, FACTORY_RESOLVE, FACTORY_UPGRADE } from '../factory/upgrade/upgrade.verb.ts';
import { FACTORY_ADOPT } from './adopt.verb.ts';

/** `nemia factory`'s template verbs, in help order. */
export const TEMPLATED_FACTORY_VERBS = [FACTORY_APPLY, FACTORY_ADOPT, FACTORY_PLAN, FACTORY_UPGRADE, FACTORY_RESOLVE] as readonly Command[];
