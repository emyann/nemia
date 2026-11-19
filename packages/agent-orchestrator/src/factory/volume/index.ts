/**
 * The face of a factory's volumes' pure code: a volume as spelled and named (`volumeOf`, `volumesNamed`, `factoryVolumesNamed`), the
 * mounts a step is given (`volumeMounts`), why a volume is refused (`volumeRefusal`), and the parameters its first writable one sets
 * (`originParams`, `originHostOf`).
 */
export { factoryVolumesNamed, volumeMounts, volumeRefusal } from './volume.ts';
export { originHostOf, originParams } from './origin-params.ts';
