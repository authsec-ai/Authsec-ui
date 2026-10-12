/**
 * A document, command list or snippet behind a disclosure: collapsed by
 * default (the recommendation leads, JSON follows on demand), readable once
 * opened, with a copy control that says only what happened. The text is
 * rendered as text and never interpreted.
 */

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/features/iga/shared/components/CopyButton";

import { saveTextFile } from "./saveFile";

export function CodeBlock({
  title,
  text,
  what,
  filename,
  open = false,
  note,
}: {
  /** The disclosure's summary line. */
  title: string;
  text: string;
  /** For the copy control: "boundary document", "AWS CLI commands". */
  what: string;
  /** Offers a download when set. */
  filename?: string;
  open?: boolean;
  /** One muted line above the text. */
  note?: string;
}) {
  return (
    <details className="rounded-md border border-(--color-border-subtle)" open={open}>
      <summary className="cursor-pointer select-none px-3 py-2 text-[13px] font-medium text-(--color-text)">{title}</summary>
      <div className="space-y-2 border-t border-(--color-border-subtle) px-3 py-2">
        {note ? <p className="text-xs text-(--color-text-muted)">{note}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton value={text} label={`Copy ${what}`} what={what} />
          {filename ? (
            <Button type="button" variant="outline" size="sm" onClick={() => saveTextFile(filename, text)}>
              <Download className="size-3.5" aria-hidden="true" />
              Download
            </Button>
          ) : null}
        </div>
        <pre
          tabIndex={0}
          aria-label={title}
          className="max-h-80 overflow-auto rounded-md bg-(--color-surface-subtle) p-3 font-mono text-xs leading-5 text-(--color-text)"
        >
          {text}
        </pre>
      </div>
    </details>
  );
}
