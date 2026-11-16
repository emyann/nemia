"use client";

import {
  FileTrigger as AriaFileTrigger,
  type FileTriggerProps,
} from "react-aria-components";

/**
 * Opens the computer's file chooser from a pressable kit component: wrap a
 * `Button` or an `IconButton` in it. React Aria's `FileTrigger`, which draws
 * nothing: `onSelect` gives the files chosen (a `FileList`, or `null`),
 * `acceptedFileTypes` the types offered, `allowsMultiple` more than one,
 * `acceptDirectory` a folder, `defaultCamera` a phone's camera.
 *
 *   <FileTrigger acceptedFileTypes={["image/png"]} onSelect={add}>
 *     <Button variant="tonal" icon={UploadIcon}>Upload</Button>
 *   </FileTrigger>
 *
 * Material 3 does not describe this component. What is pressed is a
 * Material button (https://m3.material.io/components/buttons/specs): this
 * only gives it the chooser.
 */
export function FileTrigger(props: FileTriggerProps) {
  return <AriaFileTrigger {...props} />;
}

export type { FileTriggerProps };
