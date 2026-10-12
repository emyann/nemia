import { createCn } from 'cn/config';
import { twMergeConfig } from '../components/ui/ds/utils.ts';

/**
 * Joins class names and lets the later of two that set one thing win, knowing the kit's scales as the kit's own merge does: a type
 * role (`text-body-small`) is a size, never a colour, so it stays beside an ink and gives way to another role.
 */
export const cn = createCn(twMergeConfig);
