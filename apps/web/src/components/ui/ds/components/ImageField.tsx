"use client";

import { useId, useState, type ReactNode } from "react";
import { DropZone, FileTrigger, Label } from "react-aria-components";

import { ImageIcon, UploadIcon, XIcon } from "../icons";
import { focusRing, tv } from "../utils";
import Button from "./Button";
import type { ImageRenderer } from "./Card";
import IconButton from "./IconButton";

/**
 * Image upload field. The value is the image as a data URL (or any URL for
 * an already-stored image) or `undefined` while empty. Empty, the field is a
 * drop zone with a tonal "Choose image" button (React Aria `DropZone` +
 * `FileTrigger`); with a value it shows the preview with a remove icon button
 * and a "Replace" button. Files over `maxSize` or outside `acceptedFileTypes`
 * are rejected with an inline error.
 *
 *   <ImageField label="Photo" value={photo} onChange={setPhoto} maxSize={2 * 1024 * 1024} />
 *
 * `renderImage` draws the preview (a plain `<img>` by default; pass
 * `nextImageRenderer` from `../adapters/next` for `next/image`).
 *
 * Spec: MD3 has no file or image control. The pattern composes spec'd parts:
 * a tonal button for the medium-emphasis "choose" action and a text button
 * for "replace" (https://m3.material.io/components/buttons/guidelines), an
 * icon button for "remove"
 * (https://m3.material.io/components/icon-buttons/accessibility — labelled
 * "Remove image"), and the preview in an outlined-card surface
 * (https://m3.material.io/components/cards/specs: 12dp corners,
 * outline-variant border). The drop zone borrows the card surface with a
 * dashed outline and the primary colour while a drag hovers; supporting text
 * and error placement follow the text-field rules (4dp below, error in the
 * error colour with `role="alert"`).
 */
const styles = tv({
  slots: {
    base: "group/if flex flex-col gap-2",
    label:
      "text-title-small text-on-surface group-data-disabled/if:text-on-surface/38",
    dropZone: [
      focusRing(),
      "flex flex-col items-center justify-center gap-3 rounded-shape-medium border-2 border-dashed border-outline-variant bg-surface-container-low p-6 text-center transition-colors duration-short-4",
      "data-drop-target:border-primary data-drop-target:bg-primary/8",
      "group-data-invalid/if:border-error",
      "group-data-disabled/if:pointer-events-none group-data-disabled/if:opacity-38",
    ],
    dropIcon: "text-on-surface-variant",
    dropText: "text-body-medium text-on-surface-variant",
    preview: [
      "relative overflow-hidden rounded-shape-medium border border-outline-variant bg-surface-container-low",
      "group-data-invalid/if:border-error",
      "group-data-disabled/if:opacity-38",
    ],
    image: "absolute inset-0 h-full w-full object-contain",
    remove: "absolute right-2 top-2",
    actions: "flex items-center gap-2",
    fileName: "min-w-0 flex-1 truncate text-body-small text-on-surface-variant",
    supporting:
      "px-4 text-body-small text-on-surface-variant group-data-invalid/if:text-error group-data-disabled/if:text-on-surface/38",
  },
  variants: {
    aspectRatio: {
      "16:9": { dropZone: "aspect-video", preview: "aspect-video" },
      "4:3": { dropZone: "aspect-[4/3]", preview: "aspect-[4/3]" },
      "1:1": { dropZone: "aspect-square", preview: "aspect-square" },
      auto: { dropZone: "min-h-40", preview: "min-h-40" },
    },
  },
  defaultVariants: { aspectRatio: "16:9" },
});

const DEFAULT_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type ImageFieldProps = {
  label?: string;
  /** Helper text under the field; replaced by the error when invalid. */
  supportingText?: ReactNode;
  errorMessage?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Data URL or URL of the image (controlled); `""` / `undefined` = empty. */
  value?: string | null;
  defaultValue?: string;
  /** The picked file as a data URL, or `undefined` when removed. */
  onChange?: (value: string | undefined, file: File | undefined) => void;
  /** MIME types the picker and the drop zone accept. */
  acceptedFileTypes?: string[];
  /** Largest accepted file, in bytes. */
  maxSize?: number;
  /** Shape of the drop zone and the preview. */
  aspectRatio?: "16:9" | "4:3" | "1:1" | "auto";
  previewAlt?: string;
  renderImage?: ImageRenderer;
  /** Copy. */
  dropText?: string;
  chooseLabel?: string;
  replaceLabel?: string;
  removeLabel?: string;
  className?: string;
  /** Called when a file is rejected (too large or wrong type). */
  onReject?: (reason: "size" | "type", file: File) => void;
};

export function ImageField(props: ImageFieldProps) {
  const {
    label,
    supportingText,
    errorMessage,
    isInvalid,
    isDisabled,
    isRequired,
    value: controlledValue,
    defaultValue,
    onChange,
    acceptedFileTypes = DEFAULT_TYPES,
    maxSize,
    aspectRatio = "16:9",
    previewAlt = "",
    renderImage = defaultImageRenderer,
    dropText = "Drag an image here, or",
    chooseLabel = "Choose image",
    replaceLabel = "Replace",
    removeLabel = "Remove image",
    className,
    onReject,
  } = props;

  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const value =
    controlledValue !== undefined ? (controlledValue ?? "") : uncontrolled;
  const [file, setFile] = useState<File>();
  const [rejection, setRejection] = useState<string>();
  const labelId = useId();
  const descriptionId = useId();

  const invalid = !!isInvalid || !!rejection;
  const message = rejection ?? (isInvalid ? errorMessage : undefined);
  const s = styles({ aspectRatio });

  const commit = (next: string | undefined, nextFile: File | undefined) => {
    setUncontrolled(next ?? "");
    setFile(nextFile);
    onChange?.(next, nextFile);
  };

  const accept = (candidate: File) => {
    const typeOk =
      acceptedFileTypes.length === 0 ||
      acceptedFileTypes.some((t) =>
        t.endsWith("/*")
          ? candidate.type.startsWith(t.slice(0, -1))
          : candidate.type === t,
      );
    if (!typeOk) {
      setRejection("This file type is not supported");
      onReject?.("type", candidate);
      return;
    }
    if (maxSize !== undefined && candidate.size > maxSize) {
      setRejection(`Image must be under ${formatBytes(maxSize)}`);
      onReject?.("size", candidate);
      return;
    }
    setRejection(undefined);
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") commit(reader.result, candidate);
    };
    reader.readAsDataURL(candidate);
  };

  const trigger = (children: ReactNode) => (
    <FileTrigger
      acceptedFileTypes={acceptedFileTypes}
      onSelect={(files) => {
        const picked = files?.[0];
        if (picked) accept(picked);
      }}
    >
      {children}
    </FileTrigger>
  );

  return (
    <div
      data-slot="image-field"
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={supportingText || message ? descriptionId : undefined}
      data-invalid={invalid || undefined}
      data-disabled={isDisabled || undefined}
      className={s.base({ className })}
    >
      {label && (
        <Label id={labelId} data-slot="label" className={s.label()}>
          {label}
          {isRequired && (
            <span aria-hidden="true" className="ml-0.5">
              *
            </span>
          )}
        </Label>
      )}
      {value ? (
        <>
          <div data-slot="preview" className={s.preview()}>
            {renderImage({
              src: value,
              alt: previewAlt,
              fill: true,
              className: s.image(),
            })}
            <IconButton
              variant="tonal"
              isContained
              icon={XIcon}
              aria-label={removeLabel}
              isDisabled={isDisabled}
              onPress={() => {
                setRejection(undefined);
                commit(undefined, undefined);
              }}
              className={s.remove()}
            />
          </div>
          <div data-slot="actions" className={s.actions()}>
            {trigger(
              <Button variant="text" icon={UploadIcon} isDisabled={isDisabled}>
                {replaceLabel}
              </Button>,
            )}
            {file && (
              <span data-slot="file-name" className={s.fileName()}>
                {file.name} · {formatBytes(file.size)}
              </span>
            )}
          </div>
        </>
      ) : (
        <DropZone
          data-slot="drop-zone"
          isDisabled={isDisabled}
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : chooseLabel}
          getDropOperation={(types) =>
            acceptedFileTypes.some((t) => types.has(t)) ? "copy" : "cancel"
          }
          onDrop={async (e) => {
            const item = e.items.find((i) => i.kind === "file");
            if (item?.kind === "file") accept(await item.getFile());
          }}
          className={s.dropZone()}
        >
          <ImageIcon size={40} className={s.dropIcon()} />
          <span data-slot="drop-text" className={s.dropText()}>
            {dropText}
          </span>
          {trigger(
            <Button variant="tonal" icon={UploadIcon} isDisabled={isDisabled}>
              {chooseLabel}
            </Button>,
          )}
        </DropZone>
      )}
      {(supportingText || message) && (
        <div
          id={descriptionId}
          data-slot="supporting-text"
          className={s.supporting()}
        >
          {message ? (
            <span role="alert">{message}</span>
          ) : (
            <span>{supportingText}</span>
          )}
        </div>
      )}
    </div>
  );
}

const defaultImageRenderer: ImageRenderer = ({ src, alt, className }) => (
  <img src={src} alt={alt} className={className} />
);

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default ImageField;
